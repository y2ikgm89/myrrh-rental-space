# AGENTS.md

The SSoT for agent behavior in this repo is [CLAUDE.md](CLAUDE.md). Every
Claude Code, Codex, or SDK-driven agent should read that file first — it
covers stack, structure, testing conventions, absolute rules, and the
self-completion policy that governs commit → push → PR → auto-merge.

Topic-specific rules live in [`.claude/rules/`](.claude/rules/) and get
auto-loaded when the relevant files are touched.

Multi-step workflows (adding a Prisma migration, adding a section type,
debugging a failed deploy, …) live in [`.claude/skills/`](.claude/skills/) and
are invoked as slash commands.

For human onboarding — setup, common commands, repo layout — see
[README.md](README.md).

## Assistant tool preference

- Use targeted file reads and `Grep` / `Glob` before broad searches.
- Use Context7 before answering or coding against libraries, frameworks, SDKs,
  CLI tools, or cloud services. `resolve-library-id` then `query-docs`.
- Never print, copy, or commit secret values. Treat non-example `.env*` files
  as protected.
