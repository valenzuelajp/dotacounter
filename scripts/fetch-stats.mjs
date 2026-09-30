// fetch-stats: refresh baked OpenDota stats. Run: node scripts/fetch-stats.mjs
// Writes data/matchups.json + data/meta.json stats. On any failure it exits
// non-zero WITHOUT touching data files, so baked data is never clobbered.
import { readFileSync, writeFileSync } from "node:fs";

const HEROES_URL = "https://api.opendota.com/api/heroes";

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
  writeFileSync("data/matchups.json", JSON.stringify(matchups, null, 2) + "\n");
  writeFileSync("data/meta.json", JSON.stringify(meta, null, 2) + "\n");
  console.log("Refreshed matchups for " + heroes.length + " heroes (" + today + ").");
} catch (error) {
  console.error("Refresh failed, data files untouched: " + error.message);
  process.exit(1);
}
