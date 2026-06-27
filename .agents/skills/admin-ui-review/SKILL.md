---
name: admin-ui-review
description: Use when creating, changing, or reviewing admin dashboard UI, admin forms, tables, dialogs, filters, cards, editors, media pickers, settings screens, submit buttons, design tokens, or accessibility behavior under src/app/(admin).
---

# Admin UI Review

## Review Points

1. Use existing admin components and tokens before creating new primitives.
2. Keep screens dense, quiet, and task-focused.
3. Preserve accessible names, labels, keyboard focus, and minimum hit targets.
4. Use icon buttons only when the icon is standard and the control has an
   accessible label or tooltip.
5. Keep submit behavior behind the existing submit button pattern.
6. Avoid color/token drift. Do not introduce banned palette utility classes.
7. Check loading, empty, error, disabled, and optimistic states.

## Read When Needed

- `references/admin-ui.md` for concrete guardrails and verification.
