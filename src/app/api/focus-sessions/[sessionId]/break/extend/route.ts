import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { getPrisma } from "@/lib/prisma";
import { ensureAuthSchemaOnce } from "@/lib/ensureAuthSchema";
import { ensureFocusSessionSchemaOnce } from "@/lib/ensureFocusSessionSchema";

const MAX_RELAXATIONS = 3;
const EXTENSION_MINUTES = 5;

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
  _req: NextRequest,
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

  const entryRows = await prisma.$queryRawUnsafe<Array<{ id: string; breakRelaxationsUsed: number; breakActive: boolean }>>(
    `
    SELECT "id", "breakRelaxationsUsed", "breakActive"
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
    return NextResponse.json({ error: "No active break to extend." }, { status: 400 });
  }
  if ((entry.breakRelaxationsUsed || 0) >= MAX_RELAXATIONS) {
    return NextResponse.json({ error: "Relaxation limit reached." }, { status: 400 });
  }

  await prisma.$executeRawUnsafe(
    `
    UPDATE "UserInSession"
    SET
      "breakEndsAt" = GREATEST(COALESCE("breakEndsAt", NOW()), NOW()) + (($1::TEXT || ' minutes')::INTERVAL),
      "breakRelaxationsUsed" = COALESCE("breakRelaxationsUsed", 0) + 1,
      "breakEscalatedAt" = NULL
    WHERE "id" = $2;
    `,
    EXTENSION_MINUTES,
    entry.id,
  );

  return NextResponse.json({ extended: true, extensionMinutes: EXTENSION_MINUTES });
}
