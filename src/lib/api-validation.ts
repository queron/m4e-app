import { getCatalog } from "./card-data";
import type { ModelEvaluationInput, PlannerInput } from "./types";

export const MAX_POINT_LIMIT = 150;
export const MIN_POINT_LIMIT = 1;
export const MAX_MODEL_LIMIT = 99;
export const MAX_REQUEST_BODY_BYTES = 64 * 1024;
export const MAX_MODEL_ID_ARRAY_LENGTH = 500;

type ApiValidationError = {
  error: string;
  details?: string[];
  status: 400 | 413 | 422;
};

type ValidationResult<T> =
  | {
      ok: true;
      value: T;
    }
  | {
      ok: false;
      error: ApiValidationError;
    };

type ValidationContext = {
  modelIds: Set<string>;
  masterIds: Set<string>;
  catalogModelLimit: number;
};

export function validatePlannerInput(payload: unknown): ValidationResult<PlannerInput> {
  if (!isRecord(payload)) {
    return invalidShape("Expected a JSON object.");
  }

  const context = buildValidationContext();
  const details: string[] = [];
  const playerMasterId = readRequiredString(payload, "playerMasterId", details);
  const opponentMasterId = readRequiredString(payload, "opponentMasterId", details);
  const pointLimit = readPointLimit(payload, details);

  if (playerMasterId && !context.masterIds.has(playerMasterId)) {
    details.push("playerMasterId must reference a known master.");
  }

  if (opponentMasterId && !context.masterIds.has(opponentMasterId)) {
    details.push("opponentMasterId must reference a known master.");
  }

  const ownedModelIds = readModelIdArray(payload, "ownedModelIds", context, details);
  const opponentModelIds = readModelIdArray(payload, "opponentModelIds", context, details);
  const modelLimit = readModelLimit(payload);

  if (details.length > 0 || !playerMasterId || !opponentMasterId || pointLimit === undefined) {
    return semanticError("Analyze request contains invalid input.", details);
  }

  const catalog = getCatalog();
  const playerMaster = catalog.masters.find((model) => model.id === playerMasterId);
  const opponentMaster = catalog.masters.find((model) => model.id === opponentMasterId);

  return {
    ok: true,
    value: {
      playerFaction: readOptionalString(payload.playerFaction) ?? playerMaster?.faction ?? "",
      playerMasterId,
      opponentFaction: readOptionalString(payload.opponentFaction) ?? opponentMaster?.faction ?? "",
      opponentMasterId,
      ownedModelIds,
      opponentModelIds,
      pointLimit,
      modelLimit,
      strategyPoolId: readOptionalString(payload.strategyPoolId),
      strategyId: readOptionalString(payload.strategyId),
      schemePoolId: readOptionalString(payload.schemePoolId)
    }
  };
}

export async function parseJsonRequest(request: Request): Promise<ValidationResult<unknown>> {
  const contentLength = Number(request.headers.get("content-length") ?? 0);

  if (Number.isFinite(contentLength) && contentLength > MAX_REQUEST_BODY_BYTES) {
    return payloadTooLarge();
  }

  const text = await request.text();

  if (new TextEncoder().encode(text).length > MAX_REQUEST_BODY_BYTES) {
    return payloadTooLarge();
  }

  try {
    return {
      ok: true,
      value: JSON.parse(text)
    };
  } catch {
    return invalidShape("Request body must be valid JSON.");
  }
}

