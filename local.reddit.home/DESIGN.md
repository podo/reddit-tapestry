# Reddit Private Feed — item design

Card chrome order (Loom `post` style):

1. Native annotations: **`{flair} in r/subreddit`** when both are shown; **`r/subreddit`** if flair is off/empty; optional separate **`Pinned`** when stickied.
2. Service · Feed Type via verify `displayName` (`Reddit · Private Feed`, or `Reddit · {feed_name}`).
3. Author: `u/{name}` on `item.author` (assigned last).
4. Title → body meta (metrics in `<small>`) → selftext caption → attachments (media → link → crosspost quote).

NSFW / Spoiler use `contentWarning` only when Reddit flags the post.

Native Tapestry attachments may render under the HTML body; that is an API limitation.

## Loom done checklist

- Service reads `Reddit · …`, not a bare `Reddit` with a long custom title.
- Community context is one annotation chip (`News in r/test`), not separate sub + flair chips.
- Metrics sit under Author before selftext; subreddit/flair are not duplicated in body.
- Toggles still hide subreddit and/or flair.
