# 第 6 次監査 — 素通りした 61 変異の台帳（2026-08-15）

> 第 6 次監査（変異検査ラウンド）で **GREEN＝素通り**だった 61 件の全明細。
> 外部レポート artifact `c6617756-f615-4eb2-a3f6-afae55611f56`（「緑のまま壊れる 61 箇所」）
> から機械抽出して repo に取り込んだもの。原文の表現をそのまま保持している。

## 読み方

**通常と配色が逆。緑が危険信号。**

- **RED** = 不変条件を壊したらテストが fail した。関門が効いている＝良い結果。
- **GREEN** = 不変条件を壊したのにテストが pass のままだった。**これが指摘**。

測っているのは実装の正しさではなく**関門の実効性**。以下 61 件について、
記録時点の実装は正しい。主張は「この不変条件が壊れても CI と pre-push は緑のままになる」
であって、いま誤動作しているという意味ではない。

## この台帳に無いもの

- **RED だった 76 件の個別明細は元レポートにも無い。** レポートは GREEN 61 件だけを
  行として持ち、RED は領域別の集計値としてしか記録していない。
  したがって「全 137 変異の明細」はどこにも存在しない。
- 静的補完で確定した指摘 12 件（H-1 / H-2 / medium 7 / low 3）と棄却 1 件は別枠で、
  この台帳には含めない。

## 集計

| 領域                        | 試行 | RED 検出 | GREEN 素通り | 素通り率 |
| --------------------------- | ---- | -------- | ------------ | -------- |
| 決済・返金・Stripe          | 16   | 6        | 10           | 62%      |
| 認可・RBAC・surface 分離    | 20   | 9        | 11           | 55%      |
| GCP 本番監査・CI・デプロイ  | 42   | 32       | 10           | 24%      |
| DB 不変条件・migration      | 21   | 11       | 10           | 48%      |
| キャッシュ・CDN タグ        | 19   | 11       | 8            | 42%      |
| PII・データ保持・メール抑止 | 19   | 7        | 12           | 63%      |

合計 137 試行 / RED 76 / GREEN 61。GREEN の内訳は 高 32 / 中 22 / 低 7、うち**守り手なし**（その不変条件を検査するテストが実行スコープに 1 本も無い）が 13 件。

## 索引

