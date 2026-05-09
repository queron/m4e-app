import {
  findCrewCardForMaster,
  getCatalog,
  getHireDetails,
  getPrimaryKeywords,
  legalModelsForMaster
} from "./card-data";
import { buildCrewByScore, validateCrew } from "./crew-validation";
import { getSchemePool, type SchemePool } from "./scheme-pools";
import { getStrategy, type Strategy } from "./strategy-pools";
import type {
  CrewCard,
  MatchupAnalysis,
  ModelEvaluationInput,
  ModelMatchupEvaluation,
  ModelCard,
  ModelRecommendation,
  PlannerInput,
  RecommendationPath,
  ScoredModel,
  SynergyGroup,
  TacticalTag
} from "./types";
import { actionToText, cleanText, containsTag } from "./strategy-tags";
import { buildSchemePairRecommendations, buildSchemeWatchlist } from "./scheme-recommendations";
import { clamp, curatedNotesFor, formatTags, strategyNotesFor, uniqueSentences } from "./explanation-text";
import { buildRoleVersatility, confidenceFromScore, duplicateGuidance, efficiencyBonus, inferRole, secondaryRolesForVersatility } from "./scoring";
import { buildTerrainMobilityProfile, modelTerrainTools } from "./terrain-mobility";
import { buildTempoProfile, modelTempoTags } from "./tempo-profile";
import { buildResourceProfile, modelResourceTags } from "./resource-profile";
import { buildMatchupWarnings } from "./matchup-warnings";
import {
  activationChecklistForSource,
  buildActivationChecklistForSources,
  buildCriticalThreats,
  buildGlobalEffects,
  buildReachProfile
} from "./crew-insights";
import {
  COUNTER_TAGS,
  buildOpponentPressureContext,
  buildVulnerabilityFlagIndex,
  detectVulnerabilityFlags,
  isRelevantText,
  summarizeVulnerabilityThemes,
  type OpponentPressureContext
} from "./vulnerability-flags";

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
  const schemePool = getSchemePool(input.schemePoolId);
  const playerCrewCard = findCrewCardForMaster(playerMaster);
  const opponentCrewCard = findCrewCardForMaster(opponentMaster);

  const legalCandidates = legalModelsForMaster(playerMaster);
  const availableCandidates = hasOwnedPool ? legalCandidates.filter((model) => ownedIds.has(model.id)) : legalCandidates;
  const opponentCandidates = legalModelsForMaster(opponentMaster);

  const opponentCrew = [opponentMaster, ...opponentModels].filter(Boolean) as ModelCard[];
  const opponentPressure = buildOpponentPressureContext(opponentMaster, opponentCrewCard, opponentCrew);
  const scoredAll = legalCandidates.map((model) => scoreModel(model, playerMaster, playerCrewCard, opponentMaster, opponentCrewCard, opponentCrew, opponentPressure, strategy, schemePool));
  const scoredAvailable = availableCandidates.map((model) =>
    scoreModel(model, playerMaster, playerCrewCard, opponentMaster, opponentCrewCard, opponentCrew, opponentPressure, strategy, schemePool)
  );
  const playerPlanSources = [playerMaster, playerCrewCard].filter(Boolean) as Array<ModelCard | CrewCard>;
  const knownOpponentIds = new Set(opponentModels.map((model) => model.id));
  const likelyOpponentModels = buildLikelyCrewMembers(
    opponentMaster,
    opponentCrewCard,
    opponentCandidates.filter((model) => !knownOpponentIds.has(model.id)),
    input.pointLimit,
    strategy
  );
  const availablePath = buildPath("available", playerMaster, scoredAvailable, ownedIds, input.pointLimit, modelLimit, strategy, schemePool, !hasOwnedPool);
  const optimalPath = buildPath("optimal", playerMaster, scoredAll, ownedIds, input.pointLimit, modelLimit, strategy, schemePool);
  const priorityPath = availablePath.models.length > 0 ? availablePath : optimalPath;
  const vulnerabilityFlags = buildVulnerabilityFlagIndex(scoredAll);
  const matchupWarnings = buildMatchupWarnings({
    playerMaster,
    playerCrewCard,
    recommendations: priorityPath.models,
    opponentMaster,
    opponentCrewCard,
    opponentModels: opponentCrew.length > 0 ? opponentCrew : likelyOpponentModels.map((recommendation) => recommendation.model),
    inferredOpponent: opponentCrew.length === 0
  });
  const criticalThreats = buildCriticalThreats({
    opponentMaster,
    opponentCrewCard,
    opponentModels: opponentCrew.length > 0 ? opponentCrew : likelyOpponentModels.map((recommendation) => recommendation.model),
    inferred: opponentCrew.length === 0
  });
  const globalEffects = buildGlobalEffects(playerMaster, playerCrewCard);
  const activationChecklist = buildActivationChecklistForSources({
    master: playerMaster,
    crewCard: playerCrewCard,
    recommendations: priorityPath.models,
    strategyName: strategy?.name
  });

  return {
    generatedAt: new Date().toISOString(),
    match: {
      strategy,
      strategyPoolId: input.strategyPoolId,
      schemePool,
      pointLimit: input.pointLimit
    },
    schemeWatchlist: buildSchemeWatchlist(schemePool, playerPlanSources, opponentCrew),
    recommendedSchemePairs: buildSchemePairRecommendations(schemePool, playerPlanSources, availablePath.models, opponentCrew, strategy),
    matchupBrief: buildMatchupBrief({
      playerMaster,
      playerCrewCard,
      opponentMaster,
      opponentCrewCard,
      opponentCrew,
      likelyOpponentModels,
      strategy,
      schemePool,
      priorityPath: availablePath.models.length > 0 ? availablePath : optimalPath
    }),
    matchupWarnings,
    criticalThreats,
    activationChecklist,
    globalEffects,
    vulnerabilityFlags,
    playerCrew: {
      master: playerMaster,
      crewCard: playerCrewCard,
      faction: input.playerFaction,
      primaryKeywords: getPrimaryKeywords(playerMaster),
      strengths: describeStrengths(playerMaster, playerCrewCard, strategy),
      vulnerabilities: describeVulnerabilities(playerMaster, playerCrewCard, opponentCrew, strategy),
      playstyle: describePlaystyle(playerMaster, playerCrewCard, strategy),
      terrainMobilityProfile: buildTerrainMobilityProfile(priorityPath.models, strategy, schemePool),
      resourceProfile: buildResourceProfile(playerMaster, playerCrewCard, priorityPath.models)
    },
    opponentCrew: {
      master: opponentMaster,
      crewCard: opponentCrewCard,
      faction: input.opponentFaction,
      primaryKeywords: getPrimaryKeywords(opponentMaster),
      plan: describeOpponentPlan(opponentMaster, opponentCrewCard, opponentCrew, strategy),
      pressurePoints: describeOpponentPressure(opponentCrew),
      expectedModels: opponentModels,
      likelyModels: likelyOpponentModels
    },
    paths: {
      available: availablePath,
      optimal: optimalPath
    }
  };
}

