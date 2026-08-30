# Reddit Home for Tapestry

A personal OAuth connector that brings the authenticated Reddit home feed into [Tapestry](https://usetapestry.com/).

## Features

- Uses your own Reddit OAuth client ID and secret.
- Reads the authenticated account's home feed (`/new`, `/best`, `/hot`, `/rising`, or `/top`).
- `New` is the default to maximize chronological coverage across subscribed communities.
- 100/200/300-item initial import; later refreshes fetch the newest 100 items.
- Self posts, images, galleries, Reddit video, direct media, external link cards, crossposts, flair, subreddit annotations, NSFW and spoiler warnings.
- Read-only OAuth scopes: `identity` and `read`.
- Tokens are managed by Tapestry, not by connector JavaScript.

## Install

Download `RedditHome.tapestry` from this repository and open it with Tapestry.

Then create a Reddit **web app** at https://www.reddit.com/prefs/apps using this redirect URI:

```
https://iconfactory.com/tapestry-oauth
```

Enter that app's client ID and client secret when Tapestry prompts for API keys, then authorize Reddit.

> Reddit may require explicit approval for Data API access. If Reddit returns HTTP 403 after OAuth succeeds, verify the app's Data API access status.

## Build

```sh
./scripts/build.sh
```

## Test

```sh
node tests/plugin.test.js
```

## Source

Connector source lives in `local.reddit.home/`.
