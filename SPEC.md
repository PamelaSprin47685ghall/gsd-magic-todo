# Magic Todo Spec

Version: `5.1.0`.

`README.md` explains usage. This file defines the fold contract, backlog projection, compaction, and compatibility contract.

## Public surface

| Capability | Names |
|---|---|
| Tools | `manage_todo_list` |
| Hooks | `session_start`, `session_switch`, `session_fork`, `session_tree`, `context`, `session_before_compact` |
| Commands | none |

## Fold contract

Magic Todo folds conversation history by replacing a range of todo-related messages with a compact projection.

### Fold range

`findFoldRange(messages)` identifies the foldable range:

1. Collects all `manage_todo_list` tool result positions.
2. If there are fewer than 3 results, no fold occurs (not enough history to compress).
3. The fold range spans from the first result's call start to the second-to-last result's call start.
4. If the call start cannot be located (`findToolCallMessageIndex` returns -1), the fold is skipped safely — no data corruption.

### Fold operation

Within the fold range:
- `manage_todo_list` results are replaced with backlog projection messages.
- Assistant messages that contain only tool calls within the fold range are elided.
- All other messages (user, non-todo tool results, etc.) are preserved.

Rules:
- Fold never drops the last `manage_todo_list` result — the agent always sees the most recent state.
- Fold must not corrupt message ordering.
- If `findFoldRange` returns `null`, the original messages are returned unchanged.

## Backlog projection

The backlog projection message replaces folded todo results with a summary:

- Active items are listed with their current status.
- Completed items are summarized in an append-only section.
- The projection carries `details: { magicTodoProjection: true }` so downstream hooks can identify it.

## Compaction preparation

On `session_before_compact`, Magic Todo:

1. Checks if the branch has enough todo results to warrant folding (≥ 3 results).
2. If so, folds the older results and provides a projected history to the compaction engine.
3. If not, returns the original history unchanged.

Compaction uses the official `@gsd/pi-coding-agent` compaction API when available, falling back to a best-effort projection otherwise.

## Full-suite compatibility

Magic Todo must coexist with the rest of the suite:

- `context` hook projection must not interfere with Agent Loop state injection.
- Backlog entries use a custom type (`magic-todo-backlog-entry`) to avoid collisions with other entry types.
- The `manage_todo_list` tool schema matches the GSD specification exactly.
- Forked sessions and subagents must inherit the extension through bundled-extension self-injection.

## Verification

```bash
npm test
```