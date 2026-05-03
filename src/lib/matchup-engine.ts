import {
  findCrewCardForMaster,
  getCatalog,
  getPrimaryKeywords,
  legalModelsForMaster
} from "./card-data";
import { buildCrewByScore, validateCrew } from "./crew-validation";
import { getStrategy, type Strategy } from "./strategy-pools";
import type {
  CrewCard,
  MatchupAnalysis,
  ModelCard,
  ModelRecommendation,
  PlannerInput,
  RecommendationPath,
  TacticalTag
} from "./types";
import { actionToText, cleanText, containsTag } from "./strategy-tags";

const COUNTER_TAGS: Partial<Record<TacticalTag, TacticalTag[]>> = {
  armor: ["antiArmor", "injured", "poison", "burning", "control"],
  incorporeal: ["damage", "antiArmor", "cardPressure"],
  healing: ["damage", "stunned", "cardPressure"],
  mobility: ["staggered", "slow", "placement", "control"],
  placement: ["staggered", "slow", "control"],
  scheme: ["mobility", "scheme", "marker", "placement"],
  marker: ["mobility", "marker", "scheme", "placement"],
  cardPressure: ["cardPressure", "summon", "damage"],
  stunned: ["antiTrigger", "cardPressure", "damage"],
  slow: ["mobility", "cardPressure"],
  staggered: ["ranged", "placement", "mobility"],
  burning: ["damage", "healing", "control"],
  poison: ["damage", "healing", "control"],
  summon: ["burst", "damage", "scheme", "cardPressure"],
  ranged: ["mobility", "placement", "melee"],
  melee: ["ranged", "mobility", "control"],
  willpowerAttack: ["willpowerAttack", "cardPressure", "stunned"],
  defenseAttack: ["injured", "control", "damage"],
  speedAttack: ["staggered", "slow", "mobility"],
  sizeAttack: ["placement", "damage"],
  soulstone: ["cardPressure", "damage", "control"]
};

const ROLE_RULES: Array<[string, TacticalTag[]]> = [
  ["scheme runner", ["scheme", "mobility", "placement"]],
  ["scheme denial", ["marker", "placement", "control"]],
  ["beater", ["damage", "burst", "melee", "ranged"]],
  ["control", ["stunned", "slow", "staggered", "injured", "control"]],
  ["support", ["healing", "cardPressure", "summon"]],
  ["anchor", ["armor", "incorporeal", "demise"]]
];

export function analyzeMatchup(input: PlannerInput): MatchupAnalysis {
  const catalog = getCatalog();
  const playerMaster = catalog.models.find((model) => model.id === input.playerMasterId);
  const opponentMaster = catalog.models.find((model) => model.id === input.opponentMasterId);
  const opponentModels = input.opponentModelIds
    .map((id) => catalog.models.find((model) => model.id === id))
    .filter(Boolean) as ModelCard[];
  const ownedIds = new Set(input.ownedModelIds);
  const hasOwnedPool = ownedIds.size > 0;
  const modelLimit = input.modelLimit ?? 99;
  const strategy = getStrategy(input.strategyPoolId, input.strategyId);
  const playerCrewCard = findCrewCardForMaster(playerMaster);
  const opponentCrewCard = findCrewCardForMaster(opponentMaster);

  const legalCandidates = legalModelsForMaster(playerMaster);
  const availableCandidates = hasOwnedPool ? legalCandidates.filter((model) => ownedIds.has(model.id)) : legalCandidates;
  const opponentCandidates = legalModelsForMaster(opponentMaster);

  const opponentCrew = [opponentMaster, ...opponentModels].filter(Boolean) as ModelCard[];
  const scoredAll = legalCandidates.map((model) => scoreModel(model, playerMaster, playerCrewCard, opponentMaster, opponentCrewCard, opponentCrew, strategy));
  const scoredAvailable = availableCandidates.map((model) =>
    scoreModel(model, playerMaster, playerCrewCard, opponentMaster, opponentCrewCard, opponentCrew, strategy)
  );
  const likelyOpponentModels = buildLikelyCrewMembers(opponentMaster, opponentCrewCard, opponentCandidates, input.pointLimit, strategy);

  return {
    generatedAt: new Date().toISOString(),
    match: {
      strategy,
      strategyPoolId: input.strategyPoolId,
      pointLimit: input.pointLimit
    },
    playerCrew: {
      master: playerMaster,
      crewCard: playerCrewCard,
      faction: input.playerFaction,
      primaryKeywords: getPrimaryKeywords(playerMaster),
      strengths: describeStrengths(playerMaster, playerCrewCard, strategy),
      vulnerabilities: describeVulnerabilities(playerMaster, playerCrewCard, opponentCrew, strategy),
      playstyle: describePlaystyle(playerMaster, playerCrewCard, strategy)
    },
    opponentCrew: {
      master: opponentMaster,
      crewCard: opponentCrewCard,
      faction: input.opponentFaction,
      primaryKeywords: getPrimaryKeywords(opponentMaster),
      plan: describeOpponentPlan(opponentMaster, opponentCrewCard, opponentCrew, strategy),
      pressurePoints: describeOpponentPressure(opponentCrew),
      likelyModels: likelyOpponentModels
    },
    paths: {
      available: buildPath("available", playerMaster, scoredAvailable, ownedIds, input.pointLimit, modelLimit, !hasOwnedPool),
      optimal: buildPath("optimal", playerMaster, scoredAll, ownedIds, input.pointLimit, modelLimit)
    }
  };
}

