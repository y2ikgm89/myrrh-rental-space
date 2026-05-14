# セキュリティモデル

このプロジェクトのセキュリティ設計の「なぜ」を説明する。具体的な保護対策の手順は [`../how-to/harden-protection.md`](../how-to/harden-protection.md) を参照。

## 多層防御

```
[ユーザー / 攻撃者]
      ↓
[Cloudflare]    ─── L3/L4 DDoS、HTTP Flood、Bot 保護（自動）
      ↓
[Cloud Run]     ─── タイムアウト 60 秒、スケーリング上限
      ↓
[proxy.ts]      ─── coarse gate、CSP、admin gate
      ↓
[Server Action / Route Handler]
                ─── 認証 + 認可 + Zod + レート制限 + Turnstile
      ↓
[Domain layer]  ─── 業務ルール + RBAC（FORBIDDEN）
      ↓
[Prisma]        ─── prepared statement で SQL injection 不可
      ↓
[PostgreSQL]    ─── 暗号化保存（at-rest は Cloud SQL / managed）
```

各レイヤーで失敗が次のレイヤーに到達しない設計。中間層（`proxy.ts`）は「coarse gate」に限定し、本認可はドメイン層に集約する。

## 認証・認可

### 認証スタック

| コンポーネント | 採用                                                |
| -------------- | --------------------------------------------------- |
| 認証ライブラリ | Better Auth（管理用 / 顧客用の dual-instance）      |
| パスワード     | scrypt（Better Auth デフォルト）                    |
| セッション     | HttpOnly + Secure + SameSite=Lax Cookie             |
| アダプタ       | Prisma adapter（拡張前 `basePrisma` を渡す）        |
| プロバイダー   | Email/Password、Google OAuth（Calendar scope 含む） |

### Dual-instance 設計

管理 (`adminAuth`) と顧客 (`customerAuth`) は **別の Better Auth インスタンス**。Cookie prefix と generateId 設定を分離し、session 漏洩の経路を物理的に断つ。

- `src/shared/lib/auth.ts` — 管理用静的 export `auth`
- `src/shared/lib/customer-auth.ts` — 顧客用静的 export
- 動的 `getAuth()` の再導入は禁止（cache 不整合の silent bug）

### RBAC モデル

```typescript
enum Role {
  ADMIN = "ADMIN", // 全管理機能
  EDITOR = "EDITOR", // コンテンツ編集
  VIEWER = "VIEWER", // 閲覧のみ
  USER = "USER", // 顧客（管理画面アクセス不可）
}
```

#### 権限チェックの階層

| レイヤー         | 役割                                         | 例                                    |
| ---------------- | -------------------------------------------- | ------------------------------------- |
| Server Action    | `executeAdminMutationResult` で一括ラップ    | 認証 + 権限 + 監査ログ + cache 無効化 |
| Route Handler    | `checkPermission()` を直接呼ぶ               | API Route のみ                        |
| Server Component | `verifyAdminSession()` で未認証なら redirect | `await verifyAdminSession()`          |
| Domain command   | `canInviteRole()` / `canModifyUser()`        | 階層制御の 2 層防御（UI + domain）    |

管理ユーザー操作（招待・作成・ロール変更・削除）は **UI と domain の 2 層**で強制する。UI で `getInvitableRoles(actorRole)` の結果しか選べない + domain で `DomainError("FORBIDDEN")` を投げる。

### セッション設定

```typescript
session: {
  expiresIn: 60 * 60 * 24 * 30, // 30 日
  updateAge: 60 * 60 * 24,      // 24 時間ごとに更新
  cookieCache: {
    enabled: true,
    maxAge: 60 * 5,              // 5 分間キャッシュ
  },
}
```

詳細は `.claude/rules/auth-patterns/sessions.md`（Claude Code）と `.agents/skills/auth-rbac-change/SKILL.md`（Codex）を参照。

## 入力境界の設計

### Zod による契約

すべての外部入力は **Zod スキーマで `safeParse`** する。`parse` は throw で flow を破壊するため使わない。

```typescript
const result = schema.safeParse(input);
if (!result.success) {
  return createFailure("入力エラー", result.error.flatten().fieldErrors);
}
```

#### 設計原則

- **配列 uniqueness は Zod 層で契約**: UI 層の Set dedup は禁止（→ `.claude/rules/zod-patterns/array-uniqueness.md`）
- **cross-field validation は top-level refine** に置く（field 間制約を 1 箇所に集約）
- **datetime-local は Zod カスタムスキーマで coerce** する
- **Mutually exclusive boolean** は discriminated union で表現

