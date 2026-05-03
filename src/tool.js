import { BACKLOG_ENTRY_TYPE, buildBacklogText } from "./context.js";

function stringEnum(values, description) {
  return { type: "string", enum: values, description };
}

const statusSchema = stringEnum(
  ["not-started", "in-progress", "completed"],
  "not-started: not begun; in-progress: currently being worked; completed: finished with no known blockers",
);

export const ManageTodoListParams = {
  type: "object",
  additionalProperties: false,
  properties: {
    operation: stringEnum(
      ["write", "read"],
      "write replaces the entire todo list; read returns current todos and the append-only completed-work backlog",
    ),
    todoList: {
      type: "array",
      description: "Complete replacement todo list. Required for write; ignored for read.",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          id: { type: "number", description: "Positive integer identifier, usually sequential from 1." },
          title: { type: "string", description: "Concise action-oriented label." },
          description: { type: "string", description: "Implementation notes, paths, or acceptance criteria." },
          status: statusSchema,
        },
        required: ["id", "title", "description", "status"],
      },
    },
    completedWorkReport: {
      type: "string",
      description: "Required for write. A detailed report of the work just completed before this todo update. Must include: 1) what work was done and why, 2) key files read or written (full paths), 3) any gotchas or non-obvious issues discovered, 4) lessons learned or conventions established for future developers. For initial planning, state that no implementation work has completed yet and summarize the plan change. Verbosity is encouraged — vague or one-line reports lose context during folding.",
    },
  },
  required: ["operation"],
};

export const TOOL_DESCRIPTION = `Manage a structured todo list and preserve a compact append-only work backlog.

Use this tool for multi-step coding work. Read the list when resuming, write the complete list when planning or changing status, and keep todo state current.

Critical write rule:
- Every write MUST include completedWorkReport.
- completedWorkReport is the detailed work report stored forever in Magic Todo's append-only backlog. It must contain: what was done and why, key files read/written (full paths), gotchas discovered, and lessons/conventions for future developers.
- Do not batch many completed tasks into one vague report; write after meaningful progress.
- Always provide the full todoList on write. Partial updates are not supported.

Context folding behavior:
- Later turns will see: a synthetic user message (prefix fold) for context before the first todo call, the first todo result as the backlog projection, and the recent todo operations preserved in full context.
- The detailed context between the first and the second-to-last todo calls is folded away, so completedWorkReport must preserve what future turns need.`;

function textResult(text, details, isError = false) {
  return { content: [{ type: "text", text }], details, isError };
}

function formatReadResult(todos, backlog) {
  const todoText = todos.length ? JSON.stringify(todos, null, 2) : "No todos.";
  return `Current todos:\n${todoText}\n\n${buildBacklogText(backlog)}`;
}

export function createManageTodoListTool(state, pi) {
  return {
    name: "manage_todo_list",
    label: "Magic Todo",
    description: TOOL_DESCRIPTION,
    promptSnippet: "Manage todo state with required completed-work reports and automatic backlog context folding.",
    promptGuidelines: [
      "Use manage_todo_list for multi-step work tracking.",
      "Every manage_todo_list write must include completedWorkReport with the work just completed.",
    ],
    parameters: ManageTodoListParams,

    async execute(toolCallId, params, signal) {
      if (signal?.aborted) {
        return textResult("Cancelled.", { operation: params?.operation ?? "unknown", todos: state.readTodos(), backlog: state.readBacklog() }, true);
      }

      if (params?.operation === "read") {
        const todos = state.readTodos();
        const backlog = state.readBacklog();
        return textResult(formatReadResult(todos, backlog), { operation: "read", todos, backlog });
      }

      if (params?.operation !== "write") {
        return textResult("Error: operation must be read or write.", { operation: params?.operation ?? "unknown", todos: state.readTodos(), backlog: state.readBacklog(), error: "invalid operation" }, true);
      }

      const todoErrors = state.validateTodos(params.todoList);
      const report = typeof params.completedWorkReport === "string" ? params.completedWorkReport.trim() : "";
      const errors = [...todoErrors];
      if (!report) errors.push("completedWorkReport is required for every write operation");

      if (errors.length) {
        return textResult(
          `Validation failed:\n${errors.map(error => `  - ${error}`).join("\n")}`,
          { operation: "write", todos: state.readTodos(), backlog: state.readBacklog(), error: errors.join("; ") },
          true,
        );
      }

      state.writeTodos(params.todoList);
      const todos = state.readTodos();
      const stats = state.getStats(todos);
      const entry = state.appendReport(report, stats);

      pi.appendEntry?.(BACKLOG_ENTRY_TYPE, {
        ...entry,
        toolCallId,
        todos,
      });

      const backlog = state.readBacklog();
      return textResult(
        `Todos updated. ${stats.completed}/${stats.total} completed. Work report appended to Magic Todo backlog as #${entry.sequence}.`,
        { operation: "write", todos, backlog, appendedReport: entry },
      );
    },
  };
}
