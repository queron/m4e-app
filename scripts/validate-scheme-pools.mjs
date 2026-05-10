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

for (const graphList of schemeSource.matchAll(/(?:nextAvailable|abandonNextAvailable):\s*\[([^\]]*)\]/g)) {
  const nextIds = Array.from(graphList[1].matchAll(/"([^"]+)"/g), (match) => match[1]);
  for (const nextId of nextIds) {
    if (!ids.includes(nextId)) issues.push(`Scheme graph references missing scheme id: ${nextId}.`);
  }
}

const schemePoolIds = new Set(Array.from(schemeSource.matchAll(/^\s*id:\s*"([^"]+)"/gm), (match) => match[1]));
for (const schemePoolId of quotedValues(strategySource, "schemePoolId")) {
  if (!schemePoolIds.has(schemePoolId)) issues.push(`Strategy pool references missing scheme pool: ${schemePoolId}.`);
}

const requiredStrategyInstructionIds = [
  "plant-explosives-gg4",
  "raid-the-vaults",
  "cloak-and-dagger",
  "stuff-the-ballots"
];

function objectBlockForId(source, id) {
  const idIndex = source.indexOf(`id: "${id}"`);
  if (idIndex < 0) return "";
  const start = source.lastIndexOf("{", idIndex);
  if (start < 0) return "";
  let depth = 0;
  for (let index = start; index < source.length; index += 1) {
    const char = source[index];
    if (char === "{") depth += 1;
    if (char === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(start, index + 1);
    }
  }
  return "";
}

for (const strategyId of requiredStrategyInstructionIds) {
  const strategyBlock = objectBlockForId(strategySource, strategyId);
  if (!/instructions:\s*\[[\s\S]*?"[^"]+"/.test(strategyBlock)) {
    issues.push(`Strategy ${strategyId} is missing instruction content.`);
  }
  if (!/sourceVersion:\s*"[^"]+"/.test(strategyBlock)) {
    issues.push(`Strategy ${strategyId} is missing sourceVersion metadata.`);
  }
}

if (issues.length > 0) {
  console.error(`Scheme pool validation failed with ${issues.length} issue(s):`);
  for (const issue of issues) console.error(`- ${issue}`);
  process.exit(1);
}

console.log(`Scheme pool validation passed for ${schemePoolIds.size} pools.`);
