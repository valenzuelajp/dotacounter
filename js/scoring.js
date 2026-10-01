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
window.DotaCounter.roleAnswers = function roleAnswers(profile, enemySupportIds, direIds, heroes) {
  const lanes = { carry: ["carry"], mid: ["mid"], offlane: ["offlane", "initiator"] };
  const general = window.DotaCounter.scoreCounters(direIds, heroes);
  const lanesFor = lanes[profile];
  if (!lanesFor || enemySupportIds.length === 0) return general;

  const pool = heroes.filter((h) => lanesFor.includes(h.role));
  const focused = window.DotaCounter.scoreCounters(enemySupportIds, pool);
  const merged = new Map();
  for (const entry of general) {
    merged.set(entry.id, { id: entry.id, name: entry.name, score: entry.score, reasons: entry.reasons.slice() });
  }
  for (const entry of focused) {
    const tagged = entry.reasons.map((r) => r + " (vs enemy support)");
    if (merged.has(entry.id)) {
      const keep = merged.get(entry.id);
      keep.score += entry.score;
      keep.reasons = tagged.concat(keep.reasons);
    } else {
      merged.set(entry.id, { id: entry.id, name: entry.name, score: entry.score, reasons: tagged });
    }
  }
  return [...merged.values()].sort((a, b) => b.score - a.score || (a.id < b.id ? -1 : 1));
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
