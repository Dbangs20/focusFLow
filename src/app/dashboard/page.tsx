import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { getPrisma } from "@/lib/prisma";
import DashboardClient from "./DashboardClient";

type Task = {
  id: string;
  content: string;
};

export default async function DashboardPage() {
  const session = await getServerSession(authOptions);
  const email = (session?.user?.email || "").trim().toLowerCase();

  let tasks: Task[] = [];
  if (email) {
    const prisma = getPrisma();
    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true },
    });

    if (user) {
      tasks = await prisma.task.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: "desc" },
        select: { id: true, content: true },
      });
    }
  }

  return <DashboardClient initialTasks={tasks} />;
}
