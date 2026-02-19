import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { ensureAuthSchemaOnce } from "@/lib/ensureAuthSchema";
import { ensureFocusSessionSchemaOnce } from "@/lib/ensureFocusSessionSchema";
import { ensureAgentSchemaOnce } from "@/lib/ensureAgentSchema";

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as { confirm?: unknown };
  if (body.confirm !== "DELETE") {
    return NextResponse.json({ error: 'Send { "confirm": "DELETE" } to proceed.' }, { status: 400 });
  }

  const prisma = getPrisma();
  await ensureAuthSchemaOnce(prisma);
  await ensureFocusSessionSchemaOnce(prisma);
  await ensureAgentSchemaOnce(prisma);

  await prisma.$executeRawUnsafe(`DELETE FROM "Task" WHERE "userId" = $1;`, user.id);
  await prisma.$executeRawUnsafe(`DELETE FROM "UserInSession" WHERE "userId" = $1;`, user.id);
  await prisma.$executeRawUnsafe(`DELETE FROM "Membership" WHERE "userId" = $1;`, user.id);
  await prisma.$executeRawUnsafe(`DELETE FROM "UserHiddenSession" WHERE "userId" = $1;`, user.id);
  await prisma.$executeRawUnsafe(`DELETE FROM "AgentNudge" WHERE "userId" = $1;`, user.id);
  await prisma.$executeRawUnsafe(`DELETE FROM "UserFocusScoreLog" WHERE "userId" = $1;`, user.id);
  await prisma.$executeRawUnsafe(`DELETE FROM "UserGamification" WHERE "userId" = $1;`, user.id);
  await prisma.$executeRawUnsafe(`DELETE FROM "UserFocusState" WHERE "userId" = $1;`, user.id);

  return NextResponse.json({ deleted: true });
}
