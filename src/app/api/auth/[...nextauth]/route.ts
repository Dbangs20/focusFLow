import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/authOptions";
import { getPrisma } from "@/lib/prisma";
import { ensureAuthSchemaOnce } from "@/lib/ensureAuthSchema";

const handler = NextAuth(authOptions);

export async function GET(...args: Parameters<typeof handler>) {
  try {
    await ensureAuthSchemaOnce(getPrisma());
  } catch (error) {
    console.error("Auth schema bootstrap error:", error);
    const req = args[0] as Request;
    if (req.url.includes("/api/auth/session")) {
      return NextResponse.json(null, { status: 200 });
    }
    if (req.url.includes("/api/auth/providers")) {
      return NextResponse.json({}, { status: 200 });
    }
    return NextResponse.json({ error: "Auth backend unavailable" }, { status: 500 });
  }
  return handler(...args);
}

export async function POST(...args: Parameters<typeof handler>) {
  try {
    await ensureAuthSchemaOnce(getPrisma());
  } catch (error) {
    console.error("Auth schema bootstrap error:", error);
    return NextResponse.json({ error: "Auth backend unavailable" }, { status: 500 });
  }
  return handler(...args);
}
