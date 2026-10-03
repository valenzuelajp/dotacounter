// noscroll.mjs: no-scroll regression test for DotaCounter.
// Serves the repo over local HTTP, drives headless Edge through CDP
// (zero npm dependencies: child_process + global WebSocket only), and
// fails if any page or panel scrolls at 1920x1080, 1600x900, 1366x768.
// Run: node scripts/noscroll.mjs
// Exit 0 = no scrollbars anywhere. Anything else = fail with a table.
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { join, extname, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const EDGE =
  process.env.EDGE_PATH ||
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const SIZES = [
  [1920, 1080],
  [1600, 900],
  [1366, 768],
];
const MIME = {
  ".html": "text/html",
  ".css": "text/css",
  ".js": "text/javascript",
  ".json": "application/json",
  ".png": "image/png",
  ".svg": "image/svg+xml",
};

// --- Static server for the repo root ------------------------------------
function serve() {
  const server = createServer(async (req, res) => {
    try {
      const path = join(ROOT, decodeURIComponent(req.url.split("?")[0]));
      const data = await readFile(path === ROOT + "\\" ? join(ROOT, "index.html") : path);
      res.writeHead(200, { "Content-Type": MIME[extname(path)] || "text/plain" });
      res.end(data);
    } catch {
      res.writeHead(404);
      res.end("nope");
    }
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve(server));
  });
}

// --- Minimal CDP client over the global WebSocket ------------------------
function connect(url) {
  const ws = new WebSocket(url);
  let nextId = 1;
  const pending = new Map();
  const events = [];
  ws.onmessage = ({ data }) => {
    const msg = JSON.parse(String(data));
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) reject(new Error(JSON.stringify(msg.error)));
      else resolve(msg.result);
    } else if (msg.method) {
      events.push(msg);
    }
  };
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const id = nextId++;
      pending.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params }));
    });
  const waitFor = (method, timeoutMs = 20000) =>
    new Promise((resolve, reject) => {
      const until = Date.now() + timeoutMs;
      const tick = () => {
        const i = events.findIndex((e) => e.method === method);
        if (i >= 0) return resolve(events.splice(i, 1)[0]);
        if (Date.now() > until) return reject(new Error("timeout: " + method));
        setTimeout(tick, 100);
      };
      tick();
    });
  return new Promise((resolve, reject) => {
    ws.onopen = () => resolve({ send, waitFor, close: () => ws.close() });
    ws.onerror = (e) => reject(e);
  });
}

