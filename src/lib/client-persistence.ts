import type { CardCatalog, MatchupAnalysis, ModelCard, RecommendationPath } from "@/lib/types";

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
const MAX_CLIENT_ID_ARRAY_LENGTH = 500;
const MIN_POINT_LIMIT = 1;
const MAX_POINT_LIMIT = 150;

export function readStoredIds(key: string, catalog?: CardCatalog): string[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(localStorage.getItem(key) ?? "[]");
    return readModelIdArray(parsed, catalog).ids;
  } catch {
    return [];
  }
}

export function readStoredDrafts(catalog?: CardCatalog): SavedDraft[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(localStorage.getItem(DRAFT_STORAGE_KEY) ?? "[]");
    return Array.isArray(parsed)
      ? parsed.flatMap((item) => {
          const draft = parseSavedDraft(item, catalog);
          return draft ? [draft] : [];
        })
      : [];
  } catch {
    return [];
  }
}

export function readSharedSetup(catalog: CardCatalog): { setup: SharedSetup | null; warnings: string[] } {
  if (typeof window === "undefined") return { setup: null, warnings: [] };
  const encoded = new URL(window.location.href).searchParams.get(SHARE_PARAM);
  if (!encoded) return { setup: null, warnings: [] };

  try {
    return validateSharedSetup(JSON.parse(decodeURIComponent(atob(encoded))), catalog);
  } catch {
    return {
      setup: null,
      warnings: ["Shared setup link could not be read and was ignored."]
    };
  }
}

export function encodeSharePayload(value: unknown): string {
  return btoa(encodeURIComponent(JSON.stringify(value)));
}

function validateSharedSetup(value: unknown, catalog: CardCatalog): { setup: SharedSetup | null; warnings: string[] } {
  if (!isRecord(value)) {
    return { setup: null, warnings: ["Shared setup link was not a valid setup object and was ignored."] };
  }

  const warnings: string[] = [];
  const setup: SharedSetup = {};
  const factionIds = new Set(catalog.factions);
  const masterIds = new Set(catalog.masters.map((model) => model.id));

  setup.playerFaction = readKnownString(value.playerFaction, factionIds, "player faction", warnings);
  setup.opponentFaction = readKnownString(value.opponentFaction, factionIds, "opponent faction", warnings);
  setup.playerMasterId = readKnownString(value.playerMasterId, masterIds, "player master", warnings);
  setup.opponentMasterId = readKnownString(value.opponentMasterId, masterIds, "opponent master", warnings);
  setup.strategyPoolId = readOptionalString(value.strategyPoolId);
  setup.strategyId = readOptionalString(value.strategyId);
  setup.schemePoolId = readOptionalString(value.schemePoolId);

  if (typeof value.pointLimit === "number" && Number.isInteger(value.pointLimit) && value.pointLimit >= MIN_POINT_LIMIT && value.pointLimit <= MAX_POINT_LIMIT) {
    setup.pointLimit = value.pointLimit;
  } else if (value.pointLimit !== undefined) {
    warnings.push("Shared setup point limit was invalid and was ignored.");
  }

  const ownedModelIds = readModelIdArray(value.ownedModelIds, catalog);
  const opponentModelIds = readModelIdArray(value.opponentModelIds, catalog);
  setup.ownedModelIds = ownedModelIds.ids;
  setup.opponentModelIds = opponentModelIds.ids;
  warnings.push(...ownedModelIds.warnings.map((warning) => `Owned models: ${warning}`));
  warnings.push(...opponentModelIds.warnings.map((warning) => `Opponent models: ${warning}`));

  return { setup, warnings };
}

function parseSavedDraft(value: unknown, catalog?: CardCatalog): SavedDraft | null {
  if (!isRecord(value)) return null;

  const id = readOptionalString(value.id);
  const name = readOptionalString(value.name);
  const createdAt = readOptionalString(value.createdAt);
  const summary = readOptionalString(value.summary);
  const totalCost = typeof value.totalCost === "number" && Number.isFinite(value.totalCost) ? value.totalCost : undefined;
  const modelIds = readModelIdArray(value.modelIds, catalog).ids;

  if (!id || !name || !createdAt || totalCost === undefined || modelIds.length === 0 || summary === undefined) {
    return null;
  }

  return {
    id,
    name,
    createdAt,
    updatedAt: readOptionalString(value.updatedAt),
    totalCost,
    modelIds,
    summary,
    playerFaction: readOptionalString(value.playerFaction),
    playerMasterId: readOptionalString(value.playerMasterId),
    opponentFaction: readOptionalString(value.opponentFaction),
    opponentMasterId: readOptionalString(value.opponentMasterId),
    pointLimit: typeof value.pointLimit === "number" && Number.isInteger(value.pointLimit) ? value.pointLimit : undefined,
    strategyPoolId: readOptionalString(value.strategyPoolId),
    strategyId: readOptionalString(value.strategyId),
    path: isRecord(value.path) ? value.path as RecommendationPath : undefined
  };
}

function readModelIdArray(value: unknown, catalog?: CardCatalog): { ids: string[]; warnings: string[] } {
  if (value === undefined) return { ids: [], warnings: [] };
  if (!Array.isArray(value)) return { ids: [], warnings: ["expected an array and ignored the saved value."] };

  const modelIds = catalog ? new Set(catalog.models.map((model) => model.id)) : undefined;
  const ids: string[] = [];
  const seen = new Set<string>();
  const warnings: string[] = [];

  if (value.length > MAX_CLIENT_ID_ARRAY_LENGTH) {
    warnings.push(`contained more than ${MAX_CLIENT_ID_ARRAY_LENGTH} IDs and was capped.`);
  }

  for (const item of value.slice(0, MAX_CLIENT_ID_ARRAY_LENGTH)) {
    if (typeof item !== "string" || item.trim().length === 0) {
      warnings.push("contained a non-string ID that was ignored.");
      continue;
    }

    const id = item.trim();
    if (modelIds && !modelIds.has(id)) {
      warnings.push(`contained unknown model ID ${id}, which was ignored.`);
      continue;
    }

    if (!seen.has(id)) {
      seen.add(id);
      ids.push(id);
    }
  }

  return { ids, warnings };
}

function readKnownString(value: unknown, allowed: Set<string>, label: string, warnings: string[]): string | undefined {
  const text = readOptionalString(value);
  if (!text) return undefined;
  if (allowed.has(text)) return text;
  warnings.push(`Shared setup ${label} was unknown and was ignored.`);
  return undefined;
}

function readOptionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
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
