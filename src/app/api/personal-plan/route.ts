import { NextResponse } from "next/server";
import Groq from "groq-sdk";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { getPrisma } from "@/lib/prisma";

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY!,
});

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  const email = (session?.user?.email || "").trim().toLowerCase();
  if (!email) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const prisma = getPrisma();
  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true },
  });

  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const body = (await req.json()) as { tasks?: unknown; memory?: { tasks?: string[] } };
  const tasks = Array.isArray(body.tasks)
    ? body.tasks.filter((t): t is string => typeof t === "string" && t.trim().length > 0)
    : [];

  if (tasks.length === 0) {
    return NextResponse.json({ plan: [], error: "No tasks provided" }, { status: 400 });
  }

  await prisma.task.createMany({
    data: tasks.map((content) => ({ content: content.trim(), userId: user.id })),
  });

  const prompt = `
You are a helpful agent assisting in productivity planning.

The user previously worked on:
${body.memory?.tasks?.map((t: string) => `- ${t}`).join("\n") || "N/A"}

Now the user wants to plan:
${tasks.map((t: string) => `- ${t}`).join("\n")}


Generate a clear, actionable step-by-step plan to complete these tasks efficiently.
Use a numbered list.
`;

  try {
    const completion = await groq.chat.completions.create({
      model: "llama-3.1-8b-instant",
      messages: [
        {
          role: "system",
          content: "You are a proactive personal productivity assistant.",
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
      .map((line) => line.replace(/^\d+\.\s*/, "").trim())
      .filter(Boolean);

    return NextResponse.json({ plan: steps });
  } catch (err) {
    console.error("AI error:", err);
    return NextResponse.json({ plan: [], error: "AI failed" }, { status: 500 });
  }
}
