import { getCatalog } from "@/lib/card-data";
import { NextResponse } from "next/server";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  const model = getCatalog().models.find((candidate) => candidate.id === id);

  if (!model) {
    return NextResponse.json({ error: "Model was not found in the card catalog." }, { status: 404 });
  }

  return NextResponse.json(model);
}
