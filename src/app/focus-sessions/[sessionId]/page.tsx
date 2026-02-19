"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";

const MIN_BREAK_ELIGIBLE_SECONDS = 3 * 60 * 60;
const MAX_BREAK_RELAXATIONS = 3;

type FocusSessionDetails = {
  id: string;
  name: string;
  adminUserId: string | null;
  durationSeconds: number | null;
  createdAt: string;
  startedAt: string | null;
  endedAt: string | null;
};

type SessionParticipant = {
  id: string;
  userName: string;
  goal: string;
  recap: string | null;
  userId: string | null;
  breakActive: boolean;
  breakStartedAt: string | null;
  breakEndsAt: string | null;
  breakRelaxationsUsed: number;
  breakPausedSeconds: number;
  breakEscalatedAt: string | null;
};

const formatSeconds = (totalSeconds: number) => {
  const safeSeconds = Math.max(0, totalSeconds);
  const minutes = Math.floor(safeSeconds / 60)
    .toString()
    .padStart(2, "0");
  const seconds = Math.floor(safeSeconds % 60)
    .toString()
    .padStart(2, "0");
  return `${minutes}:${seconds}`;
};

const formatDurationVerbose = (totalSeconds: number) => {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(safeSeconds / 60);
  const seconds = safeSeconds % 60;
  if (minutes > 0 && seconds > 0) {
    return `${minutes}min ${seconds}seconds`;
  }
  if (minutes > 0) {
    return `${minutes}min`;
  }
  return `${seconds}seconds`;
};

const formatElapsed = (startedAt: string | null | undefined, endedAt: string | null | undefined) => {
  if (!startedAt || !endedAt) return null;
  const startedMs = new Date(startedAt).getTime();
  const endedMs = new Date(endedAt).getTime();
  if (Number.isNaN(startedMs) || Number.isNaN(endedMs) || endedMs < startedMs) return null;
  return Math.floor((endedMs - startedMs) / 1000);
};

