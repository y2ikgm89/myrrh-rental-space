---
name: codex-instruction-maintenance
description: Use when changing Codex project instructions, AGENTS.md, repository skills, custom subagents, command approval rules, hooks, or AI-agent governance docs in this repository. Do not use for normal feature implementation unless those instruction assets are being edited.
---

# Codex Instruction Maintenance

## Workflow

1. Check the current OpenAI Codex documentation before changing instruction assets.
2. Keep `AGENTS.md` concise and project-wide. Move reusable workflows to `.agents/skills`.
3. Put repo skills in `.agents/skills/<name>/SKILL.md`; use only `name` and `description` frontmatter.
4. Put custom subagents in `.codex/agents/*.toml`; each file must define `name`, `description`, and `developer_instructions`.
5. Treat `.codex/rules/*.rules` as command approval policy only. Do not write coding standards there.
6. Keep `.codex/hooks.json` empty unless the repository has a concrete hook use case and the current OpenAI docs confirm the needed event is supported.
7. Document structural changes in `docs/architecture/codex-instructions.md` or `docs/architecture/agent-instructions.md`.

## Boundaries

- Do not make `.claude/*` the Codex source of truth.
- Do not duplicate long rules into skills. Skills should describe workflows, not every project rule.
- Do not create broad subagents. Prefer narrow, evidence-oriented agents that either explore, review, verify, or research docs.
- Do not use hooks to enforce validation until the target hook event is stable enough for this repository; use `lefthook`, CI, and explicit validation commands instead.

## Validation

- Check skill frontmatter manually: `name` and `description` only.
- Check TOML syntax for `.codex/agents/*.toml`.
- Run `bun run validate` before completion.
