/* =========================================================
   คลื่นวิทยุ Live — app.js
   ========================================================= */

// 6) วาง URL ของ Apps Script Web App ที่ deploy แล้วตรงนี้
//    (ทำครั้งเดียว ไม่ต้องกรอกใหม่ทุกเครื่อง/เบราว์เซอร์)
const DEFAULT_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbyEb_A-zlbJYXM3PLiejwyrH1SdQHWNjNPEb5s_9_NIhfn1a03oIwhC-ulBr2WtC2SG/exec";

const STATIONS = [
  { id: "greenwave", name: "Green Wave", freq: "106.5 MHz", url: "https://atime.live/stream/greenwave", category: "music", tag: "เพลงฮิต" },
  { id: "efm", name: "EFM", freq: "94.0 MHz", url: "https://atime.live/stream/efm", category: "music", tag: "วาไรตี้" },
  { id: "chill", name: "Chill Online", freq: "CHILL", url: "https://atime.live/stream/chill", category: "music", tag: "Chill Music" },
  { id: "mcotfm95", name: "MCOT FM 95 ลูกทุ่งมหานคร", freq: "95.0 MHz", url: "https://stream.mcot.net/fm95", category: "music", tag: "ลูกทุ่ง" },
  { id: "fm91", name: "สวพ. FM 91", freq: "91.0 MHz", url: "https://stream.fm91bkk.com/live", category: "news", tag: "เพื่อการจราจร" },
  { id: "mcotfm1005", name: "MCOT FM 100.5", freq: "100.5 MHz", url: "https://stream.mcot.net/fm1005", category: "news", tag: "ข่าวสารและสาระ" },
  { id: "nbt", name: "สถานีวิทยุกระจายเสียงแห่งประเทศไทย", freq: "NBT DIRECT", url: "https://live.radiothailand.prd.go.th/live/stream", category: "news", tag: "สารคดี" }
];

/* -------- state -------- */

let state = {
  user: null,        // {id, username, role, token}
  favorites: [],      // [{id, userId, stationId, stationName, addedAt}]
  history: [],
  currentStationId: null,
  isPaused: false
};

const audioEl = document.getElementById("audioEl");

/* -------- script URL / storage -------- */

function getScriptUrl() {
  if (DEFAULT_SCRIPT_URL && DEFAULT_SCRIPT_URL.indexOf("http") === 0) return DEFAULT_SCRIPT_URL;
  return localStorage.getItem("thairadio_scripturl") || "";
}

function saveScriptUrl(url) {
  localStorage.setItem("thairadio_scripturl", url);
}

function getToken() { return localStorage.getItem("thairadio_token") || ""; }
function saveToken(token) { localStorage.setItem("thairadio_token", token); }
function clearToken() { localStorage.removeItem("thairadio_token"); }

/* -------- API helper -------- */

async function api(action, payload) {
  const url = getScriptUrl();
  if (!url) {
    openModal("settingsModal");
    throw new Error("ยังไม่ได้ตั้งค่า Apps Script URL");
  }
  const body = Object.assign({ action, token: getToken() }, payload || {});
  const res = await fetch(url, {
    method: "POST",
    // text/plain avoids a CORS preflight OPTIONS request, which Apps
    // Script web apps do not handle.
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify(body)
  });
  if (!res.ok) throw new Error("เครือข่ายขัดข้อง (" + res.status + ")");
  return res.json();
}

async function sha256(text) {
  const data = new TextEncoder().encode(text);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, "0")).join("");
}

/* -------- Thailand time formatting -------- */

function formatThaiTime(isoLike) {
  if (!isoLike) return "-";
  const d = new Date(isoLike.replace(" ", "T"));
  if (isNaN(d.getTime())) return isoLike;
  return d.toLocaleString("th-TH", { timeZone: "Asia/Bangkok", dateStyle: "medium", timeStyle: "short" });
}

/* =========================================================
   Rendering: stations
   ========================================================= */

