import type { CrewCard, ModelCard, ModelRecommendation, SchemePairRecommendation, TacticalTag } from "./types";
import { getReachableSchemes, hasSchemeGraph } from "./scheme-pools";
import type { Scheme, SchemePool } from "./scheme-pools";
import type { Strategy } from "./strategy-pools";
import { formatTags } from "./explanation-text";

export function buildSchemeWatchlist(schemePool: SchemePool, playerSources: Array<ModelCard | CrewCard>, opponentCrew: ModelCard[]) {
  const playerTags = new Set<TacticalTag>(playerSources.flatMap((source) => source.tacticalTags));
  const opponentTags = new Set<TacticalTag>(opponentCrew.flatMap((model) => model.tacticalTags));

  const scoreScheme = (scheme: Scheme, tags: Set<TacticalTag>) => scheme.tags.filter((tag) => tags.has(tag)).length;
  const goodForPlayer = schemePool.schemes
    .map((scheme) => ({ scheme, score: scoreScheme(scheme, playerTags) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.scheme.name.localeCompare(b.scheme.name))
    .slice(0, 5)
    .map(({ scheme }) => ({
      scheme,
      rationale: `Your crew shows ${formatTags(scheme.tags.filter((tag) => playerTags.has(tag)))}, so ${scheme.name} may be a live scoring lane.`
    }));

  const opponentThreats = schemePool.schemes
    .map((scheme) => ({ scheme, score: scoreScheme(scheme, opponentTags) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.scheme.name.localeCompare(b.scheme.name))
    .slice(0, 5)
    .map(({ scheme }) => ({
      scheme,
      rationale: `Watch for opposing ${formatTags(scheme.tags.filter((tag) => opponentTags.has(tag)))}, which can make ${scheme.name} easier to threaten.`
    }));

  return { goodForPlayer, opponentThreats };
}

export function buildSchemePairRecommendations(
  schemePool: SchemePool,
  playerSources: Array<ModelCard | CrewCard>,
  recommendations: ModelRecommendation[],
  opponentCrew: ModelCard[],
  strategy?: Strategy
): SchemePairRecommendation[] {
  if (schemePool.incomplete || schemePool.schemes.length < 2) return [];

  const playerTags = new Set<TacticalTag>([
    ...playerSources.flatMap((source) => source.tacticalTags),
    ...recommendations.slice(0, 6).flatMap((recommendation) => recommendation.model.tacticalTags)
  ]);
  const opponentTags = new Set<TacticalTag>(opponentCrew.flatMap((model) => model.tacticalTags));
  const strategyTagText = new Set<string>(strategy?.tags ?? []);
  const useGraph = hasSchemeGraph(schemePool);
  const pairs: Array<{
    schemes: [Scheme, Scheme];
    score: number;
    overlap: TacticalTag[];
  }> = [];

  for (let leftIndex = 0; leftIndex < schemePool.schemes.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < schemePool.schemes.length; rightIndex += 1) {
      const left = schemePool.schemes[leftIndex];
      const right = schemePool.schemes[rightIndex];
      if (useGraph && !schemesConnect(schemePool, left, right)) continue;
      const pairTags = Array.from(new Set([...left.tags, ...right.tags]));
      const overlap = pairTags.filter((tag) => playerTags.has(tag));
      const strategyBonus = pairTags.some((tag) => strategyTagText.has(tag)) ? 1 : 0;
      const denialRisk = pairTags.filter((tag) => opponentTags.has(tag)).length;
      const score = overlap.length * 3 + strategyBonus - Math.min(2, denialRisk);
      if (score > 0) pairs.push({ schemes: [left, right], score, overlap });
    }
  }

  return pairs
    .sort((a, b) => b.score - a.score || a.schemes[0].name.localeCompare(b.schemes[0].name))
    .slice(0, 3)
    .map((pair) => {
      const sharedJobs = pair.overlap.length ? pair.overlap : Array.from(new Set([...pair.schemes[0].tags, ...pair.schemes[1].tags])).slice(0, 3);
      return {
        schemes: pair.schemes,
        rationale: `${pair.schemes[0].name} + ${pair.schemes[1].name} both lean on ${formatTags(sharedJobs)}, which your current plan can support.`,
        requiredJobs: sharedJobs.map((tag) => `Maintain ${formatTags([tag])} coverage without committing every scoring piece early.`),
        opponentWatchout: opponentTags.size > 0
          ? `Opponent pressure includes ${formatTags(Array.from(opponentTags).slice(0, 4))}; keep the pair advisory until you see their denial plan.`
          : "Opponent model data is light, so confirm denial pressure before locking in this lane.",
        confidence: pair.score >= 8 ? "High" : pair.score >= 4 ? "Medium" : "Low"
      };
    });
}

function schemesConnect(pool: SchemePool, left: Scheme, right: Scheme): boolean {
  return getReachableSchemes(pool, left.id, 2).some((scheme) => scheme.id === right.id) ||
    getReachableSchemes(pool, right.id, 2).some((scheme) => scheme.id === left.id);
}
