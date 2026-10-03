// scoring: +2 per curated counter hit plus a shrunk pub-data edge per
// enemy. Scores stay decimal for ranking (rounded only for display);
// ties break by total games, then name. Deterministic and explainable.
// The edge is percentage points above 50%, pulled toward 0 when the
// sample is small (MATCHUP_SHRINK_K games of imaginary prior at the
// expected rate). Matchup tables come from data/matchups.json "matchups"
// (OpenDota pairwise stats); overall rates from "heroes" (same source).
window.DotaCounter = window.DotaCounter || {};

// Shrinkage strength: higher K pulls small-sample edges harder to 0.
window.DotaCounter.MATCHUP_SHRINK_K = 100;

// Pairs with fewer games than this are not scored at all — a 14/16 fluke
// must never outrank real data. Pairs from here up to LOW_SAMPLE_TAG_END
// games keep a "low sample" display tag.
window.DotaCounter.MIN_SCORING_GAMES = 30;
window.DotaCounter.LOW_SAMPLE_TAG_END = 60;

// One matchup cell can move a score by at most this many points, so a
// single lopsided table cannot dominate the ranking on its own.
window.DotaCounter.MATCHUP_EDGE_CAP = 10;

// Overall pub win rate of one hero (0..1), 0.5 when the hero has no data.
window.DotaCounter.overallRate = function overallRate(heroId, matchups) {
  const entry = (matchups && matchups.heroes && matchups.heroes[heroId]) || null;
  if (!entry || !(entry.games > 0)) return 0.5;
  return entry.wins / entry.games;
};

// One matchup cell: { edge, games, wins, rate, lowSample } or null.
// "wins" are the candidate's wins vs the enemy. Edge is a decimal:
// observed rate minus the expected rate (candidate's overall strength
// adjusted for the enemy's), shrunk toward 0. A strong hero gets no
// bonus just for being strong; the score measures the matchup itself.
window.DotaCounter.matchupEdge = function matchupEdge(candidateId, enemyId, matchups, prior) {
  const K = prior === undefined ? window.DotaCounter.MATCHUP_SHRINK_K : prior;
  const table = (matchups && matchups.matchups && matchups.matchups[candidateId]) || null;
  const cell = (table && table[enemyId]) || null;
  if (!cell || !(cell.games >= window.DotaCounter.MIN_SCORING_GAMES)) return null;
  const observed = cell.wins / cell.games;
  const expected =
    window.DotaCounter.overallRate(candidateId, matchups) +
    (0.5 - window.DotaCounter.overallRate(enemyId, matchups));
  const raw = (100 * (observed - expected) * cell.games) / (cell.games + K);
  const cap = window.DotaCounter.MATCHUP_EDGE_CAP;
  const edge = Math.max(-cap, Math.min(cap, raw));
  const rate = Math.round(observed * 1000) / 10;
  return { edge, games: cell.games, wins: cell.wins, rate, lowSample: cell.games < window.DotaCounter.LOW_SAMPLE_TAG_END };
};

// Rank every hero against the enemy picks (array of hero ids).
// matchups is optional: without it only curated hits score.
// Returns [{ id, name, score, games, reasons[] }] sorted best-first,
// zeroes dropped. Games = total matchup games behind the score.
window.DotaCounter.scoreCounters = function scoreCounters(enemyIds, heroes, matchups) {
  const enemies = new Set(enemyIds);
  const names = Object.fromEntries(heroes.map((h) => [h.id, h.name]));
  const ranked = [];

  for (const hero of heroes) {
    let score = 0;
    let games = 0;
    const reasons = [];
    for (const counter of hero.counters || []) {
      if (enemies.has(counter.hero)) {
        score += 2;
        reasons.push({ text: counter.reason, lowSample: false });
      }
    }
    for (const enemy of enemies) {
      const m = window.DotaCounter.matchupEdge(hero.id, enemy, matchups);
      if (m && m.edge !== 0) {
        score += m.edge;
        games += m.games;
        reasons.push({
          text: m.rate + "% vs " + (names[enemy] || enemy) + " - " + m.games + " games",
          lowSample: m.lowSample,
        });
      }
    }
    if (score > 0) {
      ranked.push({ id: hero.id, name: hero.name, score, games, reasons });
    }
  }

  ranked.sort((a, b) => b.score - a.score || b.games - a.games || (a.id < b.id ? -1 : 1));
  return ranked;
};

// Split the draft by the player's role before scoring.
// Support profile: own picks stay, but scoring runs on support-lane heroes.
// Core profile (carry/mid/offlane): pool stays full, own support picks leave
// the calc. Unknown ids are never treated as supports.
// Returns { scorePool, calcRadiant, supportMode }.
window.DotaCounter.applyRoleProfile = function applyRoleProfile(profile, radiantIds, heroes) {
  const byId = Object.fromEntries(heroes.map((h) => [h.id, h]));
  const isSupport = (id) => byId[id] && byId[id].role === "support";
  if (profile === "support") {
    return {
      scorePool: heroes.filter((h) => h.role === "support"),
      calcRadiant: radiantIds.slice(),
      supportMode: true,
    };
  }
  return {
    scorePool: heroes,
    calcRadiant: radiantIds.filter((id) => !isSupport(id)),
    supportMode: false,
  };
};

