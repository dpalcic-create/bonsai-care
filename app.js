/* Bonsai Care app */
"use strict";

const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const MONTHS_SHORT = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const LS_SETTINGS = "bonsai-care-settings";
const LS_TREES = "bonsai-care-trees";
const ZONE_OPTIONS = (() => {
  const a = [];
  for (let n = 1; n <= 13; n++) { a.push(n + "a"); a.push(n + "b"); }
  return a;
})();
const FLOWERING = new Set([
  "rhododendron-indicum","chaenomeles-speciosa","pseudocydonia-sinensis","malus",
  "wisteria-floribunda","prunus-mume","punica-granatum","bougainvillea-glabra",
  "cotoneaster-horizontalis","pyracantha-coccinea","ehretia-microphylla","serissa-japonica",
  "olea-europaea","sageretia-theezans"
]);

const defaultSettings = () => ({ zone: "", zip: "", units: "F", plantnetKey: "" });
let settings = loadSettings();
let trees = loadTrees();
let photoURLs = {}; // id -> objectURL
let currentPhotoFile = null;
let pendingSpecies = null;
let keyFilters = {};
let keyHistory = [];

function loadSettings() {
  try { return { ...defaultSettings(), ...JSON.parse(localStorage.getItem(LS_SETTINGS) || "{}") }; }
  catch { return defaultSettings(); }
}
function saveSettings() { localStorage.setItem(LS_SETTINGS, JSON.stringify(settings)); }
function loadTrees() {
  try { return JSON.parse(localStorage.getItem(LS_TREES) || "[]"); }
  catch { return []; }
}
function saveTrees() { localStorage.setItem(LS_TREES, JSON.stringify(trees)); }

/* ---------- IndexedDB photos ---------- */
let _db;
function dbp() {
  if (_db) return Promise.resolve(_db);
  return new Promise((res, rej) => {
    const r = indexedDB.open("bonsai-care", 1);
    r.onupgradeneeded = () => r.result.createObjectStore("photos");
    r.onsuccess = () => { _db = r.result; res(_db); };
    r.onerror = () => rej(r.error);
  });
}
async function savePhoto(id, blob) {
  const db = await dbp();
  await new Promise((res, rej) => {
    const tx = db.transaction("photos", "readwrite");
    tx.objectStore("photos").put(blob, id);
    tx.oncomplete = res; tx.onerror = () => rej(tx.error);
  });
  if (photoURLs[id]) URL.revokeObjectURL(photoURLs[id]);
  photoURLs[id] = URL.createObjectURL(blob);
}
async function loadPhoto(id) {
  if (photoURLs[id]) return photoURLs[id];
  try {
    const db = await dbp();
    const blob = await new Promise((res, rej) => {
      const tx = db.transaction("photos", "readonly");
      const q = tx.objectStore("photos").get(id);
      q.onsuccess = () => res(q.result);
      q.onerror = () => rej(q.error);
    });
    if (blob) { photoURLs[id] = URL.createObjectURL(blob); return photoURLs[id]; }
  } catch {}
  return "";
}
async function deletePhoto(id) {
  try {
    const db = await dbp();
    await new Promise((res, rej) => {
      const tx = db.transaction("photos", "readwrite");
      tx.objectStore("photos").delete(id);
      tx.oncomplete = res; tx.onerror = () => rej(tx.error);
    });
  } catch {}
  if (photoURLs[id]) { URL.revokeObjectURL(photoURLs[id]); delete photoURLs[id]; }
}

/* ---------- time, units, helpers ---------- */
function nowNY() {
  return new Date(new Date().toLocaleString("en-US", { timeZone: "America/New_York" }));
}
function currentMonth() { return nowNY().getMonth() + 1; }
function currentYear() { return nowNY().getFullYear(); }
function zoneNumber(label) {
  const m = String(label || "").match(/(\d+)/);
  return m ? parseInt(m[1], 10) : null;
}
function zoneTempF(label) {
  const i = ZONE_OPTIONS.indexOf(String(label || "").toLowerCase());
  if (i < 0) return null;
  const lo = -60 + i * 5, hi = -55 + i * 5;
  return { lo, hi };
}
function fmtTemp(f, opts) {
  if (f === null || f === undefined || f === "") return "—";
  const n = Number(f);
  if (settings.units === "C") return Math.round((n - 32) * 5 / 9) + "°C";
  return n + "°F";
}
function fmtTempRange(lo, hi) {
  return fmtTemp(lo) + " to " + fmtTemp(hi);
}
function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;" }[c]));
}
function uid() {
  return (crypto.randomUUID && crypto.randomUUID()) || ("t" + Date.now() + Math.random().toString(16).slice(2));
}
function go(hash) { location.hash = hash; }
function speciesById(id) { return SPECIES_BY_ID[id] || null; }
function placeLabel(s) {
  return s.place === "indoor" ? "Indoor / tropical" : s.place === "both" ? "Indoor or outdoor" : "Outdoor";
}
function climateLabel(s) {
  return ({ temperate:"Temperate", tropical:"Tropical", subtropical:"Subtropical", mediterranean:"Mediterranean" })[s.climate] || s.climate;
}

