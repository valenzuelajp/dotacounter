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

// Many heroes counter juggernaut (+2 each) => alphabetical tiebreak.
// (Pinned ids retired with the 12-hero pool; assert the contract.)
const ranked = scoreCounters(["juggernaut"], heroes);
assertEqual(ranked[0].score, 2, "top counter scores +2");
assertEqual(ranked.map((r) => r.id), [...ranked.map((r) => r.id)].sort(), "ranking breaks ties alphabetically");
assertEqual(ranked.filter((r) => r.score === 2).map((r) => r.id).includes("lion"), true, "lion still a top juggernaut counter");
assertEqual(ranked[0].score >= 2, true, "direct counter scores +2");

// Empty picks => empty ranking, never an error.
assertEqual(scoreCounters([], heroes), [], "empty picks give empty ranking");

// Tiebreak is alphabetical so output is stable.
const tied = scoreCounters(["axe"], heroes).filter((r) => r.score > 0).map((r) => r.id);
assertEqual(tied, [...tied].sort(), "ties broken alphabetically");

// Synergy: ally axe + enemy juggernaut => suggested pick counters juggernaut.
const pick = suggestSynergy(["axe"], ["juggernaut"], heroes);
const pickHero = heroes.find((h) => h.id === pick.id);
assertEqual(pickHero.counters.some((c) => c.hero === "juggernaut"), true, "synergy suggests a juggernaut counter");

// winEstimate: empty draft is 50/50 with no reasons.
const { winEstimate } = context.window.DotaCounter;
assertEqual(winEstimate([], [], heroes), { radiant: 50, dire: 50, reasons: [] }, "empty draft is 50/50");

// Axe (radiant) counters Juggernaut (dire): +4% radiant, one reason.
const w1 = winEstimate(["axe"], ["juggernaut"], heroes);
assertEqual(w1.radiant, 54, "axe vs juggernaut favors radiant by 4");
assertEqual(w1.dire, 46, "dire is the mirror of radiant");
assertEqual(w1.reasons.length, 1, "one reason per counter hit");

// Radiant Lion+Axe vs Dire Juggernaut+Phantom Assassin: 4 hits (+16) capped at +15.
const w2 = winEstimate(["lion", "axe"], ["juggernaut", "phantom_assassin"], heroes);
assertEqual(w2.radiant, 65, "shift capped at +15");
assertEqual(w2.dire, 35, "dire mirrors the cap");
assertEqual(w2.reasons.length >= 4, true, "every hit explained");

// Balanced roles add 2%: radiant Axe+Lion (initiator+support) vs lone Juggernaut.
// +4 (axe>jugg) +4 (lion>jugg) +2 (radiant role coverage) = 60.
const w3 = winEstimate(["axe", "lion"], ["juggernaut"], heroes);
assertEqual(w3.radiant, 60, "counter hits plus role coverage");
