# 保護対策

DDoS対策・レート制限・Bot保護の統合ガイド。

## 多層防御アーキテクチャ

```
[攻撃者]
    ↓
[Cloudflare] ─── L3/L4 DDoS保護（自動）
    ↓
[Cloud Run] ─── タイムアウト（60秒）、スケーリング制限
    ↓
[Middleware] ─── グローバルレート制限
    ↓
[Server Action] ─── エンドポイント別レート制限 + Turnstile
    ↓
[データベース]
```

## 1. Cloudflare DDoS保護

### 無料プランで利用可能

- L3/L4 DDoS自動保護
- HTTP Flood対策
- Slowloris攻撃対策

### 設定

1. ドメインをCloudflareに追加
2. DNS設定でプロキシ有効化（オレンジ雲）
3. SSL/TLS: Full (Strict)

## 2. レート制限

### @upstash/ratelimit

```typescript
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

const ratelimit = new Ratelimit({
  redis: Redis.fromEnv(),
  limiter: Ratelimit.slidingWindow(10, "10 s"),
  analytics: true,
});
```

### エンドポイント別設定

| エンドポイント | 制限      |
| -------------- | --------- |
| ログイン       | 10回/10秒 |
| 予約フォーム   | 5回/分    |
| お問い合わせ   | 3回/分    |
| API一般        | 100回/分  |

### 実装例

```typescript
export async function createReservation(data: Input) {
  const headersList = await headers();
  const ip = headersList.get("x-forwarded-for")?.split(",")[0] ?? "unknown";

  const { success, remaining } = await ratelimit.limit(ip);

  if (!success) {
    return createFailure("リクエストが多すぎます。しばらくお待ちください。");
  }

  // 処理続行
}
```

## 3. Cloudflare Turnstile

### 概要

Cloudflare の無料 Bot 保護サービス。reCAPTCHA の代替。

### キー管理

Site Key / Secret Key は **DB の `Settings` テーブル**に暗号化保存（管理画面 `/admin/settings/security-integrations` から設定）。
環境変数には置かない（`NEXT_PUBLIC_TURNSTILE_SITE_KEY` / `TURNSTILE_SECRET_KEY` は不使用）。

### 公式推奨の追加保護（本プロジェクトで全採用）

- **`remoteip` 送信**: クライアント IP を Cloudflare に転送（ボットスコア精度向上）
- **`idempotency_key`**: `crypto.randomUUID()` で毎回生成（ネットワーク失敗時の安全な再検証）
- **`action` binding**: フォーム種別ごとの識別子をトークンに埋め込み、サーバーで検証
- **timeout 10 秒**: 公式推奨値

→ 参照: [Cloudflare 公式 siteverify](https://developers.cloudflare.com/turnstile/get-started/server-side-validation/)

### Action 識別子 SSoT

`@/shared/lib/turnstile-actions` の `TURNSTILE_ACTIONS` が全アクションを一元管理。
Widget の `data-action` とサーバー側 `expectedAction` 検証で同一値を参照。

制約: alphanumeric + `_` + `-` のみ、**最大 32 文字**。

### クライアント

```tsx
"use client";
import { TurnstileWidget } from "@/public/components/ui/turnstile-widget";
import { TURNSTILE_ACTIONS } from "@/shared/lib/turnstile-actions";

// デフォルト: appearance="always" — Cloudflare 公式デフォルト、Bot 保護の UI を明示
<TurnstileWidget
  siteKey={turnstileSiteKey}
  action={TURNSTILE_ACTIONS.inquiry}
  onVerify={(token) => setTurnstileToken(token)}
/>;

// 「見せない」モード（ボット判定時のみ widget を表示、最もクリーンな UX）
<TurnstileWidget
  siteKey={turnstileSiteKey}
  action={TURNSTILE_ACTIONS.inquiry}
  appearance="interaction-only"
  onVerify={(token) => setTurnstileToken(token)}
/>;
```

`appearance` は以下 3 値のみ（`TurnstileAppearance` で型限定）:

- `"always"`（デフォルト・公式標準） — ページロード時から常時表示。Bot 保護の UI を明示し、ユーザーに「検証中」のフィードバックを提供
- `"interaction-only"` — ボット判定で interaction が必要な時のみ表示。ほぼ全ての人間ユーザーには widget が見えない最もクリーンな UX
- `"execute"` — プログラム的に `turnstile.execute()` を呼んだ後に表示（高度ユースケース）

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

  // 処理続行（remoteip は validateTurnstile が getClientIpFromHeaders() で自動取得）
}
```

### Better Auth 統合

`/request-password-reset` と `/reset-password` は `admin-auth.ts` の before hook で Turnstile
保護。クライアントは `x-captcha-response` ヘッダーでトークンを送信（Better Auth 公式
`captcha` プラグインと同一契約）。

```tsx
await adminAuthClient.resetPassword({
  newPassword,
  token,
  fetchOptions: {
    headers: { "x-captcha-response": turnstileToken },
  },
});
```

## 4. 荒らし対策

### IPブロック

```typescript
const BLOCKED_IPS = new Set([
  // 悪意のあるIPを追加
]);

export function isBlocked(ip: string): boolean {
  return BLOCKED_IPS.has(ip);
}
```

### スパム検出

- 同一内容の連続投稿検出
- 禁止ワードフィルタ
- URL過多検出

## 5. Cloud Run設定

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
- Turnstile失敗率
- 異常なトラフィックパターン
- エラー率

### アラート設定

- エラー率 > 5%: 警告
- レート制限違反 > 100/分: 警告
- DDoS検出: Cloudflareダッシュボード

## インシデント対応

1. **検出**: Cloudflare Analytics / Cloud Run監視
2. **確認**: ログで攻撃パターン特定
3. **対応**:
   - Cloudflare: Under Attack Mode有効化
   - アプリ: IPブロック追加
4. **収束確認**: トラフィック正常化を確認
5. **記録**: インシデントレポート作成
