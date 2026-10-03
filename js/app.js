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

  const PHASE_LABELS = { start: "Start", early: "Early", mid: "Mid", late: "Late" };
  const CDN = "https://cdn.cloudflare.steamstatic.com";

  const state = {
    heroes: [],
    items: {}, // item key -> { dname, img }, for timeline icons.
    builds: {}, // hero id -> { start[], early[], mid[], late[] }.
    meta: { tiers: {} }, // patch tiers for the guide's tier badge.
    matchups: { heroes: {} }, // baked pub win rates for the badges.
    query: "", // live pool search text; "" means no filter.
    tab: "all", // pool role tab; one of all|carry|mid|offlane|support.
    showRates: false, // win numbers hidden until the toggle is switched on.
    showNames: false, // small names under portraits, off like the client.
    dire: [], // the enemy lineup, max 5.
    roleScope: "mine", // best-counters pool: "mine" (own role) or "all".
    profile: null, // carry | mid | offlane | support, asked in the modal.
    enemySupports: [], // enemy heroes the player marked as supports.
    current: null, // hero id shown in the open guide, or null.
    lastFocus: null, // element that opened a popup, for focus restore.
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

  // One support row: portrait, name, win rate + sample. Clicking it
  // closes the list and opens that hero's guide, like the Heroes page.
  function supportRow(box, entry) {
    const hero = heroById(entry.id) || {};
    const row = document.createElement("button");
    row.className = "support-row";
    const img = document.createElement("img");
    img.className = "support-row-portrait";
    img.src = hero.image || "./assets/heroes/placeholder.png";
    img.alt = entry.name;
    img.onerror = () => {
      img.onerror = null;
      img.src = "./assets/heroes/placeholder.png";
    };
    const name = document.createElement("span");
    name.className = "support-row-name";
    name.textContent = entry.name;
    const stats = document.createElement("span");
    stats.className = "support-row-stats";
    stats.textContent = entry.rate.toFixed(1) + "% · " + entry.games.toLocaleString() + " games";
    row.append(img, name, stats);
    row.addEventListener("click", () => {
      hideBestModal();
      openGuide(entry.id);
    });
    box.appendChild(row);
  }

  function fillBestModal() {
    const popular = document.querySelector(".support-popular");
    const best = document.querySelector(".support-best");
    if (!popular || !best) return;
    popular.innerHTML = "";
    best.innerHTML = "";
    const ranked = window.DotaCounter.topSupports(state.heroes, state.matchups);
    for (const entry of ranked.popular) supportRow(popular, entry);
    for (const entry of ranked.best) supportRow(best, entry);
  }

  function openBestModal() {
    const modal = document.querySelector(".support-modal-backdrop");
    if (!modal) return;
    state.lastFocus = document.activeElement;
    fillBestModal();
    modal.hidden = false;
    document.body.classList.add("modal-open");
    const close = document.querySelector(".support-modal-close");
    if (close) close.focus();
  }

  function hideBestModal() {
    const modal = document.querySelector(".support-modal-backdrop");
    if (!modal) return;
    modal.hidden = true;
    liftModalOpen();
    if (state.lastFocus && state.lastFocus.focus) state.lastFocus.focus();
  }

  // Tier letter (S/A/B/C) for a hero id, or null when unlisted.
  function tierOf(id) {
    const tiers = (state.meta && state.meta.tiers) || {};
    for (const tier of ["S", "A", "B", "C"]) {
      if ((tiers[tier] || []).includes(id)) return tier;
    }
    return null;
  }

  // Percent of matches the hero appears in (one decimal).
  function pickRate(id) {
    const all = state.matchups.heroes || {};
    let total = 0;
    for (const key of Object.keys(all)) total += all[key].games || 0;
    const entry = all[id];
    if (!entry || !(total > 0)) return null;
    return Math.round((entry.games / total) * 10000) / 10;
  }

  // One item icon with a text fallback when the art is missing.
  function itemIcon(key) {
    const entry = state.items[key] || {};
    const wrap = document.createElement("span");
    wrap.className = "timeline-item";
    wrap.title = entry.dname || key;
    const img = document.createElement("img");
    img.className = "timeline-icon";
    img.alt = entry.dname || key;
    img.onerror = () => {
      img.remove();
      wrap.textContent = entry.dname || key;
    };
    img.src = CDN + (entry.img || "");
    if (!entry.img) {
      wrap.textContent = entry.dname || key;
      return wrap;
    }
    wrap.appendChild(img);
    return wrap;
  }

  // Start > Early > Mid > Late item timeline for one hero.
  function renderTimeline(hero) {
    const box = document.querySelector(".timeline-phases");
    box.innerHTML = "";
    const build = state.builds[hero.id];
    if (!build) {
      box.textContent = "No build data yet";
      return;
    }
    for (const phase of ["start", "early", "mid", "late"]) {
      const column = document.createElement("div");
      column.className = "timeline-phase";
      const label = document.createElement("h4");
      label.className = "timeline-phase-name";
      label.textContent = PHASE_LABELS[phase];
      column.appendChild(label);
      const list = build[phase] || [];
      if (list.length === 0) {
        column.appendChild(document.createTextNode("—"));
      }
      for (const row of list.slice(0, 5)) {
        const line = document.createElement("div");
        line.className = "timeline-row";
        line.appendChild(itemIcon(row.item));
        const share = document.createElement("span");
        share.className = "timeline-share";
        share.textContent = row.share + "%";
        line.appendChild(share);
        column.appendChild(line);
      }
      box.appendChild(column);
    }
  }

  // Guide tab: how-to-win, tips, power spikes, or a coming-soon note.
  function renderGuide(hero) {
    const box = document.querySelector(".hero-modal-guide");
    box.innerHTML = "";
    const guide = hero.guide;
    const hasText =
      guide &&
      (guide.howToWin || (guide.playTips || []).length > 0 || (guide.powerSpikes || []).length > 0);
    if (!hasText) {
      const badge = document.createElement("p");
      badge.className = "guide-draft-note";
      badge.textContent = "Draft guide, not yet reviewed";
      const soon = document.createElement("p");
      soon.className = "guide-coming-soon";
      soon.textContent = "Guide coming soon";
      box.append(badge, soon);
      return;
    }
    if (guide.reviewed !== true) {
      const badge = document.createElement("p");
      badge.className = "guide-draft-note";
      badge.textContent = "Draft guide, not yet reviewed";
      box.appendChild(badge);
    }
    if (guide.howToWin) {
      const win = document.createElement("p");
      win.className = "guide-how";
      win.textContent = guide.howToWin;
      box.appendChild(win);
    }
    for (const tip of guide.playTips || []) {
      const line = document.createElement("p");
      line.className = "guide-tip";
      line.textContent = tip;
      box.appendChild(line);
    }
    if ((guide.powerSpikes || []).length > 0) {
      const spikes = document.createElement("p");
      spikes.className = "guide-spikes";
      spikes.textContent = "Power spikes: " + guide.powerSpikes.join("; ");
      box.appendChild(spikes);
    }
  }

  // Matchups tab: 5 most/least favorable pairings plus item counters.
  function renderMatchupsTab(hero) {
    const box = document.querySelector(".hero-modal-matchups");
    box.innerHTML = "";
    const scored = [];
    for (const other of state.heroes) {
      if (other.id === hero.id) continue;
      const cell = window.DotaCounter.matchupEdge(hero.id, other.id, state.matchups);
      if (cell !== null) {
        scored.push({
          id: other.id,
          name: other.name,
          edge: cell.edge,
          games: cell.games,
          rate: cell.rate,
          lowSample: cell.lowSample,
        });
      }
    }
    scored.sort((a, b) => b.edge - a.edge);
    const groups = [
      ["Favorable", scored.slice(0, 5)],
      ["Unfavorable", scored.slice(-5).reverse()],
    ];
    for (const [label, rows] of groups) {
      const title = document.createElement("h4");
      title.className = "matchups-group-name";
      title.textContent = label;
      box.appendChild(title);
      if (rows.length === 0) {
        box.appendChild(document.createTextNode("No matchup data yet"));
        continue;
      }
      for (const row of rows) {
        const line = document.createElement("p");
        line.className = "matchups-row";
        line.textContent =
          row.name + " — " + row.rate + "% over " + row.games + " games";
        if (row.lowSample) {
          line.classList.add("matchups-row-thin");
          line.title = "Low sample";
        }
        box.appendChild(line);
      }
    }
    const itemsTitle = document.createElement("h4");
    itemsTitle.className = "matchups-group-name";
    itemsTitle.textContent = "Items that weaken this hero";
    box.appendChild(itemsTitle);
    const counters = hero.counterItems || [];
    if (counters.length === 0) {
      box.appendChild(document.createTextNode("No item counters listed yet"));
    }
    for (const entry of counters) {
      const line = document.createElement("div");
      line.className = "matchups-item-row";
      line.appendChild(itemIcon(entry.item));
      const why = document.createElement("span");
      why.className = "matchups-item-why";
      const dname = (state.items[entry.item] || {}).dname || entry.item;
      why.textContent = dname + " — " + entry.when;
      line.appendChild(why);
      box.appendChild(line);
    }
  }

  // Fill and show the hero guide, same content as the Heroes page.
  function openGuide(id) {
    const hero = heroById(id);
    const dialog = document.querySelector(".hero-modal");
    if (!dialog) return;
    if (!hero) {
      state.current = null;
      state.lastFocus = document.activeElement;
      document.querySelector(".hero-modal-top").hidden = true;
      document.querySelector(".hero-modal-timeline").hidden = true;
      document.querySelector(".hero-modal-missing").hidden = false;
      document.querySelector(".hero-modal-backdrop").hidden = false;
      document.body.classList.add("modal-open");
      document.querySelector(".hero-modal-close").focus();
      return;
    }
    state.current = id;
    state.lastFocus = document.activeElement;
    document.querySelector(".hero-modal-top").hidden = false;
    document.querySelector(".hero-modal-timeline").hidden = false;
    document.querySelector(".hero-modal-missing").hidden = true;
    const portrait = document.querySelector(".hero-modal-portrait");
    portrait.src = hero.image;
    portrait.alt = hero.name;
    portrait.onerror = () => {
      portrait.onerror = null;
      portrait.src = "./assets/heroes/placeholder.png";
    };
    document.querySelector(".hero-modal-name").textContent = hero.name;
    const attr = document.querySelector(".hero-modal-attr");
    attr.textContent = ATTRIBUTE_LABELS[hero.attribute] || hero.attribute;
    attr.className = "hero-modal-attr attr-" + (hero.attribute || "strength");
    const roles = document.querySelector(".hero-modal-roles");
    roles.innerHTML = "";
    const chip = document.createElement("span");
    chip.className = "hero-modal-role-chip";
    chip.textContent = hero.role;
    roles.appendChild(chip);
    const tier = tierOf(id);
    const win = window.DotaCounter.heroWinRate(id, state.matchups);
    const pick = pickRate(id);
    const meta = document.querySelector(".hero-modal-meta");
    meta.innerHTML = "";
    const stats = [
      ["Tier", tier || "—", tier ? "meta-tier-" + tier.toLowerCase() : ""],
      ["Win rate", win === null ? "—" : win + "%", ""],
      ["Pick", pick === null ? "—" : pick + "% of matches", ""],
    ];
    for (const [caption, value, valueClass] of stats) {
      const block = document.createElement("div");
      block.className = "meta-stat";
      const cap = document.createElement("div");
      cap.className = "meta-stat-caption";
      cap.textContent = caption;
      const val = document.createElement("div");
      val.className = "meta-stat-value" + (valueClass ? " " + valueClass : "");
      val.textContent = value;
      block.append(cap, val);
      meta.appendChild(block);
    }
    renderGuide(hero);
    renderMatchupsTab(hero);
    renderTimeline(hero);
    document.querySelectorAll(".hero-modal-tab").forEach((t) => {
      t.classList.toggle("hero-modal-tab-active", t.dataset.mtab === "guide");
    });
    document.querySelector(".hero-modal-guide").hidden = false;
    document.querySelector(".hero-modal-matchups").hidden = true;
    document.querySelector(".hero-modal-backdrop").hidden = false;
    document.body.classList.add("modal-open");
    document.querySelector(".hero-modal-close").focus();
  }

  function closeGuide() {
    const backdrop = document.querySelector(".hero-modal-backdrop");
    if (!backdrop || backdrop.hidden) return;
    backdrop.hidden = true;
    state.current = null;
    liftModalOpen();
    if (state.lastFocus && state.lastFocus.focus) state.lastFocus.focus();
  }

  // Drop the scroll lock only when every popup is closed.
  function liftModalOpen() {
    for (const selector of [".hero-modal-backdrop", ".support-modal-backdrop"]) {
      const backdrop = document.querySelector(selector);
      if (backdrop && !backdrop.hidden) return;
    }
    document.body.classList.remove("modal-open");
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
    state.meta = data.meta || { tiers: {} };
    state.matchups = data.matchups || { heroes: {} };
    // Item art + builds for the guide timeline (same files as Heroes).
    fetch("./data/items.json")
      .then((r) => (r.ok ? r.json() : null))
      .then((items) => {
        state.items = (items && items.items) || {};
        return fetch("./data/builds.json");
      })
      .then((r) => (r.ok ? r.json() : null))
      .then((builds) => {
        state.builds = (builds && builds.builds) || {};
      })
      .catch(() => {});
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
    // Caption-row button: reopen the first-pick support list any time.
    const firstPick = document.querySelector(".first-pick-button");
    if (firstPick) {
      firstPick.addEventListener("click", openBestModal);
    }
    // Keep Tab inside whichever Draft popup is open (guide or support).
    function trapFocus(event) {
      if (event.key !== "Tab") return;
      const open = [".hero-modal-backdrop", ".support-modal-backdrop"]
        .map((selector) => document.querySelector(selector))
        .find((backdrop) => backdrop && !backdrop.hidden);
      if (!open) return;
      const dialog = open.querySelector(".hero-modal, .support-modal");
      if (!dialog) return;
      const items = dialog.querySelectorAll("button, a[href], input");
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", trapFocus);

    // Guide popup wiring: close button, backdrop-click close, tabs.
    const guideClose = document.querySelector(".hero-modal-close");
    if (guideClose) {
      guideClose.addEventListener("click", closeGuide);
    }
    const guideBackdrop = document.querySelector(".hero-modal-backdrop");
    if (guideBackdrop) {
      guideBackdrop.addEventListener("click", (event) => {
        if (event.target.classList.contains("hero-modal-backdrop")) closeGuide();
      });
    }
    const bestBackdrop = document.querySelector(".support-modal-backdrop");
    if (bestBackdrop) {
      bestBackdrop.addEventListener("click", (event) => {
        if (event.target.classList.contains("support-modal-backdrop")) hideBestModal();
      });
    }
    document.querySelectorAll(".hero-modal-tab").forEach((tab) => {
      tab.addEventListener("click", () => {
        document.querySelectorAll(".hero-modal-tab").forEach((t) => {
          t.classList.toggle("hero-modal-tab-active", t === tab);
        });
        const guides = tab.dataset.mtab === "guide";
        document.querySelector(".hero-modal-guide").hidden = !guides;
        document.querySelector(".hero-modal-matchups").hidden = guides;
      });
    });
    const bestClose = document.querySelector(".support-modal-close");
    if (bestClose) {
      bestClose.addEventListener("click", hideBestModal);
    }
    // Data arrived after the modal opened: refill the open lists.
    const bestModal = document.querySelector(".support-modal-backdrop");
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
      const best = document.querySelector(".support-modal-backdrop");
      const guideBackdrop = document.querySelector(".hero-modal-backdrop");
      const popupOpen = (best && !best.hidden) || (guideBackdrop && !guideBackdrop.hidden);
      if (event.key === "Escape") {
        // Guide first, then the support list, then the draft. The role
        // question has no dismiss: it must be answered, so Esc never
        // closes it.
        if (guideBackdrop && !guideBackdrop.hidden) {
          closeGuide();
          return;
        }
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
