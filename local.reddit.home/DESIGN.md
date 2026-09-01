# Reddit Private Feed — item design

Card chrome order (Loom `post` style), matching X:

1. Native annotations: community context (`{flair} in r/subreddit` or `r/sub`) when enabled; optional `Pinned`. No feed-type annotation.
2. Service chrome: `service_name` `Reddit · Private Feed` at native Service size (`default_service_name_visibility: visible`); verify `displayName` uses `feedDisplayName()`.
3. Author: Reddit username only on `item.author.name` (no `u/` prefix or duplicate username field).
4. Title → optional body meta (metrics in `<small>` when **Show Metrics** is on) → selftext → attachments (media → poll → link → crosspost quote) → Comments action.

NSFW / Spoiler use `contentWarning` only when Reddit flags the post. Flair emoji uses `item.shortcodes` from `link_flair_richtext`.

Native Tapestry attachments may render under the HTML body; that is an API limitation.

After upgrading, **re-verify** the feed so displayName refreshes.

## Loom done checklist

- No bare `Reddit` Service row; feed type is Service chrome (`Reddit · …`), not an annotation.
- Author shows username only (no `u/` duplicate).
- Metrics under Author before selftext when Show Metrics is on; hidden when off.
- Comments action loads public `permalink.json` context.
- Expired private URL (401/403) raises a disable condition asking to re-copy from prefs/feeds.