export function evaluateModelMatchup(input: ModelEvaluationInput): ModelMatchupEvaluation {
  const catalog = getCatalog();
  const model = catalog.models.find((candidate) => candidate.id === input.modelId);
  const playerMaster = catalog.models.find((candidate) => candidate.id === input.playerMasterId);
  const opponentMaster = catalog.models.find((candidate) => candidate.id === input.opponentMasterId);

  if (!model) {
    return {
      modelId: input.modelId,
      legal: false,
      hireReason: "Model was not found in the card catalog.",
      hireCost: 0,
      printedCost: 0,
      hireTax: 0,
      whyHelps: [],
      struggleNotes: ["Open a parsed stat card before evaluating matchup fit."],
      strategyContribution: [],
      vulnerabilityFlags: []
    };
  }

  const playerCrewCard = findCrewCardForMaster(playerMaster);
  const opponentCrewCard = findCrewCardForMaster(opponentMaster);
  const opponentModels = (input.opponentModelIds ?? [])
    .map((id) => catalog.models.find((candidate) => candidate.id === id))
    .filter(Boolean) as ModelCard[];
  const opponentCrew = [opponentMaster, ...opponentModels].filter(Boolean) as ModelCard[];
  const opponentPressure = buildOpponentPressureContext(opponentMaster, opponentCrewCard, opponentCrew);
  const hireDetails = getHireDetails(playerMaster, model);

  if (!playerMaster || !opponentMaster) {
    return {
      modelId: model.id,
      legal: false,
      hireReason: "Select both masters before evaluating matchup fit.",
      hireCost: hireDetails.hireCost,
      printedCost: hireDetails.printedCost,
      hireTax: hireDetails.tax,
      whyHelps: [],
      struggleNotes: ["The app needs both leaders to judge legality, opposing pressure, and matchup role."],
      strategyContribution: [],
      vulnerabilityFlags: []
    };
  }

  if (!hireDetails.legal || model.isMaster || model.cost <= 0) {
    return {
      modelId: model.id,
      legal: false,
      hireReason: model.isMaster ? "Masters cannot be hired as normal matchup tech picks." : hireDetails.reason,
      hireCost: hireDetails.hireCost,
      printedCost: hireDetails.printedCost,
      hireTax: hireDetails.tax,
      whyHelps: [],
      struggleNotes: [model.isMaster ? "Choose this title as your leader instead of adding it as a model pick." : hireDetails.reason],
      strategyContribution: [],
      vulnerabilityFlags: detectVulnerabilityFlags(model, opponentPressure)
    };
  }

  const strategy = getStrategy(input.strategyPoolId, input.strategyId);
  const scored = scoreModel(model, playerMaster, playerCrewCard, opponentMaster, opponentCrewCard, opponentCrew, opponentPressure, strategy);
  const strategyFit = scoreStrategyFit(model, strategy);
  const score = Math.round(scored.score);
  const risks = scored.vulnerabilityFlags.map((flag) => `${flag.label}: ${flag.summary}`);

  return {
    modelId: model.id,
    legal: true,
    hireReason: hireDetails.reason,
    hireCost: hireDetails.hireCost,
    printedCost: hireDetails.printedCost,
    hireTax: hireDetails.tax,
    fit: {
      band: confidenceFromScore(score),
      score,
      role: scored.role
    },
    whyHelps: uniqueSentences(scored.why).slice(0, 4),
    struggleNotes: uniqueSentences([
      ...risks,
      hireDetails.tax > 0 ? `${model.name} pays +${hireDetails.tax}ss as an out-of-keyword hire, so it must justify the premium.` : "",
      scored.scoreBreakdown.crewSynergy <= 4 ? `${model.name} has limited direct keyword or crew-card synergy with ${playerMaster.name}.` : ""
    ]).slice(0, 4),
    strategyContribution: uniqueSentences([
      ...strategyFit.reasons,
      `${model.name} is best treated as a ${scored.role} in this matchup.`
    ]).slice(0, 4),
    duplicateValue: duplicateGuidance(model, scored),
    vulnerabilityFlags: scored.vulnerabilityFlags
  };
}

