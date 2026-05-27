# 保護対策の設定

DDoS / レート制限 / Bot 保護を実装・運用する手順。設計の「なぜ」は [`../explanation/security-model.md`](../explanation/security-model.md) を参照。

## 1. Cloudflare DDoS 保護

### 設定（無料プランで可）

1. ドメインを Cloudflare に追加
2. DNS 設定でプロキシ有効化（オレンジ雲）
3. SSL/TLS: **Full (Strict)**

### 提供される保護

- L3/L4 DDoS 自動保護
- HTTP Flood 対策
- Slowloris 攻撃対策

## 2. レート制限（`@/shared/lib/rate-limit` adapter pattern）

### SSoT

`src/shared/lib/rate-limit.ts` が **`RateLimitStore` interface + `InMemoryRateLimitStore`（`lru-cache` backend）** で実装。Redis 等の distributed backend に env-driven で切替可能。

```typescript
import { createRateLimiter } from "@/shared/lib/rate-limit";

const apiRateLimiter = createRateLimiter({
  interval: 60_000, // 1 分
  maxRequests: 100,
});

const { success } = await apiRateLimiter.check(ipAddress);
if (!success) return { error: "リクエストが多すぎます" };
```

`check()` / `reset()` は `Promise` を返す async API（Redis backend 切替を前提）。

### 多層防御

| Layer | 役割                                                | 場所                            |
| ----- | --------------------------------------------------- | ------------------------------- |
| 1     | `InMemoryRateLimitStore`（per-instance LRUCache）   | `src/shared/lib/rate-limit.ts`  |
| 2     | Cloudflare Turnstile（公開フォームの bot 緩和）     | `src/shared/lib/turnstile.ts`   |
| 3     | Cloud Run autoscale max instance（実質的な上限）    | `cloudbuild.yaml`               |
| 4     | Cloudflare WAF Custom Rules（CDN 層 IP rate limit） | Cloudflare Dashboard で運用配線 |

Cloud Run multi-instance では Layer 1 は per-instance protection のみ（各 instance が独立 bucket）。完全な distributed rate limiting には `RedisRateLimitStore` 実装に切替える（`RateLimitStore` interface を共有）。

### 配置箇所

| エンドポイント             | 制御                                                                                          |
| -------------------------- | --------------------------------------------------------------------------------------------- |
| `proxy.ts`                 | `/api/*` 全体に `apiRateLimiter`（100 req/min）。probe / cron / webhooks は早期 return で除外 |
| 公開フォーム Server Action | Turnstile + 必要に応じて per-IP rate limit                                                    |
| 管理 Server Action         | 認証 + 監査ログで担保（rate-limit 任意）                                                      |

### Cloud Run probe endpoint の除外

`/api/live` / `/api/health` は **`proxy.ts` で rate-limit から除外する**。probe IP が `unknown` で合算され 429 → コンテナ kill 連鎖の silent bug を防ぐ（Cloud Run probe は `x-forwarded-for` 未設定 → `getClientIp()` が `"unknown"` を返し全 probe が同一 bucket に合算される）。

## 3. Cloudflare Turnstile（Bot 保護）

### キー管理

Site Key / Secret Key は **DB の `Settings` テーブル**に暗号化保存（管理画面 `/admin/settings/integrations?tab=turnstile` から設定）。
環境変数には置かない（`NEXT_PUBLIC_TURNSTILE_SITE_KEY` / `TURNSTILE_SECRET_KEY` は不使用）。

### 公式推奨の追加保護（本プロジェクトで全採用）

- **`remoteip` 送信**: クライアント IP を Cloudflare に転送（ボットスコア精度向上）
- **`idempotency_key`**: `crypto.randomUUID()` で毎回生成（ネットワーク失敗時の安全な再検証）
- **`action` binding**: フォーム種別ごとの識別子をトークンに埋め込み、サーバーで検証
- **timeout 10 秒**: 公式推奨値