function renderStations() {
  const music = STATIONS.filter(s => s.category === "music");
  const news = STATIONS.filter(s => s.category === "news");
  document.getElementById("grid-music").innerHTML = music.map(stationCardHtml).join("");
  document.getElementById("grid-news").innerHTML = news.map(stationCardHtml).join("");

  document.querySelectorAll(".play-btn").forEach(btn => {
    btn.addEventListener("click", () => togglePlay(btn.closest(".station-card").dataset.stationId));
  });
  document.querySelectorAll(".fav-btn").forEach(btn => {
    btn.addEventListener("click", () => toggleFavorite(btn.dataset.stationId, btn.dataset.stationName));
  });
}

function isFavorited(stationId) {
  return state.favorites.some(f => f.stationId === stationId);
}

function stationCardHtml(s) {
  const playing = state.currentStationId === s.id;
  const favActive = isFavorited(s.id);
  const favDisabled = !state.user;
  return `
    <div class="station-card ${playing ? "is-playing" : ""}" data-category="${s.category}" data-station-id="${s.id}">
      <div class="card-top">
        <span class="card-freq">${s.freq}</span>
        <button class="fav-btn ${favActive ? "active" : ""}" data-station-id="${s.id}" data-station-name="${s.name}"
          ${favDisabled ? "disabled title='เข้าสู่ระบบเพื่อบันทึกสถานีโปรด'" : "title='บันทึกสถานีโปรด'"}>
          ${favActive ? "★" : "☆"}
        </button>
      </div>
      <div>
        <p class="card-name">${s.name}</p>
        <span class="card-tag">${s.tag}</span>
      </div>
      <div class="card-bottom">
        <button class="play-btn">
          ${playing && !state.isPaused ? "กำลังเล่น" : "▶ เล่น"}
        </button>
        <div class="mini-vu"><span></span><span></span><span></span></div>
      </div>
    </div>
  `;
}

function refreshStationCards() {
  document.querySelectorAll(".station-card").forEach(card => {
    const id = card.dataset.stationId;
    const playing = state.currentStationId === id;
    card.classList.toggle("is-playing", playing);
    const btn = card.querySelector(".play-btn");
    if (btn) btn.textContent = playing && !state.isPaused ? "กำลังเล่น" : "▶ เล่น";
    const fav = card.querySelector(".fav-btn");
    if (fav) {
      const active = isFavorited(id);
      fav.classList.toggle("active", active);
      fav.textContent = active ? "★" : "☆";
      fav.disabled = !state.user;
    }
  });
}

/* =========================================================
   Player
   ========================================================= */

function togglePlay(stationId) {
  if (state.currentStationId === stationId) {
    if (state.isPaused) resumePlayback();
    else pausePlayback();
    return;
  }
  playStation(stationId);
}

function playStation(stationId) {
  const station = STATIONS.find(s => s.id === stationId);
  if (!station) return;

  audioEl.pause();
  audioEl.src = station.url;
  audioEl.play().catch(() => {
    showToastError("เล่นสถานีนี้ไม่สำเร็จ ลองใหม่อีกครั้ง");
  });

  state.currentStationId = stationId;
  state.isPaused = false;

  document.getElementById("playerBar").classList.remove("hidden");
  document.getElementById("playerBar").classList.remove("paused");
  document.getElementById("playerStationName").textContent = station.name;
  document.getElementById("playerStationFreq").textContent = station.freq + " · " + station.tag;
  setPlayerIcon(false);
  refreshStationCards();

  if (state.user) {
    api("logPlay", { stationId: station.id, stationName: station.name }).catch(() => {});
  }
}

function pausePlayback() {
  audioEl.pause();
  state.isPaused = true;
  document.getElementById("playerBar").classList.add("paused");
  setPlayerIcon(true);
  refreshStationCards();
}

