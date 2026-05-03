import { getCatalog } from "@/lib/card-data";
import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json(getCatalog());
}
