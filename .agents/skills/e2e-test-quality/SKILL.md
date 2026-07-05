---
name: e2e-test-quality
description: Use when adding, changing, reviewing, or debugging Playwright tests under e2e, Playwright auth setup, visual snapshots, accessibility tests, smoke tests, or browser-driven test flows. Enforces semantic locators, web-first assertions, isolation, and no flaky sleeps/networkidle waits.
---

# E2E Test Quality

## Rules

1. Prefer `page.getByRole`, `getByLabel`, and `getByText`; use `getByTestId`
   only when semantic locators cannot express the target.
2. Use Playwright web-first assertions such as `toBeVisible`, `toHaveText`, and
   `toHaveURL`.
3. Do not use `page.waitForTimeout`, `waitForLoadState("networkidle")`, or
   `page.waitForURL`.
4. Keep tests isolated. Use setup projects and storage state for authenticated
   flows.
5. Use `test.describe.serial` only for flows that intentionally share mutable
   state; do not reduce global workers to hide coupling.
6. Visual tests belong under `e2e/visual` and should be opt-in unless the task
   explicitly changes visual baselines.

## Read When Needed

- `references/playwright.md` for command selection and locator patterns.
