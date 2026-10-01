# DotaCounter v2 — Design Spec (2026-10-01)

Supersedes: `2026-09-30-dotacounter-design.md` (v1 built and merged).
Goal: Dota-client-inspired look + draggable draft board + honest win estimate.

## 1. Layout (index.html, three zones)

1. Top bar (`.top-bar`): site title left (`.site-title`), tabs Picker/Meta
   (`.site-nav`, `.nav-link`), patch label right (`.patch-label`).
2. Hero pool (`.hero-pool`): attribute-grouped grids. Each
   `.attribute-group` has `.attribute-title` (Strength/Agility/
   Intelligence/Universal) + `.hero-grid`. Cards keep `.hero-card`,
   add `draggable="true"`.
3. Draft board (`.draft-board`): side toggle (`.side-toggle`:
   Radiant/Dire), two slot rows (`.draft-allies`, `.draft-enemies`,
   5 `.draft-slot` each), win bar (`.win-bar` > `.win-bar-fill`),
   reason list (`.win-reasons`), empty prompt (`.draft-prompt`).

Old picker/synergy sections are replaced by the draft board. `meta.html`
gets the same top bar + theme, content unchanged.

## 2. Interaction (drag + tap)

Tap (or drop) places the hero in the first empty slot of the selected
side. Clicking a filled slot returns the hero to the pool. Native HTML5
drag events only (`dragstart`/`dragover`/`drop`), one shared
`placeHero(id)` function for both triggers (~30 commented lines, no
library). Identical result for mouse, touch, keyboard.

## 3. Win estimate (scoring.js)

`winEstimate(allies, enemies, heroes)` in `scoring.js`. Start 50/50.
+4% per direct counter hit toward the counter's team, +2% per filled
missing role, clamp 15/85. Returns
`{ radiantChance, direChance, reasons[] }`, reasons are plain sentences
("Lion Hex pierces Juggernaut Blade Fury: +4% Radiant"). UI labels the
number "estimated" — never presented as prediction. `scoreCounters` and
`suggestSynergy` stay for the counter list under the board.

## 4. Data + portraits

`heroes.json` gains `attribute` per hero. `image` becomes a Steam CDN URL
(`https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/heroes/<id>.png`)
with the existing `onerror` placeholder fallback untouched. Roster grows
3 → 12 with a coherent counter graph (every `counters[].hero` resolves
to a pool id). Curated fields unchanged.

## 5. Theme

Client-inspired, not a clone: near-black brown background, gold titles,
attribute titles in attribute colors (red/green/blue/prism-muted),
Radiant green / Dire red tints only on their sides. Absorbs the
unmerged `style/dire-tavern-theme` tokens (that branch is deleted after
v2 lands). All colors as `:root` variables, commented, beginner-editable.

## 6. Testing + rollout

- `scoring.test.js`: empty draft = 50/50, one counter = 54/46, clamp
  respected, reasons non-empty.
- Browser: drag places, tap places, slot-click returns, bar updates
  live, zero JS errors; existing checks re-run (offline note, relative
  paths, 5/5 old tests green).
- Fresh branch from `main`, Pages redeploys on push. Vault wiki updated
  (draft guide, estimate honesty note, CDN asset rule).
