import test from "node:test";
import assert from "node:assert/strict";

import {
  FILTER_OPTIONS,
  FRIEND_STATUS,
  SORT_OPTIONS,
  countSolvedToday,
  filterFriends,
  isValidUsername,
  localDayString,
  normalizeUsername,
  sanitizeFriendsList,
  solvedToday,
  sortFriends,
  startOfLocalDaySeconds,
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

test("localDayString uses the local calendar day", () => {
  assert.equal(localDayString(new Date(2026, 0, 5, 23, 30)), "2026-01-05");
});

test("solvedToday ignores a count observed on an earlier day", () => {
  const today = "2026-08-27";
  assert.equal(solvedToday({ todayDate: today, todaySolved: 3 }, today), 3);
  assert.equal(solvedToday({ todayDate: "2026-08-26", todaySolved: 3 }, today), 0);
  assert.equal(solvedToday({ todayDate: today, todaySolved: null }, today), 0);
});

test("countSolvedToday counts distinct problems since local midnight", () => {
  const midnight = 1000;
  const submissions = [
    { titleSlug: "two-sum", timestamp: "1500" },
    { titleSlug: "two-sum", timestamp: "1400" }, // same problem, retried
    { titleSlug: "add-two-numbers", timestamp: 1200 },
    { titleSlug: "yesterday-problem", timestamp: 900 }, // before midnight
    { titleSlug: "", timestamp: 1600 },
    { titleSlug: "bad-ts", timestamp: "nope" },
  ];
  assert.equal(countSolvedToday(submissions, midnight), 2);
  assert.equal(countSolvedToday([], midnight), 0);
  assert.equal(countSolvedToday(null, midnight), 0);
});

test("startOfLocalDaySeconds is midnight in local time", () => {
  const noon = new Date(2026, 7, 28, 12, 34, 56);
  const midnight = new Date(2026, 7, 28, 0, 0, 0, 0);
  assert.equal(startOfLocalDaySeconds(noon), Math.floor(midnight.getTime() / 1000));
});
