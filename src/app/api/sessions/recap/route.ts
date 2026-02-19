import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { getPrisma } from "@/lib/prisma";
import { ensureAuthSchemaOnce } from "@/lib/ensureAuthSchema";
import { ensureFocusSessionSchemaOnce } from "@/lib/ensureFocusSessionSchema";

const getCurrentUserId = async () => {
  const session = await getServerSession(authOptions);
  const email = (session?.user?.email || "").trim().toLowerCase();
  if (!email) return null;

  const prisma = getPrisma();
  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true },
  });

  return user?.id ?? null;
};

export async function POST(req: Request) {
  const prisma = getPrisma();
  await ensureAuthSchemaOnce(prisma);
  await ensureFocusSessionSchemaOnce(prisma);

  const userId = await getCurrentUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    sessionId?: unknown;
    recap?: unknown;
  };

  const sessionId = typeof body.sessionId === "string" ? body.sessionId.trim() : "";
  const recap = typeof body.recap === "string" ? body.recap.trim() : "";

  if (!sessionId || !recap) {
    return NextResponse.json({ error: "Missing sessionId or recap" }, { status: 400 });
  }

  const entry = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
    `
    SELECT "id"
    FROM "UserInSession"
    WHERE "focusSessionId" = $1 AND "userId" = $2
    LIMIT 1;
    `,
    sessionId,
    userId,
  );

  if (!entry[0]) {
    return NextResponse.json({ error: "Join session first" }, { status: 400 });
  }

  await prisma.$executeRawUnsafe(
    `
    UPDATE "UserInSession"
    SET "recap" = $1
    WHERE "id" = $2;
    `,
    recap,
    entry[0].id,
  );

  await prisma.$executeRawUnsafe(
    `
    UPDATE "FocusSession"
    SET "recap" = $1,
        "endedAt" = COALESCE("endedAt", NOW())
    WHERE "id" = $2;
    `,
    recap,
    sessionId,
  );

  return NextResponse.json({ success: true });
}
