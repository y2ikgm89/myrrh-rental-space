# コードベース監査 2026-08-12 — 修正計画書

> **出典**: 2026-08-12 のコードベース監査（61 観点 × 5 ラウンド、エージェント計 261、確定 133 件 / 棄却 61 件）。
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
|    0 |  11 |  64 |  58 |   61 |

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

### A. テストが固定しているのは「配線」であって「振る舞い」ではない ★最優先

第 5 次で決済 webhook のテスト 3,421 行と本番インフラ監査 gate の中身を初めて読んだ結果、独立した 3 体のエージェントが同じ結論に達した。

決済 webhook のテストは route の POST を叩くが、その先の domain module を `mock.module` で全置換している。assertion はすべて**「どの mock が どの引数で 呼ばれたか」の写経**で、DB に何が書かれるかも戻り値の意味も検査しない。

決定的な事実: **`applyStripeChargeRefundIdempotent`（Refund 行を作る 15 行）を実行するテストは 1 本も存在しなかった。**この関数名は `__tests__` 全体に 8 箇所現れるが、すべて `mock.module` の差し替え*側*である。だから「Refund 行の status を渡していない」という欠陥は、それを実行する主体がいないので誰にも観測できなかった。

本番インフラ監査 gate も同じ形をしている。`toEqual([])` は全て、テスト作者が手で組んだ JSON リテラルを純関数に食わせて空配列を確認する形で、**実装が読まないフィールドは fixture にも登場しようがない**（Scheduler の state、Cloud Run の `status.traffic`、`maxScale`、build SA の 3 つ目以降の role）。つまり `toEqual([])` が証明しているのは「私が作った入力に対し実装は何も見つけなかった」であって「本番に問題が無い」ではない。**実装に検査を 1 つ足しても既存 fixture は 1 本も落ちない** — `.claude/rules/architecture-gates.md` が要求する変異検査に耐えない。

確定した決済の欠陥 9 件は、いずれも**「純関数の判定は正しいが、呼び出し側が渡す引数・対象集合が誤っている」**形だった（idempotencyKey に予約 ID 固定を渡す、AUTO_ON_CANCEL を常に全額と決め打つ、failed / canceled 行まで合算対象に入れる）。テストは純関数側を fixture で固定しているので、何をしても落ちない。