function buildLikelyCrewMembers(
  master: ModelCard | undefined,
  crewCard: CrewCard | undefined,
  candidates: ModelCard[],
  pointLimit: number,
  strategy?: Strategy
): ModelRecommendation[] {
  const scored = candidates.map((model) => scoreLikelyModel(model, master, crewCard, strategy));
  const selected = buildCrewByScore(master, scored, pointLimit, 99);

  return selected
    .map((model) => scored.find((item) => item.model.id === model.id))
    .filter(Boolean)
    .map((item) => toRecommendation(item as ScoredModel, new Set(), true));
}

function scoreLikelyModel(model: ModelCard, master: ModelCard | undefined, crewCard: CrewCard | undefined, strategy?: Strategy): ScoredModel {
  const synergy = scoreCrewSynergy(model, master, crewCard);
  const strategyFit = scoreStrategyFit(model, strategy);
  const keywordBonus = master && model.strategicKeywords.some((keyword) => getPrimaryKeywords(master).includes(keyword)) ? 12 : 0;
  const roleBonus = model.tacticalTags.includes("scheme") || model.tacticalTags.includes("mobility") ? 5 : 0;
  const score = synergy.score + keywordBonus + roleBonus + strategyFit.score + efficiencyBonus(model);
  const shared = master ? model.strategicKeywords.filter((keyword) => getPrimaryKeywords(master).includes(keyword)) : [];

  return {
    model,
    score,
    role: inferRole(model),
    scoreBreakdown: {
      masterAbilities: 0,
      crewSynergy: synergy.score + keywordBonus,
      compositionMatchup: roleBonus + strategyFit.score + efficiencyBonus(model)
    },
    why: uniqueSentences([
      shared.length
        ? `${model.name} is a natural include because it shares ${shared.join(", ")} with ${master?.name}.`
        : `${model.name} is a likely flex hire from the legal pool.`,
      ...synergy.reasons,
      ...strategyFit.reasons,
      `It brings ${formatTags(model.tacticalTags.slice(0, 4))}, giving the crew a likely ${inferRole(model)} lane.`
    ]).slice(0, 4),
    relevantTech: likelyRelevantTech(model).slice(0, 5),
    priorityTargets: ["Likely included for role coverage rather than known target priority."],
    alliedSynergies: alliedSynergies(model, master, crewCard).slice(0, 4)
  };
}

