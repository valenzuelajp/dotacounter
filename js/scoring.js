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