→ [Cloudflare 公式 siteverify ドキュメント](https://developers.cloudflare.com/turnstile/get-started/server-side-validation/)

### Action 識別子 SSoT

`@/shared/lib/turnstile-actions` の `TURNSTILE_ACTIONS` が全アクションを一元管理。Widget の `data-action` とサーバー側 `expectedAction` 検証で同一値を参照。

制約: alphanumeric + `_` + `-` のみ、**最大 32 文字**。

### クライアント実装

```tsx
"use client";
import { TurnstileWidget } from "@/shared/components/turnstile-widget";
import { TURNSTILE_ACTIONS } from "@/shared/lib/turnstile-actions";

// デフォルト: appearance="always" — Cloudflare 公式デフォルト
<TurnstileWidget
  siteKey={turnstileSiteKey}
  action={TURNSTILE_ACTIONS.inquiry}
  onVerify={(token) => setTurnstileToken(token)}
/>;

// 「見せない」モード（ボット判定時のみ表示、最もクリーンな UX）
<TurnstileWidget
  siteKey={turnstileSiteKey}
  action={TURNSTILE_ACTIONS.inquiry}
  appearance="interaction-only"
  onVerify={(token) => setTurnstileToken(token)}
/>;
```

`appearance` は以下 3 値のみ（`TurnstileAppearance` で型限定）:

- `"always"`（デフォルト・公式標準）— ページロード時から常時表示
- `"interaction-only"` — ボット判定で interaction が必要な時のみ表示
- `"execute"` — プログラム的に `turnstile.execute()` を呼んだ後に表示

### サーバー検証（Server Action）

```typescript
import { validateTurnstile } from "@/shared/lib/action-helpers";
import { TURNSTILE_ACTIONS } from "@/shared/lib/turnstile-actions";

export async function submitInquiry(input: InquiryInput) {
  const turnstile = await validateTurnstile({
    token: input.turnstileToken,
    expectedAction: TURNSTILE_ACTIONS.inquiry,
  });
  if (!turnstile.success) return createMutationError(turnstile.error);

  // remoteip は validateTurnstile が getClientIpFromHeaders() で自動取得
}
```

### Better Auth 統合

`/request-password-reset` と `/reset-password` は `admin-auth.ts` の before hook で Turnstile 保護。クライアントは `x-captcha-response` ヘッダーでトークンを送信（Better Auth 公式 `captcha` プラグインと同一契約）。

```tsx
await adminAuthClient.resetPassword({
  newPassword,
  token,
  fetchOptions: {
    headers: { "x-captcha-response": turnstileToken },
  },
});
```

### 配置基準

- **未認証公開フォーム**: 必須
- **認証済みでも予約・決済等の高リスク操作**: 許容
- **参照系**: 不要

## 4. 荒らし対策

### IP ブロック（Cloudflare WAF で対応）

アプリ層に静的 IP allowlist / blocklist は持たない（hot-reload と運用負荷の問題）。攻撃 IP のブロックは **Cloudflare Dashboard → Security → WAF → Custom Rules** で IP / ASN / Country 単位で運用する。アプリ層は rate limit + Turnstile + 認証で多層防御し、永続化されたブロックリストは CDN 層に集約する。

### スパム検出

- Turnstile が bot trafic を緩和（Layer 2、`siteverify` の `cdata` action 検証込み）
- 同一フォームへの per-IP rate limit（`createRateLimiter`）で burst 抑制
- 内容ベースのフィルタ（禁止ワード / URL 過多）は要件発生時に domain command に追加

## 5. Cloud Run 設定

タイムアウト・スケーリング・リソース制限の値は [`cloudbuild.yaml`](../../cloudbuild.yaml) の substitutions（`_MEMORY` / `_MAX_INSTANCES` 等）が SSoT。詳細パラメータと設計意図は [`deploy.md`](./deploy.md) §9 を参照（`max-instances=1` 運用、`--no-cpu-throttling`、liveness/startup probe は `/api/live` 等）。本書で値を複製しない（drift 防止）。

## 監視・アラート

### 監視項目

- レート制限違反数
- Turnstile 失敗率
- 異常なトラフィックパターン
- エラー率

### アラート設定

- エラー率 > 5%: 警告
- レート制限違反 > 100/分: 警告
- DDoS 検出: Cloudflare ダッシュボード

## インシデント対応（運用手順）

設計レベルの流れは [`../explanation/security-model.md`](../explanation/security-model.md#インシデント対応の流れ) を参照。

実運用での具体的アクション:

1. **検出**: Cloudflare Analytics / Cloud Run 監視で異常検知
2. **確認**: Cloud Logging で攻撃パターン特定
3. **対応**:
   - Cloudflare: **Under Attack Mode** 有効化
   - Cloudflare WAF Custom Rules で攻撃 IP / ASN / Country をブロック（アプリ再デプロイ不要）
4. **収束確認**: トラフィック正常化を確認
5. **記録**: インシデントレポート作成、再発防止策を path-scoped rule に追記

## 関連

- [`../explanation/security-model.md`](../explanation/security-model.md) — セキュリティ設計の「なぜ」
- [`./deploy.md`](./deploy.md) — Cloud Run / Secret Manager / IAM 構成
- [`./cloudflare.md`](./cloudflare.md) — Cloudflare 詳細設定
