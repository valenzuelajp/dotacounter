# DotaCounter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the DotaCounter static site slice by slice until it is live on GitHub Pages with picker, synergy, hero detail, and meta views.

**Architecture:** Plain HTML/CSS/JS, no framework, no build step. JSON data files loaded with `fetch` plus baked fallback. One Node script (built-in `fetch` only) refreshes stats at deploy time.

**Tech Stack:** HTML, CSS, vanilla JS (browser + Node 18 for the script only), JSON data, GitHub Pages.

**Spec:** `docs/superpowers/specs/2026-09-30-dotacounter-design.md`

## Global Constraints

- Free-only: GitHub Pages, OpenDota free endpoints, no keys, no backend, no paid APIs.
- Beginner-friendly: plain HTML/CSS/JS, small commented functions, no clever one-liners.
- Semantic CSS class names only (`.hero-card`, `.counter-list`, `.synergy-badge`), never abbreviated or numbered.
- Assets: `assets/heroes/<hero-id>.png`, `assets/items/<item-id>.png`, lowercase-hyphen, matching JSON `id` exactly.
- All URLs relative (`./assets/...`, `./data/...`) so the site works under the `/dotacounter/` subpath.
- Repo root for all paths below: `A:/Github/dotacounter`.

## Review Focus

- Empty enemy selection renders a friendly prompt, not an empty list or error.
- Hero `id` in JSON with no matching PNG shows `placeholder.png`, never a broken icon.
- OpenDota unreachable at runtime: page renders baked data plus the "offline data" note.
- `matchups.json` committed empty or invalid: page still renders curated data, no blank screen.
- Site served under `/dotacounter/` subpath: CSS, JS, images, and JSON all load (no root-absolute `/assets` paths).

---

### Task 1: Scaffold + GitHub Pages live

**Files:**
- Create: `index.html`, `css/style.css`, `README.md`, `assets/heroes/placeholder.png` (note in step), `js/` (empty dir placeholder via `.gitkeep` if needed)
- Modify: none

**Interfaces:**
- Consumes: nothing
- Produces: page shell with `<div class="picker-view">`, `<div class="counter-list">`, stylesheet link `./css/style.css`, used by Tasks 3–6

- [ ] **Step 1: Write `index.html` shell**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>DotaCounter — Dota 2 counter picker</title>
  <link rel="stylesheet" href="./css/style.css">
</head>
<body>
  <header class="site-header">
    <h1 class="site-title">DotaCounter</h1>
    <p class="patch-label">Patch: loading…</p>
    <nav class="site-nav">
      <a class="nav-link" href="./index.html">Picker</a>
      <a class="nav-link" href="./meta.html">Meta</a>
    </nav>
  </header>
  <main class="picker-view">
    <section class="enemy-picker">
      <h2 class="section-title">Enemy team (pick up to 5)</h2>
      <div class="hero-grid"></div>
    </section>
    <section class="counter-results">
      <h2 class="section-title">Best counters</h2>
      <p class="empty-prompt">Pick at least one enemy hero to see counters.</p>
      <div class="counter-list"></div>
    </section>
  </main>
  <p class="offline-note" hidden>Showing offline data — live stats unavailable.</p>
  <script src="./js/data-loader.js"></script>
  <script src="./js/scoring.js"></script>
  <script src="./js/app.js"></script>
