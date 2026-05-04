import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const cards = JSON.parse(fs.readFileSync(path.join(root, "src", "data", "m4e_cards.json"), "utf8"));
const fixtures = JSON.parse(fs.readFileSync(path.join(root, "src", "data", "crew_regression_fixtures.json"), "utf8"));

const requiredFactions = [
  "Arcanists",
  "Bayou",
  "Explorer's Society",
  "Guild",
  "Neverborn",
  "Outcasts",
  "Resurrectionists",
  "Ten Thunders"
];
const requiredCoverage = ["normal-master", "title-master", "viktorias", "totem", "unique-model", "multi-copy-minion"];
const traitKeywords = new Set([
  "master",
  "totem",
  "unique",
  "living",
  "construct",
  "undead",
  "beast",
  "effigy",
  "enforcer",
  "henchman",
  "minion",
  "peon",
  "tyrant",
  "versatile"
]);

function clean(value) {
  return String(value ?? "")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

function keywords(card) {
  return Array.from(
    new Set(
      (card.keywords ?? [])
        .flatMap((keyword) => clean(keyword).split(/\s+-\s+| - |,/g))
        .map((keyword) => keyword.replace(/\(\(?[0-9]+\)?/g, "").replace(/[0-9]+\)/g, "").trim())
        .filter(Boolean)
    )
  );
}

function strategic(card) {
  return keywords(card).filter((keyword) => !traitKeywords.has(keyword.toLowerCase()));
}

function cost(card) {
  return typeof card.cost === "number" ? card.cost : Number.parseInt(String(card.cost ?? "0"), 10) || 0;
}

function unitGroupKey(card) {
  return [clean(card.faction), clean(card.name), cost(card), keywords(card).join("|")].join("::");
}

const units = [];
const unitGroups = new Map();
for (const card of cards.filter((item) => item.cardType === "unit")) {
  const key = unitGroupKey(card);
  const existing = unitGroups.get(key);
  if (existing) {
    existing.copyCount += 1;
  } else {
    const unit = {
      ...card,
      name: clean(card.name),
      faction: clean(card.faction),
      normalizedKeywords: keywords(card),
      copyCount: 1
    };
    unitGroups.set(key, unit);
    units.push(unit);
  }
}

function findUnit(faction, name) {
  return units.find((card) => card.faction === faction && card.name === name);
}

function findAnyUnit(name) {
  return units.find((card) => card.name === name);
}

function hireDetails(master, model) {
  const masterKeywords = strategic(master).map((keyword) => keyword.toLowerCase());
  const modelKeywords = strategic(model).map((keyword) => keyword.toLowerCase());
  const sharesKeyword = modelKeywords.some((keyword) => masterKeywords.includes(keyword));
  const sameFaction = model.faction === master.faction;
  const versatile = model.normalizedKeywords.some((keyword) => keyword.toLowerCase() === "versatile");

  if (sharesKeyword) return { legal: true, tax: 0, hireCost: cost(model) };
  if (sameFaction && versatile) return { legal: true, tax: 0, hireCost: cost(model) };
  if (sameFaction) return { legal: true, tax: 1, hireCost: cost(model) + 1 };
  return { legal: false, tax: 0, hireCost: cost(model) };
}

function hireEntries(hires = []) {
  return hires.map((hire) => (typeof hire === "string" ? { name: hire, count: 1 } : { name: hire.name, count: hire.count ?? 1 }));
}

function isUnique(model) {
  return model.normalizedKeywords.some((keyword) => keyword.toLowerCase() === "unique");
}

function maxCopies(model) {
  return isUnique(model) ? 1 : Math.max(1, model.copyCount);
}

const issues = [];
const coveredFactions = new Set();
const coveredTags = new Set();

for (const fixture of fixtures) {
  coveredFactions.add(fixture.faction);
  for (const tag of fixture.covers ?? []) coveredTags.add(tag);

  const master = findUnit(fixture.faction, fixture.masterName);
  if (!master) {
    issues.push(`${fixture.name}: missing master ${fixture.faction} - ${fixture.masterName}.`);
    continue;
  }

  const results = hireEntries(fixture.hires).map((hire) => {
    const model = findAnyUnit(hire.name);
    if (!model) {
      issues.push(`${fixture.name}: missing hire ${hire.name}.`);
      return { name: hire.name, count: hire.count, legal: false, tax: 0, hireCost: 0, copyLegal: false };
    }
    const details = hireDetails(master, model);
    const copyLegal = hire.count <= maxCopies(model);
    return { name: hire.name, count: hire.count, model, ...details, copyLegal };
  });

  const legal = results.every((result) => result.legal && result.copyLegal);
  if (legal !== fixture.expectedLegal) {
    issues.push(`${fixture.name}: expected legal=${fixture.expectedLegal}, got legal=${legal}.`);
  }

  for (const result of results) {
    if (!result.copyLegal) {
      const message = isUnique(result.model)
        ? `${result.name} is Unique and can only be hired once`
        : `${result.name} exceeds its copy limit of ${maxCopies(result.model)}`;
      if (!(fixture.expectedIssuesInclude ?? []).some((expected) => message.includes(expected))) {
        issues.push(`${fixture.name}: unexpected copy issue: ${message}.`);
      }
    }
  }

  for (const [modelName, expectedTax] of Object.entries(fixture.expectedTaxByModel ?? {})) {
    const actual = results.find((result) => result.name === modelName);
    if (!actual) continue;
    if (actual.tax !== expectedTax) {
      issues.push(`${fixture.name}: expected ${modelName} tax ${expectedTax}, got ${actual.tax}.`);
    }
  }

  for (const [modelName, expectedHireCost] of Object.entries(fixture.expectedHireCostByModel ?? {})) {
    const actual = results.find((result) => result.name === modelName);
    if (!actual) continue;
    if (actual.hireCost !== expectedHireCost) {
      issues.push(`${fixture.name}: expected ${modelName} hire cost ${expectedHireCost}, got ${actual.hireCost}.`);
    }
  }
}

for (const faction of requiredFactions) {
  if (!coveredFactions.has(faction)) issues.push(`Missing crew regression fixture for faction ${faction}.`);
}

for (const tag of requiredCoverage) {
  if (!coveredTags.has(tag)) issues.push(`Missing crew regression fixture coverage tag ${tag}.`);
}

if (issues.length > 0) {
  console.error(`Crew fixture validation failed with ${issues.length} issue(s):`);
  for (const issue of issues) console.error(`- ${issue}`);
  process.exit(1);
}

console.log(`Crew fixture validation passed for ${fixtures.length} fixtures across ${coveredFactions.size} factions.`);
