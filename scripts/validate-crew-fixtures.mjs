import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const cards = JSON.parse(fs.readFileSync(path.join(root, "src", "data", "m4e_cards.json"), "utf8"));
const fixtures = JSON.parse(fs.readFileSync(path.join(root, "src", "data", "crew_regression_fixtures.json"), "utf8"));

const traitKeywords = new Set(["master", "totem", "unique", "living", "construct", "undead", "beast", "effigy", "enforcer", "henchman", "minion", "peon", "tyrant", "versatile"]);

function clean(value) {
  return String(value ?? "").replace(/[\u2018\u2019]/g, "'").replace(/[\u201c\u201d]/g, '"').replace(/\s+/g, " ").trim();
}

function keywords(card) {
  return Array.from(new Set((card.keywords ?? []).flatMap((keyword) => clean(keyword).split(/\s+-\s+| - |,/g)).map((keyword) => keyword.replace(/\(\(?[0-9]+\)?/g, "").replace(/[0-9]+\)/g, "").trim()).filter(Boolean)));
}

function strategic(card) {
  return keywords(card).filter((keyword) => !traitKeywords.has(keyword.toLowerCase()));
}

function cost(card) {
  return typeof card.cost === "number" ? card.cost : Number.parseInt(String(card.cost ?? "0"), 10) || 0;
}

function findUnit(faction, name) {
  return cards.find((card) => card.cardType === "unit" && clean(card.faction) === faction && clean(card.name) === name);
}

function findAnyUnit(name) {
  return cards.find((card) => card.cardType === "unit" && clean(card.name) === name);
}

function hireDetails(master, model) {
  const masterKeywords = strategic(master).map((keyword) => keyword.toLowerCase());
  const modelKeywords = strategic(model).map((keyword) => keyword.toLowerCase());
  const sharesKeyword = modelKeywords.some((keyword) => masterKeywords.includes(keyword));
  const sameFaction = clean(model.faction) === clean(master.faction);
  const versatile = keywords(model).some((keyword) => keyword.toLowerCase() === "versatile");

  if (sharesKeyword) return { legal: true, tax: 0, hireCost: cost(model) };
  if (sameFaction && versatile) return { legal: true, tax: 0, hireCost: cost(model) };
  if (sameFaction) return { legal: true, tax: 1, hireCost: cost(model) + 1 };
  return { legal: false, tax: 0, hireCost: cost(model) };
}

const issues = [];

for (const fixture of fixtures) {
  const master = findUnit(fixture.faction, fixture.masterName);
  if (!master) {
    issues.push(`${fixture.name}: missing master ${fixture.faction} - ${fixture.masterName}.`);
    continue;
  }

  const results = fixture.hires.map((name) => {
    const model = findAnyUnit(name);
    if (!model) {
      issues.push(`${fixture.name}: missing hire ${name}.`);
      return { name, legal: false, tax: 0 };
    }
    return { name, ...hireDetails(master, model) };
  });

  const legal = results.every((result) => result.legal);
  if (legal !== fixture.expectedLegal) {
    issues.push(`${fixture.name}: expected legal=${fixture.expectedLegal}, got legal=${legal}.`);
  }

  for (const [modelName, expectedTax] of Object.entries(fixture.expectedTaxByModel ?? {})) {
    const actual = results.find((result) => result.name === modelName);
    if (!actual) continue;
    if (actual.tax !== expectedTax) {
      issues.push(`${fixture.name}: expected ${modelName} tax ${expectedTax}, got ${actual.tax}.`);
    }
  }
}

if (issues.length > 0) {
  console.error(`Crew fixture validation failed with ${issues.length} issue(s):`);
  for (const issue of issues) console.error(`- ${issue}`);
  process.exit(1);
}

console.log(`Crew fixture validation passed for ${fixtures.length} fixtures.`);
