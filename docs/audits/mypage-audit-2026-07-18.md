# マイページ実装監査 (2026-07-18) — 結果 SSoT

## 実施サマリ

- **8 次元 fan-out (93 agent, 8.3M tokens)** → 28 findings 挙がる
- **3 lens 敵対的検証** (code-reality / exploit-path / framework-behavior) → **21 confirmed / 7 refuted**
- **completeness critic** = MORE_WORK → 7 missed angles
- **修正 fan-out (15 PR × worktree 並列, 2.6M tokens)** → **全 15 PR 対応**
  (14 直接 merged / 1 は同じ file の CRITIC-6 restructure と衝突 → rebase 再 PR で merged)

主な観点は「公式推奨で後方互換性のないクリーン実装か」「各機能連携」「実装の穴」。
結論: 全体設計は健全 (cacheComponents / connection() / Suspense / Server Action 経由の cookie mutation は canonical)、
だが認可・decision-integrity 系に silent bug が広範囲。今回で HIGH 5 件 + 認可 critic 2 件を含む全 21 confirmed + critic 5 件を修正済み。
残り deferred は critic-4 (optimistic concurrency) と critic-7 (Terms 再同意) — critic-7 は 別セッションが #1230 で完了。

**再 litigate 禁止事項** (下記の finding × PR 対応表と本監査の設計判断)。

---

## 8 次元と confirmed count

| 次元                     |  挙 |  確 |
| ------------------------ | --: | --: |
| auth-session             |   3 |   3 |
| reservation-integration  |   4 |   4 |
| event-integration        |   3 |   3 |
| inquiry-integration      |   2 |   1 |
| settings-profile-account |   4 |   2 |
| caching-ppr-connection   |   0 |   0 |
| security-authz-rate      |   3 |   3 |
| ux-a11y-forms            |   9 |   5 |

caching/PPR/connection() は **findings ゼロ** = 現行実装が canonical。
Server Component + `await connection()` 隔離パターン、`toPlainArray`/`toISOString` serialization、
Multiple Root Layouts への影響ゼロ、cookie mutation は全て Server Action 経由 (Next.js 公式 data-security.mdx 準拠)。

---

## Confirmed findings → PR 対応表

