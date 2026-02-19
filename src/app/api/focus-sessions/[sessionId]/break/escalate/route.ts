import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { getPrisma } from "@/lib/prisma";
import { ensureAuthSchemaOnce } from "@/lib/ensureAuthSchema";
import { ensureFocusSessionSchemaOnce } from "@/lib/ensureFocusSessionSchema";
import { ensureAgentSchemaOnce } from "@/lib/ensureAgentSchema";
import { ensureGroupRoleSchemaOnce } from "@/lib/ensureGroupRoleSchema";

const getCurrentUser = async () => {
  const session = await getServerSession(authOptions);
  const email = (session?.user?.email || "").trim().toLowerCase();
  if (!email) return null;

  const prisma = getPrisma();
  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, name: true, email: true },
  });
  return user ?? null;
};

const sendEscalationEmail = async ({
  to,
  subject,
  text,
  html,
}: {
  to: string;
  subject: string;
  text: string;
  html: string;
}) => {
  const server = process.env.EMAIL_SERVER;
  const from = process.env.EMAIL_FROM;
  if (!server || !from) return false;

  const nodemailerModule = (await import("nodemailer")) as unknown as {
    createTransport?: (options: unknown) => {
      sendMail: (message: { to: string; from: string; subject: string; text: string; html: string }) => Promise<void>;
    };
    default?: {
      createTransport?: (options: unknown) => {
        sendMail: (message: { to: string; from: string; subject: string; text: string; html: string }) => Promise<void>;
      };
    };
  };

  const createTransport = nodemailerModule.createTransport || nodemailerModule.default?.createTransport;
  if (!createTransport) return false;

  const transport = createTransport(server);
  await transport.sendMail({
    to,
    from,
    subject,
    text,
    html,
  });
  return true;
};

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  const prisma = getPrisma();
  await ensureAuthSchemaOnce(prisma);
  await ensureFocusSessionSchemaOnce(prisma);
  await ensureAgentSchemaOnce(prisma);
  await ensureGroupRoleSchemaOnce(prisma);

  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { sessionId } = await params;
  const normalizedSessionId = (sessionId || "").trim();
  if (!normalizedSessionId) {
    return NextResponse.json({ error: "sessionId is required" }, { status: 400 });
  }

  const rows = await prisma.$queryRawUnsafe<
    Array<{ id: string; breakActive: boolean; breakEndsAt: Date | null; breakEscalatedAt: Date | null }>
  >(
    `
    SELECT "id", "breakActive", "breakEndsAt", "breakEscalatedAt"
    FROM "UserInSession"
    WHERE "focusSessionId" = $1 AND "userId" = $2
    LIMIT 1;
    `,
    normalizedSessionId,
    user.id,
  );
  const entry = rows[0];
  if (!entry) {
    return NextResponse.json({ error: "Join the session first." }, { status: 400 });
  }
  if (!entry.breakActive) {
    return NextResponse.json({ escalated: false, reason: "break_not_active" });
  }
  if (!entry.breakEndsAt || new Date(entry.breakEndsAt).getTime() > Date.now()) {
    return NextResponse.json({ escalated: false, reason: "break_not_overdue" });
  }
  if (entry.breakEscalatedAt) {
    return NextResponse.json({ escalated: false, reason: "already_escalated" });
  }

  const appUrl = process.env.NEXTAUTH_URL || "http://localhost:3000";
  const sessionUrl = `${appUrl}/focus-sessions/${encodeURIComponent(normalizedSessionId)}`;

  let emailSent = false;
  if (user.email) {
    try {
      emailSent = await sendEscalationEmail({
        to: user.email,
        subject: "FocusFlow: Break over, get back to work",
        text: `Your break is over. Return to your session: ${sessionUrl}`,
        html: `<p>Your break is over.</p><p><a href="${sessionUrl}">Return to FocusFlow session</a></p>`,
      });
    } catch (error) {
      console.error("Break escalation email failed:", error);
    }
  }

  // Group overdue alerts: notify group admins when available.
  let groupAlertsSent = 0;
  try {
    const sessionRows = await prisma.$queryRawUnsafe<Array<{ teamSessionId: string | null; name: string }>>(
      `
      SELECT "teamSessionId", "name"
      FROM "FocusSession"
      WHERE "id" = $1
      LIMIT 1;
      `,
      normalizedSessionId,
    );
    const teamSessionId = sessionRows[0]?.teamSessionId;
    if (teamSessionId) {
      const adminRows = await prisma.$queryRawUnsafe<Array<{ email: string | null }>>(
        `
        SELECT u."email"
        FROM "Membership" m
        INNER JOIN "User" u ON u."id" = m."userId"
        WHERE m."groupId" = $1 AND m."role" = 'admin';
        `,
        teamSessionId,
      );
      for (const row of adminRows) {
        const email = (row.email || "").trim();
        if (!email || email.toLowerCase() === (user.email || "").toLowerCase()) continue;
        try {
          const sent = await sendEscalationEmail({
            to: email,
            subject: "FocusFlow Group Alert: Member overdue from break",
            text: `${user.name || user.email || "A member"} is overdue from break in session "${sessionRows[0]?.name || normalizedSessionId}". ${sessionUrl}`,
            html: `<p><strong>${user.name || user.email || "A member"}</strong> is overdue from break in session <strong>${sessionRows[0]?.name || normalizedSessionId}</strong>.</p><p><a href="${sessionUrl}">Open session</a></p>`,
          });
          if (sent) groupAlertsSent += 1;
        } catch (error) {
          console.error("Group overdue alert email failed:", error);
        }
      }
    }
  } catch (error) {
    console.error("Group overdue alert query failed:", error);
  }

  await prisma.$executeRawUnsafe(
    `
    UPDATE "UserInSession"
    SET "breakEscalatedAt" = NOW()
    WHERE "id" = $1;
    `,
    entry.id,
  );

  await prisma.$executeRawUnsafe(
    `
    INSERT INTO "UserFocusState" ("userId", "lastActivityAt", "focusScore", "reliabilityScore", "overdueCount", "lastOverdueAt", "updatedAt")
    VALUES ($1, NOW(), 70, 90, 1, NOW(), NOW())
    ON CONFLICT ("userId")
    DO UPDATE SET
      "focusScore" = GREATEST(0, COALESCE("UserFocusState"."focusScore", 80) - 5),
      "reliabilityScore" = GREATEST(0, COALESCE("UserFocusState"."reliabilityScore", 100) - 10),
      "overdueCount" = COALESCE("UserFocusState"."overdueCount", 0) + 1,
      "lastOverdueAt" = NOW(),
      "updatedAt" = NOW();
    `,
    user.id,
  );

  return NextResponse.json({ escalated: true, emailSent, groupAlertsSent });
}
