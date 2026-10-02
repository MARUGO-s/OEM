import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { isTrackingNavigation } from "../src/qr-routing.mjs";

const source = ts
  .transpileModule(
    readFileSync(new URL("../src/main.tsx", import.meta.url), "utf8"),
    {
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.ESNext,
      },
    },
  )
  .outputText.replace(/^import .*qr-routing.mjs.*;\s*/m, "")
  .replaceAll("import.meta.env.BASE_URL", JSON.stringify("/multiapp/"))
  .replaceAll("import(", "loadModule(");
function boot(hash) {
  const root = { innerHTML: "" };
  const scripts = [],
    metadata = [],
    imports = [];
  const handlers = {};
  const location = {
    hash,
    reloads: 0,
    reload() {
      this.reloads++;
    },
  };
  const document = {
    title: "",
    head: { append: (item) => metadata.push(item) },
    body: { append: (item) => scripts.push(item) },
    createElement: () => ({}),
    getElementById: () => root,
  };
  vm.runInNewContext(source, {
    location,
    window: {
      addEventListener: (name, handler) => {
        handlers[name] = handler;
      },
    },
    document,
    isTrackingNavigation,
    loadModule: (name) => {
      imports.push(name);
      return Promise.resolve();
    },
  });
  return { root, scripts, metadata, imports, document, location, handlers };
}
test("QR bootstrap avoids authentication and meeting workspace for root tracking links", () => {
  const state = boot("#abcdefgh1234");
  assert.deepEqual(state.imports, ["./tracking.css"]);
  assert.equal(state.scripts[0].src, "/multiapp/marugo/redirect.js");
  assert.match(state.root.innerHTML, /id="status"/);
  assert.equal(
    state.metadata.find((item) => item.name === "referrer").content,
    "no-referrer",
  );
});
test("Workspace bootstrap keeps the common login and application chooser for the plain root", () => {
  const state = boot("");
  assert.deepEqual(state.imports, ["./Workspace"]);
  assert.equal(state.scripts.length, 0);
});
test("Malformed public links show the redirect error screen, not the login", () => {
  assert.deepEqual(boot("#bad").imports, ["./tracking.css"]);
});
test("Pasting a QR URL into an already-open chooser dispatches the tracking page", () => {
  const state = boot("");
  state.location.hash = "#abcdefgh1234";
  state.handlers.hashchange();
  assert.equal(state.location.reloads, 1);
});