export function validateModelEvaluationInput(payload: unknown): ValidationResult<ModelEvaluationInput> {
  if (!isRecord(payload)) {
    return invalidShape("Expected a JSON object.");
  }

  const context = buildValidationContext();
  const details: string[] = [];
  const playerMasterId = readRequiredString(payload, "playerMasterId", details);
  const opponentMasterId = readRequiredString(payload, "opponentMasterId", details);
  const modelId = readRequiredString(payload, "modelId", details);

  if (playerMasterId && !context.masterIds.has(playerMasterId)) {
    details.push("playerMasterId must reference a known master.");
  }

  if (opponentMasterId && !context.masterIds.has(opponentMasterId)) {
    details.push("opponentMasterId must reference a known master.");
  }

  if (modelId && !context.modelIds.has(modelId)) {
    details.push("modelId must reference a known model.");
  }

  const opponentModelIds = readModelIdArray(payload, "opponentModelIds", context, details);

  if (details.length > 0 || !playerMasterId || !opponentMasterId || !modelId) {
    return semanticError("Model evaluation request contains invalid input.", details);
  }

  return {
    ok: true,
    value: {
      playerMasterId,
      opponentMasterId,
      modelId,
      opponentModelIds,
      strategyPoolId: readOptionalString(payload.strategyPoolId),
      strategyId: readOptionalString(payload.strategyId)
    }
  };
}

function buildValidationContext(): ValidationContext {
  const catalog = getCatalog();

  return {
    modelIds: new Set(catalog.models.map((model) => model.id)),
    masterIds: new Set(catalog.masters.map((model) => model.id)),
    catalogModelLimit: catalog.models.length
  };
}

function readRequiredString(payload: Record<string, unknown>, field: string, details: string[]): string | undefined {
  const value = payload[field];

  if (typeof value !== "string" || value.trim().length === 0) {
    details.push(`${field} is required.`);
    return undefined;
  }

  return value.trim();
}

function readOptionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function readPointLimit(payload: Record<string, unknown>, details: string[]): number | undefined {
  const value = payload.pointLimit;

  if (typeof value !== "number" || !Number.isInteger(value)) {
    details.push("pointLimit must be an integer between 1 and 150.");
    return undefined;
  }

  if (value < MIN_POINT_LIMIT || value > MAX_POINT_LIMIT) {
    details.push("pointLimit must be between 1 and 150.");
    return undefined;
  }

  return value;
}

function readModelLimit(payload: Record<string, unknown>): number {
  const value = payload.modelLimit;

  if (typeof value !== "number" || !Number.isInteger(value)) {
    return MAX_MODEL_LIMIT;
  }

  return Math.min(Math.max(value, 1), MAX_MODEL_LIMIT);
}

function readModelIdArray(
  payload: Record<string, unknown>,
  field: "ownedModelIds" | "opponentModelIds",
  context: ValidationContext,
  details: string[]
): string[] {
  const value = payload[field];

  if (value === undefined) return [];

  if (!Array.isArray(value)) {
    details.push(`${field} must be an array of model IDs.`);
    return [];
  }

  if (value.length > MAX_MODEL_ID_ARRAY_LENGTH) {
    details.push(`${field} cannot contain more than ${MAX_MODEL_ID_ARRAY_LENGTH} IDs.`);
    return [];
  }

  const ids: string[] = [];
  const seen = new Set<string>();

  for (const item of value) {
    if (typeof item !== "string" || item.trim().length === 0) {
      details.push(`${field} contains a non-string model ID.`);
      continue;
    }

    const id = item.trim();

    if (!context.modelIds.has(id)) {
      details.push(`${field} contains unknown model ID: ${id}`);
      continue;
    }

    if (!seen.has(id) && ids.length < context.catalogModelLimit) {
      seen.add(id);
      ids.push(id);
    }
  }

  return ids;
}

function invalidShape(error: string): ValidationResult<never> {
  return {
    ok: false,
    error: {
      error,
      status: 400
    }
  };
}

function payloadTooLarge(): ValidationResult<never> {
  return {
    ok: false,
    error: {
      error: `Request body cannot exceed ${MAX_REQUEST_BODY_BYTES} bytes.`,
      status: 413
    }
  };
}

function semanticError(error: string, details: string[]): ValidationResult<never> {
  return {
    ok: false,
    error: {
      error,
      details,
      status: 422
    }
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