function buildPath(
  kind: "available" | "optimal",
  master: ModelCard | undefined,
  scored: Array<ScoredModel>,
  ownedIds: Set<string>,
  pointLimit: number,
  modelLimit: number,
  treatAllAsAvailable = false
): RecommendationPath {
  const selected = buildCrewByScore(master, scored, pointLimit, modelLimit);
  const recommendations = selected
    .map((model) => scored.find((item) => item.model.id === model.id))
    .filter(Boolean)
    .map((item) => toRecommendation(item as ScoredModel, ownedIds, treatAllAsAvailable));
  const totalCost = recommendations.reduce((sum, recommendation) => sum + recommendation.model.cost, 0);

  return {
    kind,
    totalCost,
    remainingPoints: pointLimit - totalCost,
    validation: validateCrew(
      master,
      recommendations.map((recommendation) => recommendation.model),
      pointLimit,
      modelLimit
    ),
    models: recommendations
  };
}

type ScoredModel = {
  model: ModelCard;
  score: number;
  role: string;
  scoreBreakdown: {
    masterAbilities: number;
    crewSynergy: number;
    compositionMatchup: number;
  };
  why: string[];
  relevantTech: string[];
  priorityTargets: string[];
  alliedSynergies: string[];
};

function scoreModel(
  model: ModelCard,
  playerMaster: ModelCard | undefined,
  playerCrewCard: CrewCard | undefined,
  opponentMaster: ModelCard | undefined,
  opponentCrewCard: CrewCard | undefined,
  opponentCrew: ModelCard[],
  strategy?: Strategy
): ScoredModel {
  const masterAbilities = scoreAgainstMaster(model, opponentMaster, opponentCrewCard);
  const crewSynergy = scoreCrewSynergy(model, playerMaster, playerCrewCard);
  const compositionMatchup = scoreComposition(model, opponentCrew);
  const strategyFit = scoreStrategyFit(model, strategy);
  const score = masterAbilities.score + crewSynergy.score + compositionMatchup.score + strategyFit.score + efficiencyBonus(model);

  return {
    model,
    score,
    role: inferRole(model),
    scoreBreakdown: {
      masterAbilities: masterAbilities.score,
      crewSynergy: crewSynergy.score,
      compositionMatchup: compositionMatchup.score + strategyFit.score
    },
    why: uniqueSentences([...masterAbilities.reasons, ...crewSynergy.reasons, ...compositionMatchup.reasons, ...strategyFit.reasons]).slice(0, 4),
    relevantTech: relevantTech(model, opponentCrew).slice(0, 6),
    priorityTargets: uniqueSentences(priorityTargets(model, opponentMaster, opponentCrew)).slice(0, 4),
    alliedSynergies: alliedSynergies(model, playerMaster, playerCrewCard).slice(0, 4)
  };
}

function scoreAgainstMaster(model: ModelCard, opponentMaster?: ModelCard, opponentCrewCard?: CrewCard) {
  if (!opponentMaster) return { score: 0, reasons: ["No opposing master selected, so this score only uses general matchup heuristics."] };

  const opponentTags = new Set<TacticalTag>([...opponentMaster.tacticalTags, ...(opponentCrewCard?.tacticalTags ?? [])]);
  let score = 0;
  const reasons: string[] = [];

  for (const tag of opponentTags) {
    const counters = COUNTER_TAGS[tag] ?? [];
    const hits = counters.filter((counter) => model.tacticalTags.includes(counter));
    if (hits.length > 0) {
      score += 6 + hits.length * 2;
      reasons.push(`${model.name} brings ${formatTags(hits)} into ${opponentMaster.name}'s ${formatTags([tag])} plan.`);
    }
  }

  if (model.tacticalTags.includes("cardPressure") && /cheat fate|draw|discard|insight|soulstone/i.test(opponentMaster.textIndex)) {
    score += 8;
    reasons.push("It attacks the opponent master's resource engine by pressuring cards, deck control, or soulstone-fueled plays.");
  }

  return { score: clamp(score, 0, 35), reasons };
}

