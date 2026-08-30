// Reddit Home for Tapestry
// Authenticated Reddit home timeline using the user's own OAuth application.

const REDDIT_WEB = "https://www.reddit.com";
const REDDIT_ICON = "https://www.redditstatic.com/desktop2x/img/favicon/apple-icon-180x180.png";
const PAGE_SIZE = 100;

function verify() {
  requestJson(site + "/api/v1/me", "GET").then((me) => {
    const username = me?.name;
    if (!username) throw Error("Reddit did not return an authenticated username.");
    const identity = Identity.createWithName("u/" + username);
    identity.username = username;
    identity.uri = REDDIT_WEB + "/user/" + encodeURIComponent(username);
    identity.avatar = avatarForAccount(me) || REDDIT_ICON;
    processVerification({ displayName: "Reddit Home · u/" + username, icon: identity.avatar, accountIdentity: identity });
  }).catch(handleRequestError);
}

function load() {
  const historyCount = clampInt(initial_history, 100, 300, 100);
  const pages = Math.max(1, Math.ceil(historyCount / PAGE_SIZE));
  const firstLoad = getItem("reddit_home_initialized_v1") !== "1";
  fetchListingPages(firstLoad ? pages : 1).then((children) => {
    const results = [];
    const seen = {};
    for (const child of children) {
      const data = child?.data;
      if (!data || data.kind === "more") continue;
      if (include_nsfw !== "on" && data.over_18 === true) continue;
      const result = itemForData(data);
      const key = data.name || data.id || data.permalink;
      if (result != null && !seen[key]) { seen[key] = true; results.push(result); }
    }
    setItem("reddit_home_initialized_v1", "1");
    processResults(results, true);
  }).catch(handleRequestError);
}

function fetchListingPages(pageCount) {
  const allChildren = [];
  function next(pageIndex, after) {
    if (pageIndex >= pageCount) return Promise.resolve(allChildren);
    return requestJson(listingUrl(after), "GET").then((listing) => {
      const children = listing?.data?.children;
      if (!Array.isArray(children)) throw Error("Unexpected Reddit listing response.");
      for (const child of children) allChildren.push(child);
      const nextAfter = listing?.data?.after;
      return nextAfter ? next(pageIndex + 1, nextAfter) : allChildren;
    });
  }
  return next(0, null);
}

function listingUrl(after) {
  const sort = normalizedSort(feed_sort);
  const params = ["limit=" + PAGE_SIZE, "raw_json=1"];
  if (sort === "top") params.push("t=" + normalizedTopPeriod(top_period));
  if (after) params.push("after=" + encodeURIComponent(after));
  return site + "/" + sort + "?" + params.join("&");
}

function normalizedSort(value) {
  switch ((value || "New").toLowerCase()) {
    case "best": return "best";
    case "hot": return "hot";
    case "rising": return "rising";
    case "top": return "top";
    default: return "new";
  }
}

function normalizedTopPeriod(value) {
  switch ((value || "Day").toLowerCase()) {
    case "week": return "week";
    case "month": return "month";
    case "year": return "year";
    case "all": return "all";
    default: return "day";
  }
}

function requestJson(url, method) {
  return sendRequest(url, method || "GET", null, { "Accept": "application/json" }, true).then((rawResponse) => {
    let response = rawResponse;
    if (typeof response === "string") response = JSON.parse(response);
    const status = response?.status ?? 200;
    const body = response?.body ?? response;
    if (status === 401) { const error = Error("Reddit authorization expired or was revoked."); error.reauthorize = true; throw error; }
    if (status === 403) throw Error("Reddit denied API access. Confirm that your Reddit application has Data API access and the redirect URI is correct.");
    if (status === 429) throw Error("Reddit rate limit reached. Try again after Reddit's reset interval.");
    if (status < 200 || status >= 300) throw Error("Reddit request failed with HTTP " + status + ".");
    return typeof body === "string" ? JSON.parse(body) : body;
  });
}

function handleRequestError(error) {
  if (error?.reauthorize === true) { raiseCondition("authorize", error.message); return; }
  processError(error);
}

function itemForData(item) {
  const date = new Date((item.created_utc || 0) * 1000);
  const uri = REDDIT_WEB + encodeURI(item.permalink || ("/comments/" + (item.id || "")));
  const result = Item.createWithUriDate(uri, date);
  result.title = item.title || "Reddit post";
  result.author = identityForPost(item);
  const body = htmlBodyForPost(item); if (body) result.body = body;
  const annotations = annotationsForPost(item); if (annotations.length > 0) result.annotations = annotations;
  const attachments = attachmentsForPost(item); if (attachments.length > 0) result.attachments = attachments;
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
    const annotation = Annotation.createWithText(item.subreddit_name_prefixed);
    annotation.uri = REDDIT_WEB + "/r/" + encodeURIComponent(item.subreddit || "");
    annotations.push(annotation);
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
  if (metadata.length > 0) html += "<p><small>" + metadata.join(" · ") + "</small></p>";
  return html;
}

