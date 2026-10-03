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

// Instant tooltip for hero pool cards: appears with no delay (unlike the
// ~1s native title tooltip). One shared div; delegated hover + focus;
// clamped inside the viewport. textFor(card) returns the string to show.
window.DotaCounter.attachInstantTips = function attachInstantTips(root, textFor) {
  let tip = document.querySelector(".instant-tip");
  if (!tip) {
    tip = document.createElement("div");
    tip.className = "instant-tip";
    tip.hidden = true;
    document.body.appendChild(tip);
  }
  function show(card) {
    const text = textFor(card);
    if (!text) {
      tip.hidden = true;
      return;
    }
    tip.textContent = text;
    tip.hidden = false;
    const pad = 12;
    const box = card.getBoundingClientRect();
    const size = tip.getBoundingClientRect();
    let left = box.left + 14;
    let top = box.top + 18;
    if (left + size.width > window.innerWidth - pad) left = box.left - size.width - 10;
    if (top + size.height > window.innerHeight - pad) top = box.top - size.height - 10;
    tip.style.left = Math.max(pad, left) + "px";
    tip.style.top = Math.max(pad, top) + "px";
  }
  function hide() {
    tip.hidden = true;
  }
  root.addEventListener("mouseover", (event) => {
    const card = event.target.closest(".hero-card");
    if (card && root.contains(card)) show(card);
  });
  root.addEventListener("mouseout", (event) => {
    if (event.target.closest(".hero-card")) hide();
  });
  root.addEventListener("focusin", (event) => {
    const card = event.target.closest(".hero-card");
    if (card && root.contains(card)) show(card);
  });
  root.addEventListener("focusout", hide);
};
