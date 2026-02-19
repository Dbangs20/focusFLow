import Link from "next/link";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";

export default async function HomePage() {
  const session = await getServerSession(authOptions);

  return (
    <div className="mx-auto max-w-5xl px-6 py-14 space-y-14">
      <section
        className="space-y-5 ff-card p-6"
        style={{
          background:
            "linear-gradient(155deg, color-mix(in srgb, var(--surface) 92%, transparent) 0%, color-mix(in srgb, var(--accent-primary) 8%, var(--surface)) 100%)",
        }}
      >
        <p className="text-xs uppercase tracking-[0.2em] ff-subtle">FocusFlow</p>
        <h1 className="text-4xl sm:text-5xl font-semibold leading-tight">
          Plan work faster with personal focus and live group collaboration.
        </h1>
        <p className="max-w-3xl ff-subtle">
          FocusFlow helps you capture tasks, auto-correct input while typing, sync focus groups across tabs and
          browsers, and generate AI execution plans from your real task list.
        </p>
        <div className="flex flex-wrap gap-3 pt-2">
          {session ? (
            <Link
              href="/dashboard"
              className="px-5 py-2.5 rounded text-sm font-medium ff-btn ff-btn-primary"
            >
              Open Dashboard
            </Link>
          ) : (
            <Link
              href="/signin"
              className="px-5 py-2.5 rounded text-sm font-medium ff-btn ff-btn-primary"
            >
              Sign In to Start
            </Link>
          )}
          <Link
            href="/focus-group"
            className="px-5 py-2.5 rounded text-sm font-medium ff-btn ff-btn-ghost"
          >
            Try Focus Group
          </Link>
        </div>
      </section>

      <section className="grid sm:grid-cols-3 gap-4">
        <article className="ff-card p-4 space-y-2">
          <h2 className="font-medium">Personal Dashboard</h2>
          <p className="text-sm ff-subtle">Create and store your own tasks with user-scoped persistence.</p>
        </article>
        <article className="ff-card p-4 space-y-2">
          <h2 className="font-medium">Group Workspace</h2>
          <p className="text-sm ff-subtle">
            Join a group, collaborate in real-time, and enforce admin/member role permissions.
          </p>
        </article>
        <article className="ff-card p-4 space-y-2">
          <h2 className="font-medium">AI Planning</h2>
          <p className="text-sm ff-subtle">
            Convert task lists into stepwise plans for individuals and teams.
          </p>
        </article>
      </section>

      <section className="ff-card p-5">
        <h3 className="font-medium mb-2">Current build phase</h3>
        <p className="text-sm ff-subtle">
          Feature development is prioritized first. UI/UX polish can be layered once all core capabilities are stable.
        </p>
      </section>
    </div>
  );
}
