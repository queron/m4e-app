import type {
  CriticalThreat,
  CrewCard,
  GlobalEffectSummary,
  ModelCard,
  ModelRecommendation,
  ReachProfile,
  TacticalTag
} from "./types";
import { actionToText, cleanText } from "./strategy-tags";
import { formatTags, uniqueSentences } from "./explanation-text";

const DAMAGE_TAGS: TacticalTag[] = ["damage", "burst", "melee", "ranged", "antiArmor"];
const CONTROL_TAGS: TacticalTag[] = ["control", "stunned", "slow", "staggered", "injured", "cardPressure"];
const SCORING_TAGS: TacticalTag[] = ["scheme", "marker", "mobility", "placement"];
const DEFENSE_TAGS: TacticalTag[] = ["armor", "incorporeal", "healing", "demise"];

export function buildReachProfile(model: ModelCard): ReachProfile {
  const speed = model.statBlock.speed || 0;
  const attackRanges = model.actions
    .filter((action) => action.type === "attack" || /attack|damage|resist|duel/i.test(actionToText(action)))
    .map((action) => numericRange(action.range))
    .filter((range) => range > 0);
  const meleeRanges = model.actions
    .filter((action) => /melee|y|engage/i.test(`${action.name} ${action.range ?? ""}`))
    .map((action) => numericRange(action.range))
    .filter((range) => range > 0);
  const maxAttackRange = Math.max(0, ...attackRanges);
  const maxMeleeRange = Math.max(0, ...meleeRanges);
  const hasMovementTech = /place|push|move.*up to|leap|teleport|burrow|flight|fly/i.test(model.textIndex);
  const hasControl = hasAnyTag(model, CONTROL_TAGS) || /push|place|move the target|stunned|slow|staggered|obey/i.test(model.textIndex);
  const scoringBump = hasAnyTag(model, ["mobility", "placement"]) ? 4 : hasAnyTag(model, ["scheme", "marker"]) ? 2 : 0;

  return {
    engagement: maxMeleeRange > 0 ? `${maxMeleeRange}" native engagement/reach detected.` : "No extended engagement range detected from parsed actions.",
    attackThreat: maxAttackRange > 0
      ? `${speed + maxAttackRange}" native walk-plus-action threat estimate.`
      : speed > 0
        ? `${speed}" native reposition estimate; no parsed attack range detected.`
        : "No parsed speed/range data available.",
    controlReach: hasControl
      ? `${speed + Math.max(maxAttackRange, maxMeleeRange, 1)}" approximate control projection from movement plus parsed control text.`
      : "No strong control-reach signal detected.",
    scoringReach: speed > 0
      ? `${speed + scoringBump}" scoring reach estimate from speed${scoringBump ? " plus mobility/scenario tags" : ""}.`
      : "No scoring reach estimate available.",
    assumptions: uniqueSentences([
      "Native estimates use printed Speed plus parsed action ranges only.",
      hasMovementTech ? "Movement text detected; assisted reach may be higher with timing and crew support." : "",
      "Board geometry, engagement, severe terrain, and once-per-activation limits are not fully simulated."
    ])
  };
}

export function buildActivationChecklistForSources({
  master,
  crewCard,
  recommendations,
  strategyName
}: {
  master?: ModelCard;
  crewCard?: CrewCard;
  recommendations: ModelRecommendation[];
  strategyName?: string;
}): string[] {
  const sources = [master, crewCard, ...recommendations.slice(0, 6).map((recommendation) => recommendation.model)].filter(Boolean) as Array<ModelCard | CrewCard>;
  const items = sources.flatMap((source) => activationChecklistForSource(source));
  return uniqueSentences([
    strategyName ? `Before committing key activations, confirm which model is scoring or denying ${strategyName}.` : "",
    ...items,
    recommendations.some((recommendation) => recommendation.reachProfile.scoringReach.includes("\""))
      ? "Keep one independent scoring piece uncommitted until the opponent's denial activation is known."
      : ""
  ]).slice(0, 8);
}

export function activationChecklistForSource(source: ModelCard | CrewCard): string[] {
  const text = cleanText("textIndex" in source ? source.textIndex : source.rulesText);
  return uniqueSentences([
    /aura|within [0-9]+/i.test(text) ? `${source.name}: check aura/range positioning before the activation starts.` : "",
    /summon|replace|raise/i.test(text) ? `${source.name}: confirm summon/replace resources and legal placement before spending the activation.` : "",
    /scheme marker|marker/i.test(text) ? `${source.name}: confirm marker placement/removal timing before scoring pieces activate.` : "",
    /draw|discard|cheat|soulstone|card/i.test(text) ? `${source.name}: check hand, discard, and stone resources before declaring the key action.` : "",
    /end phase|start phase|after resolving|once per/i.test(text) ? `${source.name}: remember printed timing and once-per windows.` : ""
  ]).slice(0, 4);
}

