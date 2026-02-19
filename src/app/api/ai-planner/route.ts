// app/api/ai-planner/route.ts
import { NextResponse } from "next/server";
import Groq from "groq-sdk";

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

export async function POST(req: Request) {
  const body = await req.json();
  const tasks = body.tasks || [];

  const userTasks = tasks.map((t: string, i: number) => `${i + 1}. ${t}`).join("\n");

  const prompt = `
You are a productivity assistant. The user has listed these tasks:

${userTasks}

Organize them into a time-structured plan for the day.
Be concise, but helpful. Use clear time blocks.
`;

  const chat = await groq.chat.completions.create({
    model: "llama-3-8b-8192",
    messages: [
      { role: "system", content: "You are a helpful task planning assistant." },
      { role: "user", content: prompt },
    ],
  });

  const plan = chat.choices[0].message.content;
  return NextResponse.json({ plan });
}
