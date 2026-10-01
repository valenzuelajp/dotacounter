// app: draft board UI — hero pool, drag+tap drafting, win estimate.
// Small functions, beginner-readable. State lives in one object.
(function app() {
  const ATTRIBUTE_ORDER = ["strength", "agility", "intelligence", "universal"];
  const ATTRIBUTE_LABELS = {
    strength: "Strength",
    agility: "Agility",
    intelligence: "Intelligence",
    universal: "Universal",
  };

  const state = {
    heroes: [],
    side: "radiant", // which team the next tap adds to.
    radiant: [],
    dire: [],
    profile: null, // carry | mid | offlane | support, asked once in the modal.
  };

  const PROFILE_LABELS = {
    carry: "Carry",
    mid: "Mid",
    offlane: "Offlane",
    support: "Support",
  };

  // Find a hero by id.
  function heroById(id) {
    return state.heroes.find((h) => h.id === id);
  }

  // Render the pool grouped by attribute, in Dota client order.
  function renderPool() {
    const pool = document.querySelector(".hero-pool");
    pool.innerHTML = "";
    for (const attribute of ATTRIBUTE_ORDER) {
      const group = state.heroes.filter((h) => (h.attribute || "strength") === attribute);
      if (group.length === 0) continue;
      const title = document.createElement("h3");
      title.className = "pool-group-title pool-group-" + attribute;
      title.textContent = ATTRIBUTE_LABELS[attribute];
      pool.appendChild(title);
      const grid = document.createElement("div");
      grid.className = "hero-grid";
      for (const hero of group) {
        grid.appendChild(heroCard(hero));
      }
      pool.appendChild(grid);
    }
  }

  // One draggable, clickable portrait card.
  function heroCard(hero) {
    const card = document.createElement("button");
    card.className = "hero-card";
    card.dataset.heroId = hero.id;
    card.draggable = true;
    const img = document.createElement("img");
    img.className = "hero-portrait";
    img.src = hero.image;
    img.alt = hero.name;
    img.draggable = false;
    img.onerror = () => {
      img.onerror = null;
      img.src = "./assets/heroes/placeholder.png";
    };
    const name = document.createElement("div");
    name.className = "hero-name";
    name.textContent = hero.name;
    card.append(img, name);
    // Tap = add to active side. Drag = drop onto a team slot.
    card.addEventListener("click", () => placeHero(hero.id, state.side));
    card.addEventListener("dragstart", (event) => {
      event.dataTransfer.setData("text/plain", hero.id);
    });
    return card;
  }

  // Add a hero to a team (max 5, no duplicates across teams).
  function placeHero(id, side) {
    const team = side === "radiant" ? state.radiant : state.dire;
    if (team.includes(id) || otherTeam(side).includes(id)) return;
    if (team.length >= 5) return;
    team.push(id);
    renderBoard();
  }

  function otherTeam(side) {
    return side === "radiant" ? state.dire : state.radiant;
  }

  // Remove a hero from a team slot.
  function removeHero(id, side) {
    const team = side === "radiant" ? state.radiant : state.dire;
    const index = team.indexOf(id);
    if (index >= 0) team.splice(index, 1);
    renderBoard();
  }

  // Render both teams as 5 slots each (empty slots accept drops).
  function renderBoard() {
    renderTeam(".draft-slots-radiant", "radiant");
    renderTeam(".draft-slots-dire", "dire");
    renderWin();
    renderCounters();
  }

  function renderTeam(selector, side) {
    const row = document.querySelector(selector);
    if (!row) return;
    row.innerHTML = "";
    const team = side === "radiant" ? state.radiant : state.dire;
    for (let slot = 0; slot < 5; slot++) {
      const id = team[slot];
      const cell = document.createElement("div");
      cell.className = "draft-slot" + (id ? "" : " draft-slot-empty");
      if (id) {
        const hero = heroById(id);
        const img = document.createElement("img");
        img.className = "hero-portrait";
        img.src = hero.image;
        img.alt = hero.name;
        img.onerror = () => {
          img.onerror = null;
          img.src = "./assets/heroes/placeholder.png";
        };
        const name = document.createElement("div");
        name.className = "hero-name";
        name.textContent = hero.name;
        cell.append(img, name);
        cell.title = "Remove " + hero.name;
        cell.addEventListener("click", () => removeHero(id, side));
      } else {
        cell.textContent = "Empty";
      }
      // Drops from the pool land in the first free slot of this team.
      cell.addEventListener("dragover", (event) => event.preventDefault());
      cell.addEventListener("drop", (event) => {
        event.preventDefault();
        placeHero(event.dataTransfer.getData("text/plain"), side);
      });
      row.appendChild(cell);
    }
  }

  // Role profile: supports score supports only; cores score without own supports.
  function roleView() {
    return window.DotaCounter.applyRoleProfile(state.profile, state.radiant, state.heroes);
  }

  // Render the win bar + one reason line per calculation shift.
  function renderWin() {
    const bar = document.querySelector(".win-bar-fill-radiant");
    const label = document.querySelector(".win-bar-label");
    const list = document.querySelector(".win-reasons");
    if (!bar || !label || !list) return;
    const view = roleView();
    const result = window.DotaCounter.winEstimate(view.calcRadiant, state.dire, view.scorePool);
    bar.style.width = result.radiant + "%";
    label.textContent =
      state.radiant.length === 0 && state.dire.length === 0
        ? "Draft heroes to estimate the winner (estimated)"
        : "Radiant " + result.radiant + "% — Dire " + result.dire + "% (estimated)";
    list.innerHTML = "";
    for (const reason of result.reasons) {
      const line = document.createElement("li");
      line.className = "win-reason";
      line.textContent = reason;
      list.appendChild(line);
    }
  }

  // Ranked counters against the drafted enemy (Dire) team, with detail links.
  // Support mode lists support-lane heroes under a support heading.
  function renderCounters() {
    const list = document.querySelector(".counter-list");
    const prompt = document.querySelector(".empty-prompt");
    const heading = document.querySelector(".counter-results .section-title");
    if (!list) return;
    list.innerHTML = "";
    const view = roleView();
    if (heading) {
      heading.textContent = view.supportMode ? "Best support picks vs Dire" : "Best counters vs Dire";
    }
    if (state.dire.length === 0) {
      if (prompt) prompt.hidden = false;
      const panel = document.querySelector(".hero-detail");
      if (panel) panel.innerHTML = "";
      return;
    }
    if (prompt) prompt.hidden = true;
    const ranked = window.DotaCounter.scoreCounters(state.dire, view.scorePool);
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
      detail.textContent = "How to beat them: items + skill tips";
      detail.addEventListener("click", () => renderHeroDetail(entry.id));
      item.append(title, reason, detail);
      list.appendChild(item);
    }
  }

  // One hero's items + skill tips: how to beat the enemy.
  function renderHeroDetail(id) {
    const hero = heroById(id);
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
    title.textContent = hero.name + " — how to beat them";
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

  // Side toggle: taps add to the active team.
  function wireSideToggle() {
    const buttons = document.querySelectorAll(".side-toggle");
    for (const button of buttons) {
      button.addEventListener("click", () => {
        state.side = button.dataset.side;
        for (const other of buttons) {
          other.classList.toggle("side-toggle-active", other === button);
        }
      });
    }
  }

  // Role modal: ask once, remember, allow change from the top bar.
  function wireRoleModal() {
    const modal = document.querySelector(".role-modal");
    const change = document.querySelector(".role-change");
    if (!modal) return;
    const options = modal.querySelectorAll(".role-option");
    for (const option of options) {
      option.addEventListener("click", () => chooseProfile(option.dataset.profile));
    }
    if (change) {
      change.addEventListener("click", () => {
        modal.hidden = false;
      });
    }
  }

  // Record the profile, close the modal, refresh the numbers.
  function chooseProfile(profile) {
    state.profile = profile;
    const modal = document.querySelector(".role-modal");
    const change = document.querySelector(".role-change");
    if (modal) modal.hidden = true;
    if (change) {
      change.hidden = false;
      change.textContent = "Role: " + PROFILE_LABELS[profile] + " (change)";
    }
    renderBoard();
  }

  // Boot: load data, then paint pool and board.
  wireSideToggle();
  wireRoleModal();
  window.DotaCounter.loadData().then((data) => {
    state.heroes = data.heroes;
    renderPool();
    renderBoard();
  });
})();
