// ====== API & State ======
const API_KEY = "AIzaSyCPDlag6QtisfqZe-yEjb8zOiS7dMGNqpk";
const BASE_URL = "https://www.googleapis.com/youtube/v3";
let savedVideos = [];
let currentlyPlayingVideo = null;
let currentVideoId = null;
let currentVideoSnippet = null;

let nextPageTokenGrid = "";
let nextPageTokenSidebar = "";
let currentSearchQuery = "trending";

// ==== NEW COUNTERS ====
let gridVideoCount = 0;
let sidebarVideoCount = 0;
const MAX_VIDEOS = 100; // limit

// Loading guards
let isLoadingGrid = false;
let isLoadingSidebar = false;

// ===== Navigation history stack =====
let navHistory = []; // holds { section: 'home'|'shorts'|'video', data: {...} }

// ===== DOM Elements =====
const searchInput = document.getElementById("searchInput");
const searchBtn = document.getElementById("searchBtn");
const videoGrid = document.getElementById("videoGrid");
const videoPage = document.querySelector(".video-page");
const videoPlayer = document.getElementById("videoPlayer");
const videoTitle = document.getElementById("videoTitle");
const videoDesc = document.getElementById("videoDesc");
const sidebarVideos = document.getElementById("sidebarVideos");
const channelLogo = document.getElementById("channelLogo");
const channelName = document.getElementById("channelName");
const channelSubs = document.getElementById("channelSubs");
const subscribeBtn = document.getElementById("subscribeBtn");
const likeBtn = document.getElementById("likeBtn");
const dislikeBtn = document.getElementById("dislikeBtn");
const shareBtn = document.getElementById("shareBtn");
const saveBtn = document.getElementById("saveBtn");
const chips = document.querySelectorAll(".chip");
const themeToggle = document.getElementById("themeToggle");
const menuBtn = document.getElementById("menuBtn");
const sidebarMenu = document.getElementById("sidebarMenu");
const micBtn = document.getElementById("micBtn");
const sidebarToggle = document.getElementById("sidebarToggle");

const loader = document.getElementById("loader");

function showLoader() { if (loader) loader.style.display = "block"; }
function hideLoader() { if (loader) loader.style.display = "none"; }

// ===== Default Dark Mode =====
document.body.classList.add("dark");

// ===== Theme Toggle =====
if (themeToggle) themeToggle.addEventListener("click", () => document.body.classList.toggle("dark"));

// ===== Sidebar Toggle =====
if (menuBtn) menuBtn.addEventListener("click", () => {
    if (sidebarMenu) sidebarMenu.classList.add("active");
    if (sidebarToggle) sidebarToggle.style.display = "block";
});
if (sidebarToggle) sidebarToggle.addEventListener("click", () => {
    if (sidebarMenu) sidebarMenu.classList.remove("active");
    sidebarToggle.style.display = "none";
});

// ===== Mic Voice Search =====
if (micBtn) micBtn.addEventListener("click", () => {
    if (!("webkitSpeechRecognition" in window)) return alert("Voice search not supported!");
    const recognition = new webkitSpeechRecognition();
    recognition.lang = "en-US";
    recognition.start();
    recognition.onresult = (event) => {
        searchInput.value = event.results[0][0].transcript;
        searchVideos(searchInput.value);
    };
});

// ===== Chips Filter =====
chips.forEach(chip => {
    chip.addEventListener("click", () => {
        chips.forEach(c => c.classList.remove("active"));
        chip.classList.add("active");
        searchVideos(chip.dataset.q);
    });
});

// ===== Search Videos (button + Enter) =====
if (searchBtn) searchBtn.addEventListener("click", () => searchVideos(searchInput.value || "trending"));
if (searchInput) searchInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") searchVideos(searchInput.value || "trending");
});

// ===== Helper: toast (non-blocking info) =====
function toast(msg, duration = 2000) {
    const el = document.createElement("div");
    el.textContent = msg;
    el.style.cssText = `
        position: fixed; left: 50%; transform: translateX(-50%);
        bottom: 60px; background: rgba(0,0,0,.8); color: #fff;
        padding: 8px 12px; border-radius: 6px; font-size: 13px; z-index: 260;
    `;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), duration);
}

// ===== API helper with basic error handling =====
async function safeFetch(url) {
    try {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return await res.json();
    } catch (err) {
        console.error("Fetch failed:", err);
        toast("Network error. Please try again.");
        return null;
    }
}

// ===== Duration parser: ISO 8601 -> seconds =====
function parseDuration(iso) {
    if (!iso) return 0;
    const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
    if (!m) return 0;
    const hours = parseInt(m[1] || "0", 10);
    const mins = parseInt(m[2] || "0", 10);
    const secs = parseInt(m[3] || "0", 10);
    return hours * 3600 + mins * 60 + secs;
}

// ---------------------- BACK BUTTON: create/integrate ----------------------
// Navigation history stack
navHistory = [];

// Back button element
const backBtn = document.getElementById("backBtn");
if (backBtn) {
  backBtn.addEventListener("click", () => {
    goBack();
  });
}

// Show/Hide back button
function toggleBackBtn() {
  if (!backBtn) return;
  backBtn.style.display = navHistory.length > 0 ? "inline-block" : "none";
}

