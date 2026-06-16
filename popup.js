// ========== State ==========
let currentSort = 'solved';
let currentFriends = [];
let myUsername = '';

// ========== Utilities ==========
function formatNumber(n) {
  if (typeof n === 'number') return n.toLocaleString();
  if (n === null) return '—';
  return n;
}

function timeAgo(ts) {
  if (!ts) return 'never';
  const diff = Date.now() - ts;
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function makeInitialsAvatar(username) {
  const el = document.createElement('div');
  el.className = 'avatar avatar-fallback';
  el.textContent = (username || '?').trim().charAt(0).toUpperCase();
  el.setAttribute('aria-hidden', 'true');
  return el;
}

// ========== Toast System ==========
function showToast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
}

// ========== Stats ==========
function updateStats(friends) {
  document.getElementById('friendCount').textContent = friends.length;
}

// ========== Empty State ==========
function updateEmptyState(friends) {
  const emptyState = document.getElementById('emptyState');
  const list = document.getElementById('friendsList');
  if (friends.length === 0) {
    emptyState.style.display = 'flex';
    list.style.display = 'none';
  } else {
    emptyState.style.display = 'none';
    list.style.display = 'grid';
  }
}

// ========== Sort ==========
function sortFriends(friends, sortBy) {
  const copy = [...friends];
  if (sortBy === 'name') {
    copy.sort((a, b) => a.username.localeCompare(b.username));
  } else if (sortBy === 'delta') {
    copy.sort((a, b) => {
      const da = typeof a.dailyDelta === 'number' ? a.dailyDelta : -Infinity;
      const db = typeof b.dailyDelta === 'number' ? b.dailyDelta : -Infinity;
      if (da !== db) return db - da;
      const sa = typeof a.totalSolved === 'number' ? a.totalSolved : -1;
      const sb = typeof b.totalSolved === 'number' ? b.totalSolved : -1;
      return sb - sa;
    });
  } else {
    copy.sort((a, b) => {
      const na = a.totalSolved === null ? -1 : a.totalSolved;
      const nb = b.totalSolved === null ? -1 : b.totalSolved;
      if (na === nb) return a.username.localeCompare(b.username);
      return nb - na;
    });
  }
  return copy;
}

// ========== Render ==========
function renderFriends(friends) {
  currentFriends = friends;
  const sorted = sortFriends(friends, currentSort);

  updateStats(friends);
  updateEmptyState(friends);

  if (friends.length === 0) return;

  const list = document.getElementById('friendsList');
  list.innerHTML = '';

  sorted.forEach((friend, idx) => {
    const li = document.createElement('li');
    li.className = 'friend-item glass';
    li.style.setProperty('--i', idx);

    const isMe = myUsername && friend.username.toLowerCase() === myUsername.toLowerCase();
    if (isMe) li.classList.add('is-you');

    // Rank badge
    const rank = document.createElement('span');
    rank.className = 'rank';
    if (idx === 0) rank.classList.add('rank-gold');
    else if (idx === 1) rank.classList.add('rank-silver');
    else if (idx === 2) rank.classList.add('rank-bronze');

    if (idx === 0) rank.textContent = '🥇';
    else if (idx === 1) rank.textContent = '🥈';
    else if (idx === 2) rank.textContent = '🥉';
    else rank.textContent = `#${idx + 1}`;

    // Avatar
    const avatarWrap = document.createElement('div');
    avatarWrap.className = 'avatar-wrap';
    if (friend.avatar) {
      const avatarImg = document.createElement('img');
      avatarImg.className = 'avatar';
      avatarImg.src = friend.avatar;
      avatarImg.alt = friend.username + ' avatar';
      avatarImg.loading = 'lazy';
      avatarImg.addEventListener('error', () => {
        avatarImg.replaceWith(makeInitialsAvatar(friend.username));
      });
      avatarWrap.appendChild(avatarImg);
    } else {
      avatarWrap.appendChild(makeInitialsAvatar(friend.username));
    }

    // Info column
    const info = document.createElement('div');
    info.className = 'info';

    const nameRow = document.createElement('div');
    nameRow.className = 'name-row';

    const name = document.createElement('span');
    name.className = 'name';
    name.textContent = friend.username;
    nameRow.appendChild(name);

    if (isMe) {
      const youBadge = document.createElement('span');
      youBadge.className = 'you-badge';
      youBadge.textContent = 'you';
      nameRow.appendChild(youBadge);
    }

    info.appendChild(nameRow);

    const dailyDelta = typeof friend.dailyDelta === 'number' ? friend.dailyDelta : 0;
    if (dailyDelta !== 0) {
      const deltaBadge = document.createElement('span');
      deltaBadge.className = `delta-badge ${dailyDelta > 0 ? 'positive' : 'negative'}`;
      deltaBadge.textContent = dailyDelta > 0 ? `+${dailyDelta} today` : `${dailyDelta} today`;
      info.appendChild(deltaBadge);
    }

    // Solved count
    const solvedWrap = document.createElement('div');
    solvedWrap.className = 'solved-wrap';
    const solved = document.createElement('span');
    solved.className = 'solved';
    solved.textContent = formatNumber(friend.totalSolved);
    const solvedLabel = document.createElement('span');
    solvedLabel.className = 'solved-label';
    solvedLabel.textContent = 'solved';
    solvedWrap.appendChild(solved);
    solvedWrap.appendChild(solvedLabel);

    // Remove button (not for self)
    const removeBtn = document.createElement('button');
    removeBtn.className = 'remove';
    removeBtn.innerHTML = `
      <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" focusable="false">
        <path d="M18 6L6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
        <path d="M6 6l12 12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
      </svg>`;
    removeBtn.title = 'Remove friend';
    removeBtn.setAttribute('aria-label', `Remove ${friend.username}`);
    removeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      removeFriend(friend.username);
      showToast(`Removed ${friend.username}`, 'error');
    });

    li.appendChild(rank);
    li.appendChild(avatarWrap);
    li.appendChild(info);
    li.appendChild(solvedWrap);
    if (!isMe) li.appendChild(removeBtn);
    list.appendChild(li);

    // Open LeetCode profile
    li.addEventListener('click', () => {
      const url = `https://leetcode.com/${friend.username}/`;
      if (chrome?.tabs?.create) {
        chrome.tabs.create({ url });
      } else {
        window.open(url, '_blank');
      }
    });
  });
}

