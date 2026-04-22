# Email SSoT Tests Implementation Plan

> **ステータス**: ✅ 完了（2026-04-22、`__tests__/unit/shared/lib/email/send.test.ts` 新規作成 + `package.json` test:unit バッチ追加）

**日付**: 2026-04-22
**種別**: 新機能（テスト追加）
**ステータス**: 完了

---

## 概要

`src/shared/lib/email/send.ts`（Resend SSoT ヘルパー）の unit test を新規作成する。`test-coverage-gaps.md` Phase 2 項目「email-service.test.ts」は plan 起草時と現実装の乖離（`email-service.ts` 廃止 → `email/` 11 モジュール分割）により obsolete となっていた。本 plan はその再スコープ。

**対象**:

- `src/shared/lib/email/send.ts`
  - `sendEmail()`: idempotency key + retry + server-only 契約
  - `hashForKey()`: sha256 先頭 32 文字ハッシュ（決定論性）

**非対象**（別 plan）:

- `src/shared/lib/email/{reservation,inquiry,review,event,...}-emails.ts`（各ドメインテンプレート関数）
- `@react-email/components` の React レンダリング側

**参照 SSoT**:

- `.claude/rules/resend-patterns.md`（Resend v6+ 公式準拠パターン）
- `.claude/rules/external-api-retry-patterns.md`（共通 retry 契約）
- Resend 公式: https://resend.com/docs/dashboard/emails/idempotency-keys

---

## 設計根拠（公式ベストプラクティス準拠）

### Resend v6 公式仕様

- `resend.emails.send()` は `{ data, error }` を返す（例外を投げない）
- 第 2 引数形式 `send(payload, { idempotencyKey })` が公式推奨
- リトライ対象エラー: `rate_limit_exceeded` (429) / `internal_server_error` (500) / `application_error` (500)
- 即時失敗: `validation_error` (422) / `invalid_api_key` (401) 他
- idempotency key: 最大 256 文字 / 24 時間有効 / 同一 key + 同一 payload → 元レスポンス再取得 / 同一 key + 異なる payload → 409

### Bun Test 公式（`.claude/rules/bun-patterns.md`）

- `mock()` は型引数必須: `mock<() => Promise<{ data: Data | null; error: Error | null }>>()`
- `mock.module()` は import より**前**（TDZ 回避）
- `mock.restore()` を `afterEach` で。モックリセットは `mockReset()` + `mockResolvedValueOnce` で per-test 制御
- `using` キーワードで自動復元（spy / mock 両対応）
- `server-only` モジュールは `__tests__/setup.ts` の `mock.module("server-only", () => ({}))` で自動 no-op 化

### 後方互換性なし方針

- 旧 plan `email-service.test.ts` のスコープは破棄（対象ファイル不在のため復元不能）
- `sendEmail` の契約は SSoT として固定。テストで `resend.emails.send` を直接モックし、変更を破壊的変更として検出

---

## File Structure

| Action | Path                                           | Responsibility                           |
| ------ | ---------------------------------------------- | ---------------------------------------- |
| Create | `__tests__/unit/shared/lib/email/send.test.ts` | `sendEmail()` / `hashForKey()` unit test |

既存の per-directory batch パターン（`package.json` `test:unit`）に統合。**新規 directory 追加はせず**、既存の `__tests__/unit/shared/lib/` の配下に `email/` を作成。

---

## 実装ステップ

### Step 1: `package.json` test:unit バッチへの登録（ADR 0010 準拠）

`package.json` の `"test:unit"` チェーンに `bun test __tests__/unit/shared/lib/email` を追加。`mock.module` のグローバル干渉を避けるため per-directory batch 必須。

```json
"test:unit": "... && bun test __tests__/unit/shared/lib/email && ..."
```

**位置**: `__tests__/unit/shared/lib/r2/*.test.ts` バッチの直後に挿入。

### Step 2: `__tests__/unit/shared/lib/email/send.test.ts` 作成

#### 2.1 モック依存

```typescript
import { describe, test, expect, mock, beforeEach, afterEach } from "bun:test";

// 1. モック関数を先に定義（TDZ 回避）
const mockResendSend = mock<
  (
    payload: unknown,
    options?: unknown,
  ) => Promise<{
    data: { id: string } | null;
    error: { name: string; message: string } | null;
  }>
>();

const mockLogError = mock(() => {});

// 2. mock.module はテスト対象 import より前
mock.module("@/shared/lib/email/client", () => ({
  isEmailEnabled: () => true,
  getResendClient: () => ({ emails: { send: mockResendSend } }),
  getFromAddress: () => "noreply@example.com",
}));

mock.module("@/shared/lib/errors/server", () => ({
  ErrorCategory: { EXTERNAL_API: "EXTERNAL_API" },
  ErrorSeverity: { MEDIUM: "MEDIUM" },
  logError: mockLogError,
  normalizeError: (e: unknown) =>
    e instanceof Error ? e : new Error(String(e)),
}));

// 3. テスト対象 import
import { sendEmail, hashForKey } from "@/shared/lib/email/send";
```

