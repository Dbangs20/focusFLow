import { NextResponse } from "next/server";
import Groq from "groq-sdk";

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY!,
});

export async function POST(req: Request) {
  let text = "";
  try {
    const body = (await req.json()) as { text?: unknown };
    if (typeof body.text === "string") {
      text = body.text.trim();
    }
  } catch {
    return NextResponse.json({ suggestion: "" });
  }

  if (!text) {
    return NextResponse.json({ suggestion: "" });
  }

  const prompt = `
You are an autocomplete assistant. Given this input: "${text}", suggest a clean version with typo correction and a likely completion.

Only return the corrected and completed suggestion in one line. Do not explain anything.
`;

  try {
    const completion = await groq.chat.completions.create({
      model: "llama-3.1-8b-instant",
      messages: [
        {
          role: "system",
          content: "You are a predictive input model that corrects and completes short task phrases.",
        },
        { role: "user", content: prompt },
      ],
    });

    const suggestion = completion.choices[0].message.content?.trim() || text;
    return NextResponse.json({ suggestion });
  } catch (err) {
    console.error("Suggestion API error:", err);
    return NextResponse.json({ suggestion: text });
  }
}
