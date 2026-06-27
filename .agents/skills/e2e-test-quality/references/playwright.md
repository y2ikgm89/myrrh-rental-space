# Playwright Reference

## Projects

- `chromium-smoke`: critical unauthenticated smoke tests.
- `chromium`: public and accessibility tests.
- `chromium-customer`: authenticated customer tests, depends on customer setup.
- `chromium-admin`: authenticated admin tests, depends on admin setup.
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
await expect(page.getByRole("heading", { name: "Reservations" })).toBeVisible();
```

Avoid fragile selectors unless the UI has no accessible surface.

## Readiness Pattern

Use assertions as waits:

```ts
await expect(page).toHaveURL(/\/admin\/reservations/);
await expect(page.getByRole("table")).toBeVisible();
```

Do not add sleeps, networkidle waits, or optional-count branches that silently
skip coverage.
