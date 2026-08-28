import {
  FRIEND_STATUS,
  countSolvedToday,
  localDayString,
  normalizeUsername,
  sanitizeFriendsList,
  startOfLocalDaySeconds,
} from "./shared/friends.mjs";

const API_URL = "https://leetcode.com/graphql";
const UPDATE_ALARM_NAME = "updateLeetCode";
const UPDATE_INTERVAL_MINUTES = 60;
const FETCH_CONCURRENCY = 4;
const FETCH_TIMEOUT_MS = 12000;
const RECENT_AC_LIMIT = 50;

let activeUpdatePromise = null;
let queuedUpdateOptions = null;
let queuedFullRefresh = false;
let activeIsFullRefresh = false;

const storageGet = (keys) =>
  new Promise((resolve) => chrome.storage.local.get(keys, resolve));
const storageSet = (obj) =>
  new Promise((resolve) => chrome.storage.local.set(obj, resolve));

function ensureAlarm() {
  chrome.alarms.create(UPDATE_ALARM_NAME, { periodInMinutes: UPDATE_INTERVAL_MINUTES });
}

function normalizeUsernamesList(usernames) {
  if (!Array.isArray(usernames)) {
    return null;
  }
  const unique = new Set();
  for (const item of usernames) {
    const normalized = normalizeUsername(item);
    if (normalized) {
      unique.add(normalized);
    }
  }
  return unique.size ? [...unique] : null;
}

function mergeUpdateOptions(existing, incoming) {
  if (!existing) {
    return incoming;
  }
  if (!incoming) {
    return existing;
  }

  const mergedUsernames = new Set([
    ...(existing.usernames || []),
    ...(incoming.usernames || []),
  ]);

  return {
    reason: incoming.reason || existing.reason || "queued",
    usernames: mergedUsernames.size ? [...mergedUsernames] : null,
  };
}

