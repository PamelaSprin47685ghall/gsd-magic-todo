export const TODO_TOOL_NAME = "manage_todo_list";
export const BACKLOG_ENTRY_TYPE = "magic-todo-backlog-entry";

export function getMessageText(content) {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map(block => {
      if (!block) return "";
      if (typeof block.text === "string") return block.text;
      if (typeof block.thinking === "string") return block.thinking;
      return "";
    })
    .filter(Boolean)
    .join("\n");
}

export function messageId(message) {
  if (message?.id) return String(message.id);
  if (message?.role === "toolResult" && message.toolCallId) return `tool:${message.toolCallId}`;
  if (message?.timestamp !== undefined) return `${message.role}:${message.timestamp}`;
  return JSON.stringify({ role: message?.role, toolCallId: message?.toolCallId, content: message?.content });
}

export function isTodoToolResult(message) {
  return message?.role === "toolResult" && message.toolName === TODO_TOOL_NAME;
}

export function normalizeBacklogEntry(entry, index) {
  if (!entry || typeof entry !== "object") return null;
  const report = typeof entry.report === "string" ? entry.report.trim() : "";
  if (!report) return null;
  return {
    id: typeof entry.id === "string" && entry.id ? entry.id : `restored-${index + 1}`,
    sequence: Number.isFinite(entry.sequence) ? entry.sequence : index + 1,
    timestamp: typeof entry.timestamp === "string" ? entry.timestamp : "",
    report,
    stats: entry.stats && typeof entry.stats === "object" ? entry.stats : undefined,
  };
}

export function buildBacklogText(backlog) {
  if (!backlog.length) {
    return "【Magic Todo Backlog】\n当前还没有已完成工作报告。";
  }

  const reports = backlog.map(entry => {
    const header = `#${entry.sequence}${entry.timestamp ? ` · ${entry.timestamp}` : ""}`;
    return `${header}\n${entry.report}`;
  });

  return `[已完成并折叠的工作记录] 以下报告来自被折叠的旧轮次，相关文件已写入磁盘\n${reports.join("\n\n---\n\n")}`;
}

export function todoToolCallIds(message) {
  if (message?.role !== "assistant" || !Array.isArray(message.content)) return [];
  return message.content
    .filter(block => block?.type === "toolCall" && (block.name === TODO_TOOL_NAME || block.toolName === TODO_TOOL_NAME))
    .map(block => block.id || block.toolCallId)
    .filter(Boolean);
}

function findToolCallMessageIndex(messages, toolCallId, beforeIndex) {
  for (let index = beforeIndex - 1; index >= 0; index--) {
    if (todoToolCallIds(messages[index]).includes(toolCallId)) return index;
  }

  for (let index = beforeIndex - 1; index >= 0; index--) {
    if (todoToolCallIds(messages[index]).length > 0) return index;
  }

  return beforeIndex;
}

export function findFoldRange(messages) {
  const todoResultIndexes = [];
  for (let index = 0; index < messages.length; index++) {
    if (isTodoToolResult(messages[index])) todoResultIndexes.push(index);
  }

  if (todoResultIndexes.length < 3) return null;

  const firstResult = todoResultIndexes[0];
  const secondToLastResult = todoResultIndexes[todoResultIndexes.length - 2];
  const secondToLastCallStart = findToolCallMessageIndex(messages, messages[secondToLastResult].toolCallId, secondToLastResult);
  if (secondToLastCallStart <= firstResult) return null;

  return { firstResult, lastCallStart: secondToLastCallStart };
}

function backlogProjectionMessage(sourceMessage, backlog) {
  return {
    id: "magic-todo-backlog-projection",
    role: "toolResult",
    toolCallId: sourceMessage.toolCallId,
    toolName: TODO_TOOL_NAME,
    content: [{ type: "text", text: buildBacklogText(backlog) }],
    details: { magicTodoProjection: true, entries: backlog.length },
    timestamp: sourceMessage.timestamp,
  };
}

function projectRange(messages, backlog, firstResult, lastCallStart) {
  const projected = [];
  const backlogMessage = backlogProjectionMessage(messages[firstResult], backlog);

  for (let index = 0; index < messages.length; index++) {
    if (index === firstResult) {
      projected.push(backlogMessage);
      continue;
    }

    if (index > firstResult && index < lastCallStart) continue;
    projected.push(messages[index]);
  }

  return projected;
}

export function projectMagicTodoMessages(messages, backlog) {
  const range = findFoldRange(messages);
  if (!range) return messages;

  const foldedBacklog = backlog.length > 0 ? backlog.slice(0, -1) : backlog;

  return projectRange(messages, foldedBacklog, range.firstResult, range.lastCallStart);
}

export function projectMagicTodoCompactionMessages(messages, backlog, options = {}) {
  return projectMagicTodoMessages(messages, backlog);
}

export function restoreBacklogFromBranch(branchEntries) {
  const backlog = [];
  for (const entry of branchEntries || []) {
    if (entry?.type !== "custom" || entry.customType !== BACKLOG_ENTRY_TYPE) continue;
    const normalized = normalizeBacklogEntry(entry.data, backlog.length);
    if (normalized) backlog.push(normalized);
  }
  return backlog;
}
