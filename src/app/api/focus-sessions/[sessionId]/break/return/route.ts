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

  const body = (await req.json().catch(() => ({}))) as { recoveryAction?: unknown };
  const recoveryAction = typeof body.recoveryAction === "string" ? body.recoveryAction.trim() : "";

  const entryRows = await prisma.$queryRawUnsafe<
    Array<{ id: string; breakStartedAt: Date | null; breakEndsAt: Date | null; breakActive: boolean }>
  >(
    `
    SELECT "id", "breakStartedAt", "breakEndsAt", "breakActive"
    FROM "UserInSession"
    WHERE "focusSessionId" = $1 AND "userId" = $2
    LIMIT 1;
    `,
    normalizedSessionId,
    userId,
  );
  const entry = entryRows[0];
  if (!entry) {
    return NextResponse.json({ error: "Join the session first." }, { status: 400 });
  }
  if (!entry.breakActive) {
    return NextResponse.json({ error: "No active break to return from." }, { status: 400 });
  }

  const breakStartedAtMs = entry.breakStartedAt ? new Date(entry.breakStartedAt).getTime() : null;
  const pausedSeconds = breakStartedAtMs ? Math.max(0, Math.floor((Date.now() - breakStartedAtMs) / 1000)) : 0;
  const breakEndsAtMs = entry.breakEndsAt ? new Date(entry.breakEndsAt).getTime() : null;
  const overdueSeconds = breakEndsAtMs ? Math.max(0, Math.floor((Date.now() - breakEndsAtMs) / 1000)) : 0;
  const isRecoveryReturn = overdueSeconds > 0;
  if (isRecoveryReturn && !recoveryAction) {
    return NextResponse.json({ error: "Recovery action is required when returning after overdue break." }, { status: 400 });
  }

  await prisma.$executeRawUnsafe(
    `
    UPDATE "UserInSession"
    SET
      "breakActive" = FALSE,
      "breakEndsAt" = NULL,
      "breakStartedAt" = NULL,
      "breakPausedSeconds" = COALESCE("breakPausedSeconds", 0) + $1,
      "breakEscalatedAt" = NULL
    WHERE "id" = $2;
    `,
    pausedSeconds,
    entry.id,
  );

  // Reliability scoring update on return. Recovery return can regain limited reliability.
  await prisma.$executeRawUnsafe(
    `
    INSERT INTO "UserFocusState" ("userId", "lastActivityAt", "focusScore", "reliabilityScore", "overdueCount", "updatedAt")
    VALUES ($1, NOW(), 80, 100, 0, NOW())
    ON CONFLICT ("userId")
    DO UPDATE SET
      "lastActivityAt" = NOW(),
      "focusScore" = LEAST(100, COALESCE("UserFocusState"."focusScore", 80) + 2),
      "reliabilityScore" = CASE
        WHEN $2::BOOLEAN THEN LEAST(100, COALESCE("UserFocusState"."reliabilityScore", 100) + 3)
        ELSE COALESCE("UserFocusState"."reliabilityScore", 100)
      END,
      "updatedAt" = NOW();
    `,
    userId,
    isRecoveryReturn,
  );

  return NextResponse.json({ returned: true, recoveryApplied: isRecoveryReturn, overdueSeconds });
}
