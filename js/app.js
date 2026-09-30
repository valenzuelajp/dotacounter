// app: wires the picker grid to the scoring module and renders results.
// Function-per-job, each small enough for a beginner to read top to bottom.
(function app() {
  const state = { heroes: [], selected: [] };

  // Render clickable hero cards into .hero-grid (max 5 selected).
  function renderGrid() {
    const grid = document.querySelector(".hero-grid");
    grid.innerHTML = "";
    for (const hero of state.heroes) {
      const card = document.createElement("button");
      card.className = "hero-card" + (state.selected.includes(hero.id) ? " hero-card-selected" : "");
      card.dataset.heroId = hero.id;
      const img = document.createElement("img");
      img.src = "./" + hero.image;
      img.alt = hero.name;
      img.onerror = () => { img.onerror = null; img.src = "./assets/heroes/placeholder.png"; };
      const name = document.createElement("div");
      name.className = "hero-name";
      name.textContent = hero.name;
      card.append(img, name);
      card.addEventListener("click", () => toggleHero(hero.id));
      grid.appendChild(card);
    }
  }

  // Toggle one hero (cap at 5), then re-render grid + results.
  function toggleHero(id) {
    if (state.selected.includes(id)) {
      state.selected = state.selected.filter((h) => h !== id);
    } else if (state.selected.length < 5) {
      state.selected.push(id);
    }
    renderGrid();
    renderResults();
  }

  // Render ranked counters into .counter-list with reasons.
  function renderResults() {
    const list = document.querySelector(".counter-list");
    const prompt = document.querySelector(".empty-prompt");
    list.innerHTML = "";
    if (state.selected.length === 0) {
      if (prompt) prompt.hidden = false;
      return;
    }
    if (prompt) prompt.hidden = true;
    const ranked = window.DotaCounter.scoreCounters(state.selected, state.heroes);
    for (const entry of ranked.slice(0, 5)) {
      const item = document.createElement("div");
      item.className = "counter-entry";
      const title = document.createElement("strong");
      title.className = "counter-name";
      title.textContent = entry.name + " (+" + entry.score + ")";
      const reason = document.createElement("p");
      reason.className = "counter-reason";
      reason.textContent = entry.reasons.join("; ");
      const detail = document.createElement("button");
      detail.className = "counter-detail-link";
      detail.textContent = "Items + skill tips";
      detail.addEventListener("click", () => renderHeroDetail(entry.id));
      item.append(title, reason, detail);
      list.appendChild(item);
    }
  }

  // Render one hero's items + skill tips under the results.
  function renderHeroDetail(id) {
    const hero = state.heroes.find((h) => h.id === id);
    if (!hero) return;
    let panel = document.querySelector(".hero-detail");
    if (!panel) {
      panel = document.createElement("section");
      panel.className = "hero-detail";
      document.querySelector(".counter-results").appendChild(panel);
    }
    panel.innerHTML = "";
    const title = document.createElement("h3");
    title.className = "hero-detail-title";
    title.textContent = hero.name + " — items & skill tips";
    panel.appendChild(title);
    for (const entry of hero.counterItems || []) {
      const line = document.createElement("p");
      line.className = "hero-detail-item";
      line.textContent = entry.item + " — " + entry.when;
      panel.appendChild(line);
    }
    for (const tip of hero.skillTips || []) {
      const line = document.createElement("p");
      line.className = "hero-detail-tip";
      line.textContent = tip;
      panel.appendChild(line);
    }
  }

  // Boot: load data, then paint the grid.
  window.DotaCounter.loadData().then((data) => {
    state.heroes = data.heroes;
    renderGrid();
  });
})();