// ===================== VIDEO OPEN =====================
function openVideo(videoId) {
  // Save current state (grid or shorts)
  const gridEl = document.querySelector(".grid");
  const shortsEl = document.querySelector(".shorts-container");
  if (gridEl && getComputedStyle(gridEl).display !== "none") {
    navHistory.push("home");
  } else if (shortsEl && getComputedStyle(shortsEl).display !== "none") {
    navHistory.push("shorts");
  }

  // Show video page
  const grid = document.querySelector(".grid");
  if (grid) grid.style.display = "none";
  if (shortsEl) shortsEl.style.display = "none";
  if (videoPage) videoPage.style.display = "flex";

  toggleBackBtn(); // show back only for video

  // Load player
  if (videoPlayer) videoPlayer.src = `https://www.youtube.com/embed/${videoId}?autoplay=1`;
}

// ===================== SHORTS OPEN =====================
function openShorts() {
  // Don’t push anything → no back button for shorts
  navHistory = []; // clear history

  // Show shorts, hide others
  const grid = document.querySelector(".grid");
  if (grid) grid.style.display = "none";
  if (videoPage) videoPage.style.display = "none";
  const shorts = document.querySelector(".shorts-container");
  if (shorts) shorts.style.display = "block";

  toggleBackBtn(); // will hide
}

// ===================== HOME OPEN =====================
function openHome() {
  navHistory = []; // reset history

  const grid = document.querySelector(".grid");
  if (grid) grid.style.display = "grid";
  if (videoPage) videoPage.style.display = "none";
  const shorts = document.querySelector(".shorts-container");
  if (shorts) shorts.style.display = "none";

  toggleBackBtn(); // hides back btn
}

// ===================== BACK =====================
function goBack() {
  if (!navHistory || navHistory.length === 0) {
    // if nothing, show home
    showHomeGrid(false);
    return;
  }
  const prev = navHistory.pop();

  if (videoPage) videoPage.style.display = "none";
  const shorts = document.querySelector(".shorts-container");
  if (shorts) shorts.style.display = "none";
  const grid = document.querySelector(".grid");
  if (grid) grid.style.display = "none";

  if (prev === "home") {
    if (grid) grid.style.display = "grid";
  } else if (prev === "shorts") {
    if (shorts) shorts.style.display = "block";
  }

  toggleBackBtn();
}

// ===================== SIDEBAR MENU HOOKS =====================
// Home button
const homeMenu = document.querySelector('[data-section="home"]');
if (homeMenu) homeMenu.addEventListener("click", () => {
  openHome();
});

// Shorts button
const shortsMenu = document.querySelector('[data-section="shorts"]');
if (shortsMenu) shortsMenu.addEventListener("click", () => {
  openShorts();
});

// ===================== INIT =====================
toggleBackBtn();


// ---------------------- END BACK BUTTON ----------------------


// ===== pushCurrentState: save visible state onto navHistory =====
function pushCurrentState() {
    // Determine current visible section
    const shortsContainer = document.querySelector(".shorts-container");
    const isGridVisible = videoGrid && getComputedStyle(videoGrid).display !== "none";
    const isVideoVisible = videoPage && getComputedStyle(videoPage).display !== "none";
    const isShortsVisible = shortsContainer && getComputedStyle(shortsContainer).display !== "none";

    if (isVideoVisible && currentVideoId) {
        // store video id and snippet if available
        navHistory.push({ section: "video", data: { videoId: currentVideoId, snippet: currentVideoSnippet } });
    } else if (isShortsVisible) {
        navHistory.push({ section: "shorts", data: null });
    } else if (isGridVisible) {
        navHistory.push({ section: "home", data: null });
    }
    // update back button visible state
    toggleBackBtn();
}

// goBack: pop last state and navigate to it (history object-form)
function goBack() {
    if (!navHistory || navHistory.length === 0) {
        showHomeGrid(false);
        return;
    }
    const prev = navHistory.pop();
    toggleBackBtn();

    if (!prev) {
        showHomeGrid(false);
        return;
    }

    if (prev.section === "home") {
        showHomeGrid(false);
    } else if (prev.section === "shorts") {
        showShorts(false); // skipPush true
    } else if (prev.section === "video") {
        openVideoPage(prev.data.videoId, prev.data.snippet, true);
    }
}


// helper: show home grid (optionally skipPush when navigating via history)
function showHomeGrid(skipPush = true) {
    hideAllSections();
    const chipsWrap = document.querySelector(".chips");
    if (chipsWrap) chipsWrap.style.display = "flex";
    if (videoGrid) videoGrid.style.display = "grid";
    // stop any playing content
    stopCurrentlyPlaying();
    currentVideoId = null;
    currentVideoSnippet = null;
    toggleBackBtn();
}


