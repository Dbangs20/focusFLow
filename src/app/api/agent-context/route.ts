import { NextResponse } from "next/server";
import { getAgentFocusContext } from "@/lib/agent/focusAgent";

export async function GET() {
  const context = await getAgentFocusContext();
  return NextResponse.json({ context });
}
