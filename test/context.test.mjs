import test from "node:test";
import assert from "node:assert/strict";
import { buildBacklogText, findFoldRange, projectMagicTodoCompactionMessages, projectMagicTodoMessages, restoreBacklogFromBranch } from "../src/context.js";

const toolCall = (id, extra = {}) => ({
  role: "assistant",
  content: [{ type: "toolCall", id, name: "manage_todo_list", arguments: { operation: "write" } }],
  timestamp: extra.timestamp ?? id,
});

const toolResult = (id, text = "ok") => ({
  role: "toolResult",
  toolName: "manage_todo_list",
  toolCallId: id,
  content: [{ type: "text", text }],
  timestamp: `${id}-result`,
});

test("findFoldRange folds after first todo result through before last todo call", () => {
  const messages = [
    { role: "user", content: "start" },
    toolCall("a"),
    toolResult("a"),
    { role: "assistant", content: [{ type: "text", text: "large work" }] },
    { role: "toolResult", toolName: "bash", toolCallId: "bash-1", content: "noise" },
    toolCall("b"),
    toolResult("b"),
  ];

  assert.deepEqual(findFoldRange(messages), { firstResult: 2, lastCallStart: 5 });
});

test("projectMagicTodoMessages replaces middle context with backlog projection", () => {
  const messages = [
    { role: "user", content: "start" },
    toolCall("a"),
    toolResult("a", "initial raw"),
    { role: "assistant", content: [{ type: "text", text: "hidden work" }] },
    toolCall("b"),
    toolResult("b", "latest state"),
  ];
  const projected = projectMagicTodoMessages(messages, [{ sequence: 1, timestamp: "t", report: "Implemented parser." }]);

  assert.equal(projected.length, 5);
  assert.equal(projected[2].role, "toolResult");
  assert.equal(projected[2].toolCallId, "a");
  assert.match(projected[2].content[0].text, /Implemented parser/);
  assert.equal(projected[3].role, "assistant");
  assert.equal(projected[3].content[0].type, "toolCall");
  assert.equal(projected[4].toolCallId, "b");
  assert.equal(projected.some(message => JSON.stringify(message).includes("hidden work")), false);
});

test("projectMagicTodoMessages leaves history unchanged with fewer than two todo results", () => {
  const messages = [{ role: "user", content: "start" }, toolCall("a"), toolResult("a")];
  assert.equal(projectMagicTodoMessages(messages, []), messages);
});

test("projectMagicTodoCompactionMessages can fold a summarized prefix when latest todo is kept", () => {
  const messages = [
    { role: "user", content: "start" },
    toolCall("a"),
    toolResult("a", "initial raw"),
    { role: "assistant", content: [{ type: "text", text: "large discarded middle" }] },
    { role: "toolResult", toolName: "bash", toolCallId: "bash-1", content: [{ type: "text", text: "discarded output" }] },
  ];

  const projected = projectMagicTodoCompactionMessages(
    messages,
    [{ sequence: 1, timestamp: "t", report: "Completed work report." }],
    { foldAfterFirstTodoResult: true },
  );

  assert.equal(projected.length, 3);
  assert.match(projected[2].content[0].text, /Completed work report/);
  assert.equal(projected.some(message => JSON.stringify(message).includes("large discarded middle")), false);
});

test("restoreBacklogFromBranch reads append-only custom entries", () => {
  const backlog = restoreBacklogFromBranch([
    { type: "custom", customType: "other", data: { report: "no" } },
    { type: "custom", customType: "magic-todo-backlog-entry", data: { sequence: 3, timestamp: "now", report: " done " } },
  ]);

  assert.deepEqual(backlog, [{ id: "restored-1", sequence: 3, timestamp: "now", report: "done", stats: undefined }]);
});

test("buildBacklogText handles empty backlog", () => {
  assert.match(buildBacklogText([]), /当前还没有/);
});
