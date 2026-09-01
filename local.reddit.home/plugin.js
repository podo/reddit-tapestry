// Reddit for Tapestry — OAuth API feeds with optional private JSON URL fallback.

const REDDIT_WEB = "https://www.reddit.com";
const REDDIT_OAUTH = "https://oauth.reddit.com";
const REDDIT_ICON = "https://www.redditstatic.com/desktop2x/img/favicon/apple-icon-180x180.png";
const REDDIT_USER_AGENT = "web:local.reddit.home:8 (by /u/tapestry)";
const PAGE_SIZE = 100;
const AVATAR_LOOKUP_CAP = 8;
const connectorBuildId = "reddit@plugin8@2.1.0";

function verify() {
  if (usesPrivateFeedUrl()) verifyPrivateFeed();
  else verifyOAuth();
}

function verifyPrivateFeed() {
  let url;
  try { url = normalizedPrivateUrl(); }
  catch (error) { processError(error); return; }
  if (!url) { processError(Error("Paste the private JSON URL from Reddit's RSS feeds page.")); return; }
  requestListing(listingPageUrl(url, null)).then((listing) => {
    if (!Array.isArray(listing?.data?.children)) throw Error("This URL did not return a Reddit listing. Copy the JSON link, not the RSS link.");
    processVerification({ displayName: feedDisplayName(), icon: REDDIT_ICON, baseUrl: REDDIT_WEB });
  }).catch(processError);
}

function verifyOAuth() {
  requestReddit(REDDIT_OAUTH + "/api/v1/me").then((json) => {
    const name = json?.name;
    if (!name) throw Error("Reddit did not return account information after sign-in.");
    processVerification({ displayName: feedDisplayName(), icon: REDDIT_ICON, baseUrl: REDDIT_WEB });
  }).catch(processError);
}

function load() {
  if (usesPrivateFeedUrl()) loadPrivateFeed();
  else loadOAuthFeed();
}

function loadPrivateFeed() {
  const historyCount = clampInt(initial_history, 100, 300, 100);
  const firstLoad = getItem("reddit_private_initialized_v2") !== "1";
  let url;
  try { url = normalizedPrivateUrl(); }
  catch (error) { processError(error); return; }
  if (!url) { processError(Error("Paste the private JSON URL from Reddit's RSS feeds page.")); return; }
  const pageLimit = firstLoad ? Math.max(1, Math.min(5, Math.ceil(historyCount / PAGE_SIZE) + 2)) : 1;
  fetchListingPages(url, pageLimit, !firstLoad, historyCount).then((children) => {
    if (children === null) { processResults(null, true); return; }
    const results = itemsForChildren(children, historyCount);
    return enrichAuthorAvatars(results).then(() => {
      setItem("reddit_private_initialized_v2", "1");
      processResults(results, true);
    });
  }).catch(processError);
}

function loadOAuthFeed() {
  const historyCount = clampInt(initial_history, 100, 300, 100);
  const firstLoad = getItem("reddit_oauth_initialized_v1") !== "1";
  let baseUrl;
  try { baseUrl = oauthListingBaseUrl(); }
  catch (error) { processError(error); return; }
  const pageLimit = firstLoad ? Math.max(1, Math.min(5, Math.ceil(historyCount / PAGE_SIZE) + 2)) : 1;
  fetchListingPages(baseUrl, pageLimit, !firstLoad, historyCount).then((children) => {
    if (children === null) { processResults(null, true); return; }
    const results = itemsForChildren(children, historyCount);
    return enrichAuthorAvatars(results).then(() => {
      setItem("reddit_oauth_initialized_v1", "1");
      processResults(results, true);
    });
  }).catch(processError);
}

function usesPrivateFeedUrl() { return !!privateFeedUrl(); }