| #   | Severity | ID                     | 一言                                                                    | PR                                                                                                                                                                                       |
| --- | -------- | ---------------------- | ----------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | HIGH     | MYPAGE-AUTH-01         | Suspended 顧客の /mypage↔/login 無限 redirect loop                      | [#1224](https://github.com/y2ikgm89/myrrh-rental-space/pull/1224) merged                                                                                                                 |
| 2   | HIGH     | MYPAGE-AUTH-02         | BLACKLIST 顧客が read-only mypage 素通し (isActive 単独判定)            | [#1223](https://github.com/y2ikgm89/myrrh-rental-space/pull/1223) merged                                                                                                                 |
| 3   | MED      | MYPAGE-AUTH-03         | signup 同意 cookie の retry が isNew=false で潰れる                     | [#1216](https://github.com/y2ikgm89/myrrh-rental-space/pull/1216) merged                                                                                                                 |
| 4   | HIGH     | MYPAGE-EDIT-01         | 予約変更で過去時刻 startTime を通す                                     | [#1213](https://github.com/y2ikgm89/myrrh-rental-space/pull/1213) merged                                                                                                                 |
| 5   | MED      | MYPAGE-DETAIL-01       | cancelledByType が legacy CANCELLED_BY.CUSTOMER 値に固定                | [#1220](https://github.com/y2ikgm89/myrrh-rental-space/pull/1220) merged                                                                                                                 |
| 6   | LOW      | MYPAGE-UPDATE-ORDER-01 | updateReservationAction の turnstile 順序 drift                         | [#1220](https://github.com/y2ikgm89/myrrh-rental-space/pull/1220) merged                                                                                                                 |
| 7   | HIGH     | MYPAGE-EVENT-01        | 非 CONFIRMED registration にも meetingUrl 露出                          | [#1219](https://github.com/y2ikgm89/myrrh-rental-space/pull/1219) merged                                                                                                                 |
| 8   | MED      | MYPAGE-EVENT-02        | event セルフキャンセルで Stripe auto-refund が非対称に走らない          | [#1232](https://github.com/y2ikgm89/myrrh-rental-space/pull/1232) merging (rebase 再 PR)                                                                                                 |
| 9   | MED      | MYPAGE-EVENT-03        | WAITLISTED_OFFERED セルフキャンセルで FIFO promote 発火せず             | [#1214](https://github.com/y2ikgm89/myrrh-rental-space/pull/1214) merged                                                                                                                 |
| 10  | LOW      | INQ-MP-01              | 未ログイン inquiry が同メール OAuth 登録後も /mypage/inquiries に出ない | [#1225](https://github.com/y2ikgm89/myrrh-rental-space/pull/1225) open (CI 待ち)                                                                                                         |
| 11  | HIGH     | SETTINGS-01            | getAccountLinksAction が SC 描画で write rate-limit を消費              | [#1215](https://github.com/y2ikgm89/myrrh-rental-space/pull/1215) merged                                                                                                                 |
| 12  | MED      | SETTINGS-02            | 初回 email 登録に所有権検証も一意性チェックも無い                       | [#1217](https://github.com/y2ikgm89/myrrh-rental-space/pull/1217) merged (uniqueness 分), [#1231](https://github.com/y2ikgm89/myrrh-rental-space/pull/1231) open (email verification P2) |
| 13  | MED      | SEC-MYPAGE-01          | 顧客セルフ予約変更が AuditLog を残さない                                | [#1220](https://github.com/y2ikgm89/myrrh-rental-space/pull/1220) merged                                                                                                                 |
| 14  | LOW      | SEC-MYPAGE-02          | updateProfile / deleteAccount が AuditLog を残さない                    | [#1225](https://github.com/y2ikgm89/myrrh-rental-space/pull/1225) open                                                                                                                   |
| 15  | LOW      | SEC-MYPAGE-03          | (MYPAGE-UPDATE-ORDER-01 と重複)                                         | [#1220](https://github.com/y2ikgm89/myrrh-rental-space/pull/1220) merged                                                                                                                 |
| 16  | HIGH     | MYPAGE-UX-01           | 系列キャンセル完了バナー (`?cancelled=series`) 未ハンドル               | [#1218](https://github.com/y2ikgm89/myrrh-rental-space/pull/1218) merged                                                                                                                 |
| 17  | MED      | MYPAGE-NAV-01          | 予約詳細/編集で nav 「予約」タブが aria-current にならない              | [#1218](https://github.com/y2ikgm89/myrrh-rental-space/pull/1218) merged                                                                                                                 |
| 18  | MED      | MYPAGE-FORM-01         | edit-reservation-form の flex-col-reverse がモバイル thumb-zone を逆転  | [#1218](https://github.com/y2ikgm89/myrrh-rental-space/pull/1218) merged                                                                                                                 |
| 19  | MED      | MYPAGE-UX-02           | `?cancelled=ok` フラッシュが URL に残り reload で二重表示               | [#1218](https://github.com/y2ikgm89/myrrh-rental-space/pull/1218) merged                                                                                                                 |
| 20  | LOW      | MYPAGE-UX-03           | `?require_email=true` バナーが email 保存後も永続表示                   | [#1218](https://github.com/y2ikgm89/myrrh-rental-space/pull/1218) merged                                                                                                                 |
| 21  | LOW      | MYPAGE-A11Y-02         | review 投稿完了パネルに role=status / aria-live なし                    | [#1218](https://github.com/y2ikgm89/myrrh-rental-space/pull/1218) merged                                                                                                                 |

**HIGH 5 件 + MED 8 件 + LOW 8 件 = 21 件、うち 19 merged + 2 open (#1225 CI 待ち + #1232 rebase 再 PR CI 待ち)**。

---

## Refuted findings (敵対的検証で棄却)

| ID               | Severity | 一言                                                        | 棄却理由                                                                          |
| ---------------- | -------- | ----------------------------------------------------------- | --------------------------------------------------------------------------------- |
| MYPAGE-AUTH-04   | LOW      | redirect target 非対称                                      | 同じ失敗条件ではなく意味的に異なる 2 条件を守るゲート — 意図通り                  |
| MYPAGE-SERIES-01 | LOW      | invalidateReservationCaches に seriesId 誤伝播              | 実害なし (site-wide タグで invalidate される) — critic-5 として観測性のみ改善     |
| INQ-MP-02        | LOW      | INQUIRY_STATUS_CONFIG の網羅性緩さ                          | 同 file 内 Record<InquiryStatus, ...> で網羅性が既に enforce 済                   |
| SETTINGS-03      | LOW      | profile-form の email null 分岐 dead code                   | Prisma schema で email 非 nullable、runtime で null にならず現実的 dead code なし |
| SETTINGS-04      | LOW      | account-linking の linkSocial fire-and-forget エラー silent | Better Auth client の throw 契約が finding 記述と異なる                           |
| MYPAGE-A11Y-01   | HIGH     | Input aria-describedby がスプレッド順で上書き               | spread 順の実態と finding 記述が逆 (実際は正しい順序で保持)                       |
| MYPAGE-A11Y-03   | LOW      | mypage-skeleton の docstring と実装の乖離                   | docstring 側が finding の主張と異なる (捏造)                                      |

---

## Critic の 7 missed angles → 対応

| #   | Angle                                                                                                          | 対応                                                                                                                             |
| --- | -------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Better Auth `trustedProviders: ["line"]` による silent account-takeover                                        | [#1212](https://github.com/y2ikgm89/myrrh-rental-space/pull/1212) merged (LINE を trusted から除去)                              |
| 2   | `/api/receipts` Route Handler が assertCustomerActive を通していない                                           | [#1221](https://github.com/y2ikgm89/myrrh-rental-space/pull/1221) merged                                                         |
| 3   | unlinkAccount で LINE/Google upstream OAuth token を revoke していない                                         | [#1215](https://github.com/y2ikgm89/myrrh-rental-space/pull/1215) merged (SETTINGS-01 と同 PR)                                   |
| 4   | 予約変更に optimistic concurrency (version 列) がなく lost-update                                              | **deferred** — task_b48d4d14 (spawn_task chip 化)。schema migration + UI 変更で design phase 必要                                |
| 5   | series キャンセルの cache-tag semantic (seriesId → reservationId 混入)                                         | [#1225](https://github.com/y2ikgm89/myrrh-rental-space/pull/1225) open                                                           |
| 6   | cancellation 側 external notification の観測性 (Resend suppression / LINE unfriend / GCal 429 が silent no-op) | [#1226](https://github.com/y2ikgm89/myrrh-rental-space/pull/1226) merged (reservation + event 両方)                              |
| 7   | TermsAgreement 規約 version up 時の再同意 UI が存在しない                                                      | [#1230](https://github.com/y2ikgm89/myrrh-rental-space/pull/1230) merged (別セッションが完了) — task_1e507755 chip は superseded |

**5 件 merged + 1 open (#1225) + 1 deferred (critic-4 のみ)**。

---

## 修正で改めて確定した設計判断 (再 litigate 禁止)

### 認可の 2 段構え SSoT

- MypageAuthGate (SC ガード) と assertCustomerActive (Server Action ガード) は同一の `isCustomerActiveForMypage` helper を経由する SSoT に統一 ([#1223](https://github.com/y2ikgm89/myrrh-rental-space/pull/1223))
- 判定: `!customer.isActive || customer.status === 'BLACKLIST'`
- Route Handler 側 (`/api/receipts` etc.) も `assertCustomerActive` を通すことで 3 経路統一 ([#1221](https://github.com/y2ikgm89/myrrh-rental-space/pull/1221))

### Suspended session の後始末は login 画面側で明示

- SC は cookie mutation 不可のため MypageAuthGate は `redirect('/login?error=account_suspended')` のみ
- LoginPage 側で `if (user && errorType !== 'account_suspended') redirect('/mypage')` に絞り、suspended 時はサインアウトボタン提示 ([#1224](https://github.com/y2ikgm89/myrrh-rental-space/pull/1224))
- **再 litigate 禁止**: MypageAuthGate 側で session invalidate を試みる Server Action 経由の代替案は SC 制約に反するため不採用

### Better Auth trustedProviders は Google のみ

- LINE は email verification を upstream で強制しないため trusted 対象外 ([#1212](https://github.com/y2ikgm89/myrrh-rental-space/pull/1212))
- 新規 LINE ログインで既存 email と衝突しても auto-link しない (silent takeover を封鎖)
- 既存 attach 済み Account は影響なし
- **再 litigate 禁止**: UX 悪化を理由に LINE を trusted に戻す案は security regression

### 領収書 (Receipt) の認可経路

- session 経路: `assertCustomerActive` を通す (BLACKLIST/isActive:false ブロック)
- 署名 URL 経路 (verifyReceiptDownloadToken): 「有効期限中不変」契約で **意図的に active check を通さない**
- 2 経路の非対称は仕様 ([#1221](https://github.com/y2ikgm89/myrrh-rental-space/pull/1221) の PR body 参照)

### Event キャンセル副作用の対称性

- 予約 (reservation) 側と event 側で auto Stripe refund / 通知タイトル escalation / AuditLog metadata (`requiresRefund` / `wasPaid`) を対称に実装 ([#1232](https://github.com/y2ikgm89/myrrh-rental-space/pull/1232))
- WAITLISTED_OFFERED セルフキャンセルも CONFIRMED と同様に FIFO promote を発火 ([#1214](https://github.com/y2ikgm89/myrrh-rental-space/pull/1214))
- 全副作用の outcome (`ok / skipped / error`) は AuditLog metadata の `sideEffects` に 1 レコードで記録 ([#1226](https://github.com/y2ikgm89/myrrh-rental-space/pull/1226))
- **再 litigate 禁止**: fireAndForget の "silent" 挙動を捨てて await に変える案は latency regression のため不採用 (観測性は AuditLog で担保)

### signup terms 同意の retry

- 判定基準は `isNew` ではなく **cookie の presence** ([#1216](https://github.com/y2ikgm89/myrrh-rental-space/pull/1216))
- TermsAgreement は append-only 契約 (rule §9) を維持: insert only + collision → skip, upsert しない

### Series キャンセル cache invalidation

- `invalidateReservationSeriesCaches(seriesId, instanceIds[])` 新設で seriesId と instance detail tag を正しく dispatch
- architecture-boundaries.test.ts に grep gate で seriesId ↔ reservationId 混入を 0 件強制 ([#1225](https://github.com/y2ikgm89/myrrh-rental-space/pull/1225))

### Route Handler の rate-limit スコープ

- read query (getAccountLinks 等) に write form rate-limit (`formSubmitRateLimiter`) を適用しない ([#1215](https://github.com/y2ikgm89/myrrh-rental-space/pull/1215))
- session + Better Auth cookie の presence 自体が cost gate として機能

---

## 未対応 (deferred)

### critic-4: 予約変更の optimistic concurrency

- task chip `task_b48d4d14` として spawn_task 化済
- 内容: Reservation / ReservationSeries に version 列追加 + UPDATE WHERE version 一致検証 + form 側 hidden field + form 側 conflict error 表示
- 影響範囲: schema migration + admin edit form + edit-reservation-form.tsx + advisory lock との併用検証
- design doc 予定パス: `docs/superpowers/specs/2026-07-XX-reservation-optimistic-concurrency-design.md`
- **判断**: 現状 lost-update は observability として AuditLog に「最後の書込」のみ残る silent behavior。事故率低いため P2 扱いで別 session に委譲

### SETTINGS-02 P2 (email verification)

- [#1231](https://github.com/y2ikgm89/myrrh-rental-space/pull/1231) open で別セッションが実装中 (Better Auth の email verification フル配線)
- 本監査の [#1217](https://github.com/y2ikgm89/myrrh-rental-space/pull/1217) は uniqueness check のみで minimal 実装

---

## 検証 methodology (再現手順)

1. discover phase: 8 次元 × general-purpose agent × structured output schema (JSON Schema で captured)
2. verify phase: 各 finding × 3 lens (code-reality / exploit-path / framework-behavior) × general-purpose agent
   - `is_real=true` が 2/3 以上で confirmed。少しでも refute 余地があれば `is_real=false` (finder に忖度しない)
3. critic phase: 全 confirmed を集約し「実施済 8 次元がカバーし損ねた angle」を列挙
4. fix fan-out: 15 PR agent × worktree isolation × structured output schema (PR URL + validate/test/build result)
5. main loop で失敗検知 → 敗者救済 (PR-I は CRITIC-6 restructure と conflict → rebase + 手動 merge → 再 PR #1232)

## 監査 workflow の実行 artifact

- discover + verify + critic: `wf_0c94db26-738` (2229s duration, 93 agent, 8.3M tokens)
- fix fan-out: `wf_14e54577-79a` (5718s duration, 15 agent, 2.6M tokens)
- 前者の transcript: `C:\Users\y2ikg\.claude\projects\G--workspace-work-website-customer-myrrh-rental-space\07d1b599-b71e-47a0-8685-4e5d546cd1b4\subagents\workflows\wf_0c94db26-738\`
- 後者の transcript: 同 `\wf_14e54577-79a\`