</body>
</html>
```

- [ ] **Step 2: Write `css/style.css` seed (semantic names only)**

```css
/* Base layout — semantic class names, full words only. */
.site-header { max-width: 960px; margin: 0 auto; padding: 16px; }
.site-title { font-size: 28px; margin: 0; }
.patch-label { color: #666; }
.site-nav { display: flex; gap: 12px; margin-top: 8px; }
.nav-link { text-decoration: none; }
.picker-view { max-width: 960px; margin: 0 auto; padding: 16px; }
.section-title { font-size: 20px; }
.hero-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(96px, 1fr)); gap: 8px; }
.hero-card { border: 1px solid #ccc; border-radius: 8px; padding: 8px; text-align: center; cursor: pointer; }
.hero-card-selected { outline: 2px solid #2f81f7; }
.counter-list { display: flex; flex-direction: column; gap: 8px; }
.counter-reason { color: #444; }
.empty-prompt { color: #666; }
.offline-note { max-width: 960px; margin: 0 auto; padding: 8px 16px; color: #8a5a00; }
```

- [ ] **Step 3: Write `README.md` (points beginners at the vault wiki)**

```markdown
# DotaCounter

Free static Dota 2 counter-pick helper. Live at `https://<user>.github.io/dotacounter/` after Pages setup.

Beginner docs live in the Obsidian vault: `A:/vault/dotacounter/dotacoutner/DotaCounter Wiki.md`
(start there: how to add a hero, asset/classname rules, updating the meta).

## Run locally

Open `index.html` in a browser, or serve the folder: `python -m http.server` then visit `http://localhost:8000`.

## Deploy

Push `main` → GitHub → Settings → Pages → Deploy from branch (`main`, `/root`).
```

- [ ] **Step 4: Verify shell renders with no console errors**

Run: open `index.html` in a browser (or `python -m http.server` in repo root, visit the URL).
Expected: title, nav, "Pick at least one enemy hero" prompt visible; console has 404s for the three JS files only (they land in Tasks 3–5) and zero other errors.

- [ ] **Step 5: Commit**

```bash
git add index.html css/style.css README.md
git commit -m "feat: add page shell with semantic styles"
```

### Task 2: Data seed (3 heroes + meta + matchups skeleton)

**Files:**
- Create: `data/heroes.json`, `data/meta.json`, `data/matchups.json`

**Interfaces:**
- Consumes: nothing
- Produces: `heroes.json` shape (`id`, `name`, `role`, `image`, `counters[]`, `counterItems[]`, `skillTips[]`) consumed by Tasks 3–6; `meta.json` (`patch`, `tiers`, `updatedAt`) consumed by Tasks 3 and 7

- [ ] **Step 1: Write `data/heroes.json` with 3 sample heroes**

```json
[
  {
    "id": "axe",
    "name": "Axe",
    "role": "initiator",
    "image": "assets/heroes/axe.png",
    "counters": [{ "hero": "lion", "reason": "Hex pierces Berserker's Call" }],
    "counterItems": [{ "item": "blade-mail", "when": "Reflect burst vs squishy supports" }],
    "skillTips": ["Blink in after the enemy support shows"]
  },
  {
    "id": "lion",
    "name": "Lion",
    "role": "support",
    "image": "assets/heroes/lion.png",
    "counters": [{ "hero": "juggernaut", "reason": "Hex and Earth Spike pierce Blade Fury" }],
    "counterItems": [{ "item": "blink-dagger", "when": "To initiate on Omnislash" }],
    "skillTips": ["Save Hex for Blade Fury spin"]
  },
  {
    "id": "juggernaut",
    "name": "Juggernaut",
    "role": "carry",
    "image": "assets/heroes/juggernaut.png",
    "counters": [{ "hero": "axe", "reason": "Berserker's Call locks him during Omnislash" }],
    "counterItems": [{ "item": "black-king-bar", "when": "To ignore Lion's disables in fights" }],
    "skillTips": ["Spin to dodge Berserker's Call timing"]
  }
]
```

- [ ] **Step 2: Write `data/meta.json` and `data/matchups.json`**

```json
// data/meta.json
{
  "patch": "7.39",
  "tiers": { "S": ["axe"], "A": ["lion"], "B": ["juggernaut"], "C": [] },
  "updatedAt": "2026-09-30"
}
```

```json
// data/matchups.json
{
  "patch": "7.39",
  "updatedAt": "2026-09-30",
  "pairs": { "axe|lion": { "games": 0, "wins": 0, "source": "seed" } }
}
```

- [ ] **Step 3: Validate all three files parse as JSON**

Run: `node -e "for (const f of ['data/heroes.json','data/meta.json','data/matchups.json']) { JSON.parse(require('fs').readFileSync(f,'utf8')); console.log(f,'OK'); }"` from repo root.
Expected: all three print `OK`.

- [ ] **Step 4: Commit**

```bash
git add data/heroes.json data/meta.json data/matchups.json
git commit -m "feat: seed hero, meta, and matchup data"
```

### Task 3: Data loader with offline fallback

**Files:**
- Create: `js/data-loader.js`
- Test: browser checklist (no framework in v1 per spec §8)

**Interfaces:**
- Consumes: `data/heroes.json`, `data/meta.json`, `data/matchups.json` (Task 2)
- Produces: `window.DotaCounter.loadData()` returning `{ heroes, meta, matchups, offline }`, consumed by Tasks 5–7

- [ ] **Step 1: Write `js/data-loader.js`**

```js
// data-loader: loads baked JSON, falls back gracefully, flags offline mode.
// Every fetch is relative ("./data/...") so the /dotacounter/ subpath works.
window.DotaCounter = window.DotaCounter || {};

window.DotaCounter.loadData = async function loadData() {
  // Load one JSON file; return null instead of throwing.
  async function loadFile(path) {
    try {
      const response = await fetch(path);
      if (!response.ok) return null;
      return await response.json();
    } catch (error) {
      return null;
    }
  }

  const heroes = (await loadFile("./data/heroes.json")) || [];
  const meta = (await loadFile("./data/meta.json")) || { patch: "unknown", tiers: {}, updatedAt: "unknown" };
  const matchups = (await loadFile("./data/matchups.json")) || { pairs: {} };

  // Offline means: we could not reach the live stats endpoint, so the page
  // shows baked data with a note. Live refresh is attempted by the caller.
  let offline = false;
  try {
    const probe = await fetch("https://api.opendota.com/api/heroes", { method: "HEAD" });
    if (!probe.ok) offline = true;
  } catch (error) {
    offline = true;
  }

  const note = document.querySelector(".offline-note");
  if (note) note.hidden = !offline;

  const label = document.querySelector(".patch-label");
  if (label) label.textContent = "Patch: " + meta.patch;

  return { heroes, meta, matchups, offline };
};
```

- [ ] **Step 2: Syntax-check the file**

Run: `node --check js/data-loader.js`
Expected: no output, exit 0.

- [ ] **Step 3: Verify in browser (online then offline)**

Run: serve repo root (`python -m http.server`), open `index.html`, confirm `.patch-label` reads "Patch: 7.39". Then DevTools → Network → Offline → reload, confirm page still renders and `.offline-note` becomes visible.
Expected: both states render; no blank screen; no console errors besides missing `scoring.js`/`app.js` (Tasks 4–5).

- [ ] **Step 4: Commit**

```bash
git add js/data-loader.js
git commit -m "feat: load baked data with offline fallback"
```

### Task 4: Counter scoring (pure, node-testable)

**Files:**
- Create: `js/scoring.js`
- Test: `js/scoring.test.js` (plain `node`, no framework — pure functions have no DOM)

**Interfaces:**
- Consumes: hero objects from Task 2 shape
- Produces: `window.DotaCounter.scoreCounters(picks, heroes)` and `window.DotaCounter.suggestSynergy(allyTeam, enemyTeam, heroes)`, consumed by Tasks 5–6

- [ ] **Step 1: Write the failing test `js/scoring.test.js`**

```js
// Plain-node test: node js/scoring.test.js (exit non-zero on failure).
const fs = require("fs");
const vm = require("vm");

const context = { window: { DotaCounter: {} } };
vm.createContext(context);
vm.runInContext(fs.readFileSync(__dirname + "/scoring.js", "utf8"), context);
const { scoreCounters, suggestSynergy } = context.window.DotaCounter;

function assertEqual(actual, expected, name) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) {
    console.error("FAIL " + name + "\n  actual:   " + a + "\n  expected: " + e);
    process.exitCode = 1;
  } else {
    console.log("PASS " + name);
  }
}

const heroes = JSON.parse(fs.readFileSync(__dirname + "/../data/heroes.json", "utf8"));

// Lion counters juggernaut directly (+2) => lion must rank first.
const ranked = scoreCounters(["juggernaut"], heroes);
assertEqual(ranked[0].id, "lion", "direct counter ranks first");
assertEqual(ranked[0].score >= 2, true, "direct counter scores +2");

// Empty picks => empty ranking, never an error.
assertEqual(scoreCounters([], heroes), [], "empty picks give empty ranking");

// Tiebreak is alphabetical so output is stable.
const tied = scoreCounters(["axe"], heroes).filter((r) => r.score > 0).map((r) => r.id);
assertEqual(tied, [...tied].sort(), "ties broken alphabetically");

// Synergy: ally axe + enemy juggernaut => lion suggested (counters juggernaut).
const pick = suggestSynergy(["axe"], ["juggernaut"], heroes);
assertEqual(pick.id, "lion", "synergy suggests the counter the team needs");
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node js/scoring.test.js`
Expected: FAIL with `scoreCounters is not a function` (file does not exist yet).

- [ ] **Step 3: Write minimal implementation `js/scoring.js`**

```js
// scoring: +2 per direct counter hit, +1 per role-synergy hit,
// alphabetical tiebreak. Deterministic and explainable.
window.DotaCounter = window.DotaCounter || {};

// Rank every hero against the enemy picks (array of hero ids).
// Returns [{ id, name, score, reasons[] }] sorted best-first, zeroes dropped.
window.DotaCounter.scoreCounters = function scoreCounters(enemyIds, heroes) {
  const enemies = new Set(enemyIds);
  const ranked = [];

  for (const hero of heroes) {
    let score = 0;
    const reasons = [];
    for (const counter of hero.counters || []) {
      if (enemies.has(counter.hero)) {
        score += 2;
        reasons.push(counter.reason);
      }
    }
    if (score > 0) {
      ranked.push({ id: hero.id, name: hero.name, score, reasons });
    }
  }

  ranked.sort((a, b) => b.score - a.score || (a.id < b.id ? -1 : 1));
  return ranked;
};

// Suggest one next pick for the ally team given both teams (arrays of ids).
// Reuses scoreCounters, then prefers picks whose role the allies lack.
window.DotaCounter.suggestSynergy = function suggestSynergy(allyIds, enemyIds, heroes) {
  const allies = new Set(allyIds);
  const allyRoles = new Set(
    heroes.filter((h) => allies.has(h.id)).map((h) => h.role)
  );
  const ranked = window.DotaCounter.scoreCounters(enemyIds, heroes);
  const candidates = ranked.filter((r) => !allies.has(r.id));
  if (candidates.length === 0) return null;

  // +1 synergy point when the candidate's role is missing from the allies.
  for (const candidate of candidates) {
    const hero = heroes.find((h) => h.id === candidate.id);
    candidate.synergyNote = "";
    if (hero && !allyRoles.has(hero.role)) {
      candidate.score += 1;
      candidate.synergyNote = "Fills missing role: " + hero.role;
    }
  }
  candidates.sort((a, b) => b.score - a.score || (a.id < b.id ? -1 : 1));
  return candidates[0];
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node js/scoring.test.js`
Expected: all 5 lines `PASS`, exit 0.

- [ ] **Step 5: Commit**

```bash
git add js/scoring.js js/scoring.test.js
git commit -m "feat: add explainable counter and synergy scoring"
```

### Task 5: Picker UI wiring (`app.js`)

**Files:**
- Create: `js/app.js`

**Interfaces:**
- Consumes: `window.DotaCounter.loadData()` (Task 3), `scoreCounters` (Task 4)
- Produces: working picker on `index.html`; hero-detail rendering reused by Task 6

- [ ] **Step 1: Write `js/app.js` (picker + counter list + hero detail)**

```js
// app: wires the picker grid to the scoring module and renders results.
// Function-per-job, each small enough for a beginner to read top to bottom.
(function app() {
  const state = { heroes: [], selected: [] };

  // Render clickable hero cards into .hero-grid (max 5 selected).
  function renderGrid() {
    const grid = document.querySelector(".hero-grid");
    grid.innerHTML = "";
    for (const hero of state.heroes) {
      const card = document.createElement("button");
      card.className = "hero-card" + (state.selected.includes(hero.id) ? " hero-card-selected" : "");
      card.dataset.heroId = hero.id;
      const img = document.createElement("img");
      img.src = "./" + hero.image;
      img.alt = hero.name;
      img.onerror = () => { img.src = "./assets/heroes/placeholder.png"; };
      const name = document.createElement("div");
      name.className = "hero-name";
      name.textContent = hero.name;
      card.append(img, name);
      card.addEventListener("click", () => toggleHero(hero.id));
      grid.appendChild(card);
    }
  }

  // Toggle one hero (cap at 5), then re-render grid + results.
  function toggleHero(id) {
    if (state.selected.includes(id)) {
      state.selected = state.selected.filter((h) => h !== id);
    } else if (state.selected.length < 5) {
      state.selected.push(id);
    }
    renderGrid();
    renderResults();
  }

  // Render ranked counters into .counter-list with reasons.
  function renderResults() {
    const list = document.querySelector(".counter-list");
    const prompt = document.querySelector(".empty-prompt");
    list.innerHTML = "";
    if (state.selected.length === 0) {
      if (prompt) prompt.hidden = false;
      return;
    }
    if (prompt) prompt.hidden = true;
    const ranked = window.DotaCounter.scoreCounters(state.selected, state.heroes);
    for (const entry of ranked.slice(0, 5)) {
      const item = document.createElement("div");
      item.className = "counter-entry";
      const title = document.createElement("strong");
      title.className = "counter-name";
      title.textContent = entry.name + " (+" + entry.score + ")";
      const reason = document.createElement("p");
      reason.className = "counter-reason";
      reason.textContent = entry.reasons.join("; ");
      const detail = document.createElement("button");
      detail.className = "counter-detail-link";
      detail.textContent = "Items + skill tips";
      detail.addEventListener("click", () => renderHeroDetail(entry.id));
      item.append(title, reason, detail);
      list.appendChild(item);
    }
  }

  // Render one hero's items + skill tips under the results.
  function renderHeroDetail(id) {
    const hero = state.heroes.find((h) => h.id === id);
    if (!hero) return;
    let panel = document.querySelector(".hero-detail");
    if (!panel) {
      panel = document.createElement("section");
      panel.className = "hero-detail";
      document.querySelector(".counter-results").appendChild(panel);
    }
    panel.innerHTML = "";
    const title = document.createElement("h3");
    title.className = "hero-detail-title";
    title.textContent = hero.name + " — items & skill tips";
    panel.appendChild(title);
    for (const entry of hero.counterItems || []) {
      const line = document.createElement("p");
      line.className = "hero-detail-item";
      line.textContent = entry.item + " — " + entry.when;
      panel.appendChild(line);
    }
    for (const tip of hero.skillTips || []) {
      const line = document.createElement("p");
      line.className = "hero-detail-tip";
      line.textContent = tip;
      panel.appendChild(line);
    }
  }

  // Boot: load data, then paint the grid.
  window.DotaCounter.loadData().then((data) => {
    state.heroes = data.heroes;
    renderGrid();
  });
})();
```

- [ ] **Step 2: Syntax-check**

Run: `node --check js/app.js`
Expected: no output, exit 0.

- [ ] **Step 3: Verify picker in browser**

Run: serve repo root, open `index.html`, click Juggernaut's card.
Expected: Lion appears first in `.counter-list` with its reason; "Items + skill tips" opens Lion's items/tips; console has zero errors.

- [ ] **Step 4: Commit**

```bash
git add js/app.js
git commit -m "feat: wire picker grid to counter scoring"
```

### Task 6: Team synergy section on `index.html`

**Files:**
- Modify: `index.html` (add synergy section markup), `css/style.css` (add synergy classes), `js/app.js` (append synergy wiring)

**Interfaces:**
- Consumes: `suggestSynergy` (Task 4), grid pattern from Task 5
- Produces: completed `index.html` (picker + synergy + hero detail)

- [ ] **Step 1: Add synergy markup to `index.html` (insert after `.counter-results` section)**

```html
    <section class="synergy-view">
      <h2 class="section-title">Team synergy — best next pick</h2>
      <div class="synergy-teams">
        <div class="synergy-allies">
          <h3 class="synergy-subtitle">Your team (up to 4, then we suggest)</h3>
          <div class="hero-grid synergy-grid-allies"></div>
        </div>
        <div class="synergy-enemies">
          <h3 class="synergy-subtitle">Enemy team (up to 5)</h3>
          <div class="hero-grid synergy-grid-enemies"></div>
        </div>
      </div>
      <div class="synergy-result">
        <p class="synergy-prompt">Pick allies and enemies to get a suggestion.</p>
        <div class="synergy-badge" hidden></div>
      </div>
    </section>
```

- [ ] **Step 2: Append synergy CSS to `css/style.css`**

```css
.synergy-view { margin-top: 24px; }
.synergy-teams { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
.synergy-subtitle { font-size: 16px; }
.synergy-result { margin-top: 12px; }
.synergy-badge { border: 1px solid #2f81f7; border-radius: 8px; padding: 8px; }
.synergy-prompt { color: #666; }
```

- [ ] **Step 3: Append synergy wiring to `js/app.js` (paste at end, outside the picker IIFE)**

```js
// synergy: second grid pair reusing the same hero data + suggestSynergy.
(function synergy() {
  const allies = [];
  const enemies = [];
  let heroes = [];

  function paintGrid(selector, picked, onClick) {
    const grid = document.querySelector(selector);
    if (!grid) return;
    grid.innerHTML = "";
    for (const hero of heroes) {
      const card = document.createElement("button");
      card.className = "hero-card" + (picked.includes(hero.id) ? " hero-card-selected" : "");
      card.textContent = hero.name;
      card.addEventListener("click", () => onClick(hero.id));
      grid.appendChild(card);
    }
  }

  function refresh() {
    paintGrid(".synergy-grid-allies", allies, (id) => {
      const i = allies.indexOf(id);
      if (i >= 0) allies.splice(i, 1);
      else if (allies.length < 4) allies.push(id);
      refresh();
    });
    paintGrid(".synergy-grid-enemies", enemies, (id) => {
      const i = enemies.indexOf(id);
      if (i >= 0) enemies.splice(i, 1);
      else if (enemies.length < 5) enemies.push(id);
      refresh();
    });
    const badge = document.querySelector(".synergy-badge");
    const prompt = document.querySelector(".synergy-prompt");
    if (!badge) return;
    if (allies.length === 0 || enemies.length === 0) {
      badge.hidden = true;
      if (prompt) prompt.hidden = false;
      return;
    }
    const pick = window.DotaCounter.suggestSynergy(allies, enemies, heroes);
    if (prompt) prompt.hidden = true;
    badge.hidden = false;
    badge.textContent = pick
      ? "Suggested next pick: " + pick.name + " (+" + pick.score + "). " + (pick.synergyNote || "") + " " + (pick.reasons || []).join("; ")
      : "No suggestion — rosters cover every counter.";
  }

  window.DotaCounter.loadData().then((data) => {
    heroes = data.heroes;
    refresh();
  });
})();
```

- [ ] **Step 4: Verify synergy in browser**

Run: serve repo root, open `index.html`, in synergy pick ally Axe + enemy Juggernaut.
Expected: `.synergy-badge` shows Lion as suggested pick; empty rosters show `.synergy-prompt`; zero console errors.

- [ ] **Step 5: Commit**

```bash
git add index.html css/style.css js/app.js
git commit -m "feat: add team synergy suggestion view"
```

### Task 7: Meta page (`meta.html`)

**Files:**
- Create: `meta.html`
- Modify: `css/style.css` (append tier classes)

**Interfaces:**
- Consumes: `window.DotaCounter.loadData()` (Task 3), `meta.json` (Task 2)
- Produces: finished read-only meta view; no downstream consumers

- [ ] **Step 1: Write `meta.html`**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>DotaCounter — current meta</title>
  <link rel="stylesheet" href="./css/style.css">
</head>
<body>
  <header class="site-header">
    <h1 class="site-title">Current meta</h1>
    <p class="patch-label">Patch: loading…</p>
    <nav class="site-nav">
      <a class="nav-link" href="./index.html">Picker</a>
      <a class="nav-link" href="./meta.html">Meta</a>
    </nav>
  </header>
  <main class="meta-view">
    <p class="meta-updated">Updated: loading…</p>
    <div class="tier-list"></div>
  </main>
  <p class="offline-note" hidden>Showing offline data — live stats unavailable.</p>
  <script src="./js/data-loader.js"></script>
  <script>
    // meta page: one job — render tiers from meta.json + hero names.
    window.DotaCounter.loadData().then((data) => {
      const names = Object.fromEntries(data.heroes.map((h) => [h.id, h.name]));
      document.querySelector(".meta-updated").textContent = "Updated: " + data.meta.updatedAt;
      const list = document.querySelector(".tier-list");
      for (const tier of ["S", "A", "B", "C"]) {
        const row = document.createElement("div");
        row.className = "tier-row";
        const label = document.createElement("strong");
        label.className = "tier-label";
        label.textContent = "Tier " + tier;
        const members = document.createElement("span");
        members.className = "tier-members";
        members.textContent = ((data.meta.tiers || {})[tier] || []).map((id) => names[id] || id).join(", ") || "—";
        row.append(label, members);
        list.appendChild(row);
      }
    });
  </script>
</body>
</html>
```

- [ ] **Step 2: Append tier CSS to `css/style.css`**

```css
.meta-view { max-width: 960px; margin: 0 auto; padding: 16px; }
.meta-updated { color: #666; }
.tier-list { display: flex; flex-direction: column; gap: 8px; }
.tier-row { border: 1px solid #ccc; border-radius: 8px; padding: 8px; display: flex; gap: 12px; }
.tier-label { min-width: 64px; }
.tier-members { color: #333; }
```

- [ ] **Step 3: Verify meta page in browser**

Run: serve repo root, open `meta.html`.
Expected: "Patch: 7.39", "Updated: 2026-09-30", Tier S = Axe, A = Lion, B = Juggernaut; zero console errors.

- [ ] **Step 4: Commit**

```bash
git add meta.html css/style.css
git commit -m "feat: add patch meta tier list page"
```

### Task 8: Stats refresh script + Pages deploy

**Files:**
- Create: `scripts/fetch-stats.mjs`
- Modify: none (run it, then commit refreshed `data/` if it changes anything)

**Interfaces:**
- Consumes: OpenDota free `GET /api/heroes` (no key); writes Task 2 shapes
- Produces: refreshed `data/matchups.json` + stats portion of `data/meta.json`; deploy checklist closes the plan

- [ ] **Step 1: Write `scripts/fetch-stats.mjs` (built-in fetch only, never overwrites curated files on failure)**

```js
// fetch-stats: refresh baked OpenDota stats. Run: node scripts/fetch-stats.mjs
// Writes data/matchups.json + data/meta.json stats. On any failure it exits
// non-zero WITHOUT touching data files, so baked data is never clobbered.
import { readFileSync, writeFileSync } from "node:fs";

const HEROES_URL = "https://api.opendota.com/api/heroes";

try {
  const response = await fetch(HEROES_URL);
  if (!response.ok) throw new Error("OpenDota status " + response.status);
  const heroes = await response.json();

  const today = new Date().toISOString().slice(0, 10);
  const matchups = { patch: "unknown", updatedAt: today, pairs: {} };
  const wins = {};
  for (const h of heroes) {
    if (typeof h.id === "number") wins[h.id] = { games: h.games ?? 0, wins: h.wins ?? 0 };
  }
  matchups.pairs = wins;

  const meta = JSON.parse(readFileSync("data/meta.json", "utf8"));
  meta.updatedAt = today;
  writeFileSync("data/matchups.json", JSON.stringify(matchups, null, 2) + "\n");
  writeFileSync("data/meta.json", JSON.stringify(meta, null, 2) + "\n");
  console.log("Refreshed matchups for " + heroes.length + " heroes (" + today + ").");
} catch (error) {
  console.error("Refresh failed, data files untouched: " + error.message);
  process.exit(1);
}
```

- [ ] **Step 2: Dry-run without network risk (syntax check + failure path)**

Run: `node --check scripts/fetch-stats.mjs`
Expected: no output, exit 0. (Live run happens at patch time per the vault wiki; do NOT require network in CI/review.)

- [ ] **Step 3: Deploy checklist (manual, closes the plan)**

1. `git push origin main`; GitHub → Settings → Pages → Deploy from branch (`main`, `/root`).
2. Visit `https://<user>.github.io/dotacounter/` — picker renders, no console errors.
3. Pick Juggernaut — Lion first; synergy Axe+Juggernaut — Lion suggested; `meta.html` shows tiers.
4. DevTools offline reload — pages render with the offline note (Review Focus line 3).
5. Confirm no root-absolute `/assets` or `/data` paths: `grep -rn '"/assets' --include='*.html' --include='*.js' . ; grep -rn '"/data' --include='*.js' .` returns nothing (Review Focus line 5).

- [ ] **Step 4: Commit**

```bash
git add scripts/fetch-stats.mjs
git commit -m "feat: add free OpenDota stats refresh script"
```

## Self-Review

- Spec coverage: §3 four views → Tasks 5 (picker+detail), 6 (synergy), 7 (meta); data flow + fallback → Task 3; §4 shapes → Task 2; §5 scoring → Task 4; §6 layout → Tasks 1–2, 8; §7 error handling → Tasks 3 (offline note), 5 (placeholder image); §8 testing checklist → Tasks 3, 5–8 steps; §9 deploy → Task 8 step 3. Covered.
- Placeholders: none — every step has exact code/commands; network-dependent run explicitly deferred to patch time.
- Type consistency: `scoreCounters(enemyIds, heroes)` / `suggestSynergy(allyIds, enemyIds, heroes)` signatures identical in Task 4 test, implementation, and Task 5–6 call sites. `loadData()` shape `{ heroes, meta, matchups, offline }` identical in Tasks 3, 5–7.
- Review Focus: all five lines pinned — empty selection (Task 5 prompt), missing PNG (Task 5 `onerror`), API down (Task 3), empty/invalid baked JSON (Task 3 `||` defaults), subpath (Tasks 1, 3 relative paths + Task 8 grep check).