function buildMatchupBrief({
  playerMaster,
  playerCrewCard,
  opponentMaster,
  opponentCrewCard,
  opponentCrew,
  likelyOpponentModels,
  strategy,
  schemePool,
  priorityPath
}: {
  playerMaster?: ModelCard;
  playerCrewCard?: CrewCard;
  opponentMaster?: ModelCard;
  opponentCrewCard?: CrewCard;
  opponentCrew: ModelCard[];
  likelyOpponentModels: ModelRecommendation[];
  strategy?: Strategy;
  schemePool: SchemePool;
  priorityPath: RecommendationPath;
}) {
  const knownThreats = opponentCrew.length > 1 ? opponentCrew : [opponentMaster, ...likelyOpponentModels.slice(0, 3).map((item) => item.model)].filter(Boolean) as ModelCard[];
  const opponentTags = Array.from(new Set([
    ...(opponentMaster?.tacticalTags ?? []),
    ...(opponentCrewCard?.tacticalTags ?? []),
    ...knownThreats.flatMap((model) => model.tacticalTags)
  ])).slice(0, 5);
  const playerTags = Array.from(new Set([...(playerMaster?.tacticalTags ?? []), ...(playerCrewCard?.tacticalTags ?? [])])).slice(0, 5);
  const topHires = uniqueRecommendationsByModel(priorityPath.models).slice(0, 3);
  const schemeNames = schemePool.incomplete ? [] : schemePool.schemes.slice(0, 3).map((scheme) => scheme.name);

  return {
    watchFor: uniqueSentences([
      opponentMaster
        ? `${opponentMaster.name} pressures ${formatTags(opponentTags)}; do not let that plan set the terms of the table.`
        : "Select the opposing master to sharpen threat priorities.",
      knownThreats.length > 0
        ? `Expected pressure pieces: ${knownThreats.slice(0, 3).map((model) => model.name).join(", ")}.`
        : "",
      strategy ? `${strategy.name} rewards ${strategy.tags.slice(0, 4).join(", ")}; track who can score without overcommitting.` : ""
    ]).slice(0, 4),
    answerWith: uniqueSentences([
      playerMaster
        ? `${playerMaster.name} should lean into ${formatTags(playerTags)} while hiring to patch gaps into ${formatTags(opponentTags)}.`
        : "Select your master to generate a counter-plan.",
      schemeNames.length > 0 ? `Scheme pool pressure includes ${schemeNames.join(", ")}; keep at least one independent scorer available.` : "",
      topHires[0] ? `Start the draft around ${topHires[0].model.name} if you need the clearest answer to the matchup.` : ""
    ]).slice(0, 4),
    priorityHires: topHires.map((recommendation) =>
      `${recommendation.model.name}: ${recommendation.role}, because ${recommendation.why[0] ?? recommendation.hireReason}`
    ),
    matchupRisks: summarizeVulnerabilityThemes(topHires)
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
    .map((item) => toRecommendation(item as ScoredModel, master, new Set(), true));
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
        : `${model.name} is a likely tech pick from the legal pool.`,
      ...synergy.reasons,
      ...strategyFit.reasons,
      ...curatedNotesFor(model, master).slice(0, 1),
      `It brings ${formatTags(model.tacticalTags.slice(0, 4))}, giving the crew a clear ${inferRole(model)} table job.`
    ]).slice(0, 4),
    relevantTech: likelyRelevantTech(model).slice(0, 5),
    priorityTargets: ["Likely included for table-job coverage rather than a confirmed target priority."],
    alliedSynergies: alliedSynergies(model, master, crewCard).slice(0, 4),
    vulnerabilityFlags: []
  };
}

