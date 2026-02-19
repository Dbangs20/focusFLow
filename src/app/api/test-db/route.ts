import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

export async function GET() {
  const connectionString = process.env.DATABASE_URL || process.env.DIRECT_DATABASE_URL;

  if (!connectionString) {
    return NextResponse.json(
      { error: "DATABASE_URL (or DIRECT_DATABASE_URL) is not configured." },
      { status: 500 },
    );
  }

  let prisma: PrismaClient | null = null;
  try {
    const adapter = new PrismaPg({ connectionString });
    prisma = new PrismaClient({ adapter });

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
      {
        error:
          "Failed to connect to DB. Ensure @prisma/adapter-pg and pg are installed for Prisma 7.",
      },
      { status: 500 },
    );
  } finally {
    if (prisma) {
      await prisma.$disconnect();
    }
  }
}
