# DotaCounter — Design Spec (2026-09-30)

## 1. Purpose
A free, static Dota 2 counter-pick and synergy helper site.
Users pick enemy heroes and get ranked counter picks with reasons,
plus item and skill-usage tips. Users can also fill both teams to get
the best next pick for synergy, and browse the current-patch meta tier list.

Audience: Dota 2 players (all levels) and beginner contributors to the repo.
Success: site works from GitHub Pages with no backend, no keys, no cost;
a beginner can read the code and add a hero by copying an example.

## 2. Constraints (agreed)
- Free-only: GitHub Pages hosting, OpenDota free endpoints only, no tokens,
  no backend, no paid APIs.
- Beginner-friendly code: plain HTML/CSS/JS, no framework, no build step
  for the site itself. Small commented functions, no clever one-liners.
- Semantic class names only (`.hero-card`, `.counter-list`, `.synergy-badge`).
  No abbreviated or generated names.
- Neat assets: `assets/heroes/<hero-id>.png`, `assets/items/<item-id>.png`,
  all lowercase-hyphen, matching the `id` fields in JSON exactly.
- Repo: `A:/Github/dotacounter` (local) → GitHub `dotacounter`.
  Served as `https://<user>.github.io/dotacounter/` (subpath — all URLs relative).

## 3. Architecture
Single static site, no backend:
- `index.html` — views 1–3 (counter picker, team synergy, hero detail).
- `meta.html` — view 4 (patch meta tier list).
- `js/` — `app.js` (UI wiring), `scoring.js` (ranking), `data-loader.js`
  (load baked JSON, fall back gracefully).
- `data/` — `heroes.json` (curated), `matchups.json` (baked stats),
  `meta.json` (patch label + tiers, includes `patch` field).
- `scripts/fetch-stats.mjs` — Node 18+ script using only built-in `fetch`;
  pulls free OpenDota hero stats/matchups and rewrites `matchups.json`
  and the stats portion of `meta.json`. Run manually before commit when a
  patch drops. Never runs in the browser, needs no key.

Data flow: page load → `data-loader.js` fetches local `./data/*.json` →
render from baked data → optionally try a live OpenDota fetch for freshness;
on failure keep baked data and show a small "offline data" note. Site never
breaks when the API is down.

## 4. Data shapes
Hero (`heroes.json`):
`id`, `name`, `role`, `image`, `counters` (hero ids + short reason each),
`counterItems` (item ids + when to buy), `skillTips` (short strings).

Meta (`meta.json`): `patch` (e.g. `"7.39"`), `tiers` (S/A/B/C lists of hero ids),
`updatedAt` (date string).

## 5. Counter scoring (`js/scoring.js`, ~20 lines, commented)
Score = +2 per direct counter hit + 1 per role-synergy hit, then sort
highest first. Ties broken alphabetically so output is stable. Deterministic,
explainable, no hidden weights.

## 6. File layout
```
dotacounter/
  index.html / meta.html
  css/style.css
  js/app.js / js/scoring.js / js/data-loader.js
  data/heroes.json / data/matchups.json / data/meta.json
  assets/heroes/ / assets/items/
  scripts/fetch-stats.mjs
  docs/superpowers/specs/ (this file)
```

## 7. Error handling
- Missing image → `onerror` swaps to `assets/heroes/placeholder.png`, no broken icons.
- Missing JSON entry → hero renders with "no data yet" note, rest of page works.
- API unreachable → baked data used, small notice shown. No blank pages.

## 8. Testing (beginner-manual)
Checklist, no test framework in v1:
1. Open `index.html` locally — picker renders, no console errors.
2. Pick 1 enemy hero — counter list appears, sorted, reasons shown.
3. Fill both teams — synergy suggestion appears.
4. Block network (devtools offline) — pages still render from baked JSON.
5. Serve from subpath (any static server with base) — images/CSS load
   (validates relative paths for GitHub Pages).

## 9. Deploy
Push `main` → GitHub → Settings → Pages → Deploy from branch (`main`, `/root`).
No actions, no secrets. Rename repo to `<user>.github.io` only if a root
domain is wanted later; otherwise keep `dotacounter` subpath.

## 10. Wiki decision
No separate GitHub wiki in v1. User-facing help (how to pick, how to add a
hero) lives in `README.md` + a `docs/` page in the repo so beginners see it
next to the code and it versions with the site. Revisit a wiki only if
hero-guide content outgrows the repo docs.

## 11. Multi-AI build (next step, after spec approval)
Build via installed `oh-my-openagent` (`ultrawork`): parallel agents for
data seed, UI shell, and scoring logic from this spec. Requires the
implementation plan (writing-plans skill) first — not started until this
spec is approved.
