"use client";

import { useState, useEffect } from "react";
import GhostInput from "@/components/GhostInput";

export default function TasksPage() {
  const [taskInput, setTaskInput] = useState("");
  const [tasks, setTasks] = useState<string[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      const stored = sessionStorage.getItem("focusflow-tasks");
      return stored ? (JSON.parse(stored) as string[]) : [];
    } catch {
      return [];
    }
  });
  const [aiPlan, setAiPlan] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    return sessionStorage.getItem("focusflow-ai-plan");
  });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    sessionStorage.setItem("focusflow-tasks", JSON.stringify(tasks));
  }, [tasks]);

  const addTask = () => {
    if (!taskInput.trim()) return;
    setTasks((prev) => [...prev, taskInput.trim()]);
    setTaskInput("");
  };

  const askAI = async () => {
    setLoading(true);
    setAiPlan(null);

    const res = await fetch("/api/ai-planner", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tasks }),
    });

    const data = await res.json();
    setAiPlan(data.plan);
    sessionStorage.setItem("focusflow-ai-plan", data.plan);
    setLoading(false);
  };

  return (
    <div className="space-y-6">
      <section
        className="ff-card p-5"
        style={{
          background:
            "linear-gradient(155deg, color-mix(in srgb, var(--surface) 92%, transparent) 0%, color-mix(in srgb, var(--accent-primary) 8%, var(--surface)) 100%)",
        }}
      >
        <h2 className="text-2xl font-bold">Your Daily Tasks</h2>
        <p className="text-sm ff-subtle">Capture tasks and generate an AI day plan in one place.</p>
      </section>

      <section className="ff-card p-5 space-y-3">
        <label className="text-sm ff-subtle">Add task</label>
        <div className="flex gap-2">
          <GhostInput
            value={taskInput}
            onChange={setTaskInput}
            placeholder="Add a task..."
            className="flex-1 rounded-md px-3 py-2 text-sm"
            style={{ background: "var(--surface-2)", border: "1px solid var(--card-border)" }}
          />
          <button
            onClick={addTask}
            className="ff-btn ff-btn-primary rounded-md px-4 py-2 text-sm font-medium"
          >
            Add
          </button>
        </div>
      </section>

      {tasks.length > 0 && (
        <section className="ff-card rounded-md p-4 space-y-2">
          <h3 className="text-lg font-semibold">Your Tasks</h3>
          <ul className="list-disc pl-5 space-y-1 text-sm ff-subtle">
            {tasks.map((t, i) => (
              <li key={i}>{t}</li>
            ))}
          </ul>
        </section>
      )}

      {tasks.length > 0 && (
        <button
          onClick={askAI}
          className="ff-btn rounded-md px-4 py-2 text-sm font-medium"
          style={{ background: "var(--accent-success)", color: "white" }}
        >
          {loading ? "Thinking..." : "Ask AI to Plan My Day"}
        </button>
      )}

      {aiPlan && (
        <section className="ff-card rounded-md p-4 space-y-2 mt-4">
          <h3 className="text-lg font-semibold" style={{ color: "var(--accent-primary)" }}>AI Plan</h3>
          <p className="text-sm whitespace-pre-line ff-subtle">{aiPlan}</p>
        </section>
      )}
    </div>
  );
}
