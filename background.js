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
      return null;
    }

    const data = await res.json();
    if (data && data.data && data.data.matchedUser) {
      const all = data.data.matchedUser.submitStatsGlobal.acSubmissionNum.find(d => d.difficulty === 'All');
      return all ? all.count : null;
    }
    // no matched user
    return null;
  } catch (err) {
    console.error('fetchSolved error for', username, err);
    return null;
  }
}

// 🔹 Update all friends
async function updateFriends() {
  // promisify chrome.storage.local.get/set so callers can await completion
  const storageGet = (keys) => new Promise((resolve) => chrome.storage.local.get(keys, resolve));
  const storageSet = (obj) => new Promise((resolve) => chrome.storage.local.set(obj, resolve));

  const result = await storageGet(["friends"]);
  let friends = result.friends || [];

  for (let friend of friends) {
    try {
      const total = await fetchSolved(friend.username);
      friend.totalSolved = total;
    } catch (err) {
      console.error('Error updating', friend.username, err);
      friend.totalSolved = null;
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