export function buildCriticalThreats({
  opponentMaster,
  opponentCrewCard,
  opponentModels,
  inferred
}: {
  opponentMaster?: ModelCard;
  opponentCrewCard?: CrewCard;
  opponentModels: ModelCard[];
  inferred: boolean;
}): CriticalThreat[] {
  const sources = [opponentMaster, opponentCrewCard, ...opponentModels].filter(Boolean) as Array<ModelCard | CrewCard>;
  const threats = sources.map((source) => threatForSource(source, inferred)).filter(Boolean) as CriticalThreat[];
  return threats
    .sort((left, right) => threatRank(right.severity) - threatRank(left.severity) || left.source.localeCompare(right.source))
    .slice(0, 6);
}

export function buildGlobalEffects(master?: ModelCard, crewCard?: CrewCard): GlobalEffectSummary[] {
  if (!master && !crewCard) return [];
  const title = master && master.name.includes(",")
    ? [{
        source: master.name,
        category: "Title" as const,
        summary: `Selected title changes the crew identity toward ${formatTags(master.tacticalTags.slice(0, 4))}.`,
        evidence: topEvidence(master)
      }]
    : [];
  const crewEffects = crewCard
    ? [{
        source: crewCard.name,
        category: "Crew card" as const,
        summary: `Crew card signals ${formatTags(crewCard.tacticalTags.slice(0, 4))}; recommendations using shared keyword models should preserve this package.`,
        evidence: topEvidence(crewCard)
      }]
    : [];
  return [...title, ...crewEffects];
}

export function summonSupportNotes(sources: Array<ModelCard | CrewCard>): string[] {
  const summonSources = sources.filter((source) => /summon|raise|replace/i.test("textIndex" in source ? source.textIndex : source.rulesText));
  if (summonSources.length === 0) return ["No strong summon, raise, or replace engine detected from parsed crew evidence."];
  return summonSources.flatMap((source) => {
    const text = cleanText("textIndex" in source ? source.textIndex : source.rulesText);
    return uniqueSentences([
      `${source.name}: summon/raise/replace text detected; verify pool and placement constraints from the card.`,
      /corpse|scrap|marker|scheme marker/i.test(text) ? "Engine appears to care about marker or corpse/scrap setup; protect the setup pieces." : "",
      /target number|tn|suit|mask|crow|ram|tome/i.test(text) ? "Track TN/suit/resource breakpoints before committing the activation." : ""
    ]);
  }).slice(0, 6);
}

function threatForSource(source: ModelCard | CrewCard, inferred: boolean): CriticalThreat | null {
  const tags = source.tacticalTags;
  const text = cleanText("textIndex" in source ? source.textIndex : source.rulesText);
  const evidence = topEvidence(source).map((line) => inferred ? `${line} (master/crew-card inferred)` : line);
  if (hasAnyTag({ tacticalTags: tags }, DAMAGE_TAGS) || /damage|blast|shockwave|execute|irreducible/i.test(text)) {
    return {
      source: source.name,
      severity: tags.includes("burst") ? "High" : "Medium",
      category: "Damage spike",
      why: `${source.name} can change activation math through ${formatTags(tags.filter((tag) => DAMAGE_TAGS.includes(tag)).slice(0, 3))}.`,
      answer: "Screen, outrange, or force inefficient targets before committing fragile scorers.",
      evidence
    };
  }
  if (hasAnyTag({ tacticalTags: tags }, CONTROL_TAGS) || /stunned|slow|staggered|obey|move the target|bury/i.test(text)) {
    return {
      source: source.name,
      severity: "High",
      category: "Control/displacement",
      why: `${source.name} can disrupt positioning, activation quality, or scoring timing.`,
      answer: "Keep redundant scoring lines and condition/control answers available.",
      evidence
    };
  }
  if (hasAnyTag({ tacticalTags: tags }, SCORING_TAGS)) {
    return {
      source: source.name,
      severity: "Watch",
      category: "Scenario acceleration",
      why: `${source.name} projects scenario pressure through ${formatTags(tags.filter((tag) => SCORING_TAGS.includes(tag)).slice(0, 3))}.`,
      answer: "Contest lanes early or force it to spend activations defensively.",
      evidence
    };
  }
  if (hasAnyTag({ tacticalTags: tags }, DEFENSE_TAGS)) {
    return {
      source: source.name,
      severity: "Watch",
      category: "Durable anchor",
      why: `${source.name} may be hard to remove while contesting space.`,
      answer: "Plan denial or scoring around it instead of assuming quick removal.",
      evidence
    };
  }
  return null;
}

function topEvidence(source: ModelCard | CrewCard): string[] {
  const abilities = "abilities" in source ? source.abilities : [];
  const actions = "actions" in source ? source.actions : [];
  return [
    ...abilities.slice(0, 2).map((ability) => `${ability.name}: ${cleanText(ability.text) || "parsed ability"}`),
    ...actions.slice(0, 2).map((action) => `${action.name}: ${cleanText(action.effect) || "parsed action"}`)
  ].filter(Boolean).slice(0, 3);
}

function numericRange(range: string | undefined): number {
  const value = cleanText(range).match(/[0-9]+/);
  return value ? Number(value[0]) : 0;
}

function hasAnyTag(source: Pick<ModelCard, "tacticalTags">, tags: TacticalTag[]): boolean {
  return tags.some((tag) => source.tacticalTags.includes(tag));
}

function threatRank(severity: CriticalThreat["severity"]): number {
  if (severity === "High") return 3;
  if (severity === "Medium") return 2;
  return 1;
}
