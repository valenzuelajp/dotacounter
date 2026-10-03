// app: enemy-picker UI — hero pool, tap-to-add enemy drafting, counters.
// Small functions, beginner-readable. State lives in one object.
(function app() {
  // Client column order: Strength, Agility, Intelligence, Universal.
  const ATTRIBUTE_ORDER = ["strength", "agility", "intelligence", "universal"];
  const ATTRIBUTE_LABELS = {
    strength: "Strength",
    agility: "Agility",
    intelligence: "Intelligence",
    universal: "Universal",
  };

  const state = {
    heroes: [],
    matchups: { heroes: {} }, // baked pub win rates for the badges.
    query: "", // live pool search text; "" means no filter.
    tab: "all", // pool role tab; one of all|carry|mid|offlane|support.
    showRates: false, // win numbers hidden until the toggle is switched on.
    dire: [], // the enemy lineup, max 5.
    expanded: false, // show-more toggle for the best-picks list.
    lastDire: "", // draft key; a new draft collapses the list again.
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

  // Render the pool as one vertical column per attribute, client order:
  // Strength, Agility, Intelligence, Universal; alphabetical in column.
  // A typed query never hides heroes: matches stay lit, the rest turn
  // black-and-white until the query is cleared.
  function renderPool() {
    const pool = document.querySelector(".hero-pool");
    pool.innerHTML = "";
    const match = window.DotaCounter.matchHeroName;
    for (const attribute of ATTRIBUTE_ORDER) {
      const group = state.heroes
        .filter(
          (h) =>
            (h.attribute || "strength") === attribute &&
            window.DotaCounter.roleMatches(h.role, state.tab)
        )
        .sort((a, b) => (a.name < b.name ? -1 : 1));
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
    // Show the typed letters so there is feedback; the search box
    // carries the full instructions in its placeholder.
    const hint = document.querySelector(".pool-query-hint");
    if (hint) {
      hint.textContent =
        state.query === ""
          ? "Tap an enemy to add them."
          : 'Filtering: "' + state.query + '".';
    }
  }

  // One draggable, clickable portrait card: portrait only, hero name in
  // the hover tooltip (client style). Query matches still dim the rest;
  // the hint line shows the typed text. Badge = baked pub hero win rate.
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
    // Tall client-style crop via CSS (the CDN has no vertical files);
    // the landscape art is center-cropped to portrait shape.
    img.src = hero.image;
    img.alt = hero.name;
    img.draggable = false;
    img.onerror = () => {
      img.onerror = null;
      img.src = "./assets/heroes/placeholder.png";
    };
    card.append(img);
    // Pub win-rate number from baked stats. Off unless the toggle is on;
    // plain bottom-left text like the client, tinted by value.
    const rate = window.DotaCounter.heroWinRate(hero.id, state.matchups);
    if (state.showRates && rate !== null) {
      const badge = document.createElement("div");
      badge.className =
        "win-badge " + (rate > 52 ? "win-high" : rate < 48 ? "win-low" : "win-mid");
      badge.textContent = rate + "%";
      badge.title = rate + "% pub win rate";
      card.appendChild(badge);
    }
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
      cell.className = "draft-slot" + (id ? " draft-slot-filled" : "");
      const number = document.createElement("span");
      number.className = "draft-slot-number";
      number.textContent = slot + 1;
      cell.appendChild(number);
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
        cell.append(img);
        cell.title = "Remove " + hero.name;
        cell.addEventListener("click", () => removeHero(id));
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
  // An empty ranking is thin data (few curated counters hit), not a
  // render bug, so the panel says so instead of going blank.
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
      return;
    }
    if (prompt) prompt.hidden = true;
    const ranked = view.supportMode
      ? window.DotaCounter.scoreCounters(state.dire, view.scorePool, state.matchups)
      : window.DotaCounter.roleAnswers(state.profile, state.enemySupports, state.dire, view.scorePool, state.matchups);
    renderSupportChips(view);
    if (ranked.length === 0) {
      const empty = document.createElement("p");
      empty.className = "counter-empty";
      empty.textContent = "No strong counters for this draft yet.";
      list.appendChild(empty);
      return;
    }
    // A new draft collapses the list back to the top 5.
    const draftKey = state.dire.join(",");
    if (draftKey !== state.lastDire) {
      state.lastDire = draftKey;
      state.expanded = false;
    }
    for (const entry of state.expanded ? ranked.slice(0, 10) : ranked.slice(0, 5)) {
      const item = document.createElement("div");
      item.className = "counter-entry";
      const hero = view.scorePool.find((h) => h.id === entry.id);
      if (hero) {
        const img = document.createElement("img");
        img.className = "hero-portrait counter-portrait";
        img.src = hero.image;
        img.alt = entry.name;
        img.onerror = () => { img.onerror = null; img.src = "./assets/heroes/placeholder.png"; };
        item.appendChild(img);
      }
      const body = document.createElement("div");
      body.className = "counter-body";
      const title = document.createElement("strong");
      title.className = "counter-name";
      title.textContent = entry.name + " (+" + (Math.round(entry.score * 10) / 10) + ")";
      const reason = document.createElement("p");
      reason.className = "counter-reason";
      // Top 2 reasons only; the hero page has the full story.
      reason.textContent = entry.reasons.slice(0, 2).join("; ");
      const detail = document.createElement("a");
      detail.className = "counter-detail-link";
      detail.href = "./heroes.html#" + entry.id;
      detail.textContent = "Items + skill tips";
      body.append(title, reason, detail);
      item.appendChild(body);
      list.appendChild(item);
    }
    if (ranked.length > 5) {
      const more = document.createElement("button");
      more.className = "counter-more";
      more.textContent = state.expanded ? "Show less" : "Show more";
      more.addEventListener("click", () => {
        state.expanded = !state.expanded;
        renderCounters();
      });
      list.appendChild(more);
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
    label.textContent = "Which enemies are supports?";
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
    state.matchups = data.matchups || { heroes: {} };
    // Draft caption: where the numbers come from and how fresh they are.
    const stamp = document.querySelector(".pool-data-date");
    if (stamp) {
      stamp.textContent =
        "Source: OpenDota public matches · updated " + (data.matchups.updatedAt || "unknown");
    }
    // Win-numbers toggle: off by default, remembered nowhere.
    const ratesBox = document.querySelector(".rates-checkbox");
    if (ratesBox) {
      ratesBox.addEventListener("change", () => {
        state.showRates = ratesBox.checked;
        renderPool();
      });
    }
    document.querySelectorAll(".role-tab").forEach((tab) => {
      tab.addEventListener("click", () => {
        state.tab = tab.dataset.tab;
        document.querySelectorAll(".role-tab").forEach((t) => {
          t.classList.toggle("role-tab-active", t === tab);
        });
        renderPool();
      });
    });
    // Visible search box and type-anywhere share one query string.
    const searchBox = document.querySelector(".pool-search");
    if (searchBox) {
      searchBox.addEventListener("input", () => {
        state.query = searchBox.value;
        renderPool();
      });
    }
    // Type-to-filter: printable keys append, Backspace deletes one
    // letter, Esc clears. Typing inside the box is left to the box.
    document.addEventListener("keydown", (event) => {
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if (event.target && event.target.classList &&
          event.target.classList.contains("pool-search")) return;
      if (event.key === "Backspace") {
        state.query = state.query.slice(0, -1);
      } else if (event.key === "Escape") {
        state.query = "";
      } else if (event.key.length === 1) {
        state.query = state.query + event.key;
      } else {
        return;
      }
      if (searchBox) searchBox.value = state.query;
      renderPool();
    });
    renderPool();
    renderBoard();
    // Instant hero-name tooltips (no 1s delay); win rate joins the name
    // only while the toggle is on.
    window.DotaCounter.attachInstantTips(document.querySelector(".hero-pool"), (card) => {
      const hero = heroById(card.dataset.heroId);
      if (!hero) return "";
      const rate = window.DotaCounter.heroWinRate(hero.id, state.matchups);
      return state.showRates && rate !== null ? hero.name + " · " + rate + "%" : hero.name;
    });
  });
})();