function resumePlayback() {
  audioEl.play().catch(() => {});
  state.isPaused = false;
  document.getElementById("playerBar").classList.remove("paused");
  setPlayerIcon(false);
  refreshStationCards();
}

function closePlayer() {
  audioEl.pause();
  audioEl.removeAttribute("src");
  state.currentStationId = null;
  state.isPaused = false;
  document.getElementById("playerBar").classList.add("hidden");
  refreshStationCards();
}

function setPlayerIcon(paused) {
  document.getElementById("iconPause").classList.toggle("hidden", paused);
  document.getElementById("iconPlay").classList.toggle("hidden", !paused);
}

function showToastError(msg) {
  alert(msg);
}

/* =========================================================
   Favorites
   ========================================================= */

async function toggleFavorite(stationId, stationName) {
  if (!state.user) { openModal("authModal"); return; }
  const existing = state.favorites.find(f => f.stationId === stationId);
  try {
    if (existing) {
      await api("removeFavorite", { favoriteId: existing.id });
      state.favorites = state.favorites.filter(f => f.id !== existing.id);
    } else {
      const res = await api("addFavorite", { stationId, stationName });
      if (res.success) state.favorites.push(res.favorite);
    }
    refreshStationCards();
    renderDrawerFavorites();
  } catch (err) {
    showToastError(err.message);
  }
}

/* =========================================================
   Auth UI
   ========================================================= */

function renderAuthArea() {
  const el = document.getElementById("authArea");
  if (state.user) {
    el.innerHTML = `
      <button class="btn-ghost" id="openDrawerBtn">รายการของฉัน</button>
      <div class="user-chip">
        <span>${state.user.username}</span>
        <span class="role-badge">${state.user.role === "admin" ? "ADMIN" : "USER"}</span>
      </div>
      <button class="btn-outline" id="logoutBtn"><span class="long-label">ออกจากระบบ</span></button>
    `;
    document.getElementById("openDrawerBtn").addEventListener("click", () => openDrawer("favorites"));
    document.getElementById("logoutBtn").addEventListener("click", logout);
  } else {
    el.innerHTML = `
      <button class="btn-ghost" id="loginOpenBtn">เข้าสู่ระบบ</button>
      <button class="btn-primary" id="registerOpenBtn">สมัครสมาชิก</button>
    `;
    document.getElementById("loginOpenBtn").addEventListener("click", () => { openModal("authModal"); switchAuthTab("login"); });
    document.getElementById("registerOpenBtn").addEventListener("click", () => { openModal("authModal"); switchAuthTab("register"); });
  }
}

function switchAuthTab(tab) {
  document.getElementById("tabLoginBtn").classList.toggle("active", tab === "login");
  document.getElementById("tabRegisterBtn").classList.toggle("active", tab === "register");
  document.getElementById("loginForm").classList.toggle("hidden", tab !== "login");
  document.getElementById("registerForm").classList.toggle("hidden", tab !== "register");
}

async function handleLoginSubmit(e) {
  e.preventDefault();
  const username = document.getElementById("loginUsername").value.trim();
  const password = document.getElementById("loginPassword").value;
  const errEl = document.getElementById("loginError");
  errEl.textContent = "";
  try {
    const passwordHash = await sha256(password);
    const res = await api("login", { username, passwordHash });
    if (!res.success) { errEl.textContent = res.error; return; }
    saveToken(res.user.token);
    state.user = res.user;
    closeModal("authModal");
    renderAuthArea();
    await loadBootstrap();
  } catch (err) {
    errEl.textContent = err.message;
  }
}

async function handleRegisterSubmit(e) {
  e.preventDefault();
  const username = document.getElementById("registerUsername").value.trim();
  const password = document.getElementById("registerPassword").value;
  const errEl = document.getElementById("registerError");
  errEl.textContent = "";
  try {
    const passwordHash = await sha256(password);
    const res = await api("register", { username, passwordHash });
    if (!res.success) { errEl.textContent = res.error; return; }
    saveToken(res.user.token);
    state.user = res.user;
    closeModal("authModal");
    renderAuthArea();
    await loadBootstrap();
  } catch (err) {
    errEl.textContent = err.message;
  }
}

