type GroupRecord = {
  ownerId: string;
  tasks: string[];
};

type AccessResult =
  | { ok: true; record: GroupRecord }
  | { ok: false; error: "NOT_FOUND" | "FORBIDDEN" };

const globalForGroupTasks = globalThis as unknown as {
  focusflowGroupTasks?: Map<string, GroupRecord>;
};

const groupTasksStore =
  globalForGroupTasks.focusflowGroupTasks ?? new Map<string, GroupRecord>();

if (!globalForGroupTasks.focusflowGroupTasks) {
  globalForGroupTasks.focusflowGroupTasks = groupTasksStore;
}

const getGroupAccess = (groupId: string, userId: string): AccessResult => {
  const record = groupTasksStore.get(groupId);

  if (!record) {
    return { ok: false, error: "NOT_FOUND" };
  }

  if (record.ownerId !== userId) {
    return { ok: false, error: "FORBIDDEN" };
  }

  return { ok: true, record };
};

export const getTasksForGroup = (
  groupId: string,
  userId: string,
): { tasks?: string[]; error?: "NOT_FOUND" | "FORBIDDEN" } => {
  const access = getGroupAccess(groupId, userId);
  if (!access.ok) {
    return { error: access.error };
  }

  return { tasks: access.record.tasks };
};

export const addTaskForGroup = (
  groupId: string,
  userId: string,
  task: string,
): { tasks?: string[]; error?: "FORBIDDEN" } => {
  const existing = groupTasksStore.get(groupId);

  if (!existing) {
    const created: GroupRecord = { ownerId: userId, tasks: [task] };
    groupTasksStore.set(groupId, created);
    return { tasks: created.tasks };
  }

  if (existing.ownerId !== userId) {
    return { error: "FORBIDDEN" };
  }

  const nextTasks = [...existing.tasks, task];
  groupTasksStore.set(groupId, { ...existing, tasks: nextTasks });
  return { tasks: nextTasks };
};

export const setTasksForGroup = (
  groupId: string,
  userId: string,
  tasks: string[],
): { tasks?: string[]; error?: "FORBIDDEN" } => {
  const existing = groupTasksStore.get(groupId);

  if (!existing) {
    groupTasksStore.set(groupId, { ownerId: userId, tasks });
    return { tasks };
  }

  if (existing.ownerId !== userId) {
    return { error: "FORBIDDEN" };
  }

  groupTasksStore.set(groupId, { ...existing, tasks });
  return { tasks };
};
