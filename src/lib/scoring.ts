import type { ModelCard, ScoredModel, TacticalTag } from "./types";
import { formatTags } from "./explanation-text";

const ROLE_RULES: Array<[string, TacticalTag[]]> = [
  ["scheme runner", ["scheme", "mobility", "placement"]],
  ["scheme denial", ["marker", "placement", "control"]],
  ["beater", ["damage", "burst", "melee", "ranged"]],
  ["control", ["stunned", "slow", "staggered", "injured", "control"]],
  ["support", ["healing", "cardPressure", "summon"]],
  ["anchor", ["armor", "incorporeal", "demise"]]
];

export function inferRole(model: Pick<ModelCard, "tacticalTags">): string {
  let best = ROLE_RULES[0][0];
  let bestScore = -1;
  for (const [role, tags] of ROLE_RULES) {
    const score = tags.filter((tag) => model.tacticalTags.includes(tag)).length;
    if (score > bestScore) {
      best = role;
      bestScore = score;
    }
  }
  return bestScore <= 0 ? "tech pick" : best;
}

export function efficiencyBonus(model: ModelCard): number {
  if (model.cost <= 5) return 4;
  if (model.cost <= 7) return 2;
  if (model.cost >= 10 && (model.tacticalTags.includes("damage") || model.tacticalTags.includes("control"))) return 2;
  return 0;
}

export function confidenceFromScore(score: number): "High" | "Medium" | "Low" {
  if (score >= 24) return "High";
  if (score >= 14) return "Medium";
  return "Low";
}

export function duplicateGuidance(model: ModelCard, scored: ScoredModel): string | undefined {
  if (model.maxCopies <= 1) return undefined;

  const role = scored.role;
  const strongRepeatRole = ["scheme runner", "beater", "control"].includes(role);
  const pressureTags = scored.model.tacticalTags.filter((tag) =>
    ["damage", "scheme", "mobility", "control", "marker", "ranged"].includes(tag)
  );

  if (scored.score >= 24 && strongRepeatRole) {
    return `A second copy can be justified when you want redundant ${role} pressure; ${formatTags(pressureTags.slice(0, 3))} scales well across multiple activations.`;
  }

  if (scored.score >= 14) {
    return "A second copy is playable, but check whether the crew still has enough distinct scoring, support, and answer pieces before doubling down.";
  }

  return `Extra copies look like diminishing returns in this setup; prefer one copy unless the scenario specifically rewards repeated ${role} pieces.`;
}
