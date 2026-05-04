import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const schemePoolsPath = path.join(root, "src", "lib", "scheme-pools.ts");
const strategyPoolsPath = path.join(root, "src", "lib", "strategy-pools.ts");

const schemeSource = fs.readFileSync(schemePoolsPath, "utf8");
const strategySource = fs.readFileSync(strategyPoolsPath, "utf8");
const issues = [];
const supportedTags = new Set([
  "damage",
  "burst",
  "armor",
  "incorporeal",
  "healing",
  "mobility",
  "placement",
  "scheme",
  "marker",
  "control",
  "cardPressure",
  "stunned",
  "slow",
  "staggered",
  "injured",
  "burning",
  "poison",
  "antiArmor",
  "antiTrigger",
  "summon",
  "demise",
  "ranged",
  "melee",
  "willpowerAttack",
  "defenseAttack",
  "speedAttack",
  "sizeAttack",
  "soulstone"
]);

function quotedValues(source, key) {
  return Array.from(source.matchAll(new RegExp(`${key}:\\s*"([^"]*)"`, "g")), (match) => match[1]);
}

function duplicateValues(values) {
  const seen = new Set();
  const duplicates = new Set();
  for (const value of values) {
    if (seen.has(value)) duplicates.add(value);
    seen.add(value);
  }
  return Array.from(duplicates);
}

const ids = quotedValues(schemeSource, "id");
const names = quotedValues(schemeSource, "name");

for (const duplicate of duplicateValues(ids)) {
  issues.push(`Duplicate scheme pool or scheme id: ${duplicate}.`);
}

for (const name of names) {
  if (!name.trim()) issues.push("Scheme pool or scheme has an empty name.");
}

for (const tagList of schemeSource.matchAll(/tags:\s*\[([^\]]*)\]/g)) {
  const tags = Array.from(tagList[1].matchAll(/"([^"]+)"/g), (match) => match[1]);
  for (const tag of tags) {
    if (!supportedTags.has(tag)) issues.push(`Unsupported scheme tag: ${tag}.`);
  }
}

const schemePoolIds = new Set(Array.from(schemeSource.matchAll(/^\s*id:\s*"([^"]+)"/gm), (match) => match[1]));
for (const schemePoolId of quotedValues(strategySource, "schemePoolId")) {
  if (!schemePoolIds.has(schemePoolId)) issues.push(`Strategy pool references missing scheme pool: ${schemePoolId}.`);
}

if (issues.length > 0) {
  console.error(`Scheme pool validation failed with ${issues.length} issue(s):`);
  for (const issue of issues) console.error(`- ${issue}`);
  process.exit(1);
}

console.log(`Scheme pool validation passed for ${schemePoolIds.size} pools.`);