| M-ID | 重大度 | 守り手       | 不変条件                                                                                                                      |
| ---- | ------ | ------------ | ----------------------------------------------------------------------------------------------------------------------------- |
| M-01 | 高     | あり         | 返金累計は charge 総額を超えられない（既存の部分返金を引いた「残額」が上限）                                                  |
| M-02 | 高     | あり         | 部分返金の Stripe idempotency key は返金ごとに動く（累積額 newCumulative を含む）。固定すると 2 回…                           |
| M-03 | 高     | あり         | 終端状態（succeeded/failed/canceled）から非終端（pending 等）への巻き戻しを拒否する。Stripe は re…                            |
| M-04 | 高     | あり (#2383) | claimRefundSettlement は非終端状態からのみ "succeeded" へ遷移できる（webhook の at-least…                                     |
| M-05 | 高     | あり (#2383) | Refund 行 insert の catch が握りつぶしてよいのは stripeRefundId の unique 衝突（webhook…                                      |
| M-06 | 高     | あり         | （M2 の event 側対称）部分返金の Stripe idempotency key は累積額を含んで返金ごとに動く                                        |
| M-07 | 高     | **なし**     | TERMINAL_REFUND_STATUSES は succeeded/failed/canceled の 3 値が SSoT（claim…                                                  |
| M-08 | 高     | あり         | charge.refunded webhook は "succeeded" 確定の返金でしか paymentStatus を終端へ動かさない…                                     |
| M-09 | 高     | あり (#2383) | 返金累計の集計は対象 entity にスコープされる（tx.refund.aggregate の WHERE に reservationId…                                  |
| M-10 | 中     | **なし**     | 返金可能残額の集計から failed / canceled を除外する（実際に資金移動しなかった試行を累積に含めない。Codex revie…               |
| M-11 | 高     | あり (#2384) | 公開フォームの mutation Server Action は 4 段 guard pipeline を通る（新設 action も含む）                                     |
| M-12 | 高     | あり         | page 本体に置かれた requireAdmin*Page が実際に認可を強制する（拒否時にページ描画を止める）                                    |
| M-13 | 高     | あり         | requireAdminPermission(resource, action) は要求された action を検査する（read 権限が …                                        |
| M-14 | 高     | あり         | checkPermission は role が権限を持たないとき失敗を返す（admin API route / Server Action…                                      |
| M-15 | 高     | あり         | 同上（綴りを問わず (public)→(admin) の越境を禁止する）                                                                        |
| M-16 | 高     | あり         | 同上（綴りを問わず public 層に Prisma を持ち込ませない）                                                                      |
| M-17 | 高     | あり         | 同上（gate が主張しているのは「全 export が gate される」ことであって「gate の総数が export 数と一致する」こ…                 |
| M-18 | 中     | あり         | admin ページの認可 helper は、そのページが本当に要求する permission を要求する（auditLog:read は S…                           |
| M-19 | 中     | あり         | VIEWER（閲覧専用ロール）の read 対象集合が固定されている                                                                      |
| M-20 | 中     | あり         | 同上 — assertCustomerActive が実際に実行される（存在するだけでなく）                                                          |
| M-21 | 低     | **なし**     | requireAdminDetailPage は EDITOR の userPageAssignment スコープ（resourceId 単…                                               |
| M-22 | 高     | **なし**     | Cloud Scheduler の cron job が PAUSED 状態になっていないこと（23本のcronが停止していないこと）                                |
| M-23 | 高     | あり         | 監査スクリプトの各 check が違反を検出したとき、実際に監査を FAIL させること（build SA の project-level …                      |
| M-24 | 高     | あり         | 同上（project IAM の想定外 Secret Manager accessor grant 検出）が監査を FAIL させること                                       |
| M-25 | 中     | あり         | branch-protection.json の required contexts に対応する workflow が paths filt…                                                |
| M-26 | 中     | **なし**     | branch-protection.json の required_status_checks.contexts が必要な check を列…                                                |
| M-27 | 中     | あり         | Cloud Run の max_instance_count が 1 であること（RATE_LIMIT_BACKEND=in-memory …                                               |
| M-28 | 中     | あり         | Cloud Run の traffic が最新リビジョンに 100% 向いていること（デプロイが実際に反映されていること）                             |
| M-29 | 低     | あり         | cron job が legacy な X-Cron-Secret ヘッダを設定していないこと                                                                |
| M-30 | 低     | あり         | expected list に無い job が /api/cron/* を叩いていたら不正 job として報告すること                                             |
| M-31 | 低     | あり         | cron job の schedule / timeZone が宣言どおりであること                                                                        |
| M-32 | 高     | あり         | 期間の列は開始 <= 終了を DB が強制する（逆転した行は「保存できるのに一度も効かない」）                                        |
| M-33 | 高     | あり         | 同一スペースの PENDING / CONFIRMED 予約は時間帯が重複できない（EXCLUDE 制約 reservations_no_a…                                |
| M-34 | 高     | あり         | audit_logs は append-only（UPDATE / DELETE を trigger が例外で止め、hash chain の…                                            |
| M-35 | 高     | あり         | 破壊的 DDL を含む migration は squawk に検出され、計画ダウンタイム付きでしかデプロイされない                                  |
| M-36 | 高     | あり         | SINGLE_OCCURRENCE のイベントは EventTimeSlot をちょうど 1 本持つ（CONSTRAINT TRIGGER …                                        |
| M-37 | 中     | あり         | customers.total_spent は負値を取れない（total_spent >= 0）                                                                    |
| M-38 | 中     | あり         | （同上）除外に載っているファイルでも、そこに新しく増える DB 列射影の string 宣言は防げる — gate の docstring …                |
| M-39 | 中     | あり         | 制約名は PostgreSQL の識別子上限 63 バイトに収まっている（超えた分は黙って切り捨てられ、付けたつもりの名前と実際の名前が食い… |
| M-40 | 中     | あり         | migration の 14 桁 timestamp は適用順を正しく表す                                                                             |
| M-41 | 低     | あり         | 退避領域を許す（position）列は、reorder が実際に UPDATE する列だけである（根拠を reorder コマンド 11 フ…                      |
| M-42 | 高     | あり (#2385) | "use cache" の producer は 3 点セット（"use cache" → cacheLife(CACHE_LIFE.X) …                                                |
| M-43 | 中     | あり         | PRIVATE_NO_TAG_PREFIXES に載っている prefix は catch-all の CUSTOM_PAGE_HEADER…                                               |
| M-44 | 中     | あり (#2385) | 個別に Cache-Tag を emit している公開ルートの第1セグメントは TAGGED_PUBLIC_FIRST_SEGMENTS に…                                 |
| M-45 | 中     | あり (#2385) | NEXTJS_TAG_TO_CDN_TAG に載っている CDN tag は、実際にどれかの header source が emit して…                                     |
| M-46 | 中     | あり (#2385) | purgeMarketingHomeTag() は HOME_MARKETING（/ と /about だけが載せるタグ）を purge す…                                         |
| M-47 | 中     | あり (#2385) | 個別に列挙された公開ルート（/access 等）は Cache-Tag header を持ち、site-wide purge が edge …                                 |
| M-48 | 中     | あり         | admin 専用コードは public surface のモジュールグラフに入らない（cross-surface-import-gate.t…                                  |
| M-49 | 低     | あり         | CDN cache tag はコンマ・空白を含めない（Cloudflare は Cache-Tag ヘッダ内のコンマをタグ区切りとして扱う）                      |
| M-50 | 高     | あり         | 保持期限を過ぎた予約の guest メールアドレスは NULL 化される                                                                   |
| M-51 | 高     | あり         | 保持期限を過ぎた予約の自由記入「備考」（第三者を含む PII、監査 F-116）は NULL 化される                                        |
| M-52 | 高     | あり         | guest 情報の匿名化対象は endTime が cutoff より古い予約だけ（未来予約・進行中予約は触らない）                                 |
| M-53 | 高     | あり         | 顧客匿名化は電話番号を NULL 化する（ANONYMIZED_CUSTOMER_FIELDS が phoneNumber を含むと申告して…                               |
| M-54 | 高     | あり         | 送信側は recipient を canonical 化（trim + lowercase）してから hash し、suppression …                                         |
| M-55 | 高     | あり         | 問い合わせ匿名化は件名（subject）も placeholder に置換する（件名に氏名が書かれ、admin 検索が subject を …                     |
| M-56 | 高     | あり         | bounce/complaint で抑止された宛先の hash 集合が、実際に sendEmail へ渡る（suppression の唯一の…                               |
| M-57 | 中     | あり         | soft-delete された問い合わせは deletedAt から N ヶ月後に hard delete される（createdAt が新…                                  |
| M-58 | 中     | あり         | 各テーブルの保持月数は自分の config フィールドから取る（reservationGuestMonths は予約 guest 用）                              |
| M-59 | 中     | あり         | 顧客匿名化は短命トークン台帳 PendingCustomerEmailChange を行ごと削除する（customerId で JOIN す…                              |
| M-60 | 中     | あり (#2382) | 顧客 PII の匿名化は監査ログに残る（誰が/いつ/何を消したか）                                                                   |
| M-61 | 低     | あり         | 匿名化イベントの AuditLog に記録する anonymizedFields は、実際に匿名化される列と一致する（forensic 記録…                      |

## 明細

### 決済・返金・Stripe

#### M-01（高）

**不変条件**: 返金累計は charge 総額を超えられない（既存の部分返金を引いた「残額」が上限）

- 守るはずだった: **tests**/unit/domain/payment/stripe-refund-orchestration.test.ts
- 注入した欠陥: resolveRefundAmount の上限判定を if (amount > remaining) → if (amount > input.chargeTotal) に変更（既存返金額を上限計算から落とす）
- 書き換えた箇所: src/shared/domain/payment/stripe-refund-orchestration.ts:81
- 実行: `bun run test -- __tests__/unit/domain/payment/stripe-refund-orchestration.test.ts`

#### M-02（高）

**不変条件**: 部分返金の Stripe idempotency key は返金ごとに動く（累積額 newCumulative を含む）。固定すると 2 回目が Stripe 側で replay される

- 守るはずだった: **tests**/unit/domain/reservations/payment-commands.test.ts / **tests**/unit/architecture/reservation-email-idempotency.test.ts
- 注入した欠陥: reservation-refund-${reservationId}-${resolved.newCumulative} → reservation-refund-${reservationId}（可変部分を削除して entity id 単独に）
- 書き換えた箇所: src/shared/domain/reservations/payment-commands.ts:756
- 実行: `bun run test -- __tests__/unit/domain/reservations/payment-commands.test.ts __tests__/unit/architecture/refund-append-only.test.ts __tests__/unit/architecture/reservation-email-idempotency.test.ts`

#### M-03（高）

**不変条件**: 終端状態（succeeded/failed/canceled）から非終端（pending 等）への巻き戻しを拒否する。Stripe は refund.updated の配送順を保証しないため（監査 F-57）

- 守るはずだった: **tests**/unit/domain/payment/stripe-webhook/refund-status-updated.test.ts
- 注入した欠陥: applyConfirmedRefundStatus 冒頭の if (isTerminalRefundStatus(previousStatus) && !isTerminalRefundStatus(newStatus)) return 0; を丸ごと削除
- 書き換えた箇所: src/shared/domain/payment/stripe-refund-orchestration.ts:239-244
- 実行: `bun run test -- __tests__/unit/domain/payment __tests__/unit/domain/events/payment-commands.test.ts __tests__/unit/domain/reservations/payment-commands.test.ts __tests__/unit/architecture/refund-append-only.test.ts __tests__/unit/api/stripe-webhook.test.ts`
- 素通りの理由: 唯一の unit 呼出元 refund-status-updated.test.ts:64-79 が mock.module でこの関数ごと差し替えているため、実装を壊しても到達しない。

#### M-04（高） — 守り手なし

**不変条件**: claimRefundSettlement は非終端状態からのみ "succeeded" へ遷移できる（webhook の at-least-once 再配信に対する唯一の権威ある冪等性ゲート）

- 守るはずだった: none（unit スコープに呼出テストが存在しない。**tests**/unit/domain/{events,reservations}/payment-queries.test.ts は claimRefundSettlement を参照も mock もしていない — grep 0 件）
- 注入した欠陥: status: { notIn: [...TERMINAL_REFUND_STATUSES] } → status: { notIn: [] }（WHERE の除外述語を空にして確定済み行も再 claim 可能にする）
- 書き換えた箇所: src/shared/domain/payment/stripe-refund-orchestration.ts:293
- 実行: `bun run test -- __tests__/unit/domain/payment __tests__/unit/domain/events/payment-queries.test.ts __tests__/unit/domain/reservations/payment-queries.test.ts __tests__/unit/api/stripe-webhook.test.ts`
- 2026-08-16 close: 対応済み（#2383）。非終端からのみ succeeded へ遷移する WHERE を unit で固定。

#### M-05（高）

**不変条件**: Refund 行 insert の catch が握りつぶしてよいのは stripeRefundId の unique 衝突（webhook 先着 race）だけ。他の DB エラーは throw して tx を巻き戻す

- 守るはずだった: **tests**/unit/domain/payment/stripe-refund-orchestration.test.ts
- 注入した欠陥: if (!isPrismaUniqueConstraintError(error, "Refund.stripeRefundId")) { throw error; } → if (!isPrismaUniqueConstraintError(...) && false) { throw error; }（あらゆる insert エラーを savepoint rollback で握りつぶす）
- 書き換えた箇所: src/shared/domain/payment/stripe-refund-orchestration.ts:372
- 実行: `bun run test -- __tests__/unit/domain/payment __tests__/unit/domain/events/payment-commands.test.ts __tests__/unit/domain/reservations/payment-commands.test.ts`
- 素通りの理由: 既存テストは P2002 を注入した 1 ケースしか無く、「P2002 以外は throw する」側の見本が無いので変異を検出できない。
- 2026-08-16 close: 対応済み（#2383）。非 P2002 は throw する方向を unit で固定。

#### M-06（高）

**不変条件**: （M2 の event 側対称）部分返金の Stripe idempotency key は累積額を含んで返金ごとに動く

- 守るはずだった: **tests**/unit/domain/events/payment-commands.test.ts
- 注入した欠陥: event-registration-refund-${registrationId}-${resolved.newCumulative} → event-registration-refund-${registrationId}
- 書き換えた箇所: src/shared/domain/events/payment-commands.ts:974
- 実行: `bun run test -- __tests__/unit/domain/events/payment-commands.test.ts __tests__/unit/architecture/refund-append-only.test.ts __tests__/unit/architecture/reservation-email-idempotency.test.ts __tests__/unit/shared/domain/events`

#### M-07（高） — 守り手なし

**不変条件**: TERMINAL_REFUND_STATUSES は succeeded/failed/canceled の 3 値が SSoT（claimRefundSettlement と applyConfirmedRefundStatus が同じ集合を見る必要がある。実装 JSDoc が「片方だけ書き換えると確定済みの返金が再 claim 可能な状態に戻る」と明記）

- 守るはずだった: none（unit スコープに検査が無い。参照は integration の refund-status-terminal-guard.test.ts のみ）
- 注入した欠陥: TERMINAL_REFUND_STATUSES = ["succeeded", "failed", "canceled"] → ["succeeded", "canceled"]（配列要素 "failed" を落とす）
- 書き換えた箇所: src/shared/domain/payment/stripe-refund-orchestration.ts:179-183
- 実行: `bun run test -- __tests__/unit/domain/payment __tests__/unit/domain/events/payment-queries.test.ts __tests__/unit/domain/reservations/payment-queries.test.ts __tests__/unit/api/stripe-webhook.test.ts __tests__/unit/api/stripe-webhook-orphan-refund.test.ts`
- 2026-08-16: 据え置き。integration `refund-status-terminal-guard.test.ts` が既にあり、CI `test:all` が強制する。

#### M-08（高）

**不変条件**: charge.refunded webhook は "succeeded" 確定の返金でしか paymentStatus を終端へ動かさない（pending のまま REFUNDED を焼くと戻す経路が無く、管理画面から再返金もできなくなる。監査 F-54 / F-55）

- 守るはずだった: **tests**/unit/domain/payment/payment-claim-orchestration.test.ts
- 注入した欠陥: if (!isRefundSettledSuccess(refundStatus)) return; → if (!isRefundSettledSuccess(refundStatus) && refundStatus === "failed") return;（skip 条件を failed だけに狭め、pending / requires_action を素通りさせる。import は使い続けるので lint も通る形）
- 書き換えた箇所: src/shared/domain/payment/payment-claim-orchestration.ts:343
- 実行: `bun run test -- __tests__/unit/domain/payment __tests__/unit/api/stripe-webhook.test.ts __tests__/unit/api/stripe-webhook-orphan-refund.test.ts __tests__/unit/domain/events/payment-queries.test.ts __tests__/unit/domain/reservations/payment-queries.test.ts`
- 素通りの理由: payment-claim-orchestration.test.ts の 4 本は「Refund 行を書くか / 書かないか」だけを見ており、updatePaymentStatus が呼ばれたかを検査していないため素通りする。

#### M-09（高） — 守り手なし

**不変条件**: 返金累計の集計は対象 entity にスコープされる（tx.refund.aggregate の WHERE に reservationId が必要）

- 守るはずだった: none（unit スコープでは tx.refund.aggregate が mock で、WHERE の中身を検査するテストが 1 本も無い）
- 注入した欠陥: refundReservationPaymentCommand の集計 WHERE から述語 reservationId を削除（where: { status: { notIn: [...] } } だけにして全予約の返金を合算させる）
- 書き換えた箇所: src/shared/domain/reservations/payment-commands.ts:733-737
- 実行: `bun run test -- __tests__/unit/domain/reservations __tests__/unit/domain/payment __tests__/unit/shared/domain/reservations __tests__/unit/shared/domain/cancellation __tests__/unit/actions/admin-reservation-payment.test.ts`
- 2026-08-16 close: 対応済み（#2383）。aggregate WHERE の entity スコープを integration で固定。

#### M-10（中） — 守り手なし

**不変条件**: 返金可能残額の集計から failed / canceled を除外する（実際に資金移動しなかった試行を累積に含めない。Codex review PR #1665）

- 守るはずだった: none（unit スコープに検査が無い。REFUND_AGGREGATE_EXCLUDED_STATUSES を参照する **tests** は integration の admin-refund-aggregate-excludes-failed.test.ts のみ）
- 注入した欠陥: REFUND_AGGREGATE_EXCLUDED_STATUSES = ["failed", "canceled"] → ["failed"]（許可リストから配列要素を 1 つ落とす）
- 書き換えた箇所: src/shared/domain/payment/stripe-refund-orchestration.ts:420-423
- 実行: `bun run test -- __tests__/unit/domain/payment __tests__/unit/domain/events/payment-commands.test.ts __tests__/unit/domain/reservations/payment-commands.test.ts __tests__/unit/domain/events/payment-queries.test.ts __tests__/unit/domain/reservations/payment-queries.test.ts __tests__/unit/shared/domain/cancellation`
- 2026-08-16: 据え置き。integration `admin-refund-aggregate-excludes-failed.test.ts` が既にあり、CI `test:all` が強制する。

### 認可・RBAC・surface 分離

#### M-11（高）

**不変条件**: 公開フォームの mutation Server Action は 4 段 guard pipeline を通る（新設 action も含む）

- 守るはずだった: **tests**/unit/architecture/public-mutation-guard-order.test.ts
- 注入した欠陥: SSoT 配列 PUBLIC_MUTATION_GUARD_PIPELINES に載っていない新規 export submitReservationExpress を追加。guard を 1 つも通さず executeConformMutation → createPublicReservationCommand で予約を作成する
- 書き換えた箇所: src/app/(public)/_shared/actions/reservation.ts:304（fetchReservationPricingPreview の直前に挿入）
- 実行: `bun run test -- __tests__/unit/architecture/public-mutation-guard-order.test.ts __tests__/unit/architecture/assert-customer-active-server-actions.test.ts`
- 2026-08-16 close: 対応済み（#2384）。SSoT を実 handler 集合に広げ、新設 export の pipeline 抜けを検出する。

#### M-12（高）

**不変条件**: page 本体に置かれた requireAdmin*Page が実際に認可を強制する（拒否時にページ描画を止める）

- 守るはずだった: **tests**/unit/architecture/admin-page-auth-before-suspense.test.ts / auth-gate-ssot.test.ts / admin-permission-denial-mechanism.test.ts
- 注入した欠陥: await requireAdminListPage("auditLog") → void requireAdminListPage("auditLog")。呼出は残るが await しないため notFound() が floating promise の中で投げられ、ページ本体はそのまま JSX を返す
- 書き換えた箇所: src/app/(admin)/admin/(dashboard)/audit-logs/page.tsx:70
- 実行: `bun run test -- __tests__/unit/architecture/admin-page-auth-before-suspense.test.ts __tests__/unit/architecture/auth-gate-ssot.test.ts __tests__/unit/architecture/admin-permission-denial-mechanism.test.ts ; bun run lint:files -- "src/app/(admin)/admin/(dashboard)/audit-logs/page.tsx"`

#### M-13（高）

**不変条件**: requireAdminPermission(resource, action) は要求された action を検査する（read 権限が write/manage を許可しない）

- 守るはずだった: **tests**/unit/queries/admin-query-helpers.test.ts / **tests**/unit/architecture/admin-permission-denial-mechanism.test.ts / admin-settings-permissions.test.ts / admin-terms-event-rbac-boundaries.test.ts / admin-read-boundaries.test.ts
- 注入した欠陥: if (!hasPermission(user.role, resource, action)) → if (!hasPermission(user.role, resource, "read"))。引数 action を捨て、read 権限さえあれば manage/publish/update も通す
- 書き換えた箇所: src/app/(admin)/admin/(dashboard)/_shared/queries/_helpers.ts:67
- 実行: `bun run test -- __tests__/unit/queries/admin-query-helpers.test.ts __tests__/unit/architecture/admin-permission-denial-mechanism.test.ts __tests__/unit/architecture/admin-settings-permissions.test.ts __tests__/unit/architecture/admin-terms-event-rbac-boundaries.test.ts __tests__/unit/architecture/admin-read-boundaries.test.ts`

#### M-14（高）

**不変条件**: checkPermission は role が権限を持たないとき失敗を返す（admin API route / Server Action の認可の choke point）

- 守るはずだった: **tests**/unit/admin/lib/action-auth.test.ts（+ **tests**/unit/api 39 本、**tests**/unit/actions 27 本、**tests**/unit/architecture/admin-permission-denial-mechanism.test.ts）
- 注入した欠陥: if (!hasPermission(user.role, resource, action)) { recordPermissionDenied(...); return { success:false, ... }; } ブロックを丸ごと削除。checkAdminAuth（=dashboard role があるか）だけで全通過させる
- 書き換えた箇所: src/app/(admin)/admin/(dashboard)/_shared/lib/action-auth.ts:95-101
- 実行: `bun scripts/run-tests.ts __tests__/unit/admin/lib __tests__/unit/architecture/admin-permission-denial-mechanism.test.ts __tests__/unit/architecture/admin-permissions-clean-break.test.ts ; bun scripts/run-tests.ts __tests__/unit/actions ; bun scripts/run-tests.ts __tests__/unit/api`

#### M-15（高）

**不変条件**: 同上（綴りを問わず (public)→(admin) の越境を禁止する）

- 守るはずだった: **tests**/unit/architecture/cross-surface-import-gate.test.ts
- 注入した欠陥: 同じ越境を相対パスで書く: export { ACTION_LABELS } from "../../../(admin)/admin/(dashboard)/_shared/lib/permissions";
- 書き換えた箇所: src/app/(public)/_shared/lib/format-event-date.ts:11
- 実行: `bun run test -- __tests__/unit/architecture/cross-surface-import-gate.test.ts __tests__/unit/architecture/prisma-import-boundary.test.ts ; bun run lint:files -- "src/app/(public)/_shared/lib/format-event-date.ts" ; bun run type-check`

#### M-16（高）

**不変条件**: 同上（綴りを問わず public 層に Prisma を持ち込ませない）

- 守るはずだった: **tests**/unit/architecture/prisma-import-boundary.test.ts
- 注入した欠陥: 同じ import を相対パスで書く: export { prisma } from "../../../../shared/db/prisma";
- 書き換えた箇所: src/app/(public)/_shared/lib/format-event-date.ts:11
- 実行: `bun run test -- __tests__/unit/architecture/prisma-import-boundary.test.ts __tests__/unit/architecture/cross-surface-import-gate.test.ts ; bun run lint:files -- "src/app/(public)/_shared/lib/format-event-date.ts"`

#### M-17（高）

**不変条件**: 同上（gate が主張しているのは「全 export が gate される」ことであって「gate の総数が export 数と一致する」ことではないはず）

- 守るはずだった: **tests**/unit/architecture/admin-terms-event-rbac-boundaries.test.ts:65-76
- 注入した欠陥: M17 の削除（getAdminAgreements から guard を除去）はそのままに、getAdminTermsList に await requireAdminPermission("terms", "read"); を 2 行目として重複追加。ファイル全体の出現回数は 6 のまま
- 書き換えた箇所: src/app/(admin)/admin/(dashboard)/_shared/queries/terms.ts:20 と :53
- 実行: `bun run test -- __tests__/unit/architecture/admin-terms-event-rbac-boundaries.test.ts __tests__/unit/architecture/admin-read-boundaries.test.ts`

#### M-18（中）

**不変条件**: admin ページの認可 helper は、そのページが本当に要求する permission を要求する（auditLog:read は SUPER_ADMIN 専用）

- 守るはずだった: **tests**/unit/architecture/admin-page-auth-before-suspense.test.ts / permission-keys-exist.test.ts / admin-settings-permissions.test.ts
- 注入した欠陥: requireAdminListPage("auditLog") → requireAdminListPage("page")。page:read は EDITOR/VIEWER も持つため、ページ境界の認可が実質無効化される
- 書き換えた箇所: src/app/(admin)/admin/(dashboard)/audit-logs/page.tsx:70
- 実行: `bun run test -- __tests__/unit/architecture/admin-page-auth-before-suspense.test.ts __tests__/unit/architecture/permission-keys-exist.test.ts __tests__/unit/architecture/admin-settings-permissions.test.ts`

#### M-19（中）

**不変条件**: VIEWER（閲覧専用ロール）の read 対象集合が固定されている

- 守るはずだった: **tests**/unit/lib/admin-permissions.test.ts:100-105 / **tests**/unit/lib/permissions.test.ts:136-157 / **tests**/unit/architecture/permission-keys-exist.test.ts
- 注入した欠陥: VIEWER の権限配列に "coupon:read" を 1 件追加（VIEWER は現在 coupon 権限を一切持たない）
- 書き換えた箇所: src/shared/lib/admin-permissions.ts:277（VIEWER 配列、"event:read" の直後）
- 実行: `bun run test -- __tests__/unit/lib/admin-permissions.test.ts __tests__/unit/lib/permissions.test.ts __tests__/unit/architecture/permission-keys-exist.test.ts __tests__/unit/architecture/admin-settings-permissions.test.ts`

#### M-20（中）

**不変条件**: 同上 — assertCustomerActive が実際に実行される（存在するだけでなく）

- 守るはずだった: **tests**/unit/architecture/assert-customer-active-server-actions.test.ts
- 注入した欠陥: await assertCustomerActive(authedCustomer.id); を if (succeeded) { await assertCustomerActive(authedCustomer.id); } で包む。succeeded は reservation.ts:71 で false 初期化され true になるのは予約成立後なので、この分岐は決して実行されない
- 書き換えた箇所: src/app/(public)/_shared/actions/reservation.ts:149
- 実行: `bun run test -- __tests__/unit/architecture/assert-customer-active-server-actions.test.ts __tests__/unit/architecture/public-mutation-guard-order.test.ts ; bun run lint:files -- "src/app/(public)/_shared/actions/reservation.ts"`

#### M-21（低） — 守り手なし

**不変条件**: requireAdminDetailPage は EDITOR の userPageAssignment スコープ（resourceId 単位のアクセス制御）を適用する

- 守るはずだった: none（page-auth.ts の振る舞いを実行するテストは unit tree に 1 本も無い。auth-gate-ssot.test.ts / admin-settings-permissions.test.ts はファイルの存在と import 元しか見ない）
- 注入した欠陥: requireAdminResourcePermission(resource, "read", resourceId) → requireAdminResourcePermission(resource, "read")。resourceId が消えるため _helpers.ts:83 の if (!resourceId || ...) で早期 return し、EDITOR のスコープ判定が完全に skip される
- 書き換えた箇所: src/app/(admin)/admin/(dashboard)/_shared/helpers/page-auth.ts:48
- 実行: `bun run test -- __tests__/unit/architecture/admin-page-auth-before-suspense.test.ts __tests__/unit/architecture/auth-gate-ssot.test.ts __tests__/unit/architecture/admin-settings-permissions.test.ts __tests__/unit/queries/admin-query-helpers.test.ts __tests__/unit/architecture/admin-read-boundaries.test.ts`
- 2026-08-16: 据え置き。#2369 以降スタッフ詳細は `requireStaffDetailPage(userId)` が必須で、EDITOR は `user:read` を持たないため assignment スコープ経路に到達しない。

### GCP 本番監査・CI・デプロイ

#### M-22（高） — 守り手なし

**不変条件**: Cloud Scheduler の cron job が PAUSED 状態になっていないこと（23本のcronが停止していないこと）

- 守るはずだった: none — scripts/gcp-production-audit-model.ts の readCloudSchedulerOidcJobErrors は record の name と httpTarget しか読まず、state フィールドを一度も参照しない。terraform/cloud_scheduler.tf:241-268 の google_cloud_scheduler_job にも paused 引数の宣言が無いため terraform-drift も検出できない
- 注入した欠陥: 実装を壊すまでもなく無防備。fixture 側に本番で起こりうる異常値 state:"PAUSED" を持つ job を投入して実装に流した（probe-b.ts B1/B2）
- 書き換えた箇所: （変異不要）scripts/gcp-production-audit-model.ts:1415-1490 readCloudSchedulerOidcJobErrors
- 実行: `bun C:/Users/.../scratchpad/probe-b.ts（readCloudSchedulerOidcJobErrors に state:"PAUSED" の job を直接渡す）`
- 2026-08-16: 据え置き。運用監査でありプロダクト欠陥ではない（round6 plan B）。

#### M-23（高）

**不変条件**: 監査スクリプトの各 check が違反を検出したとき、実際に監査を FAIL させること（build SA の project-level role scope 違反）

- 守るはずだった: **tests**/unit/architecture/gcp-production-audit.test.ts:1752-1762（auditScript の toContain マーカーのみ）
- 注入した欠陥: addCheck の判定式のみ反転: buildServiceAccountProjectIamRoleErrors.length === 0 → .length >= 0（恒真）。check 名・関数参照・repair command 名など toContain が見る文字列は全て無傷のまま残す
- 書き換えた箇所: scripts/audit-gcp-production-iap.ts:1171
- 実行: `bun scripts/run-tests.ts __tests__/unit/architecture/gcp-production-audit.test.ts __tests__/unit/architecture/gcp-production-runbook.test.ts __tests__/unit/architecture/gcp-production-audit-terraform-sync.test.ts __tests__/unit/architecture/deploy-production-workflow.test.ts __tests__/unit/architecture/cron-oidc-clean-break.test.ts`

#### M-24（高）

**不変条件**: 同上（project IAM の想定外 Secret Manager accessor grant 検出）が監査を FAIL させること

- 守るはずだった: **tests**/unit/architecture/gcp-production-audit.test.ts の auditScript toContain マーカー群
- 注入した欠陥: projectSecretManagerAccessorErrors.length === 0 → .length >= 0（恒真）。マーカー文字列は無傷
- 書き換えた箇所: scripts/audit-gcp-production-iap.ts:1161
- 実行: `bun scripts/run-tests.ts __tests__/unit/architecture/gcp-production-audit.test.ts __tests__/unit/architecture/gcp-production-runbook.test.ts __tests__/unit/architecture/gcp-production-audit-terraform-sync.test.ts __tests__/unit/architecture/deploy-production-workflow.test.ts __tests__/unit/architecture/cron-oidc-clean-break.test.ts`

#### M-25（中）

**不変条件**: branch-protection.json の required contexts に対応する workflow が paths filter を持たないこと（PR #1103 再発防止 gate が主張する不変条件）

- 守るはずだった: **tests**/unit/architecture-boundaries.test.ts:1717-1776
- 注入した欠陥: 対照(W6): terraform.yml の on.pull_request に paths: ["terraform/**"] を追加するだけ。複合(W7): 先に branch-protection.json から "Terraform / validate" の1行を削除し、その上で同じ paths filter を追加
- 書き換えた箇所: 複合変異: .github/branch-protection.json:12 と .github/workflows/terraform.yml:19-20
- 実行: `bun scripts/run-tests.ts __tests__/unit/architecture-boundaries.test.ts`

#### M-26（中） — 守り手なし

**不変条件**: branch-protection.json の required_status_checks.contexts が必要な check を列挙し続けていること

- 守るはずだった: none — architecture-boundaries.test.ts:1717 は contexts を「入力」として読むだけで、その内容の妥当性・完全性は誰も検査しない
- 注入した欠陥: required contexts から "Unit Tests" の1行を削除
- 書き換えた箇所: .github/branch-protection.json:9
- 実行: `bun scripts/run-tests.ts __tests__/unit/architecture-boundaries.test.ts __tests__/unit/architecture/deploy-production-workflow.test.ts __tests__/unit/architecture/ci-workflow-contract.test.ts __tests__/unit/architecture/ci-workflow.test.ts __tests__/unit/architecture/deploy-packaging-contract.test.ts __tests__/unit/architecture/workflow-shell-pipefail.test.ts __tests__/unit/architecture/deploy-breaking-base-resolution.test.ts`
- 2026-08-16: 据え置き。運用監査でありプロダクト欠陥ではない（round6 plan B）。

#### M-27（中）

**不変条件**: Cloud Run の max_instance_count が 1 であること（RATE_LIMIT_BACKEND=in-memory の前提、および Neon 接続上限 pool_max×2services×max_instances ≤ 30 の前提）

- 守るはずだった: **tests**/unit/architecture/gcp-production-audit.test.ts（監査 gate としては none。実装が maxScale / autoscaling annotation を一度も読まない）
- 注入した欠陥: autoscaling.knative.dev/maxScale annotation を一切持たない Cloud Run service オブジェクトを ingress / runtime env の両検査に流した（probe-b.ts B5/B5b）
- 書き換えた箇所: （変異不要）scripts/gcp-production-audit-model.ts の Cloud Run 検査群
- 実行: `bun C:/Users/.../scratchpad/probe-b.ts`

#### M-28（中）

**不変条件**: Cloud Run の traffic が最新リビジョンに 100% 向いていること（デプロイが実際に反映されていること）

- 守るはずだった: **tests**/unit/architecture/gcp-production-audit.test.ts（監査 gate としては none。status.traffic を読む実装が存在しない）
- 注入した欠陥: status.traffic が古いリビジョンに 100%、latestReadyRevisionName は新リビジョン、という service オブジェクトを流した（probe-b.ts B6/B6b/B7）
- 書き換えた箇所: （変異不要）scripts/gcp-production-audit-model.ts の Cloud Run 検査群
- 実行: `bun C:/Users/.../scratchpad/probe-b.ts`

#### M-29（低）

**不変条件**: cron job が legacy な X-Cron-Secret ヘッダを設定していないこと

- 守るはずだった: **tests**/unit/architecture/gcp-production-audit.test.ts:504-582（実装には検査があるが fixture が一度も通らない）
- 注入した欠陥: headerNames.includes("x-cron-secret") の if ブロックを丸ごと削除
- 書き換えた箇所: scripts/gcp-production-audit-model.ts:1481-1483
- 実行: `bun scripts/run-tests.ts __tests__/unit/architecture-boundaries.test.ts __tests__/unit/architecture/gcp-production-audit.test.ts __tests__/unit/architecture/gcp-production-audit-terraform-sync.test.ts __tests__/unit/architecture/gcp-production-runbook.test.ts __tests__/unit/architecture/cron-oidc-clean-break.test.ts __tests__/unit/architecture/cron-scheduler-path-sync.test.ts __tests__/unit/architecture/deploy-packaging-contract.test.ts __tests__/unit/architecture/deploy-production-workflow.test.ts`

#### M-30（低）

**不変条件**: expected list に無い job が /api/cron/* を叩いていたら不正 job として報告すること

- 守るはずだった: **tests**/unit/architecture/gcp-production-audit.test.ts:504-582（実装には検査があるが fixture が分岐を通らない）
- 注入した欠陥: if (!isExpectedJob && isPublicCronJob) → if (!isExpectedJob && isPublicCronJob && false)
- 書き換えた箇所: scripts/gcp-production-audit-model.ts:1451-1453
- 実行: `（M1-retest と同一の8ファイル一括）bun scripts/run-tests.ts __tests__/unit/architecture-boundaries.test.ts __tests__/unit/architecture/gcp-production-audit.test.ts ... __tests__/unit/architecture/deploy-production-workflow.test.ts`

#### M-31（低）

**不変条件**: cron job の schedule / timeZone が宣言どおりであること

- 守るはずだった: scripts/gcp-production-audit-model.ts の監査としては none（schedule / timeZone を読まない）。ただし terraform/cloud_scheduler.tf:248-249 で宣言されており terraform-drift の対象
- 注入した欠陥: schedule="* * * * *"（毎分）／timeZone="UTC"（宣言は Asia/Tokyo）の job を流した
- 書き換えた箇所: （変異不要）
- 実行: `bun C:/Users/.../scratchpad/probe-b.ts`

### DB 不変条件・migration

#### M-32（高）

**不変条件**: 期間の列は開始 <= 終了を DB が強制する（逆転した行は「保存できるのに一度も効かない」）

- 守るはずだった: **tests**/unit/architecture/temporal-order-constraints.test.ts（gate 自身が「述語の向きは証明しない」と明記。向きは **tests**/integration/prisma/value-domain-constraints.test.ts=未実行）
- 注入した欠陥: 順序 CHECK の向きを反転。"blocked_dates_date_order_check" CHECK ((start_date <= end_date)) → CHECK ((start_date >= end_date))
- 書き換えた箇所: prisma/baseline/invariants.sql:44
- 実行: `bun run test -- __tests__/unit/architecture`
- 素通りの理由: 190 件全緑。gate は制約名の実在と参照列名しか見ない。integration 側は **tests**/integration/prisma/value-domain-constraints.test.ts:416 で `for (const [pair, constraint] of Object.entries(ORDER_CONSTRAINTS))` と全 9 組を回しており逆転行を実際に INSERT する（未実行）。破れた場合の実害は gate の docstring どおり「全社休業日を入れてもその日に予約が入る」。

#### M-33（高）

**不変条件**: 同一スペースの PENDING / CONFIRMED 予約は時間帯が重複できない（EXCLUDE 制約 reservations_no_active_time_overlap_excl）

- 守るはずだった: unit/architecture に guard は無い（unit 側は散文コメントで名前に言及するだけ）。実測 guard は **tests**/integration/domain/reservations/restore-status-overlap.test.ts 他=未実行
- 注入した欠陥: EXCLUDE の WHERE 述語から対象 status を 1 つ落とす。status = ANY (ARRAY[&#x27;PENDING&#x27;::reservation_status, &#x27;CONFIRMED&#x27;::reservation_status]) → ARRAY[&#x27;CONFIRMED&#x27;::reservation_status]
- 書き換えた箇所: prisma/baseline/invariants.sql:649
- 実行: `bun run test -- __tests__/unit/architecture`
- 素通りの理由: 事前調査: `grep -rn "no_active_time_overlap" __tests__/unit/` は e2e-fixture-space-ownership.test.ts / seed-*.test.ts の JSDoc コメント内の言及のみで assertion は 0 件。integration 側は restore-status-overlap.test.ts:7 が `status IN (PENDING, CONFIRMED)` を前提に書かれている（未実行）。破れると PENDING 予約が同一枠に二重で入る。

#### M-34（高）

**不変条件**: audit_logs は append-only（UPDATE / DELETE を trigger が例外で止め、hash chain の改竄検知が成立する）

- 守るはずだった: **tests**/unit/architecture/audit-log-append-only.test.ts:8-15
- 注入した欠陥: trigger 名・trigger 定義・文言はそのままに、関数 prevent_audit_logs_mutation の本体から RAISE EXCEPTION を外して素通りさせる。RAISE EXCEPTION &#x27;audit_logs is append-only; % is not allowed&#x27;, TG_OP USING ERRCODE=... → -- audit_logs is append-only (enforcement temporarily relaxed) + IF TG_OP=&#x27;DELETE&#x27; THEN RETURN OLD; END IF; RETURN NEW;
- 書き換えた箇所: prisma/baseline/invariants.sql:574
- 実行: `bun run test -- __tests__/unit/architecture / bun run test -- __tests__/unit/domain/audit-log`
- 素通りの理由: gate の assertion は `toContain("prevent_audit_logs_mutation")` / `toContain("BEFORE UPDATE ON public.audit_logs ")` / `toContain("BEFORE DELETE ON public.audit_logs ")` / `toContain("audit_logs is append-only")` の 4 本だけ。最後の文言はコメントに残したので全部通る。実測 guard は **tests**/integration/prisma/append-only-enforcement.test.ts:245（`UPDATE "audit_logs" SET "action" = &#x27;UPDATE&#x27;`）＝未実行。破れると監査ログが黙って書き換え・削除可能になり hash chain の tamper-evidence が消える。

#### M-35（高）

**不変条件**: 破壊的 DDL を含む migration は squawk に検出され、計画ダウンタイム付きでしかデプロイされない

- 守るはずだった: scripts/lint-migrations.ts（CI 専用: .github/workflows/ci.yml:225。pre-push には無い）
- 注入した欠陥: squawk-ignore を書かずに破壊的 DDL を追加。ALTER TABLE "space_reviews" DROP COLUMN "title";
- 書き換えた箇所: prisma/migrations/20260816120000_drop_review_title/migration.sql:1（新規ディレクトリ）
- 実行: `bun run test -- __tests__/unit/architecture / bun scripts/lint-migrations.ts <file>`
- 素通りの理由: pre-push（type-check + **tests**/unit/architecture）は破壊的 migration を一切見ない。防いでいるのは CI の squawk step だけで、しかも `changes` filter の migrations_files 出力に依存する。

#### M-36（高）

**不変条件**: SINGLE_OCCURRENCE のイベントは EventTimeSlot をちょうど 1 本持つ（CONSTRAINT TRIGGER events_schedule_integrity_check）

- 守るはずだった: **tests**/unit/architecture/event-schedule-db-invariants.test.ts
- 注入した欠陥: trigger 関数 check_event_schedule_integrity の条件を恒偽にして発火させなくする。IF current_mode = &#x27;SINGLE_OCCURRENCE&#x27; AND slot_count <> 1 THEN → AND slot_count < 0 THEN（COUNT(*) は非負なので永久に false）
- 書き換えた箇所: prisma/baseline/invariants.sql:318
- 実行: `bun run test -- __tests__/unit/architecture`
- 素通りの理由: gate の assertion は `toContain(&#x27;CONSTRAINT "event_time_slots_capacity_positive"&#x27;)` 等の名前と `toContain("CREATE CONSTRAINT TRIGGER events_schedule_integrity_check")` / `toContain("DEFERRABLE INITIALLY DEFERRED")` のみ。関数本体は 1 バイトも見ていない。破れるとスロット 0 本または複数本の SINGLE_OCCURRENCE イベントが作成でき、スロット前提の予約・定員計算が壊れる。

#### M-37（中）

**不変条件**: customers.total_spent は負値を取れない（total_spent >= 0）

- 守るはずだった: **tests**/unit/architecture/numeric-column-domains.test.ts（gate 自身の docstring が「述語の正しさは証明しない」と明記。述語は **tests**/integration/prisma/numeric-column-domains.test.ts の担当＝未実行）
- 注入した欠陥: 制約名はそのままに述語だけ緩める。CHECK ((total_spent >= 0)) → CHECK ((total_spent >= (-1000000)))
- 書き換えた箇所: prisma/baseline/invariants.sql:52
- 実行: `bun run test -- __tests__/unit/architecture`
- 素通りの理由: 190 gate 全件が緑のまま。名前一致（hasDedicatedNumericCheck は `<表>_<列>_` 前置一致のみ）しか見ていないため。integration 側の boundaryValues は nonNegative で rejected=[-1] を probe するので実 DB では捕まるが、pre-push は integration を走らせない（lefthook.yml pre-push = type-check + **tests**/unit/architecture のみ）。

#### M-38（中）

**不変条件**: （同上）除外に載っているファイルでも、そこに新しく増える DB 列射影の string 宣言は防げる — gate の docstring が「有無ではなく件数を数える」と長く正当化している主張

- 守るはずだった: **tests**/unit/architecture/db-enum-columns-are-not-string.test.ts:285-344
- 注入した欠陥: ::status の除外を持つファイル（FORM_OR_URL_VALUE 登録済み）に、フォーム値ではなく本物の DB 行射影を追加: export type PageRowProjection = { readonly id: string; readonly status: string; };
- 書き換えた箇所: src/shared/domain/pages/admin-queries.ts:19
- 実行: `bun run test -- __tests__/unit/architecture`
- 素通りの理由: 除外は `<path>::<field>` 単位の wholesale。main assertion は `[...currentViolations()].filter(([key]) => !NOT_A_DB_COLUMN.has(key)).filter(([key]) => !FORM_OR_URL_VALUE.has(key))` で、count は分割代入されるだけでメッセージ本文にしか使われない。docstring が正当化している「件数で数える」防御は主 assertion では死んでおり、count を消費しているのは stale 検査（`(current.get(key) ?? 0) === 0`）のみ。NOT_A_DB_COLUMN 32 件 + FORM_OR_URL_VALUE 13 件 = 45 の file::field で、この gate が作られた原因の欠陥（ConnectionStatus）と同じ形が黙って通る。

#### M-39（中）

**不変条件**: 制約名は PostgreSQL の識別子上限 63 バイトに収まっている（超えた分は黙って切り捨てられ、付けたつもりの名前と実際の名前が食い違う）

- 守るはずだった: **tests**/unit/architecture/numeric-column-domains.test.ts:144-162
- 注入した欠陥: 76 バイトの制約名を invariants.sql に書き込む。ALTER TABLE "settings_google_calendar" ADD CONSTRAINT "settings_google_calendar_google_calendar_reminder_minutes_non_negative_check" CHECK ((google_calendar_reminder_minutes <= 10080));
- 書き換えた箇所: prisma/baseline/invariants.sql:52（直後に 1 行挿入）
- 実行: `bun run test -- __tests__/unit/architecture`
- 素通りの理由: 長さ検査は NUMERIC_COLUMN_DOMAINS から **導出した** 名前にしか掛かっておらず、invariants.sql に実際に書かれている識別子は一度も測っていない。readChecksByTable の正規表現も制約名を `[a-z_]+` で拾うため 76 文字を素通りさせる。docstring 自身が「値域 CHECK を入れた migration の初版が 2 本これを踏んだ」と実害を記録している経路が、そのまま無検査で残っている。

#### M-40（中）

**不変条件**: migration の 14 桁 timestamp は適用順を正しく表す

- 守るはずだった: **tests**/unit/architecture/migration-timestamp-monotonic.test.ts（gate 自身が「重複しない過去日付は素通りする」と docstring で自己申告）
- 注入した欠陥: 既存最大 timestamp（20260815034446）より 7 か月以上前の、重複しない timestamp を持つ migration を追加。中身は ALTER TABLE "space_reviews" ADD COLUMN "helpful_votes" INTEGER NOT NULL DEFAULT 0;
- 書き換えた箇所: prisma/migrations/20260101000000_backdated_typo/migration.sql:1（新規ディレクトリ）
- 実行: `bun run test -- __tests__/unit/architecture`
- 素通りの理由: 対照実験: 同じ内容を既存と同一の timestamp（20260815034446_duplicate_stamp）で置くと [run-tests] (108/190) FAIL **tests**/unit/architecture/migration-timestamp-monotonic.test.ts (248ms, exit=1) (fail) prisma migration directory structure > 14-digit timestamp が重複していない（壁時計の厳密な単調増加は検証しない） つまり検出できるのは完全重複だけで、書き間違えの過去日付は無検出。gate はこれを docstring で正直に申告している。加えてこの migration が足す数値列には CHECK が無いが、numeric gate は schema.prisma しか読まないので migration 側からの侵入も見えない。

#### M-41（低）

**不変条件**: 退避領域を許す（position）列は、reorder が実際に UPDATE する列だけである（根拠を reorder コマンド 11 ファイルのソースから確かめる）

- 守るはずだった: **tests**/unit/architecture/numeric-column-domains.test.ts:65-77, 222-253
- 注入した欠陥: 根拠リスト REORDER_COMMAND_FILES から 1 要素を落とす（"src/shared/domain/locations/commands.ts",）。さらに 11 件中 8 件を落とす版も試した
- 書き換えた箇所: **tests**/unit/architecture/numeric-column-domains.test.ts:70
- 実行: `bun run test -- __tests__/unit/architecture/numeric-column-domains.test.ts`
- 素通りの理由: 突き合わせが `entry.endsWith(&#x27;.&#x27;+column)` の列名一致（表をまたぐ）なので、sort_order / order / display_order の 3 名前をどれか 1 ファイルが書いていれば全 position 列が「根拠あり」になる。ungrounded の assertion は一度も発火せず、実際の防御は `expect(reorderedColumns.size).toBeGreaterThan(5)` だけ。

### キャッシュ・CDN タグ

#### M-42（高） — 守り手なし

**不変条件**: "use cache" の producer は 3 点セット（"use cache" → cacheLife(CACHE_LIFE.X) → cacheTag(CACHE_TAGS.X, ...)）を必ず揃える（.claude/rules/src-boundaries.md「キャッシュ」節）

- 守るはずだった: none
- 注入した欠陥: getPublishedEvents() から cacheTag(CACHE_TAGS.EVENTS, CACHE_TAGS.LOCATIONS, CACHE_TAGS.SPACES); の 1 行を削除（"use cache" と cacheLife は残す）
- 書き換えた箇所: src/shared/domain/events/public-queries.ts:105
- 実行: `bun run test -- __tests__/unit/architecture/public-cache-tag-header-pairing.test.ts __tests__/unit/architecture/type-safety-cast-and-cache-tag-drift.test.ts __tests__/unit/domain/events/public-queries.test.ts __tests__/unit/architecture/cache-tag-literals.test.ts __tests__/unit/architecture/event-category-cache-invalidation.test.ts → その後 bun scripts/run-tests.ts __tests__/unit/architecture`
- 2026-08-16 close: 対応済み（#2385）。`getPublishedEvents()` の `cacheTag(EVENTS, LOCATIONS, SPACES)` を unit で固定。

#### M-43（中）

**不変条件**: PRIVATE_NO_TAG_PREFIXES に載っている prefix は catch-all の CUSTOM_PAGE_HEADER_SOURCE から除外され、Cache-Tag を受け取らない

- 守るはずだった: **tests**/unit/architecture/next-config-cache-tag-emission.test.ts:109-122（ただしループが同じ配列を回すため自己免疫）
- 注入した欠陥: PRIVATE_NO_TAG_PREFIXES から "/contact" を 1 要素削除
- 書き換えた箇所: src/shared/lib/constants/cdn-cache-tags.ts:253
- 実行: `bun run test -- __tests__/unit/architecture/next-config-cache-tag-emission.test.ts __tests__/unit/architecture/public-cache-tag-header-pairing.test.ts __tests__/unit/architecture/cdn-header-source-matching.test.ts __tests__/unit/lib/cdn-cache-tags.test.ts __tests__/unit/architecture/cache-tag-literals.test.ts __tests__/unit/architecture/eslint-cdn-mapped-tag-rule.test.ts → その後 bun run probe-mutation.ts "/contact"`

#### M-44（中） — 守り手なし

**不変条件**: 個別に Cache-Tag を emit している公開ルートの第1セグメントは TAGGED_PUBLIC_FIRST_SEGMENTS に載り、後段の catch-all source に Cache-Tag を上書きされない

- 守るはずだった: none（cdn-header-source-matching.test.ts が pin しているのは access/blog/events のみ。faq・terms・news・spaces・category・tag・about はケース無し）
- 注入した欠陥: TAGGED_PUBLIC_FIRST_SEGMENTS から "faq" を 1 要素削除
- 書き換えた箇所: src/shared/lib/constants/cdn-cache-tags.ts:242
- 実行: `bun run test -- __tests__/unit/architecture/next-config-cache-tag-emission.test.ts __tests__/unit/architecture/public-cache-tag-header-pairing.test.ts __tests__/unit/architecture/cdn-header-source-matching.test.ts __tests__/unit/lib/cdn-cache-tags.test.ts → その後 bun run probe-mutation.ts "/faq,/faq/cancellation"`
- 2026-08-16 close: 対応済み（#2385）。`"faq"` 等をリテラルでピンし、CUSTOM_PAGE_HEADER_SOURCE の非マッチも固定。

#### M-45（中） — 守り手なし

**不変条件**: NEXTJS_TAG_TO_CDN_TAG に載っている CDN tag は、実際にどれかの header source が emit している（purge が no-op にならない）

- 守るはずだった: none
- 注入した欠陥: EVENTS_CACHE_TAG から CDN_CACHE_TAGS.EVENT_WAITLIST を 1 要素削除
- 書き換えた箇所: next.config.ts:90（EVENTS_CACHE_TAG）
- 実行: `bun run test -- __tests__/unit/architecture/next-config-cache-tag-emission.test.ts __tests__/unit/architecture/public-cache-tag-header-pairing.test.ts __tests__/unit/architecture/cdn-header-source-matching.test.ts __tests__/unit/lib/cdn-cache-tags.test.ts __tests__/unit/architecture/eslint-cdn-mapped-tag-rule.test.ts __tests__/unit/architecture/type-safety-cast-and-cache-tag-drift.test.ts __tests__/unit/architecture/event-category-cache-invalidation.test.ts → その後 bun run probe-tagcoverage.ts`
- 2026-08-16 close: 対応済み（#2385）。NEXTJS_TAG_TO_CDN_TAG の逆引き（INTEGRATION_SETTINGS 除外）を headers() に対して固定。EVENT_WAITLIST 脱落を検出。

#### M-46（中） — 守り手なし

**不変条件**: purgeMarketingHomeTag() は HOME_MARKETING（/ と /about だけが載せるタグ）を purge する

- 守るはずだった: none
- 注入した欠陥: queueTagPurge(CDN_CACHE_TAGS.HOME_MARKETING) → queueTagPurge(CDN_CACHE_TAGS.FAQ)
- 書き換えた箇所: src/shared/lib/cache/site-wide.ts:120
- 実行: `bun run test -- __tests__/unit/lib/cache-invalidation.test.ts __tests__/unit/shared/lib/cache/invalidate-timing.test.ts __tests__/unit/lib/cdn-cache-tags.test.ts __tests__/unit/lib/cache/event-cache.test.ts __tests__/unit/lib/cache/review-cache.test.ts → その後 bun scripts/run-tests.ts __tests__/unit/architecture`
- 2026-08-16 close: 対応済み（#2385）。`purgeMarketingHomeTag()` が `home-marketing-v1` を queue することを固定。

#### M-47（中） — 守り手なし

**不変条件**: 個別に列挙された公開ルート（/access 等）は Cache-Tag header を持ち、site-wide purge が edge に届く（監査 F-18）

- 守るはずだった: none
- 注入した欠陥: { source: "/access", headers: [{ key: "Cache-Tag", value: SITE_WIDE_ONLY_CACHE_TAG }] } のエントリを丸ごと削除
- 書き換えた箇所: next.config.ts:341-344（/access の header エントリ）
- 実行: `bun run test -- __tests__/unit/architecture/next-config-cache-tag-emission.test.ts __tests__/unit/architecture/public-cache-tag-header-pairing.test.ts __tests__/unit/architecture/cdn-header-source-matching.test.ts __tests__/unit/lib/cdn-cache-tags.test.ts → その後 bun scripts/run-tests.ts __tests__/unit/architecture → bun run probe-mutation.ts "/access"`
- 2026-08-16 close: 対応済み（#2385）。`headers()` の `source: "/access"` が Cache-Tag（site-wide）を持つことを固定。

#### M-48（中）

**不変条件**: admin 専用コードは public surface のモジュールグラフに入らない（cross-surface-import-gate.test.ts:25-38 の docstring が明言する被害）

- 守るはずだった: **tests**/unit/architecture/cross-surface-import-gate.test.ts（走査根は src/app/(admin) と src/app/(public) の 2 つだけ — 同 test:6-7）
- 注入した欠陥: import { ACTION_LABELS } from "@/app/(admin)/admin/(dashboard)/_shared/lib/permissions"; を src/shared 側に足し、purgeMarketingHomeTag 内で参照
- 書き換えた箇所: src/shared/lib/cache/site-wide.ts:33（import 追加）+ :120（参照）
- 実行: `bun run test -- __tests__/unit/architecture/cross-surface-import-gate.test.ts __tests__/unit/lib/cache-invalidation.test.ts → bun scripts/run-tests.ts __tests__/unit/architecture → bun run lint:files -- src/shared/lib/cache/site-wide.ts`

#### M-49（低）

**不変条件**: CDN cache tag はコンマ・空白を含めない（Cloudflare は Cache-Tag ヘッダ内のコンマをタグ区切りとして扱う）

- 守るはずだった: **tests**/unit/lib/cdn-cache-tags.test.ts:13,16-20（テスト側が正規表現を自前で複写している）
- 注入した欠陥: VALID_TAG_PATTERN を /^[\x21-\x2B\x2D-\x7E]+$/ → /^[\x21-\x7E]+$/（0x2C = コンマを許可）
- 書き換えた箇所: src/shared/lib/constants/cdn-cache-tags.ts:299
- 実行: `bun run test -- __tests__/unit/lib/cdn-cache-tags.test.ts __tests__/unit/architecture/next-config-cache-tag-emission.test.ts __tests__/unit/architecture/public-cache-tag-header-pairing.test.ts __tests__/unit/architecture/cdn-header-source-matching.test.ts → その後 bun run probe-join.ts`

### PII・データ保持・メール抑止

#### M-50（高）

**不変条件**: 保持期限を過ぎた予約の guest メールアドレスは NULL 化される

- 守るはずだった: **tests**/unit/domain/data-retention/commands.test.ts
- 注入した欠陥: anonymizeExpiredGuestReservations の updateMany data から guestEmail: null を削除（前: guestLastName/guestFirstName/guestEmail/guestPhone/guestCompanyName/notes の 6 列 → 後: guestEmail を除く 5 列）
- 書き換えた箇所: src/shared/domain/data-retention/commands.ts:169
- 実行: `bun run test -- __tests__/unit/domain/data-retention/commands.test.ts`

#### M-51（高）

**不変条件**: 保持期限を過ぎた予約の自由記入「備考」（第三者を含む PII、監査 F-116）は NULL 化される

- 守るはずだった: **tests**/unit/domain/data-retention/commands.test.ts
- 注入した欠陥: anonymizeExpiredGuestReservations の updateMany data から notes: null を削除
- 書き換えた箇所: src/shared/domain/data-retention/commands.ts:173
- 実行: `bun run test -- __tests__/unit/domain/data-retention/commands.test.ts`

#### M-52（高）

**不変条件**: guest 情報の匿名化対象は endTime が cutoff より古い予約だけ（未来予約・進行中予約は触らない）

- 守るはずだった: **tests**/unit/domain/data-retention/commands.test.ts
- 注入した欠陥: WHERE の endTime: { lt: cutoff } を endTime: { gt: cutoff } に反転（対象集合が「期限切れ予約」から「未来・進行中の予約」へ丸ごと入れ替わる）
- 書き換えた箇所: src/shared/domain/data-retention/commands.ts:157
- 実行: `bun run test -- __tests__/unit/domain/data-retention/commands.test.ts`

#### M-53（高）

**不変条件**: 顧客匿名化は電話番号を NULL 化する（ANONYMIZED_CUSTOMER_FIELDS が phoneNumber を含むと申告している）

- 守るはずだった: **tests**/unit/domain/customers/anonymize-preserves-suppression.test.ts + **tests**/unit/actions/customer-audit-diff.test.ts
- 注入した欠陥: anonymizeCustomerCommand の tx.customer.update data から phoneNumber: null を削除（監査ログ側の申告リストはそのまま = 「消したと記録するが消していない」状態）
- 書き換えた箇所: src/shared/domain/customers/customer-lifecycle-commands.ts:149
- 実行: `bun run test -- __tests__/unit/domain/customers/anonymize-preserves-suppression.test.ts __tests__/unit/actions/customer-audit-diff.test.ts __tests__/unit/domain/data-retention/commands.test.ts`

#### M-54（高）

**不変条件**: 送信側は recipient を canonical 化（trim + lowercase）してから hash し、suppression set と突き合わせる

- 守るはずだった: **tests**/unit/shared/lib/email/send.test.ts
- 注入した欠陥: hashSuppressedEmailCandidate(normalizeEmailForIdentity(recipient)) → hashSuppressedEmailCandidate(recipient)（canonical 化を外し、normalizeEmailForIdentity は suppressedRecipients への push 側に移して lint clean を維持）。テストの宛先は全て小文字なので差が出ない
- 書き換えた箇所: src/shared/lib/email/send.ts:98-100
- 実行: `bun run test -- __tests__/unit/shared/lib/email/send.test.ts __tests__/unit/email/send-result.test.ts ; bun run lint:files -- src/shared/lib/email/send.ts`

#### M-55（高）

**不変条件**: 問い合わせ匿名化は件名（subject）も placeholder に置換する（件名に氏名が書かれ、admin 検索が subject を contains で引くため — 監査 F-52）

- 守るはずだった: **tests**/unit/domain/inquiries/anonymize-commands.test.ts
- 注入した欠陥: anonymizeInquiryInTx の update data から subject: INQUIRY_ANONYMIZE_PLACEHOLDER_SUBJECT を削除し、未使用になった定数宣言も削除（lint clean を維持）。テストの assertion は expect.objectContaining で subject を含まない
- 書き換えた箇所: src/shared/domain/inquiries/anonymize-commands.ts:55,86
- 実行: `bun run test -- __tests__/unit/domain/inquiries/anonymize-commands.test.ts __tests__/unit/domain/customers/anonymize-preserves-suppression.test.ts ; bun run lint:files -- src/shared/domain/inquiries/anonymize-commands.ts`

#### M-56（高）

**不変条件**: bounce/complaint で抑止された宛先の hash 集合が、実際に sendEmail へ渡る（suppression の唯一の配線点）

- 守るはずだった: **tests**/unit/shared/domain/settings/email-render-context.ts の test（expect(context?.suppressedEmailHashes).toBeInstanceOf(Set) のみ）
- 注入した欠陥: resolveEmailSendContext の戻り値を suppressedEmailHashes → new Set([...suppressedEmailHashes].slice(0, 0))（getSuppressedEmailSet は呼ぶが中身を捨てる。全 suppression が無効化される）
- 書き換えた箇所: src/shared/domain/settings/queries/email-render-context.ts:83
- 実行: `bun run test -- __tests__/unit/domain __tests__/unit/shared/lib/email __tests__/unit/api __tests__/unit/email ; bun run lint:files -- src/shared/domain/settings/queries/email-render-context.ts`

#### M-57（中）

**不変条件**: soft-delete された問い合わせは deletedAt から N ヶ月後に hard delete される（createdAt が新しくても purge される）

- 守るはずだった: **tests**/unit/domain/data-retention/commands.test.ts
- 注入した欠陥: purgeExpiredInquiries の purgeWhere から { deletedAt: { lt: cutoff } } 分岐を削除（前: OR 2 分岐 → 後: createdAt 1 分岐のみ）
- 書き換えた箇所: src/shared/domain/data-retention/commands.ts:222
- 実行: `bun run test -- __tests__/unit/domain/data-retention/commands.test.ts`

#### M-58（中）

**不変条件**: 各テーブルの保持月数は自分の config フィールドから取る（reservationGuestMonths は予約 guest 用）

- 守るはずだった: **tests**/unit/domain/data-retention/commands.test.ts + **tests**/unit/api/cron-data-retention.test.ts
- 注入した欠陥: runDataRetentionPurge の anonymizeExpiredGuestReservations(now, config.reservationGuestMonths) を config.inquiryMonths に差し替え（既定値 12 → 36 ヶ月）
- 書き換えた箇所: src/shared/domain/data-retention/commands.ts:375
- 実行: `bun run test -- __tests__/unit/domain/data-retention/commands.test.ts __tests__/unit/api/cron-data-retention.test.ts`

#### M-59（中）

**不変条件**: 顧客匿名化は短命トークン台帳 PendingCustomerEmailChange を行ごと削除する（customerId で JOIN すれば実アドレスが復元できてしまうため）

- 守るはずだった: **tests**/unit/domain/customers/anonymize-preserves-suppression.test.ts
- 注入した欠陥: await tx.pendingCustomerEmailChange.deleteMany({ where: { customerId: existing.id } }) を丸ごと削除（PendingCustomerMerge 側は残す）。テストは mockPendingEmailChangeDeleteMany を定義しているが一度も assert していない
- 書き換えた箇所: src/shared/domain/customers/customer-lifecycle-commands.ts:218-220
- 実行: `bun run test -- __tests__/unit/domain/customers/anonymize-preserves-suppression.test.ts __tests__/unit/actions/customer-audit-diff.test.ts`

#### M-60（中） — 守り手なし

**不変条件**: 顧客 PII の匿名化は監査ログに残る（誰が/いつ/何を消したか）

- 守るはずだった: none — domain 層（anonymizeCustomerCommand / anonymizeInquiryInTx / data-retention commands）は AuditLog を一切書かず、cron route も logger.info だけ。AuditLog は admin Server Action 層にしか無いため、data-retention cron 由来の匿名化は監査証跡ゼロ
- 注入した欠陥: —（無防備を grep で確認）
- 書き換えた箇所: 変異なし（守り手が存在しないため注入不要）。該当箇所: src/app/api/cron/data-retention/route.ts:55-59（logger.info のみ）、src/shared/domain/customers/customer-lifecycle-commands.ts:106-270（AuditLog 書き込みなし）
- 実行: `grep -n "auditLog\\|createAuditLog\\|logAction" src/shared/domain/customers/customer-lifecycle-commands.ts src/shared/domain/data-retention/commands.ts src/shared/domain/inquiries/anonymize-commands.ts`
- 2026-08-16 close: 対応済み（#2382）。顧客 PII 匿名化の監査ログを固定。

#### M-61（低）

**不変条件**: 匿名化イベントの AuditLog に記録する anonymizedFields は、実際に匿名化される列と一致する（forensic 記録）

- 守るはずだった: **tests**/unit/actions/customer-audit-diff.test.ts（email と phoneNumber の 2 要素しか見ていない）
- 注入した欠陥: ANONYMIZED_CUSTOMER_FIELDS 配列から "notes" を削除（実装は notes を消すのに監査記録は消したと申告しない）
- 書き換えた箇所: src/shared/lib/constants/anonymized-customer-fields.ts:30
- 実行: `bun run test -- __tests__/unit/actions/customer-audit-diff.test.ts __tests__/unit/architecture/use-server-exports.test.ts __tests__/unit/architecture/audit-log-append-only.test.ts`

## 出典

- 外部レポート: <https://claude.ai/code/artifact/c6617756-f615-4eb2-a3f6-afae55611f56>
- 計画書: `docs/superpowers/plans/2026-08-15-round6-defect-fixes.md` /
  `docs/superpowers/plans/2026-08-15-round6-guard-effectiveness.md`
- 再評価: `docs/audits/2026-08-16-mutation-recount.md`
