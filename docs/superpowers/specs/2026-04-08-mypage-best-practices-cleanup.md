# Mypage Best Practices Cleanup

> 公開マイページを公式ベストプラクティスに準拠させるクリーンアップ。破壊的変更許可。

## 背景

マイページ（`src/app/(public)/mypage/`）は Customer Social Auth 実装時（2026-03-26）に作成された。
全体的にプロジェクト規約に高い水準で準拠しているが、以下の改善点がレビューで発見された。

## 修正一覧

### 1. Turnstile 検証の追加（CLAUDE.md 禁止ルール違反）

**問題**: CLAUDE.md は「全公開 write mutation に `validateTurnstile` 必須（認証済みユーザー含む）」と規定。
現状、`ReviewForm` のみ Turnstile 対応済みで、他の write mutation は未対応。

**対象アクション**:

- `cancelReservationAction` — キャンセル操作
- `updateReservationAction` — 予約変更操作
- `updateProfileAction` — プロフィール更新
- `deleteAccountAction` — アカウント削除

**実装方針**:

- 各 Server Action に `turnstileToken: string` パラメータを追加
- `validateTurnstile(token)` を レート制限チェックの直後に配置
- Client Component 側に `TurnstileWidget` + `turnstileSiteKey` prop を追加
- `CancelButton` の Dialog、`EditReservationForm`、`ProfileForm`、`AccountLinking` の削除確認 に TurnstileWidget を配置
- 各ページの Server Component から `getTurnstileSiteKey()` を呼び出して Client に渡す

### 2. ファイル名を kebab-case に統一（プロジェクト規約）

**問題**: `events/_components/EventRegistrationList.tsx` が PascalCase。
公開ページは kebab-case がプロジェクト規約。

**変更**:

- `EventRegistrationList.tsx` → `event-registration-list.tsx`
- import パスを更新

### 3. EventRegistrationCard の `confirm()` / `alert()` 廃止

**問題**: `EventRegistrationList.tsx` 内の `EventRegistrationCard` がブラウザネイティブの `confirm()` / `alert()` を使用。
プロジェクトの他の箇所では Radix Dialog + エラー表示を使用しており、UX・a11y の両面で不統一。

**変更**:

- `confirm()` を Radix Dialog に置き換え（`CancelButton` と同パターン）
- `alert(result.error)` をインライン `role="alert"` エラー表示に置き換え

### 4. レビューフォームの `space-y-4` → `space-y-6`（gotchas 準拠）

**問題**: `ReviewForm` のフォームフィールド間隔が `space-y-4`。
gotchas.md は「公開フォームフィールド間隔は `space-y-6` に統一」と規定。

**変更**: `<form className="space-y-4">` → `<form className="space-y-6">`

### 5. `reservation-detail.tsx` / `review-display.tsx` の確認

現状未読のため実装時に確認。問題があれば修正。

### 6. inquiry-queries.ts の確認

`getCustomerInquiries` / `getCustomerInquiryById` が `deletedAt: null` フィルタを含んでいるか確認。
Inquiry モデルにソフトデリートがある場合は必須。

## 対象外

- 各ページの `verifyCustomerSession` 重複呼び出し — Next.js の制約上、layout → page でデータを渡せないため許容パターン
- `getAccountLinksAction` の `formSubmitRateLimiter` 使用 — gotchas 準拠
- `reservation-card.tsx` の日付フォーマット — Client Component 内で `new Date()` で正しくパース済み

## ファイル変更一覧

| ファイル                                                              | 変更内容                                            |
| --------------------------------------------------------------------- | --------------------------------------------------- |
| `mypage/_shared/actions/reservation.ts`                               | Turnstile パラメータ追加                            |
| `mypage/_shared/actions/profile.ts`                                   | Turnstile パラメータ追加                            |
| `mypage/_shared/actions/account.ts`                                   | deleteAccountAction に Turnstile 追加               |
| `mypage/reservations/[id]/_components/cancel-button.tsx`              | TurnstileWidget 追加                                |
| `mypage/reservations/[id]/edit/_components/edit-reservation-form.tsx` | TurnstileWidget 追加                                |
| `mypage/reservations/[id]/edit/page.tsx`                              | `getTurnstileSiteKey()` 呼び出し追加                |
| `mypage/reservations/[id]/page.tsx`                                   | cancel 用の turnstileSiteKey を CancelButton に渡す |
| `mypage/settings/_components/profile-form.tsx`                        | TurnstileWidget 追加                                |
| `mypage/settings/_components/account-linking.tsx`                     | 削除 Dialog に TurnstileWidget 追加                 |
| `mypage/settings/page.tsx`                                            | `getTurnstileSiteKey()` 呼び出し追加                |
| `mypage/events/_components/EventRegistrationList.tsx`                 | kebab-case リネーム + confirm/alert 廃止            |
| `mypage/events/page.tsx`                                              | import パス更新 + turnstileSiteKey 追加             |
| `mypage/reservations/[id]/_components/review-form.tsx`                | space-y-4 → space-y-6                               |
