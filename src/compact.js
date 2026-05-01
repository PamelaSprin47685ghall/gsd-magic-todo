import { isTodoToolResult, projectMagicTodoCompactionMessages } from "./context.js";

async function importOfficialCompaction() {
  try {
    return await import("@gsd/pi-coding-agent");
  } catch (_err) {
    try {
      return await import("@mariozechner/pi-coding-agent");
    } catch (_fallbackErr) {
      return null;
    }
  }
}

function countTodoResultsInBranch(branchEntries) {
  let count = 0;
  for (const entry of branchEntries || []) {
    if (entry?.type === "message" && isTodoToolResult(entry.message)) count++;
  }
  return count;
}

function sameArrayItems(left, right) {
  return left.length === right.length && left.every((item, index) => item === right[index]);
}

function projectMessages(messages, backlog, branchHasFoldableTodoHistory) {
  return projectMagicTodoCompactionMessages(messages || [], backlog, {
    foldAfterFirstTodoResult: branchHasFoldableTodoHistory,
  });
}

export function createProjectedCompactionPreparation(preparation, backlog, branchEntries) {
  if (!preparation || !Array.isArray(backlog) || backlog.length === 0) return null;

  const branchHasFoldableTodoHistory = countTodoResultsInBranch(branchEntries) >= 2;
  const messagesToSummarize = projectMessages(
    preparation.messagesToSummarize,
    backlog,
    branchHasFoldableTodoHistory,
  );
  const turnPrefixMessages = projectMessages(
    preparation.turnPrefixMessages,
    backlog,
    branchHasFoldableTodoHistory,
  );

  if (
    sameArrayItems(messagesToSummarize, preparation.messagesToSummarize || []) &&
    sameArrayItems(turnPrefixMessages, preparation.turnPrefixMessages || [])
  ) {
    return null;
  }

  return {
    ...preparation,
    messagesToSummarize,
    turnPrefixMessages,
    details: {
      ...(preparation.details || {}),
      magicTodoProjected: true,
      magicTodoBacklogEntries: backlog.length,
    },
  };
}

export async function runProjectedOfficialCompaction(event, ctx, backlog) {
  const preparation = createProjectedCompactionPreparation(event?.preparation, backlog, event?.branchEntries);
  if (!preparation) return undefined;

  const official = await importOfficialCompaction();
  if (typeof official?.compact !== "function") {
    ctx?.ui?.notify?.("magic-todo: official compact() is unavailable; falling back to normal compaction.", "warning");
    return undefined;
  }

  const model = ctx?.model;
  if (!model) {
    ctx?.ui?.notify?.("magic-todo: model unavailable for projected compaction; falling back to normal compaction.", "warning");
    return undefined;
  }

  const apiKey = await ctx?.modelRegistry?.getApiKey?.(model);
  const result = await official.compact(
    preparation,
    model,
    apiKey,
    event?.customInstructions,
    event?.signal,
  );

  return {
    compaction: {
      ...result,
      details: {
        ...(result.details || {}),
        magicTodoProjected: true,
        magicTodoBacklogEntries: backlog.length,
      },
    },
  };
}
