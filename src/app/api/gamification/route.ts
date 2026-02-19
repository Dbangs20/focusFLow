import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { ensureAgentSchemaOnce } from "@/lib/ensureAgentSchema";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const prisma = getPrisma();
  await ensureAgentSchemaOnce(prisma);

  const rows = await prisma.$queryRawUnsafe<
    Array<{ totalPoints: number; currentStreak: number; longestStreak: number; lastSessionDate: Date | null }>
  >(
    `
    SELECT "totalPoints", "currentStreak", "longestStreak", "lastSessionDate"
    FROM "UserGamification"
    WHERE "userId" = $1
    LIMIT 1;
    `,
    user.id,
  );

  const stats = rows[0] || {
    totalPoints: 0,
    currentStreak: 0,
    longestStreak: 0,
    lastSessionDate: null,
  };

  return NextResponse.json({ stats });
}
