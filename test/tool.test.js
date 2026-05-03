import test from "node:test";
import assert from "node:assert/strict";
import magicTodoPlugin from "../index.js";
import { createTodoState } from "../src/state.js";
import { createManageTodoListTool } from "../src/tool.js";

const todo = (status = "not-started") => ({
  id: 1,
  title: "Inspect project",
  description: "Read the relevant files.",
  status,
});

test("plugin registers required hooks and manage_todo_list tool", () => {
  const handlers = {};
  const tools = [];
  magicTodoPlugin({
    on: (event, handler) => { handlers[event] = handler; },
    registerTool: tool => tools.push(tool),
    appendEntry: () => {},
  });

  assert.equal(typeof handlers.session_start, "function");
  assert.equal(typeof handlers.session_switch, "function");
  assert.equal(typeof handlers.session_fork, "function");
  assert.equal(typeof handlers.session_tree, "function");
  assert.equal(typeof handlers.context, "function");
  assert.equal(typeof handlers.session_before_compact, "function");
  assert.equal(tools.length, 1);
  assert.equal(tools[0].name, "manage_todo_list");
});

test("write requires completedWorkReport", async () => {
  const tool = createManageTodoListTool(createTodoState(), { appendEntry: () => {} });
  const result = await tool.execute("call-1", { operation: "write", todoList: [todo()] });

  assert.equal(result.isError, true);
  assert.match(result.content[0].text, /work report/);
});

test("write stores todo state and appends report", async () => {
  const appended = [];
  const state = createTodoState();
  const tool = createManageTodoListTool(state, { appendEntry: (type, data) => appended.push({ type, data }) });
  const result = await tool.execute("call-1", {
    operation: "write",
    todoList: [todo("completed")],
    completedWorkReport: "Inspected the project structure and found the extension pattern.",
  });

  assert.equal(result.isError, false);
  assert.equal(result.details.todos[0].status, "completed");
  assert.equal(result.details.backlog.length, 1);
  assert.equal(appended.length, 1);
  assert.equal(appended[0].type, "magic-todo-backlog-entry");
  assert.match(appended[0].data.report, /Inspected/);
});

test("read returns current todos and backlog", async () => {
  const state = createTodoState();
  const tool = createManageTodoListTool(state, { appendEntry: () => {} });
  await tool.execute("call-1", {
    operation: "write",
    todoList: [todo("completed")],
    completedWorkReport: "Completed setup.",
  });

  const result = await tool.execute("call-2", { operation: "read" });
  assert.match(result.content[0].text, /Current todos/);
  assert.match(result.content[0].text, /Completed setup/);
  assert.equal(result.details.backlog.length, 1);
});

test("state restores latest todos and backlog from branch", () => {
  const state = createTodoState();
  state.restoreFromBranch([
    {
      type: "message",
      message: {
        role: "toolResult",
        toolName: "manage_todo_list",
        details: { todos: [todo("in-progress")] },
      },
    },
    {
      type: "custom",
      customType: "magic-todo-backlog-entry",
      data: { id: "entry-1", sequence: 1, timestamp: "now", report: "Started work." },
    },
  ]);

  assert.equal(state.readTodos()[0].status, "in-progress");
  assert.equal(state.readBacklog()[0].report, "Started work.");
});
