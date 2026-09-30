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
