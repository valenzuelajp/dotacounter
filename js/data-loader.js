// Data date is the freshness signal; there is no live probe and no
// offline note. Everything renders from baked JSON.
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

  const label = document.querySelector(".patch-label");
  if (label) label.textContent = "Patch: " + meta.patch;

  return { heroes, meta, matchups };
};
