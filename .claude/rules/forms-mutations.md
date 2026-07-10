---
paths:
  [
    "src/app/(admin)/**",
    "src/app/(public)/**",
    "src/shared/lib/forms/**",
    "src/shared/lib/validations/**",
    "src/shared/lib/mutation-result.ts",
  ]
---

# フォーム（conform + Zod 4）とサーバーミューテーション

## 共通基盤

- Server Action 統合の SSoT は `executeConformMutation(formData, schema, handler)`
  （`src/shared/lib/forms/conform-action.ts`、React 19 `useActionState` 互換）
- conform の Zod 統合 import は必ず `@conform-to/zod/v4` サブパス（bare は禁止）
- mutation の戻り値は `MutationResult<T>`、判別は `isMutationError()`

## 空入力の罠（最頻出バグ）

`parseWithZod` は空入力を **undefined に変換**する。必須 `z.string()` / `z.boolean()` の
ままだと空欄保存・Switch OFF 保存が全弾きになる。

- 任意テキスト → `optionalText(max)`、Switch → `switchBoolean()`（`.default(false)`）、
  永続化前の空→null は `emptyToNull()`（いずれも
  `_shared/actions/settings/schemas/form-schema-helpers.ts`）
- `switchBoolean` を `z.preprocess` に書き換えない（実 boolean true を破壊する）
- この契約は `__tests__/unit/forms/*-empty-optional.test.ts` が
  「実体スキーマ × FormData × parseWithZod」の実測で固定している。
  スキーマをテスト内にインライン再宣言して object 入力で検証しない

## クライアント側の定型

`useForm<z.input<typeof Schema>>`（明示 generic）+ `import type { z }`（value import
しない）+ `constraint: getZodConstraint(schema)` + `onValidate: parseWithZod` +
`shouldValidate: "onBlur"` + `shouldRevalidate: "onInput"`。
成功検出は resetForm の設定で変わる: `resetForm: true` → `lastResult.initialValue === null`、
`resetForm: false` → `lastResult.status === "success"`。

## admin mutation

- 標準ラッパーは `executeAdminMutationResult`（`@/admin/lib/admin-action`）。
  実行順序 checkAdminAuth → resolveResourceId → hasPermission → userHasResourceAccess →
  execute → afterSuccess → logAction は**不変契約**（順序変更はセキュリティ/キャッシュの
  silent regression）
- execute 内で throw した `DomainError` は自動で MutationError に変換される
- legacy wrapper（`createSuccess(` / `type ActionResult` / `executeAdminMutation(`）の
  再導入はテストで即 fail
- admin action ファイルは Prisma を直 import しない（thin action、テスト強制）。
  ファイルを移動・改名したら `architecture-boundaries.test.ts` の
  THIN_ADMIN_ACTION_FILES 配列も更新する（不在 path は hard-fail）

## 公開フォーム action

handler 冒頭で `checkActionRateLimit(formSubmitRateLimiter)` →
`validateTurnstile({ token, expectedAction: TURNSTILE_ACTIONS.* })` の順に実行する。
Turnstile token は一度の検証で消費されるため、失敗時は widget reset + token clear が必要。

予約(reservation)・イベント申込(event-registration)は専用のIP単位リミッター
（`reservationSubmitRateLimiter` / `eventRegistrationSubmitRateLimiter`、
`formSubmitRateLimiter` からは分離済み）を使い、上記2つの間に
`checkEmailRateLimit(<domain>ByEmailRateLimiter, data.email)` →
`checkBotHeuristics({ honeypot, formRenderedAt })` を追加で挟む
（`checkActionRateLimit` → `checkEmailRateLimit` → `checkBotHeuristics` →
`validateTurnstile`）。DB/外部API呼び出しを伴わない最安チェックを先に置く順序。
`checkEmailRateLimit` は同一人物が複数IPから同じメールで大量作成するケースを防ぐ
顧客単位の第二防壁（`cancelByReservationRateLimiter` と同型の設計）。
honeypot フィールドは Zod スキーマ上では検証エラーにしない（`website` のような
実在しない項目名を装い、botに何が原因か開示しないため）。フォーム側は視覚的に
隠した hidden input（`aria-hidden` + `tabIndex={-1}` + 画面外配置）と、フォーム
初回マウント時刻を埋め込む hidden input の2つを追加する。全公開フォームへの
一般化はしていない（対象は予約・イベント申込のみ、他フォームへの適用は個別に検討する）。

## スキーマ配置

設定系は `_shared/actions/settings/schemas/`、リソース系はコンポーネント隣接の
`*-form-schema.ts` か `src/shared/lib/validations/`。Zod 4 のメッセージは
`{ error: "..." }` 形式、日付は `z.iso.date()` / `z.iso.datetime()`。