function privateFeedUrl() {
  const siteUrl = typeof site === "string" ? site.trim() : "";
  const legacyUrl = typeof private_feed_url === "string" ? private_feed_url.trim() : "";
  const value = siteUrl || legacyUrl;
  if (!value) return "";
  if (!/^https:\/\/(www\.)?reddit\.com\/\.json(?:[?#]|$)/i.test(value)) return "";
  if (!/(?:[?&])feed=[^&]+/i.test(value)) return "";
  return value;
}

function cleanFeedSource() {
  const value = typeof feed_source === "string" ? feed_source.trim().toLowerCase() : "home";
  return value || "home";
}

function cleanSubredditName() {
  const value = typeof subreddit_name === "string" ? subreddit_name.trim() : "";
  return value.replace(/^r\//i, "");
}

function oauthListingPath() {
  const source = cleanFeedSource();
  switch (source) {
    case "home":
    case "hot":
      return "/hot";
    case "new":
      return "/new";
    case "best":
      return "/best";
    case "rising":
      return "/rising";
    case "saved":
      return "/user/me/saved";
    case "upvoted":
      return "/user/me/upvoted";
    case "hidden":
      return "/user/me/hidden";
    case "subreddit": {
      const sub = cleanSubredditName();
      if (!sub) throw Error("Enter a subreddit name when Feed is subreddit.");
      return "/r/" + encodeURIComponent(sub) + "/hot";
    }
    default:
      throw Error("Unsupported Reddit feed source: " + source);
  }
}

function oauthListingBaseUrl() { return REDDIT_OAUTH + oauthListingPath(); }

function defaultFeedLabel() {
  if (usesPrivateFeedUrl()) return "Private Feed";
  const source = cleanFeedSource();
  switch (source) {
    case "home": return "Home";
    case "hot": return "Hot";
    case "new": return "New";
    case "best": return "Best";
    case "rising": return "Rising";
    case "saved": return "Saved";
    case "upvoted": return "Upvoted";
    case "hidden": return "Hidden";
    case "subreddit": {
      const sub = cleanSubredditName();
      return sub ? "r/" + sub : "Subreddit";
    }
    default:
      return "Home";
  }
}

function redditRequestHeaders() {
  return { "Accept": "application/json", "User-Agent": REDDIT_USER_AGENT };
}

function requestReddit(url, conditional) {
  const request = conditional ? sendConditionalRequest : sendRequest;
  return request(url, "GET", null, redditRequestHeaders(), true).then((raw) => parseRedditResponse(raw, usesPrivateFeedUrl()));
}

function parseRedditResponse(raw, privateMode) {
  let response = raw;
  if (typeof response === "string") response = JSON.parse(response);
  const status = response?.status ?? 200;
  const body = response?.body ?? response;
  if (status === 304) return null;
  if (status === 401) {
    const title = privateMode ? "Private feed URL expired" : "Sign in to Reddit";
    const message = privateMode
      ? "Copy a fresh JSON URL from reddit.com/prefs/feeds and update this source."
      : "Your Reddit session expired. Sign in again to refresh this feed.";
    if (typeof raiseCondition === "function") raiseCondition(privateMode ? "disable" : "authorize", title, message);
    throw Error(privateMode
      ? "Reddit rejected this private feed URL. Copy a fresh JSON URL from reddit.com/prefs/feeds."
      : "Reddit rejected this request. Sign in again to refresh your Reddit session.");
  }
  if (status === 403) {
    const title = privateMode ? "Private feed URL expired" : "Reddit access denied";
    const message = privateMode
      ? "Copy a fresh JSON URL from reddit.com/prefs/feeds and update this source."
      : "Reddit denied access to this feed. Check your OAuth scopes and feed settings.";
    if (typeof raiseCondition === "function") raiseCondition(privateMode ? "disable" : "authorize", title, message);
    throw Error(privateMode
      ? "Reddit returned HTTP 403. The private URL may have expired, or Reddit may be blocking this request. Try again later or copy a fresh JSON URL."
      : "Reddit returned HTTP 403 for this feed.");
  }
  if (status === 429) throw Error("Reddit rate limit reached. Try again later.");
  if (status < 200 || status >= 300) throw Error("Reddit request failed with HTTP " + status + ".");
  return typeof body === "string" ? JSON.parse(body) : body;
}

function normalizedPrivateUrl() {
  const value = privateFeedUrl();
  if (!value) return "";
  if (!/^https:\/\/(www\.)?reddit\.com\/\.json(?:[?#]|$)/i.test(value)) throw Error("Paste an HTTPS private JSON URL from reddit.com/prefs/feeds.");
  if (!/(?:[?&])feed=[^&]+/i.test(value)) throw Error("This Reddit URL is missing its private feed token.");
  return value;
}

function performAction(actionId, actionValue, item) {
  performActionAsync(actionId, actionValue, item)
    .then((result) => actionComplete(result, null))
    .catch((error) => actionComplete(null, error));
}

function performActionAsync(actionId, actionValue, item) {
  if (actionId === "comments") return loadCommentContext(item, actionValue);
  return Promise.reject(Error("Unsupported Reddit action: " + actionId));
}

function loadCommentContext(item, actionValue) {
  let payload = {};
  try { payload = typeof actionValue === "string" ? JSON.parse(actionValue) : (actionValue || {}); }
  catch (error) { payload = {}; }
  const permalink = payload.permalink || (item && item.uri) || "";
  if (!permalink) return Promise.reject(Error("Missing post permalink for comments."));
  const url = commentsJsonUrl(permalink);
  return sendRequest(url, "GET", null, { "Accept": "application/json" }, true).then((raw) => {
    let response = raw;
    if (typeof response === "string") response = JSON.parse(response);
    const status = response?.status ?? 200;
    const body = response?.body ?? response;
    if (status < 200 || status >= 300) throw Error("Reddit comments request failed with HTTP " + status + ".");
    const json = typeof body === "string" ? JSON.parse(body) : body;
    const commentListing = Array.isArray(json) ? json[1] : null;
    const comments = flattenCommentChildren(commentListing?.data?.children, 0).slice(0, 40);
    return item ? [item].concat(comments) : comments;
  });
}

function commentsJsonUrl(permalink) {
  let path = String(permalink);
  if (/^https?:\/\//i.test(path)) {
    path = path.replace(/^https?:\/\/(www\.)?reddit\.com/i, "");
  }
  if (path.indexOf(".json") >= 0) return absoluteRedditUrl(path) + (path.indexOf("?") >= 0 ? "&" : "?") + "raw_json=1&limit=50";
  if (path.charAt(path.length - 1) === "/") path = path.slice(0, -1);
  return absoluteRedditUrl(path + ".json?raw_json=1&limit=50");
}

function flattenCommentChildren(children, depth) {
  const results = [];
  if (!Array.isArray(children)) return results;
  for (const child of children) {
    if (!child || child.kind !== "t1" || !child.data) continue;
    const data = child.data;
    const comment = commentItemForData(data, depth);
    if (comment) results.push(comment);
    if (data.replies && data.replies.data && data.replies.data.children) {
      results.push.apply(results, flattenCommentChildren(data.replies.data.children, depth + 1));
    }
  }
  return results;
}

function commentItemForData(data, depth) {
  const uri = absoluteRedditUrl(data.permalink || ("/comments/" + (data.link_id || "") + "/_/" + (data.id || "")));
  const item = Item.createWithUriDate(uri, new Date((data.created_utc || 0) * 1000));
  item.title = depth > 0 ? "Reply" : "Comment";
  if (data.body_html) item.body = absolutizeRedditHtml(decodeHtmlEntities(data.body_html));
  else if (data.body) item.body = "<p>" + escapeHtml(data.body).replace(/\n/g, "<br>") + "</p>";
  item.author = identityForPost(data);
  if (depth > 0) item.annotations = [Annotation.createWithText("Reply")];
  return item;
}

function cleanFeedName() { return typeof feed_name === "string" ? feed_name.trim() : ""; }
function sourceLabel() {
  const name = cleanFeedName();
  if (name) {
    const stripped = name.replace(/^reddit(\s*[·\-–—:]\s*|\s+)/i, "").trim();
    if (stripped) return stripped;
  }
  return defaultFeedLabel();
}
function feedDisplayName() { return "Reddit · " + sourceLabel(); }

function fetchListingPages(baseUrl, pageCount, conditional, targetCount) {
  const all = [];
  function next(index, after) {
    if (index >= pageCount) return Promise.resolve(all);
    const url = listingPageUrl(baseUrl, after);
    return requestListing(url, conditional && index === 0).then((listing) => {
      if (listing === null) return null;
      const children = listing?.data?.children;
      if (!Array.isArray(children)) throw Error("Unexpected Reddit private JSON response.");
      for (const child of children) all.push(child);
      const nextAfter = listing?.data?.after;
      if (targetCount && acceptedChildCount(all, targetCount) >= targetCount) return all;
      return nextAfter ? next(index + 1, nextAfter) : all;
    });
  }
  return next(0, null);
}

function acceptedChildCount(children, limit) {
  const seen = {};
  let count = 0;
  for (const child of children) {
    const data = child?.data;
    if (!data || child?.kind === "more") continue;
    if (include_nsfw !== "on" && data.over_18 === true) continue;
    const key = data.name || data.id || data.permalink;
    if (!key || seen[key]) continue;
    seen[key] = true;
    count += 1;
    if (count >= limit) break;
  }
  return count;
}

function itemsForChildren(children, limit) {
  const results = [];
  const seen = {};
  for (const child of children) {
    const data = child?.data;
    if (!data || child?.kind === "more") continue;
    if (include_nsfw !== "on" && data.over_18 === true) continue;
    const key = data.name || data.id || data.permalink;
    if (!key || seen[key]) continue;
    const result = itemForData(data);
    if (!result) continue;
    seen[key] = true;
    results.push(result);
    if (results.length >= limit) break;
  }
  return results;
}

function listingPageUrl(baseUrl, after) {
  let url = baseUrl;
  url = setQueryParameter(url, "raw_json", "1");
  url = setQueryParameter(url, "limit", String(PAGE_SIZE));
  if (after) url = setQueryParameter(url, "after", after);
  return url;
}

function setQueryParameter(url, key, value) {
  const hashIndex = url.indexOf("#");
  const hash = hashIndex >= 0 ? url.slice(hashIndex) : "";
  let base = hashIndex >= 0 ? url.slice(0, hashIndex) : url;
  const encodedKey = encodeURIComponent(key);
  const encodedValue = encodeURIComponent(value);
  const re = new RegExp("([?&])" + encodedKey + "=[^&]*");
  if (re.test(base)) base = base.replace(re, "$1" + encodedKey + "=" + encodedValue);
  else base += (base.indexOf("?") >= 0 ? "&" : "?") + encodedKey + "=" + encodedValue;
  return base + hash;
}

function requestListing(url, conditional) {
  return requestReddit(url, conditional);
}

function itemForData(item) {
  const date = new Date((item.created_utc || 0) * 1000);
  const uri = absoluteRedditUrl(item.permalink || ("/comments/" + (item.id || "")));
  const result = Item.createWithUriDate(uri, date);
  result.title = item.title || "Reddit post";
  const body = htmlBodyForPost(item); if (body) result.body = body;
  const annotations = annotationsForPost(item); if (annotations.length) result.annotations = annotations;
  const attachments = attachmentsForPost(item); if (attachments.length) result.attachments = attachments;
  const shortcodes = shortcodesForPost(item); if (shortcodes) result.shortcodes = shortcodes;
  if (item.over_18 === true) result.contentWarning = "NSFW";
  else if (item.spoiler === true) result.contentWarning = "Spoiler";
  result.actions = actionsForPost(item, uri);
  // Assign author last — matches X/Threads Loom identity quirks.
  result.author = identityForPost(item);
  return result;
}

function actionsForPost(item, uri) {
  return {
    _connectorBuild: connectorBuildId,
    comments: JSON.stringify({ permalink: uri })
  };
}

function shortcodesForPost(item) {
  if (!Array.isArray(item.link_flair_richtext)) return null;
  const shortcodes = {};
  let found = false;
  for (const part of item.link_flair_richtext) {
    if (part?.e !== "emoji") continue;
    const name = typeof part.a === "string" ? part.a.replace(/^:/, "").replace(/:$/, "") : "";
    const url = part.u;
    if (!name || !url) continue;
    shortcodes[name] = decodeHtmlEntities(url);
    found = true;
  }
  return found ? shortcodes : null;
}

function identityForPost(item) {
  const author = item.author || "[deleted]";
  const identity = Identity.createWithName(author);
  identity.avatar = cachedAvatarForAuthor(author) || REDDIT_ICON;
  if (author !== "[deleted]") identity.uri = REDDIT_WEB + "/user/" + encodeURIComponent(author);
  return identity;
}

function avatarCacheKey(author) { return "reddit_avatar_v1_" + author; }

function cachedAvatarForAuthor(author) {
  if (!author || author === "[deleted]") return null;
  const cached = getItem(avatarCacheKey(author));
  return typeof cached === "string" && /^https?:\/\//i.test(cached) ? cached : null;
}

function enrichAuthorAvatars(items) {
  const pending = [];
  const seen = {};
  for (const item of items) {
    const author = item?.author?.username;
    if (!author || author === "[deleted]" || seen[author] || cachedAvatarForAuthor(author)) continue;
    seen[author] = true;
    pending.push(author);
    if (pending.length >= AVATAR_LOOKUP_CAP) break;
  }
  if (!pending.length) return Promise.resolve();
  return Promise.all(pending.map((author) => fetchAuthorAvatar(author).then((url) => {
    if (!url) return;
    setItem(avatarCacheKey(author), url);
    for (const item of items) {
      if (item?.author?.username === author) item.author.avatar = url;
    }
  }))).then(() => undefined);
}

function fetchAuthorAvatar(author) {
  const url = REDDIT_WEB + "/user/" + encodeURIComponent(author) + "/about.json?raw_json=1";
  return sendRequest(url, "GET", null, { "Accept": "application/json" }, true).then((raw) => {
    let response = raw;
    if (typeof response === "string") response = JSON.parse(response);
    const status = response?.status ?? 200;
    const body = response?.body ?? response;
    if (status < 200 || status >= 300) return null;
    const json = typeof body === "string" ? JSON.parse(body) : body;
    const data = json?.data;
    const icon = data?.snoovatar_img || data?.icon_img;
    return validThumbnail(icon) ? decodeHtmlEntities(icon) : null;
  }).catch(() => null);
}

function annotationsForPost(item) {
  const annotations = [];
  const sub = include_subreddit === "on" ? (item.subreddit_name_prefixed || "") : "";
  if (sub) {
    const flair = include_flair === "on" && item.link_flair_text ? String(item.link_flair_text).trim() : "";
    const text = flair ? flair + " in " + sub : sub;
    const a = Annotation.createWithText(text);
    a.uri = REDDIT_WEB + "/r/" + encodeURIComponent(item.subreddit || "");
    annotations.push(a);
  }
  // Feed type uses Service chrome (service_name + verify displayName), not an annotation — matches X.
  if (item.stickied === true) annotations.push(Annotation.createWithText("Pinned"));
  return annotations;
}

function showMetrics() { return typeof show_metrics === "undefined" || show_metrics !== "off"; }

function metricsMetaHtml(item) {
  if (!showMetrics()) return "";
  const metadata = [];
  if (typeof item.score === "number") metadata.push(formatNumber(item.score) + " points");
  if (typeof item.num_comments === "number") metadata.push(formatNumber(item.num_comments) + " comments");
  if (item.domain && !item.is_self) metadata.push(escapeHtml(item.domain));
  if (!metadata.length) return "";
  return '<p class="reddit-meta-metrics"><small>' + metadata.join(" · ") + "</small></p>";
}

function htmlBodyForPost(item) {
  let html = metricsMetaHtml(item);
  if (item.selftext_html) html += absolutizeRedditHtml(decodeHtmlEntities(item.selftext_html));
  if (html) html += "<!-- " + escapeHtml(connectorBuildId) + " -->";
  return html;
}

function attachmentsForPost(item, depth) {
  const nest = depth || 0;
  const attachments = [];
  addRedditVideo(item, attachments);
  if (!attachments.length) addGallery(item, attachments);
  if (!attachments.length) addPreviewImages(item, attachments);
  if (!attachments.length) addDirectMedia(item, attachments);
  addPoll(item, attachments);
  // Link card even when media exists (X pattern); skip for self posts.
  addExternalLink(item, attachments);
  if (nest === 0 && Array.isArray(item.crosspost_parent_list) && item.crosspost_parent_list.length) {
    const parent = quotedItemForCrosspost(item.crosspost_parent_list[0]);
    if (parent) attachments.push(parent);
  }
  return attachments;
}

function addRedditVideo(item, attachments) {
  const video = item?.secure_media?.reddit_video || item?.media?.reddit_video;
  if (!video) return;
  const url = video.hls_url || video.fallback_url; if (!url) return;
  const a = MediaAttachment.createWithUrl(decodeHtmlEntities(url)); a.mimeType = "video/mp4";
  if (validThumbnail(item.thumbnail)) a.thumbnail = decodeHtmlEntities(item.thumbnail);
  if (video.width && video.height) a.aspectSize = { width: video.width, height: video.height };
  attachments.push(a);
}
function addGallery(item, attachments) {
  const items = item?.gallery_data?.items, metadata = item?.media_metadata;
  if (!Array.isArray(items) || !metadata) return;
  for (const galleryItem of items) {
    const media = metadata[galleryItem.media_id], source = media?.s, url = source?.u || source?.gif;
    if (!url || media?.status === "failed") continue;
    const a = MediaAttachment.createWithUrl(decodeHtmlEntities(url));
    a.mimeType = media?.m || (source.gif ? "image/gif" : "image");
    if (source.x && source.y) a.aspectSize = { width: source.x, height: source.y };
    const posters = media?.p;
    if (Array.isArray(posters) && posters.length) {
      const poster = posters[posters.length - 1]?.u;
      if (poster) a.thumbnail = decodeHtmlEntities(poster);
    }
    attachments.push(a);
  }
}
function addPreviewImages(item, attachments) {
  const images = item?.preview?.images; if (!Array.isArray(images)) return;
  for (const image of images) {
    const source = image?.source; if (!source?.url) continue;
    const a = MediaAttachment.createWithUrl(decodeHtmlEntities(source.url)); a.mimeType = "image";
    if (source.width && source.height) a.aspectSize = { width: source.width, height: source.height };
    attachments.push(a);
  }
}
function addDirectMedia(item, attachments) {
  const url = decodeHtmlEntities(item.url_overridden_by_dest || item.url || ""); if (!url) return;
  const lower = url.toLowerCase(); let mime = null;
  if (/\.(jpg|jpeg)(\?|$)/.test(lower)) mime = "image/jpeg";
  else if (/\.png(\?|$)/.test(lower)) mime = "image/png";
  else if (/\.gif(\?|$)/.test(lower)) mime = "image/gif";
  else if (/\.webp(\?|$)/.test(lower)) mime = "image";
  else if (/\.mp4(\?|$)/.test(lower)) mime = "video/mp4";
  if (!mime) return;
  const a = MediaAttachment.createWithUrl(url); a.mimeType = mime;
  if (validThumbnail(item.thumbnail)) a.thumbnail = decodeHtmlEntities(item.thumbnail);
  attachments.push(a);
}
function addExternalLink(item, attachments) {
  if (item.is_self === true) return;
  const url = decodeHtmlEntities(item.url_overridden_by_dest || item.url || "");
  if (!/^https?:\/\//i.test(url) || url.indexOf("reddit.com/gallery/") >= 0 || url.indexOf("v.redd.it/") >= 0) return;
  // Skip if this URL is already a direct media attachment.
  for (const existing of attachments) {
    if (existing && existing.url === url) return;
  }
  const link = LinkAttachment.createWithUrl(url); link.title = item.title || url;
  if (item.domain) link.siteName = item.domain;
  if (validThumbnail(item.thumbnail)) link.image = decodeHtmlEntities(item.thumbnail);
  attachments.push(link);
}
function addPoll(item, attachments) {
  const poll = item?.poll_data;
  if (!poll || !Array.isArray(poll.options) || typeof PollAttachment === "undefined" || typeof PollOption === "undefined") return;
  const options = [];
  for (const option of poll.options) {
    const title = option?.text || option?.title;
    if (!title) continue;
    const votes = typeof option.vote_count === "number" ? option.vote_count : undefined;
    options.push(votes === undefined ? PollOption.create(title) : PollOption.create(title, votes));
  }
  if (!options.length) return;
  const attachment = PollAttachment.create(options);
  if (poll.voting_end_timestamp) attachment.endDate = new Date(poll.voting_end_timestamp);
  attachments.push(attachment);
}
function quotedItemForCrosspost(parent) {
  if (!parent?.permalink) return null;
  const quote = Item.createWithUriDate(absoluteRedditUrl(parent.permalink), new Date((parent.created_utc || 0) * 1000));
  quote.title = parent.title || "Crosspost";
  const body = htmlBodyForPost(parent); if (body) quote.body = body;
  const attachments = attachmentsForPost(parent, 1);
  if (attachments.length) quote.attachments = attachments;
  quote.author = identityForPost(parent);
  return quote;
}
function absoluteRedditUrl(path) { return /^https?:\/\//i.test(path || "") ? path : REDDIT_WEB + encodeURI(path || ""); }
function validThumbnail(value) { return typeof value === "string" && /^https?:\/\//i.test(value); }
function absolutizeRedditHtml(html) { return html.replace(/href="\/r\//g, 'href="https://www.reddit.com/r/').replace(/href="\/u\//g, 'href="https://www.reddit.com/u/').replace(/href="\/user\//g, 'href="https://www.reddit.com/user/'); }
function decodeHtmlEntities(value) { if (typeof value !== "string") return value; return value.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'"); }
function escapeHtml(value) { return String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;"); }
function formatNumber(value) { if (value >= 1000000) return trimDecimal(value / 1000000) + "m"; if (value >= 1000) return trimDecimal(value / 1000) + "k"; return String(value); }
function trimDecimal(value) { return String(Math.round(value * 10) / 10).replace(/\.0$/, ""); }
function clampInt(value, min, max, fallback) { const parsed = parseInt(value, 10); if (isNaN(parsed)) return fallback; return Math.max(min, Math.min(max, parsed)); }
