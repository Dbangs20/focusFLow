"use client";

import Link from "next/link";
import { useSession, signOut } from "next-auth/react";
import ThemeToggle from "./theme-toggle";

export default function Navbar() {
  const { data: session } = useSession();
  const rawName = (session?.user?.name || "").trim();
  const rawEmail = (session?.user?.email || "").trim();
  const displayName =
    rawName ||
    (rawEmail ? rawEmail.split("@")[0] : "");

  return (
    <nav
      className="p-4 border-b flex justify-between items-center"
      style={{ borderColor: "var(--card-border)", background: "var(--surface)" }}
    >
      <span className="font-bold text-xl" style={{ color: "var(--text-primary)" }}>
        FocusFlow
      </span>
      <div className="flex gap-3 items-center">
        {session?.user && displayName && (
          <span className="text-sm" style={{ color: "var(--text-secondary)" }}>
            Hi, {displayName}
          </span>
        )}
        <ThemeToggle />
        {session ? (
          <button
            onClick={() => signOut()}
            className="ff-btn rounded px-2 py-1 text-sm"
            style={{ color: "var(--accent-danger)" }}
          >
            Sign Out
          </button>
        ) : (
          <Link href="/signin" className="text-sm" style={{ color: "var(--accent-primary)" }}>
            Sign In
          </Link>
        )}
      </div>
    </nav>
  );
}