function buildPath(
  kind: "available" | "optimal",
  master: ModelCard | undefined,
  scored: Array<ScoredModel>,
  ownedIds: Set<string>,
  pointLimit: number,
  modelLimit: number,
  strategy?: Strategy,
  schemePool?: SchemePool,
  treatAllAsAvailable = false
): RecommendationPath {
  const selected = buildCrewByScore(master, scored, pointLimit, modelLimit);
  const recommendations = selected
    .map((model) => scored.find((item) => item.model.id === model.id))
    .filter(Boolean)
    .map((item) => toRecommendation(item as ScoredModel, master, ownedIds, treatAllAsAvailable, schemePool));
  const uniqueRecommendations = uniqueRecommendationsByModel(recommendations);
  const totalCost = uniqueRecommendations.reduce((sum, recommendation) => sum + recommendation.hireCost, 0);

  return {
    kind,
    totalCost,
    remainingPoints: pointLimit - totalCost,
    validation: validateCrew(
      master,
      uniqueRecommendations.map((recommendation) => recommendation.model),
      pointLimit,
      modelLimit
    ),
    models: uniqueRecommendations,
    synergyGroups: buildSynergyGroups(master, uniqueRecommendations, strategy),
    tempoProfile: buildTempoProfile(uniqueRecommendations, strategy)
  };
}

function uniqueRecommendationsByModel(recommendations: ModelRecommendation[]): ModelRecommendation[] {
  const seen = new Set<string>();
  const unique: ModelRecommendation[] = [];

  for (const recommendation of recommendations) {
    const key = recommendation.model.id;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(recommendation);
  }

  return unique;
}

function buildSynergyGroups(master: ModelCard | undefined, recommendations: ModelRecommendation[], strategy?: Strategy): SynergyGroup[] {
  const groups: SynergyGroup[] = [];
  const pool = recommendations.slice(0, 8);
  const strategyName = strategy?.name ?? "the selected strategy";
  const strategyTags = new Set(strategy?.tags ?? []);

  const addGroup = (name: string, job: string, rationale: string, candidates: ModelRecommendation[]) => {
    const models = uniqueModels([master, ...candidates.map((candidate) => candidate.model)]).slice(0, 3);
    if (models.length < 2) return;
    if (groups.some((group) => group.name === name)) return;
    groups.push({ name, job, rationale, models });
  };

  const flankPieces = pool.filter((recommendation) =>
    hasAnyTag(recommendation.model, ["scheme", "mobility", "placement", "marker"])
  );
  if (flankPieces.length >= 1 && intersects(strategyTags, ["spread", "enemyHalf", "mobility", "interact", "markers", "scheme"])) {
    addGroup(
      "Flank scoring package",
      "Score wide and force the opponent to split resources.",
      `Use this package to carry or place scoring pressure for ${strategyName}.`,
      flankPieces.slice(0, 2)
    );
  }

  const centerPieces = pool.filter((recommendation) =>
    hasAnyTag(recommendation.model, ["armor", "incorporeal", "demise", "healing", "control", "damage"])
  );
  if (centerPieces.length >= 1) {
    addGroup(
      "Center anchor package",
      "Contest the middle while protecting the crew's key activation.",
      strategyTags.has("center")
        ? `This group is built to stand on the center line for ${strategyName}.`
        : "This group gives the crew a stable pivot while other pieces score.",
      centerPieces.slice(0, 2)
    );
  }

  const denialPieces = pool.filter((recommendation) =>
    hasAnyTag(recommendation.model, ["control", "marker", "stunned", "slow", "staggered", "ranged"])
  );
  if (denialPieces.length >= 1) {
    addGroup(
      "Denial pair",
      "Disrupt enemy scoring lanes and punish overextended pieces.",
      `Use this pair to slow, block, or remove the opponent's ${strategyName} plan.`,
      denialPieces.slice(0, 2)
    );
  }

  if (groups.length === 0 && pool.length >= 1) {
    addGroup(
      "Independent tech pieces",
      "Use separately to cover gaps the keyword does not naturally solve.",
      "No tight package was identified, so these picks should operate as flexible problem-solvers.",
      pool.slice(0, 2)
    );
  }

  return groups.slice(0, 3);
}

