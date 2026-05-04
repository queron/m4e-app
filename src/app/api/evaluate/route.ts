import { evaluateModelMatchup } from "@/lib/matchup-engine";
import type { ModelEvaluationInput } from "@/lib/types";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const input = (await request.json()) as ModelEvaluationInput;

  if (!input.playerMasterId || !input.opponentMasterId || !input.modelId) {
    return NextResponse.json({ error: "Select both masters and a model before evaluating matchup fit." }, { status: 400 });
  }

  return NextResponse.json(evaluateModelMatchup(input));
}