// ===== Grid helpers (views, time-ago, duration) =====
function formatViews(n) {
  n = Number(n || 0);
  if (n < 1_000) return n.toString();
  if (n < 1_000_000) return (n/1_000).toFixed(n%1000 ? 1 : 0).replace(/\.0$/,'') + "K";
  if (n < 1_000_000_000) return (n/1_000_000).toFixed(n%1_000_000 ? 1 : 0).replace(/\.0$/,'') + "M";
  return (n/1_000_000_000).toFixed(n%1_000_000_000 ? 1 : 0).replace(/\.0$/,'') + "B";
}
function timeAgo(iso) {
  if (!iso) return "";
  const s = Math.max(1, (Date.now() - new Date(iso).getTime())/1000);
  const u = [[31536000,"year"],[2592000,"month"],[604800,"week"],[86400,"day"],[3600,"hour"],[60,"minute"]];
  for (const [sec,label] of u) if (s >= sec) {
    const v = Math.floor(s/sec); return `${v} ${label}${v>1?"s":""} ago`;
  }
  return "just now";
}
function formatISODuration(iso) {
  // PT#H#M#S -> 00:00 / 0:00:00 etc.
  if (!iso) return "0:00";
  const m = iso?.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  let h = +(m?.[1]||0), mi = +(m?.[2]||0), se = +(m?.[3]||0);
  const pad = x => String(x).padStart(2,"0");
  return h ? `${h}:${pad(mi)}:${pad(se)}` : `${mi}:${pad(se)}`;
}
// ===== Search / Trending Videos (Global) with Infinite Scroll =====

const TRENDING_REGIONS = ["US","IN","GB","CA","AU","JP","DE","FR","BR","RU","KR"]; // can add more
let currentRegionIndex = 0;

async function searchVideos(query, append = false) {
  if (!append) {
    hideAllSections();
    videoGrid && (videoGrid.style.display = "grid");
    const chipsWrap = document.querySelector(".chips");
    chipsWrap && (chipsWrap.style.display = "flex");

    nextPageTokenGrid = {};
    currentRegionIndex = 0;
    videoGrid.innerHTML = "";
    gridVideoCount = 0;
    currentSearchQuery = query;
    toggleBackBtn();
    window.scrollTo({ top: 0, behavior: "instant" });
  }

  if (gridVideoCount >= MAX_VIDEOS || isLoadingGrid) return;
  isLoadingGrid = true;
  showLoader();

  let videosData = [];

  if (query.toLowerCase() === "trending") {
    // Loop over regions one by one until we reach enough videos
    while (videosData.length < 12 && currentRegionIndex < TRENDING_REGIONS.length) {
      const region = TRENDING_REGIONS[currentRegionIndex];
      const pageToken = nextPageTokenGrid[region] || "";
      const url = `${BASE_URL}/videos?part=snippet,contentDetails,statistics&chart=mostPopular&regionCode=${region}&maxResults=12${pageToken ? `&pageToken=${pageToken}` : ""}&key=${API_KEY}`;
      const data = await safeFetch(url);

      if (data?.items?.length) {
        // Filter long-form ≥2min and ≥1M views
        const longForm = data.items.filter(v => parseDuration(v.contentDetails?.duration) >= 120);
        const trendingVideos = longForm.filter(v => parseInt(v.statistics?.viewCount || 0, 10) >= 1_000_000);
        videosData = videosData.concat(trendingVideos.length ? trendingVideos : longForm);
      }

      nextPageTokenGrid[region] = data?.nextPageToken || "";
      if (!nextPageTokenGrid[region]) currentRegionIndex++; // move to next region
    }
  } else {
    // Regular search query
    const pageToken = nextPageTokenGrid["search"] || "";
    const searchUrl = `${BASE_URL}/search?part=snippet&type=video&q=${encodeURIComponent(query)}&maxResults=12${pageToken ? `&pageToken=${pageToken}` : ""}&key=${API_KEY}`;
    const searchData = await safeFetch(searchUrl);
    const ids = searchData?.items?.map(it => it.id?.videoId).filter(Boolean).join(",");
    if (ids) {
      const detailsUrl = `${BASE_URL}/videos?part=snippet,contentDetails,statistics&id=${ids}&key=${API_KEY}`;
      const detailsData = await safeFetch(detailsUrl);
      videosData = detailsData?.items || [];
      nextPageTokenGrid["search"] = searchData?.nextPageToken || "";
    }
  }

  hideLoader();
  isLoadingGrid = false;
  if (!videosData.length) return;

  // Filter out shorts (<2 minutes) for search results
  const longForm = videosData.filter(v => parseDuration(v.contentDetails?.duration) >= 120);

  // Fetch channel avatars
  const channelIds = [...new Set(longForm.map(v => v.snippet?.channelId).filter(Boolean))];
  let channelMap = new Map();
  if (channelIds.length) {
    const chunk = channelIds.slice(0, 50).join(",");
    const chUrl = `${BASE_URL}/channels?part=snippet&id=${chunk}&key=${API_KEY}`;
    const chData = await safeFetch(chUrl);
    (chData?.items || []).forEach(c => {
      channelMap.set(c.id, c.snippet?.thumbnails?.default?.url || "");
    });
  }

  renderVideos(longForm, append, channelMap);
  gridVideoCount += longForm.length;

  if (gridVideoCount >= MAX_VIDEOS) {
    const endMsg = document.createElement("p");
    endMsg.style.textAlign = "center";
    endMsg.style.color = "gray";
    endMsg.style.padding = "10px 0 20px";
    endMsg.textContent = "No more videos to load.";
    videoGrid.appendChild(endMsg);
  }
}

