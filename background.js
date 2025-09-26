const API_URL = "https://leetcode.com/graphql";

async function fetchSolved(username) {
  const query = `
    query getUserProfile($username: String!) {
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
    }`;

  try {
    const res = await fetch(API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Referer": "https://leetcode.com/",
        "Accept": "application/json"
      },
      body: JSON.stringify({ query, variables: { username } })
    });

    if (!res.ok) {
      console.error('LeetCode API returned', res.status, res.statusText);
      return { total: null, avatar: null };
    }

    const data = await res.json();
    if (data?.data?.matchedUser) {
      const mu = data.data.matchedUser;
      const all = mu?.submitStatsGlobal?.acSubmissionNum
        ? mu.submitStatsGlobal.acSubmissionNum.find(d => d.difficulty === 'All')
        : null;
      const avatar = mu?.profile?.userAvatar ?? null;
      return { total: all ? all.count : null, avatar };
    }
    // no matched user
    return { total: null, avatar: null };
  } catch (err) {
    console.error('fetchSolved error for', username, err);
    return { total: null, avatar: null };
  }
}

// 🔹 Update all friends
async function updateFriends() {
  // promisify chrome.storage.local.get/set so callers can await completion
  const storageGet = (keys) => new Promise((resolve) => chrome.storage.local.get(keys, resolve));
  const storageSet = (obj) => new Promise((resolve) => chrome.storage.local.set(obj, resolve));

  const result = await storageGet(["friends"]);
  let friends = result.friends || [];

  // helper: apply the fetched result to the friend object
  const applyResult = (friend, res) => {
    if (res && typeof res === 'object') {
      friend.totalSolved = res.total;
      friend.avatar = res.avatar ?? null;
      return;
    }
    // backward compatibility: if fetchSolved returned a number
    friend.totalSolved = typeof res === 'number' ? res : null;
    friend.avatar = friend.avatar ?? null;
  };

  for (let friend of friends) {
    try {
      const res = await fetchSolved(friend.username);
      applyResult(friend, res);
    } catch (err) {
      console.error('Error updating', friend.username, err);
      friend.totalSolved = null;
      friend.avatar = friend.avatar ?? null;
    }
  }

  const now = Date.now();
  await storageSet({ friends, lastUpdated: now });
  console.log('updateFriends finished, updated', friends.length, 'friends at', new Date(now).toISOString());
  return { friends, lastUpdated: now };
}

// 🔹 Run every 1 hour
chrome.alarms.create("updateLeetCode", { periodInMinutes: 60 });
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "updateLeetCode") {
    updateFriends();
  }
});

// Run once when extension is installed
chrome.runtime.onInstalled.addListener(() => {
  updateFriends();
});

// Respond to popup manual update requests
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg && msg.type === 'updateNow') {
    updateFriends().then(() => sendResponse({ ok: true })).catch(() => sendResponse({ ok: false }));
    // indicate we'll respond asynchronously
    return true;
  }
});