- **対処**: 金が動く経路に mock を挟まない層を作る。実 DB を使う integration の土台は既にある。
- **着手済**: #2229。以後、金額書込の本体から順に載せる。
- **関連指摘**: [F-56](../../audits/2026-08-12-codebase-audit-findings.md#f-56) / [F-78](../../audits/2026-08-12-codebase-audit-findings.md#f-78) / [F-118](../../audits/2026-08-12-codebase-audit-findings.md#f-118)（決済 webhook テストと共有 mock）、[F-20](../../audits/2026-08-12-codebase-audit-findings.md#f-20) / [F-21](../../audits/2026-08-12-codebase-audit-findings.md#f-21) / [F-22](../../audits/2026-08-12-codebase-audit-findings.md#f-22) / [F-80](../../audits/2026-08-12-codebase-audit-findings.md#f-80)（本番インフラ gate の fixture）

### B. キャッシュ×ドメイン

cacheTag() producer と next.config.ts の Cache-Tag ヘッダが独立した 2 つの SSoT になっており、対応を検査する gate が無い。証拠: src/shared/domain/events/public-queries.ts:97 は `cacheTag(EVENTS, LOCATIONS, SPACES)` を宣言するのに、next.config.ts:289 の /events は EVENTS\_CACHE\_TAG のみ。gate \_\_tests\_\_/unit/architecture/next-config-cache-tag-emission.test.ts の JSDoc を読むと、検査しているのは SITE\_WIDE\_CDN\_TAGS の inline 有無と PRIVATE\_NO\_TAG\_PREFIXES だけで、producer 側 cacheTag との突合は範囲外。指摘20・21・22 は 3 件の別バグではなく、この 1 つの穴の 3 つの症状。

- **関連指摘**: [F-18](../../audits/2026-08-12-codebase-audit-findings.md#f-18) / [F-73](../../audits/2026-08-12-codebase-audit-findings.md#f-73) / [F-88](../../audits/2026-08-12-codebase-audit-findings.md#f-88)

### C. イベント×定員×金額×決済

EventTicket.unitSize が DB と admin フォームにしか存在せず、価格式にも定員式にも入っていない。db-schema 観点が価格側(指摘19)を見つけたが、定員側(registration-create-commands.ts:124 の `slot.capacity - sum(quantity)`)は誰の担当でもなかった。同一の欠落が「多重課金」と「オーバーブッキング」という別カテゴリの障害として現れるため、片方だけ直すと残る。

- **関連指摘**: [F-02](../../audits/2026-08-12-codebase-audit-findings.md#f-02) / [F-47](../../audits/2026-08-12-codebase-audit-findings.md#f-47)

### D. feature フラグ×決済×cron の非対称

cron は features を gate するが Stripe webhook は gate しない。証拠: src/app/api/cron/unpaid-event-registration-expire/route.ts:35 と waitlist-expire/route.ts:54 は `isFeatureEnabled('events')` が false なら skip する一方、`grep -rn isFeatureEnabled src/app/api/webhooks/` は 0 件。events モジュールを OFF にした瞬間、未払い申込の期限切れとキャンセル待ちオファーの失効が止まり、決済 webhook だけが動き続ける。api-cron-webhooks 観点は cron 側を、payment 観点は webhook 側を見ており、非対称は両者の境界に落ちる。

- **関連指摘**: [F-65](../../audits/2026-08-12-codebase-audit-findings.md#f-65) / [F-103](../../audits/2026-08-12-codebase-audit-findings.md#f-103) / [F-133](../../audits/2026-08-12-codebase-audit-findings.md#f-133)

### E. 顧客匿名化×メール×領収書×監査ログ

data-retention/commands.ts:339 が anonymizeCustomerCommand を呼んで Customer.email を non-routable な placeholder に置換するが、Reservation / Receipt / AuditLog / EventRegistration 側に残る PII と表示経路は誰も突き合わせていない。指摘25(リマインダが placeholder 宛に送る)はその一断面で、同じ構造が受領書 PDF の宛名、監査ログの actor 表示、mypage の履歴表示にもある。

- **関連指摘**: [F-44](../../audits/2026-08-12-codebase-audit-findings.md#f-44) / [F-52](../../audits/2026-08-12-codebase-audit-findings.md#f-52) / [F-112](../../audits/2026-08-12-codebase-audit-findings.md#f-112) / [F-116](../../audits/2026-08-12-codebase-audit-findings.md#f-116) / [F-117](../../audits/2026-08-12-codebase-audit-findings.md#f-117)

### F. クーポン claim/release の分散

claim は payloads.ts:207 の単一 atomic UPDATE で堅い(WHERE に is\_active/usage\_limit/valid\_from/valid\_until/min\_reservation\_amount を再強制)のに対し、release は cancel-core.ts:157 / lifecycle-commands.ts:144,455 / pending-expiry.ts:133 / series-commands.ts:408 / admin-commands.ts:586 / calendar-sync-inbound-mutations.ts:108 の 6 ファイルに散在。Stripe の非同期決済(checkout.session.async\_payment\_succeeded)が pending-expiry の release 後に着弾する順序は、payment 観点も reservations 観点も検証していない。

- **関連指摘**: [F-58](../../audits/2026-08-12-codebase-audit-findings.md#f-58) / [F-59](../../audits/2026-08-12-codebase-audit-findings.md#f-59) / [F-60](../../audits/2026-08-12-codebase-audit-findings.md#f-60)

### G. 認可×Server Component 描画

管理画面 72 個の page.tsx のうち page 境界で resource 権限を取るのは 14 個で、残りは @/admin/queries/\* の loader 側 guard に依存する設計(page-auth.ts の JSDoc が明言)。今回 exports 数と guard 数の突合は取れている(customer.ts は exports=4/guards=5)が、loader を通らずに props で Client Component へ渡る PII 経路(例: customers/\[id\]/\_components/CustomerDetail.tsx)は authz 観点が「ページ側の描画時ガードは未走査」と申告したまま。

- **関連指摘**: [F-92](../../audits/2026-08-12-codebase-audit-findings.md#f-92) / [F-102](../../audits/2026-08-12-codebase-audit-findings.md#f-102) / [F-115](../../audits/2026-08-12-codebase-audit-findings.md#f-115)

### H. Google Calendar 逆流×金額×クーポン

calendar-sync-inbound-mutations.ts:108 が GCal 起点のキャンセルで Coupon.usageCount を decrement する。reservations 観点は calendar-sync 系 4 ファイルを未読、integrations 観点は overlap/advisory lock を未検証と申告しているため、外部システムからの逆流が金額・クーポン・返金に及ぼす副作用は構造的に無検査。指摘26・27 は同じ経路の別の症状。

- **関連指摘**: [F-09](../../audits/2026-08-12-codebase-audit-findings.md#f-09) / [F-11](../../audits/2026-08-12-codebase-audit-findings.md#f-11) / [F-46](../../audits/2026-08-12-codebase-audit-findings.md#f-46) / [F-61](../../audits/2026-08-12-codebase-audit-findings.md#f-61) / [F-123](../../audits/2026-08-12-codebase-audit-findings.md#f-123)

### I. gate の走査範囲×DB 書込経路

175 gate 中 scripts/ を走査範囲に含むのは 11 本のみ。scripts/e2e/ の 13 ファイルが prisma を直接叩き、Receipt / Reservation / SmartLockPasscode の deleteMany を含む。append-only 系・破壊的 DML 系の gate は同じ穴を共有しており、指摘40 はその一例。gate-integrity 観点は個別 gate の空振りを見たが、「走査範囲の母集合が書込経路の母集合と一致しているか」という上位の問いは誰も立てていない。

- **関連指摘**: [F-13](../../audits/2026-08-12-codebase-audit-findings.md#f-13) / [F-23](../../audits/2026-08-12-codebase-audit-findings.md#f-23) / [F-83](../../audits/2026-08-12-codebase-audit-findings.md#f-83)

### J. 予約×イベント×スペースの並行制御 namespace

advisory lock namespace が 728350(イベント定員) / 728351(スペース) / 728354(waitlist promote session) / 728357(series) / 728349(calendar-sync) と 5 系統あり、waitlist-locks.ts の JSDoc が「常に番号降順で取得」という契約を宣言している。reservations 観点は space-locks.ts を、events は誰も見ていないため、両方を跨ぐ経路(イベント更新時のスペース重複チェック)の順序遵守は未検証。しかも session lock は connection pin を要求する契約で、pooled client で acquire/release が分かれると silent-false でリークする(JSDoc が明記)。

- **関連指摘**: [F-120](../../audits/2026-08-12-codebase-audit-findings.md#f-120)

---

## 5. フェーズ計画

影響と不可逆性が大きい順。**高 11 件は全件クローズ済み**なので、残っているのは以下だけ。
済んだ経緯は [対処の記録](../../audits/2026-08-12-codebase-audit-progress.md)。

### フェーズ 1 — 鍵ローテーション（完了）

`CLOUDFLARE_ORIGIN_HEADER_SECRET` の段 1〜3 は完了。記録は
[対処の記録 §3](../../audits/2026-08-12-codebase-audit-progress.md#3-f-01-の鍵ローテーション段階実行中)。

### フェーズ 2 — 済んだ修正の取りこぼし

台帳には載らない小さな残件が 2 つある。どちらも本体は解決済みで、**何が残っているかは
[対処の記録 §2](../../audits/2026-08-12-codebase-audit-progress.md#2-済んだ指摘17-件) の
「残件」列が SSoT**。ここには写さない（写した瞬間から食い違う）。

手が空いたときに、その列を見て潰す。

### フェーズ 3 — 構造の穴（§4）

A（決済に mock を挟まない層）が最優先。#2229 に続けて金額書込の本体から順に載せる。
次に B（キャッシュタグの gate 化）— 中程度の指摘 3 件がまとめて消える。

### フェーズ 4 — 中（43 件）

§4 のテーマに属するものはテーマ単位で。残りは §6 の台帳から個別に。

### フェーズ 5 — 低（57 件）

上記が片付いてから。多くは UI の細部・メール文言・gate の母集合の穴で、単独では急がない。

---

## 6. 未着手の指摘台帳

**ここに載っている = まだ手が付いていない。**状態列は持たない — 直したら行を消して
[対処の記録](../../audits/2026-08-12-codebase-audit-progress.md)へ移す。件数はこの表の行数がそのまま答えになる。

ID をクリックすると全文（起きること / 直し方 / 該当箇所 / 到達経路 / 既存の検査 / 反証官による訂正）に飛ぶ。

| ID                                                                | 深刻度 | 箇所                                                                                                          | 内容                                                                                                                                                            |
| ----------------------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [F-12](../../audits/2026-08-12-codebase-audit-findings.md#f-12)   | 中     | `__tests__/unit/architecture/cross-surface-import-gate.test.ts:31`                                            | cross-surface import gate が `from "…"` 形しか見ず、動的 import と `@/app/(admin\|public)/…` 経路を素通しする                                                   |
| [F-13](../../audits/2026-08-12-codebase-audit-findings.md#f-13)   | 中     | `__tests__/unit/architecture/inquiry-status-history-append-only.test.ts:41`                                   | inquiry\_status\_history の append-only gate が走査範囲外（scripts/e2e）を見ておらず、走査規模の下限も持たない                                                  |
| [F-14](../../audits/2026-08-12-codebase-audit-findings.md#f-14)   | 中     | `__tests__/unit/architecture/use-server-exports.test.ts:41`                                                   | use-server gate は「先頭に必ず directive がある」前提で母集合を作るため、docstring を先頭に置いた "use server" ファイルが丸ごと検査対象から消える               |
| [F-15](../../audits/2026-08-12-codebase-audit-findings.md#f-15)   | 中     | `__tests__/unit/shared/lib/csp/sanitize-css.test.ts:21`                                                       | sanitize-css.test.ts が「無効な CSS プロパティ名」を固定していて、透過ヘッダー時の main の負マージンが本番で効いていない                                        |
| [F-17](../../audits/2026-08-12-codebase-audit-findings.md#f-17)   | 中     | `eslint-rules/seed-respects-unique-constraints.mjs:460`                                                       | seed の partial unique probe 検査が findFirst 限定 — 元の欠陥そのものである findUnique 形が lint を素通りする                                                   |
| [F-18](../../audits/2026-08-12-codebase-audit-findings.md#f-18)   | 中     | `next.config.ts:243`                                                                                          | /access とカスタムページは Cache-Tag を 1 つも出さないため、メンテナンスモード等の site-wide 無効化が CDN edge に届かない                                       |
| [F-19](../../audits/2026-08-12-codebase-audit-findings.md#f-19)   | 中     | `prisma/seed.ts:488`                                                                                          | seedProduction の再実行が SEO 設定と送信元メール設定を管理画面編集ごと上書きする                                                                                |
| [F-20](../../audits/2026-08-12-codebase-audit-findings.md#f-20)   | 中     | `scripts/audit-gcp-production-iap.ts:831`                                                                     | 本番監査の Secret Manager 検査母集合が Cloud Run runtime map 由来で、direct DB 資格情報 `DIRECT_URL` が version 検査・per-secret IAM 検査から丸ごと外れている   |
| [F-21](../../audits/2026-08-12-codebase-audit-findings.md#f-21)   | 中     | `scripts/audit-gcp-production-iap.ts:1149`                                                                    | Secret Manager accessor の期待値が三者で矛盾し、audit に従うと runtime SA の唯一の grant を剥がす手順に誘導される                                               |
| [F-22](../../audits/2026-08-12-codebase-audit-findings.md#f-22)   | 中     | `scripts/gcp-production-audit-model.ts:617`                                                                   | build service account の project 権限検査は 2 role の denylist — roles/editor や roles/owner を足しても緑                                                       |
| [F-23](../../audits/2026-08-12-codebase-audit-findings.md#f-23)   | 中     | `scripts/setup-local.ts:167`                                                                                  | `bun run setup` の migrate deploy が破壊的 DB ガードを通らず、.env.local の本番 DIRECT\_URL に当たる                                                            |
| [F-26](../../audits/2026-08-12-codebase-audit-findings.md#f-26)   | 中     | `src/app/(admin)/admin/(dashboard)/_shared/components/editor/lexical/nodes/ImageNode.ts:119`                  | ImageNode は DecoratorNode 既定の isInline()=true のまま block の \<figure\> を exportDOM する（段落内挿入で保存 HTML の段落構造が壊れる）                      |
| [F-27](../../audits/2026-08-12-codebase-audit-findings.md#f-27)   | 中     | `src/app/(admin)/admin/(dashboard)/_shared/components/editor/lexical/nodes/TimelineNode.tsx:30`               | TimelineContainerNode の flat state key "direction" が ElementNode の direction と衝突し、横→縦に戻せない                                                       |
| [F-28](../../audits/2026-08-12-codebase-audit-findings.md#f-28)   | 中     | `src/app/(admin)/admin/(dashboard)/_shared/components/editor/lexical/plugins/DraggableBlockPlugin.tsx:163`    | ⋮⋮ メニューの「複製」が中身のない空ブロックを作る                                                                                                               |
| [F-29](../../audits/2026-08-12-codebase-audit-findings.md#f-29)   | 中     | `src/app/(admin)/admin/(dashboard)/_shared/lib/validations/space.ts:70`                                       | 設備がちょうど1件のスペースは保存できず、エラーも表示されない                                                                                                   |
| [F-32](../../audits/2026-08-12-codebase-audit-findings.md#f-32)   | 中     | `src/app/(admin)/admin/(dashboard)/faq/_components/FaqCategoryItemsTable.tsx:250`                             | FAQ 質問の D&D 並び替えが「order は 0..N-1 で連続」を前提にしており、削除履歴のあるカテゴリの 2 ページ目以降で必ず失敗する                                      |
| [F-34](../../audits/2026-08-12-codebase-audit-findings.md#f-34)   | 中     | `src/app/(admin)/admin/(dashboard)/pages/[slug]/_sections/_components/auto-fields/AutoArrayField.tsx:89`      | 配列アイテム追加時に select フィールドへ "" を入れるため、ボタンを1件足すとセクションが保存不能（無反応）になる                                                 |
| [F-35](../../audits/2026-08-12-codebase-audit-findings.md#f-35)   | 中     | `src/app/(admin)/admin/(dashboard)/pages/[slug]/_sections/_components/auto-fields/AutoGroupField.tsx:72`      | AutoGroupField を折りたたんだまま保存すると group 内の値が黙って消える                                                                                          |
| [F-36](../../audits/2026-08-12-codebase-audit-findings.md#f-36)   | 中     | `src/app/(admin)/admin/(dashboard)/reservations/_components/rrule-utils.ts:77`                                | 繰返し予約の「終了日」指定が UTC 深夜で切られ、終了日当日の予約が作成されない                                                                                   |
| [F-37](../../audits/2026-08-12-codebase-audit-findings.md#f-37)   | 中     | `src/app/(public)/_components/InstagramSection.tsx:87`                                                        | Instagram の VIDEO 投稿は動画 URL を next/image に渡すため公開トップのタイルが必ず壊れる                                                                        |
| [F-38](../../audits/2026-08-12-codebase-audit-findings.md#f-38)   | 中     | `src/app/(public)/mypage/_shared/actions/reservation.ts:124`                                                  | メンテナンス中でもマイページ経由の予約キャンセル/変更は通り、Stripe 返金とメール送信が実行される                                                                |
| [F-39](../../audits/2026-08-12-codebase-audit-findings.md#f-39)   | 中     | `src/app/(public)/reservation/_components/reservation-form.tsx:304`                                           | クーポンコードの 1 打鍵ごとに料金プレビュー Server Action が飛び、公開クエリのレート上限（30回/分/IP）を食い潰して料金表示と時間枠取得が壊れる                  |
| [F-42](../../audits/2026-08-12-codebase-audit-findings.md#f-42)   | 中     | `src/shared/domain/audit-log/queries.ts:303`                                                                  | 監査ログ CSV エクスポートが 10,000 件で無言に打ち切られ、しかも古い順なので直近の証跡が欠落する                                                                 |
| [F-43](../../audits/2026-08-12-codebase-audit-findings.md#f-43)   | 中     | `src/shared/domain/cancellation/run-auto-refund-on-cancel.ts:164`                                             | キャンセル時の自動返金額を総額から計算し、既存の部分返金を差し引かないため返金が丸ごとスキップされる                                                            |
| [F-44](../../audits/2026-08-12-codebase-audit-findings.md#f-44)   | 中     | `src/shared/domain/customers/customer-lifecycle-commands.ts:407`                                              | ゲスト履歴統合で会員自身のメールが恒久 suppression され、管理画面から復旧できない                                                                               |
| [F-45](../../audits/2026-08-12-codebase-audit-findings.md#f-45)   | 中     | `src/shared/domain/events/email-queries.ts:141`                                                               | イベント一斉配信が marketingOptIn を無視するため、One-Click 配信停止を押しても次の配信が届く                                                                    |
| [F-46](../../audits/2026-08-12-codebase-audit-findings.md#f-46)   | 中     | `src/shared/domain/events/event-calendar-import-commands.ts:216`                                              | Google Calendar 側でイベントを消すと、公開済み・申込ありのイベントまで無条件に CANCELLED にされる                                                               |
| [F-47](../../audits/2026-08-12-codebase-audit-findings.md#f-47)   | 中     | `src/shared/domain/events/event-slot-sync-commands.ts:176`                                                    | EventTicket.capacity の下限検証だけがイベント全体集計で、実際の定員enforcementはスロット単位                                                                    |
| [F-49](../../audits/2026-08-12-codebase-audit-findings.md#f-49)   | 中     | `src/shared/domain/events/payment-queries.ts:428`                                                             | 非同期返金の確定処理が AUTO\_ON\_CANCEL を「常に全額」と決め打ちし、ポリシー按分の部分返金を REFUNDED に確定させる                                              |
| [F-51](../../audits/2026-08-12-codebase-audit-findings.md#f-51)   | 中     | `src/shared/domain/faq/analytics-commands.ts:12`                                                              | 公開 FAQ の閲覧・投票が updatedAt を更新するため、鮮度チェック cron と管理画面の「未更新」指標が恒久的に 0 になる                                               |
| [F-53](../../audits/2026-08-12-codebase-audit-findings.md#f-53)   | 中     | `src/shared/domain/pages/system-pages-commands.ts:40`                                                         | システムページから削除したセクションが、編集画面を開くたび／管理サービス起動のたびに初期デモ文言つきで復活する                                                  |
| [F-56](../../audits/2026-08-12-codebase-audit-findings.md#f-56)   | 中     | `src/shared/domain/payment/payment-claim-orchestration.ts:195`                                                | 非ゼロ小数点通貨の部分返金で Refund.amount に小数が渡り webhook が 500 ループに入る                                                                             |
| [F-61](../../audits/2026-08-12-codebase-audit-findings.md#f-61)   | 中     | `src/shared/domain/reservations/calendar-sync.ts:134`                                                         | series instance の GCal update/delete 失敗が 3 つの retry pool すべてから漏れ、恒久的に取り残される                                                             |
| [F-62](../../audits/2026-08-12-codebase-audit-findings.md#f-62)   | 中     | `src/shared/domain/reservations/customer-commands.ts:574`                                                     | paymentStatus=FAILED の予約は編集画面が開けるのに保存が必ず失敗し、誤ったエラー文言で永久に変更できない                                                         |
| [F-63](../../audits/2026-08-12-codebase-audit-findings.md#f-63)   | 中     | `src/shared/domain/sections/commands.ts:218`                                                                  | テンプレート必須セクションを複製できてしまい、複製後は削除も非表示もできず公開ページに二重表示が固定される                                                      |
| [F-64](../../audits/2026-08-12-codebase-audit-findings.md#f-64)   | 中     | `src/shared/domain/sections/queries.ts:131`                                                                   | 公開ページの全セクションを非表示にすると、コード同梱の初期デモセクションが公開面に復帰する                                                                      |
| [F-65](../../audits/2026-08-12-codebase-audit-findings.md#f-65)   | 中     | `src/shared/domain/settings/queries/features.ts:21`                                                           | feature toggle が公開 Cloud Run サービスに最大24時間届かない（Data Cache はサービス跨ぎで無効化されない）                                                       |
| [F-69](../../audits/2026-08-12-codebase-audit-findings.md#f-69)   | 中     | `src/shared/domain/terms/queries.ts:233`                                                                      | 必須規約の同意ゲートが DB 一時障害で fail-open し、その空結果が 'use cache' に最大1時間焼き付く                                                                 |
| [F-71](../../audits/2026-08-12-codebase-audit-findings.md#f-71)   | 中     | `src/shared/lib/action-helpers.ts:86`                                                                         | bot 判定が「クライアント時計」と「サーバー時計」を引き算するため、端末の時計が進んでいる利用者は全公開フォームを送信できない                                    |
| [F-72](../../audits/2026-08-12-codebase-audit-findings.md#f-72)   | 中     | `src/shared/lib/cache/health.ts:53`                                                                           | 起動時の Cloudflare canary purge が最大 10 分 × 3 回スリープしうるため、Cloud Run の startup probe 予算 90 秒を超えてコンテナが起動不能になる                   |
| [F-73](../../audits/2026-08-12-codebase-audit-findings.md#f-73)   | 中     | `src/shared/lib/constants/cdn-cache-tags.ts:215`                                                              | イベント slug が cancel/waitlist/registrations で始まると詳細ページの Cache-Tag が丸ごと消える（lookahead が前方一致）                                          |
| [F-74](../../audits/2026-08-12-codebase-audit-findings.md#f-74)   | 中     | `src/shared/lib/email/reservation-emails.ts:219`                                                              | 予約メールの「料金」が税抜合計。実際の請求・領収書・振込額は税込                                                                                                |
| [F-75](../../audits/2026-08-12-codebase-audit-findings.md#f-75)   | 中     | `src/shared/lib/styles/layout-mapper.ts:106`                                                                  | 記事本文の contentWidth が Tailwind に存在しないクラス名として出力され、公開ページで常に無効になる                                                              |
| [F-76](../../audits/2026-08-12-codebase-audit-findings.md#f-76)   | 低     | `__tests__/helpers/architecture-fs.ts:41`                                                                     | module-reachability の import 抽出正規表現が JSDoc 例示コードを実 import として辺に加える                                                                       |
| [F-77](../../audits/2026-08-12-codebase-audit-findings.md#f-77)   | 低     | `__tests__/support/numeric-column-domains.ts:82`                                                              | 数値列の母集合が BigInt を落とし、AuditLog.sequence が実際に無制約のまま緑                                                                                      |
| [F-78](../../audits/2026-08-12-codebase-audit-findings.md#f-78)   | 低     | `__tests__/unit/api/stripe-webhook.test.ts:104`                                                               | webhook 境界 mock の `latestRefund` 型が `metadata` を落としており、返金 attribution 復元に assertion が 1 つも無い                                             |
| [F-79](../../audits/2026-08-12-codebase-audit-findings.md#f-79)   | 低     | `__tests__/unit/architecture-boundaries.test.ts:1642`                                                         | required check の path filter gate が block 形式の `paths:` しか検出せず、事故の原型である flow 形式 `paths: [terraform/**]` を見逃す                           |
| [F-80](../../audits/2026-08-12-codebase-audit-findings.md#f-80)   | 低     | `__tests__/unit/architecture-boundaries.test.ts:1331`                                                         | import{} block 必須判定の母集合が `google_*` 決め打ち配列で、Cloudflare resource は永久に検査されない（既に 1 件が import 無しで存在）                          |
| [F-81](../../audits/2026-08-12-codebase-audit-findings.md#f-81)   | 低     | `__tests__/unit/architecture/admin-page-header-actions-wrap.test.ts:68`                                       | page-header 折り返し gate の母集合が class の並び順に依存する（並べ替えた新ページは永久に無検査）                                                               |
| [F-82](../../audits/2026-08-12-codebase-audit-findings.md#f-82)   | 低     | `__tests__/unit/architecture/csp-nonce-prelude-gate.test.ts:65`                                               | CSP prelude gate の「数え漏らしていない」判定が、先頭が `next build` の script を数えない                                                                       |
| [F-83](../../audits/2026-08-12-codebase-audit-findings.md#f-83)   | 低     | `__tests__/unit/architecture/e2e-fixture-singleton-writes.test.ts:35`                                         | e2e-fixture-singleton-writes gate は scripts/e2e/ しか見ず、receiver も `prisma.` 決め打ち — e2e/helpers に現存する違反を素通りさせている                       |
| [F-84](../../audits/2026-08-12-codebase-audit-findings.md#f-84)   | 低     | `__tests__/unit/architecture/playwright-mobile-device-projects.test.ts:90`                                    | 「実行対象ゼロの dead project を禁じる」と謳う gate が、実際にはファイル一致しか見ておらず 0 テスト実行を見逃す                                                 |
| [F-85](../../audits/2026-08-12-codebase-audit-findings.md#f-85)   | 低     | `__tests__/unit/architecture/prisma-delegate-arg-types.test.ts:192`                                           | prisma-delegate-arg-types は引数のどこかに Prisma. があれば通すので、手書き where が Prisma.Select と同居すると素通りする                                       |
| [F-86](../../audits/2026-08-12-codebase-audit-findings.md#f-86)   | 低     | `__tests__/unit/architecture/seed-navigation-reconcile.test.ts:80`                                            | navigation reconcile の列取りこぼし検査が declaredContent ブロックの平文一致 — コメントに列名があるだけで満たされる                                             |
| [F-87](../../audits/2026-08-12-codebase-audit-findings.md#f-87)   | 低     | `infra/monitoring/log-metrics/cron-oidc-failure.yaml:15`                                                      | cron\_oidc\_failure メトリックが /api/cron/\* の 500 を無条件に数えるため、OIDC と無関係な cron 障害で「cron OIDC failure」が発火し、runbook が当直を誤誘導する |
| [F-88](../../audits/2026-08-12-codebase-audit-findings.md#f-88)   | 低     | `next.config.ts:85`                                                                                           | /events とイベント詳細の Cache-Tag に space-v1 / location-v1 が無く、会場住所・スペース名の変更が edge に反映されない                                           |
| [F-89](../../audits/2026-08-12-codebase-audit-findings.md#f-89)   | 低     | `prisma/seed.ts:829`                                                                                          | seedSpaceCategories が本番再実行でスペースカテゴリーの説明・アイコン・色を宣言値へ戻す                                                                          |
| [F-90](../../audits/2026-08-12-codebase-audit-findings.md#f-90)   | 低     | `prisma/seed.ts:4314`                                                                                         | seedNavigation の (type, order) 一致判定が、管理画面の削除・並び替え後に別項目を指し、本番でナビゲーションが重複する                                            |
| [F-91](../../audits/2026-08-12-codebase-audit-findings.md#f-91)   | 低     | `scripts/migrate-test-db.ts:83`                                                                               | Bun.spawnSync().exitCode is null on signal-kill, so `process.exit(run())` turns a killed `prisma migrate deploy` into exit 0                                    |
| [F-92](../../audits/2026-08-12-codebase-audit-findings.md#f-92)   | 低     | `src/app/(admin)/admin/(dashboard)/_shared/actions/command-palette/search.ts:38`                              | command palette の検索が EDITOR の userPageAssignment 絞り込みを迂回し、全ページのタイトル/slug を返す                                                          |
| [F-93](../../audits/2026-08-12-codebase-audit-findings.md#f-93)   | 低     | `src/app/(admin)/admin/(dashboard)/_shared/actions/customer/bulk.ts:274`                                      | 顧客一括メールの rate limit が認証前かつ全体で 1 バケットのため、低権限アカウントが機能を 1 時間停止できる                                                      |
| [F-94](../../audits/2026-08-12-codebase-audit-findings.md#f-94)   | 低     | `src/app/(admin)/admin/(dashboard)/_shared/actions/event-waitlist.ts:217`                                     | 管理画面の手動「期限切れ」が次の WAITLISTED を繰り上げず、待機列が永久に stall する                                                                             |
| [F-95](../../audits/2026-08-12-codebase-audit-findings.md#f-95)   | 低     | `src/app/(admin)/admin/(dashboard)/_shared/actions/settings/google-calendar.ts:101`                           | Google Calendar 設定保存が NOTIFICATION\_SETTINGS を無効化せず、.ics 添付／カレンダー追加リンクの OFF が数日反映されない                                        |
| [F-96](../../audits/2026-08-12-codebase-audit-findings.md#f-96)   | 低     | `src/app/(admin)/admin/(dashboard)/_shared/components/editor/lexical/nodes/FigmaNode.ts:94`                   | FigmaNode のラベルも公開ページで消える（data-figma-label を描画する実装が無い）                                                                                 |
| [F-97](../../audits/2026-08-12-codebase-audit-findings.md#f-97)   | 低     | `src/app/(admin)/admin/(dashboard)/_shared/components/editor/lexical/nodes/MapEmbedNode.tsx:148`              | MapEmbedNode のラベルが公開ページに一切描画されない（data-map-label は書き込み専用で CSS も hydrate も無い）                                                    |
| [F-98](../../audits/2026-08-12-codebase-audit-findings.md#f-98)   | 低     | `src/app/(admin)/admin/(dashboard)/_shared/components/editor/lexical/nodes/TabTitleNode.tsx:84`               | TabTitleNode の exportDOM が type 無しの \<button\> を出し、sanitize allowlist も type を通さないため再同意フォーム内で暗黙の submit ボタンになる               |
| [F-99](../../audits/2026-08-12-codebase-audit-findings.md#f-99)   | 低     | `src/app/(admin)/admin/(dashboard)/_shared/components/editor/lexical/plugins/FindReplacePlugin.tsx:212`       | 「全置換」が自己重複する検索語で余分な置換を行い本文を壊す                                                                                                      |
| [F-100](../../audits/2026-08-12-codebase-audit-findings.md#f-100) | 低     | `src/app/(admin)/admin/(dashboard)/_shared/components/editor/lexical/plugins/KeyboardShortcutsPlugin.tsx:170` | Ctrl+Shift+数字 の見出し / リスト ショートカットが一切効かない                                                                                                  |
| [F-101](../../audits/2026-08-12-codebase-audit-findings.md#f-101) | 低     | `src/app/(admin)/admin/(dashboard)/_shared/components/editor/lexical/plugins/PasteUrlPlugin.tsx:74`           | 空段落への URL 単独ペースト（OGP カード / YouTube 等の自動埋め込み）が発火しない                                                                                |
| [F-102](../../audits/2026-08-12-codebase-audit-findings.md#f-102) | 低     | `src/app/(admin)/admin/(dashboard)/_shared/queries/_helpers.ts:68`                                            | 権限拒否の監査ログが after() に登録されない裸の detached promise で、notFound() 直前に投げっぱなしにされる                                                      |
| [F-103](../../audits/2026-08-12-codebase-audit-findings.md#f-103) | 低     | `src/app/(public)/_shared/components/layouts/site-header.tsx:514`                                             | サイトヘッダーの Reserve CTA が feature gate を持たず、reservation OFF で全公開ページから 404 へ誘導する                                                        |
| [F-104](../../audits/2026-08-12-codebase-audit-findings.md#f-104) | 低     | `src/app/(public)/_shared/hooks/use-format-price.ts:20`                                                       | 公開面の税込表示が Space.taxRateType を無視して常に標準税率で計算するため、予約確認画面の金額と実際の請求額が食い違う                                           |
| [F-105](../../audits/2026-08-12-codebase-audit-findings.md#f-105) | 低     | `src/app/(public)/[...segments]/page.tsx:72`                                                                  | post-list / news-list の archive レイアウトを /blog・/news 以外のページに置くと、検索とページ送りが恒久的に効かない                                             |
| [F-106](../../audits/2026-08-12-codebase-audit-findings.md#f-106) | 低     | `src/app/(public)/events/waitlist/checkout/route.ts:63`                                                       | 繰上げ当選の残り 30 分未満クリックが「システムエラー」表示＋CRITICAL アラートになる                                                                             |
| [F-107](../../audits/2026-08-12-codebase-audit-findings.md#f-107) | 低     | `src/app/(public)/mypage/_shared/actions/customer-merge.ts:243`                                               | 顧客履歴の統合が完了しても成功メッセージが表示されない（`mergeSuccess` を描画する側が存在しない）                                                               |
| [F-108](../../audits/2026-08-12-codebase-audit-findings.md#f-108) | 低     | `src/app/(public)/mypage/_shared/actions/profile.ts:199`                                                      | 初回メール登録の「確認メールを送信しました」が画面に出ず、利用者は認証リンクを踏む必要に気付けない                                                              |
| [F-109](../../audits/2026-08-12-codebase-audit-findings.md#f-109) | 低     | `src/app/(public)/mypage/merge/confirm/page.tsx:108`                                                          | /mypage/merge/confirm がクエリ `error` の中身を検証せずページ自身の警告文として描画する                                                                         |
| [F-110](../../audits/2026-08-12-codebase-audit-findings.md#f-110) | 低     | `src/app/(public)/mypage/settings/_components/profile-form.tsx:114`                                           | 初回メールアドレス登録で「確認メールを送信しました」が捨てられ、「プロフィールを更新しました」と表示されるため利用者が登録を完了できない                        |
| [F-111](../../audits/2026-08-12-codebase-audit-findings.md#f-111) | 低     | `src/app/api/calendar/reservation/[id]/route.ts:117`                                                          | メールの .ics リンクを踏んだ直後 30 分間、ログイン済み顧客はマイページから別予約の .ics を取得できず 401 になる                                                 |
| [F-112](../../audits/2026-08-12-codebase-audit-findings.md#f-112) | 低     | `src/app/api/cron/reservation-reminder/route.ts:62`                                                           | 退会（匿名化）済み顧客の予約でリマインダ cron が placeholder アドレス宛に送信し、確実に hard bounce する                                                        |
| [F-113](../../audits/2026-08-12-codebase-audit-findings.md#f-113) | 低     | `src/app/api/receipts/[serialNo]/pdf/route.ts:122`                                                            | 認証さえあれば他人の serialNo の DL バケットを焼き切れる（所有者突合より前に消費）                                                                              |
| [F-114](../../audits/2026-08-12-codebase-audit-findings.md#f-114) | 低     | `src/app/api/webhooks/resend/route.ts:444`                                                                    | Resend webhook が data.to の全宛先を一括で suppression する（バウンスしていないアドレスまで永久抑止）                                                           |
| [F-115](../../audits/2026-08-12-codebase-audit-findings.md#f-115) | 低     | `src/shared/domain/admin-search/queries.ts:149`                                                               | コマンドパレット検索が EDITOR の userPageAssignment スコープを無視して全 page を返す                                                                            |
| [F-117](../../audits/2026-08-12-codebase-audit-findings.md#f-117) | 低     | `src/shared/domain/customers/link.ts:131`                                                                     | 管理者による「顧客の紐づけ解除」は顧客の次回ログインで自動的に巻き戻り、問い合わせ本文と添付がマイページに復帰する                                              |
| [F-118](../../audits/2026-08-12-codebase-audit-findings.md#f-118) | 低     | `src/shared/domain/events/payment-queries.ts:241`                                                             | 論理削除されたイベントの返金が charge.refunded で無言で捨てられ、PAID のまま残る                                                                                |
| [F-119](../../audits/2026-08-12-codebase-audit-findings.md#f-119) | 低     | `src/shared/domain/events/public-queries.ts:40`                                                               | 非公開スペースの名前と slug が公開イベントページにリンク付きで出て、リンク先が 404                                                                              |
| [F-120](../../audits/2026-08-12-codebase-audit-findings.md#f-120) | 低     | `src/shared/domain/events/waitlist-offer-commands.ts:335`                                                     | waitlist promote の session lock (728354) は interactive tx が timeout すると finally でも release できず、その event の繰上げが止まる                          |
| [F-121](../../audits/2026-08-12-codebase-audit-findings.md#f-121) | 低     | `src/shared/domain/faq/item-bulk-commands.ts:98`                                                              | bulkMoveFaqItems だけが lock 取得後のカテゴリ再確認を欠き、削除済みカテゴリ配下に生きた FAQ が孤児化して 30 日後に cascade で消える                             |
| [F-122](../../audits/2026-08-12-codebase-audit-findings.md#f-122) | 低     | `src/shared/domain/inquiries/bulk-status-commands.ts:74`                                                      | bulk ステータス変更の TOCTOU フォールバックが他管理者の遷移を自分の成果と誤認し、append-only な状態履歴に偽の行を書く                                           |
| [F-123](../../audits/2026-08-12-codebase-audit-findings.md#f-123) | 低     | `src/shared/domain/reservations/calendar-sync.ts:105`                                                         | soft-delete 済み予約に対する clearReservationCalendarEvent が P2025 で落ち、成功した GCal 削除が「失敗」として記録される                                        |
| [F-124](../../audits/2026-08-12-codebase-audit-findings.md#f-124) | 低     | `src/shared/domain/reservations/reminder-commands.ts:39`                                                      | reminderSentAt が日付に紐づかない永続ラッチのため、リマインダ送信後に日時変更すると新しい日のリマインダが二度と送られない                                       |
| [F-125](../../audits/2026-08-12-codebase-audit-findings.md#f-125) | 低     | `src/shared/domain/slugs/validation.ts:82`                                                                    | metadata ルート名（apple-icon / opengraph-image / twitter-image）が予約 slug に無く、その slug のページは作成できるのに公開 URL で永久に表示されない            |
| [F-126](../../audits/2026-08-12-codebase-audit-findings.md#f-126) | 低     | `src/shared/emails/delete-account-verification.tsx:63`                                                        | アカウント削除の確認メールが「有効期限 1時間」と書くが実際は 24 時間                                                                                            |
| [F-127](../../audits/2026-08-12-codebase-audit-findings.md#f-127) | 低     | `src/shared/lib/analytics/ga-data-api.ts:121`                                                                 | GA4 Data API の retry が実質 no-op — gRPC Status を HTTP status として読むため一時障害で即失敗する                                                              |
| [F-128](../../audits/2026-08-12-codebase-audit-findings.md#f-128) | 低     | `src/shared/lib/csv.ts:38`                                                                                    | escapeCsvField の引用判定に \\r が無く、レコード区切りが \\r\\n のため裸の CR を含むフィールドで CSV の行が割れて列がずれる                                     |
| [F-129](../../audits/2026-08-12-codebase-audit-findings.md#f-129) | 低     | `src/shared/lib/email/receipt-emails.ts:61`                                                                   | 領収書メールの発行日だけが機械形式 (2026-07-26)。PDF・マイページ・プレビューは和暦表記                                                                          |
| [F-130](../../audits/2026-08-12-codebase-audit-findings.md#f-130) | 低     | `src/shared/lib/html/sanitize-content-html-core.ts:10`                                                        | 下付き・上付き文字が sanitize allowlist に無く、公開ページで書式が消える                                                                                        |
| [F-131](../../audits/2026-08-12-codebase-audit-findings.md#f-131) | 低     | `src/shared/lib/r2/delete.ts:8`                                                                               | R2 一括削除が 1000 件で分割されず、保持期限 purge が一度に 1000 件超の添付を消そうとすると全件が R2 に永久に残る                                                |
| [F-132](../../audits/2026-08-12-codebase-audit-findings.md#f-132) | 低     | `src/shared/lib/sections/definitions/page-hero/schema.ts:53`                                                  | page-hero の images 重複チェックが field 側に付いていて path が二重になり、エラーが誰にも届かない                                                               |
| [F-133](../../audits/2026-08-12-codebase-audit-findings.md#f-133) | 低     | `src/shared/lib/settings/transfer-account-gate.ts:14`                                                         | 振込先フォールバックが業務層だけを見るため、payment ON × Stripe credentials 欠損で支払手段がゼロになる                                                          |

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
