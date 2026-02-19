"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import GhostInput from "@/components/GhostInput";

type GroupTask = { id: string; content: string };
type GroupMember = {
  id: string;
  name: string | null;
  email: string | null;
  role: string;
};
type Role = "admin" | "member" | null;

const LAST_GROUP_NAME_KEY = "focusflow-last-group-name";

const normalizeTasks = (tasks: unknown): GroupTask[] => {
  if (!Array.isArray(tasks)) return [];
  return tasks.filter((item): item is GroupTask => {
    if (!item || typeof item !== "object") return false;
    const maybe = item as Partial<GroupTask>;
    return typeof maybe.id === "string" && typeof maybe.content === "string";
  });
};

export default function FocusGroupPage() {
  const router = useRouter();
  const [isHydrated, setIsHydrated] = useState(false);
  const [groupName, setGroupName] = useState("");
  const [activeGroupId, setActiveGroupId] = useState("");
  const [role, setRole] = useState<Role>(null);

  const [task, setTask] = useState("");
  const [sharedTasks, setSharedTasks] = useState<GroupTask[]>([]);
  const [groupMembers, setGroupMembers] = useState<GroupMember[]>([]);
  const [aiPlan, setAiPlan] = useState<string[] | null>(null);
  const [teamSummary, setTeamSummary] = useState("");
  const [agentSuggestions, setAgentSuggestions] = useState<string[]>([]);

  const [joiningGroup, setJoiningGroup] = useState(false);
  const [loadingTasks, setLoadingTasks] = useState(false);
  const [addingTask, setAddingTask] = useState(false);
  const [deletingTaskId, setDeletingTaskId] = useState<string | null>(null);
  const [loadingPlan, setLoadingPlan] = useState(false);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [agentSuggestionsLoading, setAgentSuggestionsLoading] = useState(false);

  const [groupError, setGroupError] = useState<string | null>(null);
  const [planError, setPlanError] = useState<string | null>(null);

  const redirectToSignIn = useCallback(() => {
    const callbackUrl = encodeURIComponent("/focus-group");
    window.location.assign(`/signin?callbackUrl=${callbackUrl}`);
  }, []);

  const loadTasks = useCallback(
    async (groupId: string, showLoading: boolean) => {
      if (!groupId) return;
      if (showLoading) setLoadingTasks(true);

      try {
        const res = await fetch(`/api/group-tasks?groupId=${encodeURIComponent(groupId)}`, {
          cache: "no-store",
        });

        if (!res.ok) {
          if (res.status === 401) {
            redirectToSignIn();
            return;
          }
          const errData = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(errData.error || "Failed to load group tasks");
        }

        const data = (await res.json()) as unknown;
        setSharedTasks(normalizeTasks(data));
      } finally {
        if (showLoading) setLoadingTasks(false);
      }
    },
    [redirectToSignIn],
  );

  const loadMembers = useCallback(
    async (groupId: string) => {
      const normalizedGroupId = groupId.trim();
      if (!normalizedGroupId) return;

      const res = await fetch(`/api/groups/${encodeURIComponent(normalizedGroupId)}/members`, {
        cache: "no-store",
      });

      if (!res.ok) {
        if (res.status === 401) {
          redirectToSignIn();
          return;
        }
        const errData = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(errData.error || "Failed to load group members");
      }

      const data = (await res.json()) as {
        role?: Role;
        members?: GroupMember[];
        latestPlan?: string[];
        latestTeamSummary?: string;
        latestAssignments?: string[];
      };

      if (data.role) setRole(data.role);
      setGroupMembers(Array.isArray(data.members) ? data.members : []);
      setAiPlan(Array.isArray(data.latestPlan) ? data.latestPlan : []);
      setTeamSummary((data.latestTeamSummary || "").trim());
      setAgentSuggestions(Array.isArray(data.latestAssignments) ? data.latestAssignments : []);
    },
    [redirectToSignIn],
  );

  useEffect(() => {
    setIsHydrated(true);
    setGroupName(localStorage.getItem(LAST_GROUP_NAME_KEY) ?? "");
  }, []);

  const handleJoinOrCreateGroup = async () => {
    const normalizedGroupName = groupName.trim();
    if (!normalizedGroupName) return;

    setJoiningGroup(true);
    setGroupError(null);
    setPlanError(null);

    try {
      const res = await fetch("/api/groups/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ groupName: normalizedGroupName }),
      });

      if (!res.ok) {
        if (res.status === 401) {
          redirectToSignIn();
          return;
        }
        const errData = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(errData.error || "Failed to join group");
      }

      const data = (await res.json()) as {
        groupId?: string;
        role?: Role;
        groupName?: string;
      };

      const joinedGroupId = (data.groupId || "").trim();
      if (!joinedGroupId) {
        throw new Error("Invalid group response");
      }

      setActiveGroupId(joinedGroupId);
      setRole(data.role || "member");
      localStorage.setItem(LAST_GROUP_NAME_KEY, data.groupName || normalizedGroupName);
      await loadTasks(joinedGroupId, true);
      await loadMembers(joinedGroupId);
    } catch (err) {
      console.error("Group join error:", err);
      setGroupError((err as Error).message);
    } finally {
      setJoiningGroup(false);
    }
  };

  useEffect(() => {
    if (!isHydrated || !activeGroupId) return;

    const interval = setInterval(() => {
      if (document.visibilityState !== "visible") return;
      loadTasks(activeGroupId, false).catch((err) => {
        console.error("Task sync error:", err);
      });
    }, 5000);

    return () => clearInterval(interval);
  }, [activeGroupId, isHydrated, loadTasks]);

  useEffect(() => {
    if (!activeGroupId) return;
    loadMembers(activeGroupId).catch((err) => {
      console.error("Members sync error:", err);
      setGroupError((err as Error).message);
    });
  }, [activeGroupId, loadMembers]);

  const handleAddTask = async () => {
    const nextTask = task.trim();
    if (!activeGroupId || !nextTask) return;

    setAddingTask(true);
    try {
      const res = await fetch("/api/group-tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ groupId: activeGroupId, content: nextTask }),
      });

      if (!res.ok) {
        if (res.status === 401) {
          redirectToSignIn();
          return;
        }
        const errData = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(errData.error || "Failed to add task");
      }

      await loadTasks(activeGroupId, false);
      setTask("");
      setGroupError(null);
    } catch (err) {
      console.error("Add task error:", err);
      setGroupError((err as Error).message);
    } finally {
      setAddingTask(false);
    }
  };

  const handleDeleteTask = async (taskId: string) => {
    if (!activeGroupId || !taskId) return;

    setDeletingTaskId(taskId);
    try {
      const res = await fetch("/api/group-tasks", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ groupId: activeGroupId, taskId }),
      });

      if (!res.ok) {
        const errData = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(errData.error || "Failed to delete task");
      }

      await loadTasks(activeGroupId, false);
    } catch (err) {
      console.error("Delete task error:", err);
      setGroupError((err as Error).message);
    } finally {
      setDeletingTaskId(null);
    }
  };

  const generateAIPlan = async () => {
    if (!activeGroupId || sharedTasks.length === 0) {
      setPlanError("Join a group and add at least one task first.");
      return;
    }

    setPlanError(null);
    setLoadingPlan(true);

    try {
      const res = await fetch("/api/group-plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          groupId: activeGroupId,
          tasks: sharedTasks.map((t) => t.content),
        }),
      });

      const data = (await res.json()) as { plan?: string[]; error?: string };

      if (!res.ok) {
        if (res.status === 401) {
          redirectToSignIn();
          return;
        }
        setAiPlan([]);
        setPlanError(data.error || "Failed to generate plan.");
        return;
      }

      setAiPlan(Array.isArray(data.plan) ? data.plan : []);
      await loadMembers(activeGroupId);
    } catch (err) {
      console.error("AI plan error:", err);
      setAiPlan([]);
      setPlanError("Failed to generate plan.");
    } finally {
      setLoadingPlan(false);
    }
  };

  const fetchTeamSummary = async () => {
    if (!activeGroupId) {
      setGroupError("Join a group first.");
      return;
    }

    setSummaryLoading(true);
    setGroupError(null);
    try {
      const res = await fetch("/api/team-recaps", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ teamId: activeGroupId }),
      });

      const data = (await res.json().catch(() => ({}))) as { summary?: string; error?: string };
      if (!res.ok) {
        if (res.status === 401) {
          redirectToSignIn();
          return;
        }
        setTeamSummary("");
        setGroupError(data.error || "Failed to summarize team work.");
        return;
      }

      setTeamSummary((data.summary || "").trim() || "No summary available");
      await loadMembers(activeGroupId);
    } catch (err) {
      console.error("Team summary error:", err);
      setTeamSummary("");
      setGroupError("Failed to summarize team work.");
    } finally {
      setSummaryLoading(false);
    }
  };

  const fetchAgentSuggestions = async () => {
    if (!activeGroupId) return;

    setAgentSuggestionsLoading(true);
    setGroupError(null);
    try {
      const res = await fetch("/api/group-agent-suggestions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ groupId: activeGroupId }),
      });
      const data = (await res.json().catch(() => ({}))) as { suggestions?: string[]; error?: string };
      if (!res.ok) {
        setGroupError(data.error || "Failed to generate suggestions.");
        return;
      }
      setAgentSuggestions(Array.isArray(data.suggestions) ? data.suggestions : []);
      await loadMembers(activeGroupId);
    } catch (err) {
      console.error("Agent suggestions error:", err);
      setGroupError("Failed to generate suggestions.");
    } finally {
      setAgentSuggestionsLoading(false);
    }
  };

  return (
    <div className="space-y-5">
      <section className="ff-card p-5 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Focus Group Workspace</h1>
          <p className="text-sm ff-subtle">Collaborate, plan, and execute with shared AI context.</p>
        </div>
        {activeGroupId && (
          <div className="text-sm ff-subtle">
            <p>Group ID: {activeGroupId}</p>
            <p>
              Role: <span className="font-semibold" style={{ color: "var(--text-primary)" }}>{role ?? "member"}</span>
            </p>
          </div>
        )}
      </section>

      <section className="grid gap-5 lg:grid-cols-[1.35fr_1fr]">
        <div className="space-y-5">
          <article className="ff-card p-5 space-y-3">
            <h2 className="text-lg font-semibold">Create or Join Group</h2>
            <div className="flex flex-col md:flex-row gap-2">
              <GhostInput
                className="w-full p-3 rounded border"
                value={groupName}
                onChange={setGroupName}
                placeholder="Enter group name"
              />
              <button
                onClick={() => void handleJoinOrCreateGroup()}
                disabled={joiningGroup}
                className="ff-btn ff-btn-primary px-4 py-2 rounded text-sm font-semibold"
                style={{ background: "var(--accent-primary)", color: "white" }}
              >
                {joiningGroup ? "Joining..." : "Create / Join Group"}
              </button>
              {activeGroupId && (
                <button
                  onClick={() => router.push(`/focus-sessions?groupId=${encodeURIComponent(activeGroupId)}`)}
                  className="ff-btn ff-btn-ghost px-4 py-2 rounded text-sm font-semibold"
                  style={{ background: "var(--surface-2)", border: "1px solid var(--card-border)" }}
                >
                  Open Group Sessions
                </button>
              )}
            </div>
          </article>

          {activeGroupId && (
            <article className="ff-card p-5 space-y-3">
              <h2 className="text-lg font-semibold">Shared Tasks</h2>
              <div className="flex flex-col md:flex-row gap-2">
                <GhostInput
                  className="w-full p-3 rounded border"
                  value={task}
                  onChange={setTask}
                  placeholder="Add task..."
                />
                <button
                  onClick={() => void handleAddTask()}
                  disabled={addingTask}
                  className="ff-btn ff-btn-primary px-4 py-2 rounded text-sm font-semibold"
                  style={{ background: "var(--accent-primary)", color: "white" }}
                >
                  {addingTask ? "Adding..." : "Add"}
                </button>
              </div>

              {loadingTasks && <p className="text-sm ff-subtle">Syncing group tasks...</p>}

              {sharedTasks.length > 0 ? (
                <ul className="space-y-2 max-h-72 overflow-auto pr-2">
                  {sharedTasks.map((t) => (
                    <li key={t.id} className="ff-card p-2 flex justify-between items-center gap-2 text-sm">
                      <span>{t.content}</span>
                      {role === "admin" && (
                        <button
                          onClick={() => void handleDeleteTask(t.id)}
                          disabled={deletingTaskId === t.id}
                          className="text-xs"
                          style={{ color: "var(--accent-danger)" }}
                        >
                          {deletingTaskId === t.id ? "Deleting..." : "Delete"}
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm ff-subtle">No group tasks yet.</p>
              )}
            </article>
          )}
        </div>

        <div className="space-y-5">
          {activeGroupId && (
            <article className="ff-card p-5 space-y-2">
              <h3 className="text-lg font-semibold">AI Coordination</h3>
              <div className="flex flex-wrap gap-2">
                {role === "admin" ? (
                  <button
                    onClick={generateAIPlan}
                    className="ff-btn px-3 py-2 rounded text-sm font-semibold"
                    style={{ background: "var(--accent-danger)", color: "white" }}
                  >
                    {loadingPlan ? "Planning..." : "Generate AI Plan"}
                  </button>
                ) : (
                  <span className="text-xs ff-subtle">Only admins can generate plan. Members see synced output.</span>
                )}
                <button
                  onClick={() => void fetchTeamSummary()}
                  className="ff-btn px-3 py-2 rounded text-sm font-semibold"
                  style={{ background: "var(--accent-success)", color: "white" }}
                >
                  {summaryLoading ? "Summarizing..." : "Get Team AI Summary"}
                </button>
                <button
                  onClick={() => void fetchAgentSuggestions()}
                  className="ff-btn ff-btn-primary px-3 py-2 rounded text-sm font-semibold"
                  style={{ background: "var(--accent-primary)", color: "white" }}
                >
                  {agentSuggestionsLoading ? "Planning..." : "Get AI Task Assignments"}
                </button>
              </div>
            </article>
          )}

          {aiPlan && aiPlan.length > 0 && (
            <article className="ff-card p-5">
              <h3 className="text-lg font-semibold mb-2">Agent Plan</h3>
              <ul className="list-decimal pl-5 space-y-1 text-sm">
                {aiPlan.map((step, idx) => (
                  <li key={idx}>{step}</li>
                ))}
              </ul>
            </article>
          )}

          {teamSummary && (
            <article className="ff-card p-5">
              <h3 className="text-lg font-semibold mb-2">Team Summary</h3>
              <p className="text-sm ff-subtle">{teamSummary}</p>
            </article>
          )}

          {agentSuggestions.length > 0 && (
            <article className="ff-card p-5">
              <h3 className="text-lg font-semibold mb-2">AI Assignment Suggestions</h3>
              <ul className="list-disc pl-5 space-y-1 text-sm">
                {agentSuggestions.map((item, idx) => (
                  <li key={`${idx}-${item}`}>{item}</li>
                ))}
              </ul>
            </article>
          )}

          {groupMembers.length > 0 && (
            <article className="ff-card p-5">
              <h3 className="text-lg font-semibold mb-2">Group Members</h3>
              <ul className="list-disc pl-5 space-y-1 text-sm">
                {groupMembers.map((member) => (
                  <li key={member.id}>
                    {member.name || member.email || "Unknown user"} ({member.role})
                  </li>
                ))}
              </ul>
            </article>
          )}
        </div>
      </section>

      {groupError && <p className="text-sm" style={{ color: "var(--accent-danger)" }}>{groupError}</p>}
      {planError && <p className="text-sm" style={{ color: "var(--accent-danger)" }}>{planError}</p>}
    </div>
  );
}
