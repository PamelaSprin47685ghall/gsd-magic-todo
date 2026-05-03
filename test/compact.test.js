import test from "node:test";
import assert from "node:assert/strict";
import { createProjectedCompactionPreparation } from "../src/compact.js";

const toolCall = id => ({
  role: "assistant",
  content: [{ type: "toolCall", id, name: "manage_todo_list", arguments: { operation: "write" } }],
  timestamp: id,
});

const toolResult = (id, text = "ok") => ({
  role: "toolResult",
  toolName: "manage_todo_list",
  toolCallId: id,
  content: [{ type: "text", text }],
  timestamp: `${id}-result`,
});

const preparation = messagesToSummarize => ({
  firstKeptEntryId: "keep-1",
  messagesToSummarize,
  turnPrefixMessages: [],
  isSplitTurn: false,
  tokensBefore: 1000,
  fileOps: { read: new Set(), edited: new Set() },
  settings: { enabled: true, reserveTokens: 1000, keepRecentTokens: 100 },
});

test("createProjectedCompactionPreparation returns null without backlog", () => {
  assert.equal(createProjectedCompactionPreparation(preparation([]), [], []), null);
});

test("createProjectedCompactionPreparation folds summarize messages using branch-level todo history", () => {
  const prep = preparation([
    { role: "user", content: "start" },
    toolCall("a"),
    toolResult("a", "initial raw"),
    { role: "assistant", content: [{ type: "text", text: "discard me" }] },
    toolCall("b"),
    toolResult("b", "middle"),
    toolCall("c"),
    toolResult("c", "latest")
  ]);
  const branchEntries = [
    { type: "message", message: toolResult("a") },
    { type: "message", message: toolResult("b") },
    { type: "message", message: toolResult("c") },
  ];

  const projected = createProjectedCompactionPreparation(
    prep,
    [
      { sequence: 1, timestamp: "t", report: "Earlier work." },
      { sequence: 2, timestamp: "t", report: "Backlog report." },
    ],
    branchEntries,
  );

  assert.ok(projected);
  assert.equal(projected.firstKeptEntryId, "keep-1");
  assert.equal(projected.messagesToSummarize.length, 7);
  assert.match(projected.messagesToSummarize[2].content[0].text, /Earlier work/);
  assert.doesNotMatch(projected.messagesToSummarize[2].content[0].text, /Backlog report/);
  assert.equal(projected.messagesToSummarize.some(message => JSON.stringify(message).includes("discard me")), false);
  assert.equal(projected.details.magicTodoProjected, true);
});

test("createProjectedCompactionPreparation returns null when projection changes nothing", () => {
  const prep = preparation([{ role: "user", content: "start" }]);
  assert.equal(createProjectedCompactionPreparation(prep, [{ sequence: 1, report: "x" }], []), null);
});
