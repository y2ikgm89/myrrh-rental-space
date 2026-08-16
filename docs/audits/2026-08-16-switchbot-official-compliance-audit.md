# SwitchBot 公式準拠監査（2026-08-16）

**対象:** SwitchBot 連携全体（Keypad パスコード発行/失効・webhook・錠状態監視・設定 UI・cron・terraform）
**公式仕様ソース:** [OpenWonderLabs/SwitchBotAPI](https://github.com/OpenWonderLabs/SwitchBotAPI) `main`（2026-08-16 live 取得。v1.1 が現行最新。v2.0 は存在しない）
**前提:** 本番未導入（連携 ON 前）。実機検証は可能（実機 + 本番トークン）
**既存設計 SSoT:** [2026-07-24-switchbot-official-clean-redesign.md](../superpowers/specs/2026-07-24-switchbot-official-clean-redesign.md) / [2026-07-26-switchbot-audit-hardening.md](../superpowers/plans/2026-07-26-switchbot-audit-hardening.md)

## 総評

**致命的エラー・公式非準拠の重大違反は検出されなかった。** 2026-07-24 redesign と 2026-07-26 hardening の成果で、認証・コマンド形式・非同期セマンティクス・webhook 防御の骨格は公式準拠。findings は軽微な修正 3 件・要実機確定 2 件・報告のみ 4 件。

## 公式適合が確認できた領域（監査証跡）

| 領域                 | 公式仕様                                                                                                                                                                                                                                                                                                                                                                                             | 実装                                                                                                                                                                                                                                                        | 判定 |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| 認証署名             | HMAC-SHA256(`token + t + nonce`、区切りなし UTF-8) → raw 32byte の標準 Base64。`t` は 13 桁 ms。`Authorization` に Bearer なし（[README — How to Sign](https://github.com/OpenWonderLabs/SwitchBotAPI/blob/main/README.md)）                                                                                                                                                                         | `buildAuthHeaders`（[switchbot-client.ts:60-75](../../src/shared/lib/smart-lock/switchbot-client.ts)）が公式 JS/Python サンプルと一致。大文字化は公式サンプル間で不整合（散文は uppercase、JS/Python/C#/Java/Swift は非大文字）で、本実装は多数派の非大文字 | 適合 |
| createKey            | `POST /v1.1/devices/{id}/commands` に `{commandType:"command", command:"createKey", parameter:{name, type, password, startTime, endTime}}`。type は `permanent\|timeLimit\|disposable\|urgent`、password は 6〜12 桁平文、startTime/endTime は **10 桁秒**で timeLimit/disposable のみ必須（[keypad.md](https://github.com/OpenWonderLabs/SwitchBotAPI/blob/main/devices/locks-security/keypad.md)） | `createPasscode` が形式通り。`timeLimit` + 6 桁 + `Math.floor(ms/1000)` の秒変換（[issue-passcode.ts:244-251](../../src/shared/domain/smart-lock/issue-passcode.ts)）                                                                                       | 適合 |
| keyId の SSoT        | `keyList` は `GET /devices` にのみ存在。status API の Keypad 応答は `deviceId/deviceType/hubDeviceId` のみ（keypad.md）                                                                                                                                                                                                                                                                              | `findKeyInDeviceList` / `findKeyByIdInDeviceList` が Device List のみ使用。status API は錠の lockState/doorState/battery 専用（`getLockDeviceStatus`）                                                                                                      | 適合 |
| 非同期セマンティクス | 「createKey/deleteKey の実結果は webhook 経由でのみ非同期配送」「webhook の設定が必要」（keypad.md）。statusCode:100 は受理の意味。commandId ポーリング用エンドポイントは存在しない                                                                                                                                                                                                                  | webhook 正本 + Device List 疎 poll 副経路（最大 5 回/45s）+ stale cron（30 分）の三段構え                                                                                                                                                                   | 適合 |
| webhook 検証         | 公式に署名・共有シークレット・IP リストの**記載が一切ない**（README 全文確認済み）                                                                                                                                                                                                                                                                                                                   | path token（timing-safe 比較、失敗は 404）+ `deviceMac` 既知照合の二重防御。公式に機構がない以上これが妥当                                                                                                                                                  | 適合 |
| lockState 表記       | webhook は大文字（`LOCKED/UNLOCKED/JAMMED`）、status API は小文字（`lock/unlock/jammed`）                                                                                                                                                                                                                                                                                                            | webhook 経路はそのまま保存（大文字前提）、status refresh 経路は `normalizeLockState`/`normalizeDoorState` で大文字正規化（[commands.ts:34-55](../../src/shared/domain/smart-lock/commands.ts)）                                                             | 適合 |
| レート制限           | 10,000 req/日/token。超過は 429 ではなく **HTTP 401 "Unauthorized"**                                                                                                                                                                                                                                                                                                                                 | Device List TTL キャッシュ（3s・失敗はキャッシュしない）+ 疎 poll で抑制                                                                                                                                                                                    | 適合 |
| webhook 登録         | setupWebhook は `deviceList:"ALL"` のみ                                                                                                                                                                                                                                                                                                                                                              | 管理画面「Webhookを登録」→ `setupWebhook`、回転は delete(旧)→新 token→DB 先更新→setup(新) の順で旧 URL を即無効化                                                                                                                                           | 適合 |

## Findings

### S-1（実機確定・修正）createKey 応答の commandId 必須仮定

|        |                                                                                                                                                         |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 深刻度 | 高（webhook 正本経路が実機で機能しない）                                                                                                                |
| 箇所   | `src/shared/lib/smart-lock/switchbot-client.ts` `createPasscode` / `src/shared/domain/smart-lock/issue-passcode.ts:278-281` / `webhook-commands.ts:167` |

**実機検証結果（2026-08-16、Keypad Touch 実機 + 本番 API、`scripts/switchbot-live-probe.ts`）:**

```json
{
  "step": "createKey.response",
  "httpStatus": 200,
  "statusCode": 100,
  "message": "success",
  "body": {},
  "hasCommandId": false
}
```

Keypad Touch 実機は createKey 応答に `commandId` を**返さない**（`body: {}`）。公式は Keypad の createKey 応答例で `body.commandId` を示すが、全コマンドで返るとは文書上保証されていない（Bot の例も `body: {}`）。現行は:

- `createPasscode` の戻り型が `{ commandId: string }` 必須（ランタイムでは常に undefined になる型の嘘）
- deleteKey 側は `{ commandId?: string }` で防御済み（非対称）
- webhook createKey 相関は `if (!payload.commandId) return false` で commandId 必須

実害: `switchbotCommandId` 列は常に null のまま保存され、**公式が正本とする webhook 確定経路が実機では事実上機能しない**。S-7 の通り keyList 反映は 120 秒超で現行 poll 上限 45 秒では確定できないため、45 秒超で PENDING 残存 → 確認メールは issuanceFailed 付きで送出され、webhook（到着していれば）または stale cron 頼みになる。

**修正方針（別 PR で実施）:**

1. `createPasscode` を `{ commandId?: string }` に（deleteKey と対称）
2. `issue-passcode.ts` は commandId があるときだけ保存
3. webhook createKey 相関にフォールバック追加（commandId → keyName/`buildPasscodeName` 突合 → デバイス上の PENDING 1 件帰属。deleteKey の tier 構造と対称）

### S-2（修正済み PR #2365）cron route コメントが実装と矛盾

|        |                                                      |
| ------ | ---------------------------------------------------- |
| 深刻度 | 低（ドキュメント陳腐化）                             |
| 箇所   | `src/app/api/cron/smart-lock-cleanup/route.ts:43-46` |

「DB 読み書きのみで完結、外部 API 呼び出しなし」とあるが、`expireStalePendingSmartLockPasscodes` は credentials があれば `recoverPendingPasscodeViaDeviceList` で Device List を呼ぶ（[revoke-passcode.ts:498-507](../../src/shared/domain/smart-lock/revoke-passcode.ts)）。運用者がコメントを信じると誤診断する。**修正:** コメントを実装に合わせる。

### S-3（修正済み PR #2366）HTTP 401 の誤分類

|        |                                                             |
| ------ | ----------------------------------------------------------- |
| 深刻度 | 低                                                          |
| 箇所   | `src/shared/lib/smart-lock/switchbot-client.ts` `request()` |

日次 10,000 回超過・トークン無効の 401 は body が `{"message":"Unauthorized"}` で envelope の `statusCode` を持たないため「予期しない形式の応答が返されました」に分類される（公式: 超過時は 429 ではなく 401）。運用時に「認証切れ/上限到達」と「SwitchBot 側の障害・仕様変更」を区別できない。**修正:** `request()` で `response.status === 401` を識別し「認証エラーまたは日次リクエスト上限」と分かるメッセージを返す。

### S-4（報告のみ・機能提案）queryWebhookUrls 未配線

`queryWebhookUrls`（[switchbot-client.ts:386-394](../../src/shared/lib/smart-lock/switchbot-client.ts)）は実装済みだが admin UI/actions から未使用。runbook も「アプリからは確認できない」と明記。本番導入時の検証性向上のため接続テスト結果への同時表示を**提案**するが、機能追加のため本監査の修正スコープには含めない。

### S-5（報告のみ・承認済み非ゴール）再議論しない項目

2026-07-24 spec §7 / §4b で承認済みの非ゴール: webhook での doorState 更新なし（公式 webhook payload に doorState が無いため正しい）、遠隔 lock/unlock なし、パスコード 6 桁（6→12 の変更は非ゴール）。

### S-6（修正済み PR #2367）2026-07-26 hardening 計画書のチェックボックス未更新

実装済み（`getDecryptedSwitchBotCredentialsForRevocation`、keyName 相関、timeOfSample 単調性、assignment-side-effects 等）なのに `[ ]` のまま。本 PR で現状化する。

### S-7（実機確定）Keypad Touch 実機挙動の確認結果

Phase B-1 の実機検証（2026-08-16、`scripts/switchbot-live-probe.ts`、Keypad Touch 実機 + 本番トークン）で確定:

1. 認証署名は受理される（`GET /devices` statusCode 100、非大文字 Base64 で通る）
2. createKey 応答 body に `commandId` は**含まれない**（S-1 へ）
3. **createKey → Device List `keyList` 出現は 120 秒超**（poll 0/5/15/30/45/60/90/120s で未出現。一方 key 自体は SwitchBot アプリ上で即座に存在を確認 = 物理作成は成功）。現行の疎 poll 上限 45 秒では keyId 物質化は間に合わず、webhook 正本経路（S-1 修正後）と stale cron が実質の確定経路になる
4. （probe は keyId 未取得のため deleteKey 未到達。残置 key は `--cleanup` モードで回収可能）

webhook 実配信の検証（`eventName` 末尾スペース、commandId/keyName 有無、timeOfSample 型）は公開 URL が必要なため、**本番導入時チェックリスト**（下記）に回す。

### S-8（報告のみ）cron の attempt_deadline と逐次処理の worst case

Cloud Scheduler の `attempt_deadline = 300s`（[cloud_scheduler.tf:251](../../terraform/cloud_scheduler.tf)）に対し、`processPendingSmartLockReissues` は `take: 50` を逐次処理し、各件は revoke 確認 poll + issue poll（各最大 45s）を含みうる。worst case は deadline を大きく超えるが、Scheduler はタイムアウト時 retry（retry_count 3）し、処理は `@@unique([reservationId, deviceId])` と pending flag で冪等。実害は低く、連携 ON 直後は pending 件数も少数。報告のみ。

### S-9（報告のみ・設計判断済み）deleteKey webhook tier-3 相関の誤帰属リスク

`findRevokePendingPasscodeForDeleteWebhook`（[webhook-commands.ts:99-109](../../src/shared/domain/smart-lock/webhook-commands.ts)）は commandId/keyName が無い場合、デバイス上の REVOKE_PENDING が 1 件なら無条件で帰属する。同デバイスで複数 REVOKE_PENDING が同時進行した場合は帰属しない（安全側）。意図的な設計判断として記録。

## 本番導入時チェックリスト（B-2: webhook 実配信検証）

連携 ON にする導入作業時に、公開環境のログで以下を確認すること:

- [ ] 管理画面「Webhookを登録」後、実機への createKey で webhook が `operation: "switchbotWebhook"` 付きログなく handled で処理されること
- [ ] webhook payload の `eventName`（`"deleteKey "` 末尾スペースの有無）、`commandId`/`keyName` の有無、`timeOfSample` の型（秒）を Cloud Logging の実ログで確認し、route の Zod スキーマ防御範囲内であること
- [ ] `X-RateLimit-*` ヘッダと 429 非発生（`infraEndpointRateLimiter` 300/min/IP）
- [ ] deleteKey の webhook 相関（commandId 一致 → REVOKED）が実ログで確認できること

## 参照

- 公式: [SwitchBotAPI README](https://github.com/OpenWonderLabs/SwitchBotAPI/blob/main/README.md) / [keypad.md](https://github.com/OpenWonderLabs/SwitchBotAPI/blob/main/devices/locks-security/keypad.md) / [keypad-touch.md](https://github.com/OpenWonderLabs/SwitchBotAPI/blob/main/devices/locks-security/keypad-touch.md) / [lock.md](https://github.com/OpenWonderLabs/SwitchBotAPI/blob/main/devices/locks-security/lock.md)
- 実運用報告: [Issue #408](https://github.com/OpenWonderLabs/SwitchBotAPI/issues/408)（/status 空・/devices に keyList）、[Issue #345](https://github.com/OpenWonderLabs/SwitchBotAPI/issues/345)（webhook 欠落・payload 揺れ）
- 過去監査: F-24/F-25/F-67/F-68（2026-08-12 監査、全て PR #2263 で修正済み）
