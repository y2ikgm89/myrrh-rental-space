---
name: lexical-editor
description: Use when changing this repository's admin Lexical editor, custom nodes, plugins, toolbar behavior, serialization, or Lexical tests. Do not use for public-only pages or unrelated admin CRUD screens.
---

# Lexical Editor

## Workflow

1. Identify the edited surface: node, plugin, toolbar command, serializer, admin UI shell, or tests.
2. Keep Lexical-specific UI under the admin route tree. Do not move Lexical concerns into public components or shared renderer code.
3. Prefer existing node/plugin patterns before introducing new abstractions.
4. Validate serialized editor data at the domain boundary with Zod or an existing schema helper.
5. Keep toolbar behavior keyboard-accessible and avoid hardcoded color values; use admin semantic tokens.
6. Do not add compatibility shims for retired editor payloads unless the user explicitly asks for a migration path.
7. Add focused Bun tests for serialization, command behavior, or domain transforms before broad validation.

## Guardrails

- Do not use `forwardRef`; React 19 refs are normal props.
- Do not use React Hook Form `watch()` for reactive UI; use `useWatch()`.
- Do not add arbitrary HTML, script, or custom CSS inputs through the editor.
- Keep media and link inputs validated before persistence.
- Keep public rendering and admin editing concerns separated.

## Validation

- Targeted Lexical or affected domain tests first.
- Minimum completion gate: `bun run validate`.
- Before PR / release / commit: `bun run validate && bun run build`.
