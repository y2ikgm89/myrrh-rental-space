# 0027. Google Business Profile (GBP) 同期は OAuth-based outbound 一方向 + stub mode

- Status: Accepted
- Date: 2026-04-28

## Context

ADR 0023 で Location モデルに `googleBusinessPlaceId` を含む MEO フィールドを集約し、
per-location の `LocalBusiness` JSON-LD 出力に移行した。これにより自社サイト側で複数拠点の
ローカル SEO 情報を SSoT 管理できるようになったが、**Google Business Profile (GBP)** に
登録されている拠点情報（営業時間 / 電話番号 / 住所等）との二重管理が運用負荷として残った。

GBP は Google マップ / ローカル検索における primary signal で、MEO の核となるプラットフォーム。
管理画面で更新した拠点情報を GBP に手動転記する運用は、拠点数が増えるほどミスと工数を増やす。

公式仕様の確認結果（2026-04-28 時点）:

- **Service account による直接編集は不可** — `mybusinessbusinessinformation` v1 / `mybusinessaccountmanagement` v1 は
  user-context（OAuth 2.0）必須。Domain-wide delegation も対象外（[Google API explorer / Auth requirements](https://developers.google.com/my-business/reference/businessinformation/rest/v1/locations/patch)）
- **API access には事前申請が必須** — Cloud Console での API 有効化に加え、Google が運営する
  [Business Profile API access form](https://developers.google.com/my-business/content/prereqs) の提出と承認が必要（数日〜数週間）
- **OAuth scope は `https://www.googleapis.com/auth/business.manage`**

`google-calendar/` 実装で確立した `withGoogleApiRetry` / OAuth2Client 初期化 / `encrypt` Settings
保管 / `fireAndForget` afterSuccess パターンを **そのまま再利用** することで、新規実装コストを
最小化しつつ、運用パターン（Settings encryption、API retry、ログ記録、エラー UI）の一貫性を保てる。

## Decision

以下の 6 項目を決定する。

1. **OAuth-based outbound 一方向 sync を採用する**
   Service account 不可の Google 公式制約に従い、admin が一度認可した OAuth token（refresh token 含む）を
   Settings に encrypted で保管し、サーバ側で `mybusinessbusinessinformation.locations.patch` を呼び出す。
   inbound sync（GBP 側の編集を取り込む）は Phase 2 では実装しない。**App が SSoT、GBP は表示窓** とする。

2. **Single-account OAuth で初期実装する**
   1 つの GBP account に紐づく全拠点を一括管理する前提。multi-tenant（テナント別 OAuth + per-tenant Settings）
   は Phase 3 以降に持ち越す。今回は `Settings.googleBusinessProfileAuth` シングルトンで保管する。

3. **fireAndForget on save + manual sync ボタンの 2 経路を提供する**
   `updateLocation` / `createLocation` Server Action の `afterSuccess` で `fireAndForget(syncLocationToGbpCommand(...))`
   を呼び、ユーザー操作（拠点情報更新）の延長で自動同期する。`google-calendar/` outbound と同パターン。
   加えて MEO タブに「今すぐ同期」ボタンを置き、エラーリカバリ / 試験運用時の手動 trigger を可能にする。

4. **Graceful degradation — sync 失敗は業務継続を阻害しない**
   GBP API 失敗時は `Location.gbpSyncError` に `formatGbpError(...)` truncate メッセージを保管し、
   `LocationTable` / MEO カードに badge / tooltip で表示するのみ。Server Action 自体は throw せず
   `MutationResult.success` で返す（`gbpSyncedAt` の null 維持で次回再試行）。`logError` は MEDIUM severity。

5. **Settings encryption は `googleCalendarServiceAccountJson` と同型**
   `@/shared/lib/crypto` の `encrypt` / `decrypt` を流用し、`{ encrypted: string }` envelope を
   `Settings.googleBusinessProfileAuth` (Json?) に保管。decrypt / parse 失敗は HIGH で `logError` + null 返却で
   次回 OAuth 再連携で復旧可能にする。

6. **GBP_STUB_MODE で API access 承認待ち期間も実装完遂可能にする**
   `serverEnv.GBP_STUB_MODE === "true"` で `syncLocationToGbp` が `syncLocationStub`（`logger.info` のみで no-op）に
   早期分岐する。これにより API 申請承認前から Server Actions / UI / domain command を完成させ、
   承認後は env 変数を外すだけで本番経路に切り替わる。

## Alternatives Considered

- **Service account による直接編集** — Google 公式制約により使用不可。CRM / Calendar の運用パターンを
  そのまま流用できないことが Phase 2 全体の制約として確定。
- **Bidirectional sync（GBP → app）** — GBP 側の手動編集を尊重したい運用を想定し検討したが、
  conflict resolution（どちらが正か）と polling コスト（`accounts.locations.list` の頻繁な呼び出し）が
  Phase 2 の範囲を超える。Phase 3 以降に持ち越す。
- **Per-tenant OAuth（multi-tenant）** — テナント別の Settings + OAuth state が必要で、
  schema の追加と OAuth callback の state 管理が複雑化する。今回は single-account で開始し、
  実需要に応じて Phase 3 で拡張する。
- **Cron polling での定期 sync** — fireAndForget on save を採用したため、cron は不要。
  代わりに「今すぐ同期」manual button を置くことで、運用上の差分検知をユーザー駆動とする。

## Consequences

### 利点

- 拠点情報の二重管理（自社管理画面 + GBP）が解消され、運用ミスと転記工数が削減される
- MEO 主要シグナル（営業時間 / 電話番号 / 住所）の更新が自動化され、ローカル SEO への反映が速くなる
- `google-calendar/` 既存パターン（OAuth2Client / `withGoogleApiRetry` / Settings encryption / `fireAndForget` / 監査ログ）を
  そのまま再利用するため、新規 lib モジュール 9 ファイル + Server Actions + UI を低リスクで追加できる
- `GBP_STUB_MODE=true` で実装完遂できるため、API access 申請承認待ち期間（数日〜数週間）に
  実装ブロックされない

### 欠点

- API access 承認までは本番動作不可（stub mode で UI のみ動作確認可能）
- 外部編集（誰かが GBP 管理画面で直接更新）と app からの上書きが競合する可能性 — 運用ルールで吸収する
  （GBP 側手動編集を行わない、または編集後に app の同期ボタンで上書きする等）
- 拠点数が 100+ になる場合、Place ID 別の同期 token / rate limit 管理が必要 — Phase 3 で対応
- single-account 前提のため、複数の GBP account を持つ事業者は対応不可 — Phase 3 で multi-tenant 化

## References

- Spec: `docs/superpowers/specs/2026-04-28-google-business-profile-sync-design.md`
- Plan: `docs/superpowers/plans/2026-04-28-google-business-profile-sync.md`
- ADR 0023: Multi-location LocalBusiness JSON-LD (Location model 集約の Phase 1 決定)
- Setup guide: `docs/guides/admin/google-business-profile-setup.md`
- 公式 docs: [My Business Business Information API](https://developers.google.com/my-business/reference/businessinformation/rest)
- 公式 docs: [Business Profile API access prerequisites](https://developers.google.com/my-business/content/prereqs)