#### 2.2 `sendEmail()` テストケース

**no-op path**:

- [ ] `isEmailEnabled()` が false なら `resend.emails.send` を呼ばず `{ success: true }`
- [ ] `getResendClient()` が null なら `{ success: true }`

**正常系**:

- [ ] `idempotencyKey` なし → `resend.emails.send(fullPayload)` (1 引数形式)
- [ ] `idempotencyKey` あり → `resend.emails.send(fullPayload, { idempotencyKey })` (2 引数形式、公式推奨)
- [ ] `from` が `getFromAddress()` から自動設定される（payload の `from` を除外した型に注入される）
- [ ] 成功時 `{ success: true }` を返す

**retry 動作**:

- [ ] `rate_limit_exceeded` (429) → 最大 `maxRetries` 回まで retry
- [ ] `internal_server_error` (500) → retry 対象
- [ ] `application_error` (500) → retry 対象
- [ ] `validation_error` (422) → 即時失敗、retry なし
- [ ] `invalid_api_key` (401) → 即時失敗
- [ ] `maxRetries: 0` 指定時は retry 無効化（初回エラーで即失敗）
- [ ] retry 発生時にバックオフ時間が経過（`setTimeout` モックで検証 or `Date.now()` 差分）

**エラーハンドリング**:

- [ ] 最終失敗時 `{ success: false, error: "メール送信に失敗しました" }` を返す（固定メッセージ、`error.message` を露出しない）
- [ ] `logError` が `category: EXTERNAL_API` / `severity: MEDIUM` / `operation` + `idempotencyKey` + `context` を含むコンテキストで呼ばれる
- [ ] SDK が throw した場合（ネットワークエラー等）も同じ形式で失敗を返す
- [ ] retry 中の `attempt` カウンタが log context に含まれる

**idempotency key 透過性**:

- [ ] 同一 key + 同一 payload の再送で元レスポンスが返る挙動は SDK 側仕様のため、テストでは「2 引数形式で呼び出されていること」のみ検証

#### 2.3 `hashForKey()` テストケース

- [ ] 同じ入力で同じ出力（決定論性）
- [ ] 異なる入力で異なる出力
- [ ] 出力長は 32 文字（sha256 hex の先頭 32 文字）
- [ ] 空文字列入力でも有効な 32 文字ハッシュ
- [ ] 長大文字列（256+ 文字の URL 等）でも 32 文字に正規化
- [ ] Unicode / 特殊文字（`/`、`#`、日本語）を含む入力でも安定動作

### Step 3: 検証

```bash
# 単独実行
bun test __tests__/unit/shared/lib/email/send.test.ts

# per-directory batch（mock.module 干渉なしの確認）
bun run test:unit
```

**受け入れ基準**:

- 全ケース pass（20+ tests を想定）
- `bun run validate` EXIT 0
- 既存 `__tests__/unit/shared/lib/**` のテストが壊れていない
- `test:unit` 全走 pass

### Step 4: `test-coverage-gaps.md` の Phase 2 チェックリスト更新

```markdown
- [x] email-service.test.ts — 再スコープして `send.ts` SSoT テストを `__tests__/unit/shared/lib/email/send.test.ts` に実装（2026-04-22 plan 2026-04-22-email-ssot-tests.md 完了）
```

---

## 破壊的変更

1. `test:unit` バッチへの行追加（CI 実行時間 +1-2 秒）
2. `__tests__/unit/shared/lib/email/` ディレクトリ新規作成
3. `sendEmail()` の実装変更は伴わない（テスト追加のみ）

---

## ロールバック戦略

- 1 commit 完結（テスト追加 + `package.json` バッチ登録）
- `git revert <commit>` で単純に戻せる

---

## 参考文献

- [Resend — Idempotency Keys](https://resend.com/docs/dashboard/emails/idempotency-keys)
- [Resend — AI Onboarding](https://resend.com/docs/ai-onboarding)
- [Bun Test — Mock API](https://bun.sh/docs/test/mocks)
- `.claude/rules/resend-patterns.md` — プロジェクト SSoT 運用ルール
- `.claude/rules/external-api-retry-patterns.md` — 共通 retry 契約
- `.claude/rules/bun-patterns.md` — Bun Test 公式パターン
- `docs/architecture/decisions/0010-per-directory-test-batch.md` — バッチ実行の根拠
- `docs/architecture/decisions/0014-test-script-consolidation.md` — test script SSoT
