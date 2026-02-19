"use client";

import { useEffect, useRef, useState } from "react";
import GhostInput from "@/components/GhostInput";

type Task = {
  id: string;
  content: string;
};

type DashboardClientProps = {
  initialTasks: Task[];
};

type AgentHistoryItem = {
  id: string;
  message: string;
  kind: string;
  response: string | null;
  createdAt: string;
};

type ScheduleSuggestion = {
  id: string;
  label: string;
  start: string;
  durationMin: number;
  reason: string;
};

export default function DashboardClient({ initialTasks }: DashboardClientProps) {
  const [tasks, setTasks] = useState<Task[]>(initialTasks);
  const [taskInput, setTaskInput] = useState("");
  const [aiSteps, setAiSteps] = useState<string[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [focusScore, setFocusScore] = useState<number | null>(null);
  const [nudge, setNudge] = useState<string>("");
  const [nudgeKind, setNudgeKind] = useState<string>("");
  const [showNudge, setShowNudge] = useState(false);
  const [nudgeLoading, setNudgeLoading] = useState(false);
  const [scoreTrend, setScoreTrend] = useState<"up" | "down" | "stable">("stable");
  const [nudgeHistory, setNudgeHistory] = useState<AgentHistoryItem[]>([]);
  const [nudgeStats, setNudgeStats] = useState({ helpfulCount: 0, notNowCount: 0, acknowledgedCount: 0 });
  const [reliabilityScore, setReliabilityScore] = useState<number>(100);
  const [overdueCount, setOverdueCount] = useState<number>(0);
  const [gamification, setGamification] = useState({ totalPoints: 0, currentStreak: 0, longestStreak: 0 });
  const [scheduleSuggestions, setScheduleSuggestions] = useState<ScheduleSuggestion[]>([]);
  const [privacyBusy, setPrivacyBusy] = useState(false);
  const [pageError, setPageError] = useState<string | null>(null);
  const lastActivityPingRef = useRef(0);

  const handleAddTask = async () => {
    if (!taskInput.trim()) return;

    const res = await fetch("/api/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: taskInput.trim() }),
    });

    if (!res.ok) {
      return;
    }

    const newTask = (await res.json()) as Task;
    setTasks((prev) => [newTask, ...prev]);
    setTaskInput("");
  };

  const generatePlan = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/personal-plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tasks: tasks.map((t) => t.content) }),
      });

      const text = await res.text();
      const data = JSON.parse(text) as { plan?: string[] };
      setAiSteps(data.plan || []);
    } catch (err) {
      console.error("Failed to parse AI output", err);
      setAiSteps([]);
    } finally {
      setLoading(false);
    }
  };

  const fetchNudge = async () => {
    setNudgeLoading(true);
    try {
      const res = await fetch("/api/agent-nudge", { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json().catch(() => ({}))) as {
        suggestion?: string;
        kind?: string;
        focusScore?: number;
      };
      if (typeof data.focusScore === "number") setFocusScore(data.focusScore);
      if (data.suggestion) {
        setNudge(data.suggestion);
        setNudgeKind(data.kind || "");
        setShowNudge(true);
      }
    } finally {
      setNudgeLoading(false);
    }
  };

  const fetchHistory = async () => {
    const res = await fetch("/api/agent-history", { cache: "no-store" });
    if (!res.ok) return;
    const data = (await res.json().catch(() => ({}))) as {
      scoreTrend?: "up" | "down" | "stable";
      nudges?: AgentHistoryItem[];
      stats?: { helpfulCount?: number; notNowCount?: number; acknowledgedCount?: number };
      reliabilityScore?: number;
      overdueCount?: number;
    };
    setScoreTrend(data.scoreTrend || "stable");
    setNudgeHistory(Array.isArray(data.nudges) ? data.nudges : []);
    setNudgeStats({
      helpfulCount: data.stats?.helpfulCount || 0,
      notNowCount: data.stats?.notNowCount || 0,
      acknowledgedCount: data.stats?.acknowledgedCount || 0,
    });
    setReliabilityScore(typeof data.reliabilityScore === "number" ? data.reliabilityScore : 100);
    setOverdueCount(typeof data.overdueCount === "number" ? data.overdueCount : 0);
  };

  const fetchGamification = async () => {
    const res = await fetch("/api/gamification", { cache: "no-store" });
    if (!res.ok) return;
    const data = (await res.json().catch(() => ({}))) as {
      stats?: { totalPoints?: number; currentStreak?: number; longestStreak?: number };
    };
    setGamification({
      totalPoints: data.stats?.totalPoints || 0,
      currentStreak: data.stats?.currentStreak || 0,
      longestStreak: data.stats?.longestStreak || 0,
    });
  };

  const fetchScheduleSuggestions = async () => {
    const res = await fetch("/api/schedule-suggestions", { cache: "no-store" });
    if (!res.ok) return;
    const data = (await res.json().catch(() => ({}))) as { suggestions?: ScheduleSuggestion[] };
    setScheduleSuggestions(Array.isArray(data.suggestions) ? data.suggestions : []);
  };

  useEffect(() => {
    if (aiSteps) {
      const memory = {
        tasks,
        steps: aiSteps,
        timestamp: new Date().toISOString(),
      };
      localStorage.setItem("focusflow_memory", JSON.stringify(memory));
    }
  }, [aiSteps, tasks]);

  useEffect(() => {
    const mem = localStorage.getItem("focusflow_memory");
    if (mem) {
      const { tasks: oldTasks, steps: oldPlan } = JSON.parse(mem);
      console.log("Restored last session", oldTasks, oldPlan);
    }
  }, []);

  useEffect(() => {
    let mounted = true;

    const postActivity = async (type: "activity" | "focus" = "activity") => {
      const now = Date.now();
      if (now - lastActivityPingRef.current < 15000 && type === "activity") return;
      lastActivityPingRef.current = now;

      const res = await fetch("/api/agent-activity", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type }),
      });
      if (!mounted || !res.ok) return;
      const data = (await res.json().catch(() => ({}))) as { focusScore?: number };
      if (typeof data.focusScore === "number") {
        setFocusScore(data.focusScore);
      }
    };

    const onVisible = () => {
      if (document.visibilityState === "visible") {
        void postActivity("focus");
      }
    };
    const onInteraction = () => {
      void postActivity("activity");
    };

    void postActivity("focus");
    void fetchHistory().catch(() => undefined);
    void fetchGamification().catch(() => undefined);
    void fetchScheduleSuggestions().catch(() => undefined);

    const activityInterval = setInterval(() => {
      if (document.visibilityState === "visible") void postActivity("activity");
    }, 45000);

    const nudgeInterval = setInterval(() => {
      if (document.visibilityState === "visible") void fetchNudge().catch(() => undefined);
    }, 90000);

    const summaryInterval = setInterval(() => {
      if (document.visibilityState === "visible") {
        void fetchHistory().catch(() => undefined);
        void fetchGamification().catch(() => undefined);
        void fetchScheduleSuggestions().catch(() => undefined);
      }
    }, 60000);

    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("keydown", onInteraction);
    window.addEventListener("mousedown", onInteraction);
    window.addEventListener("touchstart", onInteraction);

    return () => {
      mounted = false;
      clearInterval(activityInterval);
      clearInterval(nudgeInterval);
      clearInterval(summaryInterval);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("keydown", onInteraction);
      window.removeEventListener("mousedown", onInteraction);
      window.removeEventListener("touchstart", onInteraction);
    };
  }, []);

  const respondToNudge = async (response: string) => {
    setShowNudge(false);
    await fetch("/api/agent-nudge/respond", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ response }),
    });
    await fetchHistory().catch(() => undefined);
  };

  const exportPrivacyData = async () => {
    setPrivacyBusy(true);
    setPageError(null);
    try {
      const res = await fetch("/api/privacy/export", { cache: "no-store" });
      if (!res.ok) {
        setPageError("Failed to export data.");
        return;
      }
      const data = await res.json();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `focusflow-export-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setPrivacyBusy(false);
    }
  };

  const deleteMyData = async () => {
    const ok = window.confirm(
      "This removes your personal tasks, session entries, memberships, and agent history. Continue?",
    );
    if (!ok) return;

    setPrivacyBusy(true);
    setPageError(null);
    try {
      const res = await fetch("/api/privacy/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: "DELETE" }),
      });
      if (!res.ok) {
        setPageError("Failed to delete your data.");
        return;
      }
      setTasks([]);
      setAiSteps(null);
      setNudgeHistory([]);
      setGamification({ totalPoints: 0, currentStreak: 0, longestStreak: 0 });
    } finally {
      setPrivacyBusy(false);
    }
  };

  return (
    <div className="space-y-5">
      <section className="ff-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-3xl font-bold" style={{ color: "var(--text-primary)" }}>
              Dashboard
            </h1>
            <p className="text-sm ff-subtle">AI-assisted personal productivity and recovery insights.</p>
          </div>
          <div className="flex items-center gap-2">
            <span className="rounded-full px-3 py-1 text-xs font-semibold" style={{ background: "var(--surface-2)", border: "1px solid var(--card-border)" }}>
              Focus score: {focusScore ?? "--"}
            </span>
            <button
              onClick={() => void fetchNudge()}
              className="ff-btn ff-btn-primary rounded px-3 py-2 text-sm font-medium"
              style={{ background: "var(--accent-primary)", color: "white" }}
            >
              {nudgeLoading ? "Thinking..." : "Get AI Nudge"}
            </button>
          </div>
        </div>
      </section>

      {showNudge && nudge && (
        <section className="ff-card p-4">
          <p className="text-sm" style={{ color: "var(--accent-success)" }}>
            {nudgeKind === "praise" ? "Agent Praise" : "Agent Nudge"}
          </p>
          <p className="text-sm mt-1" style={{ color: "var(--text-primary)" }}>
            {nudge}
          </p>
          <div className="flex gap-2 mt-3">
            <button
              onClick={() => void respondToNudge("helpful")}
              className="ff-btn rounded px-3 py-1.5 text-xs font-semibold"
              style={{ background: "var(--accent-success)", color: "white" }}
            >
              Helpful
            </button>
            <button
              onClick={() => void respondToNudge("not_now")}
              className="ff-btn ff-btn-ghost px-3 py-1.5 rounded text-xs font-semibold"
              style={{ background: "var(--surface-2)", border: "1px solid var(--card-border)", color: "var(--text-primary)" }}
            >
              Not now
            </button>
          </div>
        </section>
      )}

      {pageError && <p className="text-sm" style={{ color: "var(--accent-danger)" }}>{pageError}</p>}

      <section className="grid gap-5 lg:grid-cols-[1.35fr_1fr]">
        <div className="space-y-5">
          <article className="ff-card p-5 space-y-3">
            <h2 className="text-lg font-semibold">Task Manager</h2>
            <GhostInput
              type="text"
              value={taskInput}
              onChange={setTaskInput}
              placeholder="Type a task..."
              className="w-full p-3 rounded border"
            />
            <div className="flex gap-2">
              <button
                onClick={handleAddTask}
                className="ff-btn ff-btn-primary px-4 py-2 rounded text-sm font-semibold"
                style={{ background: "var(--accent-primary)", color: "white" }}
              >
                Add Task
              </button>
              <button
                onClick={generatePlan}
                className="ff-btn px-4 py-2 rounded text-sm font-semibold"
                style={{ background: "var(--accent-danger)", color: "white" }}
              >
                {loading ? "Analyzing..." : "Generate AI Plan"}
              </button>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div className="ff-card p-3">
                <p className="text-xs ff-subtle">Open Tasks</p>
                <p className="text-2xl font-bold">{tasks.length}</p>
              </div>
              <div className="ff-card p-3">
                <p className="text-xs ff-subtle">Points</p>
                <p className="text-2xl font-bold">{gamification.totalPoints}</p>
              </div>
            </div>

            <div className="max-h-64 overflow-auto pr-2">
              {tasks.length === 0 ? (
                <p className="text-sm ff-subtle">No tasks yet.</p>
              ) : (
                <ul className="space-y-2 text-sm">
                  {tasks.map((task) => (
                    <li key={task.id} className="ff-card p-2">
                      {task.content}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </article>

          {aiSteps && aiSteps.length > 0 && (
            <article className="ff-card p-5">
              <h3 className="text-lg font-semibold mb-2">Personal AI Plan</h3>
              <ul className="list-decimal pl-5 space-y-1 text-sm">
                {aiSteps.map((step, idx) => (
                  <li key={idx}>{step}</li>
                ))}
              </ul>
            </article>
          )}
        </div>

        <div className="space-y-5">
          <article className="ff-card p-5 space-y-2">
            <h3 className="text-lg font-semibold">Agent Control Center</h3>
            <p className="text-sm ff-subtle">
              Trend: {scoreTrend === "up" ? "Improving" : scoreTrend === "down" ? "Dropping" : "Stable"}
            </p>
            <p className="text-sm ff-subtle">Reliability: {reliabilityScore} | Overdue breaks: {overdueCount}</p>
            <p className="text-sm ff-subtle">
              Responses: Helpful {nudgeStats.helpfulCount} | Not now {nudgeStats.notNowCount}
            </p>
            <div className="max-h-36 overflow-auto pr-2">
              {nudgeHistory.length > 0 ? (
                <ul className="list-disc pl-5 text-xs space-y-1">
                  {nudgeHistory.slice(0, 5).map((item) => (
                    <li key={item.id}>
                      {item.kind === "praise" ? "Praise" : "Nudge"}: {item.message}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs ff-subtle">No nudge history yet.</p>
              )}
            </div>
          </article>

          <article className="ff-card p-5 space-y-2">
            <h3 className="text-lg font-semibold">Streaks & Gamification</h3>
            <p className="text-sm ff-subtle">Current streak: {gamification.currentStreak} day(s)</p>
            <p className="text-sm ff-subtle">Longest streak: {gamification.longestStreak} day(s)</p>
            <p className="text-sm ff-subtle">Total points: {gamification.totalPoints}</p>
          </article>

          <article className="ff-card p-5 space-y-2">
            <h3 className="text-lg font-semibold">Smart Scheduling Suggestions</h3>
            {scheduleSuggestions.length === 0 ? (
              <p className="text-sm ff-subtle">No suggestions yet.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {scheduleSuggestions.map((slot) => (
                  <li key={slot.id} className="ff-card p-2">
                    <p className="font-semibold">{slot.label}</p>
                    <p className="ff-subtle">{slot.start} • {slot.durationMin} min</p>
                    <p className="ff-subtle">{slot.reason}</p>
                  </li>
                ))}
              </ul>
            )}
          </article>

          <article className="ff-card p-5 space-y-2">
            <h3 className="text-lg font-semibold">Privacy Controls</h3>
            <p className="text-sm ff-subtle">Export your data or clear personal productivity data.</p>
            <div className="flex gap-2">
              <button
                onClick={() => void exportPrivacyData()}
                disabled={privacyBusy}
                className="ff-btn ff-btn-ghost px-3 py-2 rounded text-xs font-semibold"
                style={{ background: "var(--surface-2)", border: "1px solid var(--card-border)" }}
              >
                Export Data
              </button>
              <button
                onClick={() => void deleteMyData()}
                disabled={privacyBusy}
                className="ff-btn px-3 py-2 rounded text-xs font-semibold"
                style={{ background: "var(--accent-danger)", color: "white" }}
              >
                Clear My Data
              </button>
            </div>
          </article>
        </div>
      </section>
    </div>
  );
}