// ===== Infinite Scroll Listener =====
window.addEventListener("scroll", () => {
  if (isLoadingGrid || gridVideoCount >= MAX_VIDEOS) return;
  if (window.innerHeight + window.scrollY >= document.body.offsetHeight - 200) {
    searchVideos(currentSearchQuery, true);
  }
});


// ===== Render Video Grid (template-clone + fallback) =====
function renderVideos(videos, append = false, channelMap = new Map()) {
  if (!videoGrid) return;
  if (!append) videoGrid.innerHTML = "";

  // Template element (if present)
  const tpl = document.getElementById("videoCardTemplate");

  for (const v of videos) {
    if (gridVideoCount >= MAX_VIDEOS) break;
    gridVideoCount++;

    // Video id (details response returns id string)
    const vid = (typeof v.id === "string") ? v.id : (v.id?.videoId || v.id?.kind ? v.id : (v.id || ""));
    const thumb = v.snippet?.thumbnails?.high?.url || v.snippet?.thumbnails?.medium?.url || "";
    const title = v.snippet?.title || "Untitled";
    const channelTitle = v.snippet?.channelTitle || "";
    const channelAvatar = channelMap.get(v.snippet?.channelId) || "";
    const views = formatViews(v.statistics?.viewCount);
    const ago = timeAgo(v.snippet?.publishedAt);
    const duration = formatISODuration(v.contentDetails?.duration || "PT0M0S");

    if (tpl && tpl.content) {
      // Use template cloning
      const clone = tpl.content.cloneNode(true);
      // Thumbnail img
      const thumbImg = clone.querySelector(".thumbnail img");
      if (thumbImg) {
        thumbImg.src = thumb;
        thumbImg.alt = title;
      }
      // duration
      const durEl = clone.querySelector(".thumbnail .duration");
      if (durEl) durEl.textContent = duration;

      // channel logo (two possibilities: <img> inside .channel-logo or .channel-logo img)
      const channelLogoImg = clone.querySelector(".channel-logo img");
      if (channelLogoImg) {
        channelLogoImg.src = channelAvatar || "";
        channelLogoImg.alt = channelTitle;
      } else {
        const chWrapImg = clone.querySelector(".channel-logo");
        if (chWrapImg && channelAvatar) chWrapImg.style.backgroundImage = `url(${channelAvatar})`;
      }

      // title, channel-name, stats
      const titleEl = clone.querySelector(".title");
      if (titleEl) titleEl.textContent = title;
      const chNameEl = clone.querySelector(".channel-name");
      if (chNameEl) chNameEl.textContent = channelTitle;
      const statsEl = clone.querySelector(".stats");
      if (statsEl) statsEl.textContent = `${views} views • ${ago}`;

      // menu - leave as-is

      // Wrap in a card container so click area is consistent
      const wrapper = document.createElement("div");
      wrapper.className = "video-card-wrapper"; // wrapper to attach click listener
      wrapper.appendChild(clone);

      wrapper.addEventListener("click", (ev) => {
        // avoid click when menu clicked
        let el = ev.target;
        if (el.closest && el.closest(".menu")) return;
        pushCurrentState();
        stopCurrentlyPlaying();
        openVideoPage(vid, v.snippet, false);
      });

      // If the template's top-level was a .video-card, we may want to append the first child
      // But wrapper already holds nodes; append wrapper's children to grid
      videoGrid.appendChild(wrapper);
    } else {
      // Fallback: build via innerHTML (keeps old behaviour)
      const card = document.createElement("div");
      card.className = "video-card";
      card.innerHTML = `
        <div class="thumbnail">
          <img src="${thumb}" alt="${title.replace(/"/g,'&quot;')}">
          <span class="duration">${duration}</span>
        </div>
        <div class="video-info">
          <div class="channel-logo"><img src="${channelAvatar}" alt="${channelTitle}"></div>
          <div class="meta">
            <h3 class="title">${title}</h3>
            <p class="channel-name">${channelTitle}</p>
            <p class="stats">${views} views • ${ago}</p>
          </div>
          <div class="menu">⋮</div>
        </div>
      `;
      card.addEventListener("click", (ev) => {
        if (ev.target.closest && ev.target.closest(".menu")) return;
        pushCurrentState();
        stopCurrentlyPlaying();
        openVideoPage(vid, v.snippet, false);
      });
      videoGrid.appendChild(card);
    }
  }

  if (gridVideoCount >= MAX_VIDEOS) {
    const endMsg = document.createElement("p");
    endMsg.style.textAlign = "center";
    endMsg.style.color = "gray";
    endMsg.style.padding = "10px 0 20px";
    endMsg.textContent = "No more videos to load.";
    videoGrid.appendChild(endMsg);
    nextPageTokenGrid = "";
  }
}


// ===== Infinite Scroll Main Grid (WINDOW SCROLL) =====
function nearBottom(offset = 200) {
    return window.innerHeight + window.scrollY >= document.body.offsetHeight - offset;
}

