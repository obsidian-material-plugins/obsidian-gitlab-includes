import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";

const require = createRequire(import.meta.url);
const { StateField } = require("@codemirror/state");
const manifest = JSON.parse(readFileSync("manifest.json", "utf8"));
const bundle = readFileSync("main.js", "utf8");
for (const name of ["main.js", "manifest.json", "styles.css"]) {
  if (!readFileSync(name).length) throw new Error(`Empty release asset: ${name}`);
}
if (/audit-embeds|check-includes|C:\\Users\\|C:\/Users\/|clipboard\.readText|readFileSync|\beval\s*\(/.test(bundle)) {
  throw new Error("Development-only code found in release bundle");
}
const module = { exports: {} };
const obsidian = {
  Plugin: class {}, Component: class {}, MarkdownRenderChild: class {}, FuzzySuggestModal: class {},
  editorInfoField: StateField.define({ create: () => null, update: value => value }),
  editorLivePreviewField: StateField.define({ create: () => false, update: value => value })
};
const imports = new Set();
new vm.Script(bundle, { filename: "main.js" }).runInNewContext({
  module, exports: module.exports, console,
  require(name) {
    imports.add(name);
    if (name === "obsidian") return obsidian;
    if (name === "@codemirror/state" || name === "@codemirror/view") return require(name);
    throw new Error(`Unexpected runtime dependency: ${name}`);
  }
}, { timeout: 5000 });
const plugin = module.exports.default;
if (typeof plugin !== "function" || typeof plugin.prototype.onload !== "function") {
  throw new Error("Release bundle does not export an Obsidian plugin");
}
console.log(`Validated ${manifest.id} ${manifest.version}: plugin export and runtime imports (${[...imports].join(", ")}).`);