export default function FocusSessionDetailPage() {
  const params = useParams<{ sessionId: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const sessionId = (params?.sessionId || "").trim();
  const groupId = (searchParams?.get("groupId") || "").trim();

  const [session, setSession] = useState<FocusSessionDetails | null>(null);
  const [participants, setParticipants] = useState<SessionParticipant[]>([]);
  const [currentUserEntry, setCurrentUserEntry] = useState<SessionParticipant | null>(null);
  const [joined, setJoined] = useState(false);
  const [goal, setGoal] = useState("");
  const [recap, setRecap] = useState("");
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);
  const [endingSession, setEndingSession] = useState(false);
  const [savingRecap, setSavingRecap] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [breakInputValue, setBreakInputValue] = useState("30");
  const [breakInputUnit, setBreakInputUnit] = useState<"minutes" | "hours">("minutes");
  const [recoveryAction, setRecoveryAction] = useState("");
  const [startingBreak, setStartingBreak] = useState(false);
  const [extendingBreak, setExtendingBreak] = useState(false);
  const [returningFromBreak, setReturningFromBreak] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const breakEndAlertShownRef = useRef(false);
  const breakEscalationSentRef = useRef(false);

  const loadSession = useCallback(async () => {
    if (!sessionId) return;

    const res = await fetch(`/api/focus-sessions/${encodeURIComponent(sessionId)}`, {
      cache: "no-store",
    });

    const data = (await res.json().catch(() => ({}))) as {
      error?: string;
      session?: FocusSessionDetails;
      participants?: SessionParticipant[];
      currentUserEntry?: SessionParticipant | null;
      isAdmin?: boolean;
    };

    if (!res.ok) {
      if (res.status === 401) {
        setError("Session expired. Please sign in again.");
        router.replace(`/signin?callbackUrl=${encodeURIComponent(`/focus-sessions/${sessionId}`)}`);
        return false;
      }
      if (res.status === 404) {
        setError("Session not found");
        return false;
      }
      setError(data.error || "Failed to load session");
      return false;
    }

    setSession(data.session || null);
    const rows = Array.isArray(data.participants) ? data.participants : [];
    setParticipants(rows);

    const me = data.currentUserEntry || null;
    setIsAdmin(Boolean(data.isAdmin));
    setCurrentUserEntry(me);
    setJoined(Boolean(me));
    if (me?.goal) {
      setGoal(me.goal);
    }
    if (me?.recap) {
      setRecap(me.recap);
    }
    return true;
  }, [router, sessionId]);

  useEffect(() => {
    if (!sessionId) return;
    let stopped = false;

    setLoading(true);
    loadSession()
      .catch((err) => {
        console.error("Focus session load error:", err);
        setError("Failed to load session");
      })
      .finally(() => setLoading(false));

    const interval = setInterval(() => {
      if (stopped) return;
      loadSession().catch((err) => {
        console.error("Focus session poll error:", err);
      });
    }, 5000);

    return () => {
      stopped = true;
      clearInterval(interval);
    };
  }, [loadSession, sessionId]);

  useEffect(() => {
    const interval = setInterval(() => {
      setNowMs(Date.now());
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const durationSeconds = session?.durationSeconds ?? null;
  const hasTimer = Boolean(durationSeconds && durationSeconds > 0);
  const breakActive = Boolean(currentUserEntry?.breakActive);
  const pausedSecondsBase = currentUserEntry?.breakPausedSeconds || 0;
  const activeBreakElapsedSeconds =
    breakActive && currentUserEntry?.breakStartedAt
      ? Math.max(0, Math.floor((nowMs - new Date(currentUserEntry.breakStartedAt).getTime()) / 1000))
      : 0;
  const effectivePausedSeconds = pausedSecondsBase + activeBreakElapsedSeconds;

  const secondsRemaining = useMemo(() => {
    if (!hasTimer || !durationSeconds) return 0;
    if (!session?.startedAt) return durationSeconds;
    if (session.endedAt) return 0;

    const startedAtMs = new Date(session.startedAt).getTime();
    const elapsed = Math.floor((nowMs - startedAtMs) / 1000) - effectivePausedSeconds;
    return Math.max(0, durationSeconds - elapsed);
  }, [durationSeconds, effectivePausedSeconds, hasTimer, nowMs, session?.endedAt, session?.startedAt]);

  const isSessionFinished = Boolean(session?.endedAt) || (hasTimer && secondsRemaining === 0);
  const rawElapsedAtEnd = formatElapsed(session?.startedAt, session?.endedAt);
  const manualStoppedElapsed =
    rawElapsedAtEnd !== null ? Math.max(0, rawElapsedAtEnd - (currentUserEntry?.breakPausedSeconds || 0)) : null;
  const manualStoppedEarly =
    Boolean(session?.endedAt) &&
    Boolean(durationSeconds) &&
    manualStoppedElapsed !== null &&
    manualStoppedElapsed < (durationSeconds || 0);
  const finalSessionDurationSeconds =
    hasTimer && durationSeconds
      ? manualStoppedEarly && manualStoppedElapsed !== null
        ? manualStoppedElapsed
        : durationSeconds
      : 0;
  const finalRemainingSeconds =
    hasTimer && durationSeconds ? Math.max(0, durationSeconds - finalSessionDurationSeconds) : 0;
  const recapSubmitted = Boolean(currentUserEntry?.recap);
  const breakEligible = (durationSeconds || 0) >= MIN_BREAK_ELIGIBLE_SECONDS;
  const breakRelaxationsUsed = currentUserEntry?.breakRelaxationsUsed || 0;
  const hasBreakRelaxationLeft = breakRelaxationsUsed < MAX_BREAK_RELAXATIONS;
  const breakEndsAtMs = currentUserEntry?.breakEndsAt ? new Date(currentUserEntry.breakEndsAt).getTime() : null;
  const breakRemainingSeconds = breakActive && breakEndsAtMs ? Math.floor((breakEndsAtMs - nowMs) / 1000) : 0;
  const breakOverdue = breakActive && breakRemainingSeconds <= 0;
  const breakUnlockAtMs = session?.startedAt ? new Date(session.startedAt).getTime() + 60 * 60 * 1000 : null;
  const breakUnlockSecondsRemaining = breakUnlockAtMs ? Math.max(0, Math.ceil((breakUnlockAtMs - nowMs) / 1000)) : 0;
  const canUseBreakNow = breakEligible && breakUnlockSecondsRemaining === 0;

  useEffect(() => {
    if (!breakOverdue) {
      breakEndAlertShownRef.current = false;
      breakEscalationSentRef.current = false;
      return;
    }
    if (breakEndAlertShownRef.current) return;
    breakEndAlertShownRef.current = true;

    if (typeof window !== "undefined" && "Notification" in window) {
      if (Notification.permission === "granted") {
        void new Notification("FocusFlow", { body: "Break over. Get back to work." });
      }
    }
  }, [breakOverdue]);

  useEffect(() => {
    if (!breakOverdue || breakEscalationSentRef.current || !sessionId) return;
    breakEscalationSentRef.current = true;
    void fetch(`/api/focus-sessions/${encodeURIComponent(sessionId)}/break/escalate`, {
      method: "POST",
    }).catch(() => undefined);
  }, [breakOverdue, sessionId]);

  const toBreakMinutes = () => {
    const numeric = Number.parseInt(breakInputValue, 10);
    if (!Number.isFinite(numeric) || numeric <= 0) return null;
    if (breakInputUnit === "hours") return numeric * 60;
    return numeric;
  };

  const handleJoin = async () => {
    const normalizedGoal = goal.trim();
    if (!sessionId || !normalizedGoal) return;

    setJoining(true);
    setError(null);
    try {
      const res = await fetch(`/api/focus-sessions/${encodeURIComponent(sessionId)}/join`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ goal: normalizedGoal, teamSessionId: groupId || undefined }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };

      if (!res.ok) {
        setError(data.error || "Failed to join session");
        return;
      }

      setJoined(true);
      await loadSession();
    } finally {
      setJoining(false);
    }
  };

  const handleSaveRecap = async () => {
    const normalizedRecap = recap.trim();
    if (!sessionId || !normalizedRecap) return;

    setSavingRecap(true);
    setError(null);
    try {
      const res = await fetch(`/api/focus-sessions/${encodeURIComponent(sessionId)}/recap`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recap: normalizedRecap }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(data.error || "Failed to save recap");
        return;
      }

      await loadSession();
    } finally {
      setSavingRecap(false);
    }
  };

  const handleEndSessionNow = async () => {
    if (!sessionId) return;

    setEndingSession(true);
    setError(null);
    try {
      // Optimistic UI update to reveal recap immediately.
      setSession((prev) => (prev ? { ...prev, endedAt: new Date().toISOString() } : prev));

      const res = await fetch(`/api/focus-sessions/${encodeURIComponent(sessionId)}/end`, {
        method: "POST",
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };

      if (!res.ok) {
        if (res.status === 401) {
          setError("Session expired. Please sign in again.");
          router.replace(`/signin?callbackUrl=${encodeURIComponent(`/focus-sessions/${sessionId}`)}`);
          return;
        }
        throw new Error(data.error || "Failed to end session.");
      }

      await loadSession();
    } catch (err) {
      setError((err as Error).message || "Failed to end session.");
      await loadSession();
    } finally {
      setEndingSession(false);
    }
  };

  const handleStartBreak = async () => {
    if (!sessionId || !canUseBreakNow || !joined || isSessionFinished) return;
    const durationMinutes = toBreakMinutes();
    if (!durationMinutes) {
      setError("Enter a valid break duration.");
      return;
    }

    setStartingBreak(true);
    setError(null);
    try {
      if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "default") {
        Notification.requestPermission().catch(() => undefined);
      }

      const res = await fetch(`/api/focus-sessions/${encodeURIComponent(sessionId)}/break/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ durationMinutes }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(data.error || "Failed to start break.");
        return;
      }
      await loadSession();
    } finally {
      setStartingBreak(false);
    }
  };

  const handleExtendBreak = async () => {
    if (!sessionId || !breakOverdue || !hasBreakRelaxationLeft) return;
    setExtendingBreak(true);
    setError(null);
    try {
      const res = await fetch(`/api/focus-sessions/${encodeURIComponent(sessionId)}/break/extend`, {
        method: "POST",
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(data.error || "Failed to extend break.");
        return;
      }
      await loadSession();
    } finally {
      setExtendingBreak(false);
    }
  };

  const handleReturnFromBreak = async () => {
    if (!sessionId || !breakActive) return;
    setReturningFromBreak(true);
    setError(null);
    try {
      const res = await fetch(`/api/focus-sessions/${encodeURIComponent(sessionId)}/break/return`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recoveryAction: breakOverdue ? recoveryAction.trim() : undefined,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(data.error || "Failed to return from break.");
        return;
      }
      setRecoveryAction("");
      await loadSession();
    } finally {
      setReturningFromBreak(false);
    }
  };

  if (!sessionId) {
    return <div className="p-6" style={{ color: "var(--accent-danger)" }}>Invalid session id.</div>;
  }

  if (loading) {
    return <div className="p-6 ff-subtle">Loading session...</div>;
  }

  return (
    <div className="space-y-6">
      <button
        onClick={() =>
          router.push(groupId ? `/focus-sessions?groupId=${encodeURIComponent(groupId)}` : "/focus-sessions")
        }
        className="ff-btn ff-btn-ghost text-sm px-3 py-1.5 rounded"
      >
        Back to sessions
      </button>

      <section
        className="ff-card p-5 space-y-3"
        style={{
          background:
            "linear-gradient(155deg, color-mix(in srgb, var(--surface) 92%, transparent) 0%, color-mix(in srgb, var(--accent-primary) 8%, var(--surface)) 100%)",
        }}
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">{session?.name || "Focus Session"}</h1>
            <p className="text-sm ff-subtle">
              Timer: {hasTimer && durationSeconds ? `${Math.ceil(durationSeconds / 60)} minutes` : "Not configured"}
            </p>
          </div>
          <span
            className="rounded-full px-3 py-1 text-xs font-semibold"
            style={{ background: "var(--surface-2)", border: "1px solid var(--card-border)" }}
          >
            {isSessionFinished ? "Ended" : joined ? "Active" : "Waiting"}
          </span>
        </div>
        {hasTimer ? (
          <p className="text-4xl font-semibold tracking-wider">{formatSeconds(secondsRemaining)}</p>
        ) : (
          <p className="text-sm" style={{ color: "var(--accent-warning)" }}>
            Admin did not set a timer for this session.
          </p>
        )}
        {isSessionFinished && hasTimer && durationSeconds && (
          <div className="text-sm ff-subtle space-y-1">
            <p>Session duration: {formatDurationVerbose(finalSessionDurationSeconds)}</p>
            <p>Remaining time: {formatDurationVerbose(finalRemainingSeconds)}</p>
          </div>
        )}
        {!isSessionFinished && joined && isAdmin && (
          <div className="pt-1">
            <button
              onClick={() => void handleEndSessionNow()}
              disabled={endingSession}
              className="ff-btn px-4 py-2 rounded text-sm font-medium disabled:opacity-60"
              style={{ background: "var(--accent-danger)", color: "white" }}
            >
              {endingSession ? "Ending..." : "End Session Now"}
            </button>
          </div>
        )}
      </section>

      {error && <p className="text-sm" style={{ color: "var(--accent-danger)" }}>{error}</p>}

      {joined && !isSessionFinished && (
        <section className="ff-card p-4 space-y-3">
          <h2 className="text-lg font-semibold">Break Control</h2>
          {!breakEligible ? (
            <p className="text-sm ff-subtle">
              Break mode is available only for sessions longer than 3 hours.
            </p>
          ) : !canUseBreakNow ? (
            <p className="text-sm ff-subtle">
              Breaks unlock in {formatSeconds(breakUnlockSecondsRemaining)}.
            </p>
          ) : breakActive ? (
            <>
              <p className="text-sm ff-subtle">
                Break in progress: {formatSeconds(Math.max(0, breakRemainingSeconds))}
              </p>
              <p className="text-xs ff-subtle">
                Relaxations used: {breakRelaxationsUsed}/{MAX_BREAK_RELAXATIONS}
              </p>
              <button
                onClick={() => void handleReturnFromBreak()}
                disabled={returningFromBreak}
                className="ff-btn px-4 py-2 rounded text-sm font-medium disabled:opacity-60"
                style={{ background: "var(--accent-success)", color: "white" }}
              >
                {returningFromBreak ? "Returning..." : "I am back"}
              </button>
            </>
          ) : (
            <>
              <p className="text-sm ff-subtle">Take a break. Choose minutes or hours.</p>
              <div className="flex flex-wrap gap-2">
                <input
                  value={breakInputValue}
                  onChange={(event) => setBreakInputValue(event.target.value)}
                  inputMode="numeric"
                  className="w-24 rounded p-2 text-sm"
                  style={{ background: "var(--surface-2)", border: "1px solid var(--card-border)" }}
                  placeholder="30"
                />
                <select
                  value={breakInputUnit}
                  onChange={(event) => setBreakInputUnit(event.target.value as "minutes" | "hours")}
                  className="rounded p-2 text-sm"
                  style={{ background: "var(--surface-2)", border: "1px solid var(--card-border)" }}
                >
                  <option value="minutes">minutes</option>
                  <option value="hours">hours</option>
                </select>
                <button
                  onClick={() => void handleStartBreak()}
                  disabled={startingBreak}
                  className="ff-btn ff-btn-primary px-4 py-2 rounded text-sm font-medium disabled:opacity-60"
                >
                  {startingBreak ? "Starting..." : "Start Break"}
                </button>
              </div>
            </>
          )}
        </section>
      )}

      {!joined && !isSessionFinished ? (
        <section className="ff-card p-4 space-y-3">
          <h2 className="text-lg font-semibold">Join this session</h2>
          <input
            value={goal}
            onChange={(event) => setGoal(event.target.value)}
            placeholder="What is your goal for this focus block?"
            className="w-full rounded p-2 text-sm"
            style={{ background: "var(--surface-2)", border: "1px solid var(--card-border)" }}
          />
          <button
            onClick={() => void handleJoin()}
            disabled={joining}
            className="ff-btn ff-btn-primary px-4 py-2 rounded text-sm font-medium disabled:opacity-60"
          >
            {joining ? "Joining..." : "Join Session"}
          </button>
        </section>
      ) : (
        <section className="ff-card p-4 space-y-2">
          <h2 className="text-lg font-semibold">{joined ? "Your Goal" : "Session Status"}</h2>
          {joined ? (
            <p className="ff-subtle">{goal}</p>
          ) : (
            <p className="ff-subtle">This session has ended. You can view what was achieved below.</p>
          )}
        </section>
      )}

      {isSessionFinished && joined && (
        <section className="ff-card p-4 space-y-3">
          <h2 className="text-lg font-semibold">Session Recap</h2>
          <textarea
            value={recap}
            onChange={(event) => setRecap(event.target.value)}
            rows={4}
            placeholder="What did you complete? What remains next?"
            className="w-full rounded p-2 text-sm"
            style={{ background: "var(--surface-2)", border: "1px solid var(--card-border)" }}
          />
          <button
            onClick={() => void handleSaveRecap()}
            disabled={savingRecap || recapSubmitted}
            className="ff-btn px-4 py-2 rounded text-sm font-medium disabled:opacity-60"
            style={{ background: "var(--accent-danger)", color: "white" }}
          >
            {recapSubmitted ? "Recap Saved" : savingRecap ? "Saving..." : "Submit Recap"}
          </button>
        </section>
      )}

      {isSessionFinished && !joined && (
        <section className="ff-card p-4 space-y-2">
          <h2 className="text-lg font-semibold">Session Recap</h2>
          <p className="text-sm ff-subtle">
            This session has ended. Recaps shared by participants are shown in the participants section below.
          </p>
        </section>
      )}

      <section className="ff-card p-4 space-y-2">
        <h3 className="text-lg font-semibold">Participants</h3>
        {participants.length === 0 ? (
          <p className="text-sm ff-subtle">No one joined yet.</p>
        ) : (
          <ul className="text-sm space-y-2">
            {participants.map((participant) => (
              <li
                key={participant.id}
                className="rounded p-2"
                style={{ background: "var(--surface-2)", border: "1px solid var(--card-border)" }}
              >
                <p>
                  <span className="font-medium">{participant.userName}</span>: {participant.goal}
                </p>
                {participant.recap && <p className="text-xs ff-subtle mt-1">Recap: {participant.recap}</p>}
              </li>
            ))}
          </ul>
        )}
      </section>

      {breakOverdue && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(7, 9, 14, 0.84)" }}>
          <div className="max-w-md w-full ff-card p-5 space-y-4">
            <h3 className="text-xl font-semibold" style={{ color: "var(--accent-danger)" }}>Break over, get back to work!</h3>
            <p className="text-sm ff-subtle">
              Your break has ended. Please confirm you are back.
            </p>
            <p className="text-xs ff-subtle">Recovery mode active. Add your immediate next action.</p>
            <input
              value={recoveryAction}
              onChange={(event) => setRecoveryAction(event.target.value)}
              className="w-full rounded p-2 text-sm"
              style={{ background: "var(--surface-2)", border: "1px solid var(--card-border)" }}
              placeholder="e.g. Continue wireframe final polish"
            />
            <p className="text-xs ff-subtle">
              Relaxations used: {breakRelaxationsUsed}/{MAX_BREAK_RELAXATIONS}
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => void handleReturnFromBreak()}
                disabled={returningFromBreak || recoveryAction.trim().length === 0}
                className="ff-btn px-4 py-2 rounded text-sm font-medium disabled:opacity-60"
                style={{ background: "var(--accent-success)", color: "white" }}
              >
                {returningFromBreak ? "Returning..." : "I am back"}
              </button>
              {hasBreakRelaxationLeft ? (
                <button
                  onClick={() => void handleExtendBreak()}
                  disabled={extendingBreak}
                  className="ff-btn px-4 py-2 rounded text-sm font-medium disabled:opacity-60"
                  style={{ background: "var(--accent-warning)", color: "white" }}
                >
                  {extendingBreak ? "Extending..." : "Relax +5 min"}
                </button>
              ) : (
                <button
                  disabled
                  className="ff-btn ff-btn-ghost px-4 py-2 rounded text-sm font-medium cursor-not-allowed opacity-70"
                >
                  Relaxation limit reached
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
