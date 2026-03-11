# プロジェクトスコア改善 実装計画

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** プロジェクト総合スコア94→96点達成（P0-P3の全6項目を修正）

**Architecture:** セキュリティ修正3件 + a11y修正2件 + テスト追加 + 循環依存解消。全タスク独立で並列実行可能。

**Tech Stack:** Next.js 16 / React 19 / TypeScript 6 / bun:test / Zod 4

---

## Task 1: calendar-sync エラーメッセージ固定化（セキュリティ P0）

**Files:**

- Modify: `src/app/api/cron/calendar-sync/route.ts:124-131`

- [ ] **Step 1: renewalError.message をメール本文から除外**

`route.ts:127-130` の `error:` フィールドを固定メッセージに変更:

```typescript
// Before
error:
  renewalError instanceof Error
    ? renewalError.message
    : "Unknown error",

// After
error: "Webhook更新処理でエラーが発生しました。詳細はサーバーログを確認してください。",
```

`logError` は既に119行目で呼ばれているため、サーバー側記録は維持される。

---

## Task 2: Instagram OAuth エラーメッセージ固定化（セキュリティ P3）

**Files:**

- Modify: `src/app/api/instagram/oauth/callback/route.ts:69-74`

- [ ] **Step 1: error_description/error_reason をURL パラメータから除外**

```typescript
// Before
if (error) {
  const errorMessage =
    error_description || error_reason || "Instagram認証がキャンセルされました";
  return redirectToSettings({ error: errorMessage });
}

// After
if (error) {
  logError(new Error("Instagram OAuth error"), {
    category: ErrorCategory.EXTERNAL_API,
    severity: ErrorSeverity.LOW,
    context: {
      error,
      error_reason,
      error_description,
      operation: "instagramOAuthCallback",
    },
  });
  return redirectToSettings({
    error: "Instagram認証に失敗しました。再度お試しください。",
  });
}
```

`logError` と `ErrorCategory`/`ErrorSeverity` の import を追加。

---

## Task 3: Cloudflare エラーメッセージ固定化（セキュリティ P3）

**Files:**

- Modify: `src/shared/lib/cloudflare.ts:134-141`

- [ ] **Step 1: catch ブロックのエラーメッセージを固定化**

```typescript
// Before
} catch (error) {
  if (error instanceof Error && error.name === "TimeoutError") {
    return { success: false, error: "タイムアウトしました" };
  }
  return {
    success: false,
    error: error instanceof Error ? error.message : "不明なエラー",
  };
}

// After
} catch (error) {
  if (error instanceof Error && error.name === "TimeoutError") {
    return { success: false, error: "タイムアウトしました" };
  }
  logError(error instanceof Error ? error : new Error("Cloudflare API error"), {
    category: ErrorCategory.EXTERNAL_API,
    severity: ErrorSeverity.MEDIUM,
    context: { operation: "callPurgeApi" },
  });
  return { success: false, error: "Cloudflare API接続に失敗しました" };
}
```

`logError` と `ErrorCategory`/`ErrorSeverity` の import を追加。

---

## Task 4: MediaDialog アクセシビリティ修正（a11y P0）

**Files:**

- Modify: `src/app/(admin)/admin/(dashboard)/media/_components/MediaDetailDialog.tsx:218-281`
- Modify: `src/app/(admin)/admin/(dashboard)/media/_components/MediaUploadDialog.tsx:173-273`

- [ ] **Step 1: MediaDetailDialog — 4フィールドに htmlFor/id 紐付け追加**

`useId()` を import し、4つのフィールド（用途 select、代替テキスト input、タイトル input、説明 textarea）に一意の id と label の htmlFor を追加。

- [ ] **Step 2: MediaUploadDialog — 3フィールドに htmlFor/id 紐付け + ファイル入力ラベル追加**

同様に `useId()` で3フィールド（用途 select、代替テキスト input、タイトル input）を紐付け。
hidden ファイル入力に `sr-only` ラベルを追加:

```tsx
<label htmlFor="file-input" className="sr-only">ファイルを選択</label>
<input id="file-input" type="file" ... className="hidden" />
```

---

## Task 5: 循環依存解消 — バリデーション型を @/shared へ移動（アーキテクチャ P2）

**Files:**

- Move: `@/admin/lib/validations/customer.ts` → `src/shared/lib/validations/customer.ts`
- Move: `@/admin/lib/validations/location.ts` → `src/shared/lib/validations/location.ts`
- Move: `@/admin/lib/validations/space-category.ts` → `src/shared/lib/validations/space-category.ts`
- Move: `@/admin/lib/validations/staff-invitation.ts` → `src/shared/lib/validations/staff-invitation.ts`
- Move: `@/admin/lib/validations/user.ts` → `src/shared/lib/validations/user.ts`
- Modify: 上記5ファイルを import している全ファイルのパスを更新

- [ ] **Step 1: 5ファイルを `src/shared/lib/validations/` にコピー**
- [ ] **Step 2: `@/shared/domain/` 内の import パスを `@/shared/lib/validations/` に変更（6箇所）**
- [ ] **Step 3: `@/admin/` 内の import パスを `@/shared/lib/validations/` に変更**
- [ ] **Step 4: 元の `@/admin/lib/validations/` ファイルを削除**
- [ ] **Step 5: 型チェック実行**

---

## Task 6: 予約ドメインテスト追加（テスト P1）

**Files:**

- Create: `__tests__/unit/shared/lib/reservation/time-slots.test.ts`

time-slots.ts のテスト可能な純粋関数のテスト:

- `parseTime` — 時刻文字列のパース
- `getWeekdayKey` — 日付から曜日キー取得
- `generateSlotsFromBusinessHours` — 営業時間からスロット生成
- `generateFallbackSlots` — フォールバックスロット生成

※ `overlap-check.ts` は `checkReservationOverlapQuery` への薄いラッパーのため、
`availability.ts` の integration テストで既にカバー済み。
time-slots.ts の純粋関数テストが最も価値が高い。

ただし、`parseTime`, `getWeekdayKey`, `generateSlotsFromBusinessHours`, `generateFallbackSlots` は
現在 module-private（export されていない）。テスト可能にするために export する。

---

## 検証

- [ ] `bun run validate` — 型チェック + lint
- [ ] `bun run build` — ビルド成功
- [ ] `bun run test` — テスト全パス
