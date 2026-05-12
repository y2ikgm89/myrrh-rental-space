# 2026-04-28 Claude Code Official-Compliance Cleanup

> **Snapshot: 2026-04-28**
> **Completed: 2026-04-28**
> Follow-up cleanup immediately after ADR 0028 (Claude Config Optimization) on the same day.
> Remove residual drift found by verifying the official five-layer spec (memory / rules / subagents / skills / hooks) against primary sources, with no backwards compatibility.

## Primary-source verification

Following `.claude/rules/research-audit.md` Steps 1–2, we fetched Claude Code’s official docs via WebFetch and compared them to the repo.

| Official docs                        | What we checked                                                             | Current state                                                      |
| ------------------------------------ | --------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `code.claude.com/docs/en/memory`     | `.claude/rules/` + `paths:` frontmatter are supported                       | ✅ All 32 rule docs have `paths:`                                  |
| `code.claude.com/docs/en/skills`     | SKILL.md < 500 lines; description + when_to_use combined ≤ 1,536 characters | ✅ All 31 skills compliant                                         |
| `code.claude.com/docs/en/sub-agents` | Frontmatter `name` / `description` required; other fields optional          | ✅ All 15 agents use official frontmatter only                     |
| `code.claude.com/docs/en/sub-agents` | **In v2.1.63, `Task` tool renamed to `Agent`. `Task` remains as an alias**  | ⚠️ `matcher: "Task"` still present                                 |
| `code.claude.com/docs/en/sub-agents` | Agents without `memory:` should not have `agent-memory/<name>/`             | ⚠️ design-memory / react-compiler-reviewer keep orphaned dirs      |
| `code.claude.com/docs/en/memory`     | `MEMORY.md` 200-line / 25KB cap; trim archives as recommended               | ⚠️ Five archives marked “no need to reference next session” remain |

## Deltas (remove with breaking changes)

### Phase 1: `Task` → `Agent` matcher rename (official v2.1.63)

From official docs:

> In version 2.1.63, the Task tool was renamed to Agent. Existing `Task(...)` references in settings and agent definitions still work as aliases.

Aliases exist only for backwards compatibility. Per clean-break goals, standardize on `Agent`.

Files to change:

- `.claude/settings.json` L136: `"matcher": "Task"` → `"matcher": "Agent"`
- `.claude/rules/claude-code-patterns.md` L73: “Task tool disallowed” → “Agent tool disallowed”
- `.claude/rules/ops/hooks-patterns.md` L116–120: `matcher: "Task"` explanation → `matcher: "Agent"` + v2.1.63 rename note
- `.claude/skills/verify-subagent-report/SKILL.md` L149: “after Task tool run” → “after Agent tool run”

### Phase 2: Delete orphaned `agent-memory` directories

For agents **without** `memory:` frontmatter, `.claude/agent-memory/<name>/` is orphan data. Official behavior creates these only when `memory:` is set.

Delete:

- `.claude/agent-memory/design-memory/` (3 files) — no `memory:` in agent `.md`
- `.claude/agent-memory/react-compiler-reviewer/` (1 file) — no `memory:` in agent `.md`

The other six (codebase-explorer / project-reviewer / security-reviewer / test-writer / test-runner / verification) already have `memory:` on the agent `.md` files = keep as compliant.

### Phase 3: Prune `MEMORY.md` archive index entries

From official docs:

> The first 200 lines of `MEMORY.md`, or the first 25KB, whichever comes first, are loaded at the start of every conversation.

We are at 130 lines (under the cap), but five archive entries (2026-04-28) explicitly marked “no need to reference next session” add useless always-on context. Remove them from the index (**keep the files** for learning).

Remove from `MEMORY.md` index only:

- `project_p17-19-sequential-handoff` archive
- `project_clean-break-refactor-handoff` archive
- `project_clean-break-c5-handoff` archive
- `project_meo-multi-location-handoff` archive
- `project_section-arch-phase-b-handoff` (keep: noted as retained for historical learning) → **keep this one**

Actual removals: four entries + section header cleanup.

## Verification

- `bun run validate` stays exit 0 (no TypeScript under rule / skill / agent trees)
- No new entries needed in `.claude/rules/audit-exceptions.md`

## ADR

The ADR system was retired on 2026-04-28 per ADR 0028. Track this change via this plan document + git history.

## Completion marker

> **Completed: 2026-04-28**

Execution summary:

- Phase 1 (Task → Agent rename): updated four files — `.claude/settings.json`, `.claude/rules/claude-code-patterns.md`, `.claude/rules/ops/hooks-patterns.md`, `.claude/skills/verify-subagent-report/SKILL.md`
- Phase 2 (orphaned agent-memory): removed `.claude/agent-memory/{design-memory,react-compiler-reviewer}/` (gitignored paths = no git history impact)
- Phase 3 (`MEMORY.md` pruning): 130 → 117 lines (removed four archive sections)