async function logout() {
  try { await api("logout", {}); } catch (err) { /* ignore network errors on logout */ }
  clearToken();
  state.user = null;
  state.favorites = [];
  state.history = [];
  renderAuthArea();
  refreshStationCards();
  closeDrawer();
}

/* =========================================================
   Bootstrap (single combined load)
   ========================================================= */

async function loadBootstrap() {
  if (!getToken()) return;
  try {
    const res = await api("bootstrap", {});
    if (res.loggedIn) {
      state.user = res.user;
      state.favorites = res.favorites || [];
      state.history = res.history || [];
      renderAuthArea();
      refreshStationCards();
      renderDrawerFavorites();
      renderDrawerHistory();
      document.getElementById("tabAdminBtn").classList.toggle("hidden", state.user.role !== "admin");
    } else {
      clearToken();
    }
  } catch (err) {
    // silent: user can keep listening even if bootstrap fails
    console.warn("bootstrap failed", err.message);
  }
}

/* =========================================================
   Drawer: favorites / history / admin
   ========================================================= */

function openDrawer(tab) {
  openModal("drawer", true);
  switchDrawerTab(tab || "favorites");
}

function closeDrawer() { closeModal("drawer"); }

function switchDrawerTab(tab) {
  document.querySelectorAll("#drawerTabs .tab-btn").forEach(b => {
    b.classList.toggle("active", b.dataset.drawerTab === tab);
  });
  document.getElementById("panelFavorites").classList.toggle("hidden", tab !== "favorites");
  document.getElementById("panelHistory").classList.toggle("hidden", tab !== "history");
  document.getElementById("panelAdmin").classList.toggle("hidden", tab !== "admin");
  if (tab === "admin") loadAdminData();
}

function renderDrawerFavorites() {
  const el = document.getElementById("panelFavorites");
  if (!state.favorites.length) {
    el.innerHTML = `<p class="empty-state">ยังไม่มีสถานีโปรด กดไอคอน ☆ ที่การ์ดสถานีเพื่อบันทึก</p>`;
    return;
  }
  el.innerHTML = state.favorites.map(f => `
    <div class="list-item">
      <div class="list-item-main">
        <p class="list-item-title">${f.stationName}</p>
        <p class="list-item-meta">บันทึกเมื่อ ${formatThaiTime(f.addedAt)}</p>
      </div>
      <button class="remove-btn" data-fav-id="${f.id}" title="ลบออกจากสถานีโปรด">✕</button>
    </div>
  `).join("");
  el.querySelectorAll(".remove-btn").forEach(btn => {
    btn.addEventListener("click", async () => {
      try {
        await api("removeFavorite", { favoriteId: btn.dataset.favId });
        state.favorites = state.favorites.filter(f => f.id !== btn.dataset.favId);
        renderDrawerFavorites();
        refreshStationCards();
      } catch (err) { showToastError(err.message); }
    });
  });
}

function renderDrawerHistory() {
  const el = document.getElementById("panelHistory");
  if (!state.history.length) {
    el.innerHTML = `<p class="empty-state">ยังไม่มีประวัติการฟัง</p>`;
    return;
  }
  el.innerHTML = state.history.map(h => `
    <div class="list-item">
      <div class="list-item-main">
        <p class="list-item-title">${h.stationName}</p>
        <p class="list-item-meta">${formatThaiTime(h.playedAt)}</p>
      </div>
    </div>
  `).join("");
}

