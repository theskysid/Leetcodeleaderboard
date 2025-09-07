// ...existing code...

function formatNumber(n) {
  return typeof n === 'number' ? n.toLocaleString() : n === null ? 'Loading...' : n;
}

function renderFriends(friends) {
  // sort by totalSolved desc (nulls last), then by username
  friends.sort((a, b) => {
    const na = a.totalSolved === null ? -1 : a.totalSolved;
    const nb = b.totalSolved === null ? -1 : b.totalSolved;
    if (na === nb) return a.username.localeCompare(b.username);
    return nb - na;
  });

  const list = document.getElementById('friendsList');
  list.innerHTML = '';

  friends.forEach((friend, idx) => {
    const li = document.createElement('li');
    li.className = 'friend-item';

    const rank = document.createElement('span');
    rank.className = 'rank';
    rank.textContent = `#${idx + 1}`;

    const name = document.createElement('span');
    name.className = 'name';
    name.textContent = friend.username;

    const solved = document.createElement('span');
    solved.className = 'solved';
    solved.textContent = formatNumber(friend.totalSolved);

    const removeBtn = document.createElement('button');
    removeBtn.className = 'remove';
    removeBtn.textContent = 'Remove';
    removeBtn.addEventListener('click', () => removeFriend(friend.username));

    li.appendChild(rank);
    li.appendChild(name);
    li.appendChild(solved);
    li.appendChild(removeBtn);
    list.appendChild(li);
  });
}

function setLastUpdated(ts) {
  const el = document.getElementById('lastUpdated');
  if (!ts) el.textContent = 'Last updated: never';
  else el.textContent = 'Last updated: ' + new Date(ts).toLocaleString();
}

function refreshNow() {
  // ask background to update immediately
  chrome.runtime.sendMessage({ type: 'updateNow' }, (resp) => {
    // background will update storage; popup listens to storage change
  });
}

function removeFriend(username) {
  chrome.storage.local.get(['friends'], (result) => {
    let friends = result.friends || [];
    friends = friends.filter(f => f.username !== username);
    chrome.storage.local.set({ friends });
  });
}

document.getElementById('addFriend').addEventListener('click', () => {
  const username = document.getElementById('username').value.trim();
  if (!username) return;

  chrome.storage.local.get(['friends'], (result) => {
    let friends = result.friends || [];
    if (!friends.some(f => f.username === username)) {
      friends.push({ username, totalSolved: null });
      chrome.storage.local.set({ friends }, () => {
        // trigger background update for this user
        refreshNow();
      });
    }
  });

  document.getElementById('username').value = '';
});

document.getElementById('refresh').addEventListener('click', () => {
  refreshNow();
});

// Listen for storage changes to re-render
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  if (changes.friends) {
    renderFriends(changes.friends.newValue || []);
  }
  if (changes.lastUpdated) {
    setLastUpdated(changes.lastUpdated.newValue);
  }
});

// Initial load
chrome.storage.local.get(['friends', 'lastUpdated'], (result) => {
  renderFriends(result.friends || []);
  setLastUpdated(result.lastUpdated || null);
});

// ...existing code...
