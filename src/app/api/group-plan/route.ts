import { NextResponse } from "next/server";
import Groq from "groq-sdk";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { getPrisma } from "@/lib/prisma";
import { ensureAuthSchemaOnce } from "@/lib/ensureAuthSchema";
import { ensureGroupRoleSchemaOnce } from "@/lib/ensureGroupRoleSchema";

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY!,
});

const ensureGroupTaskTable = async () => {
  const prisma = getPrisma();
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "GroupTask" (
      "id" TEXT NOT NULL,
      "groupId" TEXT NOT NULL,
      "content" TEXT NOT NULL,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "groupRefId" TEXT,
      CONSTRAINT "GroupTask_pkey" PRIMARY KEY ("id")
    );
  `);
};

const getCurrentUserId = async () => {
  const session = await getServerSession(authOptions);
  const sessionUserId = session?.user?.id?.trim();
  if (sessionUserId) {
    return sessionUserId;
  }

  const email = (session?.user?.email || "").trim().toLowerCase();
  if (!email) return null;

  const prisma = getPrisma();
  const user = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  return user?.id ?? null;
};

const getUserRole = async (userId: string, groupId: string) => {
  const prisma = getPrisma();
  const rows = await prisma.$queryRawUnsafe<Array<{ role: string }>>(
    `
    SELECT "role" FROM "Membership"
    WHERE "userId" = $1 AND "groupId" = $2
    LIMIT 1;
    `,
    userId,
    groupId,
  );
  return rows[0]?.role ?? null;
};

export async function POST(req: Request) {
  const prisma = getPrisma();
  await ensureAuthSchemaOnce(prisma);
  await ensureGroupRoleSchemaOnce(prisma);
  await ensureGroupTaskTable();

  const userId = await getCurrentUserId();
  if (!userId) {
    return NextResponse.json({ plan: [], error: "Unauthorized" }, { status: 401 });
  }

  const { groupId } = (await req.json()) as { groupId?: string };
  const normalizedGroupId = (groupId || "").trim();
  if (!normalizedGroupId) {
    return NextResponse.json({ plan: [], error: "groupId is required" }, { status: 400 });
  }

  const role = await getUserRole(userId, normalizedGroupId);
  if (role !== "admin") {
    return NextResponse.json(
      { plan: [], error: "Only admins can generate group AI plans." },
      { status: 403 },
    );
  }

  const groupRows = await prisma.$queryRawUnsafe<Array<{ content: string }>>(
    `
    SELECT "content"
    FROM "GroupTask"
    WHERE "groupId" = $1
    ORDER BY "createdAt" DESC;
    `,
    normalizedGroupId,
  );

  const tasks = groupRows
    .map((row: { content: string }) => row.content.trim())
    .filter((value: string) => Boolean(value));
  if (tasks.length === 0) {
    return NextResponse.json({ plan: [], error: "No tasks found for this group." }, { status: 400 });
  }

  const prompt = `
You are a helpful assistant for a productivity group called "${normalizedGroupId}".

The group is working on the following tasks:
${tasks.map((t: string) => `- ${t}`).join("\n")}

Please return a clear, actionable step-by-step plan for this group to complete their work effectively. Format each step as one sentence in a numbered list.
`;

  try {
    const completion = await groq.chat.completions.create({
      model: "llama-3.1-8b-instant",
      messages: [
        {
          role: "system",
          content: "You are a collaborative group productivity planner.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
    });

    const text = completion.choices[0].message.content || "";
    const steps = text
      .split("\n")
      .map((line: string) => line.replace(/^\d+\.\s*/, "").trim())
      .filter(Boolean);

    await prisma.$executeRawUnsafe(
      `
      UPDATE "Group"
      SET "latestPlanJson" = $1,
          "latestPlanUpdatedAt" = NOW()
      WHERE "id" = $2;
      `,
      JSON.stringify(steps),
      normalizedGroupId,
    );

    return NextResponse.json({ plan: steps });
  } catch (err) {
    console.error("AI error:", err);
    return NextResponse.json({ plan: [], error: "AI failed" }, { status: 500 });
  }
}

export async function GET(req: Request) {
  const prisma = getPrisma();
  await ensureAuthSchemaOnce(prisma);
  await ensureGroupRoleSchemaOnce(prisma);

  const userId = await getCurrentUserId();
  if (!userId) {
    return NextResponse.json({ plan: [], error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const groupId = (url.searchParams.get("groupId") || "").trim();
  if (!groupId) {
    return NextResponse.json({ plan: [], error: "groupId is required" }, { status: 400 });
  }

  const role = await getUserRole(userId, groupId);
  if (!role) {
    return NextResponse.json({ plan: [], error: "Not part of group." }, { status: 403 });
  }

  const rows = await prisma.$queryRawUnsafe<Array<{ latestPlanJson: string | null }>>(
    `
    SELECT "latestPlanJson"
    FROM "Group"
    WHERE "id" = $1
    LIMIT 1;
    `,
    groupId,
  );

  const raw = rows[0]?.latestPlanJson;
  if (!raw) {
    return NextResponse.json({ plan: [] });
  }

  try {
    const plan = JSON.parse(raw) as unknown;
    return NextResponse.json({ plan: Array.isArray(plan) ? plan : [] });
  } catch {
    return NextResponse.json({ plan: [] });
  }
}
