// Plain-node test: node js/scoring.test.js (exit non-zero on failure).
const fs = require("fs");
const vm = require("vm");

const context = { window: { DotaCounter: {} } };
vm.createContext(context);
vm.runInContext(fs.readFileSync(__dirname + "/scoring.js", "utf8"), context);
const { scoreCounters } = context.window.DotaCounter;

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

// Curated-only ranking (no matchups passed): every hit is +2, ties alpha.
// (Pinned ids retired with the 12-hero pool; assert the contract.)
const ranked = scoreCounters(["juggernaut"], heroes);
assertEqual(ranked[0].score, 2, "top counter scores +2 without data");
assertEqual(ranked.map((r) => r.id), [...ranked.map((r) => r.id)].sort(), "ranking breaks ties alphabetically");
assertEqual(ranked.filter((r) => r.score === 2).map((r) => r.id).includes("lion"), true, "lion still a top juggernaut counter");
assertEqual(ranked[0].score >= 2, true, "direct counter scores +2");

// Empty picks => empty ranking, never an error.
assertEqual(scoreCounters([], heroes), [], "empty picks give empty ranking");

// Tiebreak is alphabetical so output is stable (curated-only call).
const tied = scoreCounters(["axe"], heroes).filter((r) => r.score > 0).map((r) => r.id);
assertEqual(tied, [...tied].sort(), "ties broken alphabetically");

// matchupEdge: shrunk advantage from real baked tables.
// Axe vs Juggernaut is 60/117: 100 * 1.5 / 217 = 150/217 (decimal, K=100).
const { matchupEdge } = context.window.DotaCounter;
const bakedTables = JSON.parse(fs.readFileSync(__dirname + "/../data/matchups.json", "utf8"));
// Axe vs Juggernaut is 60/117 at 51.3% observed; axe rates 50.6% overall
// vs juggernaut's 52.5%, so expected is ~48.1% and the edge is positive.
const axeEdge = matchupEdge("axe", "juggernaut", bakedTables);
assertEqual(
  { games: axeEdge.games, wins: axeEdge.wins, rate: axeEdge.rate, lowSample: axeEdge.lowSample },
  { games: 117, wins: 60, rate: 51.3, lowSample: false },
  "axe holds a small shrunk edge vs juggernaut"
);
assertEqual(Math.round(axeEdge.edge * 1000) / 1000, 1.695, "axe edge value matches the formula");
const thin = matchupEdge("antimage", "hoodwink", bakedTables);
assertEqual(thin.lowSample, true, "29-game pair is flagged low sample");
assertEqual(thin.edge !== 0, true, "thin pair still scores (shrunk, not dropped)");

// Matchup-specific scoring on synthetic tables: a 60% overall hero going
// 50/50 (100/200) vs a 40% hero is BELOW expectation (0.6 + 0.1 = 0.7),
// so the edge is negative — general strength earns no bonus.
const { overallRate } = context.window.DotaCounter;
const synth = {
  heroes: { strong: { games: 1000, wins: 600 }, weak: { games: 1000, wins: 400 } },
  matchups: {
    strong: { weak: { games: 200, wins: 100 } },
    weak: { strong: { games: 200, wins: 100 } },
  },
};
assertEqual(overallRate("nobody", synth), 0.5, "unknown hero rates 0.5");
const strongEdge = matchupEdge("strong", "weak", synth);
assertEqual(strongEdge.edge < 0, true, "strong hero gets no bonus for general strength");
const weakEdge = matchupEdge("weak", "strong", synth);
assertEqual(weakEdge.edge > 0, true, "underdog beating expectation scores positive");
const thinSynth = {
  heroes: synth.heroes,
  matchups: { strong: { weak: { games: 20, wins: 10 } } },
};
assertEqual(
  Math.abs(matchupEdge("strong", "weak", thinSynth).edge) < Math.abs(strongEdge.edge),
  true,
  "same gap with fewer games shrinks the edge"
);
assertEqual(matchupEdge("axe", "no_such_hero", bakedTables), null, "unknown enemy is null");
assertEqual(matchupEdge("axe", "juggernaut", {}), null, "missing tables are null");

// With baked tables the ranking is data-driven: sorted by score desc,
// then games desc, then name. Lion carries a juggernaut matchup reason,
// and the order differs from the curated-only ranking above.
const withData = scoreCounters(["juggernaut"], heroes, bakedTables);
const ordered = withData.every(
  (r, i, arr) =>
    i === 0 ||
    arr[i - 1].score > r.score ||
    (arr[i - 1].score === r.score &&
      (arr[i - 1].games > r.games || (arr[i - 1].games === r.games && arr[i - 1].id < r.id)))
);
assertEqual(ordered, true, "data ranking is score-desc, games then name on ties");
const lionEntry = withData.find((r) => r.id === "lion");
assertEqual(lionEntry !== undefined, true, "lion ranks vs juggernaut with data");
assertEqual(lionEntry.reasons.some((x) => x.includes("games vs Juggernaut")), true, "reasons cite win rate and sample");
assertEqual(
  JSON.stringify(withData.map((r) => r.id)) === JSON.stringify(ranked.map((r) => r.id)),
  false,
  "pub data moves the ranking"
);

