// Reddit Private Feed for Tapestry
// Uses Reddit's private JSON listing URLs from reddit.com/prefs/feeds.

const REDDIT_WEB = "https://www.reddit.com";
const REDDIT_ICON = "https://www.redditstatic.com/desktop2x/img/favicon/apple-icon-180x180.png";
const PAGE_SIZE = 100;

function verify() {
  const url = normalizedPrivateUrl();
  if (!url) { processError(Error("Paste the private JSON URL from Reddit's RSS feeds page.")); return; }
  requestListing(url).then((listing) => {
    if (!Array.isArray(listing?.data?.children)) throw Error("This URL did not return a Reddit listing. Copy the JSON link, not the RSS link.");
    const name = cleanFeedName();
    processVerification({ displayName: name || "Reddit Private Feed", icon: REDDIT_ICON, baseUrl: REDDIT_WEB });
  }).catch(processError);
}

function load() {
  const historyCount = clampInt(initial_history, 100, 300, 100);
  const firstLoad = getItem("reddit_private_initialized_v2") !== "1";
  const pages = firstLoad ? Math.max(1, Math.ceil(historyCount / PAGE_SIZE)) : 1;
  fetchListingPages(normalizedPrivateUrl(), pages).then((children) => {
    const results = [];
    const seen = {};
    for (const child of children) {
      const data = child?.data;
      if (!data || child?.kind === "more") continue;
      if (include_nsfw !== "on" && data.over_18 === true) continue;
      const key = data.name || data.id || data.permalink;
      if (seen[key]) continue;
      const result = itemForData(data);
      if (result) { seen[key] = true; results.push(result); }
    }
    setItem("reddit_private_initialized_v2", "1");
    processResults(results, true);
  }).catch(processError);
}

function normalizedPrivateUrl() {
  let value = (private_feed_url || "").trim();
  if (!value) return "";
  if (!/^https:\/\/(www\.)?reddit\.com\//i.test(value)) throw Error("For safety, the private feed URL must be an HTTPS reddit.com URL.");
  return value;
}

function cleanFeedName() { return (feed_name || "").trim(); }

function fetchListingPages(baseUrl, pageCount) {
  const all = [];
  function next(index, after) {
    if (index >= pageCount) return Promise.resolve(all);
    const url = listingPageUrl(baseUrl, after);
    return requestListing(url).then((listing) => {
      const children = listing?.data?.children;
      if (!Array.isArray(children)) throw Error("Unexpected Reddit private JSON response.");
      for (const child of children) all.push(child);
      const nextAfter = listing?.data?.after;
      return nextAfter ? next(index + 1, nextAfter) : all;
    });
  }
  return next(0, null);
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

function requestListing(url) {
  return sendRequest(url, "GET", null, { "Accept": "application/json" }, true).then((raw) => {
    let response = raw;
    if (typeof response === "string") response = JSON.parse(response);
    const status = response?.status ?? 200;
    const body = response?.body ?? response;
    if (status === 401 || status === 403) throw Error("Reddit rejected this private feed URL. Copy a fresh JSON URL from reddit.com/prefs/feeds. Private feed URLs can be invalidated by account/password changes.");
    if (status === 429) throw Error("Reddit rate limit reached. Try again later.");
    if (status < 200 || status >= 300) throw Error("Reddit private feed request failed with HTTP " + status + ".");
    return typeof body === "string" ? JSON.parse(body) : body;
  });
}

function itemForData(item) {
  const date = new Date((item.created_utc || 0) * 1000);
  const uri = absoluteRedditUrl(item.permalink || ("/comments/" + (item.id || "")));
  const result = Item.createWithUriDate(uri, date);
  result.title = item.title || "Reddit post";
  result.author = identityForPost(item);
  const body = htmlBodyForPost(item); if (body) result.body = body;
  const annotations = annotationsForPost(item); if (annotations.length) result.annotations = annotations;
  const attachments = attachmentsForPost(item); if (attachments.length) result.attachments = attachments;
  if (item.over_18 === true) result.contentWarning = "NSFW";
  else if (item.spoiler === true) result.contentWarning = "Spoiler";
  return result;
}

function identityForPost(item) {
  const author = item.author || "[deleted]";
  const identity = Identity.createWithName("u/" + author);
  identity.username = author;
  identity.avatar = REDDIT_ICON;
  if (author !== "[deleted]") identity.uri = REDDIT_WEB + "/user/" + encodeURIComponent(author);
  return identity;
}

function annotationsForPost(item) {
  const annotations = [];
  if (include_subreddit === "on" && item.subreddit_name_prefixed) {
    const a = Annotation.createWithText(item.subreddit_name_prefixed);
    a.uri = REDDIT_WEB + "/r/" + encodeURIComponent(item.subreddit || "");
    annotations.push(a);
  }
  if (include_flair === "on" && item.link_flair_text) annotations.push(Annotation.createWithText(item.link_flair_text));
  if (item.stickied === true) annotations.push(Annotation.createWithText("Pinned"));
  return annotations;
}

function htmlBodyForPost(item) {
  let html = "";
  if (item.selftext_html) html += absolutizeRedditHtml(decodeHtmlEntities(item.selftext_html));
  const metadata = [];
  if (typeof item.score === "number") metadata.push(formatNumber(item.score) + " points");
  if (typeof item.num_comments === "number") metadata.push(formatNumber(item.num_comments) + " comments");
  if (item.domain && !item.is_self) metadata.push(escapeHtml(item.domain));
  if (metadata.length) html += "<p><small>" + metadata.join(" · ") + "</small></p>";
  return html;
}

function attachmentsForPost(item) {
  const attachments = [];
  addRedditVideo(item, attachments);
  if (!attachments.length) addGallery(item, attachments);
  if (!attachments.length) addPreviewImages(item, attachments);
  if (!attachments.length) addDirectMedia(item, attachments);
  if (!attachments.length) addExternalLink(item, attachments);
  if (Array.isArray(item.crosspost_parent_list) && item.crosspost_parent_list.length) {
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
  const link = LinkAttachment.createWithUrl(url); link.title = item.title || url;
  if (item.domain) link.siteName = item.domain;
  if (validThumbnail(item.thumbnail)) link.image = decodeHtmlEntities(item.thumbnail);
  attachments.push(link);
}
function quotedItemForCrosspost(parent) {
  if (!parent?.permalink) return null;
  const quote = Item.createWithUriDate(absoluteRedditUrl(parent.permalink), new Date((parent.created_utc || 0) * 1000));
  quote.title = parent.title || "Crosspost"; quote.author = identityForPost(parent);
  if (parent.selftext_html) quote.body = absolutizeRedditHtml(decodeHtmlEntities(parent.selftext_html));
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