// Role-targeted answers for core profiles: same-lane-role counters vs the
// entered enemy supports, merged with full-pool counters vs the whole Dire
// draft. Focused reasons are tagged. Empty supports or unknown profile fall
// back to the general ranking. Returns ranked best-first.
window.DotaCounter.roleAnswers = function roleAnswers(profile, enemySupportIds, direIds, heroes, matchups) {
  const lanes = { carry: ["carry"], mid: ["mid"], offlane: ["offlane", "initiator"] };
  const general = window.DotaCounter.scoreCounters(direIds, heroes, matchups);
  const lanesFor = lanes[profile];
  if (!lanesFor || enemySupportIds.length === 0) return general;

  const pool = heroes.filter((h) => lanesFor.includes(h.role));
  const focused = window.DotaCounter.scoreCounters(enemySupportIds, pool, matchups);
  const merged = new Map();
  for (const entry of general) {
    merged.set(entry.id, { id: entry.id, name: entry.name, score: entry.score, games: entry.games || 0, reasons: entry.reasons.slice() });
  }
  for (const entry of focused) {
    const tagged = entry.reasons.map((r) => ({ text: r.text + " (vs enemy support)", lowSample: r.lowSample }));
    if (merged.has(entry.id)) {
      const keep = merged.get(entry.id);
      keep.score += entry.score;
      keep.games += entry.games || 0;
      keep.reasons = tagged.concat(keep.reasons);
    } else {
      merged.set(entry.id, { id: entry.id, name: entry.name, score: entry.score, games: entry.games || 0, reasons: tagged });
    }
  }
  return [...merged.values()].sort((a, b) => b.score - a.score || b.games - a.games || (a.id < b.id ? -1 : 1));
};

// Escape raw text for safe innerHTML use (search input is user-typed).
function escapeHtml(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// True when the hero name contains the query (case-insensitive).
// Empty query matches everything, so clearing the box restores the pool.
window.DotaCounter.matchHeroName = function matchHeroName(name, query) {
  const q = String(query || "").trim().toLowerCase();
  if (q === "") return true;
  return String(name).toLowerCase().includes(q);
};

// Name HTML with the first query match wrapped in a glowing span.
// No match (or empty query) returns the plain escaped name.
window.DotaCounter.highlightName = function highlightName(name, query) {
  const safe = escapeHtml(name);
  const q = String(query || "").trim().toLowerCase();
  if (q === "") return safe;
  const index = String(name).toLowerCase().indexOf(q);
  if (index < 0) return safe;
  return (
    escapeHtml(String(name).slice(0, index)) +
    '<span class="hero-name-hit">' +
    escapeHtml(String(name).slice(index, index + q.length)) +
    "</span>" +
    escapeHtml(String(name).slice(index + q.length))
  );
};

// Win rate percent (one decimal) from baked heroStats, or null when the
// hero has no baked data. Null means "hide the badge", never "show 0%".
window.DotaCounter.heroWinRate = function heroWinRate(heroId, matchups) {
  const entry = (matchups && matchups.heroes && matchups.heroes[heroId]) || null;
  if (!entry || !(entry.games > 0)) return null;
  return Math.round((entry.wins / entry.games) * 1000) / 10;
};

// True when a hero lane role belongs under the pool tab.
// Tabs: all | carry | mid | offlane | support. Legacy "initiator" counts
// as offlane (same lane, renamed over time).
window.DotaCounter.roleMatches = function roleMatches(heroRole, tab) {
  if (tab === "all") return true;
  if (tab === "offlane") return heroRole === "offlane" || heroRole === "initiator";
  return heroRole === tab;
};

// First-pick helper for support players: in ranked, supports pick first,
// so this returns the 5 most-picked supports plus the 5 highest-win-rate
// supports with at least minGames games (default 10000, about a week of
// pubs at this dataset's scale). Shape:
// { popular: [{ id, name, rate, games }], best: [...] }.
// Zero-game heroes never make either list; empty input gives empty lists.
window.DotaCounter.topSupports = function topSupports(heroes, matchups, minGames) {
  const floor = typeof minGames === "number" ? minGames : 10000;
  const stats = (matchups && matchups.heroes) || {};
  const supports = [];
  for (const hero of heroes || []) {
    if (hero.role !== "support") continue;
    const entry = stats[hero.id] || {};
    const games = entry.games || 0;
    if (!(games > 0)) continue;
    supports.push({
      id: hero.id,
      name: hero.name,
      games,
      rate: Math.round(((entry.wins || 0) / games) * 1000) / 10,
    });
  }
  const byGames = [...supports].sort((a, b) => b.games - a.games).slice(0, 5);
  const byRate = supports
    .filter((s) => s.games >= floor)
    .sort((a, b) => b.rate - a.rate)
    .slice(0, 5);
  return { popular: byGames, best: byRate };
};
