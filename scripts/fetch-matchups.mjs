// fetch-matchups: pull per-hero OpenDota matchup tables into data/matchups.json.
// Run: node scripts/fetch-matchups.mjs  (repo root, ~3 minutes, no key)
// Writes data/matchups.json "matchups" key only; baked pub stats untouched.
// On any failure exits non-zero WITHOUT touching data files.
import { readFileSync, writeFileSync, renameSync } from "node:fs";

const HEROES_URL = "https://api.opendota.com/api/heroes";
const DC_URL = "https://raw.githubusercontent.com/odota/dotaconstants/master/build/heroes.json";
const ONE_SECOND = 1100;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function getJson(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error("status " + response.status + " for " + url);
  return response.json();
}

try {
  const dc = await getJson(DC_URL);
  // numeric OpenDota id -> our hero id (dotaconstants short key).
  const numericToOurs = {};
  for (const [num, entry] of Object.entries(dc)) {
    numericToOurs[Number(num)] = entry.name.replace("npc_dota_hero_", "");
  }
  const numericIds = Object.keys(numericToOurs).map(Number).sort((a, b) => a - b);

  const matchups = {};
  let done = 0;
  for (const numericId of numericIds) {
    const rows = await getJson("https://api.opendota.com/api/heroes/" + numericId + "/matchups");
    const ours = numericToOurs[numericId];
    const table = {};
    for (const row of rows) {
      const enemy = numericToOurs[row.hero_id];
      if (!enemy) continue;
      table[enemy] = { games: row.games_played, wins: row.wins };
    }
    matchups[ours] = table;
    done += 1;
    if (done % 20 === 0) console.log("fetched " + done + "/" + numericIds.length);
    await sleep(ONE_SECOND);
  }

  const path = "data/matchups.json";
  const current = JSON.parse(readFileSync(path, "utf8"));
  current.matchups = matchups;
  current.updatedAt = new Date().toISOString().slice(0, 10);
  const temp = path + ".tmp";
  writeFileSync(temp, JSON.stringify(current, null, 2) + "\n");
  renameSync(temp, path);
  console.log("Wrote matchups for " + Object.keys(matchups).length + " heroes.");
} catch (error) {
  console.error("Matchup refresh failed, data files untouched: " + error.message);
  process.exit(1);
}
