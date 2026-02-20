import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { getPrisma } from "@/lib/prisma";
import { ensureAuthSchemaOnce } from "@/lib/ensureAuthSchema";
import { ensureFocusSessionSchemaOnce, ensureFocusSessionColumns } from "@/lib/ensureFocusSessionSchema";

type SessionParticipantRow = {
  id: string;
  userName: string;
  goal: string;
  recap: string | null;
  userId: string | null;
  breakActive: boolean;
  breakStartedAt: Date | null;
  breakEndsAt: Date | null;
  breakRelaxationsUsed: number;
  breakPausedSeconds: number;
  breakEscalatedAt: Date | null;
};

const getCurrentUser = async () => {
  const session = await getServerSession(authOptions);
  const email = (session?.user?.email || "").trim().toLowerCase();
  const fallbackName = (session?.user?.name || "").trim();
  if (!email) return null;

  const prisma = getPrisma();
  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, name: true, email: true },
  });

  if (!user) return null;

  return {
    id: user.id,
    userName: (user.name || user.email || fallbackName || email).trim(),
  };
};

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  const prisma = getPrisma();
  await ensureAuthSchemaOnce(prisma);
  await ensureFocusSessionSchemaOnce(prisma);
  await ensureFocusSessionColumns(prisma);

  const currentUser = await getCurrentUser();
  if (!currentUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { sessionId } = await params;
  const normalizedSessionId = (sessionId || "").trim();
  if (!normalizedSessionId) {
    return NextResponse.json({ error: "sessionId is required" }, { status: 400 });
  }

  const sessions = await prisma.$queryRawUnsafe<
    Array<{
      id: string;
      name: string;
      createdAt: Date;
      startedAt: Date | null;
      endedAt: Date | null;
      adminUserId: string | null;
      durationSeconds: number | null;
    }>
  >(
    `
    SELECT "id", "name", "createdAt", "startedAt", "endedAt", "adminUserId", "durationSeconds"
    FROM "FocusSession"
    WHERE "id" = $1
    LIMIT 1;
    `,
    normalizedSessionId,
  );

  const currentSession = sessions[0];
  if (!currentSession) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  const participants = await prisma.$queryRawUnsafe<SessionParticipantRow[]>(
    `
    SELECT
      "id",
      "userName",
      "goal",
      "recap",
      "userId",
      "breakActive",
      "breakStartedAt",
      "breakEndsAt",
      "breakRelaxationsUsed",
      "breakPausedSeconds",
      "breakEscalatedAt"
    FROM "UserInSession"
    WHERE "focusSessionId" = $1
    ORDER BY "id" ASC;
    `,
    normalizedSessionId,
  );

  const currentUserEntry =
    participants.find((row: SessionParticipantRow) => row.userId === currentUser.id) || null;

  return NextResponse.json({
    session: currentSession,
    participants,
    currentUserEntry,
    isAdmin: currentSession.adminUserId === currentUser.id,
  });
}
