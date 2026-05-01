import { runProjectedOfficialCompaction } from "./src/compact.js";
import { projectMagicTodoMessages } from "./src/context.js";
import { createTodoState } from "./src/state.js";
import { createManageTodoListTool } from "./src/tool.js";

export default function magicTodoPlugin(pi) {
  const state = createTodoState();

  const restore = (eventName, ctx) => {
    state.restoreFromBranch(ctx?.sessionManager?.getBranch?.() || []);
    ctx?.ui?.notify?.(
      `magic-todo: ${eventName} restored ${state.readTodos().length} todos and ${state.readBacklog().length} backlog reports.`,
      "info",
    );
  };

  for (const eventName of ["session_start", "session_switch", "session_fork", "session_tree"]) {
    pi.on(eventName, (_event, ctx) => restore(eventName, ctx));
  }

  pi.on("context", event => {
    const messages = Array.isArray(event.messages) ? event.messages : [];
    return { messages: projectMagicTodoMessages(messages, state.readBacklog()) };
  });

  pi.on("session_before_compact", async (event, ctx) => {
    return runProjectedOfficialCompaction(event, ctx, state.readBacklog());
  });

  pi.registerTool(createManageTodoListTool(state, pi));
}

export { createTodoState, createManageTodoListTool, projectMagicTodoMessages };