function attachmentsForPost(item) {
  const attachments = [];
  addRedditVideo(item, attachments);
  if (attachments.length === 0) addGallery(item, attachments);
  if (attachments.length === 0) addPreviewImages(item, attachments);
  if (attachments.length === 0) addDirectMedia(item, attachments);
  if (attachments.length === 0) addExternalLink(item, attachments);
  if (Array.isArray(item.crosspost_parent_list) && item.crosspost_parent_list.length > 0) {
    const parent = quotedItemForCrosspost(item.crosspost_parent_list[0]);
    if (parent != null) attachments.push(parent);
  }
  return attachments;
}

function addRedditVideo(item, attachments) {
  const video = item?.secure_media?.reddit_video || item?.media?.reddit_video;
  if (!video) return;
  const url = video.hls_url || video.fallback_url; if (!url) return;
  const attachment = MediaAttachment.createWithUrl(decodeHtmlEntities(url));
  attachment.mimeType = "video/mp4";
  if (validThumbnail(item.thumbnail)) attachment.thumbnail = decodeHtmlEntities(item.thumbnail);
  if (video.width && video.height) attachment.aspectSize = { width: video.width, height: video.height };
  attachments.push(attachment);
}

function addGallery(item, attachments) {
  const galleryItems = item?.gallery_data?.items;
  const metadata = item?.media_metadata;
  if (!Array.isArray(galleryItems) || !metadata) return;
  for (const galleryItem of galleryItems) {
    const media = metadata[galleryItem.media_id]; const source = media?.s; const url = source?.u || source?.gif;
    if (!url || media?.status === "failed") continue;
    const attachment = MediaAttachment.createWithUrl(decodeHtmlEntities(url));
    attachment.mimeType = media?.m || (source.gif ? "image/gif" : "image");
    if (source.x && source.y) attachment.aspectSize = { width: source.x, height: source.y };
    attachments.push(attachment);
  }
}

function addPreviewImages(item, attachments) {
  const images = item?.preview?.images; if (!Array.isArray(images)) return;
  for (const image of images) {
    const source = image?.source; if (!source?.url) continue;
    const attachment = MediaAttachment.createWithUrl(decodeHtmlEntities(source.url));
    attachment.mimeType = "image";
    if (source.width && source.height) attachment.aspectSize = { width: source.width, height: source.height };
    attachments.push(attachment);
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
  const attachment = MediaAttachment.createWithUrl(url); attachment.mimeType = mime;
  if (validThumbnail(item.thumbnail)) attachment.thumbnail = decodeHtmlEntities(item.thumbnail);
  attachments.push(attachment);
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
  const quote = Item.createWithUriDate(REDDIT_WEB + encodeURI(parent.permalink), new Date((parent.created_utc || 0) * 1000));
  quote.title = parent.title || "Crosspost"; quote.author = identityForPost(parent);
  const body = parent.selftext_html ? absolutizeRedditHtml(decodeHtmlEntities(parent.selftext_html)) : "";
  if (body) quote.body = body;
  return quote;
}

function avatarForAccount(me) {
  const candidates = [me?.snoovatar_img, me?.icon_img];
  for (const candidate of candidates) if (candidate) return decodeHtmlEntities(candidate);
  return null;
}
function validThumbnail(value) { return typeof value === "string" && /^https?:\/\//i.test(value); }
function absolutizeRedditHtml(html) { return html.replace(/href="\/r\//g, 'href="https://www.reddit.com/r/').replace(/href="\/u\//g, 'href="https://www.reddit.com/u/').replace(/href="\/user\//g, 'href="https://www.reddit.com/user/'); }
function decodeHtmlEntities(value) { if (typeof value !== "string") return value; return value.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'"); }
function escapeHtml(value) { return String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;"); }
function formatNumber(value) { if (value >= 1000000) return trimDecimal(value / 1000000) + "m"; if (value >= 1000) return trimDecimal(value / 1000) + "k"; return String(value); }
function trimDecimal(value) { return String(Math.round(value * 10) / 10).replace(/\.0$/, ""); }
function clampInt(value, min, max, fallback) { const parsed = parseInt(value, 10); if (isNaN(parsed)) return fallback; return Math.max(min, Math.min(max, parsed)); }
