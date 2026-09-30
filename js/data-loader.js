// data-loader: loads baked JSON, falls back gracefully, flags offline mode.
// Every fetch is relative ("./data/...") so the /dotacounter/ subpath works.
window.DotaCounter = window.DotaCounter || {};

window.DotaCounter.loadData = async function loadData() {
  // Load one JSON file; return null instead of throwing.
  async function loadFile(path) {
    try {
      const response = await fetch(path);
      if (!response.ok) return null;
      return await response.json();
    } catch (error) {
      return null;
    }
  }

  const heroes = (await loadFile("./data/heroes.json")) || [];
  const meta = (await loadFile("./data/meta.json")) || { patch: "unknown", tiers: {}, updatedAt: "unknown" };
  const matchups = (await loadFile("./data/matchups.json")) || { pairs: {} };

  // Offline means: we could not reach the live stats endpoint, so the page
  // shows baked data with a note. Live refresh is attempted by the caller.
  let offline = false;
  try {
    const probe = await fetch("https://api.opendota.com/api/heroes", { method: "HEAD" });
    if (!probe.ok) offline = true;
  } catch (error) {
    offline = true;
  }

  const note = document.querySelector(".offline-note");
  if (note) note.hidden = !offline;

  const label = document.querySelector(".patch-label");
  if (label) label.textContent = "Patch: " + meta.patch;

  return { heroes, meta, matchups, offline };
};
