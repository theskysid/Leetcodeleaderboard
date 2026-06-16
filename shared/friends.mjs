export const USERNAME_PATTERN = /^[a-z0-9_-]{1,30}$/;

export const FRIEND_STATUS = Object.freeze({
  IDLE: "idle",
  LOADING: "loading",
  OK: "ok",
  ERROR: "error",
  NOT_FOUND: "not_found",
});

export const SORT_OPTIONS = Object.freeze({
  SOLVED: "solved",
  DELTA: "delta",
  NAME: "name",
});

export const FILTER_OPTIONS = Object.freeze({
  ALL: "all",
  IMPROVED: "improved",
  ISSUES: "issues",
});

const VALID_STATUSES = new Set(Object.values(FRIEND_STATUS));

function asNumberOrNull(value) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }
  return value;
}

function asTimestampOrNull(value) {
  const num = asNumberOrNull(value);
  if (num === null || num <= 0) {
    return null;
  }
  return Math.floor(num);
}

function normalizeStatus(status) {
  if (typeof status !== "string") {
    return FRIEND_STATUS.IDLE;
  }
  return VALID_STATUSES.has(status) ? status : FRIEND_STATUS.IDLE;
}

export function normalizeUsername(input) {
  return String(input ?? "").trim().toLowerCase();
}

export function isValidUsername(input) {
  const normalized = normalizeUsername(input);
  return USERNAME_PATTERN.test(normalized);
}

export function getInitials(username) {
  const normalized = normalizeUsername(username).replace(/[^a-z0-9]/g, "");
  if (!normalized) {
    return "?";
  }
  return normalized.slice(0, 2).toUpperCase();
}

export function normalizeFriendRecord(rawFriend) {
  const source =
    typeof rawFriend === "string" ? { username: rawFriend } : rawFriend || {};
  const username = normalizeUsername(source.username);

  if (!isValidUsername(username)) {
    return null;
  }

  const totalSolved = asNumberOrNull(source.totalSolved);
  const previousTotalSolved = asNumberOrNull(source.previousTotalSolved);

  let delta = asNumberOrNull(source.delta);
  if (
    delta === null &&
    typeof totalSolved === "number" &&
    typeof previousTotalSolved === "number"
  ) {
    delta = totalSolved - previousTotalSolved;
  }

  return {
    username,
    totalSolved,
    previousTotalSolved,
    delta,
    dailyBaseline: asNumberOrNull(source.dailyBaseline),
    dailyBaselineDate: typeof source.dailyBaselineDate === "string" ? source.dailyBaselineDate : null,
    dailyDelta: asNumberOrNull(source.dailyDelta),
    avatar: typeof source.avatar === "string" && source.avatar.trim() ? source.avatar : null,
    status: normalizeStatus(source.status),
    errorMessage:
      typeof source.errorMessage === "string" && source.errorMessage.trim()
        ? source.errorMessage.trim().slice(0, 200)
        : null,
    lastCheckedAt: asTimestampOrNull(source.lastCheckedAt),
    lastSuccessAt: asTimestampOrNull(source.lastSuccessAt),
  };
}

export function createNewFriendRecord(username) {
  const normalized = normalizeUsername(username);
  if (!isValidUsername(normalized)) {
    return null;
  }
  return {
    username: normalized,
    totalSolved: null,
    previousTotalSolved: null,
    delta: null,
    dailyBaseline: null,
    dailyBaselineDate: null,
    dailyDelta: null,
    avatar: null,
    status: FRIEND_STATUS.IDLE,
    errorMessage: null,
    lastCheckedAt: null,
    lastSuccessAt: null,
  };
}

function chooseMoreCompleteRecord(existingRecord, incomingRecord) {
  const existingChecked = existingRecord.lastCheckedAt ?? 0;
  const incomingChecked = incomingRecord.lastCheckedAt ?? 0;
  if (incomingChecked !== existingChecked) {
    return incomingChecked > existingChecked ? incomingRecord : existingRecord;
  }

  const existingSolved = typeof existingRecord.totalSolved === "number";
  const incomingSolved = typeof incomingRecord.totalSolved === "number";
  if (incomingSolved !== existingSolved) {
    return incomingSolved ? incomingRecord : existingRecord;
  }

  const existingHasAvatar = Boolean(existingRecord.avatar);
  const incomingHasAvatar = Boolean(incomingRecord.avatar);
  if (incomingHasAvatar !== existingHasAvatar) {
    return incomingHasAvatar ? incomingRecord : existingRecord;
  }

  return existingRecord;
}

export function sanitizeFriendsList(rawFriends) {
  if (!Array.isArray(rawFriends)) {
    return [];
  }

  const byUsername = new Map();
  for (const rawFriend of rawFriends) {
    const friend = normalizeFriendRecord(rawFriend);
    if (!friend) {
      continue;
    }
    const existing = byUsername.get(friend.username);
    if (!existing) {
      byUsername.set(friend.username, friend);
      continue;
    }
    byUsername.set(
      friend.username,
      chooseMoreCompleteRecord(existing, friend),
    );
  }
  return [...byUsername.values()];
}

function compareBySolved(a, b) {
  const solvedA = typeof a.totalSolved === "number" ? a.totalSolved : -1;
  const solvedB = typeof b.totalSolved === "number" ? b.totalSolved : -1;
  if (solvedA !== solvedB) {
    return solvedB - solvedA;
  }
  const deltaA = typeof a.delta === "number" ? a.delta : -Infinity;
  const deltaB = typeof b.delta === "number" ? b.delta : -Infinity;
  if (deltaA !== deltaB) {
    return deltaB - deltaA;
  }
  return a.username.localeCompare(b.username);
}

function compareByDelta(a, b) {
  const deltaA = typeof a.delta === "number" ? a.delta : -Infinity;
  const deltaB = typeof b.delta === "number" ? b.delta : -Infinity;
  if (deltaA !== deltaB) {
    return deltaB - deltaA;
  }
  return compareBySolved(a, b);
}

function compareByName(a, b) {
  return a.username.localeCompare(b.username);
}

export function sortFriends(friends, sortBy = SORT_OPTIONS.SOLVED) {
  const copy = [...friends];
  if (sortBy === SORT_OPTIONS.NAME) {
    copy.sort(compareByName);
    return copy;
  }
  if (sortBy === SORT_OPTIONS.DELTA) {
    copy.sort(compareByDelta);
    return copy;
  }
  copy.sort(compareBySolved);
  return copy;
}

export function filterFriends(friends, filterBy = FILTER_OPTIONS.ALL) {
  if (filterBy === FILTER_OPTIONS.IMPROVED) {
    return friends.filter((friend) => typeof friend.delta === "number" && friend.delta > 0);
  }
  if (filterBy === FILTER_OPTIONS.ISSUES) {
    return friends.filter(
      (friend) =>
        friend.status === FRIEND_STATUS.ERROR ||
        friend.status === FRIEND_STATUS.NOT_FOUND,
    );
  }
  return friends;
}
