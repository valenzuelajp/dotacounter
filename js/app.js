// app: enemy-picker UI — hero pool, tap-to-add enemy drafting, counters.
// Small functions, beginner-readable. State lives in one object.
(function app() {
  const ATTRIBUTE_ORDER = ["agility", "strength", "intelligence", "universal"];
  const ATTRIBUTE_LABELS = {
    strength: "Strength",
    agility: "Agility",
    intelligence: "Intelligence",
    universal: "Universal",
  };

  const state = {
    heroes: [],
    query: "", // live pool search text; "" means no filter.
    dire: [], // the enemy lineup, max 5.
    profile: null, // carry | mid | offlane | support, asked once in the modal.
    enemySupports: [], // enemy heroes the player marked as supports.
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

  // Render the pool as one vertical column per attribute, owner order:
  // agility first. A typed query never hides heroes: matches glow,
  // the rest turn black-and-white until the query is cleared.
  function renderPool() {
    const pool = document.querySelector(".hero-pool");
    pool.innerHTML = "";
    const match = window.DotaCounter.matchHeroName;
    for (const attribute of ATTRIBUTE_ORDER) {
      const group = state.heroes.filter((h) => (h.attribute || "strength") === attribute);
      if (group.length === 0) continue;
      const column = document.createElement("div");
      column.className = "pool-column pool-column-" + attribute;
      const title = document.createElement("h3");
      title.className = "pool-group-title pool-group-" + attribute;
      title.textContent = ATTRIBUTE_LABELS[attribute];
      column.appendChild(title);
      const grid = document.createElement("div");
      grid.className = "hero-grid";
      for (const hero of group) {
        grid.appendChild(heroCard(hero));
      }
      column.appendChild(grid);
      pool.appendChild(column);
    }
    // Show the typed letters so there is feedback without a text field.
    const hint = document.querySelector(".pool-query-hint");
    if (hint) {
      hint.textContent =
        state.query === ""
          ? "Type to filter heroes — Backspace deletes, Esc clears."
          : 'Filtering: "' + state.query + '" — Backspace deletes, Esc clears.';
    }
  }

  // One draggable, clickable portrait card. With a query active,
  // non-matching heroes turn black-and-white; matches glow by name.
  function heroCard(hero) {
    const card = document.createElement("button");
    card.className = "hero-card";
    if (state.query !== "" && !window.DotaCounter.matchHeroName(hero.name, state.query)) {
      card.className = "hero-card hero-dimmed";
    }
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
    // Glowing match letters; plain escaped text when there is no query.
    name.innerHTML = window.DotaCounter.highlightName(hero.name, state.query);
    card.append(img, name);
    // Tap = add to the enemy lineup. Drag = drop onto the enemy slots.
    card.addEventListener("click", () => placeHero(hero.id));
    card.addEventListener("dragstart", (event) => {
      event.dataTransfer.setData("text/plain", hero.id);
    });
    return card;
  }

  // Add a hero to the enemy lineup (max 5, no duplicates).
  function placeHero(id) {
    if (state.dire.includes(id)) return;
    if (state.dire.length >= 5) return;
    state.dire.push(id);
    renderBoard();
  }

  // Remove a hero from the enemy lineup.
  function removeHero(id) {
    const index = state.dire.indexOf(id);
    if (index >= 0) state.dire.splice(index, 1);
    renderBoard();
  }

  // Render the enemy lineup as 5 slots (empty slots accept drops).
  function renderBoard() {
    renderTeam();
    renderCounters();
  }

  function renderTeam() {
    const row = document.querySelector(".draft-slots-dire");
    if (!row) return;
    row.innerHTML = "";
    for (let slot = 0; slot < 5; slot++) {
      const id = state.dire[slot];
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
        cell.addEventListener("click", () => removeHero(id));
      } else {
        cell.textContent = "Empty";
      }
      // Drops from the pool land in the first free enemy slot.
      cell.addEventListener("dragover", (event) => event.preventDefault());
      cell.addEventListener("drop", (event) => {
        event.preventDefault();
        placeHero(event.dataTransfer.getData("text/plain"));
      });
      row.appendChild(cell);
    }
  }

  // Role profile: supports score supports only; cores score the full
  // pool. There is no own team anymore, so the own-picks list is empty.
  function roleView() {
    return window.DotaCounter.applyRoleProfile(state.profile, [], state.heroes);
  }

  // Ranked counters against the enemy lineup, with detail links.
  // Support mode lists support-lane heroes under a support heading.
  function renderCounters() {
    const list = document.querySelector(".counter-list");
    const prompt = document.querySelector(".empty-prompt");
    const heading = document.querySelector(".counter-results .section-title");
    if (!list) return;
    list.innerHTML = "";
    const view = roleView();
    if (heading) {
      heading.textContent = view.supportMode ? "Best support picks" : "Best counters";
    }
    if (state.dire.length === 0) {
      if (prompt) prompt.hidden = false;
      const panel = document.querySelector(".hero-detail");
      if (panel) panel.innerHTML = "";
      return;
    }
    if (prompt) prompt.hidden = true;
    const ranked = view.supportMode
      ? window.DotaCounter.scoreCounters(state.dire, view.scorePool)
      : window.DotaCounter.roleAnswers(state.profile, state.enemySupports, state.dire, view.scorePool);
    renderSupportChips(view);
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

  // Enemy-support chips (core profiles): tap enemy heroes that are
  // supports to aim same-role answers at them. Hidden for support profiles.
  function renderSupportChips(view) {
    const box = document.querySelector(".enemy-support-pick");
    if (!box) return;
    box.innerHTML = "";
    if (view.supportMode || state.dire.length === 0) {
      box.hidden = true;
      return;
    }
    box.hidden = false;
    state.enemySupports = state.enemySupports.filter((id) => state.dire.includes(id));
    const label = document.createElement("span");
    label.className = "enemy-support-label";
    label.textContent = "Enemy supports? tap them:";
    box.appendChild(label);
    for (const id of state.dire) {
      const hero = heroById(id);
      if (!hero) continue;
      const chip = document.createElement("button");
      chip.className = "enemy-support-chip" + (state.enemySupports.includes(id) ? " enemy-support-chip-on" : "");
      chip.textContent = hero.name;
      chip.addEventListener("click", () => {
        const at = state.enemySupports.indexOf(id);
        if (at >= 0) state.enemySupports.splice(at, 1);
        else state.enemySupports.push(id);
        renderBoard();
      });
      box.appendChild(chip);
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
  // Remembered in localStorage so repeat visits skip the question.
  function chooseProfile(profile) {
    state.profile = profile;
    try {
      localStorage.setItem("dotacounter-profile", profile);
    } catch (error) {
      // Private mode or file:// without storage: asking each visit is fine.
    }
    const modal = document.querySelector(".role-modal");
    const change = document.querySelector(".role-change");
    if (modal) modal.hidden = true;
    if (change) {
      change.hidden = false;
      change.textContent = "Role: " + PROFILE_LABELS[profile] + " (change)";
    }
    renderBoard();
  }

  // Boot: restore a remembered profile, then load data and paint.
  wireRoleModal();
  try {
    const saved = localStorage.getItem("dotacounter-profile");
    if (saved === "carry" || saved === "mid" || saved === "offlane" || saved === "support") {
      state.profile = saved;
      const modal = document.querySelector(".role-modal");
      if (modal) modal.hidden = true;
      const change = document.querySelector(".role-change");
      if (change) {
        change.hidden = false;
        change.textContent = "Role: " + PROFILE_LABELS[saved] + " (change)";
      }
    }
  } catch (error) {
    // No storage: the modal asks every visit.
  }
  window.DotaCounter.loadData().then((data) => {
    state.heroes = data.heroes;
    // Type-to-filter: printable keys append, Backspace deletes one
    // letter, Esc clears. No text field; the hint line shows the query.
    document.addEventListener("keydown", (event) => {
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if (event.key === "Backspace") {
        state.query = state.query.slice(0, -1);
        renderPool();
      } else if (event.key === "Escape") {
        state.query = "";
        renderPool();
      } else if (event.key.length === 1) {
        state.query = state.query + event.key;
        renderPool();
      }
    });
    renderPool();
    renderBoard();
  });
})();
