import { analyzeMatchup } from "@/lib/matchup-engine";
import { parseJsonRequest, validatePlannerInput } from "@/lib/api-validation";
import { apiErrorCategory, logApiRequest } from "@/lib/server-logging";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const startedAt = performance.now();
  const parsed = await parseJsonRequest(request);

  if (!parsed.ok) {
    const { status, ...body } = parsed.error;
    logApiRequest("warn", {
      route: "/api/analyze",
      durationMs: performance.now() - startedAt,
      status,
      errorCategory: apiErrorCategory(status, body.error)
    });
    return NextResponse.json(body, { status });
  }

  const result = validatePlannerInput(parsed.value);

  if (!result.ok) {
    const { status, ...body } = result.error;
    logApiRequest("warn", {
      route: "/api/analyze",
      durationMs: performance.now() - startedAt,
      status,
      errorCategory: apiErrorCategory(status, body.error),
      playerMasterId: readStringField(parsed.value, "playerMasterId"),
      opponentMasterId: readStringField(parsed.value, "opponentMasterId"),
      ownedModelCount: readArrayLength(parsed.value, "ownedModelIds"),
      opponentModelCount: readArrayLength(parsed.value, "opponentModelIds")
    });
    return NextResponse.json(body, { status });
  }

  const response = NextResponse.json(analyzeMatchup(result.value));

  logApiRequest("info", {
    route: "/api/analyze",
    durationMs: performance.now() - startedAt,
    status: 200,
    playerMasterId: result.value.playerMasterId,
    opponentMasterId: result.value.opponentMasterId,
    ownedModelCount: result.value.ownedModelIds.length,
    opponentModelCount: result.value.opponentModelIds.length
  });

  return response;
}

function readStringField(value: unknown, field: string): string | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const item = (value as Record<string, unknown>)[field];
  return typeof item === "string" ? item : undefined;
}

function readArrayLength(value: unknown, field: string): number | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const item = (value as Record<string, unknown>)[field];
  return Array.isArray(item) ? item.length : undefined;
}
