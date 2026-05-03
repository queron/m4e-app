import { analyzeMatchup } from "@/lib/matchup-engine";
import type { PlannerInput } from "@/lib/types";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const input = (await request.json()) as PlannerInput;

  if (!input.playerMasterId || !input.opponentMasterId) {
    return NextResponse.json({ error: "Select both masters before analyzing the matchup." }, { status: 400 });
  }

  return NextResponse.json(analyzeMatchup(input));
}
