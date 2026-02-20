import { getCurrentUser } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { ensureAuthSchemaOnce } from "@/lib/ensureAuthSchema";
import { ensureAgentSchemaOnce } from "@/lib/ensureAgentSchema";

type ActiveTask = {
  id: string;
  content: string;
  createdAt: Date;
};

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

export async function getAgentFocusContext() {
  const user = await getCurrentUser();
  if (!user) return null;

  const prisma = getPrisma();
  await ensureAuthSchemaOnce(prisma);
  await ensureAgentSchemaOnce(prisma);

  const tasks = await prisma.$queryRawUnsafe<ActiveTask[]>(
    `
    SELECT "id", "content", "createdAt"
    FROM "Task"
    WHERE "userId" = $1
      AND COALESCE("completed", FALSE) = FALSE
    ORDER BY "createdAt" DESC
    LIMIT 50;
    `,
    user.id,
  );

  const stateRows = await prisma.$queryRawUnsafe<
    Array<{ lastActivityAt: Date | null; focusScore: number }>
  >(
    `
    SELECT "lastActivityAt", "focusScore"
    FROM "UserFocusState"
    WHERE "userId" = $1
    LIMIT 1;
    `,
    user.id,
  );

  const state = stateRows[0];
  const lastActivityAt = state?.lastActivityAt ? new Date(state.lastActivityAt).getTime() : Date.now();
  const now = Date.now();
  const idleSeconds = Math.max(0, Math.floor((now - lastActivityAt) / 1000));

  // Dynamic score baseline: older inactivity reduces score.
  const baseScore = state?.focusScore ?? 80;
  const penalty = Math.floor(idleSeconds / 120);
  const focusScore = clamp(baseScore - penalty, 0, 100);

  return {
    userId: user.id,
    activeTasks: tasks.map((t: ActiveTask) => ({ id: t.id, content: t.content, createdAt: t.createdAt })),
    lastActivity: lastActivityAt,
    idleSeconds,
    focusScore,
  };
}
