// Builds/items contract test: node scripts/builds.test.js (exit non-zero on failure).
// Checks the data files B2's popup will read: every hero present, phases
// well-formed, shares sane, every item key resolves in items.json.
const fs = require("fs");

function assert(condition, name) {
  if (!condition) {
    console.error("FAIL " + name);
    process.exitCode = 1;
  } else {
    console.log("PASS " + name);
  }
}

const heroes = JSON.parse(fs.readFileSync(__dirname + "/../data/heroes.json", "utf8"));
const itemsFile = JSON.parse(fs.readFileSync(__dirname + "/../data/items.json", "utf8"));
const buildsFile = JSON.parse(fs.readFileSync(__dirname + "/../data/builds.json", "utf8"));
const items = itemsFile.items;
const builds = buildsFile.builds;

assert(Object.keys(items).length >= 400, "items catalogue has 400+ entries");
assert(items.blink && items.blink.dname === "Blink Dagger", "blink resolves with dname");
assert(items.heavens_halberd && items.ultimate_scepter_2, "hand-mapped keys resolve");

assert(Object.keys(builds).length === heroes.length, "builds cover all " + heroes.length + " heroes");

let badPhase = 0;
let badOrder = 0;
let badShare = 0;
let badKey = 0;
for (const hero of heroes) {
  const entry = builds[hero.id];
  if (!entry) {
    badPhase += 1;
    continue;
  }
  for (const phase of ["start", "early", "mid", "late"]) {
    const list = entry[phase];
    if (!Array.isArray(list) || list.length > 6) badPhase += 1;
    for (let i = 0; i < list.length; i++) {
      if (i > 0 && list[i].games > list[i - 1].games) badOrder += 1;
      if (!(list[i].share > 0) || list[i].share > 100) badShare += 1;
      if (!items[list[i].item]) badKey += 1;
    }
  }
}
assert(badPhase === 0, "4 phases per hero, max 6 items each");
assert(badOrder === 0, "items sorted by games desc");
assert(badShare === 0, "shares within 0-100");
assert(badKey === 0, "every build item resolves in items.json");

const ours = new Set(heroes.map((h) => h.id));
const dangling = [];
heroes.forEach((x) => (x.counterItems || []).forEach((c) => {
  if (!items[c.item]) dangling.push(x.id + "->" + c.item);
}));
assert(dangling.length === 0, "every counterItems id resolves in items.json");
