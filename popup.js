import {
  FRIEND_STATUS,
  createNewFriendRecord,
  getInitials,
  isValidUsername,
  normalizeUsername,
  sanitizeFriendsList,
} from "./shared/friends.mjs";

const DEFAULT_THEME = "dark";

const state = {
  friends: [],
  lastUpdated: null,
  refreshState: null,
  theme: DEFAULT_THEME,
  myUsername: null,
  ownerUsernameRequested: true,
};

const ui = {
  ownerPrompt: document.getElementById("ownerPrompt"),
  ownerForm: document.getElementById("ownerForm"),
  ownerInput: document.getElementById("ownerUsername"),
  welcomeText: document.getElementById("welcomeText"),
  addFriendForm: document.getElementById("addFriendForm"),
  usernameInput: document.getElementById("username"),
  refreshButton: document.getElementById("refresh"),
  themeToggle: document.getElementById("themeToggle"),
  friendsList: document.getElementById("friendsList"),
  emptyState: document.getElementById("emptyState"),
  message: document.getElementById("message"),
  lastUpdated: document.getElementById("lastUpdated"),
  refreshStatus: document.getElementById("refreshStatus"),
};

function storageGet(keys) {
  return new Promise((resolve) => chrome.storage.local.get(keys, resolve));
}

function storageSet(values) {
  return new Promise((resolve) => chrome.storage.local.set(values, resolve));
}

function sendMessage(message) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, (response) => {
      const runtimeError = chrome.runtime.lastError;
      if (runtimeError) {
        reject(new Error(runtimeError.message));
        return;
      }
      if (!response?.ok) {
        reject(new Error(response?.error || "Request failed"));
        return;
      }
      resolve(response);
    });
  });
}

function showMessage(text, tone = "info") {
  if (!text) {
    ui.message.textContent = "";
    ui.message.dataset.tone = "";
    ui.message.hidden = true;
    return;
  }
  ui.message.textContent = text;
  ui.message.dataset.tone = tone;
  ui.message.hidden = false;
}

function handleAsyncError(error, fallbackMessage) {
  const message = error?.message ? `${fallbackMessage}: ${error.message}` : fallbackMessage;
  showMessage(message, "error");
}

function applyTheme(theme) {
  const resolvedTheme = theme === "light" ? "light" : "dark";
  state.theme = resolvedTheme;
  document.documentElement.setAttribute("data-theme", resolvedTheme);

  ui.themeToggle.classList.toggle("is-light", resolvedTheme === "light");
  ui.themeToggle.classList.toggle("is-dark", resolvedTheme === "dark");

  const nextThemeLabel =
    resolvedTheme === "light" ? "Switch to dark mode" : "Switch to light mode";
  ui.themeToggle.setAttribute("aria-label", nextThemeLabel);
  ui.themeToggle.title = nextThemeLabel;
}

function parseStoredOwnerUsername(rawValue) {
  const normalized = normalizeUsername(rawValue);
  return isValidUsername(normalized) ? normalized : null;
}

function setOwnerPromptVisible(visible) {
  ui.ownerPrompt.hidden = !visible;
  if (!visible) {
    return;
  }
  ui.ownerInput.value = state.myUsername || "";
  requestAnimationFrame(() => ui.ownerInput.focus());
}

function updateOwnerUi() {
  if (state.myUsername) {
    ui.welcomeText.textContent = `Welcome, ${state.myUsername}`;
    ui.welcomeText.hidden = false;
  } else {
    ui.welcomeText.textContent = "";
    ui.welcomeText.hidden = true;
  }
  const shouldPrompt = !state.myUsername && state.ownerUsernameRequested;
  setOwnerPromptVisible(shouldPrompt);
}

function formatNumber(value) {
  return typeof value === "number" ? value.toLocaleString() : "N/A";
}

function asSolvedCount(friend) {
  return typeof friend.totalSolved === "number" ? friend.totalSolved : null;
}

function getProgressPercent(value, max) {
  if (typeof value !== "number" || max <= 0) {
    return 8;
  }
  const ratio = value / max;
  const clamped = Math.max(0.08, Math.min(1, ratio));
  return Math.round(clamped * 100);
}