### 信用境界

| 入力源                                | 検証                                  |
| ------------------------------------- | ------------------------------------- |
| ユーザーフォーム / Query / Path Param | Zod 必須                              |
| 外部 API（Google / Stripe / R2）      | レスポンスを Zod または型ガードで検証 |
| 内部 domain → UI                      | TypeScript 型で十分（境界を超えない） |
| Prisma → domain                       | 生成型でそのまま受ける                |

内部 code には防御的コードを書かない（型 + 単体テストで担保）。

## 暗号化

### 保存時暗号化

| 対象                    | 方式                                            |
| ----------------------- | ----------------------------------------------- |
| API キー / シークレット | AES-256-GCM（`ENCRYPTION_KEY` 環境変数）        |
| パスワード              | scrypt（Better Auth）                           |
| Server Action 引数      | `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` で encrypt |

### 鍵管理

- 全シークレットは Google Secret Manager 経由（`secretmanager.secretAccessor` ロール）
- 環境変数に直書きしない
- Turnstile Site/Secret Key は **DB の `Settings` テーブルに暗号化保存**（管理画面から設定）

## CSRF / XSS / セキュリティヘッダー

### CSRF

- Next.js Server Actions は自動 CSRF 保護
- SameSite=Lax Cookie

### XSS

- Lexical → HTML 変換時に **DOMPurify** で allowlist 方式のサニタイズを行う
- ユーザー入力を生 HTML として埋め込むルートはレビュー必須（DOMPurify 通過必須）

### セキュリティヘッダー

`next.config.ts` で設定:

```typescript
headers: [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Content-Security-Policy", value: "..." },
];
```

CSP は `proxy.ts` で nonce を生成し動的に注入する（インライン script を許容しない）。

## ログ・監査

### 監査ログ（永続）

管理 mutation は `executeAdminMutationResult` の `fireAndForget(logAction)` で **必ず**監査ログに記録される（実行順序契約: `execute → await afterSuccess → fireAndForget(logAction)`）。

ログ項目: actor user / action / resource / before-after diff / timestamp。

### 構造化ログ（一時）

レート制限違反、認証失敗、不正アクセスは JSON で stdout に出力 → Cloud Logging に集約。

```typescript
console.log(
  JSON.stringify({
    level: "warn",
    type: "rate_limit_violation",
    ip: ipAddress,
    timestamp: new Date().toISOString(),
  }),
);
```

### ログに出さないもの

- パスワード（ハッシュ前後とも）
- セッショントークン
- 暗号化前の API キー / シークレット
- 顧客の個人情報（メール以外）

## 攻撃対策の責務分担

| 攻撃                   | 防御レイヤー                          |
| ---------------------- | ------------------------------------- |
| DDoS (L3/L4)           | Cloudflare（自動）                    |
| DDoS (L7)              | Cloudflare + Cloud Run scaling 上限   |
| ブルートフォース       | レート制限 + Turnstile + scrypt       |
| Bot                    | Turnstile（Cloudflare 公式）          |
| SQL Injection          | Prisma の prepared statement          |
| XSS                    | DOMPurify allowlist + CSP             |
| CSRF                   | Server Actions 自動 + SameSite Cookie |
| セッションハイジャック | HttpOnly + Secure + 定期更新          |
| Session 漏洩           | dual-instance + Cookie prefix 分離    |

## インシデント対応の流れ

1. **検出**: Cloudflare Analytics、Cloud Logging アラート、エラー率監視
2. **封じ込め**: Cloudflare Under Attack Mode、IP ブロック、機能停止
3. **調査**: 構造化ログ + 監査ログで影響範囲特定
4. **復旧**: 修正 → ステージング → `bun run validate && bun run build` → デプロイ
5. **報告**: インシデントレポート、再発防止策（path-scoped rule への追記など）

## 関連

- [`../how-to/harden-protection.md`](../how-to/harden-protection.md) — Turnstile / レート制限 / Cloud Run の設定手順
- [`../how-to/deploy.md`](../how-to/deploy.md) — IAM / Secret Manager / デプロイ
- `.claude/rules/auth-patterns/**` — Claude Code 用の path-scoped 認証・セキュリティルール
- `.agents/skills/auth-rbac-change/` — Codex 用の認証変更ワークフロー
