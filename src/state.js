import { BACKLOG_ENTRY_TYPE, TODO_TOOL_NAME } from "./context.js";

export const TODO_STATUSES = new Set(["not-started", "in-progress", "completed"]);

export function createTodoState() {
  const state = {
    todos: [],
    backlog: [],
  };

  function readTodos() {
    return state.todos.map(todo => ({ ...todo }));
  }

  function readBacklog() {
    return state.backlog.map(entry => ({ ...entry, stats: entry.stats ? { ...entry.stats } : undefined }));
  }

  function getStats(todos = state.todos) {
    return {
      total: todos.length,
      completed: todos.filter(todo => todo.status === "completed").length,
      inProgress: todos.filter(todo => todo.status === "in-progress").length,
      notStarted: todos.filter(todo => todo.status === "not-started").length,
    };
  }

  function validateTodos(todos) {
    const errors = [];
    if (!Array.isArray(todos)) return ["todoList must be an array"];

    todos.forEach((todo, index) => {
      const item = `Item ${index + 1}`;
      if (!todo || typeof todo !== "object") {
        errors.push(`${item}: must be an object`);
        return;
      }
      if (!Number.isInteger(todo.id) || todo.id < 1) errors.push(`${item}: id must be a positive integer`);
      if (typeof todo.title !== "string" || !todo.title.trim()) errors.push(`${item}: title is required`);
      if (typeof todo.description !== "string" || !todo.description.trim()) errors.push(`${item}: description is required`);
      if (!TODO_STATUSES.has(todo.status)) errors.push(`${item}: status must be not-started, in-progress, or completed`);
    });

    return errors;
  }

  function writeTodos(todos) {
    state.todos = todos.map(todo => ({
      id: todo.id,
      title: todo.title.trim(),
      description: todo.description.trim(),
      status: todo.status,
    }));
  }

  function appendReport(report, stats, now = new Date()) {
    const entry = {
      id: `${now.getTime()}-${state.backlog.length + 1}`,
      sequence: state.backlog.length + 1,
      timestamp: now.toISOString(),
      report: report.trim(),
      stats,
    };
    state.backlog.push(entry);
    return entry;
  }

  function restoreFromBranch(branchEntries) {
    state.todos = [];
    state.backlog = [];
    let restoredCount = 0;

    for (const entry of branchEntries || []) {
      if (entry?.type === "message") {
        const message = entry.message;
        if (message?.role === "toolResult" && message.toolName === TODO_TOOL_NAME && Array.isArray(message.details?.todos)) {
          state.todos = message.details.todos.map(todo => ({ ...todo }));
        }
      }

      if (entry?.type === "custom" && entry.customType === BACKLOG_ENTRY_TYPE) {
        const data = entry.data;
        if (data && typeof data.report === "string" && data.report.trim()) {
          state.backlog.push({
            id: typeof data.id === "string" ? data.id : `restored-${state.backlog.length + 1}`,
            sequence: Number.isFinite(data.sequence) ? data.sequence : state.backlog.length + 1,
            timestamp: typeof data.timestamp === "string" ? data.timestamp : "",
            report: data.report.trim(),
            stats: data.stats && typeof data.stats === "object" ? data.stats : undefined,
          });
          restoredCount++;
        }
      }
    }

    return restoredCount;
  }

  return {
    readTodos,
    readBacklog,
    getStats,
    validateTodos,
    writeTodos,
    appendReport,
    restoreFromBranch,
  };
}
