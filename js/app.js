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
    showNames: false, // small names under portraits, off like the client.
    dire: [], // the enemy lineup, max 5.
    roleScope: "mine", // best-counters pool: "mine" (own role) or "all".
    profile: null, // carry | mid | offlane | support, asked in the modal.
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
  // Positions never move: the role tab hides non-matches in place
  // (space kept), and a typed query dims them instead of hiding.
  function renderPool() {
    const pool = document.querySelector(".hero-pool");
    pool.innerHTML = "";
    const match = window.DotaCounter.matchHeroName;
    for (const attribute of ATTRIBUTE_ORDER) {
      const group = state.heroes
        .filter((h) => (h.attribute || "strength") === attribute)
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
    // Stable grid: the role tab hides in place (space kept, nothing moves);
    // a typed query dims to 40% instead of hiding.
    if (!window.DotaCounter.roleMatches(hero.role, state.tab)) {
      card.className = "hero-card hero-tab-hidden";
    } else if (state.query !== "" && !window.DotaCounter.matchHeroName(hero.name, state.query)) {
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
    if (state.showNames) {
      const label = document.createElement("div");
      label.className = "hero-name";
      label.textContent = hero.name;
      card.appendChild(label);
    }
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

  // Remove the hero in enemy slot N (1-5). Empty slot is a no-op.
  function removeSlot(number) {
    const id = state.dire[number - 1];
    if (id) removeHero(id);
  }

  // Clear the whole enemy draft.
  function clearDraft() {
    if (state.dire.length === 0) return;
    state.dire = [];
    state.enemySupports = [];
    renderBoard();
  }
  // Remove one hero from the enemy lineup.
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
      // Portrait box keeps the slot number overlay; the name sits beneath.
      const art = document.createElement("div");
      art.className = "draft-slot-art";
      const number = document.createElement("span");
      number.className = "draft-slot-number";
      number.textContent = slot + 1;
      art.appendChild(number);
      cell.appendChild(art);
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
        art.append(img);
        const name = document.createElement("div");
        name.className = "draft-slot-name";
        name.textContent = hero.name;
        cell.append(name);
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
  // "All roles" scope ignores the profile and scores every hero.
  function roleView() {
    if (state.roleScope === "all") {
      return { scorePool: state.heroes, supportMode: false };
    }
    return window.DotaCounter.applyRoleProfile(state.profile, [], state.heroes);
  }

  // Rank one view: supports get the support pool, cores get role answers.
  function rankCounters(view) {
    return view.supportMode
      ? window.DotaCounter.scoreCounters(state.dire, view.scorePool, state.matchups)
      : window.DotaCounter.roleAnswers(state.profile, state.enemySupports, state.dire, view.scorePool, state.matchups);
  }

  // "My role / All roles" toggle above the list. Default is the
  // player's own role; "All roles" scores every hero.
  function renderScopeToggle() {
    const toggle = document.querySelector(".role-scope-toggle");
    if (!toggle) return;
    toggle.hidden = state.dire.length === 0;
    const mine = toggle.querySelector('[data-scope="mine"]');
    const all = toggle.querySelector('[data-scope="all"]');
    if (mine) {
      mine.textContent = "My role (" + (PROFILE_LABELS[state.profile] || "pick a role") + ")";
      mine.classList.toggle("role-scope-btn-on", state.roleScope === "mine");
      mine.setAttribute("aria-pressed", state.roleScope === "mine" ? "true" : "false");
    }
    if (all) {
      all.classList.toggle("role-scope-btn-on", state.roleScope === "all");
      all.setAttribute("aria-pressed", state.roleScope === "all" ? "true" : "false");
    }
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
    if (state.dire.length === 0) {
      if (prompt) prompt.hidden = false;
      renderScopeToggle();
      return;
    }
    if (prompt) prompt.hidden = true;
    let view = roleView();
    let ranked = rankCounters(view);
    // Fewer than 5 own-role answers: fall back to the full pool so the
    // list stays useful. The toggle flips to All roles to show it.
    if (state.roleScope === "mine" && ranked.length < 5) {
      const allView = { scorePool: state.heroes, supportMode: false };
      const allRanked = rankCounters(allView);
      if (allRanked.length >= 5) {
        state.roleScope = "all";
        view = allView;
        ranked = allRanked;
      }
    }
    if (heading) {
      heading.textContent = view.supportMode ? "Best support picks" : "Best counters";
    }
    renderScopeToggle();
    renderSupportChips(view);
    if (ranked.length === 0) {
      const empty = document.createElement("p");
      empty.className = "counter-empty";
      empty.textContent = "No strong counters for this draft yet.";
      list.appendChild(empty);
      return;
    }
    // Top 5 only. The no-scroll rule forbids a "Show more" expander.
    for (const entry of ranked.slice(0, 5)) {
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
      const rounded = Math.round(entry.score * 10) / 10;
      const title = document.createElement("strong");
      title.className = "counter-name";
      title.textContent = entry.name + " (+" + rounded + ")";
      title.title = "Counter score +" + rounded + " from " + (entry.games || 0) + " ranked games";
      body.appendChild(title);
      // One-line reason; the hero page has the full story.
      const top = entry.reasons[0];
      if (top) {
        const line = document.createElement("p");
        line.className = "counter-reason" + (top.lowSample ? " counter-reason-thin" : "");
        line.textContent = top.text;
        if (top.lowSample) line.title = "Low sample — few ranked games";
        body.appendChild(line);
      }
      const detail = document.createElement("a");
      detail.className = "counter-detail-link";
      detail.href = "./heroes.html#" + entry.id;
      detail.textContent = "Tips";
      body.appendChild(detail);
      item.appendChild(body);
      list.appendChild(item);
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
      chip.setAttribute("aria-pressed", state.enemySupports.includes(id) ? "true" : "false");
      chip.addEventListener("click", () => {
        const at = state.enemySupports.indexOf(id);
        if (at >= 0) state.enemySupports.splice(at, 1);
        else state.enemySupports.push(id);
        renderBoard();
      });
      box.appendChild(chip);
    }
  }

  // Role modal: ask on every open, remember, allow change from the top bar.
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

  // Best supports this patch: informational list from the tested
  // topSupports ranking. Rows are not clickable — this modal only answers
  // "which supports are strongest right now".
  function fillBestModal() {
    const list = document.querySelector(".best-list");
    if (!list) return;
    list.innerHTML = "";
    const ranked = window.DotaCounter.topSupports(state.heroes, state.matchups);
    if (ranked.best.length === 0) {
      const row = document.createElement("div");
      row.className = "best-row";
      row.textContent = "Loading…";
      list.appendChild(row);
      return;
    }
    for (const entry of ranked.best) {
      const row = document.createElement("div");
      row.className = "best-row";
      const name = document.createElement("span");
      name.className = "best-row-name";
      name.textContent = entry.name;
      const stats = document.createElement("span");
      stats.className = "best-row-stats";
      stats.textContent = entry.rate.toFixed(1) + "% · " + entry.games.toLocaleString() + " games";
      row.append(name, stats);
      list.appendChild(row);
    }
  }

  function openBestModal() {
    const modal = document.querySelector(".best-modal");
    if (!modal) return;
    fillBestModal();
    modal.hidden = false;
    const close = document.querySelector(".best-close");
    if (close) close.focus();
  }

  function hideBestModal() {
    const modal = document.querySelector(".best-modal");
    if (!modal) return;
    modal.hidden = true;
  }

  // Record the profile, close the modal, refresh the numbers.
  // Remembered in localStorage for the change button label.
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
    // Support picked: follow with the best-supports-this-patch modal.
    if (profile === "support") openBestModal();
    else hideBestModal();
  }

  // Boot: restore a remembered profile for the change button,
  // then always ask — the popup shows on every open.
  wireRoleModal();
  try {
    const saved = localStorage.getItem("dotacounter-profile");
    if (saved === "carry" || saved === "mid" || saved === "offlane" || saved === "support") {
      state.profile = saved;
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
    // Names toggle: small name under each portrait, off by default.
    const namesBox = document.querySelector(".names-checkbox");
    if (namesBox) {
      namesBox.addEventListener("change", () => {
        state.showNames = namesBox.checked;
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
    // Best-counters pool scope: own role or every hero.
    document.querySelectorAll(".role-scope-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        state.roleScope = btn.dataset.scope;
        renderCounters();
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
    // Close button on the best-supports modal.
    const bestClose = document.querySelector(".best-close");
    if (bestClose) {
      bestClose.addEventListener("click", hideBestModal);
    }
    // Data arrived after the modal opened: refill the open list.
    const bestModal = document.querySelector(".best-modal");
    if (bestModal && !bestModal.hidden) fillBestModal();
  // First pool hero (attribute, then alphabetical) matching the query.
  function firstQueryMatch() {
    for (const attribute of ATTRIBUTE_ORDER) {
      const group = state.heroes
        .filter((h) => (h.attribute || "strength") === attribute)
        .sort((a, b) => (a.name < b.name ? -1 : 1));
      for (const hero of group) {
        if (window.DotaCounter.matchHeroName(hero.name, state.query)) return hero;
      }
    }
    return null;
  }

    // Type-to-filter: printable keys append, Backspace deletes one
    // letter (or the last drafted enemy when the box is empty), digits
    // 1-5 remove the hero in that enemy slot. Typing inside
    // the box is left to the box.
    document.addEventListener("keydown", (event) => {
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      const best = document.querySelector(".best-modal");
      const popupOpen = best && !best.hidden;
      if (event.key === "Escape") {
        // Popup first, then the draft. The role question has no
        // dismiss: it must be answered, so Esc never closes it.
        if (popupOpen) {
          hideBestModal();
          return;
        }
        state.query = "";
        clearDraft();
        if (searchBox) searchBox.value = "";
        renderPool();
        return;
      }
      if (popupOpen) return;
      if (event.target && event.target.classList &&
          (event.target.classList.contains("pool-search") ||
           event.target.tagName === "INPUT" ||
           event.target.tagName === "SELECT" ||
           event.target.tagName === "TEXTAREA")) return;
      if (event.key === "Backspace") {
        if (state.query === "") {
          const last = state.dire[state.dire.length - 1];
          if (last) removeHero(last);
        } else {
          state.query = state.query.slice(0, -1);
        }
      } else if (event.key >= "1" && event.key <= "5") {
        removeSlot(Number(event.key));
      } else if (event.key === "Enter") {
        // Add the first matching hero, then clear the search so the
        // box is empty for the next hero.
        if (state.query !== "") {
          const first = firstQueryMatch();
          if (first) placeHero(first.id);
          state.query = "";
        }
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
