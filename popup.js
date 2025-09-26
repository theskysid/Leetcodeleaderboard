// ...existing code...

function formatNumber(n) {
  if (typeof n === 'number') return n.toLocaleString();
  if (n === null) return 'Loading...';
  return n;
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

    const avatarWrap = document.createElement('div');
    avatarWrap.className = 'avatar-wrap';
    const avatarImg = document.createElement('img');
    avatarImg.className = 'avatar';
    if (friend.avatar) {
      avatarImg.src = friend.avatar;
      avatarImg.alt = friend.username + ' avatar';
    } else {
      // fallback: use data attribute and render initials via CSS background-color or leave empty
      avatarImg.alt = friend.username + ' avatar';
    }
    avatarWrap.appendChild(avatarImg);

    const name = document.createElement('span');
    name.className = 'name';
    name.textContent = friend.username;

    const solved = document.createElement('span');
    solved.className = 'solved';
    solved.textContent = formatNumber(friend.totalSolved);

    const removeBtn = document.createElement('button');
    removeBtn.className = 'remove';
    // accessible trash icon (SVG) instead of text
    removeBtn.innerHTML = `
      <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false" xmlns="http://www.w3.org/2000/svg">
        <path d="M3 6h18" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
        <path d="M8 6V4h8v2" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M5 6l1 14h12l1-14" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M10 11v6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
        <path d="M14 11v6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
      </svg>`;
    removeBtn.title = 'Delete friend';
    removeBtn.setAttribute('aria-label', 'Delete friend');
    // don't trigger the parent click (which opens profile)
    removeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      removeFriend(friend.username);
    });
  li.appendChild(rank);
  li.appendChild(avatarWrap);
  li.appendChild(name);
    li.appendChild(solved);
    li.appendChild(removeBtn);
    list.appendChild(li);

    // open LeetCode profile when the item is clicked (except remove button)
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

// Theme management
function initializeTheme() {
  chrome.storage.local.get(['theme'], (result) => {
    const theme = result.theme || 'dark';
    applyTheme(theme);
  });
}

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
}

function toggleTheme() {
  const currentTheme = document.documentElement.getAttribute('data-theme') || 'dark';
  const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
  
  applyTheme(newTheme);
  chrome.storage.local.set({ theme: newTheme });
}

// Theme toggle button event listener
document.getElementById('themeToggle').addEventListener('click', toggleTheme);

// Initial load
chrome.storage.local.get(['friends', 'lastUpdated', 'theme'], (result) => {
  renderFriends(result.friends || []);
  setLastUpdated(result.lastUpdated || null);
  applyTheme(result.theme || 'dark');
});

// Listen for theme changes from storage
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  if (changes.friends) {
    renderFriends(changes.friends.newValue || []);
  }
  if (changes.lastUpdated) {
    setLastUpdated(changes.lastUpdated.newValue);
  }
  if (changes.theme) {
    applyTheme(changes.theme.newValue || 'dark');
  }
});

// ...existing code...
