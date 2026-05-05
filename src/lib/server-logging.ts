type ApiLogLevel = "info" | "warn" | "error";

type ApiLogFields = {
  route: string;
  durationMs: number;
  status: number;
  errorCategory?: string;
  playerMasterId?: string;
  opponentMasterId?: string;
  modelId?: string;
  ownedModelCount?: number;
  opponentModelCount?: number;
};

export function logApiRequest(level: ApiLogLevel, fields: ApiLogFields): void {
  const entry = {
    event: "api_request",
    ...fields,
    durationMs: Math.round(fields.durationMs)
  };

  if (level === "error") {
    console.error(entry);
    return;
  }

  if (level === "warn") {
    console.warn(entry);
    return;
  }

  console.info(entry);
}

export function apiErrorCategory(status: number, message?: string): string {
  if (status === 413) return "payload_too_large";
  if (status === 422) return "validation_error";
  if (status === 400 && message?.toLowerCase().includes("json")) return "invalid_json";
  if (status >= 500) return "server_error";
  return "bad_request";
}
