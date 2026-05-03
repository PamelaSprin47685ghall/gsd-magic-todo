# Magic Todo

Todo list and append-only work backlog with automatic context folding for GSD and pi sessions. Keeps the agent's context window focused on relevant tasks while preserving a complete audit trail.

Version: `5.1.0`.

## What it provides

| Capability | Name |
|---|---|
| Tools | `manage_todo_list` |
| Hooks | `session_start`, `session_switch`, `session_fork`, `session_tree`, `context`, `session_before_compact` |
| Commands | none |

## How it works

Magic Todo intercepts conversation context at two points:

1. **Context projection**: Before each agent turn, `manage_todo_list` results are replaced with a backlogged summary that folds older entries. The agent sees only the current task list plus a compact backlog summary.

2. **Compaction preparation**: When the session compacts history, Magic Todo folds completed items into the backlog and keeps only the latest active items visible.

The tool uses a `write`/`read` paradigm:
- **`write`** — replaces the entire todo list and appends a completed-work report to the backlog.
- **`read`** — returns the current todo list and backlog projection.

## Operational notes

- The backlog is append-only. Completed work is never deleted, only summarized.
- Fold boundaries are computed from `manage_todo_list` result positions in the message history.
- Malformed or ambiguous fold ranges are safely skipped (returns original messages).
- Forked sessions inherit the extension automatically.

## Maintainer spec

See [`SPEC.md`](./SPEC.md) for fold contract, backlog projection, compaction, and full-suite compatibility rules.

## Test

```bash
npm test
```