let scrollTick = false;
window.addEventListener("scroll", async () => {
    if (scrollTick) return; // simple rAF throttle
    scrollTick = true;
    requestAnimationFrame(async () => {
        // Only try if we are showing the grid (not the watch page)
        if (videoGrid && getComputedStyle(videoGrid).display !== "none") {
            if (!isLoadingGrid && nextPageTokenGrid && gridVideoCount < MAX_VIDEOS && nearBottom(220)) {
                await searchVideos(currentSearchQuery, true);
            }
        }
        scrollTick = false;
    });
}, { passive: true });

// ===== Stop Previous Video =====
function stopCurrentlyPlaying() {
    if (currentlyPlayingVideo) {
        try {
            const tag = (currentlyPlayingVideo.tagName || "").toLowerCase();
            if (tag === "video") {
                try {
                    currentlyPlayingVideo.pause();
                    currentlyPlayingVideo.currentTime = 0;
                } catch (_) {}
            } else if (tag === "iframe") {
                try {
                    // attempt postMessage pause
                    currentlyPlayingVideo.contentWindow.postMessage('{"event":"command","func":"pauseVideo","args":""}', '*');
                } catch (e) {
                    // ignore
                }
                // also remove autoplay param to stop immediate restart
                try {
                    const src = new URL(currentlyPlayingVideo.src);
                    src.searchParams.delete("autoplay");
                    currentlyPlayingVideo.src = src.toString();
                } catch (e) { /* ignore */ }
            }
        } catch (_) { /* no-op */ }
    }
    currentlyPlayingVideo = null;
}

// ===== Fetch Channel Info =====
async function fetchChannelInfo(channelId) {
    const url = `${BASE_URL}/channels?part=snippet,statistics&id=${channelId}&key=${API_KEY}`;
    const data = await safeFetch(url);
    return data?.items?.[0];
}

// ===== Open Video Page =====
// skipPush true => do not push current state (used when navigating via history)
async function openVideoPage(videoId, snippet, skipPush = false) {
    if (!skipPush) {
        // push previous state so Back can return here
        pushCurrentState();
    }

    hideAllSections();
    if (videoPage) videoPage.style.display = "flex";

    stopCurrentlyPlaying();

    // Enable JS API & autoplay
    if (videoPlayer) {
        videoPlayer.src = `https://www.youtube.com/embed/${videoId}?autoplay=1&enablejsapi=1`;
        currentlyPlayingVideo = videoPlayer;
    }

    // set current video tracking
    currentVideoId = videoId;
    currentVideoSnippet = snippet;

    // show back button because we're on video page
    toggleBackBtn();

    if (videoTitle) videoTitle.textContent = snippet.title || "";

    const url = `${BASE_URL}/videos?part=statistics,snippet&id=${videoId}&key=${API_KEY}`;
    showLoader();
    const data = await safeFetch(url);
    hideLoader();
    if (!data || !data.items || !data.items[0]) return;

    const videoData = data.items[0];
    const stats = videoData.statistics || {};
    const categoryId = videoData.snippet?.categoryId;

    // Full Description
    const descText = videoData.snippet?.description || "No description available.";
    if (videoDesc) videoDesc.textContent = descText.length > 200 ? descText.substring(0, 200) + "..." : descText;
    if (descText.length > 200 && videoDesc) {
        const moreBtn = document.createElement("span");
        moreBtn.textContent = " More";
        moreBtn.className = "more-btn";
        moreBtn.style.cursor = "pointer";
        moreBtn.addEventListener("click", () => {
            if (moreBtn.textContent.trim() === "More") {
                videoDesc.textContent = descText;
                moreBtn.textContent = " Less";
            } else {
                videoDesc.textContent = descText.substring(0, 200) + "...";
                moreBtn.textContent = " More";
            }
            videoDesc.appendChild(moreBtn);
        });
        videoDesc.appendChild(moreBtn);
    }

    // Stats & Buttons
    if (likeBtn) likeBtn.textContent = `👍 Like (${stats.likeCount ? Number(stats.likeCount).toLocaleString() : 0})`;
    if (dislikeBtn) dislikeBtn.textContent = `👎 Dislike (${stats.dislikeCount ? Number(stats.dislikeCount).toLocaleString() : 0})`;
    if (likeBtn) likeBtn.onclick = () => alert(`Liked ${videoTitle.textContent}`);
    if (dislikeBtn) dislikeBtn.onclick = () => alert(`Disliked ${videoTitle.textContent}`);
    if (shareBtn) shareBtn.onclick = () => {
        navigator.clipboard.writeText(`https://www.youtube.com/watch?v=${videoId}`);
        alert("Video URL copied!");
    };
    if (saveBtn) saveBtn.onclick = () => {
        savedVideos.push({ id: videoId, title: snippet.title });
        alert("Video saved!");
    };

    // Channel Info
    const channelData = await fetchChannelInfo(snippet.channelId);
    if (channelData) {
        if (channelLogo) channelLogo.src = channelData.snippet?.thumbnails?.default?.url || "";
        if (channelName) channelName.textContent = channelData.snippet?.title || "";
        const subs = Number(channelData.statistics?.subscriberCount || 0);
        if (channelSubs) channelSubs.textContent = `${subs.toLocaleString()} subscribers`;
    }
    if (subscribeBtn) subscribeBtn.onclick = () => alert(`Subscribed to ${channelName.textContent}`);

    // Sidebar Related Videos
    renderSidebar(categoryId, videoId);
}