// applyRoleProfile: support profile keeps the draft but scores supports only.
const { applyRoleProfile } = context.window.DotaCounter;
const asSupport = applyRoleProfile("support", ["axe", "lion"], heroes);
assertEqual(asSupport.supportMode, true, "support profile sets support mode");
assertEqual(asSupport.calcRadiant, ["axe", "lion"], "support calc keeps own picks");
assertEqual(asSupport.scorePool.every((h) => h.role === "support"), true, "support pool is supports only");
assertEqual(asSupport.scorePool.length > 0, true, "support pool is not empty");

// applyRoleProfile: core profile drops own supports from the calc, pool stays full.
const asCore = applyRoleProfile("carry", ["axe", "lion", "juggernaut"], heroes);
assertEqual(asCore.supportMode, false, "core profile is not support mode");
assertEqual(asCore.calcRadiant, ["axe", "juggernaut"], "core calc drops own supports");
assertEqual(asCore.scorePool.length, heroes.length, "core pool stays full");

// applyRoleProfile: unknown ids are never treated as supports.
const asUnknown = applyRoleProfile("mid", ["axe", "not_a_hero"], heroes);
assertEqual(asUnknown.calcRadiant, ["axe", "not_a_hero"], "unknown ids stay in core calc");

const { roleAnswers } = context.window.DotaCounter;

// roleAnswers: empty entered supports falls back to the general ranking.
const raFallback = roleAnswers("carry", [], ["juggernaut"], heroes);
assertEqual(raFallback, scoreCounters(["juggernaut"], heroes), "no entered supports means general ranking");

// roleAnswers: offlane profile vs entered support lion tags same-role answers.
const raFocused = roleAnswers("offlane", ["lion"], ["lion", "juggernaut"], heroes);
const tagged = raFocused.filter((r) => r.reasons.some((x) => x.endsWith("(vs enemy support)")));
assertEqual(tagged.length > 0, true, "same-role answers are tagged");
assertEqual(tagged.every((r) => ["offlane", "initiator"].includes(heroes.find((h) => h.id === r.id).role)), true, "tagged answers share the player's lane");

// roleAnswers: unknown profile is the general ranking, never an error.
assertEqual(roleAnswers("coach", ["lion"], ["juggernaut"], heroes), scoreCounters(["juggernaut"], heroes), "unknown profile falls back");

// matchHeroName: case-insensitive substring; empty query matches all.
const { matchHeroName, highlightName } = context.window.DotaCounter;
assertEqual(matchHeroName("Juggernaut", "jug"), true, "search matches start");
assertEqual(matchHeroName("Juggernaut", "GER"), true, "search ignores case");
assertEqual(matchHeroName("Axe", "jug"), false, "search rejects non-match");
assertEqual(matchHeroName("Axe", "  "), true, "blank query matches all");

// highlightName: wraps the first match, keeps original case, escapes HTML.
assertEqual(
  highlightName("Juggernaut", "ger"),
  'Jug<span class="hero-name-hit">ger</span>naut',
  "match glows inside the name"
);
assertEqual(highlightName("Axe", "jug"), "Axe", "no match returns plain name");
assertEqual(highlightName("Axe", ""), "Axe", "empty query returns plain name");
assertEqual(highlightName("<Axe>", "axe"), "&lt;<span class=\"hero-name-hit\">Axe</span>&gt;", "output is HTML-escaped");
assertEqual(highlightName("Anti-Mage", "<"), "Anti-Mage", "query symbols cannot break markup");

// heroWinRate: real baked numbers, one decimal, null when absent.
const { heroWinRate, roleMatches } = context.window.DotaCounter;
const baked = JSON.parse(fs.readFileSync(__dirname + "/../data/matchups.json", "utf8"));
assertEqual(heroWinRate("axe", baked), 50.6, "axe badge shows baked pub win rate");
assertEqual(heroWinRate("no_such_hero", baked), null, "unknown hero hides the badge");
assertEqual(heroWinRate("axe", { heroes: {} }), null, "empty stats hide the badge");
assertEqual(heroWinRate("axe", { heroes: { axe: { games: 0, wins: 0 } } }), null, "zero games hide the badge");

// roleMatches: tabs filter lane roles; legacy initiator is offlane-side.
assertEqual(roleMatches("carry", "carry"), true, "carry sits under Carry");
assertEqual(roleMatches("carry", "mid"), false, "carry is not Mid");
assertEqual(roleMatches("initiator", "offlane"), true, "legacy initiator counts as offlane");
assertEqual(roleMatches("support", "all"), true, "All tab shows everything");
assertEqual(roleMatches("mid", "support"), false, "mid is not Support");
