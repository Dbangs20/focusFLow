import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { pusher, isPusherConfigured } from "@/lib/pusher";

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    groupId?: unknown;
    userId?: unknown;
    recap?: unknown;
  };

  const groupId = typeof body.groupId === "string" ? body.groupId.trim() : "";
  const userId = typeof body.userId === "string" ? body.userId.trim() : "";
  const recap = typeof body.recap === "string" ? body.recap : "";

  if (!groupId || !userId) {
    return NextResponse.json({ error: "groupId and userId are required" }, { status: 400 });
  }

  if (!isPusherConfigured()) {
    return NextResponse.json({ error: "Pusher is not configured" }, { status: 500 });
  }

  await pusher.trigger(`group-${groupId}`, "recap-update", {
    userId,
    recap,
  });

  return NextResponse.json({ ok: true });
}
