import { copyFile, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { join } from "node:path";
import "./check-artifacts.mjs";

const manifest = JSON.parse(await readFile("manifest.json", "utf8"));
if (!/^[a-z-]+$/.test(manifest.id)) throw new Error("Invalid release directory name");
const directory = join("dist", manifest.id);
await mkdir(directory, { recursive: true });
const assets = ["main.js", "manifest.json", "styles.css"];
for (const asset of assets) await copyFile(asset, join(directory, asset));
const files = await readdir(directory);
if (files.length !== assets.length || files.some(file => !assets.includes(file))) {
  throw new Error("Unexpected files in installable release directory");
}
const checksums = [];
for (const asset of assets) {
  const original = await readFile(asset), packaged = await readFile(join(directory, asset));
  if (!original.equals(packaged)) throw new Error(`Release asset differs from build: ${asset}`);
  checksums.push(`${createHash("sha256").update(packaged).digest("hex")}  ${asset}`);
}
await writeFile("dist/SHA256SUMS", checksums.join("\n") + "\n");
await copyFile("RELEASE_NOTES.md", "dist/RELEASE_NOTES.md");
console.log(`Prepared ${directory} for release tag ${manifest.version}. No remote changes were made.`);