function scoreModel(
  model: ModelCard,
  playerMaster: ModelCard | undefined,
  playerCrewCard: CrewCard | undefined,
  opponentMaster: ModelCard | undefined,
  opponentCrewCard: CrewCard | undefined,
  opponentCrew: ModelCard[],
  opponentPressure: OpponentPressureContext,
  strategy?: Strategy,
  schemePool?: SchemePool
): ScoredModel {
  const masterAbilities = scoreAgainstMaster(model, opponentMaster, opponentCrewCard);
  const crewSynergy = scoreCrewSynergy(model, playerMaster, playerCrewCard);
  const compositionMatchup = scoreComposition(model, opponentCrew);
  const strategyFit = scoreStrategyFit(model, strategy);
  const schemeFit = scoreSchemePoolFit(model, schemePool);
  const score = masterAbilities.score + crewSynergy.score + compositionMatchup.score + strategyFit.score + schemeFit.score + efficiencyBonus(model);

  return {
    model,
    score,
    role: inferRole(model),
    scoreBreakdown: {
      masterAbilities: masterAbilities.score,
      crewSynergy: crewSynergy.score,
      compositionMatchup: compositionMatchup.score + strategyFit.score + schemeFit.score
    },
    why: uniqueSentences([...masterAbilities.reasons, ...crewSynergy.reasons, ...compositionMatchup.reasons, ...strategyFit.reasons, ...schemeFit.reasons]).slice(0, 4),
    relevantTech: relevantTech(model, opponentCrew).slice(0, 6),
    priorityTargets: uniqueSentences(priorityTargets(model, opponentMaster, opponentCrew)).slice(0, 4),
    alliedSynergies: alliedSynergies(model, playerMaster, playerCrewCard).slice(0, 4),
    vulnerabilityFlags: detectVulnerabilityFlags(model, opponentPressure)
  };
}

function scoreAgainstMaster(model: ModelCard, opponentMaster?: ModelCard, opponentCrewCard?: CrewCard) {
  if (!opponentMaster) return { score: 0, reasons: ["No opposing master selected, so this score only uses broad matchup heuristics."] };

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
    reasons.push(`${model.name} fits ${strategy.name} because it can help carry, contest, or deny the ${strategy.tags.join(", ")} scoring plan.`);
  }
  reasons.push(...strategyNotesFor(strategy).slice(0, 1));

  return { score: clamp(score, 0, 18), reasons };
}

function scoreSchemePoolFit(model: ModelCard, schemePool?: SchemePool) {
  if (!schemePool || schemePool.incomplete || schemePool.schemes.length === 0) return { score: 0, reasons: [] };
  const modelTags = new Set(model.tacticalTags);
  const schemeTagHits = schemePool.schemes.flatMap((scheme) =>
    scheme.tags.filter((tag) => modelTags.has(tag)).map((tag) => ({ schemeName: scheme.name, tag }))
  );
  const uniqueTags = new Set(schemeTagHits.map((hit) => hit.tag));
  const score = Math.min(12, uniqueTags.size * 3 + Math.min(3, schemeTagHits.length));
  const topSchemes = Array.from(new Set(schemeTagHits.slice(0, 4).map((hit) => hit.schemeName)));

  return {
    score,
    reasons: score > 0
      ? [`${model.name} overlaps the scheme pool through ${formatTags(Array.from(uniqueTags).slice(0, 3))}; relevant schemes include ${topSchemes.join(", ")}.`]
      : []
  };
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
    lines.push(`${playerMaster.name}: lets the master spend activations fighting while this model handles scheme running and denial work.`);
  }

  return lines.length ? lines : ["Best used as an independent tech pick that fills a gap the core keyword does not naturally cover."];
}

