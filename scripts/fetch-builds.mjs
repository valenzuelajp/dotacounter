// fetch-builds: pull per-hero OpenDota item-popularity timelines plus the
// dotaconstants item catalogue into data/items.json and data/builds.json.
// Run: node scripts/fetch-builds.mjs  (repo root, ~3 minutes, no key)
// Writes both files via temp+rename only after ALL fetches succeed.
// On any failure exits non-zero WITHOUT touching data files.
import { writeFileSync, renameSync } from "node:fs";

const DC_ITEMS_URL = "https://raw.githubusercontent.com/odota/dotaconstants/master/build/items.json";
const DC_ITEM_IDS_URL = "https://raw.githubusercontent.com/odota/dotaconstants/master/build/item_ids.json";
const DC_HEROES_URL = "https://raw.githubusercontent.com/odota/dotaconstants/master/build/heroes.json";
const ONE_SECOND = 1100;
const TOP_N = 6;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function getJson(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error("status " + response.status + " for " + url);
  return response.json();
}

// Retry once on rate-limit/server errors, then give up loudly.
// A 429 means the per-minute budget is spent, so wait it out (65s).
async function getJsonRetry(url) {
  try {
    return await getJson(url);
  } catch (first) {
    const wait = String(first.message).includes("429") ? ONE_SECOND * 60 : ONE_SECOND * 5;
    console.log("retrying after " + Math.round(wait / 1000) + "s: " + url);
    await sleep(wait);
    return await getJson(url);
  }
}

// Top N items of one phase with each item's share of the phase total.
// Share is one decimal, same convention as heroWinRate.
function topPhase(counts) {
  const entries = Object.entries(counts || {});
  const total = entries.reduce((sum, [, n]) => sum + n, 0);
  if (total === 0) return [];
  return entries
    .sort((a, b) => b[1] - a[1])
    .slice(0, TOP_N)
    .map(([numericId, games]) => ({
      item: numericId,
      games,
      share: Math.round((games / total) * 1000) / 10,
    }));
}

try {
  const dcItems = await getJson(DC_ITEMS_URL);
  const dcItemIds = await getJson(DC_ITEM_IDS_URL);
  const dcHeroes = await getJson(DC_HEROES_URL);

  // Keep only the fields the Heroes page needs.
  const items = {};
  for (const [key, entry] of Object.entries(dcItems)) {
    items[key] = {
      dname: entry.dname,
      img: entry.img,
      cost: entry.cost,
      hint: entry.hint,
    };
  }

  // numeric OpenDota id -> dotaconstants short key (= our hero id).
  const numericToOurs = {};
  for (const [num, entry] of Object.entries(dcHeroes)) {
    numericToOurs[Number(num)] = entry.name.replace("npc_dota_hero_", "");
  }
  const numericIds = Object.keys(numericToOurs).map(Number).sort((a, b) => a - b);

  const builds = {};
  let done = 0;
  for (const numericId of numericIds) {
    const pop = await getJsonRetry("https://api.opendota.com/api/heroes/" + numericId + "/itemPopularity");
    const ours = numericToOurs[numericId];
    const phases = {};
    for (const [phase, apiKey] of [["start", "start_game_items"], ["early", "early_game_items"], ["mid", "mid_game_items"], ["late", "late_game_items"]]) {
      const counts = {};
      for (const [itemNum, games] of Object.entries(pop[apiKey] || {})) {
        const key = dcItemIds[String(itemNum)];
        if (!key) continue;
        counts[key] = games;
      }
      phases[phase] = topPhase(counts);
    }
    builds[ours] = phases;
    done += 1;
    if (done % 20 === 0) console.log("fetched " + done + "/" + numericIds.length);
    await sleep(ONE_SECOND);
  }

  const stamp = new Date().toISOString().slice(0, 10);
  const itemsTemp = "data/items.json.tmp";
  const buildsTemp = "data/builds.json.tmp";
  // Minified on purpose: 501 items + 127 timelines are far too big pretty;
  // no human edits these files by hand.
  writeFileSync(itemsTemp, JSON.stringify({ updatedAt: stamp, items }));
  renameSync(itemsTemp, "data/items.json");
  writeFileSync(buildsTemp, JSON.stringify({ updatedAt: stamp, builds }));
  renameSync(buildsTemp, "data/builds.json");
  console.log("Wrote items (" + Object.keys(items).length + ") and builds for " + Object.keys(builds).length + " heroes.");
} catch (error) {
  console.error("Build refresh failed, data files untouched: " + error.message);
  process.exit(1);
}