async function loadAdminData() {
  const el = document.getElementById("panelAdmin");
  el.innerHTML = `<p class="empty-state">กำลังโหลด...</p>`;
  try {
    const res = await api("adminData", {});
    if (!res.success) { el.innerHTML = `<p class="empty-state">${res.error}</p>`; return; }

    const favCountByUser = {};
    res.favorites.forEach(f => { favCountByUser[f.userId] = (favCountByUser[f.userId] || 0) + 1; });

    const usersHtml = res.users.map(u => `
      <div class="list-item">
        <div class="list-item-main">
          <p class="list-item-title">${u.username} ${u.role === "admin" ? "· admin" : ""}</p>
          <p class="list-item-meta">สถานีโปรด ${favCountByUser[u.id] || 0} รายการ · สมัครเมื่อ ${formatThaiTime(u.createdAt)}</p>
        </div>
      </div>
    `).join("");

    const historyHtml = res.history.slice(0, 20).map(h => `
      <div class="list-item">
        <div class="list-item-main">
          <p class="list-item-title">${h.stationName}</p>
          <p class="list-item-meta">${formatThaiTime(h.playedAt)}</p>
        </div>
      </div>
    `).join("");

    el.innerHTML = `
      <p class="admin-section-title">ผู้ใช้ทั้งหมด (${res.users.length})</p>
      ${usersHtml || '<p class="empty-state">ยังไม่มีผู้ใช้</p>'}
      <p class="admin-section-title">ประวัติการฟังล่าสุด (ทุกผู้ใช้)</p>
      ${historyHtml || '<p class="empty-state">ยังไม่มีประวัติ</p>'}
    `;
  } catch (err) {
    el.innerHTML = `<p class="empty-state">${err.message}</p>`;
  }
}

/* =========================================================
   Modal / drawer plumbing
   ========================================================= */

function openModal(id, isDrawer) {
  document.getElementById("overlay").classList.remove("hidden");
  document.getElementById(id).classList.remove("hidden");
}

function closeModal(id) {
  document.getElementById(id).classList.add("hidden");
  const anyOpen = ["authModal", "settingsModal", "drawer"].some(m => !document.getElementById(m).classList.contains("hidden"));
  if (!anyOpen) document.getElementById("overlay").classList.add("hidden");
}

function closeAllModals() {
  ["authModal", "settingsModal", "drawer"].forEach(id => document.getElementById(id).classList.add("hidden"));
  document.getElementById("overlay").classList.add("hidden");
}

/* =========================================================
   Init
   ========================================================= */

function init() {
  renderStations();
  renderAuthArea();

  document.getElementById("overlay").addEventListener("click", closeAllModals);
  document.getElementById("authModalClose").addEventListener("click", () => closeModal("authModal"));
  document.getElementById("settingsModalClose").addEventListener("click", () => closeModal("settingsModal"));
  document.getElementById("drawerClose").addEventListener("click", closeDrawer);

  document.getElementById("tabLoginBtn").addEventListener("click", () => switchAuthTab("login"));
  document.getElementById("tabRegisterBtn").addEventListener("click", () => switchAuthTab("register"));
  document.getElementById("loginForm").addEventListener("submit", handleLoginSubmit);
  document.getElementById("registerForm").addEventListener("submit", handleRegisterSubmit);

  document.querySelectorAll("#drawerTabs .tab-btn").forEach(b => {
    b.addEventListener("click", () => switchDrawerTab(b.dataset.drawerTab));
  });

  document.getElementById("settingsForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const url = document.getElementById("scriptUrlInput").value.trim();
    if (url) { saveScriptUrl(url); closeModal("settingsModal"); loadBootstrap(); }
  });

  document.getElementById("playerToggleBtn").addEventListener("click", () => {
    if (!state.currentStationId) return;
    if (state.isPaused) resumePlayback(); else pausePlayback();
  });
  document.getElementById("playerCloseBtn").addEventListener("click", closePlayer);

  if (!getScriptUrl()) {
    const saved = localStorage.getItem("thairadio_scripturl");
    if (!saved) {
      // Don't block browsing; just let auth actions trigger the settings modal.
    }
  }

  if (getToken()) loadBootstrap();
}

document.addEventListener("DOMContentLoaded", init);