/* ---------- SVG glyphs ---------- */
function glyph(s, size) {
  const sz = size || 80;
  const g = (s.leaf && s.leaf.group) || "broad";
  const id = s.id || "";
  let body = "";
  if (id.startsWith("acer-palmatum") || (g === "broad" && s.leaf && s.leaf.lobed === "palmate")) {
    body = `<path d="M40 72 L40 44 M40 44 C28 42 18 50 14 58 M40 44 C22 36 16 24 18 14 M40 44 C32 28 34 16 40 8 C46 16 48 28 40 44 C58 36 64 24 62 14 M40 44 C52 42 62 50 66 58" fill="none" stroke="#3d5c3a" stroke-width="3" stroke-linecap="round"/>`;
  } else if (s.leaf && s.leaf.lobed === "trifoliate") {
    body = `<path d="M40 72 L40 46 M40 46 L18 28 M40 46 L40 14 M40 46 L62 28" fill="none" stroke="#3d5c3a" stroke-width="3" stroke-linecap="round"/><path d="M18 28 l-8 -2 4 10z M40 14 l-6 -8 12 0z M62 28 l8 -2 -4 10z" fill="#3d5c3a"/>`;
  } else if (s.leaf && s.leaf.lobed === "fan") {
    body = `<path d="M40 70 L40 50 M22 50 Q40 12 58 50 Z" fill="#3d5c3a" stroke="#2a3f28" stroke-width="1"/><path d="M28 48 L36 22 M40 50 L40 18 M52 48 L44 22" stroke="#e9e3d2" stroke-width="1" fill="none"/>`;
  } else if (g === "succulent") {
    body = `<ellipse cx="32" cy="42" rx="12" ry="16" fill="#3d5c3a"/><ellipse cx="48" cy="42" rx="12" ry="16" fill="#4a6e45"/><path d="M40 58 L40 72" stroke="#6b4a2a" stroke-width="3"/>`;
  } else if (g === "scale") {
    body = `<path d="M40 72 L40 50 M40 50 L22 28 M40 50 L58 28 M30 40 L18 22 M50 40 L62 22" fill="none" stroke="#3d5c3a" stroke-width="3" stroke-linecap="round"/><circle cx="22" cy="28" r="6" fill="#4a6e45"/><circle cx="58" cy="28" r="6" fill="#4a6e45"/><circle cx="18" cy="22" r="5" fill="#3d5c3a"/><circle cx="62" cy="22" r="5" fill="#3d5c3a"/><circle cx="40" cy="36" r="8" fill="#3d5c3a"/>`;
  } else if (g === "needle" && s.leaf && s.leaf.arrangement && s.leaf.arrangement.startsWith("fascicle")) {
    body = `<path d="M40 74 L40 42" stroke="#6b4a2a" stroke-width="3"/><path d="M40 42 L26 10 M40 42 L34 8 M40 42 L46 8 M40 42 L54 10" stroke="#3d5c3a" stroke-width="2.4" fill="none" stroke-linecap="round"/>`;
  } else if (g === "needle" && s.leaf && s.leaf.arrangement === "tufted") {
    body = `<path d="M40 74 L40 48" stroke="#6b4a2a" stroke-width="3"/><g stroke="#3d5c3a" stroke-width="2" fill="none" stroke-linecap="round">
      <path d="M40 48 L22 22"/><path d="M40 48 L28 16"/><path d="M40 48 L36 12"/><path d="M40 48 L44 12"/><path d="M40 48 L52 16"/><path d="M40 48 L58 22"/></g>`;
  } else if (g === "needle") {
    body = `<path d="M40 74 L40 16" stroke="#6b4a2a" stroke-width="3"/><g stroke="#3d5c3a" stroke-width="2" fill="none" stroke-linecap="round">
      <path d="M40 28 L22 16"/><path d="M40 36 L58 22"/><path d="M40 44 L20 34"/><path d="M40 52 L60 40"/><path d="M40 60 L24 54"/></g>`;
  } else if (s.leaf && s.leaf.compound === "pinnate") {
    body = `<path d="M18 48 L62 48" stroke="#3d5c3a" stroke-width="2"/><ellipse cx="26" cy="38" rx="6" ry="10" fill="#3d5c3a"/><ellipse cx="38" cy="36" rx="6" ry="11" fill="#4a6e45"/><ellipse cx="50" cy="38" rx="6" ry="10" fill="#3d5c3a"/><ellipse cx="26" cy="58" rx="6" ry="10" fill="#4a6e45"/><ellipse cx="38" cy="60" rx="6" ry="11" fill="#3d5c3a"/><ellipse cx="50" cy="58" rx="6" ry="10" fill="#4a6e45"/>`;
  } else if (s.leaf && s.leaf.compound === "bipinnate") {
    body = `<path d="M16 50 L64 40" stroke="#3d5c3a" stroke-width="2"/>
      <g fill="#3d5c3a"><circle cx="24" cy="42" r="3"/><circle cx="28" cy="36" r="3"/><circle cx="32" cy="42" r="3"/><circle cx="40" cy="34" r="3"/><circle cx="44" cy="28" r="3"/><circle cx="48" cy="34" r="3"/><circle cx="56" cy="30" r="3"/><circle cx="60" cy="24" r="3"/><circle cx="24" cy="56" r="3"/><circle cx="30" cy="58" r="3"/><circle cx="44" cy="48" r="3"/><circle cx="50" cy="50" r="3"/></g>`;
  } else if (s.leaf && s.leaf.compound === "palmate-compound") {
    body = `<path d="M40 72 L40 48" stroke="#6b4a2a" stroke-width="3"/>
      <ellipse cx="40" cy="28" rx="7" ry="16" fill="#3d5c3a"/><ellipse cx="24" cy="34" rx="7" ry="15" transform="rotate(-40 24 34)" fill="#4a6e45"/><ellipse cx="56" cy="34" rx="7" ry="15" transform="rotate(40 56 34)" fill="#4a6e45"/><ellipse cx="30" cy="42" rx="6" ry="13" transform="rotate(-70 30 42)" fill="#3d5c3a"/><ellipse cx="50" cy="42" rx="6" ry="13" transform="rotate(70 50 42)" fill="#3d5c3a"/>`;
  } else {
    const serr = s.leaf && String(s.leaf.margin||"").includes("serrate");
    body = `<path d="M40 72 L40 58 M40 58 C22 54 18 30 40 12 C62 30 58 54 40 58Z" fill="#3d5c3a"/>
      <path d="M40 20 L40 58" stroke="#e9e3d2" stroke-width="1" fill="none"/>`;
    if (serr) body += `<path d="M28 28 l-4 2 4 2 M26 38 l-4 2 4 2 M52 28 l4 2 -4 2 M54 38 l4 2 -4 2" stroke="#2a3f28" stroke-width="1" fill="none"/>`;
  }
  return `<svg viewBox="0 0 80 80" width="${sz}" height="${sz}" aria-hidden="true">${body}</svg>`;
}

/* ---------- tasks / reminders ---------- */
function protectThreshold(s) {
  return s.bringInBelowF != null ? s.bringInBelowF : s.protectBelowF;
}
function yearsSince(iso) {
  if (!iso) return null;
  const d = new Date(iso + (iso.length === 7 ? "-15" : ""));
  if (isNaN(d)) return null;
  return (nowNY() - d) / (365.25 * 24 * 3600 * 1000);
}
function tasksFor(s, month, zone, lastRepot) {
  const tasks = [];
  const z = zoneNumber(zone);
  const thresh = protectThreshold(s);
  const winterish = month >= 10 || month <= 3;
  const lateFall = month >= 10 || month === 1;
  if (s.bringInBelowF != null) {
    if (z != null && z >= 10 && s.climate === "tropical") {
      if (winterish) tasks.push({ kind: "protect", title: "Watch unusual cold snaps", body: "In a very mild zone you may keep this tree outdoors, but a potted " + s.common + " is still hurt by nights near " + fmtTemp(thresh) + ". Have a way to bring it in." });
    } else if (month >= 9 || month <= 4) {
      tasks.push({ kind: "protect", title: "Keep indoors when nights drop below " + fmtTemp(thresh), body: s.winterizing[0] || "Move it to a bright, frost-free place and inspect for pests first." });
    }
  } else if (winterish) {
    tasks.push({ kind: "protect", title: "Protect the pot when nights drop below " + fmtTemp(s.protectBelowF), body: "Pots run about 1–2 zones less hardy than a landscape tree. Root injury becomes more likely around " + fmtTemp(s.rootMinF) + ". " + (s.winterizing[1] || "") });
  }
  if ((s.repotMonths || []).includes(month)) {
    let extra = "";
    const ys = yearsSince(lastRepot);
    if (ys != null && ys >= 2) extra = " It has been about " + ys.toFixed(1) + " years since the last recorded repot.";
    else if (ys != null && ys < 0.7) extra = " You already repotted recently — only redo it if the tree is packed or the soil has failed.";
    tasks.push({ kind: "repot", title: "Repot window is open", body: s.repotWhen + ". Cue: " + s.repotCue + "." + extra });
  } else if (s.repotMonths && s.repotMonths.length) {
    const upcoming = s.repotMonths.find(m => m === month + 1);
    if (upcoming) {
      tasks.push({ kind: "repot", title: "Repot window opens in " + MONTHS_SHORT[upcoming - 1], body: s.repotCue + ". " + s.repotFreq });
    }
  }
  if (winterish) {
    tasks.push({ kind: "water", title: "Check winter watering", body: s.wateringWinter });
  }
  if (!s.bringInBelowF && (month === 8 || month === 9)) {
    tasks.push({ kind: "prune", title: "Taper fertilizer so the tree can harden", body: "Hardy trees need to slow down before winter. " + (s.fertilizing.split(".").slice(-2).join(".") || s.fertilizing) });
  }
  if ((month === 10 || month === 11) && !s.leaf.evergreen && s.climate === "temperate") {
    tasks.push({ kind: "prune", title: "A good month to study structure and wire", body: "Once leaves are off, the branch structure is easy to read. Check wires before they bite. Do not repot now in the North." });
  }
  return tasks;
}
function nextRepotLabel(s, month) {
  const ms = (s.repotMonths || []).slice().sort((a,b)=>a-b);
  if (!ms.length) return s.repotWhen;
  const span = ms.length === 1 ? MONTHS_SHORT[ms[0]-1] : MONTHS_SHORT[ms[0]-1] + "–" + MONTHS_SHORT[ms[ms.length-1]-1];
  if (ms.includes(month)) return "Open now · " + span;
  return "Opens " + span;
}

