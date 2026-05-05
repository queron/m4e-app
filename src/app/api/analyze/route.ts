import { analyzeMatchup } from "@/lib/matchup-engine";
import { validatePlannerInput } from "@/lib/api-validation";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  const result = validatePlannerInput(payload);

  if (!result.ok) {
    const { status, ...body } = result.error;
    return NextResponse.json(body, { status });
  }

  return NextResponse.json(analyzeMatchup(result.value));
}
