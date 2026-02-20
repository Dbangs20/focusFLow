import { NextResponse } from "next/server";
import { getAgentFocusContext } from "@/lib/agent/focusAgent";
import { groq } from "@/lib/groq";
import { getPrisma } from "@/lib/prisma";
import { ensureAgentSchemaOnce } from "@/lib/ensureAgentSchema";

export async function GET() {
  const context = await getAgentFocusContext();
  if (!context) {
    return NextResponse.json({ error: "Not logged in" }, { status: 401 });
  }

  const systemPrompt = `
You are a helpful focus agent. Based on the user's current tasks and context, decide whether to gently nudge the user or praise them.
Respond in one line.
`;

  const taskList =
    context.activeTasks.map((t: { content: string }) => `- ${t.content}`).join("\n") || "- No active tasks";
  const userPrompt = `User has ${context.activeTasks.length} tasks:\n${taskList}\nFocus score: ${context.focusScore}\nIdle seconds: ${context.idleSeconds}`;

  let suggestion = "Keep going, you're on track.";
  try {
    const res = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.4,
      max_tokens: 80,
    });
    suggestion = res.choices[0]?.message?.content?.trim() || suggestion;
  } catch (error) {
    console.error("Agent nudge AI fallback:", error);
  }

  const kind = context.focusScore < 50 ? "nudge" : "praise";
  const prisma = getPrisma();
  await ensureAgentSchemaOnce(prisma);
  await prisma.$executeRawUnsafe(
    `
    INSERT INTO "AgentNudge" ("id", "userId", "message", "kind")
    VALUES ($1, $2, $3, $4);
    `,
    `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
    context.userId,
    suggestion,
    kind,
  );

  return NextResponse.json({ suggestion, kind, focusScore: context.focusScore });
}
