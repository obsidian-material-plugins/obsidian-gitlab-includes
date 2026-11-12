import { readFileSync } from "node:fs";

const manifest = JSON.parse(readFileSync("manifest.json", "utf8"));
const pkg = JSON.parse(readFileSync("package.json", "utf8"));
const versions = JSON.parse(readFileSync("versions.json", "utf8"));
const semver = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
if (Object.values(manifest).some(value => typeof value === "string" && /obsidian|plugin/i.test(value)) ||
    manifest.id !== "gitlab-includes" || manifest.name !== "GitLab Includes" ||
    !semver.test(manifest.version) || !semver.test(manifest.minAppVersion) ||
    manifest.version !== pkg.version || manifest.description.length > 250 ||
    !manifest.description.endsWith(".") || typeof manifest.isDesktopOnly !== "boolean" ||
    versions[manifest.version] !== manifest.minAppVersion) {
  throw new Error("Invalid manifest naming, description, or version");
}
