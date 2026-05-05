import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const cardsPath = path.join(root, "src", "data", "m4e_cards.json");
const rulesPath = path.join(root, "src", "data", "master_crew_rules.json");

const cards = JSON.parse(fs.readFileSync(cardsPath, "utf8"));
const masterCrewRules = JSON.parse(fs.readFileSync(rulesPath, "utf8"));
const issues = [];
const warnings = [];

const warningAllowlist = [
  // Source filename typo is Drunstick; printed model name is Drumstick.
  /Drumstick .* source filename hint hat, drunstick/,
  // Source filename typo is Bookeeper; printed model name is Bookkeeper.
  /Bookkeeper .* source filename hint library, bookeeper/,
  // M&SU is normalized from filename token MSU, which is not directly present in the compact printed name.
  /M&Su, Fitzsimmons .* source filename hint msu, fizsimmons/
];

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

function slugify(value) {
  return clean(value)
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function compactSlug(value) {
  return clean(value)
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "");
}

function normalizeKeywords(keywords = []) {
  return Array.from(
    new Set(
      keywords
        .map(clean)
        .flatMap((keyword) => keyword.split(/\s+-\s+| - |,/g))
        .map((keyword) => keyword.replace(/\(\(?[0-9]+\)?/g, "").replace(/[0-9]+\)/g, "").trim())
        .filter(Boolean)
    )
  );
}

