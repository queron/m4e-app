import { parseJsonRequest, validateModelEvaluationInput } from "@/lib/api-validation";
import { evaluateModelMatchup } from "@/lib/matchup-engine";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const parsed = await parseJsonRequest(request);

  if (!parsed.ok) {
    const { status, ...body } = parsed.error;
    return NextResponse.json(body, { status });
  }

  const result = validateModelEvaluationInput(parsed.value);

  if (!result.ok) {
    const { status, ...body } = result.error;
    return NextResponse.json(body, { status });
  }

  return NextResponse.json(evaluateModelMatchup(result.value));
}
