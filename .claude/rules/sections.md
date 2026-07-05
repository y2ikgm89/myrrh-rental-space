# Section Rules

Compatibility layer for Claude-oriented references. Canonical Codex guidance is
`AGENTS.md`, `.agents/skills/type-safety`, and nearby section tests.

- Section schemas live under `src/shared/lib/sections/definitions/*/schema.ts`.
- Section metadata lives next to schemas in `metadata.ts`.
- Shared section field helpers live under `src/shared/lib/sections`.
- Use PortableText span/block shapes where migrated; do not reintroduce legacy
  plain string fields for migrated labels/headings/buttons.
- Public section surfaces should use container and section spacing tokens rather
  than ad hoc horizontal padding.