function normalizeCost(cost) {
  if (typeof cost === "number") return cost;
  const parsed = Number.parseInt(String(cost ?? "0"), 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

function isTrait(keyword) {
  return traitKeywords.has(keyword.toLowerCase().replace(/\s*\(.+\)/, "").trim());
}

function strategicKeywords(card) {
  return normalizeKeywords(card.keywords).filter((keyword) => !isTrait(keyword));
}

function hasKeyword(card, keyword) {
  return normalizeKeywords(card.keywords).some((item) => item.toLowerCase() === keyword);
}

function generatedUnitId(card) {
  return slugify([card.faction, card.name, normalizeKeywords(card.keywords).join("-"), normalizeCost(card.cost)].join("-"));
}

function unitGroupKey(card) {
  return [clean(card.faction), clean(card.name), normalizeCost(card.cost), normalizeKeywords(card.keywords).join("|")].join("::");
}

function sourceFilenameNameHint(card) {
  const parsed = path.parse(clean(card.sourceFile));
  const tokens = parsed.name
    .replace(/^M4E_/i, "")
    .replace(/^Stat_/i, "")
    .replace(/^Crew_/i, "")
    .replace(/^Upgrade_/i, "")
    .split(/[_\W]+/g)
    .map((token) => token.toLowerCase())
    .filter(Boolean);
  const noise = new Set([
    clean(card.faction).toLowerCase(),
    ...normalizeKeywords(card.keywords).map((keyword) => keyword.toLowerCase()),
    "m4e",
    "stat",
    "crew",
    "upgrade"
  ]);
  return tokens
    .filter((token) => token.length > 2 && !noise.has(token))
    .filter((token) => !/^[a-z]$/.test(token) && !/^[a-j]$/.test(token));
}

function suspiciousNameIssues(card, label) {
  const found = [];
  const name = clean(card.name);
  const nameTokens = name.toLowerCase().split(/[^a-z0-9]+/g).filter(Boolean);
  const compactName = compactSlug(name);
  const sourceHint = sourceFilenameNameHint(card).slice(-2);

  if (sourceHint.length >= 2 && sourceHint.every((token) => !compactName.includes(token))) {
    found.push(`${label} has no recognizable overlap with source filename hint ${sourceHint.join(", ")}.`);
  }

  for (const token of nameTokens) {
    if (token.length >= 10 && /([a-z]{5,}).*\1/.test(token)) {
      found.push(`${label} has suspicious repeated text in name token "${token}".`);
    }
  }

  return found;
}

if (!Array.isArray(cards)) {
  issues.push("m4e_cards.json must contain an array.");
} else {
  const ids = new Map();
  const unitGroups = new Map();

  for (const [index, card] of cards.entries()) {
    const label = `${clean(card.name) || `card at index ${index}`} (${clean(card.sourceFile) || "no source file"})`;

    if (!card.cardType) issues.push(`${label} is missing cardType.`);
    if (!card.name) issues.push(`${label} is missing name.`);
    if (!card.sourceFile) issues.push(`${label} is missing sourceFile.`);
    if (card.cardType !== "unknown" && !card.faction) issues.push(`${label} is missing faction.`);

    if (card.cardType === "unit") {
      warnings.push(...suspiciousNameIssues(card, label));
      const cost = normalizeCost(card.cost);
      if (!Number.isFinite(cost) || cost < 0) issues.push(`${label} has invalid cost: ${card.cost}.`);
      for (const stat of ["defense", "speed", "willpower", "size"]) {
        const value = Number(card.statBlock?.[stat] ?? 0);
        if (!Number.isFinite(value) || value < 0) issues.push(`${label} has invalid ${stat}: ${card.statBlock?.[stat]}.`);
      }

      const id = generatedUnitId(card);
      const existing = ids.get(id);
      if (existing && unitGroupKey(existing) !== unitGroupKey(card)) {
        issues.push(`${label} generates duplicate model id ${id} with ${existing.name}.`);
      }
      ids.set(id, card);
      unitGroups.set(unitGroupKey(card), card);
    }
  }

  const units = Array.from(unitGroups.values()).map((card) => ({
    ...card,
    name: clean(card.name),
    faction: clean(card.faction),
    sourceFile: clean(card.sourceFile),
    keywords: normalizeKeywords(card.keywords),
    rulesBlob: [
      clean(card.name),
      clean(card.sourceFile),
      clean(card.rulesText),
      ...(card.abilities ?? []).map((ability) => `${clean(ability.name)} ${clean(ability.text)}`),
      ...(card.actions ?? []).map((action) => `${clean(action.name)} ${clean(action.effect)}`)
    ].join(" ")
  }));

  const masters = units.filter((card) => hasKeyword(card, "master"));
  const totems = units.filter((card) => hasKeyword(card, "totem"));

  for (const rule of masterCrewRules.syntheticMasters ?? []) {
    const source = units.find((card) => clean(card.faction) === clean(rule.faction) && clean(card.name) === clean(rule.sourceModelName));
    if (!source) issues.push(`Synthetic master rule ${rule.id} references missing source model ${rule.faction} - ${rule.sourceModelName}.`);
    if (!rule.requiredCopies || rule.requiredCopies < 1) issues.push(`Synthetic master rule ${rule.id} must define requiredCopies >= 1.`);
  }

  for (const rule of masterCrewRules.titleTotems ?? []) {
    const master = masters.find((card) => slugify(card.faction) === slugify(rule.faction) && slugify(card.name) === slugify(rule.masterName));
    if (!master) {
      issues.push(`Title totem rule references missing master ${rule.faction} - ${rule.masterName}.`);
      continue;
    }

    for (const totemName of rule.totemNames ?? []) {
      const matches = totems.filter((card) => slugify(card.faction) === slugify(rule.faction) && slugify(card.name) === slugify(totemName));
      if (matches.length === 0) issues.push(`Title totem rule for ${rule.masterName} references missing totem ${totemName}.`);
      if (matches.length > 1) issues.push(`Title totem rule for ${rule.masterName} matches multiple totems named ${totemName}.`);
    }
  }

  for (const master of masters) {
    const synthetic = (masterCrewRules.syntheticMasters ?? []).find(
      (rule) => slugify(rule.faction) === slugify(master.faction) && slugify(rule.sourceModelName) === slugify(master.name)
    );
    if (synthetic?.suppressTotems) continue;

    const masterKeywords = strategicKeywords(master).map((keyword) => keyword.toLowerCase());
    const candidates = totems.filter(
      (totem) =>
        totem.faction === master.faction &&
        strategicKeywords(totem).some((keyword) => masterKeywords.includes(keyword.toLowerCase()))
    );
    if (candidates.length <= 1) continue;

    const configured = (masterCrewRules.titleTotems ?? []).find(
      (rule) => slugify(rule.faction) === slugify(master.faction) && slugify(rule.masterName) === slugify(master.name)
    );
    const directMatches = candidates.filter((totem) => compactSlug(master.rulesBlob).includes(compactSlug(totem.name)));
    const resolvedCount = configured ? configured.totemNames.length : directMatches.length;

    if (resolvedCount !== 1) {
      issues.push(`${master.faction} - ${master.name} has ambiguous totems: ${candidates.map((totem) => totem.name).join(", ")}.`);
    }
  }
}

if (warnings.length > 0) {
  const unreviewedWarnings = warnings.filter((warning) => !warningAllowlist.some((allowed) => allowed.test(warning)));
  warnings.length = 0;
  warnings.push(...unreviewedWarnings);
}

if (warnings.length > 0) {
  console.warn(`Card data validation warning(s):`);
  for (const warning of warnings) console.warn(`- ${warning}`);
}

if (issues.length > 0) {
  console.error(`Card data validation failed with ${issues.length} issue(s):`);
  for (const issue of issues) console.error(`- ${issue}`);
  process.exit(1);
}

console.log(`Card data validation passed for ${cards.length} cards.`);
