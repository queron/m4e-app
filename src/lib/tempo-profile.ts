import type { ModelCard, ModelRecommendation, TacticalTag, TempoJob, TempoProfile, TempoReadiness } from "./types";
import type { Strategy } from "./strategy-pools";
import { cleanText } from "./strategy-tags";

const SCORING_TAGS: TacticalTag[] = ["scheme", "mobility", "placement", "marker"];
const FIGHTING_TAGS: TacticalTag[] = ["damage", "burst", "ranged", "melee"];
const CONTEST_TAGS: TacticalTag[] = ["armor", "incorporeal", "healing", "demise", "control"];
const SUPPORT_TAGS: TacticalTag[] = ["healing", "cardPressure", "summon", "soulstone", "control"];
const SETUP_TAGS: TacticalTag[] = ["summon", "marker", "healing", "cardPressure"];

export function modelTempoTags(model: ModelCard): string[] {
  const text = cleanText(model.textIndex);
  const tags = new Set<string>();

  if (isEarlyScorer(model, text)) tags.add("T2 scorer");
  if (isEarlyFighter(model, text)) tags.add("T2 fighter");
  if (isEarlyContester(model, text)) tags.add("Early contest");
  if (isSetupPiece(model, text)) tags.add("Setup piece");
  if (isLatePayoff(model, text)) tags.add("Late payoff");

  return Array.from(tags).slice(0, 3);
}

export function buildTempoProfile(recommendations: ModelRecommendation[], strategy?: Strategy): TempoProfile {
  const models = recommendations.map((recommendation) => recommendation.model);
  const reads = {
    score: models.filter((model) => isEarlyScorer(model, cleanText(model.textIndex))),
    fight: models.filter((model) => isEarlyFighter(model, cleanText(model.textIndex))),
    contest: models.filter((model) => isEarlyContester(model, cleanText(model.textIndex))),
    support: models.filter((model) => hasAnyTag(model, SUPPORT_TAGS) || /heal|draw|discard|focus|shielded|condition/i.test(cleanText(model.textIndex))),
    setup: models.filter((model) => isSetupPiece(model, cleanText(model.textIndex)))
  };
  const readiness: TempoReadiness[] = [
    readinessFor("score", reads.score, scoringEvidence(reads.score), 2),
    readinessFor("fight", reads.fight, fightingEvidence(reads.fight), 2),
    readinessFor("contest", reads.contest, contestEvidence(reads.contest, strategy), strategy?.tags.includes("center") ? 2 : 1),
    readinessFor("support", reads.support, supportEvidence(reads.support), 2)
  ];
  const scoreBand = readiness.find((entry) => entry.job === "score")?.band ?? "Weak";
  const fightBand = readiness.find((entry) => entry.job === "fight")?.band ?? "Weak";
  const contestBand = readiness.find((entry) => entry.job === "contest")?.band ?? "Weak";
  const setupPressure = reads.setup.length >= 3 || (models.length > 0 && reads.setup.length >= Math.ceil(models.length / 2));
  const overall = overallTempo({ scoreBand, fightBand, contestBand, setupPressure });

  return {
    overall,
    turnOnePlan: turnOnePlan({ overall, scoreBand, fightBand, contestBand, strategy, scoreModels: reads.score, setupCount: reads.setup.length }),
    turnTwoReadiness: readiness,
    risks: tempoRisks({ scoreBand, contestBand, setupPressure, strategy, setupModels: reads.setup, modelCount: models.length })
  };
}

function readinessFor(job: TempoJob, models: ModelCard[], evidence: string[], adequateThreshold: number): TempoReadiness {
  const band: TempoReadiness["band"] = models.length >= adequateThreshold + 1 ? "Strong" : models.length >= adequateThreshold ? "Adequate" : "Weak";
  return {
    job,
    band,
    evidence: evidence.length > 0 ? evidence : ["No clear Turn 2 contributors detected for this job."]
  };
}

function isEarlyScorer(model: ModelCard, text: string): boolean {
  return model.statBlock.speed >= 6 || hasAnyTag(model, SCORING_TAGS) || /flight|\bleap\b|\bplace\b|\bpush\b|interact|scheme marker/i.test(text);
}

function isEarlyFighter(model: ModelCard, text: string): boolean {
  const hasDelivery = model.statBlock.speed >= 5 || hasAnyTag(model, ["mobility", "placement"]) || /flight|\bleap\b|\bpush\b|\bplace\b|charge/i.test(text);
  return hasAnyTag(model, FIGHTING_TAGS) || (model.cost >= 10 && hasDelivery) || /charge|attack.*after.*move|move.*attack/i.test(text);
}

function isEarlyContester(model: ModelCard, text: string): boolean {
  return hasAnyTag(model, CONTEST_TAGS) || /armor|incorporeal|heal|demise|shielded|staggered|slow|stunned/i.test(text);
}

