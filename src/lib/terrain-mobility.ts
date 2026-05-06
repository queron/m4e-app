import type { ModelCard, ModelRecommendation, TerrainMobilityProfile } from "./types";
import type { SchemePool } from "./scheme-pools";
import type { Strategy } from "./strategy-pools";
import { cleanText } from "./strategy-tags";

export function modelTerrainTools(model: ModelCard): string[] {
  const text = cleanText(model.textIndex);
  const tools = [
    [/flight/i, "Flight"],
    [/\bleap\b/i, "Leap"],
    [/unimpeded|ignore(?:s)? severe|ignore(?:s)? terrain/i, "Unimpeded"],
    [/\bplace\b|teleport|bury|unbury/i, "Place"],
    [/\bpush\b|move this model|move up to/i, "Push"],
    [/cover|concealment/i, "Cover use"],
    [/terrain|hazardous|severe|pyre|bog/i, "Marker terrain"]
  ]
    .filter(([pattern]) => (pattern as RegExp).test(text))
    .map(([, label]) => label as string);

  if (model.statBlock.speed >= 6 && !tools.includes("Fast")) tools.push("Fast");
  return Array.from(new Set(tools)).slice(0, 5);
}

export function buildTerrainMobilityProfile(
  recommendations: ModelRecommendation[],
  strategy?: Strategy,
  schemePool?: SchemePool
): TerrainMobilityProfile {
  const models = recommendations.map((recommendation) => recommendation.model);
  const terrainTools = Array.from(new Set(recommendations.flatMap((recommendation) => recommendation.terrainTools))).slice(0, 8);
  const mobileCount = models.filter((model) =>
    model.statBlock.speed >= 6 || model.tacticalTags.includes("mobility") || model.tacticalTags.includes("placement")
  ).length;
  const lowSpeedPieces = models.filter((model) =>
    model.statBlock.speed > 0 &&
    model.statBlock.speed <= 4 &&
    !model.tacticalTags.includes("mobility") &&
    !model.tacticalTags.includes("placement")
  );
  const mobilityBand: TerrainMobilityProfile["mobilityBand"] =
    mobileCount >= 3 ? "High" : mobileCount >= 1 ? "Medium" : "Low";
  const boardFit = boardFitFromTools(terrainTools, mobilityBand);
  const scenarioMobilityPressure = Boolean(
    strategy?.tags.some((tag) => ["mobility", "enemyHalf", "spread", "interact", "markers"].includes(tag)) ||
    schemePool?.schemes.some((scheme) => scheme.tags.some((tag) => ["mobility", "placement", "scheme", "marker"].includes(tag)))
  );
  const terrainRisks = [
    lowSpeedPieces.length > 0
      ? `${lowSpeedPieces.slice(0, 3).map((model) => model.name).join(", ")} can lag behind if deployed wide or forced through dense lanes.`
      : "",
    mobilityBand === "Low" ? "Few mobility or placement tools were detected; avoid overcommitting to far-corner scoring without support." : "",
    terrainTools.length === 0 ? "Parsed card text shows limited explicit terrain tech; confirm table access during deployment." : ""
  ].filter(Boolean);

  return {
    boardFit,
    mobilityBand,
    terrainTools,
    terrainRisks,
    recommendedTablePlan: tablePlan({ boardFit, mobilityBand, scenarioMobilityPressure, terrainTools })
  };
}

function boardFitFromTools(tools: string[], mobilityBand: TerrainMobilityProfile["mobilityBand"]): TerrainMobilityProfile["boardFit"] {
  if (tools.length === 0) return "Data-limited";
  if (tools.some((tool) => ["Flight", "Leap"].includes(tool))) return mobilityBand === "High" ? "Flexible" : "Vertical";
  if (tools.some((tool) => ["Unimpeded", "Cover use", "Marker terrain"].includes(tool))) return "Dense";
  if (mobilityBand === "High") return "Flexible";
  return "Open";
}

function tablePlan({
  boardFit,
  mobilityBand,
  scenarioMobilityPressure,
  terrainTools
}: {
  boardFit: TerrainMobilityProfile["boardFit"];
  mobilityBand: TerrainMobilityProfile["mobilityBand"];
  scenarioMobilityPressure: boolean;
  terrainTools: string[];
}): string {
  if (boardFit === "Data-limited") {
    return "Use deployment and first-turn positioning to verify lanes before committing key models to distant scoring jobs.";
  }
  if (scenarioMobilityPressure) {
    return `Use ${mobilityBand.toLowerCase()} mobility and ${terrainTools.slice(0, 3).join(", ")} tools to claim scoring lanes without stranding support pieces.`;
  }
  if (boardFit === "Dense") {
    return "Lean on terrain tools to contest protected lanes while keeping slower support pieces near the crew's main scoring route.";
  }
  if (boardFit === "Vertical") {
    return "Assign vertical-access pieces to rooftop or elevation jobs and keep anchors on predictable center lanes.";
  }
  return "Use mobile pieces to pressure wide lanes while durable or control pieces hold the middle.";
}
