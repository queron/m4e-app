import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const proxyPath = path.join(root, "src", "data", "proxy_mappings.json");
const cardsPath = path.join(root, "src", "data", "m4e_cards.json");

const mappings = JSON.parse(fs.readFileSync(proxyPath, "utf8"));
const cards = JSON.parse(fs.readFileSync(cardsPath, "utf8"));
const modelNames = new Set(cards.filter((card) => card.cardType === "unit").map((card) => canonicalName(card.name)));
const issues = [];
const warnings = [];
const seen = new Set();

if (!Array.isArray(mappings)) {
  issues.push("proxy_mappings.json must contain an array.");
} else {
  for (const [index, mapping] of mappings.entries()) {
    if (!mapping || typeof mapping !== "object") {
      issues.push(`Mapping ${index} must be an object.`);
      continue;
    }
    if (!mapping.legacyName || typeof mapping.legacyName !== "string") issues.push(`Mapping ${index} is missing legacyName.`);
    if (!mapping.mayProxyForName || typeof mapping.mayProxyForName !== "string") issues.push(`Mapping ${index} is missing mayProxyForName.`);
    if (mapping.source !== "M4E Model Changes & Proxies") issues.push(`Mapping ${index} must use the official proxy source label.`);

    const key = `${canonicalName(mapping.legacyName ?? "")}__${canonicalName(mapping.mayProxyForName ?? "")}`;
    if (seen.has(key)) issues.push(`Duplicate proxy mapping: ${mapping.legacyName} -> ${mapping.mayProxyForName}.`);
    seen.add(key);

    if (mapping.mayProxyForName && !modelNames.has(canonicalName(mapping.mayProxyForName))) {
      warnings.push(`${mapping.legacyName} maps to ${mapping.mayProxyForName}, which is not present in m4e_cards.json.`);
    }
  }
}

for (const warning of warnings) console.warn(`Proxy mapping warning: ${warning}`);

if (issues.length > 0) {
  for (const issue of issues) console.error(`Proxy mapping error: ${issue}`);
  process.exit(1);
}

console.log(`Validated ${Array.isArray(mappings) ? mappings.length : 0} proxy mappings with ${warnings.length} unresolved targets.`);

function canonicalName(name) {
  return String(name).toLowerCase().replace(/[’']/g, "").replace(/[^a-z0-9]+/g, " ").trim();
}
