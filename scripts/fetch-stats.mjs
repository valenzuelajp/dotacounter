// fetch-stats: refresh baked stats. Run: node scripts/fetch-stats.mjs
// Source 1 (OpenDota): hero win/game counts -> data/matchups.json.
// Source 2 (dotaconstants, free static JSON): validates our heroes.json ids
// against the community hero list and warns about unknown ids.
// Writes data/matchups.json + data/meta.json stats. On any failure it exits
// non-zero WITHOUT touching data files, so baked data is never clobbered.
import { readFileSync, writeFileSync } from "node:fs";

const HEROES_URL = "https://api.opendota.com/api/heroes";
const CONSTANTS_URL = "https://raw.githubusercontent.com/odota/dotaconstants/master/build/heroes.json";

try {
  const response = await fetch(HEROES_URL);
  if (!response.ok) throw new Error("OpenDota status " + response.status);
  const heroes = await response.json();

  const today = new Date().toISOString().slice(0, 10);
  const matchups = { patch: "unknown", updatedAt: today, pairs: {} };
  const wins = {};
  for (const h of heroes) {
    if (typeof h.id === "number") wins[h.id] = { games: h.games ?? 0, wins: h.wins ?? 0 };
  }
  matchups.pairs = wins;

  const meta = JSON.parse(readFileSync("data/meta.json", "utf8"));
  meta.updatedAt = today;

  // Validate our curated ids against the community hero list.
  // dotaconstants keys look like "npc_dota_hero_axe": strip the prefix.
  const constantsResponse = await fetch(CONSTANTS_URL);
  if (!constantsResponse.ok) throw new Error("dotaconstants status " + constantsResponse.status);
  const constants = await constantsResponse.json();
  const knownIds = new Set(Object.keys(constants).map((key) => key.replace("npc_dota_hero_", "")));
  const ours = JSON.parse(readFileSync("data/heroes.json", "utf8"));
  const unknown = ours.map((h) => h.id).filter((id) => !knownIds.has(id));
  if (unknown.length > 0) {
    console.warn("Unknown hero ids (not in dotaconstants): " + unknown.join(", "));
  } else {
    console.log("All " + ours.length + " curated hero ids match dotaconstants.");
  }

  writeFileSync("data/matchups.json", JSON.stringify(matchups, null, 2) + "\n");
  writeFileSync("data/meta.json", JSON.stringify(meta, null, 2) + "\n");
  console.log("Refreshed matchups for " + heroes.length + " heroes (" + today + ").");
} catch (error) {
  console.error("Refresh failed, data files untouched: " + error.message);
  process.exit(1);
}