function formatStatus(friend) {
  if (friend.status === FRIEND_STATUS.LOADING) {
    return "Refreshing...";
  }
  if (friend.status === FRIEND_STATUS.NOT_FOUND) {
    return "Username not found";
  }
  if (friend.status === FRIEND_STATUS.ERROR) {
    return friend.errorMessage || "Refresh failed";
  }
  if (friend.status === FRIEND_STATUS.OK) {
    return "Up to date";
  }
  return "Not refreshed yet";
}

function updateLastUpdatedLabel() {
  if (!state.lastUpdated) {
    ui.lastUpdated.textContent = "Last updated: never";
    return;
  }
  ui.lastUpdated.textContent = `Last updated: ${new Date(state.lastUpdated).toLocaleString()}`;
}

function updateRefreshStatusLabel() {
  const refreshState = state.refreshState;
  if (!refreshState) {
    ui.refreshStatus.textContent = "Status: idle";
    ui.refreshStatus.dataset.tone = "idle";
    ui.refreshButton.disabled = false;
    return;
  }

  if (refreshState.inProgress) {
    ui.refreshStatus.textContent = `Status: refreshing ${refreshState.targetCount || 0} friend(s)...`;
    ui.refreshStatus.dataset.tone = "loading";
    ui.refreshButton.disabled = true;
    return;
  }

  ui.refreshButton.disabled = false;
  const warnings = (refreshState.errorCount || 0) + (refreshState.notFoundCount || 0);
  if (warnings > 0) {
    ui.refreshStatus.textContent = `Status: ${refreshState.okCount || 0} ok, ${warnings} warning(s)`;
    ui.refreshStatus.dataset.tone = "warning";
    return;
  }
  ui.refreshStatus.textContent = "Status: refresh complete";
  ui.refreshStatus.dataset.tone = "ok";
}

function makeAvatarElement(friend) {
  const wrapper = document.createElement("div");
  wrapper.className = "avatar-wrap";

  if (friend.avatar) {
    const avatar = document.createElement("img");
    avatar.className = "avatar";
    avatar.src = friend.avatar;
    avatar.alt = `${friend.username} avatar`;
    avatar.addEventListener("error", () => {
      wrapper.innerHTML = "";
      const fallback = document.createElement("span");
      fallback.className = "avatar avatar-fallback";
      fallback.textContent = getInitials(friend.username);
      wrapper.appendChild(fallback);
    });
    wrapper.appendChild(avatar);
    return wrapper;
  }

  const fallback = document.createElement("span");
  fallback.className = "avatar avatar-fallback";
  fallback.textContent = getInitials(friend.username);
  wrapper.appendChild(fallback);
  return wrapper;
}

function openProfile(username) {
  const profileUrl = `https://leetcode.com/${username}/`;
  if (chrome?.tabs?.create) {
    chrome.tabs.create({ url: profileUrl });
    return;
  }
  window.open(profileUrl, "_blank");
}

function sortBySolvedThenName(friends) {
  return [...friends].sort((a, b) => {
    const solvedA = typeof a.totalSolved === "number" ? a.totalSolved : -1;
    const solvedB = typeof b.totalSolved === "number" ? b.totalSolved : -1;
    if (solvedA !== solvedB) {
      return solvedB - solvedA;
    }
    return a.username.localeCompare(b.username);
  });
}