// ===== Sidebar Infinite Scroll by Category =====
// Now filters out shorts (< 2 minutes) same as main grid
async function renderSidebar(categoryId, excludeVideoId) {
    if (!sidebarVideos) return;
    sidebarVideos.innerHTML = "<p style='padding:10px;color:gray;'>Loading related videos...</p>";
    nextPageTokenSidebar = "";
    sidebarVideoCount = 0;

    async function loadVideos(fallback = false) {
        if (sidebarVideoCount >= MAX_VIDEOS) return;
        if (isLoadingSidebar) return;

        let url;
        if (!fallback) {
            url = `${BASE_URL}/search?part=snippet&type=video&videoCategoryId=${categoryId}&maxResults=12${nextPageTokenSidebar ? "&pageToken=" + nextPageTokenSidebar : ""}&key=${API_KEY}`;
        } else {
            url = `${BASE_URL}/search?part=snippet&type=video&q=trending&maxResults=12${nextPageTokenSidebar ? "&pageToken=" + nextPageTokenSidebar : ""}&key=${API_KEY}`;
        }

        isLoadingSidebar = true;
        showLoader();
        const searchData = await safeFetch(url);
        hideLoader();
        isLoadingSidebar = false;

        if (!searchData || !searchData.items || searchData.items.length === 0) {
            if (!fallback) return loadVideos(true);
            sidebarVideos.innerHTML = "<p style='padding:10px;color:gray;'>No related videos found.</p>";
            return;
        }

        nextPageTokenSidebar = searchData.nextPageToken || "";

        // build id list
        const ids = searchData.items.map(it => it.id?.videoId).filter(Boolean).join(",");
        if (!ids) return;

        // fetch details
        const detailsUrl = `${BASE_URL}/videos?part=snippet,contentDetails,statistics&id=${ids}&key=${API_KEY}`;
        const detailsData = await safeFetch(detailsUrl);
        if (!detailsData || !detailsData.items) return;

        // filter by duration >= 120s
        const filtered = detailsData.items.filter(item => {
            const dur = parseDuration(item.contentDetails?.duration);
            return dur >= 120;
        });

        if (sidebarVideos.innerHTML.includes("Loading")) sidebarVideos.innerHTML = "";

        filtered.forEach(v => {
            if (sidebarVideoCount >= MAX_VIDEOS) return;
            if (v.id === excludeVideoId) return;

            sidebarVideoCount++;

            const card = document.createElement("div");
            card.className = "sidebar-video-card";
            card.innerHTML = `
                <img src="${v.snippet?.thumbnails?.medium?.url || ""}" alt="Thumbnail">
                <div class="sidebar-video-info">
                    <h4>${v.snippet?.title || "Untitled"}</h4>
                    <p>${v.snippet?.channelTitle || ""}</p>
                </div>`;
            card.addEventListener("click", () => {
                // push current state so Back can return to this watch page
                pushCurrentState();
                stopCurrentlyPlaying();
                openVideoPage(v.id, v.snippet, false);
            });
            sidebarVideos.appendChild(card);
        });

        if (sidebarVideoCount >= MAX_VIDEOS) {
            const endMsg = document.createElement("p");
            endMsg.style.textAlign = "center";
            endMsg.style.color = "gray";
            endMsg.textContent = "No more related videos.";
            sidebarVideos.appendChild(endMsg);
            nextPageTokenSidebar = "";
        }
    }

    await loadVideos();

    // Sidebar has its own scroll (overflow-y:auto in your CSS), so keep element-level listener.
    sidebarVideos.addEventListener("scroll", async () => {
        const nearEdge = sidebarVideos.scrollTop + sidebarVideos.clientHeight >= sidebarVideos.scrollHeight - 50;
        if (nearEdge && nextPageTokenSidebar && !isLoadingSidebar) {
            await loadVideos();
        }
    }, { passive:true });
}

// ===== Helper: Hide All Sections =====
function hideAllSections() {
    if (videoGrid) videoGrid.style.display = "none";
    if (videoPage) videoPage.style.display = "none";
    const shortsContainer = document.querySelector(".shorts-container");
    if (shortsContainer) shortsContainer.style.display = "none";
}

/* ===========================
   NAV: HOME & SHORTS HANDLERS
   =========================== */