async function fetchSolved(username) {
  const query = `
    query getUserProfile($username: String!, $limit: Int!) {
      matchedUser(username: $username) {
        submitStatsGlobal {
          acSubmissionNum {
            difficulty
            count
          }
        }
        profile {
          userAvatar
        }
      }
      recentAcSubmissionList(username: $username, limit: $limit) {
        titleSlug
        timestamp
      }
    }`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const res = await fetch(API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Referer: "https://leetcode.com/",
        Accept: "application/json",
      },
      body: JSON.stringify({
        query,
        variables: { username, limit: RECENT_AC_LIMIT },
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      return {
        status: FRIEND_STATUS.ERROR,
        total: null,
        avatar: null,
        todaySolved: null,
        errorMessage: `HTTP ${res.status}`,
      };
    }

    const data = await res.json();
    if (Array.isArray(data?.errors) && data.errors.length) {
      return {
        status: FRIEND_STATUS.ERROR,
        total: null,
        avatar: null,
        todaySolved: null,
        errorMessage: "GraphQL error",
      };
    }

    const matchedUser = data?.data?.matchedUser;
    if (!matchedUser) {
      return {
        status: FRIEND_STATUS.NOT_FOUND,
        total: null,
        avatar: null,
        todaySolved: null,
        errorMessage: "User not found",
      };
    }

    const allEntry = matchedUser?.submitStatsGlobal?.acSubmissionNum?.find(
      (entry) => entry.difficulty === "All",
    );
    const total = typeof allEntry?.count === "number" ? allEntry.count : null;
    const avatar =
      typeof matchedUser?.profile?.userAvatar === "string" &&
      matchedUser.profile.userAvatar.trim()
        ? matchedUser.profile.userAvatar
        : null;

    return {
      status: FRIEND_STATUS.OK,
      total,
      avatar,
      todaySolved: countSolvedToday(
        data?.data?.recentAcSubmissionList,
        startOfLocalDaySeconds(),
      ),
      errorMessage: null,
    };
  } catch (error) {
    const isTimeout = error && error.name === "AbortError";
    return {
      status: FRIEND_STATUS.ERROR,
      total: null,
      avatar: null,
      todaySolved: null,
      errorMessage: isTimeout ? "Request timed out" : "Network error",
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

async function mapWithConcurrency(items, limit, mapper) {
  if (!items.length) {
    return [];
  }

  const results = new Array(items.length);
  let cursor = 0;

  async function worker() {
    while (true) {
      const index = cursor;
      cursor += 1;
      if (index >= items.length) {
        return;
      }
      results[index] = await mapper(items[index], index);
    }
  }

  const workerCount = Math.max(1, Math.min(limit, items.length));
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return results;
}

function applyFetchResult(friend, result, checkedAt) {
  const previousTotal =
    typeof friend.totalSolved === "number" ? friend.totalSolved : null;

  friend.status = result.status;
  friend.lastCheckedAt = checkedAt;
  friend.errorMessage = result.errorMessage || null;

  if (result.status === FRIEND_STATUS.OK) {
    friend.previousTotalSolved = previousTotal;
    friend.totalSolved =
      typeof result.total === "number" ? result.total : friend.totalSolved;
    friend.delta =
      typeof friend.totalSolved === "number" && typeof previousTotal === "number"
        ? friend.totalSolved - previousTotal
        : null;
    friend.avatar = result.avatar || friend.avatar || null;
    friend.lastSuccessAt = checkedAt;
    friend.errorMessage = null;

    friend.todaySolved =
      typeof result.todaySolved === "number" ? result.todaySolved : 0;
    friend.todayDate = localDayString();

    return;
  }

  if (result.status === FRIEND_STATUS.NOT_FOUND) {
    friend.previousTotalSolved = previousTotal;
    friend.totalSolved = null;
    friend.delta = null;
    friend.todaySolved = null;
    return;
  }

  friend.status = FRIEND_STATUS.ERROR;
  friend.delta = null;
}

function buildRefreshState({
  inProgress,
  reason,
  startedAt,
  completedAt = null,
  targetCount = 0,
  okCount = 0,
  errorCount = 0,
  notFoundCount = 0,
  message = null,
}) {
  return {
    inProgress,
    reason,
    startedAt,
    completedAt,
    targetCount,
    okCount,
    errorCount,
    notFoundCount,
    message,
    durationMs: completedAt && startedAt ? completedAt - startedAt : null,
  };
}

async function runUpdateInternal(options = {}) {
  const reason = options.reason || "manual";
  const requestedUsernames = normalizeUsernamesList(options.usernames);
  const targetSet = requestedUsernames ? new Set(requestedUsernames) : null;

  const { friends: rawFriends = [] } = await storageGet(["friends"]);
  const friends = sanitizeFriendsList(rawFriends);

  const targetFriends = targetSet
    ? friends.filter((friend) => targetSet.has(friend.username))
    : friends;

  const startedAt = Date.now();
  for (const friend of targetFriends) {
    friend.status = FRIEND_STATUS.LOADING;
    friend.errorMessage = null;
  }

  await storageSet({
    friends,
    refreshState: buildRefreshState({
      inProgress: true,
      reason,
      startedAt,
      targetCount: targetFriends.length,
      message: "Refreshing leaderboard...",
    }),
  });

  if (!targetFriends.length) {
    const completedAt = Date.now();
    const refreshState = buildRefreshState({
      inProgress: false,
      reason,
      startedAt,
      completedAt,
      targetCount: 0,
      message: "No friends to refresh",
    });
    await storageSet({ friends, refreshState });
    return { refreshState, updatedCount: 0 };
  }

  const statuses = await mapWithConcurrency(
    targetFriends,
    FETCH_CONCURRENCY,
    async (friend) => {
      const result = await fetchSolved(friend.username);
      applyFetchResult(friend, result, Date.now());
      return result.status;
    },
  );

  let okCount = 0;
  let errorCount = 0;
  let notFoundCount = 0;

  for (const status of statuses) {
    if (status === FRIEND_STATUS.OK) {
      okCount += 1;
    } else if (status === FRIEND_STATUS.NOT_FOUND) {
      notFoundCount += 1;
    } else {
      errorCount += 1;
    }
  }

  const completedAt = Date.now();
  const refreshState = buildRefreshState({
    inProgress: false,
    reason,
    startedAt,
    completedAt,
    targetCount: targetFriends.length,
    okCount,
    errorCount,
    notFoundCount,
    message:
      errorCount || notFoundCount
        ? "Refresh completed with warnings"
        : "Refresh completed",
  });

  await storageSet({
    friends,
    lastUpdated: completedAt,
    refreshState,
  });

  return {
    refreshState,
    updatedCount: targetFriends.length,
    okCount,
    errorCount,
    notFoundCount,
  };
}

async function updateFriends(options = {}) {
  if (activeUpdatePromise) {
    const requestedUsernames = normalizeUsernamesList(options.usernames);
    if (!requestedUsernames) {
      if (!activeIsFullRefresh) {
        queuedFullRefresh = true;
      }
      return activeUpdatePromise;
    }
    queuedUpdateOptions = mergeUpdateOptions(queuedUpdateOptions, {
      ...options,
      usernames: requestedUsernames,
    });
    return activeUpdatePromise;
  }

  activeUpdatePromise = (async () => {
    const initialUsernames = normalizeUsernamesList(options.usernames);
    activeIsFullRefresh = !initialUsernames;
    let result = await runUpdateInternal(options);
    while (queuedFullRefresh || queuedUpdateOptions) {
      if (queuedFullRefresh) {
        queuedFullRefresh = false;
        activeIsFullRefresh = true;
        result = await runUpdateInternal({ reason: "queued" });
        continue;
      }

      const nextOptions = queuedUpdateOptions;
      queuedUpdateOptions = null;
      activeIsFullRefresh = !normalizeUsernamesList(nextOptions?.usernames);
      result = await runUpdateInternal({
        ...nextOptions,
        reason: nextOptions?.reason || "queued",
      });
    }
    return result;
  })()
    .catch(async (error) => {
      const completedAt = Date.now();
      await storageSet({
        refreshState: buildRefreshState({
          inProgress: false,
          reason: options.reason || "manual",
          startedAt: completedAt,
          completedAt,
          message: "Refresh failed",
          errorCount: 1,
        }),
      });
      throw error;
    })
    .finally(() => {
      activeUpdatePromise = null;
      activeIsFullRefresh = false;
      queuedFullRefresh = false;
      queuedUpdateOptions = null;
    });

  return activeUpdatePromise;
}

ensureAlarm();

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name !== UPDATE_ALARM_NAME) {
    return;
  }
  updateFriends({ reason: "scheduled" }).catch((error) => {
    console.error("Scheduled refresh failed", error);
  });
});

chrome.runtime.onInstalled.addListener(() => {
  ensureAlarm();

  storageGet(["myUsername"])
    .then((result) => {
      const stored = normalizeUsername(result?.myUsername);
      if (!stored) {
        return storageSet({ ownerUsernameRequested: true });
      }
      return null;
    })
    .catch((error) => {
      console.error("Failed to initialize owner username prompt state", error);
    });

  updateFriends({ reason: "installed" }).catch((error) => {
    console.error("Install refresh failed", error);
  });
});

chrome.runtime.onStartup.addListener(() => {
  ensureAlarm();
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || typeof msg !== "object") {
    return false;
  }

  if (msg.type === "updateNow") {
    updateFriends({ reason: "manual" })
      .then((result) => sendResponse({ ok: true, result }))
      .catch((error) =>
        sendResponse({ ok: false, error: error?.message || "Update failed" }),
      );
    return true;
  }

  if (msg.type === "updateUsers") {
    updateFriends({ reason: "targeted", usernames: msg.usernames })
      .then((result) => sendResponse({ ok: true, result }))
      .catch((error) =>
        sendResponse({
          ok: false,
          error: error?.message || "Targeted update failed",
        }),
      );
    return true;
  }

  return false;
});
