import { validateModelEvaluationInput } from "@/lib/api-validation";
import { evaluateModelMatchup } from "@/lib/matchup-engine";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  const result = validateModelEvaluationInput(payload);

  if (!result.ok) {
    const { status, ...body } = result.error;
    return NextResponse.json(body, { status });
  }

  return NextResponse.json(evaluateModelMatchup(result.value));
}
