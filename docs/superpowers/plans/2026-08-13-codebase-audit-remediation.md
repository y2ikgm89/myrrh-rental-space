# コードベース監査 2026-08-12 — 修正計画書

> **出典**: 2026-08-12 のコードベース監査（61 観点 × 5 ラウンド、エージェント計 261、確定 132 件 / 棄却 62 件。F-94 は R-03 の再掲として棄却へ移した）。
> **作成**: 2026-08-13。**これは「まだやっていないこと」の一覧。**
> **姉妹文書**: 済んだこと → [2026-08-12-codebase-audit-progress.md](../../audits/2026-08-12-codebase-audit-progress.md) ／ 指摘の全文 → [2026-08-12-codebase-audit-findings.md](../../audits/2026-08-12-codebase-audit-findings.md) ／ 棄却の記録 → [2026-08-12-codebase-audit-refuted.md](../../audits/2026-08-12-codebase-audit-refuted.md)
> **置き場**: これは実装計画なので `docs/superpowers/plans/` に置く（[docs/README.md](../../README.md) の lifecycle 規約により、**消化しきったら削除する**）。監査記録と対処の記録は `docs/audits/` に残る。

---

## 1. この計画書の使い方

0. **状態はここに書かない。** 済んだものは [2026-08-12-codebase-audit-progress.md](../../audits/2026-08-12-codebase-audit-progress.md) の SSoT へ移し、[§6 の台帳](#6-未着手の指摘台帳)から行を消す。**この計画書に載っている = まだ手が付いていない。**以前は状態を台帳と findings.md の両方に書いており、実際に食い違った。
1. **1 指摘 = 1 PR とは限らない。** [§4 構造の穴](#4-構造の穴個別修正では再発するもの) の 10 テーマは、複数の指摘が同じ 1 つの欠落の症状として現れている。テーマ単位で直すほうが小さく、再発しない。
2. **着手前に該当指摘の全文を読む。** この計画書には表題しか載っていない。到達経路・既存の検査・反証官による訂正は [2026-08-12-codebase-audit-findings.md](../../audits/2026-08-12-codebase-audit-findings.md) にある。**行番号は監査時点のもの**で、修正済みファイルではずれている。
3. **監査自身を鵜呑みにしない。** 133 件のうち著者が実コードで独立確認したのは 14 件だけ。残りは検出／反証の二段構えに依拠している。第 3 次で確定とした 1 件は第 4 次で覆った。
4. **同じ仮説を再提出しない。** 棄却された 61 件は [2026-08-12-codebase-audit-refuted.md](../../audits/2026-08-12-codebase-audit-refuted.md) に理由つきで残してある。
5. **リポジトリの規約に従う。** 1 PR = 1 論理変更（目安 300 行 / 10 ファイル）。新しい gate を足すのは実際に起きた欠陥に対してだけ。緑を偽装しない（→ `CLAUDE.md`）。

---

## 2. 監査の前提

### 2.1 実測ベースライン

| コマンド                   | 結果                                             | 所要    |
| -------------------------- | ------------------------------------------------ | ------- |
| `bun run validate`         | exit 0（type-check + ESLint `--max-warnings 0`） | 285.9 s |
| `bun run test:unit`        | 824 ファイル / 0 fail                            | 89.0 s  |
| `bun run test:integration` | 157 ファイル / 0 fail                            | 196.7 s |
| `gh repo view`             | `visibility: PUBLIC`                             | —       |

対象規模: src 2,288 ファイル / 323,148 行、テスト 981 本、architecture gate 約 180 本。
**既存の関門はすべて緑だった。**したがってここに残るのは、テストと gate が構造的に見ていない欠陥だけである。

### 2.2 監査の方法（検出と反証の分離）

「指摘を出せ」と言われたレビュアーは健全な実装にも何かを見つける。それを排除するため、検出と反証を別のエージェントに分離し、反証側には「迷ったら棄却」を明示している。

| ラウンド | 対象                                                                                                                                                                                                                                                 | エージェント | 指摘 | 生存 | 棄却 |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ | ---- | ---- | ---- |
| 第 1 次  | 14 観点（予約・決済・認可・cron・CMS・DB・キャッシュ・メール・外部連携・セキュリティ・フロント・インフラ・検証の空振り）                                                                                                                             | 56           | 41   | 40   | 1    |
| 第 2 次  | 第 1 次が構造的に見落とした 14 領域（イベント 11,609 行、顧客、問い合わせ、スマートロック、設定、金額計算、領収書、公開露出、feature フラグ、scripts、並行制御ほか）                                                                                 | 63           | 49   | 29   | 20   |
| 第 3 次  | 第 1 次・第 2 次が「走査しきれなかった」と自己申告した 14 領域（seed 6,349 行、migration SQL 3,235 行、invariants 42KB、未読 admin Action、Stripe handler 本体、Lexical エディタ、メールテンプレ 35 本、gate 本体 180 本ほか）＋ 保留された仮説 6 件 | 55           | 41   | 35   | 6    |
| 第 4 次  | 走査率が低いまま残った集中領域 14 区画（gate 本体 159 本、admin UI 779 本、Lexical 100 本、テスト 400 本、E2E spec 43 本）                                                                                                                           | 63           | 49   | 28   | 21   |
| 第 5 次  | 意図的に絞り込み。金と本番インフラを守っているはずで未検証だった 5 区画（決済 webhook テスト 3,421 行、本番 IAP 監査スクリプト 1,617 行 + model 1,575 行、共有 mock）                                                                                | 24           | 19   | 7    | 12   |

**ラウンドを重ねるほど棄却率が上がり、深刻度が下がった。** high の産出は 5 → 2 → 4 → **0** → 0、棄却率は 2 % → 41 % → 15 % → 43 % → **63 %**。静的読解で見つかる致命的な欠陥は第 4 次の時点で概ね尽きている。

第 1 次の棄却率が 2.4 % と低すぎたため批判エージェントに監査自身の網羅性を検証させたところ、**リポジトリ最大のドメイン `src/shared/domain/events/`（53 ファイル / 11,609 行）にどの観点も担当者が居ない**ことが判明した。第 2 次はその穴を埋めるもの。

### 2.3 走査率（実測・自己申告ベース）

| 基準                                       | 第 3 次まで            | 第 4 次まで            |
| ------------------------------------------ | ---------------------- | ---------------------- |
| 厳密（ファイル名を名指しした申告のみ）     | 999 / 3,495 = 28.6 %   | 1,438 / 3,495 = 41.1 % |
| 緩和（ディレクトリ申告を配下全部と数える） | 1,939 / 3,495 = 55.5 % | 2,237 / 3,495 = 64.0 % |

**コードベースを読み切ったわけではない。**走査率が低いまま残っているのは `__tests__/unit/{components,app,admin,forms,hooks,lib,shared,actions,api}`（8〜23 %）と `src/app/(admin)`（36 %）で、約 2,000 本が未読。

### 2.4 深刻度の内訳

| 重大 |  高 |  中 |  低 | 棄却 |
| ---: | --: | --: | --: | ---: |
|    0 |  11 |  64 |  57 |   62 |

---

## 3. 現況

**進捗と済んだ指摘の一覧は [2026-08-12-codebase-audit-progress.md](../../audits/2026-08-12-codebase-audit-progress.md) にある。**
ここには重複させない — 同じ値を 2 箇所に置くと必ず食い違う（実際に食い違った。理由は同ファイル冒頭）。

この計画書の §5 / §6 に残っているものが、そのまま未着手の全量である。

### 3.1 未決の判断（監査が「先に決めていただきたいこと」として挙げたもの）

> 本番共有シークレットが public リポジトリの成果物から取得可能な状態にある
> .github/workflows/deploy-production.yml は terraform plan -out=tfplan のバイナリ plan を
> retention 90 日の Actions artifact として upload している。漏洩チェックはテキスト描画
> tfplan.txt を grep するだけで、sensitive = true の変数はそこでは
> (sensitive value) に伏せられるため、原理的に検知できない。
> 一方バイナリ plan は Terraform の仕様上、属性値を平文で保持する。
> 対象は CLOUDFLARE\_ORIGIN\_HEADER\_SECRET（Cloudflare → Cloud Run のレート制限信頼チェーンの共有鍵）。
> リポジトリは PUBLIC であることを gh repo view で確認済み。
> 判断が要る点: 過去の run の artifact を実際に検査してから対処するか、
> 検査を待たずに先にローテーションするか。artifact の削除・鍵のローテーションはいずれも外部に影響するため、
> こちらの指示なしには実行していない。

**この判断は「検査せず先にローテーションする」で決着し、段 3 まで完了した。**
段階と現在地は [対処の記録 §3](../../audits/2026-08-12-codebase-audit-progress.md#3-f-01-の鍵ローテーション段階実行中)。
残るのは旧 version の無効化だけで、これは手順上「運用判断」。

---

## 4. 構造の穴（個別修正では再発するもの）

以下は**個別の指摘を全部潰しても解消しない**。次に機能を足したときに同じ形で再発する。

**閉じたもの: B / C / D / E / F / G / H / I / J。** 各節の末尾に根拠を書いてある
（実測を伴わない「たぶん大丈夫」は書かない）。残っているのは A
（webhook 境界テストの大半は今も配線 mock）。

### A. テストが固定しているのは「配線」であって「振る舞い」ではない ★最優先

第 5 次で決済 webhook のテスト 3,421 行と本番インフラ監査 gate の中身を初めて読んだ結果、独立した 3 体のエージェントが同じ結論に達した。

決済 webhook のテストは route の POST を叩くが、その先の domain module を `mock.module` で全置換している。assertion はすべて**「どの mock が どの引数で 呼ばれたか」の写経**で、DB に何が書かれるかも戻り値の意味も検査しない。

決定的な事実: **`applyStripeChargeRefundIdempotent`（Refund 行を作る 15 行）を実行するテストは 1 本も存在しなかった。**この関数名は `__tests__` 全体に 8 箇所現れるが、すべて `mock.module` の差し替え*側*である。だから「Refund 行の status を渡していない」という欠陥は、それを実行する主体がいないので誰にも観測できなかった。

本番インフラ監査 gate も同じ形をしている。`toEqual([])` は全て、テスト作者が手で組んだ JSON リテラルを純関数に食わせて空配列を確認する形で、**実装が読まないフィールドは fixture にも登場しようがない**（Scheduler の state、Cloud Run の `status.traffic`、`maxScale`、build SA の 3 つ目以降の role）。つまり `toEqual([])` が証明しているのは「私が作った入力に対し実装は何も見つけなかった」であって「本番に問題が無い」ではない。**実装に検査を 1 つ足しても既存 fixture は 1 本も落ちない** — `.claude/rules/architecture-gates.md` が要求する変異検査に耐えない。

確定した決済の欠陥 9 件は、いずれも**「純関数の判定は正しいが、呼び出し側が渡す引数・対象集合が誤っている」**形だった（idempotencyKey に予約 ID 固定を渡す、AUTO_ON_CANCEL を常に全額と決め打つ、failed / canceled 行まで合算対象に入れる）。テストは純関数側を fixture で固定しているので、何をしても落ちない。

- **対処**: 金が動く経路に mock を挟まない層を作る。実 DB を使う integration の土台は既にある。
- **着手済**: #2229。以後、金額書込の本体から順に載せる。
- **関連指摘**: [F-56](../../audits/2026-08-12-codebase-audit-findings.md#f-56) / [F-78](../../audits/2026-08-12-codebase-audit-findings.md#f-78) / [F-118](../../audits/2026-08-12-codebase-audit-findings.md#f-118) / [F-80](../../audits/2026-08-12-codebase-audit-findings.md#f-80)（`fix/audit-wave-1` でクローズ。→ [対処の記録](../../audits/2026-08-12-codebase-audit-progress.md)）、[F-20](../../audits/2026-08-12-codebase-audit-findings.md#f-20) / [F-21](../../audits/2026-08-12-codebase-audit-findings.md#f-21) / [F-22](../../audits/2026-08-12-codebase-audit-findings.md#f-22)
- **書込層の実測（2026-08-15）**: 予約 `charge-refunded-settlement.test.ts` に USD 1250
  cents（float を書かず 2xx+CRITICAL）を足した。イベント
  `applyEventChargeRefundIdempotent` の実 DB は
  `event-charge-refunded-settlement.test.ts`（JPY 整数は Refund 行、USD 1250 は
  CRITICAL）。`stripe-webhook*.test.ts` の `mock.module` 配線テストは残っている。

### B. キャッシュ×ドメイン

cacheTag() producer と next.config.ts の Cache-Tag ヘッダが独立した 2 つの SSoT になっており、対応を検査する gate が無い。証拠: src/shared/domain/events/public-queries.ts:97 は `cacheTag(EVENTS, LOCATIONS, SPACES)` を宣言するのに、next.config.ts:289 の /events は EVENTS\_CACHE\_TAG のみ。gate \_\_tests\_\_/unit/architecture/next-config-cache-tag-emission.test.ts の JSDoc を読むと、検査しているのは SITE\_WIDE\_CDN\_TAGS の inline 有無と PRIVATE\_NO\_TAG\_PREFIXES だけで、producer 側 cacheTag との突合は範囲外。指摘20・21・22 は 3 件の別バグではなく、この 1 つの穴の 3 つの症状。

- **関連指摘**: F-18 / F-73 / F-88（全件クローズ。→ [対処の記録](../../audits/2026-08-12-codebase-audit-progress.md)）
- **構造としての残りは無い（2026-08-15 実測）**:
  `__tests__/unit/architecture/public-cache-tag-header-pairing.test.ts` が
  `src/shared/domain` の `cacheTag(CACHE_TAGS.*)` と `next.config.ts` の Cache-Tag
  を突合する。下限（producer ファイル > 20、公開呼出 > 30、header > 8）と
  赤 fixture（producer だけ / F-88 形）と緑 fixture（両側あり）がある。
  path 正規表現の実 URL マッチまでは見ていない（JSDoc に明記）。

### C. イベント×定員×金額×決済

EventTicket.unitSize が DB と admin フォームにしか存在せず、価格式にも定員式にも入っていない。db-schema 観点が価格側(指摘19)を見つけたが、定員側(registration-create-commands.ts:124 の `slot.capacity - sum(quantity)`)は誰の担当でもなかった。同一の欠落が「多重課金」と「オーバーブッキング」という別カテゴリの障害として現れるため、片方だけ直すと残る。

- **関連指摘**: [F-02](../../audits/2026-08-12-codebase-audit-findings.md#f-02) / [F-47](../../audits/2026-08-12-codebase-audit-findings.md#f-47)（F-47 は `fix/audit-wave-1` でクローズ）
- **構造としての残りは無い（2026-08-15 実測）**: 定員 floor は
  `groupBy({ by: ['slotId'] })` の最大合計と `ticket.capacity` を比較する。
  8+8 CONFIRMED / capacity=10 が通るテストがあり、event-wide aggregate に戻すと赤。
  DB trigger は未変更（同じ粒度）。価格式の `unitSize` は F-02 済み。

### D. feature フラグ×決済×cron の非対称

cron は features を gate するが Stripe webhook は gate しない。証拠: src/app/api/cron/unpaid-event-registration-expire/route.ts:35 と waitlist-expire/route.ts:54 は `isFeatureEnabled('events')` が false なら skip する一方、`grep -rn isFeatureEnabled src/app/api/webhooks/` は 0 件。events モジュールを OFF にした瞬間、未払い申込の期限切れとキャンセル待ちオファーの失効が止まり、決済 webhook だけが動き続ける。api-cron-webhooks 観点は cron 側を、payment 観点は webhook 側を見ており、非対称は両者の境界に落ちる。

- **関連指摘**: F-65 / F-103 / F-133（全件クローズ。→ [対処の記録](../../audits/2026-08-12-codebase-audit-progress.md)）
- **構造としての残りは無い（2026-08-15 実測）**: webhook に `isFeatureEnabled` は
  **足していない**（capture 済み session を捨てる誤修正になる）。閉じたのは復帰後の
  回収。`cron-unpaid-event-registration-expire-events-off.test.ts` が
  (a) OFF 中 expire は `feature_disabled`、(b) `async_payment_succeeded` が PAID、
  (c) ON 復帰後もその行を CANCELLED にしない、を実 DB で固定する。(b) を外すと
  stale UNPAID が CANCELLED になり赤。`src/app/api/webhooks` の
  `isFeatureEnabled` は今も 0 件（意図どおり）。

### E. 顧客匿名化×メール×領収書×監査ログ

data-retention/commands.ts:339 が anonymizeCustomerCommand を呼んで Customer.email を non-routable な placeholder に置換するが、Reservation / Receipt / AuditLog / EventRegistration 側に残る PII と表示経路は誰も突き合わせていない。指摘25(リマインダが placeholder 宛に送る)はその一断面で、同じ構造が受領書 PDF の宛名、監査ログの actor 表示、mypage の履歴表示にもある。

- **関連指摘**: F-44 / F-52 / F-112 / F-116 / F-117（全件クローズ。→ [対処の記録](../../audits/2026-08-12-codebase-audit-progress.md)）
- **構造としての残りは無い（2026-08-14 実測）**: 突き合わせの主体ができた。
  `__tests__/integration/domain/customers/anonymize-covers-pii.test.ts` が、各 PII 項目に
  一意のトークンを入れて匿名化し、`to_jsonb(row)::text` で**全テーブルを走査**して
  生き残った表を列挙する。**列の一覧を持たない**ので drift しない — 新しい表に PII を
  持たせて匿名化の配線を忘れたら、その表の名前が出て落ちる。残ってよいのは
  `terms_agreements`（append-only の同意証跡）だけで、それも積極的に固定してある。

### F. クーポン claim/release の分散

claim は payloads.ts:207 の単一 atomic UPDATE で堅い(WHERE に is\_active/usage\_limit/valid\_from/valid\_until/min\_reservation\_amount を再強制)のに対し、release は cancel-core.ts:157 / lifecycle-commands.ts:144,455 / pending-expiry.ts:133 / series-commands.ts:408 / admin-commands.ts:586 / calendar-sync-inbound-mutations.ts:108 の 6 ファイルに散在。Stripe の非同期決済(checkout.session.async\_payment\_succeeded)が pending-expiry の release 後に着弾する順序は、payment 観点も reservations 観点も検証していない。

- **関連指摘**: F-58 / F-59 / F-60（全件クローズ。→ [対処の記録](../../audits/2026-08-12-codebase-audit-progress.md)）
- **構造としての残りは無い（2026-08-15 実測）**: `releaseCouponUsage` が
  `WHERE usageCount > 0` の atomic decrement。7 箇所を置換。
  `coupon-usage-release-helper.test.ts` が helper 外の `usageCount: { decrement`
  を落とす（下限 + 赤/緑 fixture）。`async-payment-not-auto-cancelled.test.ts` が
  待機中は戻さないことと、backstop 後の二重 expire が 1 回だけ戻すことを実 DB で固定。

### G. 認可×Server Component 描画

管理画面 72 個の page.tsx のうち page 境界で resource 権限を取るのは 14 個で、残りは @/admin/queries/\* の loader 側 guard に依存する設計(page-auth.ts の JSDoc が明言)。今回 exports 数と guard 数の突合は取れている(customer.ts は exports=4/guards=5)が、loader を通らずに props で Client Component へ渡る PII 経路(例: customers/\[id\]/\_components/CustomerDetail.tsx)は authz 観点が「ページ側の描画時ガードは未走査」と申告したまま。

- **関連指摘**: F-92 / F-102 / F-115（いずれも #2270 で解消。→ [対処の記録](../../audits/2026-08-12-codebase-audit-progress.md)）
- **構造としての残りは無い（2026-08-14 実測）**: 監査が名指しした
  `customers/[id]/_components/CustomerDetail.tsx` の経路は、`page.tsx` /
  `generateMetadata` の両方が `@/admin/queries/customer` の `getCustomerById` を
  通り、その先頭が `requireAdminPermission("customer", "read")` を呼んでいる
  （`_shared/queries/customer.ts:33`）。「未走査だから穴かもしれない」であって、
  穴が実在するという主張ではなかった。

  `(dashboard)` 配下 71 個の `page.tsx` を走査したところ、loader も
  `requireAdmin*` も通さずに `@/shared/domain/**` を直に読むのは 4 個
  （`locations/new` / `news/new` / `terms/new` / `spaces`）。読んでいるのは
  組織設定・レイアウト設定・機能フラグだけで、PII も resource スコープの
  データも含まない。**確認された欠陥はゼロ。**

  この走査は gate にしていない。`admin-page-auth-before-suspense.test.ts` が
  新規ページ向けの ratchet として既にあり、実際に漏れた欠陥が無い以上、
  関門を 1 つ増やすコストに見合わない。

### H. Google Calendar 逆流×金額×クーポン

calendar-sync-inbound-mutations.ts:108 が GCal 起点のキャンセルで Coupon.usageCount を decrement する。reservations 観点は calendar-sync 系 4 ファイルを未読、integrations 観点は overlap/advisory lock を未検証と申告しているため、外部システムからの逆流が金額・クーポン・返金に及ぼす副作用は構造的に無検査。指摘26・27 は同じ経路の別の症状。

- **関連指摘**: F-09 / F-11 / F-46 / F-61 / F-123（全件クローズ。→ [対処の記録](../../audits/2026-08-12-codebase-audit-progress.md)）
- **構造としての残りは無い**: 逆流経路 3 本（イベント import の cancel、予約 GCal の
  retry pool、soft-delete 後の write-back）すべてに、書く前に読むガードと、実 DB での
  変異検査つきテストが入った（#2271）。

### I. gate の走査範囲×DB 書込経路

175 gate 中 scripts/ を走査範囲に含むのは 11 本のみ。scripts/e2e/ の 13 ファイルが prisma を直接叩き、Receipt / Reservation / SmartLockPasscode の deleteMany を含む。append-only 系・破壊的 DML 系の gate は同じ穴を共有しており、指摘40 はその一例。gate-integrity 観点は個別 gate の空振りを見たが、「走査範囲の母集合が書込経路の母集合と一致しているか」という上位の問いは誰も立てていない。

- **関連指摘**: F-13 / F-23 / F-83（全件クローズ。→ [対処の記録](../../audits/2026-08-12-codebase-audit-progress.md)）
- **上位の問いに答えた（#2272）**: 「走査範囲の母集合が書込経路の母集合と一致して
  いるか」は、**個別 gate の走査範囲を人が広げ続ける問題ではなかった**。真因は
  `local/gate-scan-must-not-be-silently-empty` が `Bun.Glob().scanSync()` を
  認識しておらず、下限 assert の欠落が機械では検出できなかったこと。認識させた
  ところ、下限を欠く gate は repo 全体で 3 本だけだった（全部直した）。

### J. 予約×イベント×スペースの並行制御 namespace

advisory lock namespace が 728350(イベント定員) / 728351(スペース) / 728354(waitlist promote session) / 728357(series) / 728349(calendar-sync) と 5 系統あり、waitlist-locks.ts の JSDoc が「常に番号降順で取得」という契約を宣言している。reservations 観点は space-locks.ts を、events は誰も見ていないため、両方を跨ぐ経路(イベント更新時のスペース重複チェック)の順序遵守は未検証。しかも session lock は connection pin を要求する契約で、pooled client で acquire/release が分かれると silent-false でリークする(JSDoc が明記)。

- **関連指摘**: [F-120](../../audits/2026-08-12-codebase-audit-findings.md#f-120)（`fix/audit-wave-1` でクローズ）
- **構造としての残りは無い（2026-08-15 実測）**: 728354 session lock をやめ、
  `events.waitlist_promote_leased_until` の行リースにした。acquire / release は
  作業 ITX の外。release は自分が書いた `leasedUntil` だけを消す。
  `waitlist-session-lock-leak.test.ts` が outer ITX timeout 後、別接続の
  `tryAcquire` が値を返すことを固定する。session lock に戻すと false のまま赤。

---

## 5. フェーズ計画

影響と不可逆性が大きい順。**高 11 件・中 64 件は全件クローズ済み。**残りは低 34 件
（§6）。済んだ経緯は [対処の記録](../../audits/2026-08-12-codebase-audit-progress.md)。

### フェーズ 1 — 鍵ローテーション（完了）

`CLOUDFLARE_ORIGIN_HEADER_SECRET` の段 1〜3 は完了。記録は
[対処の記録 §3](../../audits/2026-08-12-codebase-audit-progress.md#3-f-01-の鍵ローテーション段階実行中)。

### フェーズ 2 — 済んだ修正の取りこぼし

F-03 の transport 失敗表示と F-05 の `form.errors` 描画は `fix/audit-wave-1` で閉じた。
それ以外に残件列へ書いたものは、本体とは別件（[対処の記録 §2](../../audits/2026-08-12-codebase-audit-progress.md#2-済んだ指摘)）。

### フェーズ 3 — 構造の穴（§4）

A（決済に mock を挟まない層）の書込経路は `fix/audit-wave-1` で実 DB テストが
乗った。残るのは webhook 境界の配線 mock。B / C / D / F / J は §4 に閉じた印を書いた。

### フェーズ 4 — 中（完了）

中 64 件は全件クローズ。経緯は [対処の記録](../../audits/2026-08-12-codebase-audit-progress.md)。

### フェーズ 5 — 低

上記が片付いてから。多くは UI の細部・メール文言・gate の母集合の穴で、単独では急がない。

---

## 5.1 進め方（実測でわかったこと）

3 件ずつ束ねて 1 PR にすると回りやすい。束ね方は「同じ根を持つもの」で、ファイルの
近さではない（例: F-43 と F-49 は別ファイルだが「AUTO_ON_CANCEL は必ず残額全額」と
いう**同じ前提**の裏表だった）。

各指摘で必ずやること:

1. **変異検査**。修正を戻して、狙ったテストだけが落ちることを確認する。これをやらないと
   「テストは通ったが欠陥を捕まえていない」形になる（実際、この監査で見つかった欠陥の
   うち複数は、既存テストが**壊れた挙動のほうを固定していた**）。
2. **欠陥を固定していた既存テストは、主張を反転する**（弱めない・消さない）。
   珍しい形ではない — この監査では繰り返し出た。件数はここに書かない（書くと
   更新のたびにずれる）。
3. gate を足すのは、**実際に起きた欠陥**に対してだけ。足すときは元の欠陥の形を fixture に
   入れる。合成形だけだと、その欠陥を素通りする gate ができる（F-26 の gate の初版が
   実際にそうなり、変異検査で見つかった）。

### 広げた gate は、その場で実違反を出すことがある

F-17 で seed の存在判定 lint を `findUnique` まで広げたところ、`prisma/seed.ts` に
**partial unique の述語を欠いた slug 引きが 4 件**実在した（Event×3・Space×1）。
gate を広げる修正は「gate だけ直して終わり」にならない前提で見積もる。

### 実行して確かめていないもの（残っている不確かさ）

- **GCP 監査（F-20〜22）は実 GCP に対して未実行。** 本番プロジェクトに `gcloud` を叩く
  ため、判定ロジックと母集合を単体テストで固定するに留めた。次の本番監査実行時に、
  これまで見えていなかった違反が新たに報告される可能性がある。
- **seed の 4 件（F-17）は実行して確かめていない。** `db:reset` が破壊的なため。
  型検査と lint は通っている。

---

## 6. 未着手の指摘台帳

**ここに載っている = まだ手が付いていない。**状態列は持たない — 直したら行を消して
[対処の記録](../../audits/2026-08-12-codebase-audit-progress.md)へ移す。件数はこの表の行数がそのまま答えになる。

ID をクリックすると全文（起きること / 直し方 / 該当箇所 / 到達経路 / 既存の検査 / 反証官による訂正）に飛ぶ。

| ID                                                                | 深刻度 | 箇所                                                                                                          | 内容                                                                                                                                                 |
| ----------------------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| [F-77](../../audits/2026-08-12-codebase-audit-findings.md#f-77)   | 低     | `__tests__/support/numeric-column-domains.ts:82`                                                              | 数値列の母集合が BigInt を落とし、AuditLog.sequence が実際に無制約のまま緑                                                                           |
| [F-85](../../audits/2026-08-12-codebase-audit-findings.md#f-85)   | 低     | `__tests__/unit/architecture/prisma-delegate-arg-types.test.ts:192`                                           | prisma-delegate-arg-types は引数のどこかに Prisma. があれば通すので、手書き where が Prisma.Select と同居すると素通りする                            |
| [F-86](../../audits/2026-08-12-codebase-audit-findings.md#f-86)   | 低     | `__tests__/unit/architecture/seed-navigation-reconcile.test.ts:80`                                            | navigation reconcile の列取りこぼし検査が declaredContent ブロックの平文一致 — コメントに列名があるだけで満たされる                                  |
| [F-89](../../audits/2026-08-12-codebase-audit-findings.md#f-89)   | 低     | `prisma/seed.ts:829`                                                                                          | seedSpaceCategories が本番再実行でスペースカテゴリーの説明・アイコン・色を宣言値へ戻す                                                               |
| [F-90](../../audits/2026-08-12-codebase-audit-findings.md#f-90)   | 低     | `prisma/seed.ts:4314`                                                                                         | seedNavigation の (type, order) 一致判定が、管理画面の削除・並び替え後に別項目を指し、本番でナビゲーションが重複する                                 |
| [F-93](../../audits/2026-08-12-codebase-audit-findings.md#f-93)   | 低     | `src/app/(admin)/admin/(dashboard)/_shared/actions/customer/bulk.ts:274`                                      | 顧客一括メールの rate limit が認証前かつ全体で 1 バケットのため、低権限アカウントが機能を 1 時間停止できる                                           |
| [F-96](../../audits/2026-08-12-codebase-audit-findings.md#f-96)   | 低     | `src/app/(admin)/admin/(dashboard)/_shared/components/editor/lexical/nodes/FigmaNode.ts:94`                   | FigmaNode のラベルも公開ページで消える（data-figma-label を描画する実装が無い）                                                                      |
| [F-97](../../audits/2026-08-12-codebase-audit-findings.md#f-97)   | 低     | `src/app/(admin)/admin/(dashboard)/_shared/components/editor/lexical/nodes/MapEmbedNode.tsx:148`              | MapEmbedNode のラベルが公開ページに一切描画されない（data-map-label は書き込み専用で CSS も hydrate も無い）                                         |
| [F-98](../../audits/2026-08-12-codebase-audit-findings.md#f-98)   | 低     | `src/app/(admin)/admin/(dashboard)/_shared/components/editor/lexical/nodes/TabTitleNode.tsx:84`               | TabTitleNode の exportDOM が type 無しの \<button\> を出し、sanitize allowlist も type を通さないため再同意フォーム内で暗黙の submit ボタンになる    |
| [F-99](../../audits/2026-08-12-codebase-audit-findings.md#f-99)   | 低     | `src/app/(admin)/admin/(dashboard)/_shared/components/editor/lexical/plugins/FindReplacePlugin.tsx:212`       | 「全置換」が自己重複する検索語で余分な置換を行い本文を壊す                                                                                           |
| [F-100](../../audits/2026-08-12-codebase-audit-findings.md#f-100) | 低     | `src/app/(admin)/admin/(dashboard)/_shared/components/editor/lexical/plugins/KeyboardShortcutsPlugin.tsx:170` | Ctrl+Shift+数字 の見出し / リスト ショートカットが一切効かない                                                                                       |
| [F-101](../../audits/2026-08-12-codebase-audit-findings.md#f-101) | 低     | `src/app/(admin)/admin/(dashboard)/_shared/components/editor/lexical/plugins/PasteUrlPlugin.tsx:74`           | 空段落への URL 単独ペースト（OGP カード / YouTube 等の自動埋め込み）が発火しない                                                                     |
| [F-104](../../audits/2026-08-12-codebase-audit-findings.md#f-104) | 低     | `src/app/(public)/_shared/hooks/use-format-price.ts:20`                                                       | 公開面の税込表示が Space.taxRateType を無視して常に標準税率で計算するため、予約確認画面の金額と実際の請求額が食い違う                                |
| [F-105](../../audits/2026-08-12-codebase-audit-findings.md#f-105) | 低     | `src/app/(public)/[...segments]/page.tsx:72`                                                                  | post-list / news-list の archive レイアウトを /blog・/news 以外のページに置くと、検索とページ送りが恒久的に効かない                                  |
| [F-106](../../audits/2026-08-12-codebase-audit-findings.md#f-106) | 低     | `src/app/(public)/events/waitlist/checkout/route.ts:63`                                                       | 繰上げ当選の残り 30 分未満クリックが「システムエラー」表示＋CRITICAL アラートになる                                                                  |
| [F-107](../../audits/2026-08-12-codebase-audit-findings.md#f-107) | 低     | `src/app/(public)/mypage/_shared/actions/customer-merge.ts:243`                                               | 顧客履歴の統合が完了しても成功メッセージが表示されない（`mergeSuccess` を描画する側が存在しない）                                                    |
| [F-108](../../audits/2026-08-12-codebase-audit-findings.md#f-108) | 低     | `src/app/(public)/mypage/_shared/actions/profile.ts:199`                                                      | 初回メール登録の「確認メールを送信しました」が画面に出ず、利用者は認証リンクを踏む必要に気付けない                                                   |
| [F-109](../../audits/2026-08-12-codebase-audit-findings.md#f-109) | 低     | `src/app/(public)/mypage/merge/confirm/page.tsx:108`                                                          | /mypage/merge/confirm がクエリ `error` の中身を検証せずページ自身の警告文として描画する                                                              |
| [F-110](../../audits/2026-08-12-codebase-audit-findings.md#f-110) | 低     | `src/app/(public)/mypage/settings/_components/profile-form.tsx:114`                                           | 初回メールアドレス登録で「確認メールを送信しました」が捨てられ、「プロフィールを更新しました」と表示されるため利用者が登録を完了できない             |
| [F-111](../../audits/2026-08-12-codebase-audit-findings.md#f-111) | 低     | `src/app/api/calendar/reservation/[id]/route.ts:117`                                                          | メールの .ics リンクを踏んだ直後 30 分間、ログイン済み顧客はマイページから別予約の .ics を取得できず 401 になる                                      |
| [F-113](../../audits/2026-08-12-codebase-audit-findings.md#f-113) | 低     | `src/app/api/receipts/[serialNo]/pdf/route.ts:122`                                                            | 認証さえあれば他人の serialNo の DL バケットを焼き切れる（所有者突合より前に消費）                                                                   |
| [F-114](../../audits/2026-08-12-codebase-audit-findings.md#f-114) | 低     | `src/app/api/webhooks/resend/route.ts:444`                                                                    | Resend webhook が data.to の全宛先を一括で suppression する（バウンスしていないアドレスまで永久抑止）                                                |
| [F-119](../../audits/2026-08-12-codebase-audit-findings.md#f-119) | 低     | `src/shared/domain/events/public-queries.ts:40`                                                               | 非公開スペースの名前と slug が公開イベントページにリンク付きで出て、リンク先が 404                                                                   |
| [F-121](../../audits/2026-08-12-codebase-audit-findings.md#f-121) | 低     | `src/shared/domain/faq/item-bulk-commands.ts:98`                                                              | bulkMoveFaqItems だけが lock 取得後のカテゴリ再確認を欠き、削除済みカテゴリ配下に生きた FAQ が孤児化して 30 日後に cascade で消える                  |
| [F-122](../../audits/2026-08-12-codebase-audit-findings.md#f-122) | 低     | `src/shared/domain/inquiries/bulk-status-commands.ts:74`                                                      | bulk ステータス変更の TOCTOU フォールバックが他管理者の遷移を自分の成果と誤認し、append-only な状態履歴に偽の行を書く                                |
| [F-124](../../audits/2026-08-12-codebase-audit-findings.md#f-124) | 低     | `src/shared/domain/reservations/reminder-commands.ts:39`                                                      | reminderSentAt が日付に紐づかない永続ラッチのため、リマインダ送信後に日時変更すると新しい日のリマインダが二度と送られない                            |
| [F-125](../../audits/2026-08-12-codebase-audit-findings.md#f-125) | 低     | `src/shared/domain/slugs/validation.ts:82`                                                                    | metadata ルート名（apple-icon / opengraph-image / twitter-image）が予約 slug に無く、その slug のページは作成できるのに公開 URL で永久に表示されない |
| [F-126](../../audits/2026-08-12-codebase-audit-findings.md#f-126) | 低     | `src/shared/emails/delete-account-verification.tsx:63`                                                        | アカウント削除の確認メールが「有効期限 1時間」と書くが実際は 24 時間                                                                                 |
| [F-127](../../audits/2026-08-12-codebase-audit-findings.md#f-127) | 低     | `src/shared/lib/analytics/ga-data-api.ts:121`                                                                 | GA4 Data API の retry が実質 no-op — gRPC Status を HTTP status として読むため一時障害で即失敗する                                                   |
| [F-128](../../audits/2026-08-12-codebase-audit-findings.md#f-128) | 低     | `src/shared/lib/csv.ts:38`                                                                                    | escapeCsvField の引用判定に \\r が無く、レコード区切りが \\r\\n のため裸の CR を含むフィールドで CSV の行が割れて列がずれる                          |
| [F-129](../../audits/2026-08-12-codebase-audit-findings.md#f-129) | 低     | `src/shared/lib/email/receipt-emails.ts:61`                                                                   | 領収書メールの発行日だけが機械形式 (2026-07-26)。PDF・マイページ・プレビューは和暦表記                                                               |
| [F-130](../../audits/2026-08-12-codebase-audit-findings.md#f-130) | 低     | `src/shared/lib/html/sanitize-content-html-core.ts:10`                                                        | 下付き・上付き文字が sanitize allowlist に無く、公開ページで書式が消える                                                                             |
| [F-131](../../audits/2026-08-12-codebase-audit-findings.md#f-131) | 低     | `src/shared/lib/r2/delete.ts:8`                                                                               | R2 一括削除が 1000 件で分割されず、保持期限 purge が一度に 1000 件超の添付を消そうとすると全件が R2 に永久に残る                                     |
| [F-132](../../audits/2026-08-12-codebase-audit-findings.md#f-132) | 低     | `src/shared/lib/sections/definitions/page-hero/schema.ts:53`                                                  | page-hero の images 重複チェックが field 側に付いていて path が二重になり、エラーが誰にも届かない                                                    |

---

## 7. この監査でやっていないこと

成果と同じくらい、範囲外を明示しておく。**着手前にこれを読むこと。**

- **実行時の検証は 1 つもしていない。** ブラウザでの描画、streaming と Suspense の実挙動、Stripe / Google / SwitchBot の実レスポンス、DB の並行動作、メールの MUA 別表示。第 3〜5 次のエージェントが「実行しないと確定できない」として保留した指摘が複数ある。
- **コードベースの約 59 % は読まれていない**（厳密基準。実測は [§2.3](#23-走査率実測自己申告ベース)）。未読の中心は `__tests__/unit/*`（8〜23 %）と `src/app/(admin)`（36 %）で約 2,000 本。**したがって「監査の 133 件を消化しきった = 欠陥が無くなった」ではない。**
- **133 件すべてが著者に直接確認されたわけではない。** 実コードを読んで独立に確認したのは 14 件（[findings](../../audits/2026-08-12-codebase-audit-findings.md) の「実コード確認済」）。残りは検出エージェントと反証エージェントの二段構えに依拠している。第 3 次で確定とした 1 件（設定フォームの楽観ロック）は第 4 次で覆った。

---

## 8. 検証（このリポジトリの規約）

| いつ               | 何を走らせるか                                              |
| ------------------ | ----------------------------------------------------------- |
| 変更を狭く証明する | `bun run test -- <file>` / `bun run lint:files -- <paths>`  |
| commit 前          | `bun run validate`                                          |
| PR を出す前        | `bun run validate && bun run build` と、変更範囲のテスト    |
| 重い E2E / Visual  | `gh workflow run ci.yml --ref <branch> -f run_full_ci=true` |

- `bun run validate` は **type-check と lint だけ**でテストを含まない。
- **成功を主張せず、証拠を出す。** 走らせたコマンドとその出力を示す。
- **落ちている gate を通すために gate の側を触らない。** 主張が誤っているなら、なぜ誤りかを根拠つきで示してから直す。
