"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

type FocusSessionItem = {
  id: string;
  name: string;
  adminUserId: string | null;
  durationSeconds: number | null;
  createdAt: string;
  startedAt: string | null;
  endedAt: string | null;
  participantCount: number;
  isAdmin: boolean;
};

export default function FocusSessionsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const groupId = (searchParams?.get("groupId") || "").trim();
  const [sessions, setSessions] = useState<FocusSessionItem[]>([]);
  const [sessionName, setSessionName] = useState("");
  const [durationMinutes, setDurationMinutes] = useState("25");
  const [loading, setLoading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadSessions = useCallback(async () => {
    const res = await fetch("/api/focus-sessions", { cache: "no-store" });
    const data = (await res.json().catch(() => ({}))) as { sessions?: FocusSessionItem[]; error?: string };

    if (!res.ok) {
      if (res.status === 401) {
        setError("Session expired. Please sign in again.");
        router.replace("/signin?callbackUrl=%2Ffocus-sessions");
        return false;
      }
      setError(data.error || "Failed to load focus sessions");
      return false;
    }

    setSessions(Array.isArray(data.sessions) ? data.sessions : []);
    return true;
  }, [router]);

  useEffect(() => {
    let stopped = false;

    loadSessions().catch((err) => {
      console.error("Focus sessions load error:", err);
      setError("Failed to load focus sessions");
    });

    const interval = setInterval(() => {
      if (stopped) return;
      loadSessions().catch((err) => {
        console.error("Focus sessions poll error:", err);
      });
    }, 8000);

    return () => {
      stopped = true;
      clearInterval(interval);
    };
  }, [loadSessions]);

  const handleCreateSession = async () => {
    const normalized = sessionName.trim();
    if (!normalized) return;

    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/focus-sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: normalized,
          teamSessionId: groupId || undefined,
          durationMinutes: Number.parseInt(durationMinutes, 10),
        }),
      });

      const data = (await res.json().catch(() => ({}))) as {
        session?: FocusSessionItem;
        error?: string;
      };

      if (!res.ok || !data.session?.id) {
        setError(data.error || "Failed to create session");
        return;
      }

      const nextUrl = groupId
        ? `/focus-sessions/${data.session.id}?groupId=${encodeURIComponent(groupId)}`
        : `/focus-sessions/${data.session.id}`;
      router.push(nextUrl);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteSession = async (sessionId: string) => {
    if (!sessionId) return;
    setDeletingId(sessionId);
    setError(null);
    try {
      const res = await fetch(`/api/focus-sessions?sessionId=${encodeURIComponent(sessionId)}`, {
        method: "DELETE",
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(data.error || "Failed to delete session");
        return;
      }
      await loadSessions();
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <section
        className="ff-card p-5 flex flex-wrap items-center justify-between gap-3"
        style={{
          background:
            "linear-gradient(155deg, color-mix(in srgb, var(--surface) 92%, transparent) 0%, color-mix(in srgb, var(--accent-primary) 8%, var(--surface)) 100%)",
        }}
      >
        <div>
          <h1 className="text-3xl font-bold">Focus Sessions</h1>
          <p className="text-sm ff-subtle">
            Admin sets the session timer. Members join and follow that same timer.
          </p>
        </div>
        <span
          className="rounded-full px-3 py-1 text-xs font-semibold"
          style={{ background: "var(--surface-2)", border: "1px solid var(--card-border)" }}
        >
          {sessions.length} session{sessions.length === 1 ? "" : "s"}
        </span>
      </section>

      <section className="ff-card p-5 space-y-3">
        <label className="text-sm ff-subtle">Create a new session</label>
        <div className="flex flex-col md:flex-row gap-2">
          <input
            value={sessionName}
            onChange={(event) => setSessionName(event.target.value)}
            placeholder="e.g. Sprint Writing Block"
            className="flex-1 rounded p-2 text-sm"
            style={{ background: "var(--surface-2)", border: "1px solid var(--card-border)" }}
          />
          <input
            value={durationMinutes}
            onChange={(event) => setDurationMinutes(event.target.value)}
            inputMode="numeric"
            placeholder="mins"
            className="w-24 rounded p-2 text-sm"
            style={{ background: "var(--surface-2)", border: "1px solid var(--card-border)" }}
          />
          <button
            onClick={() => void handleCreateSession()}
            disabled={loading}
            className="ff-btn ff-btn-primary px-4 py-2 rounded text-sm font-medium disabled:opacity-60"
          >
            {loading ? "Creating..." : "Create"}
          </button>
        </div>
      </section>

      {error && <p className="text-sm" style={{ color: "var(--accent-danger)" }}>{error}</p>}

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Recent Sessions</h2>
        {sessions.length === 0 ? (
          <div className="ff-card p-5">
            <p className="text-sm ff-subtle">No sessions yet. Create one to start.</p>
          </div>
        ) : (
          <ul className="grid gap-3 md:grid-cols-2">
            {sessions.map((session) => (
              <li
                key={session.id}
                className="ff-card p-4 flex items-start justify-between gap-3"
              >
                <div>
                  <p className="font-semibold">{session.name}</p>
                  <p className="text-xs ff-subtle">
                    Timer:{" "}
                    {session.durationSeconds && session.durationSeconds > 0
                      ? `${Math.ceil(session.durationSeconds / 60)} min`
                      : "Not set"}
                  </p>
                  <p className="text-xs ff-subtle">
                    {session.participantCount} participant{session.participantCount === 1 ? "" : "s"}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() =>
                      router.push(
                        groupId
                          ? `/focus-sessions/${session.id}?groupId=${encodeURIComponent(groupId)}`
                          : `/focus-sessions/${session.id}`,
                      )
                    }
                    className="ff-btn ff-btn-primary px-3 py-1.5 text-sm rounded"
                  >
                    {session.endedAt ? "View" : "Join"}
                  </button>
                  {session.endedAt && (
                    <button
                      onClick={() => void handleDeleteSession(session.id)}
                      disabled={deletingId === session.id}
                      className="ff-btn px-3 py-1.5 text-sm rounded disabled:opacity-60"
                      style={{ background: "var(--accent-danger)", color: "white" }}
                    >
                      {deletingId === session.id ? "Deleting..." : "Delete (for me)"}
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
