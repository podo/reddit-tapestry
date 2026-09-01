# Reddit - Private Feed connector

Personal Reddit feed connector for Tapestry using Reddit's private JSON feed URLs.

## Setup

1. While signed into Reddit, open `https://www.reddit.com/prefs/feeds`.
2. Under **private listings**, copy the **JSON** URL next to **your front page** (or another private listing).
3. In Tapestry, add **Reddit - Private Feed**.
4. Paste the URL into **Private Reddit JSON URL**.
5. Optionally set **Feed Type** (Service shows `Reddit · Private Feed`, or your custom label).

Treat the URL as a password: it contains a private feed token. Do not publish it or commit it to this repository. Reddit notes that changing your password invalidates private feed URLs.

No Reddit OAuth application, API client ID, API secret, or Data API approval is required by this connector.

## Feed behavior

Cards follow Loom chrome order: community annotation (`{flair} in r/subreddit`), bold feed type `**Reddit · {Feed Type}**` (Service row hidden), author, title, optional metrics under author, then selftext and attachments. Open Post and Comments actions are available. The connector preserves score/comment metadata, images, galleries, Reddit-hosted video, polls, external links, spoilers, NSFW warnings and crossposts when those fields are present.

Initial history can follow Reddit's `after` cursor for up to 100, 200 or 300 items. Later refreshes request the newest page and rely on stable Reddit permalinks for Tapestry deduplication.

You can create separate Tapestry sources using Reddit's other private JSON URLs, including Saved, Upvoted, Hidden and Inbox feeds.
