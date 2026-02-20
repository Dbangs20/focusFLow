import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/authOptions";
import { getPrisma } from "@/lib/prisma";
import { ensureAuthSchemaOnce } from "@/lib/ensureAuthSchema";

const handler = NextAuth(authOptions);

export async function GET(...args: Parameters<typeof handler>) {
  const req = args[0] as Request;
  const url = req.url;

  // Do not hard-block provider discovery on DB/schema readiness.
  // Sign-in page must still be able to render available providers.
  if (url.includes("/api/auth/providers") || url.includes("/api/auth/csrf")) {
    return handler(...args);
  }

  try {
    await ensureAuthSchemaOnce(getPrisma());
  } catch (error) {
    console.error("Auth schema bootstrap error:", error);
    if (url.includes("/api/auth/session")) {
      return NextResponse.json(null, { status: 200 });
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