/* ---------- routing ---------- */
function route() {
  const raw = (location.hash || "#/month").replace(/^#/, "");
  const parts = raw.split("/").filter(Boolean);
  const tab = parts[0] || "month";
  document.querySelectorAll("#tabs button").forEach(b => b.classList.toggle("on", b.dataset.tab === (tab === "guide" ? "settings" : tab === "library" && parts[1] ? "library" : tab === "trees" ? "trees" : tab)));
  const map = { month: "This month", library: "Species library", identify: "Identify a leaf", trees: "My trees", settings: "Settings", guide: "Winter guide" };
  const sub = document.getElementById("sub");
  if (tab === "library" && parts[1] && speciesById(parts[1])) {
    sub.textContent = speciesById(parts[1]).scientific;
  } else {
    sub.textContent = map[tab] || "Winter care & species guides";
  }
  if (tab === "month") return renderMonth();
  if (tab === "library") {
    if (parts[1]) return renderSpecies(parts[1]);
    return renderLibrary();
  }
  if (tab === "identify") return renderIdentify();
  if (tab === "trees") {
    if (parts[1] === "new") return renderTreeForm(null);
    if (parts[1] === "edit" && parts[2]) return renderTreeForm(parts[2]);
    if (parts[1]) return renderTreeDetail(parts[1]);
    return renderTrees();
  }
  if (tab === "settings") return renderSettings();
  if (tab === "guide") return renderGuide();
  return renderMonth();
}

function setView(html) {
  const v = document.getElementById("view");
  v.innerHTML = html;
  v.className = "fade";
  v.scrollTop = 0;
  window.scrollTo(0, 0);
}

/* ---------- This month ---------- */
function renderMonth() {
  const month = currentMonth();
  const monthName = MONTHS[month - 1];
  const zone = settings.zone;
  const zoneBit = zone
    ? `USDA zone <b>${esc(zone)}</b> (landscape). Potted trees are typically 1–2 zones less hardy.`
    : `Set your ZIP or zone in Settings so reminders can be tailored.`;
  let body = `<h1>${esc(monthName)}</h1>
    <p class="lede">${zoneBit}</p>`;

  if (!trees.length) {
    body += `<div class="callout"><span class="kicker">Getting started</span>
      Add the trees you own and this screen will list this month’s jobs — winter protection, repot windows, watering checks — for each one, in your zone.
      <div class="row wrap" style="margin-top:10px">
        <button class="btn fill" data-go="#/trees/new">Add a tree</button>
        <button class="btn" data-go="#/library">Browse the library</button>
      </div>
    </div>`;
  } else {
    body += `<div class="row wrap" style="margin-bottom:10px">
      <button class="btn fill" data-go="#/trees/new">Add a tree</button>
    </div>`;
  }

  if (trees.length) {
    for (const t of trees) {
      const s = speciesById(t.speciesId);
      if (!s) continue;
      const tasks = tasksFor(s, month, zone, t.lastRepot);
      const name = t.nickname || s.common;
      body += `<div class="card hit" data-go="#/trees/${encodeURIComponent(t.id)}">
        <div class="row">
          <div class="thumb" data-ph="${esc(t.id)}">${glyph(s, 40)}</div>
          <div class="grow">
            <div class="n" style="font-family:var(--serif);font-size:18px;color:var(--pine)">${esc(name)}</div>
            <div class="sci">${esc(s.common)} · ${esc(s.scientific)}</div>
          </div>
        </div>`;
      if (tasks.length) {
        body += tasks.slice(0, 4).map(tk => `<div class="task">
          <div class="dot ${esc(tk.kind)}"></div>
          <div class="grow"><b>${esc(tk.title)}</b><div class="small muted">${esc(tk.body)}</div></div>
        </div>`).join("");
      }
      body += `<p class="small muted" style="margin-top:8px"><b>${esc(monthName)} for this species.</b> ${esc(s.calendar[String(month)] || "")}</p></div>`;
    }
  } else {
    // seasonal overview from a few representative types
    const samples = ["acer-palmatum", "pinus-thunbergii", "ficus-microcarpa", "olea-europaea"]
      .map(speciesById).filter(Boolean);
    body += `<h2>A general ${esc(monthName)} picture</h2>
      <p class="small muted">Once you add trees, this will be specific to what you own.</p>`;
    for (const s of samples) {
      body += `<div class="card hit" data-go="#/library/${s.id}">
        <div class="row"><div class="thumb">${glyph(s, 40)}</div>
        <div class="grow"><b>${esc(s.common)}</b><div class="sci">${esc(s.scientific)}</div></div></div>
        <p class="small" style="margin-top:8px">${esc(s.calendar[String(month)])}</p>
      </div>`;
    }
  }

  body += `<div class="callout good"><span class="kicker">Winter, in pots</span>
    A tree in a shallow pot is typically about 1–2 USDA zones less hardy than the same species in the ground. The numbers in each guide are conservative starting points — when sources vary, this app gives a range and leans cautious.
    <div style="margin-top:8px"><button class="btn" data-go="#/guide">Read the winter guide</button></div>
  </div>`;
  setView(body);
  fillPhotos();
}

/* ---------- Library ---------- */
let libQuery = "";
let libFilter = "all";

function renderLibrary() {
  const q = libQuery.trim().toLowerCase();
  let list = SPECIES.slice().sort((a, b) => a.common.localeCompare(b.common));
  if (libFilter === "outdoor") list = list.filter(s => s.place === "outdoor" || s.place === "both");
  else if (libFilter === "indoor") list = list.filter(s => s.place === "indoor" || s.place === "both");
  else if (libFilter === "tropical") list = list.filter(s => s.climate === "tropical" || s.climate === "subtropical");
  else if (libFilter === "temperate") list = list.filter(s => s.climate === "temperate" || s.climate === "mediterranean");
  else if (libFilter === "needle") list = list.filter(s => s.leaf.group === "needle" || s.leaf.group === "scale");
  else if (libFilter === "broad") list = list.filter(s => s.leaf.group === "broad" || s.leaf.group === "succulent");
  else if (libFilter === "flowering") list = list.filter(s => FLOWERING.has(s.id));
  if (q) {
    list = list.filter(s => allNames(s).join(" ").toLowerCase().includes(q) || (s.family || "").toLowerCase().includes(q));
  }
  const chips = [
    ["all", "All"], ["outdoor", "Outdoor"], ["indoor", "Indoor"], ["temperate", "Temperate"],
    ["tropical", "Tropical"], ["needle", "Needles"], ["broad", "Broadleaf"], ["flowering", "Flowering"]
  ];
  setView(`<h1>Library</h1>
    <p class="lede">${SPECIES.length} common bonsai species, with winterizing, hardiness, and a month-by-month calendar. Works offline.</p>
    <input type="search" id="libSearch" placeholder="Search by name or genus" value="${esc(libQuery)}" aria-label="Search species">
    <div class="chips" role="tablist">${chips.map(([id,l]) => `<button class="chip${libFilter===id?" on":""}" data-filter="${id}">${l}</button>`).join("")}</div>
    <div class="count muted small" style="margin:0 2px 8px">${list.length} species</div>
    <div class="grid">${list.map(s => `<div class="tile" data-go="#/library/${s.id}">
      <div class="art">${glyph(s, 78)}</div>
      <div class="t"><div class="n">${esc(s.common)}</div><div class="m">${esc(s.scientific)}</div></div>
    </div>`).join("") || `<div class="empty">No species match.</div>`}</div>`);
  const inp = document.getElementById("libSearch");
  if (inp) {
    inp.addEventListener("input", e => { libQuery = e.target.value; renderLibrary(); const n = document.getElementById("libSearch"); if (n) { n.focus(); n.setSelectionRange(libQuery.length, libQuery.length); } });
  }
}

function renderSpecies(id) {
  const s = speciesById(id);
  if (!s) { setView(`<p>Species not found.</p><button class="btn" data-go="#/library">Back to library</button>`); return; }
  const zrange = `USDA ${s.zoneMin}–${s.zoneMax}`;
  const thresh = protectThreshold(s);
  const month = currentMonth();
  const facts = (s.facts || []).map(f => `<li>${esc(f)}</li>`).join("");
  const winter = (s.winterizing || []).map(f => `<li>${esc(f)}</li>`).join("");
  const cal = MONTHS.map((name, i) => {
    const m = i + 1;
    const on = m === month ? " on" : "";
    return `<div class="mo${on}" id="${m===month?"this-mo":""}"><div class="mn">${name}${m===month?" · now":""}</div><div class="small">${esc(s.calendar[String(m)])}</div></div>`;
  }).join("");
  const leaf = s.leaf || {};
  setView(`<button class="back" data-go="#/library">‹ Library</button>
    <h1>${esc(s.common)}</h1>
    <div class="sci">${esc(s.scientific)} · ${esc(s.family)}</div>
    <div class="tags">
      <span class="tag">${esc(placeLabel(s))}</span>
      <span class="tag">${esc(climateLabel(s))}</span>
      <span class="tag">${esc(zrange)} landscape</span>
      <span class="tag">${leaf.evergreen ? "Evergreen" : "Deciduous"}</span>
    </div>
    <div class="hero-facts">
      <div class="fact"><b>Landscape zones</b><span>${esc(zrange)}</span></div>
      <div class="fact"><b>Protect the pot below</b><span>${esc(fmtTemp(s.protectBelowF))}</span></div>
      <div class="fact"><b>Root-zone caution</b><span>about ${esc(fmtTemp(s.rootMinF))}</span></div>
      <div class="fact"><b>Repot window</b><span>${esc(nextRepotLabel(s, month))}</span></div>
    </div>
    <div class="callout warn"><span class="kicker">Bonsai in a pot</span>${esc(s.potNote)}</div>
    <p class="small muted">${esc(s.zoneNote)}</p>

    <h2>Winterizing</h2>
    <div class="card">
      <p><b>Dormancy.</b> ${esc(s.dormancy)}</p>
      <ol class="steps">${winter}</ol>
      <p><b>Water in winter.</b> ${esc(s.wateringWinter)}</p>
      <p><b>Light in winter.</b> ${esc(s.lightWinter)}</p>
      ${s.bringInBelowF != null ? `<p><b>Bring in</b> when nights drop below ${esc(fmtTemp(s.bringInBelowF))}.</p>` : `<p><b>Start protecting</b> when nights drop below ${esc(fmtTemp(s.protectBelowF))}. Root injury becomes more likely around ${esc(fmtTemp(s.rootMinF))}.</p>`}
    </div>

    <h2>Repotting &amp; root pruning</h2>
    <div class="card">
      <p><b>When.</b> ${esc(s.repotWhen)}</p>
      <p><b>Phenological cue.</b> ${esc(s.repotCue)}</p>
      <p><b>How often.</b> ${esc(s.repotFreq)}</p>
      <p>${esc(s.repotNotes)}</p>
      <p><b>Root pruning.</b> ${esc(s.rootPruning)}</p>
    </div>

    <h2>Pruning, pinching &amp; wiring</h2>
    <div class="card">
      <p><b>Structural pruning.</b> ${esc(s.structuralPruning)}</p>
      <p><b>Pinching &amp; maintenance.</b> ${esc(s.pinching)}</p>
      <p><b>Wiring.</b> ${esc(s.wiring)}</p>
    </div>

    <h2>Fertilizing</h2>
    <div class="card"><p>${esc(s.fertilizing)}</p></div>

    <h2>Pests &amp; problems</h2>
    <div class="card"><p>${esc(s.pests)}</p></div>

    <h2>How to recognize the leaf</h2>
    <div class="card">
      <div class="row"><div class="thumb">${glyph(s, 56)}</div>
        <div class="grow"><b>${esc(leaf.shape)}</b><div class="small muted">${esc((leaf.arrangement||"") + (leaf.compound && leaf.compound !== "simple" ? " · " + leaf.compound : "") + " · " + (leaf.margin||"") + " margin")}</div></div>
      </div>
      <p>${esc(leaf.features)}</p>
    </div>

    <h2>Worth knowing</h2>
    <div class="card"><ul class="steps" style="padding-left:18px">${facts}</ul></div>

    <h2>Month by month</h2>
    <p class="small muted">Northern Hemisphere, including the U.S. Timing shifts with your zone — use the phenological cues (bud swell, after flowering) over the calendar alone.</p>
    <div class="month-grid">${cal}</div>

    <div class="stack" style="margin-top:16px">
      <button class="btn fill gold" data-add="${s.id}">Add to My trees</button>
      <button class="btn ghost" data-go="#/library">Back to library</button>
    </div>`);
}

/* ---------- Identify ---------- */
function renderIdentify() {
  const hasKey = !!(settings.plantnetKey && settings.plantnetKey.trim());
  const remaining = filterByLeaf(SPECIES, keyFilters);
  setView(`<h1>Identify</h1>
    <p class="lede">Take a leaf photo to search Pl@ntNet, or use the guided key — the key works entirely offline.</p>

    <div class="card">
      <h2 style="margin-top:0">Photo identification</h2>
      <p class="small muted">A static app cannot run a good plant-ID model on the phone itself, so photos are sent to the free Pl@ntNet identify API from your device. Your key stays on this phone. ${hasKey ? "A key is saved in Settings." : "You will need a free personal API key — set it up in Settings."}</p>
      <div class="row wrap">
        <label class="btn fill photo-btn">Choose a leaf photo
          <input type="file" id="leafFile" accept="image/*" capture="environment" aria-label="Leaf photo">
        </label>
        ${hasKey ? "" : `<button class="btn" data-go="#/settings">Add API key</button>`}
      </div>
      <div id="photoPreview"></div>
      <div id="photoStatus"></div>
      <div id="photoResults"></div>
    </div>

    <div class="card" id="key-card">
      <h2 style="margin-top:0">Identify by leaf traits</h2>
      <p class="small muted">A short key that narrows this library. Skip a question if you are not sure.</p>
      <div id="keyQ"></div>
      <div class="muted small" id="keyCount"></div>
      <div id="keyHits"></div>
    </div>`);
  renderKeyPanel();
  const file = document.getElementById("leafFile");
  if (file) file.addEventListener("change", onLeafFile);
}

async function onLeafFile(e) {
  const file = e.target.files && e.target.files[0];
  if (!file) return;
  currentPhotoFile = file;
  const url = URL.createObjectURL(file);
  const prev = document.getElementById("photoPreview");
  if (prev) prev.innerHTML = `<img class="preview" alt="Selected leaf" src="${url}">`;
  const key = (settings.plantnetKey || "").trim();
  const status = document.getElementById("photoStatus");
  const results = document.getElementById("photoResults");
  if (results) results.innerHTML = "";
  if (!key) {
    if (status) status.innerHTML = `<div class="callout warn"><span class="kicker">API key needed</span>
      Photo ID uses your own free Pl@ntNet key. Add it in Settings, then come back and try this photo again. The guided key below works without a key.</div>`;
    return;
  }
  if (status) status.innerHTML = `<p class="muted">Identifying with Pl@ntNet…</p>`;
  try {
    const blob = await shrinkImage(file);
    const fd = new FormData();
    fd.append("images", blob, file.name || "leaf.jpg");
    fd.append("organs", "leaf");
    const urlApi = "https://my-api.plantnet.org/v2/identify/all?include-related-images=true&api-key=" + encodeURIComponent(key);
    const res = await fetch(urlApi, { method: "POST", body: fd });
    let data = null;
    try { data = await res.json(); } catch {}
    if (!res.ok) {
      if (status) status.innerHTML = plantnetError(res.status, data);
      return;
    }
    renderPlantnet(data);
  } catch (err) {
    if (status) status.innerHTML = `<div class="callout warn"><span class="kicker">Could not reach Pl@ntNet</span>
      ${esc(err && err.message ? err.message : "The request failed.")}
      Browser CORS will also block this call if the key is not set to “expose my API key,” or if <b>https://dpalcic-create.github.io</b> is not on the authorized-domains list in your Pl@ntNet account. The guided key below still works offline.</div>`;
  }
}

function plantnetError(status, data) {
  const msg = (data && (data.message || data.error || data.statusCode)) ? JSON.stringify(data.message || data.error || data) : "";
  if (status === 401 || status === 403) {
    return `<div class="callout warn"><span class="kicker">Key not accepted (${status})</span>
      Check that the key in Settings is copied correctly. For browser use you must also enable “Expose my API key” and authorize the domain <b>https://dpalcic-create.github.io</b>.</div>`;
  }
  if (status === 404) {
    return `<div class="callout warn"><span class="kicker">No plant found</span>
      Pl@ntNet did not recognize a plant in this photo (or rejected it as not a plant). Try a sharper, closer picture of a single leaf in good light, or use the guided key.</div>`;
  }
  if (status === 429) {
    return `<div class="callout warn"><span class="kicker">Rate limit</span>
      The free Pl@ntNet plan has a daily request limit. Try again tomorrow, or use the guided key.</div>`;
  }
  return `<div class="callout warn"><span class="kicker">Pl@ntNet error (${status})</span>
    ${esc(msg || "The identify request failed.")}</div>`;
}

function renderPlantnet(data) {
  const status = document.getElementById("photoStatus");
  const results = document.getElementById("photoResults");
  const list = (data && data.results) || [];
  const remain = data && data.remainingIdentificationRequests;
  if (!list.length) {
    if (status) status.innerHTML = `<div class="callout warn"><span class="kicker">No matches</span>Pl@ntNet returned no species. Try another photo, or use the guided key.</div>`;
    return;
  }
  if (status) status.innerHTML = `<p class="small muted">Top matches from Pl@ntNet${remain != null ? " · " + remain + " requests left on this key" : ""}. Confidence scores are the API’s own, not a guarantee. Always confirm with the leaf notes in the library.</p>`;
  if (!results) return;
  results.innerHTML = list.slice(0, 6).map(r => {
    const sp = r.species || {};
    const sci = sp.scientificNameWithoutAuthor || sp.scientificName || "";
    const common = (sp.commonNames && sp.commonNames[0]) || "";
    const score = Math.round((r.score || 0) * 100);
    const hit = matchSpeciesToName(sci);
    let map = "";
    let go = "";
    if (hit.kind === "exact" || hit.kind === "genus-one") {
      map = `<div class="small ok">In this library: ${esc(hit.species.common)}</div>`;
      go = `#/library/${hit.species.id}`;
    } else if (hit.kind === "genus") {
      map = `<div class="small warnc">Genus match — ${esc(hit.genus)} is in the library, but this exact species may not be. ${hit.candidates.map(c => c.common).join(", ")}.</div>`;
      go = `#/library/${hit.candidates[0].id}`;
    } else {
      map = `<div class="small muted">Not in this bonsai library. You can still read a close genus entry if you find one, or browse the library.</div>`;
    }
    return `<div class="match"${go ? ` data-go="${go}"` : ""}>
      <div class="grow">
        <b>${esc(sci)}</b>
        <div class="small muted">${esc(common)}</div>
        <div class="bar" aria-label="${score}%"><i style="width:${score}%"></i></div>
        <div class="tiny muted">${score}% confidence</div>
        ${map}
      </div>
    </div>`;
  }).join("");
}

async function shrinkImage(file) {
  try {
    const img = await new Promise((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = rej;
      i.src = URL.createObjectURL(file);
    });
    const max = 1600;
    let w = img.width, h = img.height;
    if (Math.max(w, h) > max) {
      const s = max / Math.max(w, h);
      w = Math.round(w * s); h = Math.round(h * s);
    }
    const c = document.createElement("canvas");
    c.width = w; c.height = h;
    c.getContext("2d").drawImage(img, 0, 0, w, h);
    const blob = await new Promise(res => c.toBlob(res, "image/jpeg", 0.9));
    return blob || file;
  } catch {
    return file;
  }
}

/* Guided leaf key */
const KEY_STEPS = [
  { id: "group", q: "What kind of foliage is it?", options: [
    { v: "broad", l: "Ordinary broad leaves" },
    { v: "needle", l: "Needles" },
    { v: "scale", l: "Scale-like sprays (hinoki, shimpaku)" },
    { v: "succulent", l: "Thick, fleshy, succulent leaves" }
  ]},
  { id: "evergreen", q: "Does it stay green through winter?", asBool: true, options: [
    { v: true, l: "Yes — evergreen" },
    { v: false, l: "No — it drops leaves or needles in fall" }
  ]},
  { id: "compound", q: "Is each leaf one blade, or made of leaflets?", show: f => f.group === "broad", options: [
    { v: "simple", l: "Simple — a single blade" },
    { v: "palmate-compound", l: "Palmate — leaflets radiate from one point (like an umbrella)" },
    { v: "pinnate", l: "Pinnate — leaflets along a midrib (like wisteria)" },
    { v: "bipinnate", l: "Bipinnate — feathery, twice-divided, many tiny leaflets" }
  ]},
  { id: "arrangement", q: "How are the leaves or needles arranged?", optionsFor: remaining => arrangementOptions(remaining) },
  { id: "lobed", q: "Is the leaf lobed?", show: f => f.group === "broad" && (f.compound === "simple" || !f.compound), options: [
    { v: "none", l: "Not lobed — a simple outline" },
    { v: "palmate", l: "Palmately lobed, usually 5–9 lobes (Japanese maple)" },
    { v: "trifoliate", l: "Three lobes, like a trident" },
    { v: "fan", l: "Fan-shaped, unique (ginkgo)" }
  ]},
  { id: "margin", q: "What does the leaf edge look like?", show: f => f.group === "broad" && (f.compound === "simple" || !f.compound), options: [
    { v: "entire", l: "Smooth (entire)" },
    { v: "serrate", l: "Toothed (serrate)" },
    { v: "double-serrate", l: "Doubly toothed" },
    { v: "crenate", l: "Blunt, rounded teeth (crenate)" },
    { v: "wavy", l: "Wavy, barely toothed" }
  ]}
];

function arrangementOptions(list) {
  const present = new Set(list.map(s => s.leaf.arrangement));
  const all = [
    { v: "opposite", l: "Opposite — two leaves at the same node (maples, olive, boxwood, privet)" },
    { v: "alternate", l: "Alternate — one leaf after another along the stem" },
    { v: "whorled", l: "Whorled — sharp needles in threes (procumbens juniper)" },
    { v: "fascicle-2", l: "Needles in bundles of 2" },
    { v: "fascicle-5", l: "Needles in bundles of 5" },
    { v: "tufted", l: "Tufts or rosettes of many needles on short spurs (larch, true cedar)" },
    { v: "spiral", l: "Single needles or leaves spaced around the stem" }
  ];
  return all.filter(o => present.has(o.v));
}

function nextKeyStep(filters, remaining) {
  for (const step of KEY_STEPS) {
    if (filters[step.id] !== undefined) continue;
    if (step.show && !step.show(filters)) continue;
    const opts = step.optionsFor ? step.optionsFor(remaining) : (step.options || []);
    const useful = opts.filter(o => remaining.some(s => {
      const L = s.leaf || {};
      if (step.asBool) return Boolean(L[step.id]) === Boolean(o.v);
      return String(L[step.id] || "") === String(o.v);
    }));
    if (useful.length <= 1) continue;
    return { ...step, options: useful };
  }
  return null;
}

function renderKeyPanel() {
  const qel = document.getElementById("keyQ");
  const hits = document.getElementById("keyHits");
  const count = document.getElementById("keyCount");
  if (!qel) return;
  const remaining = filterByLeaf(SPECIES, keyFilters).slice().sort((a,b) => a.common.localeCompare(b.common));
  const step = nextKeyStep(keyFilters, remaining);
  let qhtml = "";
  const chips = Object.entries(keyFilters).map(([k,v]) => {
    const label = typeof v === "boolean" ? (v ? "evergreen" : "deciduous") : String(v);
    return `<button class="chip on" data-unfilter="${esc(k)}">${esc(label)} ✕</button>`;
  }).join("");
  if (Object.keys(keyFilters).length) {
    qhtml += `<div class="chips wrap">${chips}<button class="chip" data-key-reset="1">Start over</button></div>`;
  }
  if (step && remaining.length > 1) {
    qhtml += `<p><b>${esc(step.q)}</b></p>` + step.options.map(o =>
      `<button class="opt" data-key="${esc(step.id)}" data-val="${esc(String(o.v))}">${esc(o.l)}</button>`
    ).join("");
  } else if (remaining.length === 1) {
    qhtml += `<div class="callout good"><span class="kicker">Likely match</span>The key points to <b>${esc(remaining[0].common)}</b>.</div>`;
  } else if (!step && remaining.length > 1) {
    qhtml += `<p class="small muted">No further questions in the key — here are the remaining library matches.</p>`;
  }
  qel.innerHTML = qhtml;
  if (count) count.textContent = remaining.length + " species in the library match these traits.";
  if (hits) {
    hits.innerHTML = remaining.slice(0, 24).map(s => `<div class="list-row" data-go="#/library/${s.id}">
      <div class="thumb">${glyph(s, 40)}</div>
      <div class="grow"><b>${esc(s.common)}</b><div class="sci">${esc(s.scientific)}</div></div>
    </div>`).join("") || `<div class="empty">No species in this library match those traits. Try starting over, or browse the library.</div>`;
  }
}

/* ---------- My trees ---------- */
function renderTrees() {
  if (!trees.length) {
    setView(`<h1>My trees</h1>
      <p class="lede">A private list stored on this phone — species, a nickname, a photo, notes, and the last repot date. Nothing is uploaded.</p>
      <div class="empty">You have not added a tree yet.</div>
      <button class="btn fill gold block" data-go="#/trees/new">Add a tree</button>`);
    return;
  }
  const rows = trees.map(t => {
    const s = speciesById(t.speciesId);
    const name = t.nickname || (s ? s.common : "Tree");
    return `<div class="card hit" data-go="#/trees/${encodeURIComponent(t.id)}">
      <div class="row">
        <div class="thumb" data-ph="${esc(t.id)}">${s ? glyph(s, 40) : ""}</div>
        <div class="grow">
          <div style="font-family:var(--serif);font-size:18px;color:var(--pine)">${esc(name)}</div>
          <div class="sci">${esc(s ? s.common + " · " + s.scientific : t.speciesId)}</div>
          ${t.lastRepot ? `<div class="tiny muted">Last repot ${esc(t.lastRepot)}</div>` : ""}
        </div>
      </div>
    </div>`;
  }).join("");
  setView(`<h1>My trees</h1>
    <p class="lede">${trees.length} tree${trees.length===1?"":"s"} on this device.</p>
    ${rows}
    <button class="btn fill gold block" data-go="#/trees/new">Add a tree</button>`);
  fillPhotos();
}

function renderTreeForm(editId) {
  const t = editId ? trees.find(x => x.id === editId) : null;
  const pre = (t && t.speciesId) || pendingSpecies || "";
  pendingSpecies = null;
  const opts = SPECIES.slice().sort((a,b)=>a.common.localeCompare(b.common))
    .map(s => `<option value="${s.id}"${pre===s.id?" selected":""}>${esc(s.common)} (${esc(s.scientific)})</option>`).join("");
  setView(`<button class="back" data-go="${t ? "#/trees/"+t.id : "#/trees"}">‹ Back</button>
    <h1>${t ? "Edit tree" : "Add a tree"}</h1>
    <form id="treeForm" class="card">
      <label class="field"><span>Species</span>
        <select name="speciesId" required><option value="">Choose a species</option>${opts}</select>
      </label>
      <label class="field"><span>Nickname</span>
        <input type="text" name="nickname" placeholder="e.g. Front porch maple" value="${esc(t && t.nickname || "")}">
      </label>
      <label class="field"><span>Photo (stored only on this phone)</span>
        <input type="file" name="photo" accept="image/*" capture="environment">
      </label>
      <div id="editPreview"></div>
      <label class="field"><span>Last repot</span>
        <input type="month" name="lastRepot" value="${esc(t && t.lastRepot || "")}">
      </label>
      <label class="field"><span>Notes</span>
        <textarea name="notes" placeholder="Soil mix, wire to check, a weak branch…">${esc(t && t.notes || "")}</textarea>
      </label>
      <button class="btn fill block" type="submit">${t ? "Save changes" : "Save tree"}</button>
    </form>`);
  if (t) loadPhoto(t.id).then(u => {
    if (u) {
      const el = document.getElementById("editPreview");
      if (el) el.innerHTML = `<img class="preview" alt="" src="${u}">`;
    }
  });
  const form = document.getElementById("treeForm");
  if (form) form.addEventListener("submit", ev => onSaveTree(ev, t && t.id));
}

async function onSaveTree(ev, editId) {
  ev.preventDefault();
  const fd = new FormData(ev.target);
  const speciesId = String(fd.get("speciesId") || "");
  if (!speciesById(speciesId)) { alert("Please choose a species."); return; }
  const rec = {
    id: editId || uid(),
    speciesId,
    nickname: String(fd.get("nickname") || "").trim(),
    notes: String(fd.get("notes") || "").trim(),
    lastRepot: String(fd.get("lastRepot") || "").trim(),
    added: (editId && (trees.find(t => t.id === editId) || {}).added) || nowNY().toISOString()
  };
  const file = ev.target.photo && ev.target.photo.files && ev.target.photo.files[0];
  if (file) {
    try { await savePhoto(rec.id, await shrinkImage(file)); rec.hasPhoto = true; }
    catch { rec.hasPhoto = false; }
  } else if (editId) {
    rec.hasPhoto = !!(trees.find(t => t.id === editId) || {}).hasPhoto;
  }
  if (editId) trees = trees.map(t => t.id === editId ? rec : t);
  else trees = [rec, ...trees];
  saveTrees();
  go("#/trees/" + rec.id);
}

async function renderTreeDetail(id) {
  const t = trees.find(x => x.id === id);
  if (!t) { setView(`<p>Tree not found.</p><button class="btn" data-go="#/trees">Back</button>`); return; }
  const s = speciesById(t.speciesId);
  const name = t.nickname || (s ? s.common : "Tree");
  const month = currentMonth();
  const tasks = s ? tasksFor(s, month, settings.zone, t.lastRepot) : [];
  const photo = t.hasPhoto ? await loadPhoto(t.id) : "";
  setView(`<button class="back" data-go="#/trees">‹ My trees</button>
    ${photo ? `<img class="tree-hero" alt="${esc(name)}" src="${photo}">` : ""}
    <h1>${esc(name)}</h1>
    ${s ? `<div class="sci">${esc(s.common)} · <em>${esc(s.scientific)}</em></div>` : ""}
    ${t.lastRepot ? `<p class="small muted">Last repot: ${esc(t.lastRepot)}</p>` : ""}
    ${t.notes ? `<div class="card"><b>Notes</b><p>${esc(t.notes)}</p></div>` : ""}
    <h2>${esc(MONTHS[month-1])} tasks</h2>
    <div class="card">
      ${tasks.map(tk => `<div class="task"><div class="dot ${esc(tk.kind)}"></div><div class="grow"><b>${esc(tk.title)}</b><div class="small muted">${esc(tk.body)}</div></div></div>`).join("") || "<p class='muted'>No special tasks this month.</p>"}
      ${s ? `<p class="small" style="margin-top:8px">${esc(s.calendar[String(month)])}</p>` : ""}
    </div>
    <div class="stack">
      ${s ? `<button class="btn fill" data-go="#/library/${s.id}">Open full care guide</button>` : ""}
      <button class="btn" data-go="#/trees/edit/${encodeURIComponent(t.id)}">Edit</button>
      <button class="btn danger" data-del="${esc(t.id)}">Delete from My trees</button>
    </div>`);
}

async function fillPhotos() {
  const nodes = document.querySelectorAll("[data-ph]");
  for (const n of nodes) {
    const id = n.getAttribute("data-ph");
    const t = trees.find(x => x.id === id);
    if (!t || !t.hasPhoto) continue;
    const u = await loadPhoto(id);
    if (u) n.innerHTML = `<img alt="" src="${u}" style="width:100%;height:100%;object-fit:cover">`;
  }
}

/* ---------- Settings & guide ---------- */
function renderSettings() {
  const zopts = `<option value="">Choose a zone</option>` + ZONE_OPTIONS.map(z => {
    const t = zoneTempF(z);
    const range = t ? " · " + fmtTempRange(t.lo, t.hi) : "";
    return `<option value="${z}"${settings.zone===z?" selected":""}>Zone ${z}${range}</option>`;
  }).join("");
  setView(`<h1>Settings</h1>
    <div class="card">
      <h2 style="margin-top:0">Your hardiness zone</h2>
      <p class="small muted">Used for This month’s reminders. Based on the 2023 USDA Plant Hardiness Zone Map ZIP tables from the PRISM Climate Group / USDA-ARS. This lookup is <b>not</b> the official USDA map. A potted bonsai is typically 1–2 zones less hardy than a landscape tree in the same zone.</p>
      <label class="field"><span>U.S. ZIP code</span>
        <div class="row"><input type="text" id="zip" inputmode="numeric" pattern="[0-9]*" maxlength="5" placeholder="e.g. 10001" value="${esc(settings.zip || "")}">
        <button class="btn" id="zipBtn" type="button">Look up</button></div>
      </label>
      <div id="zipMsg" class="small"></div>
      <label class="field"><span>Or pick a zone</span>
        <select id="zonePick">${zopts}</select>
      </label>
    </div>
    <div class="card">
      <h2 style="margin-top:0">Temperature units</h2>
      <div class="chips wrap">
        <button class="chip${settings.units==="F"?" on":""}" data-units="F">°F</button>
        <button class="chip${settings.units==="C"?" on":""}" data-units="C">°C</button>
      </div>
    </div>
    <div class="card" id="api-key-card">
      <h2 style="margin-top:0">Pl@ntNet photo ID</h2>
      <p class="small muted">Optional. The key is stored only on this device and is sent from your phone directly to Pl@ntNet — not to us, and not through a server of ours.</p>
      <label class="field"><span>Personal API key</span>
        <input type="password" id="apiKey" autocomplete="off" placeholder="Paste your key" value="${esc(settings.plantnetKey || "")}">
      </label>
      <button class="btn fill" id="saveKey">Save key</button>
      <div id="keySaved" class="small ok" hidden>Saved on this phone.</div>
      <h3>How to get a free key</h3>
      <ol class="ol small">
        <li>Open <a href="https://my.plantnet.org" target="_blank" rel="noopener">my.plantnet.org</a> and create a free account, or sign in.</li>
        <li>Go to your API key settings (the API key page in your account).</li>
        <li>Generate your private API key if you do not already have one.</li>
        <li>Check <b>Expose my API key</b> so the key can be used from a browser.</li>
        <li>Under <b>Authorized domains</b>, add exactly this origin, on its own line:<br><code>https://dpalcic-create.github.io</code><br>CORS treats http and https as different origins, so the <code>https://</code> matters.</li>
        <li>Copy the key and paste it above. It never leaves this phone except to call Pl@ntNet.</li>
      </ol>
    </div>
    <div class="card install">
      <h2 style="margin-top:0">Add to your iPhone Home Screen</h2>
      <ol class="ol">
        <li>Open this page in Safari.</li>
        <li>Tap the Share button.</li>
        <li>Tap <b>Add to Home Screen</b>, then Add.</li>
      </ol>
      <p>Once it is installed, the species library, your trees, and the leaf key work offline. Photo ID still needs a network connection and your Pl@ntNet key.</p>
    </div>
    <button class="btn block" data-go="#/guide">Winterizing guide</button>
    <p class="tiny muted" style="margin-top:18px">Care notes are conservative, for Northern Hemisphere / U.S. USDA zones. Cultivars and local weather vary; when sources disagree, this app gives a range. It is not a substitute for watching the actual tree in front of you. Landscape zone ranges describe the species as a garden tree — a pot is colder at the roots.</p>
  `);
}

function renderGuide() {
  setView(`<button class="back" data-go="#/settings">‹ Settings</button>
    <h1>Winterizing a bonsai</h1>
    <p class="lede">Pots are the reason winter is harder than it looks. The same maple that is happy in a zone 5 garden can be hurt in a shallow pot in the same yard, because roots sit above ground and freeze faster.</p>
    <div class="callout"><span class="kicker">The 1–2 zone rule</span>
      As a starting point, treat a tree in a bonsai pot as about 1–2 USDA zones less hardy than the landscape range in its guide. If a species is listed as hardy to zone 5 in the ground, protect a potted tree as if you were in zone 6 or 7. This app also lists a conservative root-zone temperature and a “protect below” night temperature for each species.
    </div>
    <h2>Who needs what</h2>
    <div class="card">
      <p><b>Temperate deciduous trees</b> (maples, elms, zelkova, hornbeam, larch, bald cypress, ginkgo, quince, crabapple) need a genuine cold rest. Do not keep them in a warm living room all winter. Protect the pot, and keep the root ball from drying out or from cycling through hard freeze–thaw in a tiny container.</p>
      <p><b>Hardy evergreens</b> (pines, junipers, hinoki, yew, spruce, hemlock, boxwood, azalea) also need that cold rest, plus light and a windbreak. A dark, warm garage is a poor long-term home for an evergreen. Winter burn is usually wind and sun on dry roots.</p>
      <p><b>Mediterranean trees</b> (olive, often pomegranate) want a cool, bright, frost-free rest — a sunroom or a windowed garage in the mid-30s to 50s°F is typical in cold states.</p>
      <p><b>Tropicals and tender subtropicals</b> (Ficus, jade, Fukien tea, serissa, schefflera, bougainvillea, Brazilian rain tree, buttonwood) must come in before chilly nights, usually around 45–55°F depending on the species. They do not want a freeze, and they do want light.</p>
    </div>
    <h2>Ways to protect a pot</h2>
    <div class="card">
      <p><b>Plunge or mulch.</b> Set the pot in the ground up to the rim, or bury it in a box of mulch, leaves, or wood chips, in a sheltered spot. This is the traditional, effective method for hardy trees.</p>
      <p><b>Cold frame or unheated greenhouse.</b> Bright and cold, with the pots insulated. Watch for surprise warm days, and for mice.</p>
      <p><b>Unheated garage or shed.</b> Fine for leafless hardy deciduous trees if it stays mostly in the mid-20s to 40s°F and the pot does not dry out. Evergreens still need as much light as you can give them. A garage that regularly climbs into the 50s°F is often too warm for a clean dormancy.</p>
      <p><b>Wrapping.</b> Foam, bubble wrap, or a pot-in-a-box can protect roots on a balcony. Still give wind protection to evergreen foliage, and still check water.</p>
    </div>
    <h2>Water, light, and what not to do</h2>
    <div class="card">
      <p>Evergreen foliage transpires all winter. A bone-dry pot in a January wind is a common way to lose a pine or a boxwood. Water on milder days, and never leave a pot sitting in a frozen saucer of water.</p>
      <p>Do not fertilize a hardy tree late in the season if you want it to harden off. Do not repot a hardy tree in autumn in the North. Do not suddenly move a tropical from a 40°F porch into a dark, hot room and then overwater it when the leaves drop.</p>
      <p>In spring, protect tender new leaves and swelling flower buds from a late frost — a cover for one night can save a year’s display on quince, apricot, or azalea.</p>
    </div>
    <p class="small muted">These are conservative, Northern Hemisphere guidelines. Watch the tree, the weather, and your own site — a windy rooftop and a sheltered courtyard are not the same zone in practice.</p>
    <button class="btn" data-go="#/library">Browse species</button>`);
}

/* ---------- ZIP lookup (lazy-loads zones.js) ---------- */
function loadZones() {
  if (typeof zoneFromZip === "function") return Promise.resolve();
  if (loadZones._p) return loadZones._p;
  loadZones._p = new Promise((res, rej) => {
    const s = document.createElement("script");
    s.src = "zones.js";
    s.onload = () => res();
    s.onerror = () => rej(new Error("Could not load ZIP data"));
    document.head.appendChild(s);
  });
  return loadZones._p;
}
async function lookupZip() {
  const input = document.getElementById("zip");
  const msg = document.getElementById("zipMsg");
  const zip = (input && input.value || "").replace(/\D/g, "").slice(0, 5);
  if (zip.length !== 5) { if (msg) msg.innerHTML = `<span class="bad">Enter a 5-digit U.S. ZIP code.</span>`; return; }
  if (msg) msg.textContent = "Looking up…";
  try {
    await loadZones();
    const z = zoneFromZip(zip);
    if (!z) {
      if (msg) msg.innerHTML = `<span class="warnc">ZIP ${esc(zip)} is not in the 2023 PHZM ZIP tables (not every ZIP is included). Please pick a zone manually.</span>`;
      settings.zip = zip; saveSettings(); return;
    }
    settings.zip = zip; settings.zone = z; saveSettings();
    const t = typeof zoneTempRange === "function" ? zoneTempRange(z) : "";
    if (msg) msg.innerHTML = `<span class="ok">ZIP ${esc(zip)} is landscape zone <b>${esc(z)}</b>${t ? " (average annual extreme minimum about " + esc(t) + "°F)" : ""}. Remember that a pot is typically 1–2 zones less hardy.</span>`;
    const sel = document.getElementById("zonePick");
    if (sel) sel.value = z;
  } catch (e) {
    if (msg) msg.innerHTML = `<span class="bad">${esc(e.message || "Lookup failed. Pick a zone manually.")}</span>`;
  }
}

/* ---------- events ---------- */
document.addEventListener("click", e => {
  const tab = e.target.closest("#tabs button");
  if (tab) { e.preventDefault(); go("#/" + tab.dataset.tab); return; }
  const goEl = e.target.closest("[data-go]");
  if (goEl) { e.preventDefault(); go(goEl.getAttribute("data-go")); return; }
  const add = e.target.closest("[data-add]");
  if (add) { e.preventDefault(); pendingSpecies = add.getAttribute("data-add"); go("#/trees/new"); return; }
  const del = e.target.closest("[data-del]");
  if (del) {
    const id = del.getAttribute("data-del");
    if (confirm("Remove this tree from My trees? The care guide in the library is not affected.")) {
      trees = trees.filter(t => t.id !== id);
      saveTrees();
      deletePhoto(id);
      go("#/trees");
    }
    return;
  }
  const filter = e.target.closest("[data-filter]");
  if (filter) { libFilter = filter.getAttribute("data-filter"); renderLibrary(); return; }
  const units = e.target.closest("[data-units]");
  if (units) { settings.units = units.getAttribute("data-units"); saveSettings(); renderSettings(); return; }
  if (e.target.id === "zipBtn") { lookupZip(); return; }
  if (e.target.id === "saveKey") {
    const inp = document.getElementById("apiKey");
    settings.plantnetKey = (inp && inp.value || "").trim();
    saveSettings();
    const ok = document.getElementById("keySaved");
    if (ok) { ok.hidden = false; }
    return;
  }
  const keyBtn = e.target.closest("[data-key]");
  if (keyBtn) {
    const id = keyBtn.getAttribute("data-key");
    let val = keyBtn.getAttribute("data-val");
    if (val === "true") val = true;
    else if (val === "false") val = false;
    keyFilters = { ...keyFilters, [id]: val };
    renderKeyPanel();
    return;
  }
  if (e.target.closest("[data-key-reset]")) { keyFilters = {}; renderKeyPanel(); return; }
  const un = e.target.closest("[data-unfilter]");
  if (un) {
    const k = un.getAttribute("data-unfilter");
    const next = { ...keyFilters }; delete next[k]; keyFilters = next;
    renderKeyPanel();
  }
});
document.addEventListener("change", e => {
  if (e.target.id === "zonePick") {
    settings.zone = e.target.value;
    saveSettings();
  }
});

window.addEventListener("hashchange", route);
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => navigator.serviceWorker.register("./sw.js"));
}

route();
