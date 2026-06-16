import test from "node:test";
import assert from "node:assert/strict";

import {
  FILTER_OPTIONS,
  FRIEND_STATUS,
  SORT_OPTIONS,
  filterFriends,
  isValidUsername,
  normalizeUsername,
  sanitizeFriendsList,
  sortFriends,
} from "../shared/friends.mjs";

test("normalizeUsername lowercases and trims", () => {
  assert.equal(normalizeUsername("  User_Name  "), "user_name");
});

test("isValidUsername enforces allowed characters", () => {
  assert.equal(isValidUsername("valid-user_12"), true);
  assert.equal(isValidUsername("Invalid Space"), false);
  assert.equal(isValidUsername(""), false);
});

test("sanitizeFriendsList removes invalid entries and deduplicates", () => {
  const result = sanitizeFriendsList([
    { username: "Alice", totalSolved: 10, lastCheckedAt: 1 },
    { username: "alice", totalSolved: 12, lastCheckedAt: 2 },
    { username: "bad name", totalSolved: 4 },
    { username: "bob", totalSolved: 6 },
  ]);

  assert.equal(result.length, 2);
  assert.equal(result.find((friend) => friend.username === "alice")?.totalSolved, 12);
});

test("sortFriends supports solved and delta sorting", () => {
  const friends = sanitizeFriendsList([
    { username: "alpha", totalSolved: 10, delta: 0 },
    { username: "beta", totalSolved: 20, delta: -1 },
    { username: "charlie", totalSolved: 10, delta: 4 },
  ]);

  const bySolved = sortFriends(friends, SORT_OPTIONS.SOLVED).map((friend) => friend.username);
  assert.deepEqual(bySolved, ["beta", "charlie", "alpha"]);

  const byDelta = sortFriends(friends, SORT_OPTIONS.DELTA).map((friend) => friend.username);
  assert.deepEqual(byDelta, ["charlie", "alpha", "beta"]);
});

test("filterFriends returns improved and issue subsets", () => {
  const friends = sanitizeFriendsList([
    { username: "a", delta: 3, status: FRIEND_STATUS.OK },
    { username: "b", delta: 0, status: FRIEND_STATUS.ERROR },
    { username: "c", delta: null, status: FRIEND_STATUS.NOT_FOUND },
  ]);

  const improved = filterFriends(friends, FILTER_OPTIONS.IMPROVED).map(
    (friend) => friend.username,
  );
  const issues = filterFriends(friends, FILTER_OPTIONS.ISSUES).map(
    (friend) => friend.username,
  );

  assert.deepEqual(improved, ["a"]);
  assert.deepEqual(issues, ["b", "c"]);
});
