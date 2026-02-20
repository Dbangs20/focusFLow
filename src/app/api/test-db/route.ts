import { NextResponse } from "next/server";
import { getPrisma } from "@/lib/prisma";

export async function GET() {
  try {
    const prisma = getPrisma();

    const newTask = await prisma.task.create({
      data: {
        content: "🚀 This is a test task from API",
      },
    });

    const allTasks = await prisma.task.findMany({
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({
      message: "Test task created successfully",
      newTask,
      allTasks,
    });
  } catch (err) {
    console.error("🔥 DB Error:", err);
    return NextResponse.json(
      { error: "Failed to connect to DB" },
      { status: 500 },
    );
  }
}
