import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { ensureAuthSchemaOnce } from "@/lib/ensureAuthSchema";

const toLocalTime = (hour: number, minute: number) => {
  const period = hour >= 12 ? "PM" : "AM";
  const h = hour % 12 === 0 ? 12 : hour % 12;
  return `${h}:${minute.toString().padStart(2, "0")} ${period}`;
};

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const prisma = getPrisma();
  await ensureAuthSchemaOnce(prisma);

  const tasks = await prisma.$queryRawUnsafe<Array<{ content: string }>>(
    `
    SELECT "content"
    FROM "Task"
    WHERE "userId" = $1
    ORDER BY "createdAt" DESC
    LIMIT 3;
    `,
    user.id,
  );

  const seed = tasks.length;
  const slots = [
    { label: "Morning Deep Work", start: toLocalTime(9 + seed % 2, 0), durationMin: 50 },
    { label: "Afternoon Focus Sprint", start: toLocalTime(15 + (seed % 2), 30), durationMin: 40 },
  ];

  return NextResponse.json({
    suggestions: slots.map((slot, idx) => ({
      id: `slot-${idx + 1}`,
      ...slot,
      reason:
        idx === 0
          ? "Best for high-energy priority work."
          : "Good for finishing pending tasks before evening drift.",
    })),
  });
}
