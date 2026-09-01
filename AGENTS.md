## Learned User Preferences

- Align Reddit Loom card chrome with X/Threads/Instagram sibling connectors; `local.reddit.home/DESIGN.md` is the source of truth for card order.
- Card stack: community annotation (`{flair} in r/sub`) when enabled; feed type on Service chrome (`service_name` / `displayName`), not as an annotation.
- Body meta (points/comments/domain) goes under Author before selftext; gate with `show_metrics` UI switch (default on).
- Author identity uses Reddit username only on `item.author.name` (no `u/` prefix; do not duplicate `username`).
- `sourceLabel()` must strip legacy `Reddit - …` / `Reddit · …` prefixes from `feed_name` so feed type does not duplicate as `Reddit · Reddit - Private Feed`.
- Run connector tests with `bun` when system `node` hits dyld errors on this machine.
- Ship releases by committing `VERSION` + built `RedditHome.tapestry`, pushing main, tagging `v*`, and letting `.github/workflows/release-v2.yml` publish the GitHub release.
- Compare against sibling tapestry connectors (`x-tapestry`, `threads-tapestry`, `instagram-tapestry`) when improving Loom presentation or packaging.

## Learned Workspace Facts

- This repo is the Reddit private JSON feed Tapestry connector under `local.reddit.home/`; distributable archive is `RedditHome.tapestry`.
- Auth model is a read-only private JSON URL from `reddit.com/prefs/feeds` (token-in-URL); no OAuth.
- There is no dedicated card React/Swift UI—`plugin.js` shapes `Item` / `Identity` / `Annotation` / attachments for Loom to render.
- Verify/feed list title uses `displayName`: `Reddit · {Feed Type}` via `feedDisplayName()`.
- Sibling *-tapestry repos live under `/Users/podo/Developer/` (x-tapestry, threads-tapestry, instagram-tapestry, arena-tapestry, readwise-reader-tapestry).
- X/Threads established the canonical Loom `post` chrome order; Reddit puts feed type on visible Service chrome (`service_name`), not as an annotation.
- `provides_attachments: true` means native attachments render under HTML body (Tapestry API behavior).
