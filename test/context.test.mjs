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

test("findFoldRange folds after first todo result through before second-to-last todo call", () => {
  const messages = [
    { role: "user", content: "start" },
    toolCall("a"),
    toolResult("a"),
    { role: "assistant", content: [{ type: "text", text: "large work" }] },
    { role: "toolResult", toolName: "bash", toolCallId: "bash-1", content: "noise" },
    toolCall("b"),
    toolResult("b"),
    toolCall("c"),
    toolResult("c"),
  ];

  assert.deepEqual(findFoldRange(messages), { firstResult: 2, lastCallStart: 5 });
});

test("projectMagicTodoMessages replaces middle context with backlog projection excluding latest entry", () => {
  const messages = [
    { role: "user", content: "start" },
    toolCall("a"),
    toolResult("a", "initial raw"),
    { role: "assistant", content: [{ type: "text", text: "hidden work" }] },
    toolCall("b"),
    toolResult("b", "middle state"),
    toolCall("c"),
    toolResult("c", "latest state"),
  ];
  
  const backlog = [
    { sequence: 1, timestamp: "t", report: "Implemented parser." },
    { sequence: 2, timestamp: "t", report: "Fixed bug." },
    { sequence: 3, timestamp: "t", report: "Added tests." },
  ];
  
  const projected = projectMagicTodoMessages(messages, backlog);

  assert.equal(projected.length, 7);
  assert.equal(projected[2].role, "toolResult");
  assert.equal(projected[2].toolCallId, "a");
  
  const backlogText = projected[2].content[0].text;
  assert.match(backlogText, /Implemented parser/);
  assert.match(backlogText, /Fixed bug/);
  assert.doesNotMatch(backlogText, /Added tests/);
  
  assert.equal(projected[3].role, "assistant");
  assert.equal(projected[3].content[0].type, "toolCall");
  assert.equal(projected[4].toolCallId, "b");
  assert.equal(projected.some(message => JSON.stringify(message).includes("hidden work")), false);
});

test("projectMagicTodoMessages preserves folded user prompts in backlog projection", () => {
  const messages = [
    { role: "user", content: "start" },
    toolCall("a"),
    toolResult("a", "initial raw"),
    { role: "user", content: "请修复这个 bug" },
    { role: "assistant", content: [{ type: "text", text: "hidden work" }] },
    { role: "user", content: "再帮我优化一下" },
    toolCall("b"),
    toolResult("b", "middle state"),
    toolCall("c"),
    toolResult("c", "latest state"),
  ];

  const backlog = [
    { sequence: 1, timestamp: "t", report: "Implemented parser." },
    { sequence: 2, timestamp: "t", report: "Fixed bug." },
  ];

  const projected = projectMagicTodoMessages(messages, backlog);

  assert.equal(projected.length, 7);
  assert.equal(projected[2].role, "toolResult");
  assert.equal(projected[2].toolCallId, "a");

  const backlogText = projected[2].content[0].text;
  assert.match(backlogText, /用户在工作期间发送的消息/);
  assert.match(backlogText, /请修复这个 bug/);
  assert.match(backlogText, /再帮我优化一下/);
  assert.match(backlogText, /Implemented parser/);
  assert.doesNotMatch(backlogText, /Fixed bug/);
  assert.doesNotMatch(backlogText, /hidden work/);
});

test("projectMagicTodoCompactionMessages just calls projectMagicTodoMessages", () => {
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

  assert.equal(projected, messages);
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