// Make sidebar menu items navigate between grid and shorts
document.querySelectorAll(".sidebar .menu-item").forEach(item => {
    item.addEventListener("click", () => {
        // active state
        document.querySelectorAll(".sidebar .menu-item").forEach(i => i.classList.remove("active"));
        item.classList.add("active");

        // close sidebar if opened (mobile feel)
        if (sidebarMenu) sidebarMenu.classList.remove("active");
        if (sidebarToggle) sidebarToggle.style.display = "none";

        const section = item.dataset.section;
        if (section === "home") {
            // Show grid + chips
            hideAllSections();
            const chipsWrap = document.querySelector(".chips");
            if (chipsWrap) chipsWrap.style.display = "flex";
            if (videoGrid) videoGrid.style.display = "grid";

            // hide back button on home (we don't change navHistory here)
            toggleBackBtn();

            // If grid empty, fetch; otherwise leave as-is
            if (!videoGrid.hasChildNodes()) {
                nextPageTokenGrid = "";
                gridVideoCount = 0;
                searchVideos("trending");
            } else {
                window.scrollTo({ top: 0, behavior: "smooth" });
            }
        } else if (section === "shorts") {
            // Show shorts feed
            hideAllSections();
            const chipsWrap = document.querySelector(".chips");
            if (chipsWrap) chipsWrap.style.display = "none";
            // push current state so back can return here
            pushCurrentState();
            showShorts(false);
        }
    });
});

/*  SHORTS SECTION */
async function showShorts(skipPush = true) {
    if (!skipPush) pushCurrentState();

    let container = document.querySelector(".shorts-container");
    if (!container) {
        container = document.createElement("div");
        container.className = "shorts-container";
        const ctn = document.querySelector(".container") || document.body;
        ctn.appendChild(container);
    }

    container.innerHTML = `<p style="padding:10px;color:gray;">Loading Shorts...</p>`;
    container.style.display = "flex";
    stopCurrentlyPlaying(); // stop any playing grid/watch video

    // fetch first batch
    await fetchShorts(container, false);

    // attach scroll for infinite loading if not already attached
    if (!container.dataset.scrollListenerAttached) {
        container.addEventListener("scroll", async () => {
            if (container.scrollTop + container.clientHeight >= container.scrollHeight - 200) {
                await fetchShorts(container, true);
            }
        });
        container.dataset.scrollListenerAttached = "true";
    }
}

// ===========================
async function fetchShorts(container, append = false) {
    if (!append) container.innerHTML = ""; // clear first load
    showLoader();

    const regions = ["US","IN","GB","CA","AU","JP","DE","FR","BR","RU","KR"];
    let allShorts = [];
    let nextPageTokens = container.dataset.nextPageTokens ? JSON.parse(container.dataset.nextPageTokens) : {};

    for (const region of regions) {
        try {
            const token = nextPageTokens[region] || "";
            const url = `${BASE_URL}/search?part=snippet&type=video&videoDuration=short&maxResults=12&q=shorts&regionCode=${region}${token ? `&pageToken=${token}` : ""}&key=${API_KEY}`;
            const data = await safeFetch(url);

            if (data?.items?.length) {
                allShorts = allShorts.concat(data.items);
                nextPageTokens[region] = data.nextPageToken || "";
            }
        } catch (err) {
            console.warn(`Failed to fetch shorts for ${region}:`, err);
            continue;
        }
        if (allShorts.length >= 12) break; // stop at 12 per batch
    }

    hideLoader();

    if (!allShorts.length) {
        if (!append) container.innerHTML = "<p style='padding:10px;color:gray;'>No shorts found.</p>";
        toggleBackBtn();
        return;
    }

    // Remove duplicates
    const uniqueShorts = [...new Map(allShorts.map(v => [v.id.videoId, v])).values()];

    // Render shorts
    uniqueShorts.forEach(v => {
        const videoId = v.id.videoId || v.id;
        const title = v.snippet?.title || "Untitled";

        const shortCard = document.createElement("div");
        shortCard.className = "short-card";
        shortCard.innerHTML = `
            <iframe src="https://www.youtube.com/embed/${videoId}?enablejsapi=1&autoplay=0&mute=0"
                    frameborder="0" allow="autoplay; encrypted-media" allowfullscreen></iframe>
            <div class="short-title">${title}</div>`;
        container.appendChild(shortCard);
    });

    toggleBackBtn();
    enableShortsSnap();
    enableShortsNavigation();
    enableShortsAutoplay();

    // Save nextPageToken for infinite scroll
    container.dataset.nextPageTokens = JSON.stringify(nextPageTokens);
}

// ===========================
// SNAP TO CENTER
function enableShortsSnap() {
    const container = document.querySelector(".shorts-container");
    if (!container) return;
    let isScrolling;
    container.addEventListener("scroll", () => {
        window.clearTimeout(isScrolling);
        isScrolling = setTimeout(() => {
            const shorts = container.querySelectorAll(".short-card");
            if (!shorts.length) return;
            const containerTop = container.getBoundingClientRect().top;
            let closest = shorts[0];
            let minDistance = Math.abs(shorts[0].getBoundingClientRect().top - containerTop);
            shorts.forEach(short => {
                const distance = Math.abs(short.getBoundingClientRect().top - containerTop);
                if (distance < minDistance) {
                    minDistance = distance;
                    closest = short;
                }
            });
            closest.scrollIntoView({ behavior: "smooth", block: "center" });
        }, 120);
    }, { passive: true });
}

// AUTOPLAY WHEN VISIBLE
function enableShortsAutoplay() {
    const container = document.querySelector(".shorts-container");
    if (!container) return;
    const shorts = container.querySelectorAll("iframe");
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            const iframe = entry.target;
            const src = new URL(iframe.src);
            if (entry.isIntersecting) {
                src.searchParams.set("autoplay", "1");
            } else {
                src.searchParams.set("autoplay", "0");
            }
            iframe.src = src.toString();
        });
    }, { threshold: 0.7 });

    shorts.forEach(f => observer.observe(f));
}

