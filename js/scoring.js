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

// Estimate win chance from the full draft (both teams as arrays of ids).
// Base 50/50; each direct counter hit shifts 4% toward the counter's team;
// each pick filling its own team's missing role shifts 2% that way.
// Total shift capped at 15%, so output stays within 15-85 ("estimated").
// Returns { radiant, dire, reasons[] } with one plain sentence per shift.
window.DotaCounter.winEstimate = function winEstimate(radiantIds, direIds, heroes) {
  const byId = Object.fromEntries(heroes.map((h) => [h.id, h]));
  const inTeam = (list, id) => list.includes(id);
  let shift = 0; // positive favors Radiant, negative favors Dire.
  const reasons = [];

  // Counter hits: every hero's counter list checked against both teams.
  for (const hero of heroes) {
    for (const counter of hero.counters || []) {
      if (inTeam(radiantIds, hero.id) && inTeam(direIds, counter.hero)) {
        shift += 4;
        reasons.push(hero.name + " counters " + (byId[counter.hero] ? byId[counter.hero].name : counter.hero) + " (+4% Radiant): " + counter.reason);
      } else if (inTeam(direIds, hero.id) && inTeam(radiantIds, counter.hero)) {
        shift -= 4;
        reasons.push(hero.name + " counters " + (byId[counter.hero] ? byId[counter.hero].name : counter.hero) + " (+4% Dire): " + counter.reason);
      }
    }
  }

  // Role coverage: a side covering 2+ distinct roles is a balanced draft.
  const rolesOf = (ids) => new Set(ids.map((id) => byId[id] && byId[id].role).filter(Boolean));
  const radiantRoles = rolesOf(radiantIds);
  const direRoles = rolesOf(direIds);
  if (radiantRoles.size >= 2) {
    shift += 2;
    reasons.push("Radiant covers roles (" + [...radiantRoles].join(", ") + ") (+2% Radiant)");
  }
  if (direRoles.size >= 2) {
    shift -= 2;
    reasons.push("Dire covers roles (" + [...direRoles].join(", ") + ") (+2% Dire)");
  }

  if (shift > 15) shift = 15;
  if (shift < -15) shift = -15;
  return { radiant: 50 + shift, dire: 50 - shift, reasons };
};