function scoreCrewSynergy(model: ModelCard, playerMaster?: ModelCard, playerCrewCard?: CrewCard) {
  if (!playerMaster) return { score: 0, reasons: [] };

  const masterKeywords = new Set(getPrimaryKeywords(playerMaster).map((keyword) => keyword.toLowerCase()));
  const sharedKeywords = model.strategicKeywords.filter((keyword) => masterKeywords.has(keyword.toLowerCase()));
  const tags = new Set<TacticalTag>([...playerMaster.tacticalTags, ...(playerCrewCard?.tacticalTags ?? [])]);
  let score = model.faction === playerMaster.faction ? 5 : 0;
  const reasons: string[] = [];

  if (sharedKeywords.length > 0) {
    score += 18;
    reasons.push(`It shares ${sharedKeywords.join(", ")} with ${playerMaster.name}, so it is likely to receive the crew-card package cleanly.`);
  }

  const reinforcingTags = model.tacticalTags.filter((tag) => tags.has(tag));
  if (reinforcingTags.length > 0) {
    score += Math.min(14, reinforcingTags.length * 4);
    reasons.push(`Its ${formatTags(reinforcingTags.slice(0, 3))} tools reinforce the master's printed crew plan.`);
  }

  if (model.tacticalTags.includes("cardPressure") && tags.has("soulstone")) {
    score += 5;
    reasons.push("Card and hand smoothing helps fuel soulstone-trigger turns without exhausting the hand.");
  }

  return { score: clamp(score, 0, 35), reasons };
}

function scoreComposition(model: ModelCard, opponentCrew: ModelCard[]) {
  const opponentTags = new Set<TacticalTag>(opponentCrew.flatMap((opponent) => opponent.tacticalTags));
  const opponentStats = summarizeStats(opponentCrew);
  let score = 0;
  const reasons: string[] = [];

  for (const tag of opponentTags) {
    const counters = COUNTER_TAGS[tag] ?? [];
    const hits = counters.filter((counter) => model.tacticalTags.includes(counter));
    if (hits.length > 0) score += 2 + hits.length;
  }

  if (opponentStats.averageDefense >= 6 && (model.tacticalTags.includes("willpowerAttack") || model.tacticalTags.includes("speedAttack"))) {
    score += 8;
    reasons.push("The opposing crew leans high Df, so attacking Wp or Sp gives you a cleaner angle than simply swinging into defense.");
  }

  if (opponentStats.averageWillpower <= 4.8 && model.tacticalTags.includes("willpowerAttack")) {
    score += 8;
    reasons.push("The opposing pool has low Wp targets, making its Wp attacks and control more reliable.");
  }

  if (opponentTags.has("summon") && (model.tacticalTags.includes("burst") || model.tacticalTags.includes("scheme"))) {
    score += 7;
    reasons.push("Burst damage and scheme pressure help punish wider opposing boards and summoned attrition pieces.");
  }

  if (opponentTags.has("mobility") && (model.tacticalTags.includes("staggered") || model.tacticalTags.includes("slow") || model.tacticalTags.includes("ranged"))) {
    score += 7;
    reasons.push("It slows down or reaches mobile pieces that would otherwise score around your main crew.");
  }

  return {
    score: clamp(score, 0, 35),
    reasons: reasons.length ? reasons : [`It covers ${formatTags(model.tacticalTags.slice(0, 3))} in the broader opposing crew profile.`]
  };
}

