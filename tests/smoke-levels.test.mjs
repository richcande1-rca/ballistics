import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const levels = [
  "Open Hills",
  "High Ground",
  "Trenches",
  "Timber Defenses",
  "Stone Defenses",
  "Stone Tower",
  "Three-Story Tower",
  "Archer Siege",
  "Drawbridge",
];

const files = new Map();
for (const name of ["game.html", "app.html", "level3-app.html", "level8-app.html", "level9-app.html"]) {
  files.set(name, await readFile(new URL(`../${name}`, import.meta.url), "utf8"));
}

function scriptsIn(html) {
  return [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].map((match) => match[1]);
}

async function runLoader(html, level) {
  let written;
  const frame = {
    addEventListener() {},
    contentDocument: null,
    contentWindow: { focus() {} },
    src: "",
  };
  const element = {
    addEventListener() {},
    click() {},
    disabled: false,
    hidden: false,
    textContent: "",
  };
  const document = {
    close() {},
    createElement() { return { ...element, append() {}, style: {} }; },
    open() {},
    querySelector(selector) { return selector === "#g" ? frame : element; },
    write(value) { written = value; },
  };
  const context = {
    Audio: function Audio() {},
    clearInterval() {},
    clearTimeout() {},
    console,
    document,
    fetch: async (name) => ({ ok: files.has(name), status: files.has(name) ? 200 : 404, text: async () => files.get(name) }),
    location: { search: `?level=${level}`, replace() {} },
    matchMedia: () => ({ matches: false }),
    MutationObserver: class { disconnect() {} observe() {} },
    setInterval() { return 0; },
    setTimeout() { return 0; },
    top: null,
    URLSearchParams,
    window: null,
  };
  context.window = context;
  context.top = context;

  for (const script of scriptsIn(html)) {
    const awaitableScript = script.replace(/load\(\)\.catch\(\(\)=>\{f\.src="game\.html"\}\);/, "return load();");
    assert.ok(!script.includes("async function load") || awaitableScript !== script, "could not make the game loader awaitable");
    const result = new vm.Script(awaitableScript).runInNewContext(context);
    if (result && typeof result.then === "function") await result;
  }
  await new Promise((resolve) => globalThis.setTimeout(resolve, 20));
  return written;
}

async function buildLevel(level) {
  let html = files.get("level9-app.html");
  for (let pass = 0; pass < 3; pass += 1) {
    const generated = await runLoader(html, level);
    assert.equal(typeof generated, "string", `Level ${level} loader pass ${pass + 1} did not build`);
    html = generated;
  }
  return html;
}

test("Levels 1–9 build and retain every expected level label", async () => {
  for (const [index, label] of levels.entries()) {
    const html = await buildLevel(index + 1);
    assert.ok(html.includes(`let L=${index + 1},M=Math`), `Level ${index + 1} was not selected in the generated loader`);
    assert.ok(html.includes(label), `Level ${index + 1} label ${JSON.stringify(label)} is missing`);
  }
});

test("the final generated game scripts parse", async () => {
  const generatedLoader = await buildLevel(9);
  const scripts = [...scriptsIn(generatedLoader), ...scriptsIn(files.get("game.html"))];
  assert.ok(scripts.length > 0, "generated game contains no scripts");
  for (const script of scripts) assert.doesNotThrow(() => new vm.Script(script));
});

test("Level 9 sweeps shots across the visible chain segments", () => {
  const source = files.get("level9-app.html");
  assert.ok(source.includes("SD(p.x,p.y,nx,ny,826,gy-72,804,top+18)<4.25"));
  assert.ok(source.includes("SD(p.x,p.y,nx,ny,878,gy-72,900,top+18)<4.25"));
  assert.ok(!source.includes("Math.hypot(nx-804,ny-(top+18))<18"));
  assert.ok(!source.includes("Math.hypot(nx-900,ny-(top+18))<18"));
});
