# Reddit Home connector

Authenticated Reddit home-feed connector for Tapestry.

## Reddit OAuth setup

1. Request/confirm Reddit Data API access for your account/app if Reddit requires approval.
2. Open Reddit's app preferences at https://www.reddit.com/prefs/apps and create a **web app**.
3. Set the redirect URI exactly to `https://iconfactory.com/tapestry-oauth`.
4. In Tapestry, add **Reddit Home** and enter the Reddit app client ID and client secret when prompted.
5. Sign in to Reddit and approve the read-only scopes.

The connector requests only `identity` and `read`. It does not vote, post, comment, moderate, or change subscriptions.

## Feed behavior

- Default sort: **New**, for a chronological stream across the authenticated account's home subscriptions.
- Other sorts: Best, Hot, Rising, Top.
- Initial history: 100, 200, or 300 items. Subsequent refreshes fetch only the newest page (up to 100 items).
- NSFW posts are excluded by default. If enabled, they are returned with a content warning.
- Subreddit and flair annotations can be toggled.
- Supports self posts, external links, image previews, galleries, Reddit-hosted video, direct media, spoilers, and crosspost quote cards.

Reddit listing endpoints are paginated with the `after` cursor. This connector follows up to three pages during initial import and relies on Tapestry item URIs for timeline deduplication.