// ========== Timestamps ==========
function setLastUpdated(ts) {
  const el = document.getElementById('lastUpdated');
  if (!ts) el.textContent = 'Updated: never';
  else el.textContent = `Updated ${timeAgo(ts)}`;
}

// ========== Actions ==========
function refreshNow() {
  const btn = document.getElementById('refresh');
  btn.classList.add('refreshing');
  chrome.runtime.sendMessage({ type: 'updateNow' }, () => {
    setTimeout(() => btn.classList.remove('refreshing'), 800);
  });
}

function removeFriend(username) {
  chrome.storage.local.get(['friends'], (result) => {
    let friends = result.friends || [];
    friends = friends.filter(f => f.username !== username);
    chrome.storage.local.set({ friends });
  });
}

function addFriend(username) {
  if (!username) return;
  chrome.storage.local.get(['friends'], (result) => {
    let friends = result.friends || [];
    if (friends.some(f => f.username === username)) {
      showToast(`${username} already added`, 'info');
      return;
    }
    friends.push({ username, totalSolved: null });
    chrome.storage.local.set({ friends }, () => {
      showToast(`Added ${username}`, 'success');
      refreshNow();
    });
  });
}

// ========== Gist Sync ==========
async function saveToGist(token, gistId, friends) {
  const payload = {
    description: 'LeetCode Leaderboard — Friend List Backup',
    files: {
      'leetcode-friends.json': {
        content: JSON.stringify({ friends, exportedAt: Date.now() }, null, 2)
      }
    }
  };

  const url = gistId
    ? `https://api.github.com/gists/${gistId}`
    : 'https://api.github.com/gists';
  const method = gistId ? 'PATCH' : 'POST';

  if (!gistId) payload.public = false;

  const res = await fetch(url, {
    method,
    headers: {
      'Authorization': `token ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) throw new Error(`GitHub API returned ${res.status}`);
  const data = await res.json();
  return data.id;
}

async function loadFromGist(token, gistId) {
  const res = await fetch(`https://api.github.com/gists/${gistId}`, {
    headers: { 'Authorization': `token ${token}` },
  });
  if (!res.ok) throw new Error(`GitHub API returned ${res.status}`);
  const data = await res.json();
  const file = data.files['leetcode-friends.json'];
  if (!file) throw new Error('Gist does not contain leetcode-friends.json');
  return JSON.parse(file.content);
}

// ========== Add Friend Dialog ==========
const addDialog = document.getElementById('addFriendDialog');
const addDialogInput = document.getElementById('username');

document.getElementById('addFriendOpen').addEventListener('click', () => {
  addDialog.showModal();
  setTimeout(() => addDialogInput.focus(), 100);
});

document.getElementById('dialogClose').addEventListener('click', () => {
  addDialog.close();
});

addDialog.addEventListener('click', (e) => {
  if (e.target === addDialog) addDialog.close();
});

document.getElementById('addFriend').addEventListener('click', () => {
  const username = addDialogInput.value.trim().toLowerCase();
  if (!username) return;
  addFriend(username);
  addDialogInput.value = '';
  addDialog.close();
});

addDialogInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    document.getElementById('addFriend').click();
  }
});

