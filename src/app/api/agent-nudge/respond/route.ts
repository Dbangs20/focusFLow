import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { ensureAgentSchemaOnce } from "@/lib/ensureAgentSchema";

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not logged in" }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as { response?: unknown };
  const response = typeof body.response === "string" ? body.response.trim() : "";
  if (!response) {
    return NextResponse.json({ error: "response is required" }, { status: 400 });
  }

  const prisma = getPrisma();
  await ensureAgentSchemaOnce(prisma);
  await prisma.$executeRawUnsafe(
    `
    UPDATE "AgentNudge"
    SET "acknowledged" = TRUE, "response" = $1
    WHERE "id" = (
      SELECT "id"
      FROM "AgentNudge"
      WHERE "userId" = $2
      ORDER BY "createdAt" DESC
      LIMIT 1
    );
    `,
    response,
    user.id,
  );

  return NextResponse.json({ ok: true });
}
