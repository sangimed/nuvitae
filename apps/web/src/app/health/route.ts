import { NextResponse } from "next/server";
import { bootstrapHealthSchema } from "@nuvitae/contracts";

export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json(
    bootstrapHealthSchema.parse({
      service: "web",
      status: "ok",
    }),
  );
}
