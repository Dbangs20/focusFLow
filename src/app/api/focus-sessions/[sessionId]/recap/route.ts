import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { getPrisma } from "@/lib/prisma";
import { ensureAuthSchemaOnce } from "@/lib/ensureAuthSchema";
import { ensureFocusSessionSchemaOnce } from "@/lib/ensureFocusSessionSchema";
import { ensureAgentSchemaOnce } from "@/lib/ensureAgentSchema";

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

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  const prisma = getPrisma();
  await ensureAuthSchemaOnce(prisma);
  await ensureFocusSessionSchemaOnce(prisma);
  await ensureAgentSchemaOnce(prisma);

  const userId = await getCurrentUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { sessionId } = await params;
  const normalizedSessionId = (sessionId || "").trim();
  if (!normalizedSessionId) {
    return NextResponse.json({ error: "sessionId is required" }, { status: 400 });
  }

  const body = (await req.json().catch(() => ({}))) as { recap?: unknown };
  const recap = typeof body.recap === "string" ? body.recap.trim() : "";
  if (!recap) {
    return NextResponse.json({ error: "Recap is required" }, { status: 400 });
  }

  const entries = await prisma.$queryRawUnsafe<Array<{ id: string; recap: string | null }>>(
    `
    SELECT "id", "recap"
    FROM "UserInSession"
    WHERE "focusSessionId" = $1 AND "userId" = $2
    LIMIT 1;
    `,
    normalizedSessionId,
    userId,
  );

  const currentEntry = entries[0];
  if (!currentEntry) {
    return NextResponse.json({ error: "Join the session first." }, { status: 400 });
  }

  await prisma.$executeRawUnsafe(
    `
    UPDATE "UserInSession"
    SET "recap" = $1
    WHERE "id" = $2;
    `,
    recap,
    currentEntry.id,
  );

  // Award points/streak only on first recap submission for the session.
  if (!currentEntry.recap) {
    const rows = await prisma.$queryRawUnsafe<
      Array<{ totalPoints: number; currentStreak: number; longestStreak: number; lastSessionDate: Date | null }>
    >(
      `
      SELECT "totalPoints", "currentStreak", "longestStreak", "lastSessionDate"
      FROM "UserGamification"
      WHERE "userId" = $1
      LIMIT 1;
      `,
      userId,
    );

    const now = new Date();
    const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const yesterday = new Date(today);
    yesterday.setUTCDate(yesterday.getUTCDate() - 1);

    const current = rows[0];
    const lastDate = current?.lastSessionDate
      ? new Date(Date.UTC(
          current.lastSessionDate.getUTCFullYear(),
          current.lastSessionDate.getUTCMonth(),
          current.lastSessionDate.getUTCDate(),
        ))
      : null;

    let nextStreak = 1;
    if (lastDate && lastDate.getTime() === today.getTime()) {
      nextStreak = current?.currentStreak || 1;
    } else if (lastDate && lastDate.getTime() === yesterday.getTime()) {
      nextStreak = (current?.currentStreak || 0) + 1;
    }

    const totalPoints = (current?.totalPoints || 0) + 10;
    const longestStreak = Math.max(current?.longestStreak || 0, nextStreak);

    await prisma.$executeRawUnsafe(
      `
      INSERT INTO "UserGamification" ("userId", "totalPoints", "currentStreak", "longestStreak", "lastSessionDate", "updatedAt")
      VALUES ($1, $2, $3, $4, $5, NOW())
      ON CONFLICT ("userId")
      DO UPDATE SET
        "totalPoints" = $2,
        "currentStreak" = $3,
        "longestStreak" = $4,
        "lastSessionDate" = $5,
        "updatedAt" = NOW();
      `,
      userId,
      totalPoints,
      nextStreak,
      longestStreak,
      today,
    );
  }

  await prisma.$executeRawUnsafe(
    `
    UPDATE "FocusSession"
    SET "endedAt" = COALESCE("endedAt", NOW())
    WHERE "id" = $1;
    `,
    normalizedSessionId,
  );

  return NextResponse.json({ saved: true });
}
