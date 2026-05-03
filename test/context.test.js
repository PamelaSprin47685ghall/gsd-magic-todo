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

  assert.deepEqual(findFoldRange(messages), { firstResult: 2, lastCallStart: 5, firstCallStart: 1 });
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
  // Prefix fold: user "start" folded into synthetic user message with backlog #1
  assert.equal(projected[0].role, "user");
  assert.equal(projected[0].magicTodoPrefixProjection, true);
  assert.match(projected[0].content[0].text, /用户在工作期间发送的消息/);
  assert.match(projected[0].content[0].text, /start/);
  assert.match(projected[0].content[0].text, /Implemented parser/);

  // Middle fold: first todo result replaced by backlog projection
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
  // Prefix fold: user "start" folded into synthetic user message with backlog #1
  assert.equal(projected[0].role, "user");
  assert.equal(projected[0].magicTodoPrefixProjection, true);
  assert.match(projected[0].content[0].text, /用户在工作期间发送的消息/);
  assert.match(projected[0].content[0].text, /start/);

  // Middle fold: first todo result replaced by backlog projection with user prompts
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

test("projectMagicTodoMessages folds prefix before first todo call with user prompts", () => {
  const messages = [
    { role: "user", content: "帮我写一个工具" },
    { role: "assistant", content: [{ type: "text", text: "我先用 todo 管理" }] },
    toolCall("x"),
    toolResult("x", "init"),
    { role: "assistant", content: [{ type: "text", text: "做了很多工作" }] },
    toolCall("y"),
    toolResult("y", "mid"),
    toolCall("z"),
    toolResult("z", "done"),
  ];

  const backlog = [
    { sequence: 10, timestamp: "t", report: "Before start: scoped tool." },
    { sequence: 11, timestamp: "t", report: "Implemented features." },
  ];

  const projected = projectMagicTodoMessages(messages, backlog);
  assert.equal(projected.length, 7);

  // Prefix: user "帮我写一个工具" folded with backlog #10
  assert.equal(projected[0].role, "user");
  assert.equal(projected[0].magicTodoPrefixProjection, true);
  const prefixText = projected[0].content[0].text;
  assert.match(prefixText, /用户在工作期间发送的消息/);
  assert.match(prefixText, /帮我写一个工具/);
  assert.match(prefixText, /Before start/);

  // Middle fold: first result replaced with folded backlog (excludes #11)
  assert.equal(projected[2].role, "toolResult");
  const backlogText = projected[2].content[0].text;
  assert.match(backlogText, /Before start/);
  assert.doesNotMatch(backlogText, /Implemented features/);
});

test("findFoldRange ignores failed todo results (isError: true)", () => {
  const messages = [
    { role: "user", content: "start" },
    toolCall("a"),
    toolResult("a"),       // successful
    { role: "assistant", content: [{ type: "text", text: "work" }] },
    toolCall("fail"),
    { role: "toolResult", toolName: "manage_todo_list", toolCallId: "fail", content: [{ type: "text", text: "Validation failed" }], isError: true },
    { role: "assistant", content: [{ type: "text", text: "retry work" }] },
    toolCall("b"),
    toolResult("b"),       // successful
    toolCall("c"),
    toolResult("c"),       // successful
  ];

  // Only 3 successful results (a, b, c) — failed "fail" result is invisible.
  // Fold range: firstResult=a(2), secondToLastResult=b(8), lastCallStart=b-call(7), firstCallStart=a-call(1)
  assert.deepEqual(findFoldRange(messages), { firstResult: 2, lastCallStart: 7, firstCallStart: 1 });
});

test("projectMagicTodoMessages hides failed todo call+result pairs entirely", () => {
  const messages = [
    { role: "user", content: "start" },
    toolCall("a"),
    toolResult("a", "ok"),
    { role: "assistant", content: [{ type: "text", text: "hidden between a and b" }] },
    toolCall("fail"),
    { role: "toolResult", toolName: "manage_todo_list", toolCallId: "fail", content: [{ type: "text", text: "Validation failed" }], isError: true },
    { role: "assistant", content: [{ type: "text", text: "also hidden" }] },
    toolCall("b"),
    toolResult("b", "mid"),
    toolCall("c"),
    toolResult("c", "done"),
  ];

  const backlog = [
    { sequence: 1, timestamp: "t", report: "Did a thing." },
    { sequence: 2, timestamp: "t", report: "Did another." },
    { sequence: 3, timestamp: "t", report: "Final." },
  ];

  const projected = projectMagicTodoMessages(messages, backlog);

  const projectedJson = JSON.stringify(projected);
  // The prefix projection includes an error notice for the failed operation
  // via buildErrorNotice, so "Validation failed" appears as the error content.
  assert.ok(projectedJson.includes("Validation failed"), "error notice should surface the last error text");
  // The assistant messages that only contain the failed call should be hidden.
  assert.doesNotMatch(projectedJson, /hidden between a and b/);
  assert.doesNotMatch(projectedJson, /also hidden/);
});