function isSetupPiece(model: ModelCard, text: string): boolean {
  return hasAnyTag(model, SETUP_TAGS) || /summon|corpse|scrap|marker|condition|setup|friendly model/i.test(text);
}

function isLatePayoff(model: ModelCard, text: string): boolean {
  return isSetupPiece(model, text) && model.statBlock.speed > 0 && model.statBlock.speed <= 4 && !isEarlyScorer(model, text);
}

function hasAnyTag(model: ModelCard, tags: TacticalTag[]): boolean {
  return tags.some((tag) => model.tacticalTags.includes(tag));
}

function scoringEvidence(models: ModelCard[]): string[] {
  return models.length > 0
    ? [`${models.length} pick${models.length === 1 ? "" : "s"} can reach scoring lanes early through Sp 6+, scheme, mobility, placement, or marker tools.`]
    : [];
}

function fightingEvidence(models: ModelCard[]): string[] {
  return models.length > 0
    ? [`${models.length} pick${models.length === 1 ? "" : "s"} can apply Turn 2 combat pressure through damage, burst, ranged, melee, or delivery text.`]
    : [];
}

function contestEvidence(models: ModelCard[], strategy?: Strategy): string[] {
  const evidence = models.length > 0
    ? [`${models.length} pick${models.length === 1 ? "" : "s"} can contest with armor, incorporeal, healing, demise, or control tech.`]
    : [];
  if (strategy?.tags.includes("center")) {
    evidence.push(`${strategy.name} is center-weighted, so durability and control are weighted above raw movement.`);
  }
  return evidence;
}

function supportEvidence(models: ModelCard[]): string[] {
  return models.length > 0
    ? [`${models.length} pick${models.length === 1 ? "" : "s"} can support early through healing, card pressure, soulstone, summon, or control tools.`]
    : [];
}

function overallTempo({
  scoreBand,
  fightBand,
  contestBand,
  setupPressure
}: {
  scoreBand: TempoReadiness["band"];
  fightBand: TempoReadiness["band"];
  contestBand: TempoReadiness["band"];
  setupPressure: boolean;
}): TempoProfile["overall"] {
  if (setupPressure && scoreBand !== "Strong") return "Setup-heavy";
  if (scoreBand === "Weak" && fightBand === "Weak") return "Slow";
  if (scoreBand === "Strong" && fightBand !== "Weak" && contestBand !== "Weak" && !setupPressure) return "Fast";
  return "Balanced";
}

function turnOnePlan({
  overall,
  scoreBand,
  fightBand,
  contestBand,
  strategy,
  scoreModels,
  setupCount
}: {
  overall: TempoProfile["overall"];
  scoreBand: TempoReadiness["band"];
  fightBand: TempoReadiness["band"];
  contestBand: TempoReadiness["band"];
  strategy?: Strategy;
  scoreModels: ModelCard[];
  setupCount: number;
}): string[] {
  const plan = [
    scoreBand === "Weak"
      ? "Use deployment and first activation sequencing to keep at least one model relevant to scoring by Turn 2."
      : `Send ${scoreModels.slice(0, 2).map((model) => model.name).join(", ")} toward early scoring lanes.`,
    fightBand === "Weak"
      ? "Avoid planning around immediate kills unless the opponent gives up an exposed target."
      : "Stage early fighting pieces where they can threaten by Turn 2 without abandoning scoring.",
    contestBand === "Weak"
      ? "Do not leave the center plan to fragile pieces without control or healing support."
      : "Assign durable or control pieces to contest lanes while scorers branch out."
  ];

  if (setupCount >= 2) plan.push("Limit Turn 1 setup AP so marker, summon, or support pieces do not delay the whole crew.");
  if (strategy) plan.push(`${strategy.name}: prioritize models that can affect the strategy before the end of Turn 2.`);
  if (overall === "Fast") plan.push("Pressure wide lanes early; the current path has enough immediate access to punish slow openings.");

  return plan.slice(0, 5);
}

function tempoRisks({
  scoreBand,
  contestBand,
  setupPressure,
  strategy,
  setupModels,
  modelCount
}: {
  scoreBand: TempoReadiness["band"];
  contestBand: TempoReadiness["band"];
  setupPressure: boolean;
  strategy?: Strategy;
  setupModels: ModelCard[];
  modelCount: number;
}): string[] {
  const risks = [
    scoreBand === "Weak" ? "Early scoring pressure is weak; a model that waits until Turn 3 may be too late in a four-turn game." : "",
    setupPressure ? `${setupModels.slice(0, 3).map((model) => model.name).join(", ")} read as setup/support pieces; avoid spending the first two turns only preparing.` : "",
    strategy?.tags.includes("center") && contestBand === "Weak" ? `${strategy.name} asks for center presence, but the selected path has limited early durability/control.` : "",
    modelCount === 0 ? "No recommendations are available, so tempo is data-limited." : ""
  ].filter((risk) => risk.length > 0);

  return risks.length > 0 ? risks : ["No major Turn 2 tempo risks detected from the current recommendation path."];
}