function scoreStrategyFit(model: ModelCard, strategy?: Strategy) {
  if (!strategy) return { score: 0, reasons: [] };
  let score = 0;
  const reasons: string[] = [];
  const tags = new Set(model.tacticalTags);

  const hasMobility = tags.has("mobility") || tags.has("placement");
  const hasMarkers = tags.has("scheme") || tags.has("marker");
  const hasControl = tags.has("control") || tags.has("stunned") || tags.has("slow") || tags.has("staggered");
  const hasDurability = tags.has("armor") || tags.has("incorporeal") || tags.has("healing") || tags.has("demise");
  const hasKilling = tags.has("damage") || tags.has("burst") || tags.has("antiArmor");

  for (const tag of strategy.tags) {
    const matched =
      (tag === "interact" && (hasMobility || hasMarkers)) ||
      (tag === "markers" && hasMarkers) ||
      (tag === "mobility" && hasMobility) ||
      (tag === "enemyHalf" && hasMobility) ||
      (tag === "spread" && hasMobility) ||
      (tag === "center" && (hasDurability || hasControl)) ||
      (tag === "control" && hasControl) ||
      (tag === "durability" && hasDurability) ||
      (tag === "scheme" && tags.has("scheme")) ||
      (tag === "denial" && (hasControl || tags.has("marker"))) ||
      (tag === "killing" && hasKilling) ||
      (tag === "antiScheme" && (tags.has("marker") || hasControl));
    if (matched) score += 4;
  }

  if (score > 0) {
    reasons.push(`${model.name} fits ${strategy.name} because it supports ${strategy.tags.join(", ")} scoring pressure.`);
  }

  return { score: clamp(score, 0, 18), reasons };
}

function relevantTech(model: ModelCard, opponentCrew: ModelCard[]): string[] {
  const opponentTags = new Set(opponentCrew.flatMap((opponent) => opponent.tacticalTags));
  const lines: string[] = [];

  for (const ability of model.abilities) {
    if (isRelevantText(`${ability.name} ${ability.text}`, opponentTags)) {
      lines.push(`${ability.name}: ${cleanText(ability.text)}`);
    }
  }

  for (const action of model.actions) {
    const text = actionToText(action);
    if (isRelevantText(text, opponentTags)) {
      const triggerText = (action.triggers ?? [])
        .slice(0, 2)
        .map((trigger) => `${trigger.name}: ${trigger.effect}`)
        .join("; ");
      lines.push(`${action.name}: ${cleanText(action.effect)}${triggerText ? ` Triggers - ${cleanText(triggerText)}` : ""}`);
    }
  }

  return lines.length ? lines : [`Most relevant profile tags: ${formatTags(model.tacticalTags.slice(0, 5))}.`];
}

function likelyRelevantTech(model: ModelCard): string[] {
  const abilities = model.abilities.slice(0, 3).map((ability) => `${ability.name}: ${cleanText(ability.text)}`);
  const actions = model.actions
    .filter((action) => /move|place|scheme|marker|heal|draw|damage|stunned|slow|injured|burning|poison/i.test(actionToText(action)))
    .slice(0, 3)
    .map((action) => `${action.name}: ${cleanText(action.effect) || "Relevant printed action."}`);

  return [...abilities, ...actions].filter(Boolean).length
    ? [...abilities, ...actions].filter(Boolean)
    : [`Most relevant profile tags: ${formatTags(model.tacticalTags.slice(0, 5))}.`];
}

