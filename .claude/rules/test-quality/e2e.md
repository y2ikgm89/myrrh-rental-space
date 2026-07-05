# E2E Test Quality Rules

Compatibility layer for Claude-oriented references. Canonical Codex guidance is
`AGENTS.md` plus `.agents/skills/e2e-test-quality`.

- Use semantic Playwright locators first.
- Use web-first assertions as waits.
- Do not use `page.waitForTimeout`, `waitForLoadState("networkidle")`, or
  `page.waitForURL`.
- Use setup projects and storage state for authenticated flows.
- Keep visual tests under `e2e/visual` and update snapshots only when the visual
  change is intended.
- Install Playwright clock before `page.goto` when freezing browser time.
- Run focused Playwright projects before broad E2E.
