# LeetCode Friends Tracker

Chrome extension that tracks your friends' total solved LeetCode problems and shows a leaderboard inside the popup.

## What changed in v2

- Added overlap-safe background refresh with request queueing.
- Added concurrency-limited fetching for faster updates.
- Added explicit friend statuses: `idle`, `loading`, `ok`, `error`, `not_found`.
- Added username normalization and validation (case-insensitive dedupe).
- Added richer popup status feedback (`refreshing`, warnings, completion).
- Kept popup UI simple: Add friend, Refresh, leaderboard list.
- Improved keyboard and accessibility behavior.
- Added unit tests for shared friend parsing/sorting/filtering logic.

## Username rules

- 1-30 characters.
- Lowercase letters, numbers, `_`, `-`.
- Duplicate usernames are prevented after normalization.

## Run tests

```bash
node --test tests/friends.test.mjs
```
