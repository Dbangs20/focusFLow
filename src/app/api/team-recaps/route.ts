import { NextResponse } from "next/server";
import Groq from "groq-sdk";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { getPrisma } from "@/lib/prisma";
import { ensureAuthSchemaOnce } from "@/lib/ensureAuthSchema";
import { ensureFocusSessionSchemaOnce } from "@/lib/ensureFocusSessionSchema";
import { ensureGroupRoleSchemaOnce } from "@/lib/ensureGroupRoleSchema";

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY! });

export async function POST(req: Request) {
  const prisma = getPrisma();
  await ensureAuthSchemaOnce(prisma);
  await ensureFocusSessionSchemaOnce(prisma);
  await ensureGroupRoleSchemaOnce(prisma);

  const session = await getServerSession(authOptions);
  const email = (session?.user?.email || "").trim().toLowerCase();
  if (!email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { teamId } = (await req.json().catch(() => ({}))) as { teamId?: unknown };
  const normalizedTeamId = typeof teamId === "string" ? teamId.trim() : "";

  if (!normalizedTeamId) {
    return NextResponse.json({ error: "Missing teamId" }, { status: 400 });
  }

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
    normalizedTeamId,
  );
  const role = membershipRows[0]?.role ?? null;
  if (!role) {
    return NextResponse.json({ error: "Not part of group." }, { status: 403 });
  }

  const cachedRows = await prisma.$queryRawUnsafe<Array<{ latestTeamSummary: string | null }>>(
    `
    SELECT "latestTeamSummary"
    FROM "Group"
    WHERE "id" = $1
    LIMIT 1;
    `,
    normalizedTeamId,
  );

  if (role !== "admin") {
    const summary = (cachedRows[0]?.latestTeamSummary || "").trim();
    if (!summary) {
      return NextResponse.json({ error: "Admin has not generated team summary yet." }, { status: 400 });
    }
    return NextResponse.json({ summary, cached: true });
  }

  const team = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
    `SELECT "id" FROM "TeamFocusSession" WHERE "id" = $1 LIMIT 1;`,
    normalizedTeamId,
  );

  if (!team[0]) {
    await prisma.$executeRawUnsafe(
      `
      INSERT INTO "TeamFocusSession" ("id")
      VALUES ($1)
      ON CONFLICT ("id") DO NOTHING;
      `,
      normalizedTeamId,
    );
  }

  const sessionRecaps = await prisma.$queryRawUnsafe<Array<{ recap: string | null }>>(
    `
    SELECT "recap"
    FROM "FocusSession"
    WHERE "teamSessionId" = $1
    ORDER BY "createdAt" ASC;
    `,
    normalizedTeamId,
  );

  const participantRecaps = await prisma.$queryRawUnsafe<Array<{ userName: string; recap: string | null }>>(
    `
    SELECT uis."userName", uis."recap"
    FROM "UserInSession" uis
    INNER JOIN "FocusSession" fs ON fs."id" = uis."focusSessionId"
    WHERE fs."teamSessionId" = $1
    ORDER BY fs."createdAt" ASC, uis."id" ASC;
    `,
    normalizedTeamId,
  );

  const recapLines: string[] = [];
  sessionRecaps.forEach((item: { recap: string | null }, idx: number) => {
    if (item.recap?.trim()) {
      recapLines.push(`Session ${idx + 1}: ${item.recap.trim()}`);
    }
  });
  participantRecaps.forEach((item: { userName: string; recap: string | null }) => {
    if (item.recap?.trim()) {
      recapLines.push(`${item.userName}: ${item.recap.trim()}`);
    }
  });

  if (recapLines.length === 0) {
    return NextResponse.json({
      summary:
        "No recaps found for this team session yet. Complete one or more focus sessions, submit recaps, and ensure those sessions are linked to this group/team id.",
    });
  }

  const prompt = `
You are a helpful assistant summarizing multiple productivity session recaps.
Here are individual user/session recaps:
${recapLines.join("\n")}

Return a single cohesive summary of what the team worked on and achieved. Use a positive tone.
`;

  try {
    const result = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: [
        {
          role: "system",
          content: "You summarize multiple productivity logs into a concise team recap.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
    });

    const summary = result.choices[0]?.message?.content?.trim() || "";
    await prisma.$executeRawUnsafe(
      `
      UPDATE "Group"
      SET "latestTeamSummary" = $1,
          "latestTeamSummaryUpdatedAt" = NOW()
      WHERE "id" = $2;
      `,
      summary,
      normalizedTeamId,
    );
    return NextResponse.json({ summary });
  } catch (err) {
    console.error("AI Team Recap Error:", err);
    return NextResponse.json({ error: "AI failed to summarize" }, { status: 500 });
  }
}