function renderFriends() {
  const sorted = sortBySolvedThenName(sanitizeFriendsList(state.friends));
  ui.friendsList.innerHTML = "";

  if (!sorted.length) {
    ui.emptyState.hidden = false;
    ui.emptyState.textContent = "No friends added yet.";
    return;
  }

  ui.emptyState.hidden = true;
  const solvedValues = sorted
    .map((friend) => asSolvedCount(friend))
    .filter((count) => typeof count === "number");
  const maxSolved = solvedValues.length ? Math.max(...solvedValues) : 0;

  sorted.forEach((friend, index) => {
    const item = document.createElement("li");
    item.className = "friend-item";
    const isMe = Boolean(state.myUsername && friend.username === state.myUsername);
    if (index === 0) {
      item.classList.add("champion");
    }
    if (isMe) {
      item.classList.add("is-me");
    }
    item.dataset.status = friend.status;
    item.tabIndex = 0;
    item.setAttribute("role", "link");
    item.setAttribute(
      "aria-label",
      isMe
        ? `Open your profile (${friend.username})`
        : `Open ${friend.username} profile`,
    );

    const rank = document.createElement("span");
    rank.className = "rank";
    rank.textContent = `#${index + 1}`;

    const details = document.createElement("div");
    details.className = "friend-details";

    const main = document.createElement("div");
    main.className = "friend-main";

    const name = document.createElement("span");
    name.className = "name";
    name.textContent = friend.username;

    const nameWrap = document.createElement("div");
    nameWrap.className = "name-wrap";
    nameWrap.appendChild(name);

    if (isMe) {
      const youTag = document.createElement("span");
      youTag.className = "you-tag";
      youTag.textContent = "YOU";
      nameWrap.appendChild(youTag);
    }

    const metricMeta = document.createElement("div");
    metricMeta.className = "metric-meta";

    const metricLabel = document.createElement("span");
    metricLabel.className = "metric-label";
    metricLabel.textContent = "PROBLEMS SOLVED";

    const metricValue = document.createElement("span");
    metricValue.className = "metric-value";
    metricValue.textContent = formatNumber(friend.totalSolved);

    metricMeta.appendChild(metricLabel);
    metricMeta.appendChild(metricValue);

    const header = document.createElement("div");
    header.className = "friend-head";
    header.appendChild(nameWrap);
    header.appendChild(metricMeta);

    const solvedCount = asSolvedCount(friend);
    const progressPercent = getProgressPercent(solvedCount, maxSolved);

    const track = document.createElement("div");
    track.className = "metric-track";

    const marker = document.createElement("span");
    marker.className = "metric-marker";
    marker.style.left = `calc(${progressPercent}% - 7px)`;
    track.appendChild(marker);

    main.appendChild(header);
    main.appendChild(track);

    if (friend.status !== FRIEND_STATUS.OK) {
      const status = document.createElement("span");
      status.className = "friend-status";
      status.textContent = formatStatus(friend);
      main.appendChild(status);
    }

    const removeButton = document.createElement("button");
    removeButton.type = "button";
    removeButton.className = "remove";
    removeButton.title = "Delete friend";
    removeButton.setAttribute("aria-label", `Delete ${friend.username}`);
    removeButton.innerHTML =
      '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false"><path d="M3 6h18" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><path d="M8 6V4h8v2" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/><path d="M5 6l1 14h12l1-14" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/><path d="M10 11v6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><path d="M14 11v6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>';
    removeButton.addEventListener("click", (event) => {
      event.stopPropagation();
      removeFriend(friend.username).catch((error) => {
        handleAsyncError(error, "Unable to remove friend");
      });
    });

    details.appendChild(makeAvatarElement(friend));
    details.appendChild(main);

    item.appendChild(rank);
    item.appendChild(details);
    item.appendChild(removeButton);

    item.addEventListener("click", () => openProfile(friend.username));
    item.addEventListener("keydown", (event) => {
      if (event.target !== item) {
        return;
      }
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        openProfile(friend.username);
      }
    });

    ui.friendsList.appendChild(item);
  });
}

async function refreshNow() {
  try {
    showMessage("Refreshing leaderboard...", "info");
    const response = await sendMessage({ type: "updateNow" });
    const warningCount =
      (response?.result?.errorCount || 0) + (response?.result?.notFoundCount || 0);
    if (warningCount > 0) {
      showMessage(`Refresh finished with ${warningCount} warning(s)`, "warning");
      return;
    }
    showMessage("Refresh completed successfully", "ok");
  } catch (error) {
    showMessage(`Refresh failed: ${error.message}`, "error");
  }
}

async function refreshUsers(usernames) {
  if (!Array.isArray(usernames) || !usernames.length) {
    return;
  }
  try {
    await sendMessage({ type: "updateUsers", usernames });
  } catch (error) {
    showMessage(`Background refresh failed: ${error.message}`, "error");
  }
}

async function removeFriend(username) {
  const existing = sanitizeFriendsList(state.friends);
  const updated = existing.filter((friend) => friend.username !== username);
  await storageSet({ friends: updated });
  showMessage(`Removed ${username}`, "info");
}