async function debuggerUrl(port) {
  const until = Date.now() + 15000;
  while (Date.now() < until) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json/list`);
      const targets = await res.json();
      const page = targets.find((t) => t.type === "page");
      if (page) return page.webSocketDebuggerUrl;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error("edge debugger never came up on " + port);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function ready(client, timeoutMs = 25000) {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    const { result } = await client.send("Runtime.evaluate", {
      expression: "document.readyState",
      returnByValue: true,
    });
    if (result.value === "complete") return;
    await sleep(300);
  }
  throw new Error("timeout: document never complete");
}

// Measure scroll state of the document + every visible selector.
const MEASURE = `(selectors) => {
  const rows = [];
  const doc = document.documentElement;
  rows.push(["document", doc.scrollHeight, doc.clientHeight]);
  for (const sel of selectors) {
    for (const el of document.querySelectorAll(sel)) {
      if (el.hidden || el.offsetParent === null) continue;
      rows.push([sel, el.scrollHeight, el.clientHeight]);
    }
  }
  return rows;
}`;

// Draft scenario: role modal open, then mid profile + 5 drafted enemies.
const DRAFT_SETUP = `() => {
  const out = {};
  const role = document.querySelector('.role-option[data-profile="mid"]');
  if (role) role.click();
  const cards = [...document.querySelectorAll(".hero-pool .hero-card")].slice(0, 5);
  for (const card of cards) card.click();
  out.drafted = document.querySelectorAll(".draft-slots-dire .draft-slot-filled").length;
  return JSON.stringify(out);
}`;

// Heroes scenario: open the #axe popup, read both tabs.
const HEROES_SETUP = `(tab) => {
  if (tab === "matchups") {
    const t = document.querySelector('.hero-modal-tab[data-mtab="matchups"]');
    if (t) t.click();
  }
  const modal = document.querySelector(".hero-modal");
  return { modalOpen: modal ? !modal.hidden : false };
}`;

const DRAFT_SELECTORS = [
  ".pool-section",
  ".hero-pool",
  ".draft-main",
  ".draft-board",
  ".counter-results",
  ".counter-list",
  ".role-modal",
  ".support-modal-backdrop",
];
const HEROES_SELECTORS = [".heroes-view", ".hero-pool", ".hero-modal"];

async function check(client, base, path, setup, selectors, label) {
  await client.send("Page.navigate", { url: base + path });
  await ready(client);
  await sleep(2000); // baked JSON fetch + first render.
  if (setup) {
    // A setup that is only a function definition ("() => {...}") must be
    // invoked; one that already ends in a call ("...(\"guide\")") runs as-is.
    const trimmed = setup.trimEnd();
    const invoke = trimmed.endsWith(")") ? setup : `(${setup})()`;
    const { result: setupResult } = await client.send("Runtime.evaluate", {
      expression: invoke,
      returnByValue: true,
    });
    await sleep(800);
    if (setupResult && setupResult.value !== undefined) {
      const raw = setupResult.value;
      const info = typeof raw === "string" ? JSON.parse(raw) : raw;
      if (info && typeof info.drafted === "number") {
        results.push({ label, sel: "drafted-enemies", sh: info.drafted, ch: 5, ok: info.drafted === 5 });
      }
      if (info && typeof info.modalOpen === "boolean") {
        results.push({ label, sel: "popup-open", sh: info.modalOpen ? 1 : 0, ch: 1, ok: info.modalOpen });
      }
    }
  }
  const { result } = await client.send("Runtime.evaluate", {
    expression: `(${MEASURE})(${JSON.stringify(selectors)})`,
    returnByValue: true,
  });
  return result.value.map(([sel, sh, ch]) => ({
    label,
    sel,
    sh,
    ch,
    ok: sh <= ch + 1,
  }));
}

const results = [];
const server = await serve();
const base = `http://127.0.0.1:${server.address().port}`;
let port = 9333;
try {
  for (const [w, h] of SIZES) {
    const profile = mkdtempSync(join(tmpdir(), "edge-noscr-"));
    const edge = spawn(
      EDGE,
      [
        "--headless=new",
        "--disable-gpu",
        `--window-size=${w},${h}`,
        `--remote-debugging-port=${port}`,
        `--user-data-dir=${profile}`,
        "about:blank",
      ],
      { stdio: "ignore" }
    );
    try {
      const client = await connect(await debuggerUrl(port));
      await client.send("Page.enable");
      results.push(
        ...(await check(client, base, "/index.html", DRAFT_SETUP, DRAFT_SELECTORS, `draft ${w}x${h}`))
      );
      results.push(
        ...(await check(client, base, "/heroes.html", null, HEROES_SELECTORS, `heroes ${w}x${h}`))
      );
      results.push(
        ...(await check(client, base, "/heroes.html#axe", `(${HEROES_SETUP})("guide")`, HEROES_SELECTORS, `popup-guide ${w}x${h}`))
      );
      results.push(
        ...(await check(client, base, "/heroes.html#axe", `(${HEROES_SETUP})("matchups")`, HEROES_SELECTORS, `popup-matchups ${w}x${h}`))
      );
      client.close();
    } finally {
      edge.kill();
    }
    port++;
  }
} finally {
  server.close();
}

// --- Report ---------------------------------------------------------------
console.log("| page | element | scrollH | clientH | ok |");
console.log("| --- | --- | --- | --- | --- |");
for (const r of results) {
  console.log(`| ${r.label} | ${r.sel} | ${r.sh} | ${r.ch} | ${r.ok ? "PASS" : "FAIL"} |`);
}
const bad = results.filter((r) => !r.ok);
if (bad.length > 0) {
  console.log(`\n${bad.length} scrolling element(s) — FAIL`);
  process.exit(1);
}
console.log(`\nAll ${results.length} checks pass — no scrollbars.`);
