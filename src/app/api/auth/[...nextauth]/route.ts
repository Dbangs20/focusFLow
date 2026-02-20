import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/authOptions";
import { getPrisma } from "@/lib/prisma";
import { ensureAuthSchemaOnce } from "@/lib/ensureAuthSchema";

const handler = NextAuth(authOptions);
const tryEnsureAuthSchema = async () => {
  try {
    await ensureAuthSchemaOnce(getPrisma());
  } catch (error) {
    console.error("Auth schema bootstrap error:", error);
  }
};

export async function GET(...args: Parameters<typeof handler>) {
  const req = args[0] as Request;
  const url = req.url;

  // Do not hard-block provider discovery on DB/schema readiness.
  // Sign-in page must still be able to render available providers.
  if (url.includes("/api/auth/providers") || url.includes("/api/auth/csrf")) {
    return handler(...args);
  }

  await tryEnsureAuthSchema();

  if (url.includes("/api/auth/session")) {
    try {
      return handler(...args);
    } catch (error) {
      console.error("Auth session handler error:", error);
      return NextResponse.json(null, { status: 200 });
    }
  }

  return handler(...args);
}

export async function POST(...args: Parameters<typeof handler>) {
  await tryEnsureAuthSchema();

  try {
    return handler(...args);
  } catch (error) {
    console.error("Auth POST handler error:", error);
    return NextResponse.json({ error: "Auth backend unavailable" }, { status: 500 });
  }
}