async function addFriendFromInput() {
  const rawInput = ui.usernameInput.value;
  const username = normalizeUsername(rawInput);

  if (!isValidUsername(username)) {
    showMessage(
      "Invalid username. Use 1-30 chars: letters, numbers, _ or -.",
      "error",
    );
    return;
  }

  const friends = sanitizeFriendsList(state.friends);
  if (friends.some((friend) => friend.username === username)) {
    showMessage(`${username} is already on the leaderboard`, "warning");
    return;
  }

  const newFriend = createNewFriendRecord(username);
  if (!newFriend) {
    showMessage("Could not add that username", "error");
    return;
  }

  const updated = sanitizeFriendsList([...friends, newFriend]);
  await storageSet({ friends: updated });
  ui.usernameInput.value = "";
  ui.usernameInput.focus();
  showMessage(`Added ${username}. Fetching latest data...`, "ok");
  refreshUsers([username]);
}

async function saveOwnerUsername() {
  const username = normalizeUsername(ui.ownerInput.value);
  if (!isValidUsername(username)) {
    showMessage(
      "Invalid username. Use 1-30 chars: letters, numbers, _ or -.",
      "error",
    );
    ui.ownerInput.focus();
    return;
  }

  const friends = sanitizeFriendsList(state.friends);
  let updatedFriends = friends;
  let ownerAdded = false;
  if (!friends.some((friend) => friend.username === username)) {
    const newFriend = createNewFriendRecord(username);
    if (newFriend) {
      updatedFriends = sanitizeFriendsList([...friends, newFriend]);
      ownerAdded = true;
    }
  }

  await storageSet({
    myUsername: username,
    ownerUsernameRequested: false,
    friends: updatedFriends,
  });

  state.myUsername = username;
  state.ownerUsernameRequested = false;
  updateOwnerUi();

  if (ownerAdded) {
    showMessage(`Saved your username and added ${username} to leaderboard`, "ok");
    await refreshUsers([username]);
    return;
  }

  showMessage("Saved your username", "ok");
}

async function handleInitialLoad() {
  const result = await storageGet([
    "friends",
    "lastUpdated",
    "refreshState",
    "theme",
    "myUsername",
    "ownerUsernameRequested",
  ]);

  state.friends = sanitizeFriendsList(result.friends || []);
  state.lastUpdated =
    typeof result.lastUpdated === "number" ? result.lastUpdated : null;
  state.refreshState = result.refreshState || null;
  state.myUsername = parseStoredOwnerUsername(result.myUsername);
  state.ownerUsernameRequested =
    typeof result.ownerUsernameRequested === "boolean"
      ? result.ownerUsernameRequested
      : true;

  applyTheme(result.theme || DEFAULT_THEME);
  updateOwnerUi();
  updateLastUpdatedLabel();
  updateRefreshStatusLabel();
  renderFriends();
}

ui.ownerForm.addEventListener("submit", (event) => {
  event.preventDefault();
  saveOwnerUsername().catch((error) => {
    handleAsyncError(error, "Unable to save your username");
  });
});

ui.addFriendForm.addEventListener("submit", (event) => {
  event.preventDefault();
  addFriendFromInput().catch((error) => {
    handleAsyncError(error, "Unable to add friend");
  });
});

ui.refreshButton.addEventListener("click", () => {
  refreshNow().catch((error) => {
    handleAsyncError(error, "Refresh failed");
  });
});

ui.themeToggle.addEventListener("click", () => {
  const nextTheme = state.theme === "dark" ? "light" : "dark";
  applyTheme(nextTheme);
  storageSet({ theme: nextTheme });
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") {
    return;
  }

  if (changes.friends) {
    state.friends = sanitizeFriendsList(changes.friends.newValue || []);
    renderFriends();
  }

  if (changes.lastUpdated) {
    state.lastUpdated =
      typeof changes.lastUpdated.newValue === "number"
        ? changes.lastUpdated.newValue
        : null;
    updateLastUpdatedLabel();
  }

  if (changes.refreshState) {
    state.refreshState = changes.refreshState.newValue || null;
    updateRefreshStatusLabel();
  }

  if (changes.theme) {
    applyTheme(changes.theme.newValue || DEFAULT_THEME);
  }

  if (changes.myUsername) {
    state.myUsername = parseStoredOwnerUsername(changes.myUsername.newValue);
    updateOwnerUi();
    renderFriends();
  }

  if (changes.ownerUsernameRequested) {
    state.ownerUsernameRequested =
      typeof changes.ownerUsernameRequested.newValue === "boolean"
        ? changes.ownerUsernameRequested.newValue
        : true;
    updateOwnerUi();
  }
});

handleInitialLoad().catch((error) => {
  showMessage(`Failed to load popup: ${error.message}`, "error");
});
