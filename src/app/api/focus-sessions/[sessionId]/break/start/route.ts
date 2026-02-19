import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { getPrisma } from "@/lib/prisma";
import { ensureAuthSchemaOnce } from "@/lib/ensureAuthSchema";
import { ensureFocusSessionSchemaOnce } from "@/lib/ensureFocusSessionSchema";

const MIN_BREAK_ELIGIBLE_SECONDS = 3 * 60 * 60;
const BREAK_UNLOCK_DELAY_SECONDS = 60 * 60;

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

  const userId = await getCurrentUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { sessionId } = await params;
  const normalizedSessionId = (sessionId || "").trim();
  if (!normalizedSessionId) {
    return NextResponse.json({ error: "sessionId is required" }, { status: 400 });
  }

  const body = (await req.json().catch(() => ({}))) as { durationMinutes?: unknown };
  const durationMinutes =
    typeof body.durationMinutes === "number"
      ? Math.floor(body.durationMinutes)
      : Number.parseInt(String(body.durationMinutes ?? ""), 10);
  if (!Number.isFinite(durationMinutes) || durationMinutes <= 0 || durationMinutes > 240) {
    return NextResponse.json({ error: "durationMinutes must be between 1 and 240" }, { status: 400 });
  }

  const sessionRows = await prisma.$queryRawUnsafe<
    Array<{ endedAt: Date | null; durationSeconds: number | null; startedAt: Date | null }>
  >(
    `
    SELECT "endedAt", "durationSeconds", "startedAt"
    FROM "FocusSession"
    WHERE "id" = $1
    LIMIT 1;
    `,
    normalizedSessionId,
  );
  const currentSession = sessionRows[0];
  if (!currentSession) {
    return NextResponse.json({ error: "Session not found." }, { status: 404 });
  }
  if (currentSession.endedAt) {
    return NextResponse.json({ error: "Session already ended." }, { status: 400 });
  }
  if (!currentSession.startedAt) {
    return NextResponse.json({ error: "Session has not started yet." }, { status: 400 });
  }
  if ((currentSession.durationSeconds || 0) < MIN_BREAK_ELIGIBLE_SECONDS) {
    return NextResponse.json(
      { error: "Break mode is available only for sessions of 3 hours or longer." },
      { status: 400 },
    );
  }
  const unlockAtMs = new Date(currentSession.startedAt).getTime() + BREAK_UNLOCK_DELAY_SECONDS * 1000;
  const remainingUnlockSeconds = Math.ceil((unlockAtMs - Date.now()) / 1000);
  if (remainingUnlockSeconds > 0) {
    return NextResponse.json(
      {
        error: "Breaks unlock after the first 60 minutes of a session.",
        unlockInSeconds: remainingUnlockSeconds,
      },
      { status: 400 },
    );
  }

  const entryRows = await prisma.$queryRawUnsafe<Array<{ id: string; breakActive: boolean }>>(
    `
    SELECT "id", "breakActive"
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
  if (entry.breakActive) {
    return NextResponse.json({ error: "Break is already active." }, { status: 400 });
  }

  await prisma.$executeRawUnsafe(
    `
    UPDATE "UserInSession"
    SET
      "breakActive" = TRUE,
      "breakStartedAt" = NOW(),
      "breakEndsAt" = NOW() + (($1::TEXT || ' minutes')::INTERVAL),
      "breakRelaxationsUsed" = 0,
      "breakEscalatedAt" = NULL
    WHERE "id" = $2;
    `,
    durationMinutes,
    entry.id,
  );

  return NextResponse.json({ started: true, durationMinutes });
}
