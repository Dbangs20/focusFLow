import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { getPrisma } from "@/lib/prisma";
import { ensureAuthSchemaOnce } from "@/lib/ensureAuthSchema";
import { ensureFocusSessionSchemaOnce, ensureFocusSessionColumns } from "@/lib/ensureFocusSessionSchema";

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
  _req: Request,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  const prisma = getPrisma();
  await ensureAuthSchemaOnce(prisma);
  await ensureFocusSessionSchemaOnce(prisma);
  await ensureFocusSessionColumns(prisma);

  const userId = await getCurrentUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { sessionId } = await params;
  const normalizedSessionId = (sessionId || "").trim();
  if (!normalizedSessionId) {
    return NextResponse.json({ error: "sessionId is required" }, { status: 400 });
  }

  const sessionRows = await prisma.$queryRawUnsafe<Array<{ adminUserId: string | null }>>(
    `
    SELECT "adminUserId"
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
  if (currentSession.adminUserId !== userId) {
    return NextResponse.json({ error: "Only admin can end this session." }, { status: 403 });
  }

  await prisma.$executeRawUnsafe(
    `
    UPDATE "FocusSession"
    SET "endedAt" = COALESCE("endedAt", NOW())
    WHERE "id" = $1;
    `,
    normalizedSessionId,
  );

  return NextResponse.json({ ended: true });
}