function priorityTargets(model: ModelCard, opponentMaster?: ModelCard, opponentCrew: ModelCard[] = []): string[] {
  const candidates = [opponentMaster, ...opponentCrew].filter(Boolean) as ModelCard[];
  return candidates
    .map((target) => ({
      target,
      score:
        overlappingCounters(model, target).length * 5 +
        (target.isMaster ? 4 : 0) +
        (target.cost >= 9 ? 3 : 0) +
        (target.tacticalTags.includes("scheme") ? 2 : 0)
    }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((item) => `${item.target.name}: prioritize because ${model.name} answers ${formatTags(overlappingCounters(model, item.target).slice(0, 3))}.`);
}

function alliedSynergies(model: ModelCard, playerMaster?: ModelCard, playerCrewCard?: CrewCard): string[] {
  const lines: string[] = [];
  if (playerMaster) {
    const shared = model.strategicKeywords.filter((keyword) => getPrimaryKeywords(playerMaster).includes(keyword));
    if (shared.length) {
      lines.push(`${playerMaster.name}: shared ${shared.join(", ")} keyword makes the hire a natural carrier for the crew-card rules.`);
    }

    const sharedTags = model.tacticalTags.filter((tag) => playerMaster.tacticalTags.includes(tag)).slice(0, 3);
    if (sharedTags.length) {
      lines.push(`${playerMaster.name}: doubles down on ${formatTags(sharedTags)} so the crew can execute one plan consistently.`);
    }
  }

  if (playerCrewCard) {
    const sharedTags = model.tacticalTags.filter((tag) => playerCrewCard.tacticalTags.includes(tag)).slice(0, 3);
    if (sharedTags.length) {
      lines.push(`${playerCrewCard.name}: the crew card and this model both care about ${formatTags(sharedTags)}.`);
    }
  }

  if (containsTag(model, "scheme") && playerMaster && containsTag(playerMaster, "damage")) {
    lines.push(`${playerMaster.name}: lets the master spend activations fighting while this model handles scoring and denial work.`);
  }

  return lines.length ? lines : ["Best used as an independent tech piece that fills a gap the core keyword does not naturally cover."];
}

function describeStrengths(master?: ModelCard, crewCard?: CrewCard, strategy?: Strategy): string[] {
  if (!master) return ["Select a master to generate crew-level strengths."];
  const tags = Array.from(new Set([...master.tacticalTags, ...(crewCard?.tacticalTags ?? [])]));
  return [
    `${master.name} naturally plays toward ${formatTags(tags.slice(0, 5))}.`,
    crewCard ? `${crewCard.name} extends that plan through crew-wide ${formatTags(crewCard.tacticalTags.slice(0, 4))} tools.` : "No matching crew card was found in the data, so recommendations lean harder on stat cards.",
    strategy ? `${strategy.name}: ${strategy.summary}` : ""
  ].filter(Boolean);
}

function describeVulnerabilities(master: ModelCard | undefined, crewCard: CrewCard | undefined, opponentCrew: ModelCard[], strategy?: Strategy): string[] {
  if (!master) return ["Select a master to generate vulnerabilities."];
  const ownTags = new Set([...master.tacticalTags, ...(crewCard?.tacticalTags ?? [])]);
  const opponentTags = new Set(opponentCrew.flatMap((model) => model.tacticalTags));
  const gaps = Array.from(opponentTags).filter((tag) => !ownTags.has(tag)).slice(0, 5);
  const base = gaps.length
    ? [`The opposing crew pressures ${formatTags(gaps)}, which your core package does not fully answer by itself.`]
    : ["The selected master package overlaps the opponent's main pressure vectors, so the risk is more about activation tempo and target priority."];
  return strategy ? [...base, `For ${strategy.name}, watch whether your list has enough ${strategy.tags.join(", ")} tools.`] : base;
}

function describePlaystyle(master?: ModelCard, crewCard?: CrewCard, strategy?: Strategy): string {
  if (!master) return "Choose a player master to see a matchup plan.";
  const tags = Array.from(new Set([...master.tacticalTags, ...(crewCard?.tacticalTags ?? [])]));
  const role = inferRole({ ...master, tacticalTags: tags });
  const strategyText = strategy ? ` In ${strategy.name}, prioritize hires that help with ${strategy.tags.join(", ")}.` : "";
  return `${master.name} should start from a ${role} posture, then hire models that either amplify ${formatTags(tags.slice(0, 3))} or patch the matchup gaps below.${strategyText}`;
}

function describeOpponentPlan(master?: ModelCard, crewCard?: CrewCard, crew: ModelCard[] = [], strategy?: Strategy): string {
  if (!master) return "Choose an opponent master to identify their likely game plan.";
  const tags = Array.from(new Set([...master.tacticalTags, ...(crewCard?.tacticalTags ?? []), ...crew.flatMap((model) => model.tacticalTags)]));
  const strategyText = strategy ? ` On ${strategy.name}, expect them to value ${strategy.tags.join(", ")} pieces.` : "";
  return `${master.name} is likely to pressure the table through ${formatTags(tags.slice(0, 6))}.${strategyText}`;
}

function describeOpponentPressure(crew: ModelCard[]): string[] {
  if (crew.length === 0) return ["Add opponent models to sharpen target priority and composition matchup scoring."];
  const stats = summarizeStats(crew);
  return [
    `Average defensive profile: Df ${stats.averageDefense.toFixed(1)}, Wp ${stats.averageWillpower.toFixed(1)}, Sp ${stats.averageSpeed.toFixed(1)}.`,
    `Common pressure tags: ${formatTags(stats.topTags)}.`
  ];
}

function summarizeStats(models: ModelCard[]) {
  const safe = models.length ? models : [];
  const totals = safe.reduce(
    (acc, model) => {
      acc.defense += model.statBlock.defense;
      acc.willpower += model.statBlock.willpower;
      acc.speed += model.statBlock.speed;
      for (const tag of model.tacticalTags) acc.tags.set(tag, (acc.tags.get(tag) ?? 0) + 1);
      return acc;
    },
    { defense: 0, willpower: 0, speed: 0, tags: new Map<TacticalTag, number>() }
  );
  const divisor = Math.max(1, safe.length);
  const topTags = Array.from(totals.tags.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([tag]) => tag);

  return {
    averageDefense: totals.defense / divisor,
    averageWillpower: totals.willpower / divisor,
    averageSpeed: totals.speed / divisor,
    topTags
  };
}

function overlappingCounters(model: ModelCard, target: ModelCard): TacticalTag[] {
  return target.tacticalTags.flatMap((tag) => COUNTER_TAGS[tag] ?? []).filter((counter) => model.tacticalTags.includes(counter));
}

function isRelevantText(text: string, opponentTags: Set<TacticalTag>): boolean {
  const normalized = cleanText(text);
  if (!normalized) return false;
  for (const tag of opponentTags) {
    const counters = COUNTER_TAGS[tag] ?? [];
    if (counters.some((counter) => normalized.toLowerCase().includes(counter.toLowerCase()))) return true;
  }
  return /damage|discard|stunned|slow|staggered|injured|burning|poison|scheme|marker|place|move|heal|irreducible/i.test(normalized);
}

function inferRole(model: Pick<ModelCard, "tacticalTags">): string {
  let best = ROLE_RULES[0][0];
  let bestScore = -1;
  for (const [role, tags] of ROLE_RULES) {
    const score = tags.filter((tag) => model.tacticalTags.includes(tag)).length;
    if (score > bestScore) {
      best = role;
      bestScore = score;
    }
  }
  return best;
}

function efficiencyBonus(model: ModelCard): number {
  if (model.cost <= 5) return 4;
  if (model.cost <= 7) return 2;
  if (model.cost >= 10 && (model.tacticalTags.includes("damage") || model.tacticalTags.includes("control"))) return 2;
  return 0;
}

function toRecommendation(scored: ScoredModel, ownedIds: Set<string>, treatAsOwned = false): ModelRecommendation {
  return {
    model: scored.model,
    owned: treatAsOwned || ownedIds.has(scored.model.id),
    score: Math.round(scored.score),
    role: scored.role,
    scoreBreakdown: {
      masterAbilities: Math.round(scored.scoreBreakdown.masterAbilities),
      crewSynergy: Math.round(scored.scoreBreakdown.crewSynergy),
      compositionMatchup: Math.round(scored.scoreBreakdown.compositionMatchup)
    },
    why: scored.why,
    relevantTech: scored.relevantTech,
    priorityTargets: scored.priorityTargets,
    alliedSynergies: scored.alliedSynergies
  };
}

function formatTags(tags: TacticalTag[]): string {
  const unique = Array.from(new Set(tags));
  if (unique.length === 0) return "general efficiency";
  return unique.map((tag) => tag.replace(/([A-Z])/g, " $1").toLowerCase()).join(", ");
}

function uniqueSentences(lines: string[]): string[] {
  return Array.from(new Set(lines.filter(Boolean)));
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