// ========== Setup Dialog ==========
const setupDialog = document.getElementById('setupDialog');

function showSetupIfNeeded() {
  chrome.storage.local.get(['myUsername', 'setupComplete'], (result) => {
    if (!result.setupComplete && !result.myUsername) {
      setupDialog.showModal();
      setTimeout(() => document.getElementById('myUsernameInput').focus(), 100);
    }
    if (result.myUsername) {
      myUsername = result.myUsername;
    }
  });
}

document.getElementById('setupSave').addEventListener('click', async () => {
  const usernameVal = document.getElementById('myUsernameInput').value.trim().toLowerCase();
  const tokenVal = document.getElementById('gistTokenInput').value.trim();
  const gistIdVal = document.getElementById('gistIdInput').value.trim();

  if (!usernameVal) {
    showToast('Please enter your username', 'error');
    return;
  }

  myUsername = usernameVal;
  const saveData = { myUsername: usernameVal, setupComplete: true };

  // If Gist token provided, save it and try to sync
  if (tokenVal) {
    saveData.gistToken = tokenVal;
    try {
      if (gistIdVal) {
        // Load existing gist data
        const gistData = await loadFromGist(tokenVal, gistIdVal);
        saveData.gistId = gistIdVal;
        if (gistData.friends && gistData.friends.length > 0) {
          saveData.friends = gistData.friends;
          showToast(`Loaded ${gistData.friends.length} friends from Gist`, 'success');
        }
      } else {
        // Create a new gist
        const friends = await new Promise(resolve => {
          chrome.storage.local.get(['friends'], r => resolve(r.friends || []));
        });
        const newGistId = await saveToGist(tokenVal, null, friends);
        saveData.gistId = newGistId;
        showToast('Created backup Gist', 'success');
      }
    } catch (err) {
      showToast(`Gist error: ${err.message}`, 'error');
    }
  }

  // Also add self to friends list if not already there
  chrome.storage.local.get(['friends'], (result) => {
    let friends = saveData.friends || result.friends || [];
    if (!friends.some(f => f.username === usernameVal)) {
      friends.push({ username: usernameVal, totalSolved: null });
    }
    saveData.friends = friends;
    chrome.storage.local.set(saveData, () => {
      setupDialog.close();
      renderFriends(saveData.friends);
      refreshNow();
    });
  });
});

document.getElementById('setupSkip').addEventListener('click', () => {
  chrome.storage.local.set({ setupComplete: true });
  setupDialog.close();
});

// ========== Refresh Button ==========
document.getElementById('refresh').addEventListener('click', () => {
  refreshNow();
});

// ========== Sort Tabs ==========
document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t => {
      t.classList.remove('active');
      t.setAttribute('aria-selected', 'false');
    });
    tab.classList.add('active');
    tab.setAttribute('aria-selected', 'true');
    currentSort = tab.dataset.sort;
    renderFriends(currentFriends);
  });
});

// ========== Theme ==========
function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
}

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme') || 'dark';
  const next = current === 'dark' ? 'light' : 'dark';
  applyTheme(next);
  chrome.storage.local.set({ theme: next });
}

document.getElementById('themeToggle').addEventListener('click', toggleTheme);

// ========== Initial Load ==========
chrome.storage.local.get(['friends', 'lastUpdated', 'theme', 'myUsername'], (result) => {
  applyTheme(result.theme || 'dark');
  myUsername = result.myUsername || '';
  renderFriends(result.friends || []);
  setLastUpdated(result.lastUpdated || null);
});

// Show setup dialog if needed
showSetupIfNeeded();

// ========== Storage Changes ==========
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  if (changes.friends) {
    renderFriends(changes.friends.newValue || []);

    // Auto-sync to Gist on friend list change
    chrome.storage.local.get(['gistToken', 'gistId'], (result) => {
      if (result.gistToken && result.gistId) {
        saveToGist(result.gistToken, result.gistId, changes.friends.newValue || []).catch(() => {});
      }
    });
  }
  if (changes.lastUpdated) {
    setLastUpdated(changes.lastUpdated.newValue);
  }
  if (changes.theme) {
    applyTheme(changes.theme.newValue || 'dark');
  }
  if (changes.myUsername) {
    myUsername = changes.myUsername.newValue || '';
    renderFriends(currentFriends);
  }
});