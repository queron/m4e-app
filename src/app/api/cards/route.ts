import { getCatalog } from "@/lib/card-data";
import { toCatalogSummary } from "@/lib/catalog-summary";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const catalog = getCatalog();
  const detail = new URL(request.url).searchParams.get("detail");

  if (detail === "full") {
    return NextResponse.json(catalog);
  }

  return NextResponse.json(toCatalogSummary(catalog));
}
