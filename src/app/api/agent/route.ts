import { NextResponse } from 'next/server';
import Groq from 'groq-sdk';

const groq = new Groq({
    apiKey: process.env.GROQ_API_KEY,
  });
  

export async function POST(req: Request) {
  const { prompt } = await req.json();
  const completion = await groq.chat.completions.create({
    messages: [
      { role: "system", content: "You are an AI assistant for planning tasks." },
      { role: "user", content: prompt }
    ],
    model: "llama-3.3-70b-versatile",
    max_tokens: 500,
    temperature: 0.7,
  });
  return NextResponse.json(completion);
}