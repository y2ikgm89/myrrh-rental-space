# Google Business Profile 連携セットアップガイド

管理画面で更新した拠点情報を Google Business Profile (GBP) に自動同期する機能のセットアップ手順。
API 申請承認待ち期間中でも実装動作確認可能な **Stub mode** を含む。

---

## 1. Google Cloud Console での API 有効化

1. [Google Cloud Console](https://console.cloud.google.com/) で本番運用しているプロジェクトを選択
   （Calendar 連携と同一プロジェクト）
2. 「API とサービス → ライブラリ」から以下 2 件を有効化:
   - **My Business Business Information API** (`mybusinessbusinessinformation.googleapis.com`)
   - **My Business Account Management API** (`mybusinessaccountmanagement.googleapis.com`)

---

## 2. OAuth 2.0 Client ID の設定

既存 `GOOGLE_CLIENT_ID` を流用する。Calendar 連携で利用している OAuth Client に scope と redirect URI を追加するのみ。

### Authorized redirect URI 追加

「API とサービス → 認証情報 → OAuth 2.0 クライアント ID」を編集し、以下を追加:

```
https://<production-domain>/api/google-business-profile/oauth/callback
http://localhost:3000/api/google-business-profile/oauth/callback   # 開発用
```

### OAuth scope の確認

実装上は `https://www.googleapis.com/auth/business.manage` を要求する。
Cloud Console 側で同意画面の「データへのアクセス」セクションにこの scope が含まれることを確認。
含まれていない場合は同意画面の編集で `business.manage` を追加する。

---

## 3. Business Profile API access request 提出

GBP API は事前申請 + 承認が必須（自動承認なし、Google 担当者によるレビュー）。

1. [Business Profile API access form](https://developers.google.com/my-business/content/prereqs) を開く
2. 用途記載例:

   > 自社運営のレンタルスペース予約管理システムで、管理画面で編集した複数拠点の営業時間・電話番号・
   > 住所情報を Google Business Profile に同期する用途で API を使用します。
   > Outbound 一方向 sync のみで、外部顧客の GBP 情報を取得・編集することはありません。

3. 担当者からの追加質問に回答（数日〜数週間で承認）

---

## 4. 承認待ち期間の運用（Stub mode）

API 承認前でも UI / Server Action / domain command の動作確認が可能。

### `.env.local` 設定

```bash
GBP_STUB_MODE=true
```

### 動作

- `syncLocationToGbp(input)` は `syncLocationStub(input)` に早期分岐
- 実 GBP API 呼び出しは行わず `logger.info("GBP sync stubbed", ...)` のみ
- `Location.gbpSyncedAt` / `gbpSyncError` の DB 更新は発生しない（stub mode マーカー）
- 管理画面の「今すぐ同期」ボタンは即座に成功応答を返すため UI 動作は確認可能

承認後は `.env.local` から `GBP_STUB_MODE` を削除（または `false` に）して本番経路に切り替える。
コードの変更は不要。

---

## 5. 承認後の動作確認手順

1. 「設定 → API・連携」で「Google Business Profile」セクションを表示
2. 「Google で連携」ボタン → OAuth consent → 認可完了で Settings に refresh token が保管される
3. 「設定 → API・連携」で「連携済み（accountName 表示）」badge を確認
4. 任意の Location 編集 → MEO タブで `googleBusinessPlaceId` 入力（GBP 側 location resource name、`locations/{id}` 形式）
5. 拠点情報を保存 → `afterSuccess` で `fireAndForget(syncLocationToGbpCommand)` が実行される
6. 数秒後に Location 一覧ページで「同期済」badge が表示されることを確認
7. 「今すぐ同期」ボタンでも手動 trigger 可能

---

## 6. トラブルシューティング

### `gbp_error=missing_code` / `gbp_error=callback_failed`

OAuth callback で code が取れていない / token exchange 失敗。
Cloud Console の redirect URI 設定と本番 / 開発環境の domain が一致しているか確認。

### `gbp_error=no_accounts_found`

OAuth 認可した Google アカウントに紐づく GBP account が存在しない。
GBP 側で事業者アカウント作成 + 拠点登録を先に完了させる必要あり。

### `LocationTable` で「エラー」badge + tooltip メッセージ

`Location.gbpSyncError` に最後の sync 失敗理由が記録されている。
代表的なケース:

- **403 forbidden** — API 申請が承認されていない / scope が不足 / `business.manage` scope を消したまま token を保存
- **401 unauthorized** — refresh token が無効化された（admin が GBP 側で連携解除した等）→ 「設定 → API・連携」で再連携
- **NOT_FOUND** — `googleBusinessPlaceId` が間違っている / 該当 location が削除されている
- **rate limit** — 短時間で大量同期発生（拠点数 100+ で全件同時保存等）→ Phase 3 で rate limit 対応予定

### token expiry

`googleapis` SDK が refresh token を自動使用して access token を更新する。
更新された access token は `oauth2Client.on("tokens", ...)` イベントで `saveGbpAuthState` 経由で
Settings に再保管される（手動操作不要）。

---

## 7. 連携解除手順

1. 「設定 → API・連携 → Google Business Profile」セクションの「連携を解除」ボタン
2. AlertDialog で確認 → `revokeGbpAuth` Server Action 実行
3. `oauth2Client.revokeToken(refreshToken)` で Google 側の token を失効
4. `clearGbpAuthState()` で Settings から auth state を削除
5. UI が「未連携」状態に戻る

連携解除後は同期試行が「GBP 連携未設定」エラーで早期 return する（業務継続には影響なし）。