function describeStrengths(master?: ModelCard, crewCard?: CrewCard, strategy?: Strategy): string[] {
  if (!master) return ["Select a master to generate crew-level strengths."];
  const tags = Array.from(new Set([...master.tacticalTags, ...(crewCard?.tacticalTags ?? [])]));
  return [
    `${master.name} naturally plays toward ${formatTags(tags.slice(0, 5))}.`,
    crewCard ? `${crewCard.name} extends that plan through crew-wide ${formatTags(crewCard.tacticalTags.slice(0, 4))} tools.` : "No matching crew card was found in the data, so recommendations lean harder on stat cards.",
    strategy ? `${strategy.name}: ${strategy.summary}` : "",
    ...curatedNotesFor(master).slice(0, 2),
    ...strategyNotesFor(strategy).slice(0, 2)
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
  return `${master.name} starts best as a ${role}: hire pieces that amplify ${formatTags(tags.slice(0, 3))} or patch the matchup gaps below.${strategyText}`;
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

function hasAnyTag(model: ModelCard, tags: TacticalTag[]): boolean {
  return tags.some((tag) => model.tacticalTags.includes(tag));
}

function intersects(tags: Set<string>, candidates: string[]): boolean {
  return candidates.some((candidate) => tags.has(candidate));
}

function uniqueModels(models: Array<ModelCard | undefined>): ModelCard[] {
  const seen = new Set<string>();
  return models.filter((model): model is ModelCard => {
    if (!model || seen.has(model.id)) return false;
    seen.add(model.id);
    return true;
  });
}

function toRecommendation(
  scored: ScoredModel,
  master: ModelCard | undefined,
  ownedIds: Set<string>,
  treatAsOwned = false,
  schemePool?: SchemePool
): ModelRecommendation {
  const hireDetails = getHireDetails(master, scored.model);
  const roundedScore = Math.round(scored.score);
  const versatility = buildRoleVersatility(scored.model, schemePool);
  const secondaryRoles = secondaryRolesForVersatility(scored.role, versatility);
  const reachProfile = buildReachProfile(scored.model);

  return {
    model: scored.model,
    owned: treatAsOwned || ownedIds.has(scored.model.id),
    hireCost: hireDetails.hireCost,
    printedCost: hireDetails.printedCost,
    hireTax: hireDetails.tax,
    hireKind: hireDetails.kind,
    hireReason: hireDetails.reason,
    confidence: confidenceFromScore(roundedScore),
    trace: [
      `Master Counter: ${Math.round(scored.scoreBreakdown.masterAbilities)} from opposing leader and crew-card pressure.`,
      `Crew Synergy: ${Math.round(scored.scoreBreakdown.crewSynergy)} from keyword, faction, and shared tactical tags.`,
      `Strategy/Matchup Fit: ${Math.round(scored.scoreBreakdown.compositionMatchup)} from strategy tags, opponent composition, and table-job coverage.`,
      `Hire rule: ${hireDetails.reason}`
    ],
    curatedNotes: curatedNotesFor(scored.model, master).slice(0, 3),
    score: roundedScore,
    role: scored.role,
    secondaryRoles: secondaryRoles.length > 0 ? secondaryRoles : undefined,
    versatility,
    scoreBreakdown: {
      masterAbilities: Math.round(scored.scoreBreakdown.masterAbilities),
      crewSynergy: Math.round(scored.scoreBreakdown.crewSynergy),
      compositionMatchup: Math.round(scored.scoreBreakdown.compositionMatchup)
    },
    why: scored.why,
    relevantTech: scored.relevantTech,
    priorityTargets: scored.priorityTargets,
    alliedSynergies: scored.alliedSynergies,
    terrainTools: modelTerrainTools(scored.model),
    tempoTags: modelTempoTags(scored.model),
    resourceTags: modelResourceTags(scored.model),
    reachProfile,
    activationChecklist: activationChecklistForSource(scored.model),
    vulnerabilityFlags: scored.vulnerabilityFlags
  };
}
