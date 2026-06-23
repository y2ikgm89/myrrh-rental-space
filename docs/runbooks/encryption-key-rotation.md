# Encryption Key Rotation Runbook

## 対象

`ENCRYPTION_KEY` を回転させる手順。以下の at-rest 暗号文に影響する:

- Stripe 秘密鍵（`Settings.stripeSecretKey` 等）
- Google OAuth tokens（Better Auth の `account.accessToken` / `refreshToken` を application 層で暗号化）
- 外部 API keys（`Settings.resendApiKey` 等）
- ゲストキャンセルトークン（ステートレス・受信者メールボックスのみ・next exp で自然失効）

## ワイヤ形式（クリーン実装）

[`src/shared/lib/crypto.ts`](../../src/shared/lib/crypto.ts) は **v2** 形式で encrypt し、v1（kid 無し）/ v2（kid 入り）両方を decrypt できる。

```
v2:<kid>:<purpose>:<iv_b64>:<authTag_b64>:<ct_b64>   ← 新規 encrypt
v1:<purpose>:<iv_b64>:<authTag_b64>:<ct_b64>          ← 旧データのみ（decrypt fallback）
```

## 環境変数

| 変数                     | 役割                                                                                               |
| ------------------------ | -------------------------------------------------------------------------------------------------- |
| `ENCRYPTION_KEY`         | **primary**（新規 encrypt に使う、hex64 = 32 bytes）                                               |
| `ENCRYPTION_KEY_ID`      | primary の kid。`v1` / `v2` / `k20260623` 等の識別子（1-32 文字 `[a-zA-Z0-9_-]`）。未指定なら `v1` |
| `ENCRYPTION_KEYS_LEGACY` | 旧鍵の decrypt fallback リスト。`<kid>:<hex64>,<kid>:<hex64>` 形式。空可                           |

すべて `serverEnv` (`src/shared/lib/env/server.ts`) で Zod 検証される。本番起動時は `validateProductionEnv()` が `ENCRYPTION_KEY` の存在 + hex 文字種を強制する。

## ローテーション手順（破壊なし、段階的）

### 0. 事前準備

```bash
# 新鍵を発行
openssl rand -hex 32  # → 64 文字の hex（例: a1b2c3...）
# 新 kid を決定（例: v2、もしくは ISO 日付ベース k20260623）
```

### 1. Legacy リストに現行鍵を移動 + primary を新鍵へ

Secret Manager（本番）で:

```env
ENCRYPTION_KEY=<新 hex>
ENCRYPTION_KEY_ID=<新 kid>
ENCRYPTION_KEYS_LEGACY=<旧 kid>:<旧 hex>
```

`ENCRYPTION_KEY_ID` が無かった場合、旧 kid は `v1`（デフォルト）。

deploy 後の挙動:

- 既存暗号文（旧鍵で書かれた v1 / v2）は `ENCRYPTION_KEYS_LEGACY` 経由で復号成功
- 新規 encrypt はすべて新 primary で書かれる
- ゲストキャンセルトークン（メール送信済）も exp までは復号可能（旧鍵が legacy にある間）

### 2. at-rest 再暗号化（段階移行）

primary 化されていない既存暗号文を順次 re-encrypt する。重要度順:

1. **Stripe 秘密鍵**（admin が一度開いて保存し直すだけで OK・少数）
2. **Google OAuth tokens**（次回 token refresh 時に application 層が再暗号化）
3. **外部 API keys**（admin 保存で書き直し）

スクリプト化する場合は `isEncryptedWithPrimary(ciphertext)` で primary 化済みかチェック → false なら `decrypt → encrypt` で primary 化する小バッチ job を組む。

### 3. Legacy 鍵を撤去

at-rest が全て primary になったら（モニタリング: ログで `No encryption key available for kid="..."` が一定期間出ないことを確認）:

```env
ENCRYPTION_KEYS_LEGACY=  # 空文字（emptyStringAsUndefined で undefined）
```

deploy 後、旧鍵は decrypt 経路から完全消失する。

## 緊急ローテーション（鍵漏洩時）

旧鍵が compromised の疑いがある場合は、上記手順を加速する:

1. ステップ 1 を即実施（新鍵へ）
2. ステップ 2 を最優先で完遂（Stripe / OAuth を手動全件再保存）
3. ステップ 3 で旧鍵を即時撤去
4. **ゲストキャンセルトークン**: 旧鍵で書かれた既発行トークンは旧鍵撤去で無効化される。ユーザー影響は受信箱の link 切れのみ（exp 内であれば再送可能）

## 影響範囲とリスク

- **影響を受けない**: HMAC-SHA256 のみで生成される signed tokens（`ADMIN_LOGIN_TOKEN` 等）
- **影響を受ける**: AES-256-GCM で encrypt されたあらゆる at-rest データ
- **致命的なリスク**: `ENCRYPTION_KEY` だけ差し替えて `ENCRYPTION_KEYS_LEGACY` に旧鍵を入れ忘れる → 旧データ全て decrypt 失敗（Stripe 決済 / OAuth ログイン即死）

## 検証

`src/shared/lib/crypto.ts` の `encrypt`/`decrypt` round-trip テスト + 旧 v1 形式の decrypt fallback テストが `__tests__/unit/shared/lib/crypto.test.ts` にある。本 runbook の手順変更時は併せて test を追加すること。
