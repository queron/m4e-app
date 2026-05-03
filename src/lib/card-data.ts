import rawCards from "@/data/m4e_cards.json";
import type { CardCatalog, CrewCard, ModelCard, RawCard, UpgradeCard } from "./types";
import { cleanText, inferTags, modelRulesBlob, slugify } from "./strategy-tags";

const TRAIT_KEYWORDS = new Set([
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

let catalogCache: CardCatalog | undefined;

export function getCatalog(): CardCatalog {
  if (catalogCache) return catalogCache;

  const cards = rawCards as RawCard[];
  const unitGroups = new Map<string, { card: RawCard; count: number }>();

  for (const card of cards.filter((item) => item.cardType === "unit")) {
    const keywords = normalizeKeywords(card.keywords ?? []);
    const key = [
      cleanText(card.faction),
      cleanText(card.name),
      normalizeCost(card.cost),
      keywords.join("|")
    ].join("::");

    const current = unitGroups.get(key);
    if (current) {
      current.count += 1;
    } else {
      unitGroups.set(key, { card, count: 1 });
    }
  }

  const models = withSpecialMasters(Array.from(unitGroups.values()).map(({ card, count }) => toModelCard(card, count)));
  const crewCards = cards.filter((card) => card.cardType === "crew").map(toCrewCard);
  const upgrades = cards.filter((card) => card.cardType === "upgrade").map(toUpgradeCard);

  const factions = Array.from(new Set(models.map((model) => model.faction))).sort((a, b) => a.localeCompare(b));

  catalogCache = {
    factions,
    models: models.sort(sortByFactionName),
    masters: models.filter((model) => model.isMaster).sort(sortByFactionName),
    crewCards: crewCards.sort((a, b) => a.name.localeCompare(b.name)),
    upgrades: upgrades.sort((a, b) => a.name.localeCompare(b.name))
  };

  return catalogCache;
}

export function findCrewCardForMaster(master?: ModelCard): CrewCard | undefined {
  if (!master) return undefined;
  const catalog = getCatalog();
  const normalizedMaster = slugify(master.name);
  const masterFamily = slugify(master.name.split(",")[0] ?? master.name);

  return catalog.crewCards.find((crewCard) => {
    const source = slugify(crewCard.sourceFile);
    return source.includes(normalizedMaster) || source.includes(masterFamily);
  });
}

export function getPrimaryKeywords(model?: ModelCard): string[] {
  if (!model) return [];
  return model.strategicKeywords.length > 0 ? model.strategicKeywords : model.keywords.slice(-1);
}

export function legalModelsForMaster(master?: ModelCard): ModelCard[] {
  if (!master) return [];
  const primaryKeywords = new Set(getPrimaryKeywords(master).map((keyword) => keyword.toLowerCase()));

  return getCatalog().models.filter((model) => {
    if (model.isMaster || model.id === master.id || model.cost <= 0) return false;
    if (model.faction === master.faction) return true;
    return model.strategicKeywords.some((keyword) => primaryKeywords.has(keyword.toLowerCase()));
  });
}

export function getMandatoryCrewModels(master?: ModelCard): ModelCard[] {
  if (!master) return [];
  const models = getCatalog().models;
  const primaryKeywords = new Set(getPrimaryKeywords(master).map((keyword) => keyword.toLowerCase()));
  const mandatory: ModelCard[] = Array.from({ length: master.leaderModelCount }, () => master);

  if (master.id === "special-master-viktoria-chambers-ashes-and-blood") {
    return mandatory;
  }

  const totems = models
    .filter((model) => model.isTotem && model.faction === master.faction)
    .filter((model) => model.strategicKeywords.some((keyword) => primaryKeywords.has(keyword.toLowerCase())))
    .sort(sortByFactionName);

  return [...mandatory, ...selectTotemsForTitle(master, totems)];
}

export function getMandatoryCrewModelCount(master?: ModelCard): number {
  return getMandatoryCrewModels(master).length;
}

function toModelCard(card: RawCard, copyCount: number): ModelCard {
  const keywords = normalizeKeywords(card.keywords ?? []);
  const traits = keywords.filter((keyword) => isTrait(keyword));
  const strategicKeywords = keywords.filter((keyword) => !isTrait(keyword));
  const cost = normalizeCost(card.cost);
  const abilities = (card.abilities ?? []).map((ability) => ({
    name: cleanText(ability.name),
    text: cleanText(ability.text)
  }));
  const actions = (card.actions ?? []).map((action) => ({
    ...action,
    name: cleanText(action.name),
    effect: cleanText(action.effect),
    range: cleanText(action.range),
    stat: cleanText(action.stat),
    resist: cleanText(action.resist),
    targetNumber: cleanText(action.targetNumber),
    damage: cleanText(action.damage),
    triggers: (action.triggers ?? []).map((trigger) => ({
      condition: cleanText(trigger.condition),
      name: cleanText(trigger.name),
      effect: cleanText(trigger.effect)
    }))
  }));

  const partial = {
    name: cleanText(card.name),
    keywords,
    abilities,
    actions,
    rulesText: cleanText(card.rulesText)
  };
  const textIndex = modelRulesBlob(partial);
  const maxFromKeyword = extractMaxCopies(keywords);

  return {
    id: slugify([card.faction, card.name, keywords.join("-"), cost].join("-")),
    cardType: "unit",
    name: cleanText(card.name),
    faction: cleanText(card.faction),
    sourceFile: cleanText(card.sourceFile),
    keywords,
    traits,
    strategicKeywords,
    cost,
    isFree: cost === 0,
    isMaster: keywords.some((keyword) => keyword.toLowerCase() === "master"),
    isTotem: keywords.some((keyword) => keyword.toLowerCase() === "totem"),
    isUnique: keywords.some((keyword) => keyword.toLowerCase() === "unique"),
    maxCopies: maxFromKeyword ?? Math.max(1, copyCount),
    leaderModelCount: 1,
    statBlock: {
      defense: Number(card.statBlock?.defense ?? 0),
      speed: Number(card.statBlock?.speed ?? 0),
      willpower: Number(card.statBlock?.willpower ?? 0),
      size: Number(card.statBlock?.size ?? 0)
    },
    abilities,
    actions,
    rulesText: cleanText(card.rulesText),
    textIndex,
    tacticalTags: inferTags([textIndex], actions)
  };
}

function withSpecialMasters(models: ModelCard[]): ModelCard[] {
  const ashesAndBlood = models.find(
    (model) =>
      model.faction === "Outcasts" &&
      model.name === "Viktoria Chambers, Ashes And Blood" &&
      model.strategicKeywords.includes("Mercenary")
  );

  if (!ashesAndBlood || models.some((model) => model.id === "special-master-viktoria-chambers-ashes-and-blood")) {
    return models;
  }

  const twinMaster: ModelCard = {
    ...ashesAndBlood,
    id: "special-master-viktoria-chambers-ashes-and-blood",
    keywords: ["Master", ...ashesAndBlood.keywords.filter((keyword) => keyword !== "Unique")],
    traits: ["Master", ...ashesAndBlood.traits.filter((keyword) => keyword !== "Unique")],
    isMaster: true,
    isUnique: false,
    maxCopies: 2,
    leaderModelCount: 2,
    textIndex: `${ashesAndBlood.textIndex} Master Twin Masters Bounty Hunt two copies`
  };

  return [...models, twinMaster];
}

function toCrewCard(card: RawCard): CrewCard {
  const rulesText = cleanText(card.rulesText);
  const actions = card.actions ?? [];
  const sourceParts = cleanText(card.sourceFile).split("/");
  return {
    id: slugify([card.faction, card.name, card.sourceFile].join("-")),
    cardType: "crew",
    name: cleanText(card.name),
    faction: cleanText(card.faction),
    keywordHint: cleanText(sourceParts[1] ?? ""),
    masterHint: cleanText(sourceParts.at(-1) ?? ""),
    sourceFile: cleanText(card.sourceFile),
    abilities: (card.abilities ?? []).map((ability) => ({ name: cleanText(ability.name), text: cleanText(ability.text) })),
    actions,
    rulesText,
    tacticalTags: inferTags([rulesText], actions)
  };
}

function toUpgradeCard(card: RawCard): UpgradeCard {
  const rulesText = cleanText(card.rulesText);
  return {
    id: slugify([card.faction, card.name, card.sourceFile].join("-")),
    cardType: "upgrade",
    name: cleanText(card.name),
    faction: cleanText(card.faction),
    sourceFile: cleanText(card.sourceFile),
    abilitiesGranted: (card.abilitiesGranted ?? []).map((ability) => ({ name: cleanText(ability.name), text: cleanText(ability.text) })),
    rulesText,
    tacticalTags: inferTags([rulesText])
  };
}

function selectTotemsForTitle(master: ModelCard, totems: ModelCard[]): ModelCard[] {
  if (totems.length <= 1) return totems;

  const masterText = slugify(`${master.name} ${master.sourceFile} ${master.rulesText} ${master.textIndex}`);
  const directMatches = totems.filter((totem) => masterText.includes(slugify(totem.name)));

  return directMatches.length > 0 ? directMatches : totems;
}

function normalizeKeywords(keywords: string[]): string[] {
  return Array.from(
    new Set(
      keywords
        .map(cleanText)
        .flatMap((keyword) => keyword.split(/\s+-\s+| - |,/g))
        .map((keyword) => keyword.replace(/\(\([0-9]+\)/g, "").replace(/[0-9]+\)/g, "").trim())
        .filter(Boolean)
    )
  );
}

function normalizeCost(cost: RawCard["cost"]): number {
  if (typeof cost === "number") return cost;
  const parsed = Number.parseInt(String(cost ?? "0"), 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

function isTrait(keyword: string): boolean {
  const normalized = keyword.toLowerCase().replace(/\s*\(.+\)/, "").trim();
  return TRAIT_KEYWORDS.has(normalized);
}

function extractMaxCopies(keywords: string[]): number | undefined {
  const joined = keywords.join(" ");
  const match = joined.match(/\(\(?([0-9]+)\)?/);
  return match ? Number(match[1]) : undefined;
}

function sortByFactionName(a: Pick<ModelCard, "faction" | "name">, b: Pick<ModelCard, "faction" | "name">): number {
  return a.faction.localeCompare(b.faction) || a.name.localeCompare(b.name);
}
