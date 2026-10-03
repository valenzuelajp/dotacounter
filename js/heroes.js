// heroes: Heroes page pool + hero popup modal.
// Small functions, beginner-readable. State lives in one object.
// Guide schema (B3): hero.guide = { howToWin, playTips[], powerSpikes[],
// reviewed }. Unreviewed guides render with a draft badge.
(function heroes() {
  const CDN = "https://cdn.cloudflare.steamstatic.com";
  const ATTRIBUTE_ORDER = ["strength", "agility", "intelligence", "universal"];
  const ATTRIBUTE_LABELS = {
    strength: "Strength",
    agility: "Agility",
    intelligence: "Intelligence",
    universal: "Universal",
  };
  const PHASE_LABELS = { start: "Start", early: "Early", mid: "Mid", late: "Late" };

  const state = {
    heroes: [],
    items: {},
    builds: {},
    meta: { tiers: {} },
    matchups: { heroes: {} },
    query: "",
    tab: "all",
    showNames: false, // small names under portraits, off like the client.
    current: null, // hero id shown in the open modal, or null.
    lastFocus: null, // element that opened the modal, for focus restore.
  };

  // Find a hero by id.
  function heroById(id) {
    return state.heroes.find((h) => h.id === id);
  }

  // Tier letter (S/A/B/C) for a hero id, or null when unlisted.
  function tierOf(id) {
    const tiers = state.meta.tiers || {};
    for (const tier of ["S", "A", "B", "C"]) {
      if ((tiers[tier] || []).includes(id)) return tier;
    }
    return null;
  }

  // Percent of matches the hero appears in (one decimal). Baked totals
  // count all 10 picks per match, so the hero's share is multiplied by 10:
  // Axe at 1.8% of picks appears in ~18% of matches.
  function pickRate(id) {
    const all = state.matchups.heroes || {};
    let total = 0;
    for (const key of Object.keys(all)) total += all[key].games || 0;
    const entry = all[id];
    if (!entry || !(total > 0)) return null;
    return Math.round((entry.games / total) * 10000) / 10;
  }

  // One portrait-only pool card. Name lives in the hover tooltip.
  // Positions never move: the role tab hides in place, a typed query
  // dims non-matches to 40%.
  function heroCard(hero) {
    const card = document.createElement("button");
    card.className = "hero-card";
    if (!window.DotaCounter.roleMatches(hero.role, state.tab)) {
      card.className = "hero-card hero-tab-hidden";
    } else if (!window.DotaCounter.matchHeroName(hero.name, state.query)) {
      card.className = "hero-card hero-dimmed";
    }
    card.dataset.heroId = hero.id;
    card.draggable = false;
    const img = document.createElement("img");
    img.className = "hero-portrait";
    img.src = hero.image;
    img.alt = hero.name;
    img.draggable = false;
    img.onerror = () => {
      img.onerror = null;
      img.src = "./assets/heroes/placeholder.png";
    };
    card.appendChild(img);
    if (state.showNames) {
      const label = document.createElement("div");
      label.className = "hero-name";
      label.textContent = hero.name;
      card.appendChild(label);
    }
    card.addEventListener("click", () => openModal(hero.id));
    return card;
  }

  // Render the pool as one alpha-sorted column per attribute. Cards are
  // never removed: the role tab hides in place, a typed query dims.
  function renderPool() {
    const pool = document.querySelector(".hero-pool");
    if (!pool) return;
    pool.innerHTML = "";
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
      for (const hero of group) grid.appendChild(heroCard(hero));
      column.appendChild(grid);
      pool.appendChild(column);
    }
    const hint = document.querySelector(".pool-query-hint");
    if (hint) {
      hint.textContent =
        state.query === ""
          ? "Type to filter heroes — Backspace deletes, Esc clears."
          : "Filtering: " + state.query;
    }
    const box = document.querySelector(".pool-search");
    if (box && box.value !== state.query) box.value = state.query;
  }

  // Item icon with CDN-prefixed art; falls back to the item name as text.
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

  // Render the Start > Early > Mid > Late timeline for one hero.
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

  // Render GUIDE tab. Schema (documented for B3 authors):
  // hero.guide = { howToWin, playTips[], powerSpikes[], reviewed }.
  // Reviewed heroes show text alone; unreviewed show the text plus the
  // draft badge; heroes with no guide show "No guide yet".
  function renderGuide(hero) {
    const box = document.querySelector(".hero-modal-guide");
    box.innerHTML = "";
    const guide = hero.guide;
    const hasText =
      guide &&
      (guide.howToWin || (guide.playTips || []).length > 0 || (guide.powerSpikes || []).length > 0);
    if (!hasText) {
      // No guide text yet (B3 fills it in): small badge plus a placeholder
      // line, so the tab never looks empty or broken.
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

  // Render MATCHUPS tab: 5 most favorable + 5 least favorable pairings,
  // each with the win rate and sample size, plus the items that weaken
  // this hero from its curated counterItems. matchupEdge returns an
  // object { edge, games, wins, rate, lowSample }, never a number.
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
    // Third section: items that weaken this hero (curated data).
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

  // Fill and show the modal for one hero id.
  function openModal(id) {
    const hero = heroById(id);
    const dialog = document.querySelector(".hero-modal");
    if (!dialog) return;
    if (!hero) {
      // Unknown hash: message inside the dialog, pool untouched.
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
    // Restore the normal sections (an unknown-hash visit may hide them).
    document.querySelector(".hero-modal-top").hidden = false;
    document.querySelector(".hero-modal-timeline").hidden = false;
    document.querySelector(".hero-modal-missing").hidden = true;
    document.querySelector(".hero-modal-portrait").src = hero.image;
    document.querySelector(".hero-modal-portrait").alt = hero.name;
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
    // Three stat blocks: small caption above, larger value below.
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
    // Reset to the Guide tab on every open.
    document.querySelectorAll(".hero-modal-tab").forEach((t) => {
      t.classList.toggle("hero-modal-tab-active", t.dataset.mtab === "guide");
    });
    document.querySelector(".hero-modal-guide").hidden = false;
    document.querySelector(".hero-modal-matchups").hidden = true;
    document.querySelector(".hero-modal-backdrop").hidden = false;
    document.body.classList.add("modal-open");
    if (window.location.hash !== "#" + id) window.location.hash = "#" + id;
    document.querySelector(".hero-modal-close").focus();
  }

  // Hide the modal, restore focus, clear the hash.
  function closeModal() {
    const backdrop = document.querySelector(".hero-modal-backdrop");
    if (!backdrop || backdrop.hidden) return;
    backdrop.hidden = true;
    document.body.classList.remove("modal-open");
    state.current = null;
    if (window.location.hash !== "") {
      history.pushState("", document.title, window.location.pathname);
    }
    if (state.lastFocus && state.lastFocus.focus) state.lastFocus.focus();
  }

  // Keep only the modal focusable while it is open.
  function trapFocus(event) {
    if (event.key !== "Tab") return;
    const backdrop = document.querySelector(".hero-modal-backdrop");
    if (!backdrop || backdrop.hidden) return;
    const dialog = document.querySelector(".hero-modal");
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

  // Wire pool controls once data is loaded.
  function wire() {
    document.querySelectorAll(".role-tab").forEach((tab) => {
      tab.addEventListener("click", () => {
        state.tab = tab.dataset.tab;
        document.querySelectorAll(".role-tab").forEach((t) => {
          t.classList.toggle("role-tab-active", t === tab);
        });
        renderPool();
      });
    });
    const box = document.querySelector(".pool-search");
    if (box) {
      box.addEventListener("input", () => {
        state.query = box.value;
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
    // Type-anywhere: printable keys append, Backspace deletes one
    // letter, Esc clears. Skipped while typing in the search box, while
    // the modal is open, or when focus sits on a button or link — typing
    // and Space must never leak into the hidden query or get swallowed.
    const modalOpen = () => {
      const backdrop = document.querySelector(".hero-modal-backdrop");
      return backdrop && !backdrop.hidden;
    };
    document.addEventListener("keydown", (event) => {
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if (modalOpen()) return;
      const target = event.target;
      if (target && target.classList &&
          (target.classList.contains("pool-search") ||
           target.tagName === "BUTTON" ||
           target.tagName === "A" ||
           target.tagName === "INPUT")) return;
      if (event.key === "Backspace") {
        state.query = state.query.slice(0, -1);
        renderPool();
      } else if (event.key === "Escape") {
        // Clearing only: the modal has its own Escape handler below,
        // because this one returns early while the modal is open.
        state.query = "";
        renderPool();
      } else if (event.key === "Enter") {
        // Open the first matching hero's popup, then stop.
        if (state.query !== "") {
          for (const attribute of ATTRIBUTE_ORDER) {
            const group = (state.heroes || [])
              .filter((h) => (h.attribute || "strength") === attribute)
              .sort((a, b) => (a.name < b.name ? -1 : 1));
            const first = group.find((h) =>
              window.DotaCounter.matchHeroName(h.name, state.query)
            );
            if (first) {
              openModal(first.id);
              break;
            }
          }
        }
      } else if (event.key.length === 1) {
        state.query = state.query + event.key;
        renderPool();
      }
    });
    // Modal Escape: dedicated handler so an open popup always closes on
    // Esc and clears its hash (closeModal restores focus to the card).
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && modalOpen()) closeModal();
    });
    document.querySelector(".hero-modal-close").addEventListener("click", closeModal);
    document.querySelector(".hero-modal-backdrop").addEventListener("click", (event) => {
      if (event.target.classList.contains("hero-modal-backdrop")) closeModal();
    });
    // Guide / Matchups tabs: one visible panel at a time.
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
    document.addEventListener("keydown", trapFocus);
    window.addEventListener("hashchange", () => {
      const id = window.location.hash.replace("#", "");
      if (id === "") {
        closeModal();
      } else if (id !== state.current) {
        openModal(id);
      }
    });
  }

  // Boot: load data, wire controls, paint the pool, honor deep links.
  window.DotaCounter.loadData().then((data) => {
    state.heroes = data.heroes;
    state.meta = data.meta;
    state.matchups = data.matchups || { heroes: {} };
    // Same source caption as the Draft page (fix B2-4).
    const stamp = document.querySelector(".pool-data-date");
    if (stamp) {
      stamp.textContent =
        "Source: OpenDota public matches · updated " + (data.matchups.updatedAt || "unknown");
    }
    return fetch("./data/items.json")
      .then((r) => (r.ok ? r.json() : null))
      .then((items) => {
        state.items = (items && items.items) || {};
        return fetch("./data/builds.json");
      })
      .then((r) => (r.ok ? r.json() : null))
      .then((builds) => {
        state.builds = (builds && builds.builds) || {};
        wire();
        renderPool();
        // Instant hero-name tooltips (no 1s delay) over the pool.
        window.DotaCounter.attachInstantTips(document.querySelector(".hero-pool"), (card) => {
          const hero = (state.heroes || []).find((h) => h.id === card.dataset.heroId);
          return hero ? hero.name : "";
        });
        const id = window.location.hash.replace("#", "");
        if (id !== "") openModal(id);
      });
  });
})();