// ===========================
// ENABLE NAVIGATION (optional)
function enableShortsNavigation() {
    // optional: arrow key or swipe navigation
}

// Keyboard (↑/↓) & touch swipe navigation between shorts
function enableShortsNavigation() {
    const container = document.querySelector(".shorts-container");
    if (!container) return;
    const shorts = () => container.querySelectorAll(".short-card");
    let currentIndex = 0;

    // Keyboard
    window.addEventListener("keydown", (e) => {
        if (getComputedStyle(container).display === "none") return;
        if (!["ArrowUp", "ArrowDown"].includes(e.key)) return;
        const list = shorts();
        if (!list.length) return;
        if (e.key === "ArrowDown") currentIndex = Math.min(currentIndex + 1, list.length - 1);
        if (e.key === "ArrowUp") currentIndex = Math.max(currentIndex - 1, 0);
        list[currentIndex].scrollIntoView({ behavior: "smooth", block: "center" });
    });

    // Touch
    let touchStartY = 0, touchEndY = 0;
    container.addEventListener("touchstart", e => touchStartY = e.changedTouches[0].screenY, { passive: true });
    container.addEventListener("touchend", e => {
        touchEndY = e.changedTouches[0].screenY;
        const delta = touchStartY - touchEndY;
        if (Math.abs(delta) < 30) return;
        const list = shorts();
        if (!list.length) return;
        if (delta > 0) currentIndex = Math.min(currentIndex + 1, list.length - 1);
        else currentIndex = Math.max(currentIndex - 1, 0);
        list[currentIndex].scrollIntoView({ behavior: "smooth", block: "center" });
    }, { passive: true });
}

// Autoplay the short in view, unmute it, pause others (and stop main video if playing)
function enableShortsAutoplay() {
    const container = document.querySelector(".shorts-container");
    if (!container) return;
    const iframes = container.querySelectorAll(".short-card iframe");

    // Helper: toggle autoplay and mute parameters on iframe src
    function setPlayback(iframe, on) {
        if (!iframe || !iframe.src) return;
        try {
            const url = new URL(iframe.src);
            if (on) {
                url.searchParams.set("autoplay", "1");
                url.searchParams.set("mute", "0"); // try to unmute (may be blocked by browser)
            } else {
                url.searchParams.delete("autoplay");
                // optionally mute when not active to prevent accidental sound
                url.searchParams.set("mute", "1");
            }
            const newSrc = url.toString();
            if (newSrc !== iframe.src) iframe.src = newSrc;
        } catch (e) {
            // fallback: append/remove strings
            if (on && !iframe.src.includes("autoplay=1")) iframe.src = iframe.src + (iframe.src.includes("?") ? "&autoplay=1" : "?autoplay=1");
        }
    }

    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            const iframe = entry.target;
            if (entry.isIntersecting) {
                // Pause anything else first (other shorts or main watch)
                if (currentlyPlayingVideo && currentlyPlayingVideo !== iframe) {
                    stopCurrentlyPlaying();
                }
                currentlyPlayingVideo = iframe;
                // set autoplay & unmute
                setPlayback(iframe, true);
            } else {
                setPlayback(iframe, false);
            }
        });
    }, { root: container, rootMargin: "0px", threshold: 0.6 });

    iframes.forEach(el => observer.observe(el));
}

   // ===== Logo toggle =====
const defaultLogo = document.querySelector(".defaultlogo");
const shortsLogo = document.querySelector(".shortslogo");

function showLogo(section) {
    if (!defaultLogo || !shortsLogo) return;

    if (section === "shorts") {
        defaultLogo.style.display = "none";
        shortsLogo.style.display = "inline-block";
    } else {
        defaultLogo.style.display = "inline-block";
        shortsLogo.style.display = "none";
    }
}

// Update on sidebar click
document.querySelectorAll(".sidebar .menu-item").forEach(item => {
    item.addEventListener("click", () => {
        const section = item.dataset.section;
        showLogo(section);
    });
});

// Update logo when going back
function goBack() {
    if (!navHistory || navHistory.length === 0) {
        showHomeGrid(false);
        showLogo("home");
        return;
    }
    const prev = navHistory.pop();
    toggleBackBtn();

    if (!prev) {
        showHomeGrid(false);
        showLogo("home");
        return;
    }

    if (prev.section === "home") {
        showHomeGrid(false);
        showLogo("home");
    } else if (prev.section === "shorts") {
        showShorts(false);
        showLogo("shorts");
    } else if (prev.section === "video") {
        openVideoPage(prev.data.videoId, prev.data.snippet, true);
        showLogo("home");
    }
}

/* END NAV: HOME & SHORT  */

// ===== Initial Load ======
searchVideos("trending");

// ===== Optional: recover from API quota/empty results gracefully =====
window.addEventListener("error", (e) => {
    console.warn("Unhandled error:", e.message);
});
window.addEventListener("unhandledrejection", (e) => {
    console.warn("Unhandled rejection:", e.reason);
});
