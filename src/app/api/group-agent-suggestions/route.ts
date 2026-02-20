import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { getPrisma } from "@/lib/prisma";
import { groq } from "@/lib/groq";
import { ensureAuthSchemaOnce } from "@/lib/ensureAuthSchema";
import { ensureGroupRoleSchemaOnce } from "@/lib/ensureGroupRoleSchema";

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  const email = (session?.user?.email || "").trim().toLowerCase();
  if (!email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as { groupId?: unknown };
  const groupId = typeof body.groupId === "string" ? body.groupId.trim() : "";
  if (!groupId) {
    return NextResponse.json({ error: "groupId is required" }, { status: 400 });
  }

  const prisma = getPrisma();
  await ensureAuthSchemaOnce(prisma);
  await ensureGroupRoleSchemaOnce(prisma);

  const userRows = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
    `
    SELECT "id" FROM "User"
    WHERE LOWER(COALESCE("email", '')) = $1
    LIMIT 1;
    `,
    email,
  );
  const userId = userRows[0]?.id;
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const membershipRows = await prisma.$queryRawUnsafe<Array<{ role: string }>>(
    `
    SELECT "role"
    FROM "Membership"
    WHERE "userId" = $1 AND "groupId" = $2
    LIMIT 1;
    `,
    userId,
    groupId,
  );
  const role = membershipRows[0]?.role ?? null;
  if (!role) {
    return NextResponse.json({ error: "Not part of group." }, { status: 403 });
  }

  const cachedRows = await prisma.$queryRawUnsafe<Array<{ latestAssignmentsJson: string | null }>>(
    `
    SELECT "latestAssignmentsJson"
    FROM "Group"
    WHERE "id" = $1
    LIMIT 1;
    `,
    groupId,
  );

  if (role !== "admin") {
    const raw = cachedRows[0]?.latestAssignmentsJson;
    if (!raw) {
      return NextResponse.json({ error: "Admin has not generated task assignments yet." }, { status: 400 });
    }
    try {
      const suggestions = JSON.parse(raw) as unknown;
      return NextResponse.json({ suggestions: Array.isArray(suggestions) ? suggestions : [], cached: true });
    } catch {
      return NextResponse.json({ suggestions: [], cached: true });
    }
  }

  const members = await prisma.$queryRawUnsafe<Array<{ name: string | null; email: string | null }>>(
    `
    SELECT u."name", u."email"
    FROM "Membership" m
    INNER JOIN "User" u ON u."id" = m."userId"
    WHERE m."groupId" = $1
    ORDER BY COALESCE(u."name", u."email", '');
    `,
    groupId,
  );

  const tasks = await prisma.$queryRawUnsafe<Array<{ content: string }>>(
    `
    SELECT "content"
    FROM "GroupTask"
    WHERE "groupId" = $1
    ORDER BY "createdAt" DESC
    LIMIT 25;
    `,
    groupId,
  );

  if (members.length === 0 || tasks.length === 0) {
    return NextResponse.json({ suggestions: [] });
  }

  const memberLines = members
    .map(
      (m: { name: string | null; email: string | null }, i: number) =>
        `${i + 1}. ${m.name || m.email || `Member ${i + 1}`}`,
    )
    .join("\n");
  const taskLines = tasks.map((t: { content: string }, i: number) => `${i + 1}. ${t.content}`).join("\n");

  const prompt = `
You are a team productivity planner.
Given these members:
${memberLines}

And these tasks:
${taskLines}

Return 3-6 assignment suggestions in plain text list format.
Each line should be: "<Member> -> <Task>: <Reason>".
`;

  try {
    const res = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: [
        { role: "system", content: "Assign group tasks smartly and concisely." },
        { role: "user", content: prompt },
      ],
      temperature: 0.4,
      max_tokens: 220,
    });
    const text = res.choices[0]?.message?.content || "";
    const suggestions = text
      .split("\n")
      .map((s: string) => s.replace(/^\d+\.\s*/, "").trim())
      .filter(Boolean);

    await prisma.$executeRawUnsafe(
      `
      UPDATE "Group"
      SET "latestAssignmentsJson" = $1,
          "latestAssignmentsUpdatedAt" = NOW()
      WHERE "id" = $2;
      `,
      JSON.stringify(suggestions),
      groupId,
    );
    return NextResponse.json({ suggestions });
  } catch (error) {
    console.error("Group agent suggestions error:", error);
    return NextResponse.json({ error: "Failed to generate suggestions" }, { status: 500 });
  }
}
