---
description: CI 上での Lighthouse CI / Playwright webServer / E2E opt-in env の SSoT（CI / local 分岐、startServerReadyTimeout、NEXT_PUBLIC_ENABLE_E2E_LOGIN）
paths:
  - .github/workflows/**
  - playwright.config.ts
  - .lighthouserc.json
  - scripts/lhci-start.ts
  - scripts/run-tests.ts
---

# CI Testing & Performance — Lighthouse / Playwright

> Lighthouse CI 起動 timeout / Playwright webServer CI 分岐 / `NEXT_PUBLIC_ENABLE_E2E_LOGIN` opt-in pattern の SSoT。詳細 root は `../ci-workflow.md` 参照。

## Lighthouse CI 起動 timeout SSoT

`.lighthouserc.json`:

```json
{
  "ci": {
    "collect": {
      "startServerCommand": "bun run lhci:start-server",
      "startServerReadyPattern": "(Ready in|started server)",
      "startServerReadyTimeout": 300000
    }
  }
}
```

- `startServerReadyTimeout: 120000` (default) では CI cold build + start が間に合わず、server 起動前に Lighthouse が navigate → `chrome-error://chromewebdata/` (connection refused) → CHROME_INTERSTITIAL_ERROR で fail
- **300000 (5 分)** が canonical（build ~60s + start ~10s + 余裕）
- `startServerReadyPattern` は **regex** で `(Ready in|started server)` — next dev (Turbopack) と next start (production) 両方の output に対応

`scripts/lhci-start.ts` が `bun run build:skip-env` + `bun x next start` を child spawn する設計。env fallback で `validateProductionEnv` の要求 env を埋める（ENCRYPTION*KEY / R2*\* / CRON_SECRET 等）。

## Playwright webServer の CI / local 分岐 + E2E 用 opt-in env

```typescript
// playwright.config.ts
webServer: {
  command: process.env["CI"] ? "bun run start" : "bun run dev",
  url: "http://localhost:3000",
  reuseExistingServer: !process.env["CI"],
  timeout: 180 * 1000,
}
```

- ローカル: `bun run dev` (Turbopack HMR、開発と同等の環境で spec を反復実行)
- CI: `bun run start` (production build artifact を起動。dev mode の Turbopack initial compile による spec timeout / runner CPU 枯渇を回避)
- timeout: 180s (production build cold start + dependencies init 込み)

**dev mode を CI で使うと runner lost communication になる**（過去 30+ run 連続 failure の主因）— Turbopack initial compile × 大量 spec `page.goto()` 並行で資源枯渇。

### `NEXT_PUBLIC_ENABLE_E2E_LOGIN=1` opt-in pattern

production build でも `DevLoginButton` を表示するため `NEXT_PUBLIC_ENABLE_E2E_LOGIN=1` を build + runtime 両方に伝播:

```yaml
# .github/workflows/ci.yml (E2E job)
- name: Build application
  run: bun run build:skip-env
  env:
    NEXT_PUBLIC_ENABLE_E2E_LOGIN: "1"
    SKIP_ENV_VALIDATION: "true"

- name: Run E2E tests
  run: bunx playwright test
  env:
    CI: true
    NEXT_PUBLIC_ENABLE_E2E_LOGIN: "1"
    # production build を `next start` で動かすため validateProductionEnv の要求 env を埋める
    ENCRYPTION_KEY: "..."
    R2_*: "..."
```

```tsx
// page.tsx の DevLoginButton render gate
{
  (process.env["NODE_ENV"] !== "production" ||
    process.env["NEXT_PUBLIC_ENABLE_E2E_LOGIN"] === "1") && <DevLoginButton />;
}
```

**禁止**: `NEXT_PUBLIC_ENABLE_E2E_LOGIN` を staging / production に伝播（login bypass risk）。CI workflow に閉じた opt-in。

## 関連

- `ci-workflow.md` — workflow 全体 SSoT
- `ci-workflow/job-strategy.md` — Required vs Opt-in job 分離 + Branch Protection
- `ci-workflow/debug.md` — gh CLI debug / Billing / 監査 grep
