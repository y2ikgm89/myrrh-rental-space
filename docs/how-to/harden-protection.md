# 保護対策の設定

最終更新: 2026-04-29

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

## 2. レート制限（@upstash/ratelimit）

### 設定

```typescript
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

const ratelimit = new Ratelimit({
  redis: Redis.fromEnv(),
  limiter: Ratelimit.slidingWindow(10, "10 s"),
  analytics: true,
});
```

### エンドポイント別の制限値

| エンドポイント | 制限        |
| -------------- | ----------- |
| ログイン       | 10 回/10 秒 |
| 予約フォーム   | 5 回/分     |
| お問い合わせ   | 3 回/分     |
| API 一般       | 100 回/分   |

### 実装例

```typescript
export async function createReservation(data: Input) {
  const headersList = await headers();
  const ip = headersList.get("x-forwarded-for")?.split(",")[0] ?? "unknown";

  const { success } = await ratelimit.limit(ip);
  if (!success) {
    return createFailure("リクエストが多すぎます。しばらくお待ちください。");
  }

  // 処理続行
}
```

### Cloud Run probe endpoint の除外

`/api/live` / `/api/health` は **`proxy.ts` で rate-limit から除外する**。probe IP が `unknown` で合算され 429 → コンテナ kill 連鎖の silent bug を防ぐ。

## 3. Cloudflare Turnstile（Bot 保護）

### キー管理

Site Key / Secret Key は **DB の `Settings` テーブル**に暗号化保存（管理画面 `/admin/settings/security-integrations` から設定）。
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
import { TurnstileWidget } from "@/public/components/ui/turnstile-widget";
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

### IP ブロック

```typescript
const BLOCKED_IPS = new Set([
  // 悪意のある IP を追加
]);

export function isBlocked(ip: string): boolean {
  return BLOCKED_IPS.has(ip);
}
```

### スパム検出

- 同一内容の連続投稿検出
- 禁止ワードフィルタ
- URL 過多検出

## 5. Cloud Run 設定

### タイムアウト

```yaml
annotations:
  run.googleapis.com/timeout: "60s"
```

### スケーリング制限

```yaml
annotations:
  autoscaling.knative.dev/maxScale: "10"
  autoscaling.knative.dev/minScale: "0"
```

### リソース制限

```yaml
resources:
  limits:
    cpu: "1"
    memory: 512Mi
```

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
   - アプリ: `BLOCKED_IPS` に追加 → デプロイ
4. **収束確認**: トラフィック正常化を確認
5. **記録**: インシデントレポート作成、再発防止策を path-scoped rule に追記

## 関連

- [`../explanation/security-model.md`](../explanation/security-model.md) — セキュリティ設計の「なぜ」
- [`./deploy.md`](./deploy.md) — Cloud Run / Secret Manager / IAM 構成
- [`./cloudflare.md`](./cloudflare.md) — Cloudflare 詳細設定
