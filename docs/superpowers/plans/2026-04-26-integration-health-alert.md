# P6: Integration Health Alert Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans.

**Goal:** 管理ダッシュボード上部に「未設定の外部連携が N 件あります」alert を表示し、Stripe / Resend / Google Calendar / Turnstile のうち未接続の統合を一覧 + 設定ページへの link を提供。「メールが届かない」「決済できない」等の運用障害を未然防止。後方互換なしの clean-break。

**Architecture:** ① 新規 domain query `getIntegrationHealthSummary()` を `settings/api-key-queries.ts` に追加し、4 統合（resend / stripe / googleCalendar / turnstile）の `connected: boolean` を一括返却 ② 新規 Server Component `IntegrationHealthAlert.tsx` で query 結果から未接続のみフィルタし、`role="status"` alert を表示 ③ `dashboard/page.tsx` の DashboardHeader 直後に Suspense でラップして配置（streaming で遅延を許容）。

**Out of scope:** 接続テスト実行 UI（既存 settings ページに分離済み）、各統合の設定ボタンへの直接 deep link（settings ページ全体への link で十分）、SUPER_ADMIN/ADMIN 権限分岐（現時点では全 admin に表示、将来 settings 編集権限ベースで絞ることも検討可）。

---

## Task 1: getIntegrationHealthSummary query 追加

**Files:**

- Modify: `src/shared/domain/settings/api-key-queries.ts`

**Implementation:**

```typescript
export async function getIntegrationHealthSummary(): Promise<{
  readonly resend: boolean;
  readonly stripe: boolean;
  readonly googleCalendar: boolean;
  readonly turnstile: boolean;
}> {
  const settings = await prisma.settings.findUnique({
    where: { id: "singleton" },
    select: {
      resendApiKey: true,
      stripeSecretKey: true,
      googleCalendarOAuthEnabled: true,
      turnstileSecretKey: true,
    },
  });
  return {
    resend: Boolean(
      settings?.resendApiKey && safeDecrypt(settings.resendApiKey),
    ),
    stripe: Boolean(
      settings?.stripeSecretKey && safeDecrypt(settings.stripeSecretKey),
    ),
    googleCalendar: settings?.googleCalendarOAuthEnabled ?? false,
    turnstile: Boolean(
      settings?.turnstileSecretKey && safeDecrypt(settings.turnstileSecretKey),
    ),
  };
}
```

---

## Task 2: IntegrationHealthAlert Server Component 新規 + dashboard 配置

**Files:**

- Create: `src/app/(admin)/admin/(dashboard)/_components/IntegrationHealthAlert.tsx`
- Modify: `src/app/(admin)/admin/(dashboard)/page.tsx`

**IntegrationHealthAlert:**

```tsx
import "server-only";
import type { ReactElement } from "react";
import Link from "next/link";
import { IconAlertTriangle } from "@tabler/icons-react";
import { getIntegrationHealthSummary } from "@/shared/domain/settings/api-key-queries";

const INTEGRATIONS = [
  {
    key: "resend",
    label: "Resend（メール送信）",
    href: "/admin/settings/notify",
  },
  { key: "stripe", label: "Stripe（決済）", href: "/admin/settings/api" },
  {
    key: "googleCalendar",
    label: "Google Calendar（予約同期）",
    href: "/admin/settings/api",
  },
  {
    key: "turnstile",
    label: "Cloudflare Turnstile（フォーム保護）",
    href: "/admin/settings/api",
  },
] as const;

export async function IntegrationHealthAlert(): Promise<ReactElement | null> {
  const health = await getIntegrationHealthSummary();
  const disconnected = INTEGRATIONS.filter((i) => !health[i.key]);
  if (disconnected.length === 0) return null;
  return (
    <div role="status" aria-live="polite" className="...">
      ... title + link list ...
    </div>
  );
}
```

dashboard page.tsx に `<Suspense fallback={null}><IntegrationHealthAlert /></Suspense>` を DashboardHeader の直後に配置。

---

## Task 3: 検証

- `bun run validate` EXIT=0
- `bun run build` EXIT=0
