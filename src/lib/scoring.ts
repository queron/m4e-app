import type { ModelCard, RoleVersatility, ScoredModel, TacticalTag, VersatilityJob } from "./types";
import type { SchemePool } from "./scheme-pools";
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

const VERSATILITY_JOB_TAGS: Record<VersatilityJob, TacticalTag[]> = {
  score: ["scheme", "mobility", "placement", "marker"],
  kill: ["damage", "burst", "melee", "ranged", "antiArmor"],
  control: ["control", "stunned", "slow", "staggered", "injured"],
  support: ["healing", "cardPressure", "summon", "soulstone"],
  contest: ["armor", "incorporeal", "demise", "healing", "control"],
  marker: ["marker", "scheme", "placement"],
  mobility: ["mobility", "placement"]
};

const JOB_ROLE_LABELS: Record<VersatilityJob, string> = {
  score: "scheme runner",
  kill: "beater",
  control: "control",
  support: "support",
  contest: "anchor",
  marker: "scheme denial",
  mobility: "scheme runner"
};

export function buildRoleVersatility(model: ModelCard, schemePool?: SchemePool): RoleVersatility {
  const jobs = (Object.keys(VERSATILITY_JOB_TAGS) as VersatilityJob[]).filter((job) => {
    const tags = VERSATILITY_JOB_TAGS[job];
    return tags.some((tag) => model.tacticalTags.includes(tag)) || (job === "mobility" && model.statBlock.speed >= 6);
  });
  const evidence = jobs.map((job) => {
    const matchingTags = VERSATILITY_JOB_TAGS[job].filter((tag) => model.tacticalTags.includes(tag));
    if (job === "mobility" && model.statBlock.speed >= 6 && matchingTags.length === 0) {
      return "Mobility: Sp 6+ profile supports early lane access.";
    }
    return `${jobLabel(job)}: ${formatTags(matchingTags.slice(0, 3))}.`;
  });
  const schemeRelevance = schemePool?.incomplete
    ? []
    : (schemePool?.schemes ?? [])
        .filter((scheme) => scheme.tags.some((tag) => model.tacticalTags.includes(tag)))
        .slice(0, 5)
        .map((scheme) => scheme.name);

  return {
    band: jobs.length >= 3 ? "High" : jobs.length >= 2 ? "Medium" : "Low",
    jobs,
    evidence,
    schemeRelevance
  };
}

export function secondaryRolesForVersatility(primaryRole: string, versatility: RoleVersatility): string[] {
  const labels = versatility.jobs.map((job) => JOB_ROLE_LABELS[job]).filter((label) => label !== primaryRole);
  return Array.from(new Set(labels)).slice(0, 4);
}

function jobLabel(job: VersatilityJob): string {
  return job.charAt(0).toUpperCase() + job.slice(1);
}
