# Playwright Reference

## Projects

- `chromium-smoke`: critical unauthenticated smoke tests.
- `chromium`: public and accessibility tests.
- `setup-customer` / `setup-admin`: login once and write storage state.
- `chromium-customer`: authenticated customer tests, depends on customer setup
  and uses `storageState`.
- `chromium-admin`: authenticated admin tests, depends on admin setup and uses
  `storageState`.
- `chromium-visual`: visual regression tests under `e2e/visual`.

## Commands

- All E2E: `bun run e2e`.
- One file: `bun run e2e -- e2e/path/file.spec.ts`.
- One project: `bun run e2e -- --project=chromium-smoke`.
- Debug UI: `bun run e2e:ui`.

## Locator Pattern

Use semantic locators first:

```ts
await page.getByRole("button", { name: "Submit" }).click();
await page.getByLabel("Email").fill("user@example.com");
await expect(page.getByRole("heading", { name: "Reservations" })).toBeVisible();
```

Avoid fragile selectors unless the UI has no accessible surface.

## Readiness Pattern

Use assertions as waits:

```ts
await expect(page).toHaveURL(/\/admin\/reservations/);
await expect(page.getByRole("table")).toBeVisible();
```

Do not add sleeps, networkidle waits, `page.waitForURL`, or optional-count
branches that silently skip coverage.

## Time Control

Use Playwright clock before page scripts run:

```ts
await page.clock.install({ time: new Date("2026-01-15T00:00:00+09:00") });
await page.goto("/events");
```

Keep server-rendered time deterministic through `E2E_FIXED_NOW_ISO` from
`playwright.config.ts`.

## Visual Pattern

Keep snapshot assertions in the visual project unless the task intentionally
changes visual baselines:

```ts
await expect(page.getByRole("main")).toHaveScreenshot();
```
