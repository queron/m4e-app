import type { MatchupAnalysis, ModelCard, RecommendationPath } from "@/lib/types";

export type SavedDraft = {
  id: string;
  name: string;
  createdAt: string;
  updatedAt?: string;
  totalCost: number;
  modelIds: string[];
  summary: string;
  playerFaction?: string;
  playerMasterId?: string;
  opponentFaction?: string;
  opponentMasterId?: string;
  pointLimit?: number;
  strategyPoolId?: string;
  strategyId?: string;
  path?: RecommendationPath;
};

export type SharedSetup = Partial<{
  playerFaction: string;
  playerMasterId: string;
  opponentFaction: string;
  opponentMasterId: string;
  ownedModelIds: string[];
  opponentModelIds: string[];
  pointLimit: number;
  strategyPoolId: string;
  strategyId: string;
  schemePoolId: string;
}>;

export type DraftSummaryContext = {
  strategyPoolName: string;
  strategyName: string;
  playerMasterName?: string;
  opponentMasterName?: string;
  schemePairings?: NonNullable<MatchupAnalysis["recommendedSchemePairs"]>;
};

export const COLLECTION_STORAGE_KEY = "m4e.collection.v1";
export const DRAFT_STORAGE_KEY = "m4e.drafts.v1";
export const SHARE_PARAM = "setup";

export function readStoredIds(key: string): string[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(localStorage.getItem(key) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((item) => typeof item === "string") : [];
  } catch {
    return [];
  }
}

export function readStoredDrafts(): SavedDraft[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(localStorage.getItem(DRAFT_STORAGE_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter(isSavedDraft) : [];
  } catch {
    return [];
  }
}

export function readSharedSetup(): SharedSetup | null {
  if (typeof window === "undefined") return null;
  const encoded = new URL(window.location.href).searchParams.get(SHARE_PARAM);
  if (!encoded) return null;
  try {
    return JSON.parse(decodeURIComponent(atob(encoded)));
  } catch {
    return null;
  }
}

export function encodeSharePayload(value: unknown): string {
  return btoa(encodeURIComponent(JSON.stringify(value)));
}

function isSavedDraft(value: unknown): value is SavedDraft {
  if (!value || typeof value !== "object") return false;
  const draft = value as SavedDraft;
  return typeof draft.id === "string" && typeof draft.name === "string" && Array.isArray(draft.modelIds);
}

export function buildDraftSummary(
  requiredModels: Array<{ model: ModelCard; quantity: number }>,
  path: RecommendationPath,
  pointLimit: number,
  context: DraftSummaryContext
): string {
  const requiredCost = requiredModels.reduce((sum, entry) => sum + entry.model.cost * entry.quantity, 0);
  const totalCost = requiredCost + path.totalCost;
  return [
    `Draft crew - ${totalCost}/${pointLimit}ss`,
    `Strategy: ${context.strategyName} (${context.strategyPoolName})`,
    context.playerMasterName ? `Player: ${context.playerMasterName}` : undefined,
    context.opponentMasterName ? `Opponent: ${context.opponentMasterName}` : undefined,
    "",
    "Required:",
    ...requiredModels.map((entry) => `${entry.quantity}x ${entry.model.name} (${entry.model.cost}ss)`),
    "",
    "Draft hires:",
    ...path.models.map(formatExportHireLine),
    "",
    "Synergy groups:",
    ...(path.synergyGroups.length > 0
      ? path.synergyGroups.map((group) => `- ${group.name}: ${group.models.map((model) => model.name).join(" + ")} - ${group.job}`)
      : ["- No clear package identified; use these picks independently."]),
    "",
    "Scheme pairing ideas:",
    ...(context.schemePairings && context.schemePairings.length > 0
      ? context.schemePairings.map((pairing) => `- ${pairing.schemes[0].name} + ${pairing.schemes[1].name}: ${pairing.confidence} confidence - ${pairing.rationale}`)
      : ["- No confident advisory pair identified for this setup."]),
    "",
    "Planning notes:",
    ...path.models.slice(0, 5).map((recommendation) => `- ${recommendation.model.name}: ${recommendation.why[0] ?? recommendation.hireReason}`)
  ].join("\n");
}

function formatExportHireLine(recommendation: RecommendationPath["models"][number]): string {
  const tax = recommendation.hireTax > 0 ? `, +${recommendation.hireTax}ss tax` : "";
  return `- ${recommendation.model.name}: ${recommendation.hireCost}ss (${recommendation.hireReason}${tax})`;
}
