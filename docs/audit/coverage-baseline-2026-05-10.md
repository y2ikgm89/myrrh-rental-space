# Domain Coverage Baseline 2026-05-10

> Phase 2 完了時点の per-domain unit test coverage baseline。
> 計測コマンド: `bun test --coverage __tests__/unit/domain/<domain>`
> 計測対象: 各 domain の Source ファイルのみ（テスト対象実装ファイル）

## サマリ

Phase 2 で 5 高優先 domain に新規 unit test を追加。15-25 test 目標に対し **41 test 追加**で達成。

| Domain                  | 追加 test | 対象ファイル                                            | functions% | lines% |
| ----------------------- | --------: | ------------------------------------------------------- | ---------: | -----: |
| audit                   |         6 | `src/shared/domain/audit/recents-queries.ts`            |     100.00 | 100.00 |
| terms                   |        13 | `src/shared/domain/terms/commands.ts`                   |      94.12 |  86.55 |
| google-business-profile |         8 | `src/shared/domain/google-business-profile/settings.ts` |     100.00 | 100.00 |
| dashboard               |         8 | `src/shared/domain/dashboard/queries.ts`                |      93.33 |  87.55 |
| sidebar                 |         6 | `src/shared/domain/sidebar/queries.ts`                  |      90.00 |  91.34 |

**合計**: 41 test 追加 / Source coverage 平均 funcs **95.5%** / lines **93.1%**

## 詳細

### audit (`src/shared/domain/audit/recents-queries.ts`)

100% / 100% — `getRecentAuditedResources` の全分岐をカバー：

- supported な resource を `RecentItem` に map
- unsupported な resource は除外
- `hasPermission` false は除外
- 同一 `resource:resourceId` の dedup
- limit 超過で early break
- page / faq / location の特殊 href 生成

### terms (`src/shared/domain/terms/commands.ts`)

94.12% / 86.55% — `recordTermsAgreementsCommand` 中心に 5 command をカバー：

- `createTermsCommand`: 公開/非公開時 `publishedAt` の Date / null 切替、slug 重複 → CONFLICT
- `updateTermsCommand`: 対象不在 → NOT_FOUND、既存 `publishedAt` 保持、`previousSlug` 戻り値
- `softDeleteTermsCommand`: `deletedAt` set + `isPublished: false`
- `restoreTermsCommand`: 削除済み以外 → VALIDATION、slug 衝突 → CONFLICT
- `recordTermsAgreementsCommand`: 空配列 / 非公開 skip、sha256 hash + `contentSnapshot` 生成、null optional fields の omit

未カバー: `hardDeleteTermsCommand`（128, 142-156）/ `updateTermsCommand` の slug 変更分岐（171, 187, 189-193）。

### google-business-profile (`src/shared/domain/google-business-profile/settings.ts`)

100% / 100% — 暗号化 I/O の全分岐をカバー：

- `getGbpAuthState`: Settings 不在 / `googleBusinessProfileEnabled: false` / envelope 不正 / decrypt 失敗 + logError(HIGH) / shape 不一致 + logError(HIGH) / 正常 decrypt + parse
- `saveGbpAuthState`: `encrypt(JSON.stringify)` + `Settings.update` + `enabled: true`
- `clearGbpAuthState`: `Prisma.JsonNull` runtime sentinel + `enabled: false`

### dashboard (`src/shared/domain/dashboard/queries.ts`)

93.33% / 87.55% — 4 query function をカバー：

- `getDashboardStats`: 8 並列クエリ集計、`changePercent` の正常計算 / ゼロ除算 / 0→positive 100% 分岐
- `getRecentReservations`: limit 0 → 5 default 正規化、limit 200 → 50 MAX クランプ、`mapRecentReservation`（lastName + firstName 結合）
- `getRecentInquiries`: Inquiry → RecentInquiry の field map
- `getReservationChartData`: 空 DB 結果でも 30 日 0 埋め、`peakReservations` / `totalRevenue` 集計、JST 日付グルーピング

未カバー: `getTodayReservations`（272-305）。

### sidebar (`src/shared/domain/sidebar/queries.ts`)

90.00% / 91.34% — `getSidebarData` の widget toggle ロジックをカバー：

- 全 widget disabled → 4 fetch 全 skip
- recent + popular 両方有効 → `post.findMany` 2 回呼出
- recent: `orderBy: { publishedAt: "desc" }` + `take=recentCount`
- popular: `orderBy: { viewCount: "desc" }` + `take=popularCount`
- categories: `_count.posts` から `postCount` map
- `publishedAt: null` の post の `url` / `publishedAt` 出力

未カバー: tags fetch path（141-151）。

## 既知の pre-existing fail（Phase 2 対象外）

`bun run test:unit` 実行時に `__tests__/unit/lib/validations/space.test.ts` で **13 fail** が出るが、これは `spaceFormSchema` の test fixture が migration `20260507163006_space_facilities_to_object_array` に未追従の **pre-existing bug**。

切り分け: `git stash -u && bun test __tests__/unit/lib/validations/space.test.ts` で Phase 2 変更を退避しても同様に 13 fail。

修正対象外（別 PR / Phase 3 で対応）。

## 計測方針

- per-domain でのみ measure（`bun test --coverage __tests__/unit/domain/<x>`）
- 全 dir 横断計測は `mock.module` 干渉により非実用的（`bun-patterns.md` §カバレッジ）
- 閾値ゲート不要（baseline 公開のみ）
- CI artifact 化はしない（`bun-patterns.md` §カバレッジ方針準拠）
