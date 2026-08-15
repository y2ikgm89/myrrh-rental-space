# コードベース監査 2026-08-12 — 指摘全文（F-01〜F-133）

> **これは 2026-08-12 時点の事実の記録で、状態は持たない。**確定 132 件 / 棄却 62 件。どの指摘が済んだかは [2026-08-12-codebase-audit-progress.md](2026-08-12-codebase-audit-progress.md)、棄却は [2026-08-12-codebase-audit-refuted.md](2026-08-12-codebase-audit-refuted.md)。未着手の台帳は無い。
> 本文は 2026-08-12 の監査報告からの**全項目転記**（起きること / 直し方 / 該当箇所 / 到達経路 / 既存の検査 / 反証官による訂正）。
> **行番号は監査時点のもので、修正済みのファイルではずれている。**
> 以前はここに状態欄を持っていたが、計画書の台帳との二重管理になって実際に食い違ったので落とした（経緯は progress 側の冒頭）。

## 高（11 件）

### F-01

**Terraform のバイナリ plan を public リポジトリの Actions artifact に上げており、本番共有シークレット CLOUDFLARE\_ORIGIN\_HEADER\_SECRET が誰でも取得できる**

<sub>[対処の記録](2026-08-12-codebase-audit-progress.md) ／ [棄却一覧](2026-08-12-codebase-audit-refuted.md)</sub>

|        |                                               |
| ------ | --------------------------------------------- |
| 深刻度 | 高 ／ 実コード確認済                          |
| 箇所   | `.github/workflows/deploy-production.yml:171` |
| 領域   | ビルド・デプロイ                              |

#### 起きること

このリポジトリは public（`gh repo view --json visibility` → {"isPrivate":false,"visibility":"PUBLIC"}）。Deploy Production を 1 回実行すると、`terraform plan -out=tfplan`（同ファイル L120）で作られたバイナリ plan が 90 日保持の artifact として公開される。Terraform 公式は保存 plan について「設定・適用対象の state・Terraform に渡した全変数の完全なコピーを含むので、機密が含まれるなら plan ファイル自体を機密として扱え」と明記している。この plan には plan step の env で渡した `TF_VAR_cloudflare_origin_header_secret`（L141）の値と、それを書き込む `cloudflare_ruleset.transform_rules_late`（terraform/cloudflare\_rulesets.tf:142 `value = var.cloudflare_origin_header_secret`）の state 値が平文で入る。第三者が artifact を落として `terraform show -json tfplan` を実行すれば値が読める。この値は `src/shared/lib/rate-limit.ts` の `hasTrustedCloudflareOriginHeader()` が `x-cloudflare-origin-secret` と timing-safe 比較する唯一の信頼根拠なので、入手した攻撃者は public service の run.app URL（terraform/cloud\_run\_public.tf:42 `ingress = "INGRESS_TRAFFIC_ALL"` + allUsers invoker）へ `x-cloudflare-origin-secret: <漏洩値>` と毎回異なる `cf-connecting-ip:` を付けて直接叩ける。`extractClientIp()` が偽の IP をそのまま返すため、reservationSubmit（5/分）・authMutation（20/15分）・emailVerificationRequest（3/時）等すべての IP バケットがリクエストごとに新規になり、rate-limit が全滅する。terraform-drift.yml も同型（L157 `terraform/drift.plan`、30 日保持、L120 で同じ TF\_VAR を注入）で毎晩 artifact を作る。

#### 直し方

バイナリ plan を artifact 化しない。監査目的なら `terraform show -no-color tfplan > tfplan.txt` のテキストのみを上げる（sensitive は自動で `(sensitive value)` になる）。plan の再現性が要るなら artifact ではなく private な GCS バケットへ置く。既に公開済みの artifact は、Actions の artifact を削除したうえで CLOUDFLARE\_ORIGIN\_HEADER\_SECRET を terraform/variables.tf のローテーション手順（L1-6 の 6 ステップ）で必ず回す。terraform-drift.yml:157 の `terraform/drift.plan` も同様に外す。

#### 該当箇所

```
- name: Upload plan artifact
uses: actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a # v7.0.1
with:
name: terraform-plan-${{ github.sha }}
path: |
terraform/tfplan
terraform/tfplan.txt
retention-days: 90
```

#### 到達経路

.github/workflows/deploy-production.yml:141 (TF\_VAR\_cloudflare\_origin\_header\_secret = secrets.CLOUDFLARE\_ORIGIN\_HEADER\_SECRET\_TF を plan step に注入) → :120 (`terraform plan -out=tfplan`; terraform/variables.tf:240-251 の no-default + length\>=32 validation により実値必須、terraform/cloudflare\_rulesets.tf:142 で resource 属性値として plan に格納) → :148-164 (grep gate は tfplan.txt のみ・属性名 value は対象外・sensitive は `(sensitive value)` 描画のため素通り) → :166-174 (binary terraform/tfplan を public repo の artifact として 90d 公開; 同型で .github/workflows/terraform-drift.yml:120→:123→:153-159 が毎晩 30d 公開) → 第三者が artifact を取得し plan から値を抽出 → 攻撃者が terraform/cloud\_run\_public.tf:42 (INGRESS\_TRAFFIC\_ALL) + :139-146 (allUsers に roles/run.invoker) の run.app URL へ `x-cloudflare-origin-secret: <漏洩値>` + 毎回異なる `cf-connecting-ip:` で直接送信 → src/proxy.ts:496 getClientIp → src/shared/lib/rate-limit.ts:204-209 getClientIp → :172 extractClientIp → :179-181 (cfConnectingIp && hasTrustedCloudflareOriginHeader → true) → :157-167 hasTrustedCloudflareOriginHeader が timing-safe 一致で true → 偽装 IP をそのまま返す → src/proxy.ts:497-535 の rate-limit token がリクエストごとに新規 bucket になり IP 単位 rate-limit が無効化（誤った結果）

#### 既存の検査

none。同 workflow の "Verify plan does not leak secret values"（L150-164）は `tfplan.txt`（テキスト描画）に対して `(secret_data|password|private_key)\s*=\s*"..."` を grep するだけで、(1) バイナリ `tfplan` を一切見ておらず、(2) sensitive var はテキスト描画で `(sensitive value)` になる設計（terraform/cloudflare\_rulesets.tf:44 に「plan 出力は `(sensitive value)` 表示」と明記）なので、この grep は原理的にこの漏洩を検知できない。\_\_tests\_\_/unit/architecture/deploy-production-workflow.test.ts と gcp-production-audit\*.test.ts を grep したが artifact の中身を見る assertion は無い。terraform/cloudflare\_rulesets.tf:45 は「state file には値が格納されるが GCS backend encrypted-at-rest + IAM 制限で保護」と state 側だけを検討しており、plan artifact の経路が抜けている。

#### 反証官による訂正

2 点だけ訂正。(1) 行番号: `hasTrustedCloudflareOriginHeader` は src/shared/lib/rate-limit.ts:157-167（指摘の 154-167 ではない）、`extractClientIp` は :172-199（指摘の 170-176 ではない）。cloudflare\_rulesets.tf:142 / cloud\_run\_public.tf:42 / deploy-production.yml:120,141,171 / terraform-drift.yml:120,157 は全て正確。(2) 「誰でも取得できる」は厳密には不正確 — public repo の run ページは匿名閲覧できるが artifact のダウンロードは GitHub アカウントでのサインインが要る（任意のアカウントで足りるので実質公開）。深刻度は critical → high に補正。理由は影響の上限であって到達性ではない: `grep -rn CLOUDFLARE_ORIGIN_HEADER_SECRET src/` の消費者は rate-limit.ts だけで、この secret から認証/認可のバイパスやデータ読み出しへ繋がる経路は無く、被害は IP 信頼の崩壊（IP 単位 rate-limit の全滅と監査ログの IP 詐称）に限定される。ただし本番共有 secret が nightly で公開され続ける点、rotation が variables.tf:228-237 の多段手順で silent に劣化しうる点から、high の下限ではなく上限側として扱うべき。

---

### F-02

**EventTicket.unitSize（1チケット=N名）を価格計算も定員計算も一切参照しておらず、4名枠チケットが人数分だけ多重課金される**

<sub>[対処の記録](2026-08-12-codebase-audit-progress.md) ／ [棄却一覧](2026-08-12-codebase-audit-refuted.md)</sub>

|        |                             |
| ------ | --------------------------- |
| 深刻度 | 高 ／ 実コード確認済        |
| 箇所   | `prisma/schema.prisma:2589` |
| 領域   | DB スキーマ                 |

#### 起きること

管理者がイベント区分の組込みプリセット「個人 / グループ (4名)」(src/app/(admin)/admin/(dashboard)/events/\_components/TicketsField.tsx:216-223 の `name: "グループ (4名)", description: "1枠で4名様まで", price: 18000, unitSize: 4`) を選んで保存する。公開申込ページはこのチケットを `¥18,000 / 4名` と表示し（event-registration-form.tsx:462-466 の `{ticket.unitSize \> 1 && ... / {String(ticket.unitSize)}名}`、event-info-panel.tsx:265-267 も同型）、直下の数量欄のラベルは `参加人数`（同 526 行）。顧客が 4 名で申し込むと `quantity=4` が保存され、決済は `src/shared/domain/events/payment-commands.ts:145` の `registration.ticket.price * registration.quantity` = 18,000 × 4 = **¥72,000** を Stripe Checkout に渡す。表示は ¥18,000 なのに実際の請求は ¥72,000（4 倍）。確定後 `paidAmount=72000` が保存され、`src/shared/domain/receipts/issue-core.ts:156` の `const amount = registration.paidAmount ?? 0` がその額をそのまま適格請求書に焼くため、誤った金額の会計証跡（append-only）まで発行される。逆の読み方（quantity=枚数）を取ると今度は `registration-create-commands.ts:124` の `slot.capacity - SUM(quantity)` が 4 名分を 1 席としか数えず、座席数として定義された `EventTimeSlot.capacity`（schema.prisma:2420 「スロット単位の具体的な座席数が SSoT」）に対して 4 倍のオーバーブッキングになる。どちらの解釈でも壊れており、`unitSize` を掛ける/割る算術は src 全体で 0 箇所（`grep -rn unitSize src/` の 38 件はすべて select 句・型定義・フォーム既定値・表示文字列のみ）。

#### 直し方

`quantity` の意味を 1 つに決めて、価格と定員の両方をそれに揃える。UI 文言 3 箇所（`参加人数` ラベル / `/ N名` 価格表示 / registration-create-commands.ts:129 の「参加人数を…名以下にしてください」）と DB の座席数定義が一致している「quantity = 人数」を正とするなら、課金側を `Math.ceil(quantity / ticket.unitSize) * ticket.price` に直す（payment-commands.ts の 145 / 230 / 502 / 683 / 1111 の 5 箇所すべて。うち authoritative 再計算の 3 箇所は webhook 側の突合にも効く）。逆に「1 申込 = unitSize 名」を正とするなら capacity 集計を `SUM(quantity * unit_size)` にし、`assert_event_capacity_not_exceeded`（invariants.sql:194-248）も同じ式へ直す必要がある — こちらは DB trigger の書き換えを伴うので前者が小さい。どちらにせよ列を残すなら unitSize \> 1 の integration テスト（決済金額と残枠の両方）を 1 本足す。仕様として「1 チケット複数人」を出さないと決めるなら、プリセットと入力欄ごと削除して列を落とすのが最もクリーンで、中途半端に列だけ残さない。

#### 該当箇所

```
/// 1申込あたりの人数単位（1 = 1名、2 = 2名セット 等）
unitSize Int @default(1) @map("unit_size")
```

#### 到達経路

src/app/(admin)/admin/(dashboard)/events/\_components/TicketsField.tsx:216-223 (組込プリセット「個人 / グループ (4名)」= price:18000, unitSize:4) → src/app/(admin)/admin/(dashboard)/events/\_components/event-form-schema.ts:102-105 (zod は min(1) のみで通過) → src/shared/domain/events/event-slot-sync-commands.ts:34-47 buildTicketWriteData (unitSize をそのまま永続化 / prisma/schema.prisma:2589) → src/app/(public)/events/\[slug\]/\_components/event-registration-form.tsx:461-466 (「¥18,000 / 4名」と表示) → 同:525-533 (label「参加人数」, min=1, max=quantityMax。quantityMax の算出 同:263-266 に unitSize 項は無い) → 顧客が 4 を入力 → src/shared/domain/events/registration-create-commands.ts:124 (slotRemaining = slot.capacity - SUM(quantity)、quantity を座席数として控除) → 同:160-171 (quantity: 4 で create) → src/shared/domain/events/payment-commands.ts:145 (pre-check totalAmount = 18000\*4 = 72000、:146 の \<=0 guard を素通り) → 同:229-230 (authoritativeTotal = ticket.price \* quantity) → 同:243-256 (Stripe line\_items: unit\_amount=18000, quantity=4 → 請求 ¥72,000。unitSize は不参照) → src/app/(public)/events/registrations/status/page.tsx:200-203 (「参加人数 4名 / 合計金額 ¥72,000」) → webhook settle で paidAmount=72000 → src/shared/domain/receipts/issue-core.ts:156 (amount = registration.paidAmount) → append-only Receipt 行。誤った結果: イベントページが「¥18,000 / 4名」と広告した 4 名グループ枠が ¥72,000 で請求される（4 倍）。

#### 既存の検査

none。DB 側は `prisma/baseline/invariants.sql:60` の `event_tickets_unit_size_positive CHECK ((unit_size >= 1))` だけで、これは値域しか見ない（`__tests__/unit/architecture/numeric-column-domains.test.ts` の要求も CHECK の実在まで）。`grep -rn "unitSize\|unit_size" __tests__/ e2e/ prisma/ scripts/` の全ヒットは `unitSize: 1` か `"tickets[0].unitSize": "1"` か select 句で、**unitSize \> 1 を通す検査は 1 本も無い**（\_\_tests\_\_/unit/app/admin/events/tickets-schema.test.ts、\_\_tests\_\_/unit/domain/events/commands.test.ts、\_\_tests\_\_/integration/domain/events/ticket-reorder.test.ts 等を確認）。zod 側 (event-form-schema.ts:102-105) も `.int().min(1)` のみ。

#### 反証官による訂正

3 点訂正。(1) 「表示は ¥18,000 なのに実際の請求は ¥72,000」という covert charge の描写は不正確。Stripe に遷移する前に、申込状態ページ src/app/(public)/events/registrations/status/page.tsx:201-203 が `formatPrice(registration.ticketTotalPrice)` = ¥72,000 を「合計金額」として表示し、確認メール src/shared/lib/email/event-emails.ts:529 も `ticketUnitPrice * quantity` の総額を送り、Stripe Checkout 画面でも再度提示される。したがって実体は「無断の 4 倍課金」ではなく「イベントページの表示価格 (¥18,000 / 4名) と実際の総額が矛盾する = group ticket (unitSize) 機能が価格側で未実装」。critical → high に下げた根拠はここと、(a) unitSize \> 1 が既定ではなく管理者の明示的な選択を要すること（既定値 1、5 プリセット中 4 つが全て unitSize:1、prisma/seed.ts:4755 も 1）、(b) 決済前に総額が 3 箇所で提示され顧客の同意を経ること。broken feature + 誤った広告価格であって silent な資金流出ではない。(2) 課金額の権威的な計算箇所は payment-commands.ts:145 ではない。:145 は claim 前の pre-check で、実際に Stripe へ渡る額は claim 後に再読込した :229-230 `authoritative.ticket.price * authoritative.quantity` と :250-255 の line\_item。式が同一なので結論は変わらないが、指摘が名指しした行は請求の SSoT ではない。(3) 領収書の件は独立した欠陥ではない。paidAmount は実際に Stripe で提示・同意・決済された額と一致するため Receipt 自体は整合しており、価格が誤っている分だけ誤るという派生的影響にすぎない。「誤った金額の会計証跡を焼く」という別個の critical 事象として数えるのは二重計上。なお「どちらの解釈でも壊れている」という指摘の骨子自体は妥当だが、実装は一貫して quantity=人数 側で振る舞っており (status/page.tsx:200「参加人数{quantity}名」, registration-create-commands.ts:129「参加人数を…名以下にしてください」, registration-queries.ts:303 の命名 ticketUnitPrice)、実際に露出するのは overcharge 側のみ。overbooking 側は「もし枚数解釈を採れば」という反実仮想であり、現に到達する障害ではない。

---

### F-03

**Server Action の既定 1MB body 上限が、5MB/50MB 前提のメディアアップロードを無言で 413 にする**

<sub>[対処の記録](2026-08-12-codebase-audit-progress.md) ／ [棄却一覧](2026-08-12-codebase-audit-refuted.md)</sub>

|        |                                                                 |
| ------ | --------------------------------------------------------------- |
| 深刻度 | 高 ／ 実コード確認済                                            |
| 箇所   | `src/app/(admin)/admin/(dashboard)/_shared/actions/media.ts:24` |
| 領域   | メディア・R2・OAuth                                             |

#### 起きること

管理者がメディアライブラリで 2MB の JPEG（クライアント側 validateFile は画像 5MB まで通す）を選んで「アップロード」を押す。multipart の Server Action リクエストは Next の sizeLimitTransform で 1MB 超と判定され ApiError(413) になり、uploadMedia の本体は一度も実行されない（preValidateSize も magic-byte 検証も到達しない）。use-media-upload.ts:124 の `const result = await uploadMedia(formData);` が reject するが uploadFile には catch が無く（try/finally だけ）、UploadTab.tsx:54 の `const result = await uploadFile(` も catch していないため未処理の rejection になる。トーストも出ず spinner だけ戻り、利用者から見て「何も起きない」。結果、1MB を超える画像・動画・PDF は 1 件も登録できない。R2 の magic-byte 検証やサイズ上限は全部正しいのに、その手前の transport で落ちている。

#### 直し方

next.config.ts の experimental に serverActions.bodySizeLimit を置き、値を MEDIA\_MAX\_SIZE\_BYTES の最大値（現状 50MB）+ multipart overhead から導出する（アップロードだけ Route Handler に移すのも可）。クライアントが宣言する上限と transport が通す上限が 1 つの SSoT から出るようにしないと、また片方だけ動く。

#### 該当箇所

```
export async function uploadMedia(
```

#### 到達経路

src/app/(admin)/admin/(dashboard)/\_shared/components/media-picker/tabs/UploadTab.tsx:108 (onClick → void handleUpload())
→ UploadTab.tsx:56 `const result = await uploadFile(file, …)`
→ src/app/(admin)/admin/(dashboard)/\_shared/hooks/use-media-upload.ts:106 inferMediaType → :107 validateFile
→ src/app/(admin)/admin/(dashboard)/\_shared/lib/validations/media.ts:215 isAllowedFileSize → src/shared/lib/r2/media-size.ts:26 `"image/jpeg": 5 * 1024 * 1024` → 2MB JPEG は valid:true で通過（ここが分岐点：クライアント上限 5MB \> transport 上限 1MB）
→ use-media-upload.ts:116-117 `formData.append("file", file)` → :124 `const result = await uploadMedia(formData)`（File 入り FormData → multipart fetch Server Action）
→ node\_modules/next/dist/server/app-render/app-render.js:1491 renderOpts.serverActions（next.config.ts に experimental.serverActions が無いため undefined）→ :1731 handleAction へ
→ node\_modules/next/dist/server/config.js:699（bodySizeLimit が undefined のため既定注入されず素通り）
→ node\_modules/next/dist/server/app-render/action-handler.js:518 `serverActions?.bodySizeLimit ?? '1 MB'` → :519 bodySizeLimitBytes = 1048576
→ action-handler.js:681-682 isMultipartAction && isFetchAction → :700 pipeline(body, sizeLimitTransform, busboy)
→ action-handler.js:668 size += chunk（2MB 到達）→ :669 `if (size > bodySizeLimitBytes)` true → :671 ApiError(413) 「Body exceeded 1 MB limit.」
→ 【誤った結果】src/app/(admin)/admin/(dashboard)/\_shared/actions/media.ts:24 uploadMedia の本体は一度も実行されない。:27 parseMediaUploadFormData も :38 preValidateMediaFile も到達せず、src/shared/lib/r2/upload.ts の magic-byte 検証・per-MIME 上限も無効化される
→ 【UI 側の誤った結果】use-media-upload.ts:115-144 は try/finally のみで catch が無いため promise が reject。UploadTab.tsx:56 も :108 の `void handleUpload()` も catch しないので未処理 rejection となり、:141-143 の finally で isUploading だけ false に戻る＝トースト無しで「何も起きない」

同一 transport の他経路:
\- src/app/(admin)/admin/(dashboard)/media/\_components/MediaUploadDialog.tsx:119（startTransition 内・catch 無し）
\- src/app/(admin)/admin/(dashboard)/\_shared/actions/inquiry.ts:219 uploadInquiryAttachment ← InquiryAttachments.tsx:59（PDF 10MB 想定）

#### 既存の検査

無し。\_\_tests\_\_/unit/architecture の約180 gate に serverActions / bodySizeLimit を見るものは存在しない（next-config-\* 系は cache-tag emission と cachedNavigations のみ）。unit テストは Server Action 関数を直接呼ぶので transport 層を通らない。e2e にメディアアップロードの spec は無い（e2e 配下で media に触れるのは e2e/fixtures/test-data.ts のみ）。

#### 反証官による訂正

深刻度は high のまま妥当（critical ではない）。理由: 本番稼働中の管理画面でメディア登録という中核機能が 1MB 超で全滅し、UI は 5MB/50MB/20MB/10MB と案内しているため利用者が原因に辿り着けない。一方で (a) 管理者限定で公開面への影響なし、(b) データ喪失・セキュリティ影響なし、(c) 1MB 以下のファイルは正常に動く、(d) 修正は next.config.ts の experimental.serverActions.bodySizeLimit 一箇所、という点で critical には届かない。

指摘の事実誤認・不正確な点:

\1. 【重要・指摘の見落とし】並行する Route Handler が既に存在する。src/app/(admin)/admin/api/media/route.ts:107 の POST は同じ parseMediaUploadFormData / preValidateMediaFile / uploadMediaCommand を呼ぶが、**Route Handler なので Server Action の bodySizeLimit の対象外**（:118 で request.formData() を直接読む）。ただし呼び出し元を全 grep した結果、クライアントが叩いているのは GET のみ（use-media-library.ts:110）で、POST を叩くコードは存在しない。したがってこの route は緩和策として機能しておらず、指摘の結論は変わらない。むしろ「同じ機能に 2 つの transport が実装され、上限に弱い側だけが配線されている」という点が修正方針に効く（bodySizeLimit を上げるか、既存 POST route へ配線し直すかの選択肢がある）。指摘はこの route の存在に全く触れていない。

\2. 【誇張】「トーストも出ず」は 3 経路のうち全部には当てはまらない。ImageDropPlugin.tsx:52-72 は try/catch を持ち、catch で `toast.error("アップロード中にエラーが発生しました")` を出す（原因を誤認させる文言ではあるが無言ではない）。無言なのは UploadTab → use-media-upload 経路（catch 無し）と MediaUploadDialog.tsx:118-119（startTransition 内で catch 無し）の 2 経路。

\3. 【行番号のずれ】UploadTab.tsx の `await uploadFile(` は 54 行目ではなく **56 行目**（54 行目は `if (!file) return;`）。またファイルの実パスは src/app/(admin)/admin/(dashboard)/\_shared/components/media-picker/tabs/UploadTab.tsx。

\4. 【行番号のずれ】next.config.ts の experimental ブロックは 169-224 行ではなく **169-222 行**。

\5. 【帰属のずれ】「ファイルサイズは50MB以下にしてください」は upload.ts:112 ではなく src/shared/lib/r2/upload.ts:113（preValidateSize 内）。同じ文言は src/app/(admin)/admin/(dashboard)/\_shared/lib/validations/media.ts:236-241 の preValidateMediaFile（AGGREGATE\_MAX\_SIZE = 50MB）からも出る。

\6. 【補足】指摘が挙げていない 4 つ目の被害経路として MediaUploadDialog.tsx:119（/admin/media ライブラリページ自身のアップロードダイアログ）がある。

検証済みで指摘が正しかった点: 引用の実在、bodySizeLimit のリポジトリ内 0 件、Next 16.3.0 の既定 1MB と multipart への適用、architecture gate 非カバー、e2e に media upload spec 無し（e2e 配下で media に触れるのは e2e/fixtures/test-data.ts のみ）。

---

### F-04

**繰返し予約は全 instance に初回分の料金をコピーするため、祝日/曜日別レートプランがある日の請求額が誤る**

<sub>[対処の記録](2026-08-12-codebase-audit-progress.md) ／ [棄却一覧](2026-08-12-codebase-audit-refuted.md)</sub>

|        |                                                                              |
| ------ | ---------------------------------------------------------------------------- |
| 深刻度 | 高 ／ 実コード確認済                                                         |
| 箇所   | `src/app/(admin)/admin/(dashboard)/_shared/actions/reservation/series.ts:69` |
| 領域   | 予約                                                                         |

#### 起きること

スペースに rate plan「土日祝 5,000円/h」(daysOfWeek=\[SATURDAY\] もしくは holidayMode=ONLY)、既定 hourlyPrice=3,000円/h を設定した状態で、管理画面から FREQ=WEEKLY;BYDAY=FR,SA の繰返し予約を金曜 10:00-12:00 起点で 10 回作成する。料金は dtstart（金曜）1 回分だけを previewReservationPricing で解決し、その totalPrice(6,000) / totalPriceWithTax(6,600) / rateBreakdownJson を 10 件すべての Reservation 行にそのまま複製する。土曜の 5 instance は本来 10,000 円のところ 6,000 円で確定し、Stripe Checkout も領収書もこの誤額（totalPriceWithTax）で通る。祝日レート（holidayMode=ONLY）でも同じで、series 期間に含まれる祝日 instance が平日単価で請求される。逆の設定なら過大請求になる。

#### 直し方

series-commands.ts 側で instanceWindows ごとに calculateReservationPricing（rate plan は tx 外で 1 回取得し使い回す純粋関数呼び出し）を実行し、instance ごとの totalPrice / taxAmount / totalPriceWithTax / rateBreakdownJson を持たせる。templateData は「価格以外のテンプレート値（notes / guest 情報 / taxRateType）」に限定し、金額フィールドは削除する。クーポン割引は series 全体で 1 回のため、割引配分の定義（初回のみ適用 / 全 instance の合計に対して適用）を先に決めてから実装する。

#### 該当箇所

```
const preview = await previewReservationPricing(
{
spaceId: data.spaceId,
startDateTime: dtstart,
endDateTime: endTime,
```

#### 到達経路

src/app/(admin)/admin/(dashboard)/reservations/new-recurring/page.tsx:28 (admin ルート) → src/app/(admin)/admin/(dashboard)/reservations/\_components/RecurringReservationForm.tsx:114 (createRecurringReservationAction を submit) → src/app/(admin)/admin/(dashboard)/\_shared/actions/reservation/series.ts:61-62 (dtstart / endTime は data.date の 1 日分のみ) → 同 series.ts:69-79 (previewReservationPricing を dtstart の window で 1 回だけ呼ぶ) → src/shared/domain/reservations/pricing-preview.ts:111-125 → src/shared/lib/pricing/rate-plan-resolver.ts:231-248 (segStart 由来の dayEnum / isHoliday / dateOnly で plan をマッチ。ここで解決されるのは初回日の単価だけ) → src/app/(admin)/admin/(dashboard)/\_shared/actions/reservation/series.ts:114-124 (preview.totalPrice / totalPriceWithTax / rateBreakdown を templateData に格納) → src/shared/domain/reservations/series-commands.ts:123 (createReservationSeriesCommand) → 同 series-commands.ts:143-147 (RRULE 展開で N 個の instanceWindows。各 window の startTime は曜日も祝日も異なりうる) → 同 series-commands.ts:150-153 (rateBreakdownJson を「全 instance で同一値」として 1 回だけ narrow) → 同 series-commands.ts:274-305、特に 288-294 (totalPrice / basePrice / rateBreakdownJson / taxAmount / totalPriceWithTax を全 instance へ複製。window.startTime は 283-284 で instance ごとに正しく入るのに価格だけ初回値のまま) → 同 series-commands.ts:307 (tx.reservation.createMany で status=CONFIRMED として誤額を確定) → 誤った結果: 初回日と異なるレートが適用されるべき instance が初回日の単価で保存される → src/shared/domain/reservations/payment-commands.ts:295 (Stripe Checkout に誤額を渡す) / src/shared/domain/receipts/issue-core.ts:104 (領収書に誤額を焼く)。

#### 既存の検査

none。\_\_tests\_\_/unit/domain/reservations/series-commands.test.ts は templateData を固定 fixture (line 174-186) で渡すだけで instance 間の価格差を検証しない。\_\_tests\_\_/unit/lib/pricing/rate-plan-resolver.test.ts は resolver 単体の曜日・祝日分岐を見るが series 経路を通らない。\_\_tests\_\_/unit/architecture/reservation-series-schema.test.ts は schema 形状のみ。DB 側にも金額を検査する制約は無い。

#### 反証官による訂正

指摘の骨子・行番号・到達経路はすべて正確だったが、4 点補足・訂正する。(1) 影響範囲が指摘より広い: 報告は BYDAY 複数曜日と holidayMode を例に挙げるが、rate-plan-resolver.ts:174-182 の effectiveFrom / effectiveTo は JST カレンダー日の閉区間で判定されるため、FREQ=WEEKLY;BYDAY=FR のような単一曜日 series でも、series 期間が rate plan の有効期間境界 (例: GW 料金・季節料金の開始/終了日) をまたげば同じ誤額が出る。「曜日や祝日が混ざる series だけの問題」と読むと過小評価になる。(2) 逆に、時間帯条件 (startTime/endTime) 由来のズレは発生しない: duration と開始時刻が series 全体で固定 (series-commands.ts:143-147) なので、日内時刻の segment 分割は全 instance で同形になる。(3) 前提条件が報告に明示されていない: スペースに SpaceRatePlan 行が 1 件も無い、または series 期間内でマッチが変化しない場合は rate-plan-resolver.ts:246 で全 instance が spaceHourlyPrice に落ちるため差は出ない。つまり本欠陥は rate plan の設定に条件づけられる (ただし prisma/schema.prisma:720 のコメントが「週末料金」「祝日料金」を例示している通り、これは第一級かつ一般的な設定であり、条件付きであることは severity を下げる根拠にならない)。(4) コード側の正当化コメントが典拠を誤っている: series.ts:67-68 は「全 instance で duration + rate plan 同一の前提、spec §7」と書くが、docs/superpowers/specs/2026-07-17-recurring-reservations-phase-b2-design.md の §7 は「Admin UI 改修」であり料金の話をしていない。同 spec の非ゴール (107-117 行) が除外しているのは per-instance の duration 可変だけで、rate plan 不変は一言も承認していない。series-commands.ts:60-71 の JSDoc も「duration が固定であるため価格も同一という前提を置く」と書くが、これは非 sequitur (duration 固定でも曜日・祝日・有効期間で単価は変わる)。したがって本件は「文書化済みの既知の割り切り」ではなく、意図せず作り込まれたギャップとして扱うべき。severity は自己申告の high を維持する: 管理者操作限定で母数は限られるものの、CONFIRMED で確定した金額がそのまま Stripe 課金 (payment-commands.ts:295) と領収書 (issue-core.ts:104) に流れ、過小請求・過大請求のどちらも起こりうるため。

---

### F-05

**formatZodFieldErrors が conform と違う path 表記を作り、配列アイテムのエラーが表示されないまま保存が無反応になる**

<sub>[対処の記録](2026-08-12-codebase-audit-progress.md) ／ [棄却一覧](2026-08-12-codebase-audit-refuted.md)</sub>

|        |                                                                                                        |
| ------ | ------------------------------------------------------------------------------------------------------ |
| 深刻度 | 高                                                                                                     |
| 箇所   | `src/app/(admin)/admin/(dashboard)/pages/[slug]/_sections/_components/auto-section-form/helpers.ts:53` |
| 領域   | エディタ内部                                                                                           |

#### 起きること

cta / hero / page-hero の「ボタン」1 件目の「リンク先 URL」に `https://example.com` を入力して「保存」を押す。`createButtonsArraySchema`（definitions/\_shared/buttons.ts:41）の `createInternalAppRouteSchema` が外部 URL を拒否し、issue.path は `["buttons", 0, "url"]`。この行はそれを `buttons.0.url` にするが、conform が input に付ける name は `buttons[0].url`（@conform-to/dom/dist/formdata.js:129-141 の formatPath が数値 segment を `[n]` にする）。キーが一致しないので `field.errors` は空のまま AutoUrlField は何も出さず、AutoSectionForm.tsx:108 の `if (!submission || submission.status !== "success") return;` で保存も走らない。ボタンを何度押しても画面は無変化で「未保存の変更があります」が残るだけ。array item 内の maxLength 超過・`field.url` の refine・`field.number` の min/max も同じく全て不可視になる。

#### 直し方

`@conform-to/dom` が export している `formatPaths`（= formatPath）を使って `const key = formatPaths(issue.path);` にする。ついでに未マッチのキーが出た場合に `""`（form レベル）へ落として FormActions 付近で描画すれば、同種の drift が無言にならない。

#### 該当箇所

```
const key = issue.path.map(String).join(".");
```

#### 到達経路

src/app/(admin)/admin/(dashboard)/pages/\[slug\]/edit/\_components/SectionEditPanel.tsx:114 (\<AutoSectionForm\> を描画) → src/shared/lib/sections/definitions/cta/schema.ts:13 `buttons: createButtonsArraySchema("ボタン")` → src/shared/lib/sections/definitions/\_shared/buttons.ts:40 `url: createInternalAppRouteSchema(500)` → src/shared/lib/sections/field-registry.ts:459-463 で `z.array(z.strictObject({...}))` になる → src/app/.../auto-fields/AutoArrayField.tsx:62,140,169 が conform の getFieldList/getFieldset で sub field を取得 → node\_modules/@conform-to/react/dist/context.js:168 `formatPaths([...getPaths("buttons"), 0, "url"])` → node\_modules/@conform-to/dom/dist/formdata.js:141-162 appendPath → input name = "buttons\[0\].url" ／ 一方 src/app/.../auto-section-form.tsx:93-104 parse({resolve}) → src/app/.../auto-section-form/helpers.ts:53 が issue.path \["buttons",0,"url"\] を "buttons.0.url" にする → node\_modules/@conform-to/dom/dist/submission.js:105-124 createSubmission がキーをそのまま error に格納 → node\_modules/@conform-to/dom/dist/form.js:460-475 report() がそのまま state.error に反映 → node\_modules/@conform-to/react/dist/context.js:106-108 `state.error["buttons[0].url"]` は undefined → src/app/.../auto-section-form.tsx:269 `field.errors?.[0]` が undefined → src/app/.../auto-section-form/AutoPrimitiveFields.tsx:150 の error ブロックが描画されない（誤った結果 1: エラー不可視）→ node\_modules/@conform-to/react/dist/context.js:253-260 が status==='error' で event.preventDefault() しユーザー onSubmit を呼ばない → src/app/.../auto-section-form.tsx:111 の onSave({config}) に到達しない（誤った結果 2: 保存無反応）→ src/app/.../config-forms/shared.tsx の FormActions は form レベルのエラーを描画しないため画面は「未保存の変更があります」のまま無変化。

#### 既存の検査

無し。`__tests__/unit/components/admin/auto-section-form.test.tsx` は「配列フィールドの追加ボタンは type=button」の 1 本のみで、エラーキーの突合を検査していない。

#### 反証官による訂正

結論は維持（high 妥当）。事実関係の訂正・補足:

\1. 行番号のずれ: `url:` の定義は definitions/\_shared/buttons.ts:41 ではなく **:40**。conform の数値 segment → `[n]` 変換は formdata.js:129-141 の `formatPath` ではなく、その内部で呼ぶ **appendPath (formdata.js:141-162)**。`formatPath` 自体は 129-131。

\2. 保存が止まる場所の誤認: 指摘は「auto-section-form.tsx:108 の `if (!submission || submission.status !== "success") return;` で止まる」としているが、**そこには到達しない**。@conform-to/react/dist/context.js:253-260 のラッパが `result.submission.status !== 'success'` の時点で `event.preventDefault()` だけして user onSubmit を呼ばない。結果（保存無反応）は同じだが、止まる層は conform 側。なお指摘のファイル名 `AutoSectionForm.tsx` は実際には `auto-section-form.tsx`。

\3. 影響範囲の限定（誇張ではなく正確化）: 破綻するのは **path に数値 segment を含むケースだけ**。top-level (`["title"]` → "title") と非配列のネスト object (`["layout","padding"]` → "layout.padding") は dot 表記が conform と一致するため**正常に表示される**。したがって「conform と違う path 表記を作る」は全フィールドではなく配列アイテム限定。逆に配列そのものへのエラー（`buttons` の重複 URL refine、min/max）は path が `["buttons"]` なので表示される（auto-section-form.tsx:507-515）。

\4. 発火条件は指摘より広く、より起きやすい: 外部 URL 入力だけでなく、**「追加」を押して何も入力せず保存**でも起きる。`isAppRoute("")` は false（src/shared/lib/url/safe-internal-redirect.ts:31 の `if (!path ...) return false`）を実測確認済み。しかも AutoUrlField (AutoPrimitiveFields.tsx:144) は placeholder 未指定時に `"https://..."` を表示するため、この欄に外部 URL を入れる操作は UI 側が誘導している。対象は cta / hero / hero-parallax / page-hero の buttons に限らず、`field.array` で作られた全配列フィールド（features items 等）。

\5. 指摘が挙げていない加重要因: 本 repo の他の admin conform フォーム（EventForm.tsx:368、LocationForm.tsx:304 等）は `form.errors` を描画しているが、AutoSectionForm だけ **form レベルのエラー描画も無い**。そのため form 直下（path=\[\]、キー ""）に落ちるエラーも同様に無言になる。

\6. 実測ログ（scratchpad で bun 実行、リポジトリは未変更）:
conform field name : buttons\[0\].url
isAppRoute('https://example.com') : false
isAppRoute('') : false
zod issue paths: \["buttons",0,"label"\], \["buttons",0,"url"\]
formatZodFieldErrors keys: buttons.0.label, buttons.0.url

---

### F-06

**当日参加(walk-in)・管理者代行の有料チケット申込を未決済期限切れ cron が 60 分後に自動キャンセルする**

<sub>[対処の記録](2026-08-12-codebase-audit-progress.md) ／ [棄却一覧](2026-08-12-codebase-audit-refuted.md)</sub>

|        |                                                |
| ------ | ---------------------------------------------- |
| 深刻度 | 高 ／ 実コード確認済                           |
| 箇所   | `src/shared/domain/events/unpaid-expiry.ts:42` |
| 領域   | イベント（中核）                               |

#### 起きること

有料チケット(¥3,000)のイベントで受付係が WalkInDialog から当日参加を登録すると、`createWalkInRegistrationCommand` は `attendedAt: new Date()` を打ちつつ paymentStatus を触らないので行は CONFIRMED + UNPAID で残る(registration-onsite-commands.ts:118-120 `quantity: data.quantity,` / `attendedAt: new Date(),`)。現金を受け取った受付係が 60 分以内に手動入金記録をしないと、15 分毎に走る cron(terraform/cloud\_scheduler.tf:131 `schedule = "*/15 * * * *"`)が `staleRegistrationCandidateWhere` の `paymentStatus: UNPAID, createdAt < cutoff` に合致させ、会場に居る参加者の申込を CANCELLED 化する。結果 (1) `getEventCheckInAttendees` が `status: RegistrationStatus.CONFIRMED` で絞るため受付リストから消え出席集計が狂う、(2) 参加者に「申込キャンセル」メール(runCustomerEmailStep)が届く、(3) 空いた枠が `offerNextWaitlistEntryCommand` でキャンセル待ちに配られ二重着席になる、(4) `recordManualEventPaymentCommand` が `status: RegistrationStatus.CONFIRMED, paymentStatus: PaymentStatus.UNPAID` を要求するため受領済み現金を後から記録できず CONFLICT で恒久的に詰む。管理者代行登録(`createAdminProxyRegistrationCommand`、attendedAt: null・確認メール送信あり)はさらに深刻で、電話申込を1週間前に代理登録すると確認メールの 60 分後にキャンセルメールが飛ぶ。

#### 直し方

staleRegistrationCandidateWhere / staleRegistrationClaimWhere の UNPAID 分岐から「対面受付済み・管理者起票」の行を除外する。最小の識別子は既存列で足りる: walk-in は `attendedAt: null` を条件に加えれば除外でき、管理者代行は起票経路が判別できないため `createAdminProxyRegistrationCommand` 側で paymentStatus を明示的に扱う(例: 起票時に管理者へ入金記録を促す運用に寄せるか、対象外を示す列/フラグを追加する)必要がある。どちらを採るかは製品判断なので、まず walk-in の `attendedAt` 除外だけでも当日現場の破壊は止まる。

#### 該当箇所

```
ticket: { price: { gt: 0 } },
```

#### 到達経路

src/app/(admin)/admin/(dashboard)/events/\[id\]/page.tsx:120-125 (tickets を isAvailable のみで絞る → price\>0 も渡る) → src/app/(admin)/admin/(dashboard)/events/\[id\]/\_components/RegisterParticipantButton.tsx:12-13 (ProxyRegistrationDialog / WalkInDialog を開く) → src/app/(admin)/admin/(dashboard)/\_shared/actions/event-registration.ts:383 createAdminProxyRegistrationCommand (walk-in は同 :321) → src/shared/domain/events/registration-onsite-commands.ts:250-264 create({...}) で paymentStatus 未指定 → prisma/schema.prisma:2619 status @default(CONFIRMED) / prisma/schema.prisma:2643 paymentStatus @default(UNPAID) → (60 分経過) terraform/cloud\_scheduler.tf:130-133 schedule "\*/15 \* \* \* \*" → src/app/api/cron/unpaid-event-registration-expire/route.ts:39 expireStaleUnpaidEventRegistrationsCommand() → src/shared/domain/events/unpaid-expiry.ts:101-113 findMany(staleRegistrationCandidateWhere) → src/shared/domain/events/unpaid-expiry.ts:36-59 (attendedAt も作成経路も見ず ticket.price\>0 のみで合致) → src/shared/domain/events/unpaid-expiry.ts:138-146 updateMany で status=CANCELLED / cancelledByType=SYSTEM → src/shared/domain/events/unpaid-expiry.ts:152-156 offerNextWaitlistEntryCommand → src/shared/domain/events/waitlist-offer-commands.ts:94-104 次の WAITLISTED を WAITLISTED\_OFFERED に昇格 → src/shared/domain/events/unpaid-expiry.ts:185-191 applyEventRegistrationCancellationSideEffects(channel:"system") → src/shared/domain/events/registration-cancellation/run-side-effects.ts:80 runCustomerEmailStep → src/shared/domain/events/registration-cancellation/steps.ts:91 sendEventRegistrationCancelled (email 非 null の行にキャンセル通知が届く) → 【誤った結果】(a) src/shared/domain/events/registration-queries.ts:110-115 getEventCheckInAttendees が status=CONFIRMED で絞るため受付リストから消え attendedQuantity 集計が狂う、(b) src/shared/domain/events/payment-commands.ts:698-716 recordManualEventPaymentCommand の claim が count=0 → DomainError("...", "CONFLICT") で受領済み現金をその行に記録できない

#### 既存の検査

未捕捉。\_\_tests\_\_/unit/domain/events/unpaid-expiry.test.ts のテストは4本(「候補0件」「UNPAID+有料チケット stale を CANCELLED 化」「claim count=0」「stripeCheckoutSessionId あり」)で、いずれも walk-in / attendedAt / 管理者代行を候補から除外すべきという主張を持たない。\_\_tests\_\_/unit/api/cron-unpaid-event-registration-expire.test.ts は cron 認可と feature gate のみ。\_\_tests\_\_/unit/architecture/ にも該当 gate なし。prisma/baseline/invariants.sql の event 系 trigger は定員のみを見ており status 遷移の妥当性は見ない。

#### 反証官による訂正

核心（有料チケットの walk-in / admin proxy 登録が 60 分後に cron で自動 CANCELLED 化される）は再現経路まで確認できたが、申告には次の不正確・誇張がある。

\1) 「参加者に申込キャンセルメールが届く」は walk-in では条件付き。walk-in の email は Zod で任意（src/shared/lib/validations/event-registration-onsite.ts:54-63）、action 側で空文字→null に畳む（event-registration.ts:327）。email が null の行は src/shared/lib/email/event-emails.ts:425 の `if (!data.customerEmail) return { ok: false, reason: "disabled" };` で早期 return するため顧客メールは飛ばない。確実に飛ぶのは email 必須の admin proxy（同 :66-78）と、受付係が email を入力した walk-in だけ。

\2) 「空いた枠がキャンセル待ちに配られ二重着席になる」は言い過ぎ。src/shared/domain/events/waitlist-offer-commands.ts:94-104 は WAITLISTED → WAITLISTED\_OFFERED にするだけで、席が確定するわけではない（24h TTL 内に当選者が確定操作/決済をして初めて CONFIRMED になる）。二重着席は「オファーを受けた人が確定した場合」の二次的帰結であって即時に起きるものではない。

\3) 「恒久的に詰む」も誇張。当該行への手動入金記録が CONFLICT になるのは事実（payment-commands.ts:711-716）だが、同じ参加者を walk-in で作り直して入金記録すれば会計上は回収できる。恒久的に失われるのは元の行・icsSequence の連続性・監査証跡の一貫性であって、現金が記録不能になるわけではない。

\4) 場所の補足。WalkInDialog / ProxyRegistrationDialog は check-in ページ配下だけの導線ではなく、イベント詳細 events/\[id\] からも開ける（\_components/RegisterParticipantButton.tsx:12-13）。同じ詳細ページに RecordManualPaymentDialog（\_components/RecordManualPaymentDialog.tsx）と入金記録ボタン（\_components/EventRegistrationTable.tsx:125-126）があるので、walk-in 側は「60 分以内に押し忘れる」という運用ミス依存のシナリオになる。深刻度 high の主軸は walk-in ではなく **事前の admin proxy 登録**で、電話申込を当日払い前提で 1 週間前に代理登録すると 60 分後の自動キャンセルは運用ミスではなく確定的に発生する（確認メールの直後にキャンセルメールが飛ぶ）。

\5) 行番号。walk-in の create は registration-onsite-commands.ts:109-121（申告の「118-120」は quantity/customerId/attendedAt の行で実質一致）、admin proxy の create は同 250-264。

\6) 申告のうち正しかったもの: cron の 15 分周期（cloud\_scheduler.tf:131）、cron route の guard が認可 + feature gate のみ（route.ts:27-37）、既存テスト 4 本が walk-in を扱っていないこと（\_\_tests\_\_/unit/domain/events/unpaid-expiry.test.ts:143-220）、architecture gate 不在、invariants.sql の event trigger が capacity のみ（invariants.sql:655）。

\7) 補足（範囲外だが同根）: この cron は公開申込にも同じ 60 分 TTL を課しており、それは payment-expiry-constants.ts:1-14 に明記された意図的設計。欠陥は「TTL の存在」ではなく「管理者が作った未決済行を公開申込と同一視して除外していないこと」。修正するなら candidate where に「管理者作成の未決済行を除外する識別子」が要るが、EventRegistration には作成経路を示す列が無い（customerId は公開ゲスト申込でも null）ため、列追加を伴う設計判断になる。

---

### F-07

**konbini / 銀行振込を選ぶと有料イベント申込は必ず自動キャンセル→支払後に自動返金される**

<sub>[対処の記録](2026-08-12-codebase-audit-progress.md) ／ [棄却一覧](2026-08-12-codebase-audit-refuted.md)</sub>

|        |                                                |
| ------ | ---------------------------------------------- |
| 深刻度 | 高 ／ 実コード確認済                           |
| 箇所   | `src/shared/domain/events/unpaid-expiry.ts:40` |
| 領域   | イベント（決済・繰上げ）                       |

#### 起きること

管理者が Settings で konbini（または customer\_balance）を有効化（stripe-payment-methods.ts:27-32 が許容）。顧客が 3,000 円のイベントに申込み、Checkout で「コンビニ決済」を選ぶ → Stripe が払込票を発行し checkout.session.completed が payment\_status="unpaid" で到着 → checkout-session-completed.ts:123-127 が PaymentIntent だけ保存し paymentStatus は PENDING のまま（この updateMany で updatedAt が更新される）。60 分後の毎時 cron が PENDING かつ updatedAt \< now-60min としてこの行を CANCELLED 化し、座席を解放して待機列を繰り上げ、キャンセルメールを送る。顧客は払込票を持って翌日コンビニで 3,000 円を支払う → checkout.session.async\_payment\_succeeded → fulfillEventRegistrationPaymentAtomically → claimEventRegistrationAsPaid が status=CONFIRMED を要求して count=0 → handlePaidClaimMissWithOrphanRefund が Stripe 自動返金。現金を払ったのに席は他人に渡り、返金は konbini の場合顧客の銀行口座登録が必要な事務処理になる。つまり非同期決済手段は有料イベントで構造的に一度も成功しない。

#### 直し方

staleRegistrationCandidateWhere / staleRegistrationClaimWhere の PENDING 枝に `stripePaymentIntentId: null` を追加し、checkout.session.completed で PaymentIntent が保存済み（＝Stripe 側で決済手続きが確定済み）の行は cron の対象外にする。確定/失敗は checkout.session.async\_payment\_succeeded / async\_payment\_failed（checkout-session-failed.ts:41）に委ねる。あるいは非同期 method が有効なときだけ TTL を konbini の払込期限に合わせる。

#### 該当箇所

```
in: [PaymentStatus.UNPAID, PaymentStatus.PENDING, PaymentStatus.FAILED],
```

#### 到達経路

前提: 管理者が Settings \> Stripe で konbini を有効化（既定は prisma/schema.prisma:1917 の \["card"\] なので opt-in が必要）。
\1. src/shared/domain/events/payment-commands.ts:165-173 — Settings の payment\_method\_types をフィルタ無しで採用（非同期 method の除外なし）
\2. src/shared/domain/events/payment-commands.ts:191-198 — updateMany で paymentStatus UNPAID→PENDING（@updatedAt により updatedAt = 現在時刻）
\3. src/shared/domain/events/payment-commands.ts:239-277 — payment\_method\_types: \["card","konbini"\] で Checkout Session 作成（expires\_at = 60 分）
\4. 顧客が konbini を選択 → Stripe が払込票を発行し session は complete / payment\_status="unpaid"
\5. src/shared/domain/payment/stripe-webhook/checkout-session-completed.ts:113-128 — else 分岐。saveEventRegistrationPaymentIntentId のみ実行、paymentStatus は PENDING のまま
\6. src/shared/domain/events/payment-queries.ts:212-215 — updateMany で stripePaymentIntentId 保存（updatedAt を再度更新）
\7. 60〜75 分後: terraform/cloud\_scheduler.tf:129-134 の \*/15 cron → src/app/api/cron/unpaid-event-registration-expire/route.ts:39
\8. src/shared/domain/events/unpaid-expiry.ts:49-52 — 分岐: paymentStatus=PENDING かつ updatedAt \< cutoff にマッチ（stripePaymentIntentId の有無を見ない ← 誤りの本体）
\9. src/shared/domain/events/unpaid-expiry.ts:74-76 → :138-146 — status=CANCELLED / cancelledByType=SYSTEM に確定
\10. src/shared/domain/events/unpaid-expiry.ts:152 — offerNextWaitlistEntryCommand で座席を待機列の他人へ繰り上げ
\11. src/shared/domain/events/unpaid-expiry.ts:185-191 — キャンセルメール送信
\12. 翌日 顧客がコンビニで支払 → checkout.session.async\_payment\_succeeded
\13. src/shared/domain/payment/stripe-webhook/checkout-session-async-payment-succeeded.ts:88 → fulfill-event-registration-payment.ts:152
\14. src/shared/domain/events/payment-queries.ts:55-59 — 分岐: WHERE の status: RegistrationStatus.CONFIRMED に一致せず result.count = 0
\15. src/shared/domain/events/payment-queries.ts:92 → src/shared/domain/payment/payment-claim-orchestration.ts:75（current.status === CANCELLED なので early return しない）→ :110 refundOrphan
\16. src/shared/domain/events/payment-commands.ts:1049 refundOrphanedStripePaymentForCancelledEventRegistration — 誤った結果: 現金を払った顧客の席は他人に渡り、決済は自動返金（konbini は返金に顧客の口座登録が必要）に落ちる

#### 既存の検査

\_\_tests\_\_/unit/domain/events/unpaid-expiry.test.ts は 4 ケース（候補 0 件 / UNPAID stale の claim / claim count=0 / stripeCheckoutSessionId ありの session expire）のみで、非同期決済確定待ちの PENDING を扱うケースが無い。\_\_tests\_\_/unit/api/cron-unpaid-event-registration-expire.test.ts も auth と feature gate のみ。gate 無し。

#### 反証官による訂正

結論は維持だが、記述に 4 点の事実誤認がある。

\1. cron の頻度が誤り。「60 分後の毎時 cron」ではなく terraform/cloud\_scheduler.tf:131 は `*/15 * * * *`（15 分毎）。実際のキャンセルは checkout 開始から 60〜75 分後に起きる。

\2. customer\_balance は恐らく到達しない。src/shared/domain/events/payment-commands.ts:239-277 は `customer` も `payment_method_options.customer_balance.{funding_type, bank_transfer.type}` も渡していない。Stripe は customer\_balance にこれらを必須とするため Session 作成が例外になり、catch（:303-329）の handleCheckoutSessionCreateFailure → revertCheckoutPendingToUnpaid で PENDING→UNPAID に巻き戻る。実際に本欠陥を踏むのは konbini のみと見るべき（この点だけは Stripe API 側の要件で、repo 内のコードからは確定できない）。

\3. 「必ず」は厳密には過剰。顧客が checkout 開始から 60 分以内にコンビニで払込を済ませれば claim は成功する。実運用上ほぼ常に失敗するのは正しいが、構造的に 100% ではない。

\4. 前提条件が省略されている。Settings.stripePaymentMethodTypes の既定は prisma/schema.prisma:1917 の `["card"]`、src/shared/domain/settings/admin-queries.ts:660 のフォールバックも `["card"]`。管理者が Stripe 設定画面で konbini を明示的に有効化していない限り発生しない（見出しの「必ず」は「konbini を有効化した場合は必ず」と読み替えるべき）。

補足 2 点:
\- updatedAt の更新源の帰属が不正確。指摘は「checkout-session-completed の updateMany で updatedAt が更新される」としているが、payment-commands.ts:191-198 の PENDING claim でも既に更新されている。また saveEventRegistrationPaymentIntentId は `session.payment_intent` が string のときしか走らない（checkout-session-completed.ts:118-121）。走らない場合は cutoff 起点が claim 時刻のままとなり、キャンセルはむしろ早まる。結論は変わらない。
\- events 固有ではない。src/shared/domain/reservations/pending-expiry.ts:79 も `paymentInitiatedAt < cutoff` だけで PENDING 予約を CANCELLED 化しており、非同期決済確定待ちを除外していない。同一の構造的欠陥が予約側にもある点は指摘に含まれておらず、影響範囲を過小に見積もっている。

---

### F-08

**メディア削除の参照検査が JSON 列に効かず、セクションで使用中の画像を R2 ごと消せる**

<sub>[対処の記録](2026-08-12-codebase-audit-progress.md) ／ [棄却一覧](2026-08-12-codebase-audit-refuted.md)</sub>

|        |                                            |
| ------ | ------------------------------------------ |
| 深刻度 | 高                                         |
| 箇所   | `src/shared/domain/media/references.ts:98` |
| 領域   | メディア・R2・OAuth                        |

#### 起きること

管理者がトップの page-hero 背景に設定済みの画像を、メディアライブラリから削除する。Section.config は `{"variant":"media","media":[{"url":"https://cdn/media/general/…jpg"}]}` のような **object 根の JSONB**（prisma/schema.prisma:1565 `config Json @default("{}")`）で、Prisma の string\_contains は JSON の \*string 値\* 向けの演算子（配列用に array\_contains が別に用意されている）。根が object / array の列では述語が成立しないため findMediaUrlUsages は 0 件を返し、assertMediaUrlNotInUse は通過する。deleteMediaCommand は先に R2 オブジェクトを実削除してから isActive:false にするので、トップの hero 画像は 404 になり DB にも R2 にも実体が残らず復旧できない。同じ形で Space.gallery / Event.gallery / Location.imageUrls も検査されない。Lexical 本文は contentHtml 側の `contains`（プレーン text 列）が並列に効いているので救われるが、Section.config には text のミラーが無く、この 1 本が唯一の防御になっている（= 全公開ページのセクション画像が無防備）。

#### 直し方

まず実 DB に対して「Section.config の中に URL を持つ行を path 無しの string\_contains で引けるか」を integration 1 本で確定させる（0 件 DML では意味が無いので、行を入れて引く）。引けないなら JSON 列は path を明示するか `$queryRaw` の `config::text LIKE` に切り替える（恒久解は media 参照の中間テーブル）。併せて deleteMediaCommand の順序を「DB soft delete → R2 削除」に入れ替えるか R2 側に versioning を入れて、検査を取りこぼしたときの復旧余地を残す。

#### 該当箇所

```
where: { config: { string_contains: url } },
```

#### 到達経路

エントリポイント: src/app/(admin)/admin/(dashboard)/\_shared/actions/media.ts:106 `deleteMedia(id)` → :116 `execute: async () => deleteMediaCommand(parsed.data)`
→ src/shared/domain/media/commands.ts:122-125 `prisma.media.findUnique({ where: { id, isActive: true } })` で url/storagePath を取得
→ commands.ts:131 `await assertMediaUrlNotInUse(media.url)`
→ src/shared/domain/media/references.ts:177-186 `assertMediaUrlNotInUse` → :178 `findMediaUrlUsages(url)`
→ references.ts:97-100 `prisma.section.findFirst({ where: { config: { string_contains: url } } })`
→ 【誤った分岐】Prisma 7.9.1 が生成する SQL は `WHERE ("sections"."config"::text LIKE ('%'||$1||'%') AND JSONB_TYPEOF("sections"."config") = 'string')`（capture adapter で実測）。prisma/baseline/invariants.sql:121 の CHECK `jsonb_typeof(config) = 'object'` により第 2 項は全行で偽 → findFirst は常に null
→ references.ts:166 `if (section) add("セクション")` に入らない → :174 labels は空配列
→ references.ts:179 `if (usages.length === 0) return;` で throw されず通過
→ commands.ts:133 `await deleteFile(media.storagePath)` → src/shared/lib/r2/delete.ts:29-38 `DeleteObjectCommand` で R2 実体をハード削除
→ commands.ts:141-144 `prisma.media.update({ data: { isActive: false } })`
→ 結果: page-hero 等のセクションが `config.images[].url` で参照中の画像が R2 から消え、公開ページが 404 画像になる。管理画面は削除成功として表示する。

同じ形で以下も空振り（references.ts の行 → invariants.sql の CHECK）:
\- references.ts:74 `spaces.gallery` → invariants.sql:183 `jsonb_typeof(gallery) = 'array'`
\- references.ts:92 `events.gallery` → invariants.sql:65 `jsonb_typeof(gallery) = 'array'`
\- references.ts:124 `locations.imageUrls` → invariants.sql:79 `jsonb_typeof(image_urls) = 'array'`
（この 3 つは exact 一致列 mainImageUrl/thumbnailUrl/imageUrl や \*Html の contains では代替されないため、gallery 専用画像は同様に無防備）

#### 既存の検査

無し。\_\_tests\_\_/unit/domain/media/references.test.ts は prisma を mock して findFirst の戻り値を差し込むだけなので where 節の意味は一度も実行されない。\_\_tests\_\_/integration/ に media 参照検査のテストは存在せず（media で引くと event-gallery-roundtrip 等の Prisma 呼び出し形状テストのみ）、architecture gate にも該当は無い。

#### 反証官による訂正

結論は支持するが、機序の説明と影響範囲に補正が要る。

【補正1: 空振りの原因は `#>>ARRAY[]::text[]` ではない】報告者は「path 未指定時の抽出 `#>>ARRAY[]::text[]` が object 根で成立しない」と wasm 文字列プールから推測しているが、実測した生成 SQL は path 省略時に抽出演算子を使わない。実際は
`config::text LIKE ('%'||$1||'%') AND JSONB_TYPEOF(config) = 'string'`
で、**LIKE の側はむしろマッチする**（`::text` は JSON 全体を文字列化するため URL を含む）。空振りさせているのは AND で結ばれた `JSONB_TYPEOF(...) = 'string'` の型ガードのみ。`#>>ARRAY[$1]::text[]` が出るのは path 指定時（audit-log:199-202 の形）だけで、報告者の (b) の証拠解釈は取り違えている。結論は同じだが、修正時に「path を足す」だけでは Section.config のように URL の埋まる位置が variant 依存で不定なケースを救えない（例: `path: ["images"]` は配列なので `array_contains` 側になる）ため、原因の取り違えは修正方針に影響する。実務的には `config::text LIKE` 相当を `$queryRaw` で書くか、正規化した参照テーブルを持つのが筋。

【補正2: 証拠の強度は報告より上げられる】報告者は「object 根だから成立しない」とデータ形状で論じているが、prisma/baseline/invariants.sql に該当 9 列すべての jsonb\_typeof CHECK が存在するため、**データに依存せず制約レベルで恒偽**であることが示せる（sections.config は :121、spaces.gallery は :183、events.gallery は :65、locations.image\_urls は :79）。「たまたま今のデータがそうなっている」ではなく「DB がその形を強制しているので絶対に当たらない」。

【補正3: 空振りは 9 本、実害があるのは 4 本】references.ts の string\_contains は 45/58/73/74/91/92/98/117/124 の 9 箇所すべてが恒偽。ただし報告者も述べる通り 45(posts.contentJson)/58(news.contentJson)/73(spaces.descriptionJson)/91(events.descriptionJson)/117(terms.contentJson) は同じ OR 内の `contentHtml`/`descriptionHtml` の `contains`（プレーン text 列 = LIKE で正常動作）が並列に効くのでカバレッジの実損は無い。実損があるのは 98(sections.config)・74(spaces.gallery)・92(events.gallery)・124(locations.imageUrls) の 4 本。

【補正4: JSDoc も嘘になっている】references.ts:10 の「HTML / JSON は contains（`string_contains`）で走査する」は実際には走査していない。修正時にここも直す必要がある。

【severity: high を維持】管理者操作起点で攻撃者到達性は無いが、(a) R2 は DeleteObjectCommand でハード削除、Cloudflare R2 に S3 相当のオブジェクトバージョニングは無いため復旧不能、(b) 削除順が「R2 先 → DB 後」なので DB 側の isActive:false が成功しても実体は既に消えている、(c) 管理画面には削除成功として表示され無言、(d) 全公開ページのセクション画像が対象、という 4 点で high 相当。security ではなく可用性・データ喪失の観点での high。

---

### F-09

**GCal 逆流の時間変更が manualAdjustmentAmount を残したまま totalPrice を書き換え、CHECK 制約違反で双方向同期が永久に詰まる**

<sub>[対処の記録](2026-08-12-codebase-audit-progress.md) ／ [棄却一覧](2026-08-12-codebase-audit-refuted.md)</sub>

|        |                                                                         |
| ------ | ----------------------------------------------------------------------- |
| 深刻度 | 高                                                                      |
| 箇所   | `src/shared/domain/reservations/calendar-sync-inbound-mutations.ts:300` |
| 領域   | 予約（未読分）                                                          |

#### 起きること

admin が UNPAID 予約の編集フォームで totalPrice を明示指定して保存する（例: 自動計算 4,000 円を 3,000 円に上書き）。admin-commands.ts:418 `const manualAdjustmentAmount = finalTotalPrice - clampedBreakdown;` により DB は manual\_adjustment\_amount = -1000 を持つ。この予約は GCal に同期済み。次に admin が Google Calendar 上でこのイベントを 2h→3h にドラッグする。inbound sync が applyCalendarTimeChange を呼び、updateMany は start/end/basePrice(6000)/totalPrice(6000)/各割引(0) を書くが manualAdjustmentAmount は data に含まれないため -1000 のまま残る。prisma/baseline/invariants.sql:119 の `reservations_total_price_breakdown_check`（total\_price = GREATEST(0, base - coupon - duration - space) + COALESCE(manual\_adjustment\_amount, 0)）は 6000 = 5000 となり不成立で、Postgres が 23514 を投げる。tx は abort し、例外は applyCalendarTimeChange から processCalendarChange まで素通りする。結果 (1) 設計されている失敗通知 sendCalendarSyncRejectionEmail は transactionResult.success===false の分岐にしか無いため一通も飛ばない、(2) reservation-calendar-inbound.ts:119 `if (result.errors.length === 0)` が false になり recordCalendarSyncCompleted も saveCalendarSyncToken も呼ばれない → 次回 poll/webhook も同じ syncToken で同じ変更が再配信され、同じ CHECK 違反を無限に繰り返す。DB は旧時刻のまま・GCal は新時刻のままで恒久的に乖離し、旧時刻のスロットが予約枠として占有され続ける（EXCLUDE 制約は旧時刻で効いたまま）。

#### 直し方

applyCalendarTimeChange の updateMany data に `manualAdjustmentAmount: null` を追加する（priceOverriddenById: null と同じ意図 = 自動再計算に戻す）。同型の欠陥が customer-commands.ts の自己変更経路（同ファイル 585 行 `totalPrice: pricing.totalPrice,` / 599 行 `priceOverriddenById: null,`）にもあり、そちらも manualAdjustmentAmount を書いていないので同時に直す。恒久対策として「pricing.totalPrice を書く経路は必ず manualAdjustmentAmount も書く」を architecture gate 化できる（現在この列を書いているのは admin-commands.ts:206 と :536 の 2 箇所だけ）。

#### 該当箇所

```
totalPrice: pricing.totalPrice,
```

#### 到達経路

src/app/(admin)/admin/(dashboard)/reservations/\_components/ReservationEditForm.tsx:265 (hidden totalPrice 手動上書き input) → src/shared/domain/reservations/admin-commands.ts:418 (manualAdjustmentAmount = finalTotalPrice - clampedBreakdown、例: -1000) → src/shared/domain/reservations/admin-commands.ts:536 (manual\_adjustment\_amount を非ゼロで永続化。この時点では CHECK 成立) → \[admin が GCal 上でイベントをドラッグ\] → src/shared/domain/reservations/reservation-calendar-inbound.ts:60 syncFromCalendar → :102 processCalendarChange → :189-195 startChanged/endChanged が true → :198 PAYMENT\_STATUSES\_BLOCKING\_TIME\_CHANGE (:43-49) は UNPAID を含まないため通過 → :244 applyCalendarTimeChange → src/shared/domain/reservations/calendar-sync-inbound-mutations.ts:160 $transaction → :289-316 updateMany が basePrice/totalPrice(:300)/各割引を書くが manualAdjustmentAmount を書かない → prisma/migrations/00000000000000\_init/migration.sql:2682 reservations\_total\_price\_breakdown\_check で 23514 → 例外が :323 $transaction を抜ける → src/shared/domain/reservations/reservation-calendar-inbound.ts:109-113 の per-change catch が result.errors.push → :119 if (result.errors.length === 0) が false → recordCalendarSyncCompleted (:120) と saveCalendarSyncToken (:122) が呼ばれず、同じ syncToken で同じ変更が再配信され続ける。かつ :252 の if (!transactionResult.success) 分岐に到達しないため sendCalendarSyncRejectionEmail も飛ばない（誤った結果: DB は旧時刻のまま・GCal は新時刻のまま乖離し、inbound 同期全体が無通知で停止する）。

#### 既存の検査

\_\_tests\_\_/unit/domain/reservations/calendar-sync-inbound-pricing.test.ts は `mock.module("@/shared/db/prisma")` で Prisma を完全にモックしており（同ファイル 112-119 行）、DB の CHECK 制約は評価されない。同テストは updateArgs.data の totalPrice/basePrice/taxAmount/priceOverriddenById しか検証せず manualAdjustmentAmount には触れていない。\_\_tests\_\_ 全体で manualAdjustmentAmount を参照するのは \_\_tests\_\_/support/numeric-column-domains.ts のみで、この整合を見る integration テストも architecture gate も存在しない。

#### 反証官による訂正

機構の記述はほぼ正確だが、3点補正する。(1) 【範囲の過小申告】同一の欠落は指摘箇所だけでなく src/shared/domain/reservations/customer-commands.ts:577-605 にも存在する。こちらは priceOverriddenById:null を書く際に「過去に admin が override した予約」を明示的に論じたコメント(595-599行)まで置きながら manualAdjustmentAmount を落としており、同じ paymentStatus:UNPAID claim の下で顧客セルフ変更経路からも同じ 23514 に到達する。修正は inbound 単体でなく2箇所同時に行うべきで、片方だけ直すと同じ欠陥が残る。(2) 【「永久」は絶対ではない】自動回復経路が無いのは正しいが、当該予約が UNPAID を離れる（決済完了で PAID 等）か GCal イベントが削除されると、以後その変更は :198 の blocking 分岐か change.deleted 分岐に落ちて error を積まなくなり、token が進んで同期は回復する。よって「恒久的」ではなく「自動回復経路が無く、外部状態変化か手動介入まで停止し続ける」が正確。(3) 【符号は本質でない】失敗シナリオは -1000 の減額例で書かれているが、admin が自動計算より高い額を入力した場合の正の manual\_adjustment\_amount でも同様に破れる。欠陥の条件は「非ゼロ」であって負値ではない。深刻度は self-申告の high を維持する: DB 側は fail-closed でデータ破損は起きないものの、trigger 条件が2つとも通常の管理者操作（手動価格調整・GCal 上でのドラッグ）であり、影響が当該予約に留まらず inbound 同期パイプライン全体を無通知で止めるため。

---

### F-10

**Stripe Checkout の idempotencyKey が予約 ID 固定のため、決済失敗後 24 時間は再決済セッションを作れない**

<sub>[対処の記録](2026-08-12-codebase-audit-progress.md) ／ [棄却一覧](2026-08-12-codebase-audit-refuted.md)</sub>

|        |                                                          |
| ------ | -------------------------------------------------------- |
| 深刻度 | 高 ／ 実コード確認済                                     |
| 箇所   | `src/shared/domain/reservations/payment-commands.ts:311` |
| 領域   | 予約                                                     |

#### 起きること

顧客が 10:00 に決済を開始（session 作成、expires\_at = 11:00、paymentStatus=PENDING）→ 離脱 → 11:00 に Stripe が checkout.session.expired を送り claimReservationAsFailed が FAILED に遷移 → 11:30 に顧客がマイページから再度「決済する」を押す。claim は FAILED→PENDING を通る（PAYMENT\_STATUSES\_REOPENABLE\_FOR\_CHECKOUT）が、Stripe へ渡す idempotencyKey は初回と同一の `checkout/reservation/<id>/pending-claim` で、body の expires\_at（= 新しい claimedAt+3600）が初回と異なる。Stripe の idempotency key は 24 時間保持され、同一キー・異なるパラメータのリクエストは idempotency\_error(400) を返すため、catch 節が PENDING→UNPAID に revert して DomainError(UNEXPECTED)「決済セッションの作成に失敗しました。しばらく経ってからお試しください。」を返す。以後 24 時間、何度押しても同じ結果になり、顧客は自力で支払えない（管理者の手動入金記録だけが回避策）。金額を編集してから再決済した場合も unit\_amount が変わるので同じく失敗する。

#### 直し方

idempotency key に「この checkout 試行」を識別する要素を混ぜる。claim 時に生成する paymentInitiatedAt（既に DB に書いている claimedAt）を使って `checkout/reservation/${reservationId}/${claimedAt.getTime()}` にするのが最小で、同一試行のリトライ（ネットワーク切断時の再送）は従来どおり冪等のまま、別試行は別キーになる。Stripe 公式も idempotency key は「同一の論理リクエスト 1 回分」に対して発行することを求めている。events 側の `checkout/event-registration/${registrationId}/pending-claim`（src/shared/domain/events/payment-commands.ts:275）と `checkout/waitlist-offer/...`（同 548）も同型なので併せて確認する。

#### 該当箇所

```
{ idempotencyKey: `checkout/reservation/${reservationId}/pending-claim` },
```

#### 到達経路

src/app/(public)/mypage/reservations/\[id\]/\_components/reservation-detail.tsx:353-364（paymentStatus=FAILED で CheckoutButton 表示）→ src/app/(public)/mypage/\_shared/actions/reservation.ts:105 startCheckoutSessionAction → src/shared/domain/reservations/payment-commands.ts:135-143（FAILED は guard を通過）→ 同 :212-231 claim FAILED→PENDING（許容集合は src/shared/domain/payment/payment-status-guards.ts:12-15）→ 同 :211 claimedAt=new Date() → 同 :279-281 expires\_at = floor(claimedAt/1000) + 3600（PENDING\_RESERVATION\_EXPIRY\_MINUTES=60 は src/shared/domain/reservations/pending-expiry.ts:37）→ 同 :283-312 client.checkout.sessions.create(body2, { idempotencyKey: 初回と同一の固定キー }) → Stripe が 400 idempotency\_error（同一キー・異パラメータ、キー保持 24h）→ 同 :354-362 catch（DomainError でないので握る）→ 同 :363-372 handleCheckoutSessionCreateFailure（src/shared/domain/payment/checkout-session-write-orchestration.ts:100-114）→ revertCheckoutPendingToUnpaid（同 :22-37）で PENDING→UNPAID → 同 :373-376 DomainError("決済セッションの作成に失敗しました。しばらく経ってからお試しください。", "UNEXPECTED")。UNPAID に戻るため UI のボタンは出続け、再押下は同じ経路で同じ 400 に落ちる。FAILED が滞留する前提は src/shared/domain/reservations/payment-queries.ts:216-231（claimReservationAsFailed が FAILED を書く）と src/shared/domain/reservations/pending-expiry.ts:73-80（cron は paymentStatus=PENDING しか拾わない）。

#### 既存の検査

none（むしろ固定キーを固定化している）。\_\_tests\_\_/unit/domain/reservations/payment-commands.test.ts:391 と :539 が `idempotencyKey: \`checkout/reservation/${RESERVATION\_ID}/pending-claim\\`` を toHaveBeenCalledWith で pin しているが、いずれも 1 回目の呼び出しのみで、同一予約に対する 2 回目の create（= 実際に Stripe が idempotency\_error を返す条件）を再現するテストは無い。

#### 反証官による訂正

指摘は概ね正確だが 5 点補正する。(1) 24 時間の起点は「再試行時刻」ではなく「キーを最初に消費した create（10:00）」。したがってロックアウトは初回決済開始から最大 24h で、翌日以降は自力回復する（回避策は管理者の手動入金記録だけではない）。(2) 再試行失敗後の paymentStatus は FAILED のままではなく UNPAID（payment-commands.ts:363-372 の revert）。「何度押しても同じ」という結論自体は正しいが、2 周目以降の起点ステータスは UNPAID。(3) 「expires\_at が違うから失敗する」は正しいが、body が完全一致した場合も壊れている点が抜けている — その場合 Stripe は初回レスポンス（= すでに expired 済みの session）をそのまま replay するため、顧客は期限切れ Checkout URL に飛ばされる。つまり expires\_at の差異は必要条件ではなく、固定キーである時点でどちらに転んでも再決済は成立しない。(4) reservations 固有ではない。同一形状が src/shared/domain/events/payment-commands.ts:275（`checkout/event-registration/${registrationId}/pending-claim`）と :548（`checkout/waitlist-offer/${registrationId}/pending-claim`）にもあり、後者は expires\_at が offer の固定 expiresAt 由来なので (3) の「期限切れ session を replay」側に倒れる。修正はこの 3 箇所を揃えるべき。(5) docs/audits/2026-07-29-codebase-audit.md:51,139 はこの固定キーを Phase 7 PR5 の「修正」として記録し、実装先を `checkout-session-create-orchestration.ts` と書いているが、そのファイルはリポジトリに存在せず（find で 0 件）キーは payment-commands.ts:311 に直書きされている。ドキュメント側も drift しているので、修正時に併せて直す必要がある。深刻度 high は妥当と判断する（#1017/#1022/#1042/#1043 と複数 PR で作り込んだ FAILED→PENDING 再決済導線が、実運用で最も多い「離脱→当日中に再試行」のケースで 100% 機能しない）。ただしデータ破損・二重課金・セキュリティ影響はなく、24h 経過で自然回復するため critical ではない。

---

### F-11

**Google Calendar 上で予約イベントを削除しても予約がキャンセルされず、syncToken だけ進んで永久に取りこぼす**

<sub>[対処の記録](2026-08-12-codebase-audit-progress.md) ／ [棄却一覧](2026-08-12-codebase-audit-refuted.md)</sub>

|        |                                             |
| ------ | ------------------------------------------- |
| 深刻度 | 高 ／ 実コード確認済                        |
| 箇所   | `src/shared/lib/google-calendar/sync.ts:83` |
| 領域   | 外部連携                                    |

#### 起きること

管理者が Google Calendar 上で予約イベント（description 先頭が「予約ID: XXXXXXXX」）を削除する。Google Calendar API の Events resource 仕様では status="cancelled" の削除済みイベントは id フィールドのみ populated が保証で、description は返らない（singleEvents:true のため cancelled instance も id/recurringEventId/originalStartTime のみ）。結果 isReservationEvent が undefined になり、その change は changes 配列に入らない。deleted:true の change が 1 件も生成されないので cancelReservationFromCalendar / applyCancellationSideEffects（返金・メール・SmartLock 失効）が一切走らず、予約は CONFIRMED のまま残る。さらに processCalendarChange が呼ばれないので result.errors は空、reservation-calendar-inbound.ts:119-123 の条件を満たして saveCalendarSyncToken(newSyncToken) が実行される。Google の増分同期は同じ変更を再配信しないため、この削除は二度と配信されず、スペースは押さえられたまま・顧客には何の通知も行かない状態が手動介入まで永続する。

#### 直し方

削除判定を description ではなく DB 側の突合に切り替える。event.status==="cancelled" の場合は description を見ずに常に CalendarChange（deleted:true）として push し、対象かどうかの判定は下流の getReservationByCalendarEventId(eventId)（reservation-calendar-inbound.ts:153、ヒットしなければ not\_found で無害）に委ねる。confirmed/tentative の分岐だけ従来どおり description マーカー（ハードコードの "予約ID:" ではなく loop-prevention.ts の OUTBOUND\_RESERVATION\_MARKER）で絞る。あわせて cancelled イベントの見本入力（id と status のみのイベント）を固定するテストを追加する。

#### 該当箇所

```
// 予約システムで作成されたイベントのみを対象（descriptionに予約IDが含まれる）
const isReservationEvent = event.description?.includes("予約ID:");

if (isReservationEvent) {
```

#### 到達経路

前提: settingsGoogleCalendar.googleCalendarTwoWaySyncEnabled = true（src/shared/domain/reservations/calendar-sync.ts:214、既定は false）。

src/app/api/webhooks/google-calendar/route.ts:198 syncFromCalendar()
→ src/shared/domain/reservations/reservation-calendar-inbound.ts:80 twoWaySyncEnabled 通過
→ reservation-calendar-inbound.ts:90 fetchCalendarChanges(settings.syncToken)
→ src/shared/domain/reservations/calendar-sync-fetch.ts:34 fetchCalendarChangesApi(ctx, syncToken, ...)
→ src/shared/lib/google-calendar/sync.ts:62 params.syncToken 設定 / :59 showDeleted:true / :58 singleEvents:true
→ sync.ts:79-80 削除イベント（{id, status:"cancelled"} のみ）は id があるので continue しない
→ sync.ts:83 event.description が undefined → isReservationEvent = undefined
→ sync.ts:85 if 不成立 → sync.ts:104 changes.push に到達せず脱落（deleted:true の change が 0 件）
→ sync.ts:109 newSyncToken は response から取得され :112-116 で返る
→ reservation-calendar-inbound.ts:100-114 ループ 0 周（processCalendarChange 未実行 → :162-186 の cancelReservationFromCalendar / applyCancellationSideEffects が走らない）
→ reservation-calendar-inbound.ts:119 result.errors.length === 0 成立
→ reservation-calendar-inbound.ts:120 recordCalendarSyncCompleted() / :122 saveCalendarSyncToken(newSyncToken)

誤った結果: 予約は CONFIRMED のまま（返金・キャンセルメール・SmartLock 失効・監査ログいずれも未発火）。syncToken が進むため Google の増分同期は同じ削除を再配信せず、手動介入まで恒久的に取りこぼす。

#### 既存の検査

none。\_\_tests\_\_/unit/lib/calendar-sync/sync-token-save.test.ts は fetchCalendarChanges を丸ごと mock しており（:139-141）、lib 側の description フィルタは一切通らない。\_\_tests\_\_/unit/lib/google-calendar/ には events.test.ts / recurrence.test.ts / webhook.test.ts のみで sync.ts のテストは存在しない。\_\_tests\_\_/unit/architecture/ に calendar 系 gate は calendar-date-columns.test.ts / e2e-calendar-date-selection.test.ts / cron-scheduler-path-sync.test.ts のみで本件を見ていない。

#### 反証官による訂正

主張の骨子に事実誤認は無い。以下は精度上の補足・微修正。

\1) 前提条件の欠落: 発火には `googleCalendarTwoWaySyncEnabled = true` が必要（src/shared/domain/reservations/calendar-sync.ts:214、既定 false / reservation-calendar-inbound.ts:80 で早期 return）。指摘はこの前提を書いていない。ただし機能が有効な限り削除検知は 100% 失敗するため深刻度は high のままで妥当。

\2) エントリポイントの数: 指摘は webhook route:198 のみを挙げるが、実際は cron（src/app/api/cron/calendar-sync/route.ts:221）と管理画面の手動同期（src/app/(admin)/admin/(dashboard)/\_shared/actions/settings/google-calendar.ts:319）からも同じ経路に入る。到達性はむしろ指摘より広い。

\3) 行番号の微差: syncToken 保存ブロックは reservation-calendar-inbound.ts:119-124（指摘は 119-123）。

\4) 関連する副次事実（指摘外）: sync.ts:83 はマーカー "予約ID:" をリテラル直書きしており、SSoT である src/shared/lib/calendar-sync/loop-prevention.ts:20 の `OUTBOUND_RESERVATION_MARKER` を import していない。outbound（reservation-calendar-outbound.ts:57）と event-calendar-import 側は SSoT を使っているため、sync.ts だけが同期されない 3 つ目の写しになっている。

---

## 中（64 件）

### F-12

**cross-surface import gate が `from "…"` 形しか見ず、動的 import と `@/app/(admin\|public)/…` 経路を素通しする**

<sub>[対処の記録](2026-08-12-codebase-audit-progress.md) ／ [棄却一覧](2026-08-12-codebase-audit-refuted.md)</sub>

|        |                                                                    |
| ------ | ------------------------------------------------------------------ |
| 深刻度 | 中                                                                 |
| 箇所   | `__tests__/unit/architecture/cross-surface-import-gate.test.ts:31` |
| 領域   | gate 本体                                                          |

#### 起きること

`src/app/(public)/mypage/_components/x.tsx` に `const { hasPermission } = await import("@/admin/lib/permissions");` と書く、あるいは `import { ROLE_PERMISSIONS } from "@/app/(admin)/admin/(dashboard)/_shared/lib/permissions";` と書く。前者は `from` を含まないので pattern にヒットせず、後者は alias が `@/admin` ではなく `@/`（tsconfig の 4 本目）なので `@/admin` にヒットしない。どちらも public surface のモジュールグラフに admin 専用コードを引き込むが、gate の offenders は空のまま緑になる。`.claude/rules/src-boundaries.md` はこの gate を「(admin)/(public) 相互 import 禁止の強制手段」として名指ししているので、規約は守られていると読まれ続ける。

#### 直し方

pattern を `(?:from|import\\(|require\\()\\s*["']` 始まりへ広げ、さらに alias の別綴り（`@/app/(admin)/`・`@/app/(public)/`）と相対パスでの `(admin)` / `(public)` 越境も同じ判定に含める。fixture テスト(51-73 行)に「動的 import」「@/app/(admin)/… 直書き」の 2 本を追加して、広げたことを固定する。

#### 該当箇所

```
`from\\s+["']${forbiddenAlias.replace("/", "\\/")}(?:\\/|["'])`,
```

#### 到達経路

\_\_tests\_\_/unit/architecture/cross-surface-import-gate.test.ts:88 test「(public) は @/admin を import しない」→ :89 collectCrossSurfaceImports(collectSourceFiles(publicRoot), "@/admin") → :45 files.filter(importsForbiddenAlias(...)) → :26 importsForbiddenAlias → :30-33 pattern = /from\\s+\["'\]@\\/admin(?:\\/|\["'\])/u → :34-38 各行で :36 のコメント除外を通過した後 :37 pattern.test(line) が唯一の判定 → (a) `const { hasPermission } = await import("@/admin/lib/permissions");` は行内に from トークンが無いので false / (b) `import { userHasResourceAccess } from "@/app/(admin)/admin/(dashboard)/_shared/lib/permissions";` は from の直後が @/app/ で @/admin に一致せず false（tsconfig.json paths の @/\* → ./src/\* で解決は成立し type-check は緑）→ :45 が空配列を返す → :93 expect(offenders).toEqual(\[\]) が緑。admin 側 :80-86 も同一構造で同じ結果。結果として .claude/rules/src-boundaries.md が「強制: cross-surface-import-gate.test.ts」と名指しする「(admin)/(public) 相互 import 禁止」が、実際には強制されていない状態で緑が出続ける。

#### 既存の検査

ESLint の `no-restricted-imports` は `reactCompilerRestrictedImports` / prisma 系 / db barrel だけで、surface 間の制限を持たない（eslint.config.mjs:122, 295, 311 を確認）。同じリポジトリの `prisma-import-boundary.test.ts:213` は同型の穴に既に気づいて `/(?:from|import\(|require\()\s*["']@\/shared\/db\/prisma["']/u` へ広げてあり（211-212 行に「`from "…"` だけを見ると `await import(...)` が素通りする」というコメント付き）、この gate だけ古い形のまま残っている。現状 src には違反は無い（grep 済み）ので、赤くなるのは新規混入時のみ。

#### 反証官による訂正

指摘は成立するが、事実誤認 2 点と過小申告 1 点がある。【誤認1】「@/（tsconfig の 4 本目）」は誤り。tsconfig.json:paths の並びは @/\* が 1 本目で、4 本目は @/public/\*（@/admin/\* は 3 本目）。【誤認2】例示の `import { ROLE_PERMISSIONS } from "@/app/(admin)/…/_shared/lib/permissions"` は symbol が誤り。ROLE\_PERMISSIONS は既に @/shared/lib/admin-permissions へ移設済みで、当該ファイルの export は ACTION\_LABELS / userHasPermission / canAccessAdmin。また同ファイル先頭に `import "server-only";`(:17) があるため、public の client component から引くと build が落ちる（= 素通りするのは public の server component 経由の場合）。パス形そのものと gate を素通りする事実は変わらない。【過小申告】gate の穴は指摘の 2 形より広い。(1) 副作用 import `import "@/admin/…";` も from を持たないので不可視、(2) 相対 specifier（`../../(admin)/…`）も不可視、(3) @/admin/\* が指すのは (admin)/admin/(dashboard)/\_shared/\* だけなので、それ以外の admin 配下（admin ツリーの大半）は alias が無く、@/app/(admin)/… か相対でしか書けず、どちらも不可視。実効的にこの gate が守っているのは「aliased な \_shared サブツリーへの静的 from import」だけ。【補足】修正材料は repo 内に既存: \_\_tests\_\_/helpers/architecture-fs.ts:43 extractImportSpecifiers（3 形を網羅）と :73 resolveModuleSpecifier（alias 表に @/ → src/ を含む）で specifier を repo 相対パスへ解決し、着地 surface で判定すれば上記すべてを閉じられる。severity は medium 据え置き（現行違反 0 件で実害は無いが、.claude/rules/src-boundaries.md が機械強制と明言しており、gate が規約の正本であるこの repo では false-green が最も重い失敗形。かつ public-path-alias-hygiene.test.ts の docstring が「前身は別 alias 形 1 通りだけを見ており実測 4 行が素通りしていた」と同型の実発生を記録している）。

---

### F-13

**inquiry\_status\_history の append-only gate が走査範囲外（scripts/e2e）を見ておらず、走査規模の下限も持たない**

<sub>[対処の記録](2026-08-12-codebase-audit-progress.md) ／ [棄却一覧](2026-08-12-codebase-audit-refuted.md)</sub>

|        |                                                                             |
| ------ | --------------------------------------------------------------------------- |
| 深刻度 | 中                                                                          |
| 箇所   | `__tests__/unit/architecture/inquiry-status-history-append-only.test.ts:41` |
| 領域   | 検証の空振り                                                                |

#### 起きること

(1) 走査範囲: この gate は #1772 の「E2E の restore helper が inquiryStatusHistory.deleteMany を呼んで trigger に弾かれた」再発を防ぐと :37-40 で宣言しているが、glob が `e2e/**` に限られる。E2E fixture の stale 行掃除は scripts/e2e/ にも同じ形で置かれており（scripts/e2e/create-blacklist-test-user.ts:99-102 `await prisma.customer.deleteMany({ where: { userId: { in: staleIds } } });` ほか 13 ファイル）、そこへ inquiry の掃除を同じパターンで足すと gate は素通りする。実際に踏むのは E2E 実行時の trigger 拒否（integrity\_constraint\_violation）で、pre-push でも CI の Unit Tests でも捕まらず、E2E ジョブが落ちて初めて分かる。(2) 空振り: `offenders` を `toEqual([])` する（:53）だけで走査件数の下限 assert が無いため、e2e ツリーの移動・拡張子変更（`.mts` 等）・glob のタイポで 0 件走査になっても「違反なし」と区別できずに緑になる。同型の欠落が \_\_tests\_\_/unit/architecture/admin-permissions-clean-break.test.ts:35-38,86（`new Bun.Glob("**/*.{ts,tsx}").scanSync` → `expect(offenders).toEqual([])`、下限 assert 無し）にもある。

#### 直し方

(a) glob を `{e2e,scripts/e2e}/**/*.ts`（あるいは tracked file 全体から src を除いたテスト系ツリー）へ広げ、対象母集合の下限を `expect(scanned.length).toBeGreaterThan(n)` で固定する。(b) admin-permissions-clean-break.test.ts:86 の直前にも同様の下限 assert を置く。(c) 恒久対策として eslint-rules/gate-scan-must-not-be-silently-empty.mjs の SCAN\_CALLEES に `scanSync` を足す（重複している "globSync" の 1 つと差し替えれば増えない）。そうすれば手運用に頼らず同型の欠落が自動で落ちる。

#### 該当箇所

```
const glob = new Bun.Glob("e2e/**/*.ts");
const offenders = [...glob.scanSync(process.cwd())]
.filter((rel) =>
/inquiryStatusHistory\s*\.\s*(delete|deleteMany|update|updateMany|upsert)\s*\(/u.test(
readFileSync(join(process.cwd(), rel), { encoding: "utf8" }),
),
)
```

#### 到達経路

経路A（走査範囲の穴）: \_\_tests\_\_/unit/architecture/inquiry-status-history-append-only.test.ts:37-40（gate が #1772 の「E2E helper が inquiry\_status\_history を mutate しない」を守ると宣言）→ :41 `new Bun.Glob("e2e/**/*.ts")` → :42 `scanSync(process.cwd())` で e2e/ ツリー（tracked 103 ファイル）だけが filter に入る → scripts/e2e/ の 14 ファイルは母集合に入らない → scripts/e2e/create-blacklist-test-user.ts:95-103 と同じ入口 purge 形に `prisma.inquiryStatusHistory.deleteMany(...)` を足しても :44 の正規表現に到達しない → :53 `expect(offenders).toEqual([])` が緑 → 代替 gate も無い（\_\_tests\_\_/unit/architecture/e2e-fixture-purge-scope.test.ts:51-53 は `.user.deleteMany(`+email prefix のみ、e2e-fixture-singleton-writes.test.ts:35 / e2e-fixture-space-ownership.test.ts:71-77 は別 invariant）→ 実際に落ちるのは E2E 実行時、prisma/baseline/invariants.sql:583 の trigger prevent\_inquiry\_status\_history\_mutation が bypass GUC 非設定のまま integrity\_constraint\_violation を投げる時点（scripts/ 配下に bypass GUC 使用は 0 件。設定しているのは src/shared/domain/data-retention/commands.ts:229 の purge のみ）。同型の実害の前例は \_\_tests\_\_/unit/architecture/e2e-fixture-space-ownership.test.ts:65-68 に記録済み。 経路B（空振り）: 同 :41-42 で glob がタイポ／e2e ツリー移動／拡張子変更により 0 件を返す（Bun.Glob().scanSync は非存在パターンで throw せず空配列）→ :43-51 の filter/map が空 → :53 `toEqual([])` が緑で「違反なし」と区別不能 → ESLint の保護も発火しない: eslint.config.mjs:594,597 で rule 適用 → eslint-rules/gate-scan-must-not-be-silently-empty.mjs:62 `SCAN_CALLEES = new Set(["readdirSync", "globSync", "globSync"])` に scanSync 無し → :128-132 の `CallExpression` で `scansDirectory` が立たない → :163 で早期 return → 無報告のまま下限 assert 欠落が固定される。

#### 既存の検査

部分的。走査 gate の空振りは ESLint ルール local/gate-scan-must-not-be-silently-empty が担当だが、SCAN\_CALLEES が readdirSync / globSync だけで Bun.Glob().scanSync() を認識しない（.claude/rules/architecture-gates.md にもこの限界は明記され「下限 assert を自分で置くこと」と手運用に委ねられている）。architecture 配下 175 gate を機械的に走査したところ、scanSync 系で下限 assert を欠くのはこの 2 本だけ。DB 側は trigger prevent\_inquiry\_status\_history\_mutation が実行時に必ず拒否するのでデータ破損は起きない。

#### 反証官による訂正

記述はほぼ正確。訂正・補足は 4 点（いずれも結論を変えない）。(1) 行番号の微差: eslint.config.mjs の `files:` は 594 行、rule 指定は 597 行（指摘の 592-599 はブロック範囲としては正しい）。(2) 指摘が引用した `SCAN_CALLEES = new Set(["readdirSync", "globSync", "globSync"])` は逐語で実在するが、`"globSync"` が 2 回入っている点自体が rule 側の潜在バグ（Set なので実効エントリは 2 個）。scanSync 未対応に加えてこの重複も併記できる。(3) 「データ破損は起きない」の根拠はもう一段強い: scripts/ 配下に bypass GUC (`myrrh.inquiry_status_history_mutation_bypass`) の使用は 0 件で、設定箇所は src/shared/domain/data-retention/commands.ts:229 の purge だけ。よって scripts/e2e から mutate しても trigger（prisma/baseline/invariants.sql:583）が必ず拒否し、\_\_tests\_\_/integration/prisma/append-only-enforcement.test.ts:264,273 が実 DB で固定している。(4) 現時点で違反は 0 件（e2e/helpers/inquiry-fixture.ts:42 は inquiryReply.deleteMany のみで、:28 に bypass GUC を E2E から使わない旨のコメントあり）。したがってこれは live bug ではなく gate のカバレッジ欠落であり、depth としては medium が妥当（実害は E2E ジョブの遅い赤で、correctness/本番データには波及しない）。

---

### F-14

**use-server gate は「先頭に必ず directive がある」前提で母集合を作るため、docstring を先頭に置いた "use server" ファイルが丸ごと検査対象から消える**

<sub>[対処の記録](2026-08-12-codebase-audit-progress.md) ／ [棄却一覧](2026-08-12-codebase-audit-refuted.md)</sub>

|        |                                                             |
| ------ | ----------------------------------------------------------- |
| 深刻度 | 中                                                          |
| 箇所   | `__tests__/unit/architecture/use-server-exports.test.ts:41` |
| 領域   | gate 本体                                                   |

#### 起きること

`src/app/(admin)/admin/(dashboard)/_shared/actions/customer.ts` の先頭に、このリポジトリで一般的な JSDoc（例: `/**\n * 顧客 Server Actions。\n */`）を足して `"use server"` をその下へ移す。ECMAScript の Directive Prologue はコメントを跨いで成立するので Next.js 16.3.0 / SWC は依然この file を Server Action file として扱う。しかし `isUseServerFile` は `source.trimStart().slice(0, 40)` が `"use server"` で始まることを要求するため、head は `/**\n * 顧客 Server Ac…` になり false を返す。この file は `files` から落ち、続く「every export is an async function」テストは一切見なくなる。その状態で `export const ANONYMIZED_CUSTOMER_FIELDS = [...]`（2026-07-30 に実際に起きた欠陥そのもの）を足すと、gate は緑・`next build` も緑・unit も緑のまま本番へ出て、そのファイル内の Server Action が全て `A "use server" file can only export async functions, found object.` で 500 になる。

#### 直し方

`isUseServerFile` を head 一致ではなく、コメント除去後の最初の statement が directive であるかで判定する（`typescript` の `createSourceFile(...).statements[0]` は既に他 gate が使っている）。最低限でも `/^\s*(?:\/\*[\s\S]*?\*\/|\/\/[^\n]*\n|\s)*["']use server["']/u` へ広げる。合わせて、実際に「先頭コメント + use server」の fixture を 1 本置いて母集合に入ることを固定する。

#### 該当箇所

```
const head = source.trimStart().slice(0, 40);
```

#### 到達経路

\_\_tests\_\_/unit/architecture/use-server-exports.test.ts:60-62（describe 本体で母集合構築 `collectSourceFiles(SRC_ROOT).filter((file) => isUseServerFile(readFileSync(file,"utf8")))`） → 同:40-43 `isUseServerFile` が `source.trimStart().slice(0,40)` を取り `head.startsWith('"use server"')` を要求 → 対象ファイルの先頭が `/**` の場合 head は `/**\n * …` になり false → 同:60 files から除外 → 同:64-67 空振り検査は `expect(files.length).toBeGreaterThan(50)` のみで、実測 91 件のため最大 41 件欠落しても緑 → 同:69-87 違反収集ループが当該ファイルを一度も readFileSync しない → 同:89 `expect(violations).toEqual([])` が緑。／前提の実証: src/app/(admin)/admin/(dashboard)/\_shared/actions/customer.ts:1-3 は現在 `"use server";` の直後に JSDoc があり順序入替だけで条件成立。コメント後ディレクティブがツールチェーンで有効なことは src/app/(admin)/admin/(dashboard)/\_shared/hooks/use-filter-params.ts:1-12（JSDoc → `"use client";` → `useRef`/`useEffect` import）を含む 128 ファイルの本番稼働で確定。／代替検出が無いことは \_\_tests\_\_/unit/architecture/assert-customer-active-server-actions.test.ts:193-197（`(public)` 限定）と eslint-rules/gate-scan-must-not-be-silently-empty.mjs:34-52（下限 assert の存在のみ判定）で確認。

#### 既存の検査

この形を捕まえる別経路は無い。`eslint.config.mjs` / `eslint-rules/` に use server 用ルールは 1 件も無い（grep 済み）。同じ "use server" file を扱う `assert-customer-active-server-actions.test.ts:197` は `/["']use server["']/u.test(source)` とファイル全体を見るので影響を受けないが、対象は `(public)` 配下のみで admin actions を見ない。`local/gate-scan-must-not-be-silently-empty` は下限 assert があるため何も言わない。実証: `src/app/(admin)/.../lexical/**` などで既に 128 ファイルが `"use client"` の前にコメントを置いており（本番稼働中）、この書き方がツールチェーンで通ることと、リポジトリの慣習であることの両方が裏取りできる。

#### 反証官による訂正

指摘の事実関係に誤りは無く、数値（91 件 / 128 件 / 閾値 50）はすべて実測と一致した。深刻度のみ high → medium へ補正する。理由 3 点。(1) 潜在的であり現時点で該当は 0 件 — 実在する 91 件の `"use server"` ファイルは全てディレクティブが先頭で、gate は現在正しく機能している。事故化には「ディレクティブをコメントの下へ移す」＋「非 async export を足す」という複合編集が要る。(2) 指摘が触れていない限定条件がある: 黙るのは**部分的な欠落だけ**。formatter 等で一括して順序が変わり 91→0 のような大量欠落が起きた場合は `toBeGreaterThan(50)` が落ちて検知される。silent なのは欠落が 41 件以下のときに限られる。(3) 一方で severity を low にできない補強材料もある: 当該 gate が守る欠陥クラスは 2026-07-30 に実際に本番 500 を出しており（docstring 20-21 行）、代替検出経路が本当に存在しない。加えて事故当該ファイル customer.ts 自身が「ディレクティブ直下に JSDoc」という、順序を入れ替えたくなる形をしている。／指摘への追加情報 2 点。(a) 「この形を捕まえる別経路は無い」は正しいが、\_\_tests\_\_/unit/architecture/next-runtime-db-boundaries.test.ts:34 と :44 も同一の `^\s*` 前提を持ち、128 件の comment-before-"use client" ファイルを client component と認識できていない。ただしそちらは「client と判定されない → server 扱いで DB 境界検査の対象になる」＝厳しい側へ倒れるため fail-safe で、別欠陥ではない。(b) 修正するなら判定を先頭コメントの読み飛ばし付きに変えるのが素直だが、.claude/rules/architecture-gates.md の「粗いなら粗いと docstring に書く」に従い、最低限 head 40 字ヒューリスティックの限界を docstring に明記する（現状 6-24 行は一切触れていない）だけでも規約違反は解消する。

---

### F-15

**sanitize-css.test.ts が「無効な CSS プロパティ名」を固定していて、透過ヘッダー時の main の負マージンが本番で効いていない**

<sub>[対処の記録](2026-08-12-codebase-audit-progress.md) ／ [棄却一覧](2026-08-12-codebase-audit-refuted.md)</sub>

|        |                                                         |
| ------ | ------------------------------------------------------- |
| 深刻度 | 中                                                      |
| 箇所   | `__tests__/unit/shared/lib/csp/sanitize-css.test.ts:21` |
| 領域   | テストの空振り（lib）                                   |

#### 起きること

管理画面で ヘッダー背景モード = TRANSPARENT にすると、src/app/(public)/layout.tsx:367 が `marginTop: "calc(var(--header-height, 0px) * -1)"` を buildDataStyleRule に渡す。buildDataStyleRule (src/shared/lib/csp/sanitize-css.ts:61-65) はキーを一切変換せずそのまま連結するので、NonceStyleBlock が実際に \<style\> に出力するのは `[data-style-id="main-shell"] { --container-site: …; marginTop: calc(var(--header-height, 0px) * -1); }`。CSS のプロパティ名はハイフン形（margin-top）しか解釈されないため、ブラウザはこの宣言を丸ごと破棄する。結果 \<main\> に負のマージンが付かず、(1) hero が透過ヘッダーの下に潜り込まなくなり、(2) それを打ち消す目的の src/app/(public)/\_styles/public.css:317-318 の `margin-top: var(--header-height, 64px)` だけが残るため、非 hero ページの先頭にヘッダー高さぶんの空白帯が出る。public.css:312 のコメント自身が『Hero sections extend behind the transparent header via main's negative margin』と前提を明記しているので、設計意図と実挙動が食い違っている。テストはこの壊れた出力を `toContain("marginTop:")` で固定しているため、直しても直さなくても緑のまま。

#### 直し方

src/app/(public)/layout.tsx:367 のキーを "margin-top" にする（DeclarationsSchema は sanitize-css.ts:27 で既に "margin-top" を許可済み）。同時に z.literal("marginTop") の許可を外し、本テストの期待値を `expect(rule).toContain("margin-top: calc(")` に変えて、camelCase が二度と通らない形に固定する。

#### 該当箇所

```
expect(rule).toContain("marginTop:");
```

#### 到達経路

管理画面で ヘッダー背景 = TRANSPARENT に設定 → src/app/(public)/layout.tsx:346 MainShellResolved → src/app/(public)/layout.tsx:357-358 isTransparent === true → src/app/(public)/layout.tsx:364-369 buildDataStyleRule(MAIN\_SHELL\_STYLE\_ID, { "--container-site": …, marginTop: "calc(var(--header-height, 0px) \* -1)" }) → src/shared/lib/csp/sanitize-css.ts:54 DeclarationsSchema.safeParse が z.literal("marginTop")(同 27 行) で通過 → src/shared/lib/csp/sanitize-css.ts:61-65 キー無変換で `marginTop: calc(var(--header-height, 0px) * -1);` を連結 → src/app/(public)/layout.tsx:373 NonceStyleBlock → src/shared/lib/csp/nonce-style.tsx:30 dangerouslySetInnerHTML で \<style\> に注入（同 sanitize-css.ts:102 は文字列を素通し） → ブラウザが未知プロパティ `marginTop` の宣言のみを破棄（同ブロックの --container-site は有効） → src/app/(public)/layout.tsx:97-103 の \<main id="main-content" data-header-transparent\> に負マージンが付かない → (a) sticky ヘッダー(src/app/(public)/\_shared/components/layouts/site-header.tsx:433)が in-flow で高さを占有したまま、src/app/(public)/\_styles/public.css:332-333 の --hero-header-offset: var(--header-height) が src/app/(public)/\_components/HeroSection.tsx:114 ほか 4 箇所で pt- として加算され、hero がヘッダー高さ 2 つぶん下へ押し下がる（ヘッダー背後には hero ではなくページ背景が見える） / (b) 非 hero ページでは src/app/(public)/\_styles/public.css:316-318 の margin-top: var(--header-height, 64px) だけが残り、先頭にヘッダー高さぶんの空白帯が出る

#### 既存の検査

リポジトリ全体で main-shell の CSS を検証しているのは本テスト 1 本だけ（\_\_tests\_\_ 内の marginTop / main-shell の全ヒットが sanitize-css.test.ts:16-21）。sanitizeCss も DeclarationsSchema を通すだけで CSS の妥当性は見ないため、type-check / ESLint / 他の unit テストも検知しない。

#### 反証官による訂正

機構の説明は正確だが、深刻度と「テストが固定している」の 2 点を補正する。(1) high → medium。影響は公開サイトの見た目のみで、セキュリティ・データ整合性・可用性に波及しない。しかも既定は SOLID（prisma/schema.prisma:1780）で、管理画面で TRANSPARENT を選んだ場合にだけ顕在化する非既定経路。修正も layout.tsx:367 のキーを `marginTop` → `"margin-top"` に変えるだけで済む（DeclarationsSchema は sanitize-css.ts:27 で `z.literal("margin-top")` を既に許可しており、スキーマ変更は不要）。(2)「テストがこの壊れた出力を固定しているため直しても直さなくても緑」— 後半は正しいが前半は不正確。sanitize-css.test.ts:16-23 は自前のオブジェクトリテラルを buildDataStyleRule に渡すだけで layout.tsx を参照していないので、layout.tsx を直してもこのテストは無関係に緑のまま通る（修正を妨げない）。このテストが固定しているのは「allowlist が camelCase を通すこと」であって「本番の出力」ではない。したがって区画名の "tests-vacuity" は妥当だが、欠陥の所在はテストではなく呼び出し側（layout.tsx:367）で、テストは単に検知力が無いだけ。(3) 症状の記述に 1 点追加がある。指摘は「hero が潜り込まなくなる」としているが、実際にはそれに加えて public.css:329-333 の `--hero-header-offset: var(--header-height)` が 4 つの hero（HeroSection.tsx:114 / StandardHeroSection.tsx:241,301,381 / MediaHero.tsx:113）で pt- として加算されるため、ヘッダー高さが二重計上され、public.css:320-328 のコメントが SOLID 側について警告しているのと同型の「死んだ空白帯」が hero 上部にも出る。(4) 既存カバレッジの申告は実測で裏付けが取れた（\_\_tests\_\_ 内の main-shell ヒットは sanitize-css.test.ts:17 のみ、e2e/ に TRANSPARENT / data-header-transparent の参照は 0 件）。

---

### F-16

**公開ページ E2E 4 本が全 CI ジョブで 1 テストも実行されない（surface 条件と実行 env の食い違い）**

<sub>[対処の記録](2026-08-12-codebase-audit-progress.md) ／ [棄却一覧](2026-08-12-codebase-audit-refuted.md)</sub>

|        |                                       |
| ------ | ------------------------------------- |
| 深刻度 | 中 ／ 実コード確認済                  |
| 箇所   | `e2e/public/spaces-filters.spec.ts:6` |
| 領域   | 検証の空振り                          |

#### 起きること

広域 E2E を回す唯一の step は .github/workflows/ci.yml:571-578 の `run: bunx playwright test --fail-on-flaky-tests` で、その env は `APP_SURFACE: admin`。よって file スコープの test.skip が必ず真になり、spaces-filters.spec.ts / events-filters.spec.ts / homepage.spec.ts / mobile/public-mobile.interactions.spec.ts の全テストが skip される。他の playwright 起動は ci.yml:422・449（`--project=chromium-smoke` = e2e/smoke/\*.smoke.spec.ts のみ）と ci.yml:964/966（`--project=chromium-visual`）だけなので、この 4 本はどのジョブでも実行されない。しかも skip 理由は事実に反する: src/proxy.ts:65-70 の `isBlockedOnPublicSurface` は `if (serverEnv.APP_SURFACE !== "public") return false;` で admin surface では何もブロックせず、admin で特別扱いされるのは src/proxy.ts:474 の `pathname === "/"` リダイレクトだけ。spaces-filters は urls.spaces（26,37,46,58,64 行）、events-filters は urls.events（23,36,46,54,64,71 行）しか踏まず `/` を触らないため、admin surface でも実行可能。具体例: `spaceSearchParamsParsers` の `minCapacity` / `sort` / 空き時間帯クエリの URL→UI 反映が壊れても（spaces-filters.spec.ts:37,46,58 が捕まえるはずの回帰）、CI は全ジョブ緑のまま本番へ出る。

#### 直し方

`/` を踏まない spec（spaces-filters / events-filters）の file スコープ skip を外し、`/` を踏む個所だけ route 単位で skip する（e2e/a11y/axe-public-pages.spec.ts:80-85 と e2e/public/responsive-shell.spec.ts:76 が既にその形）。`/` 依存の homepage.spec.ts と public-mobile.interactions.spec.ts は、smoke ジョブと同じく APP\_SURFACE=public を渡す E2E step（または `--project=chromium,chromium-mobile,webkit-mobile` の public surface 実行）を ci.yml に足して実行経路を与える。あわせて「file スコープ test.skip を持つ spec は必ずどこかの CI step の APP\_SURFACE で真にならない」ことを検査する gate を足すか、少なくとも spec が 0 テストで終わったら失敗させる。

#### 該当箇所

```
const appSurface = process.env["APP_SURFACE"] ?? "admin";

test.skip(
appSurface !== "public",
"Public /spaces facet filter spec is served only on public surface.",
);
```

#### 到達経路

.github/workflows/ci.yml:510-513（e2e-tests job の if: schedule / workflow\_dispatch）→ .github/workflows/ci.yml:571 `- name: Run E2E tests` → :572 `run: bunx playwright test --fail-on-flaky-tests`（--project 指定なし）→ :578 `APP_SURFACE: admin` → playwright.config.ts:6 `process.env["APP_SURFACE"] ??= "admin"`（既に admin なので上書きされない）→ playwright.config.ts:164-169 project `chromium` の testMatch `/e2e\/public\/.*\.spec\.ts/` が e2e/public/spaces-filters.spec.ts をロード → e2e/public/spaces-filters.spec.ts:4 で `appSurface === "admin"` → :6-9 の file スコープ `test.skip(appSurface !== "public")` が真 → :22-79 の 5 test すべて skip、job は exit 0。同経路で e2e/public/events-filters.spec.ts:6-9（6 test）、e2e/public/homepage.spec.ts:7-10、および playwright.config.ts:171-190 の chromium-mobile / webkit-mobile 経由で e2e/mobile/public-mobile.interactions.spec.ts:6-9 も skip。公開 surface で走る他ジョブは ci.yml:422+427（--project=chromium-smoke / e2e/smoke/\*.smoke.spec.ts）と ci.yml:964-966+972（--project=chromium-visual / e2e/visual/\*.spec.ts）だけで、いずれの testMatch にもこの 4 本は含まれない → どの CI ジョブでも 1 test も実行されない。

#### 既存の検査

none。\_\_tests\_\_/unit/architecture/ 全 175 gate を `test.skip|describe.skip|skip(` で grep したが 0 件で、spec の skip を監視する gate は存在しない。\_\_tests\_\_/unit/architecture/e2e-public-url-fixtures.test.ts は urls 定数に対応する page.tsx の実在（:53-61）を見るだけ、e2e-public-responsive-a11y-coverage.test.ts は spec 本文に `urls.<key>` という文字列が出るか（:44-52）を見るだけで、どちらも実行有無を見ない。e2e/smoke/spaces.smoke.spec.ts は到達性 smoke で facet フィルタを検証しない。

#### 反証官による訂正

2 点訂正する。

(a) 「skip 理由が事実に反する」は 4 本中 2 本にしか当てはまらない。e2e/public/homepage.spec.ts は全 goto が `urls.home`（e2e/fixtures/test-data.ts:21 で "/"）、e2e/mobile/public-mobile.interactions.spec.ts:35 も `urls.home` だけで、src/proxy.ts:474 `if (serverEnv.APP_SURFACE === "admin" && pathname === "/") return NextResponse.redirect(new URL("/admin", req.url));` により admin surface では本当に実行不能。この 2 本の skip 理由（"Public homepage root is served only on public surface."）は正しく、非実行の原因は「skip 条件の誤り」ではなく「公開 surface で広域 E2E を回すジョブが 1 つも無いこと」。指摘の見出し「surface 条件と実行 env の食い違い」が妥当なのは spaces-filters.spec.ts と events-filters.spec.ts の 2 本（それぞれ /spaces・/events しか踏まない）に限られる。

(b) 深刻度は high ではなく medium。e2e-tests job は ci.yml:510-513 の `if: github.event_name == 'schedule' || (workflow_dispatch && inputs.run_full_ci)` で nightly / 手動 opt-in のみ、PR では起動しない。必須 check は .github/branch-protection.json:10 の "Smoke E2E (critical path)" 1 本だけで e2e-tests は含まれない。したがって「skip されなければ merge を止められたはずの回帰」は存在せず、失われているのは nightly の検知信号のみ。「CI は全ジョブ緑のまま本番へ出る」は事実だが、これは PR 上では広域 E2E spec 全般に等しく当てはまる性質で、この 4 本固有の悪化ではない。ただし gate-vacuity としては真正（spec 4 本・計 20 前後の test が local 既定含めどこでも 1 度も走らない）で、監視する gate も存在しない。

---

### F-17

**seed の partial unique probe 検査が findFirst 限定 — 元の欠陥そのものである findUnique 形が lint を素通りする**

<sub>[対処の記録](2026-08-12-codebase-audit-progress.md) ／ [棄却一覧](2026-08-12-codebase-audit-refuted.md)</sub>

|        |                                                         |
| ------ | ------------------------------------------------------- |
| 深刻度 | 中                                                      |
| 箇所   | `eslint-rules/seed-respects-unique-constraints.mjs:460` |
| 領域   | gate（seed / E2E fixture）                              |

#### 起きること

この rule の不変条件 2 は「partial unique を持つ model の存在判定は、その述語を同じ値で含める」。ところが probe 検査に入るのは `call.method === "findFirst"` のときだけ。`prisma/seed.ts:3926-3932` のコメントが記録しているとおり、元の欠陥は `findUnique({ where: { slug } })` だった。生成 client の `FaqCategoryWhereUniqueInput`（generated/prisma/models/FaqCategory.ts:276-291）は partialIndexes preview により `slug` と `order` を単独 unique キーとして受け付けるので、seedFaq の probe を `const faqCategory = await prisma.faqCategory.findFirst({ where: { slug: category.slug, deletedAt: null } });` から `const faqCategory = await prisma.faqCategory.findUnique({ where: { slug: category.slug } });` に戻すと ESLint は緑のまま通る。実 DB にソフトデリート済みの同 slug 行があると、`faq_categories_slug_active_key`（`where: { deletedAt: null }`）の母集合外の行を「存在する」と判定して create をスキップし、新品でない DB で FAQ カテゴリーが欠けたまま seed が完走する。`findMany` / `count` / `upsert.where` も同様に検査されない。

#### 直し方

checkProbe の入口を `new Set(["findFirst", "findFirstOrThrow", "findUnique", "findUniqueOrThrow", "findMany", "count"])` に広げ、eslint-seed-unique-rule.test.ts に「findUnique で述語が抜けている形が missingPredicate になる」見本テストを追加する（`.claude/rules/architecture-gates.md` の「gate に元の欠陥の形を入れる」に相当）。

#### 該当箇所

```
if (call.method === "findFirst") {
```

#### 到達経路

eslint.config.mjs:453 (rule scoped to prisma/seed.ts) -\> eslint-rules/seed-respects-unique-constraints.mjs:380 CallExpression -\> :381 readPrismaCall resolves {model:"FaqCategory", method:"findUnique"} -\> :384 not deleteMany -\> :455 WRITE\_METHODS (:56 = create/createMany/upsert) does not contain findUnique -\> :460 `call.method === "findFirst"` is false -\> checkProbe (:572) never runs, so invariant 2 (:38-41) is unenforced. Type layer does not stop it: generated/prisma/models/FaqCategory.ts:291 `AtLeast<{...}, "id"|"slug"|"order">` accepts {slug}. Runtime does not stop it: Prisma 7.9.1 compiles prisma.faqCategory.findUnique({where:{slug}}) to `SELECT ... FROM "public"."faq_categories" WHERE ("public"."faq_categories"."slug" = $1 AND 1=1) LIMIT $2 OFFSET $3` — no `deleted_at IS NULL`, identical in shape to the findUnique-by-id control — so the probe queries outside the population of faq\_categories\_slug\_active\_key (prisma/schema.prisma:1643). Wrong result: a soft-deleted row sharing the slug satisfies the probe, prisma/seed.ts:3934 `if (!faqCategory)` is false, the create is skipped, and the FAQ category is missing while seed exits 0 on a non-fresh DB. Already live and unchecked today, same shape: prisma/seed.ts:4849 and :4895 `prisma.event.findUnique({where:{slug}})` vs events\_slug\_active\_key (prisma/schema.prisma:2555), and prisma/seed.ts:5114 `prisma.space.findUnique({where:{slug: REVIEW_E2E_SPACE_SLUG}})` vs spaces\_slug\_active\_key (prisma/schema.prisma:690, predicate isActive:true).

#### 既存の検査

`__tests__/unit/architecture/eslint-seed-unique-rule.test.ts` の probe 系テスト（line 90-98 / 462-493）はすべて `findFirst` の合成コードのみ。`findUnique` の fixture は 1 件も無い。

#### 反証官による訂正

Severity confirmed at medium, not adjusted. The finding is accurate and, on one point, understated; two framings need correcting.

UNDERSTATED: it presents the gap as a hypothetical regression ("revert seedFaq to findUnique and lint stays green"). The unchecked shape is already present in live code — prisma/seed.ts:4849, :4895 (event.findUnique by slug) and :5114 (space.findUnique by slug), all against partial uniques (events\_slug\_active\_key, spaces\_slug\_active\_key). These are real call sites the gate is silent about right now, not a future what-if. I verified each is lint-green by running the rule on those exact shapes.

WHAT KEEPS IT AT MEDIUM RATHER THAN HIGHER: the blast radius is bounded. The rule is scoped to prisma/seed.ts (eslint.config.mjs:453), and seed does not run in deployed processes (the APP\_SURFACE safety guard noted in CLAUDE.md), so the worst case is a local or E2E database seeded with a missing/incorrect fixture and an exit-0 seed — no production or user-facing path. The FAQ path that motivated the rule is currently correct. This is a gate-coverage hole, not a live production defect.

WHAT KEEPS IT FROM BEING LOWER: the defect this rule exists to prevent actually happened (recorded at prisma/seed.ts:3926-3929, Round-5 Finding #18), and the gate does not detect that defect's original shape — precisely the anti-pattern the repo has already written down. The rule's own error messages (:360-363) hardcode "{{model}}.findFirst", advertising narrower coverage than the docstring invariant at :38-41 claims, so a reader of the docstring will over-trust it. Closing this is in-policy under .claude/rules/architecture-gates.md: it extends an existing gate against a defect that actually occurred, rather than adding a new gate speculatively.

ONE CLAIM I HAD TO SETTLE MYSELF RATHER THAN ACCEPT: the finding asserts the runtime consequence without proving Prisma fails to inject the index predicate. Had Prisma injected it, findUnique-by-slug would be safe and the entire finding would collapse to a style preference. It does not inject it — verified by running the real generated client against a recording driver adapter with no database: findUnique on a partial unique compiles to `WHERE ("slug" = $1 AND 1=1) LIMIT $2`, the same degenerate predicate as findUnique-by-primary-key. That is the load-bearing fact, and it holds.

MINOR: the finding cites generated/prisma/models/FaqCategory.ts:276-291 for the WhereUniqueInput; the type opens at :276 and the AtLeast key union is on :291, so the range is right.

---

### F-18

**/access とカスタムページは Cache-Tag を 1 つも出さないため、メンテナンスモード等の site-wide 無効化が CDN edge に届かない**

<sub>[対処の記録](2026-08-12-codebase-audit-progress.md) ／ [棄却一覧](2026-08-12-codebase-audit-refuted.md)</sub>

|        |                      |
| ------ | -------------------- |
| 深刻度 | 中                   |
| 箇所   | `next.config.ts:243` |
| 領域   | キャッシュ           |

#### 起きること

管理画面で「メンテナンスモード ON」を保存すると updateMaintenanceSettings が invalidateSiteWideCache(CACHE\_TAGS.LAYOUT\_SETTINGS) を呼び、CDN 側は layout-v1 を purge する。しかし layout-v1 を載せているのは headers() に列挙された source（/、/about、/blog/:path\*、/category、/tag、/spaces、/news、/events、event detail、/faq、/terms）だけで、実在する公開ルート /access（src/app/(public)/access/page.tsx）と catch-all の全カスタムページ（src/app/(public)/\[...segments\]/page.tsx）には Cache-Tag ヘッダーが一切付かない（blanket /:path\* は Cache-Control のみ、next.config.ts:243-249）。結果その 2 種は s-maxage=3600 + stale-while-revalidate=3600 の間、通常サイトを edge から配信し続け、最大 2 時間メンテナンス画面にならない。同じ経路で navigation / announcement-bar / cookie-consent / analytics-config / feature-modules / SEO 設定など全 site-wide 変更もこれらのページにだけ反映されない（例: 機能モジュール OFF にしたのに /access のヘッダーだけ無効機能へのリンクが残る）。

#### 直し方

headers() に /access と catch-all カスタムページ用の source を追加し、joinWithSiteWide(\[\]) で SITE\_WIDE\_CDN\_TAGS 全量を emit する（catch-all は既存の EVENT\_PUBLIC\_DETAIL\_HEADER\_SOURCE と同じ negative-lookahead 方式で、列挙済み public prefix を除いた 1 セグメント source を定義する）。blanket 側に Cache-Tag を足す案は不可 — private blocklist は Cache-Control しか上書きしないため Cache-Tag が PII パスへ継承される（next.config.ts:313-317 のコメント通り）。併せて emission gate に「(public) 配下の page.tsx が示す公開ルートのうち PRIVATE\_NO\_TAG\_PREFIXES に該当しないものは必ず Cache-Tag を持つ」という判定を足し、ルート追加時に落ちるようにする。

#### 該当箇所

```
source: "/:path*",
headers: [
{
key: "Cache-Control",
value:
"public, max-age=0, must-revalidate, s-maxage=3600, stale-while-revalidate=3600",
```

#### 到達経路

src/app/(admin)/admin/(dashboard)/\_shared/actions/settings/other.ts:82 invalidateSiteWideCache(CACHE\_TAGS.LAYOUT\_SETTINGS)（cdnUrlPurge 未指定） → src/shared/lib/cache/site-wide.ts:71 updateTag → :73 skipCdnPurge 無しで通過 → :75 translateToCdnTags → src/shared/lib/constants/cdn-cache-tags.ts:137 LAYOUT\_SETTINGS→layout-v1 → site-wide.ts:78 queueTagPurge(layout-v1, sitemap-v1) → next.config.ts:242-251 blanket /:path\* が Cache-Control のみ・next.config.ts:256-312 の Cache-Tag source 群に /access も catch-all も不在 → 一方 terraform/cloudflare\_rulesets.tf:100 の cache rule は /access・/\<custom-slug\> を cacheable に含む（除外 prefix に無い） → 読み側 src/app/(public)/layout.tsx:420 MaintenanceGate → src/app/(public)/\_shared/components/maintenance-gate.tsx:38 getMaintenanceSettings（src/shared/domain/settings/queries/site.ts の cacheTag(LAYOUT\_SETTINGS)）は origin では新値を返すが、src/app/(public)/access/page.tsx:72 と src/app/(public)/\[...segments\]/page.tsx の edge 上の応答は layout-v1 を持たないため purge 対象にならず、s-maxage=3600 + stale-while-revalidate=3600 の窓の間、メンテナンス前の通常ページを配信し続ける（誤った結果）。

#### 既存の検査

none。\_\_tests\_\_/unit/architecture/next-config-cache-tag-emission.test.ts の "every per-public-collection Cache-Tag value contains the full site-wide set" はハードコードした publicCollections 配列と / /about しか見ておらず、「public でキャッシュ可能な全ルートが Cache-Tag を持つ」ことは検証していない。src/app/(admin)/.../actions/location.ts:38 だけが purgeCloudflareDetailUrls(\["/access"\]) で個別に救済しているが（同ファイル 25-27 行のコメントが /access に Cache-Tag が無いことを自認）、site-wide 系 helper 側にその手当ては無い。src/shared/lib/cloudflare.ts:302 の purgeAllCloudflareCache は未使用で逃げ道になっていない。

#### 反証官による訂正

指摘の骨子は正確だが 3 点の誇張・不正確がある。(1)「最大 2 時間」は理論上限。stale-while-revalidate は stale を返した時点で背後 revalidate が走るため、トラフィックのあるページでは実効の乖離窓は概ね s-maxage の 1 時間 + 1 リクエスト分で、2 時間は無通信ページの worst case。(2)「catch-all の全カスタムページ」は僅かに過大。slug "home" のカスタムページは / として配信され、next.config.ts:257-259 で HOME\_PAGE\_CACHE\_TAG（site-wide 全量を含む）を持つ（pages.ts:29 が "home"→"/" に写像）。tag が無いのは / 以外のカスタム slug。(3) 影響範囲は「これらのページが一切 purge されない」ではなく「site-wide 系の変更だけが届かない」。ページ本体の内容編集は pages.ts:31 / page-section.ts:46 の URL purge で、/access の拠点情報は location.ts:38 の URL purge で edge まで届く（location.ts:26-27 のコメントが /access に Cache-Tag が無いことを自認したうえでの補償）。深刻度はデータ破損も PII 露出も無く、上限付きで自己回復する cache 整合性ギャップのため high ではなく medium が妥当。ただし公開ルート 1 系統 + CMS カスタムページ全体という範囲の広さと、gate が 1 つも無い（新ルート追加時に同じ穴が無言で増える）点で low でもない。

---

### F-19

**seedProduction の再実行が SEO 設定と送信元メール設定を管理画面編集ごと上書きする**

<sub>[対処の記録](2026-08-12-codebase-audit-progress.md) ／ [棄却一覧](2026-08-12-codebase-audit-refuted.md)</sub>

|        |                      |
| ------ | -------------------- |
| 深刻度 | 中                   |
| 箇所   | `prisma/seed.ts:488` |
| 領域   | seed                 |

#### 起きること

本番 cutover 後、管理者が /admin/settings で siteName を実社名に、footerCopyright を自社表記に直し、R2 へアップロードしたロゴを headerLogoUrl / footerLogoUrl / faviconUrl に設定し、replyToEmail に問い合わせ受付アドレスを設定する。その後スタッフを 1 名足すために `bun prisma/seed.ts --production newstaff@example.com "新スタッフ"` を実行すると、seedSettings が settingsSeo.upsert の update 経路に seoData をそのまま渡すため siteName が "Myrrh Rental Space"、siteDescription と footerCopyright が seed 文言、headerLogoUrl / footerLogoUrl が `/images/seed/logo-header.svg` `/images/seed/logo-footer.svg`、defaultOgpImageUrl が `/images/seed/ogp-default.svg`、faviconUrl が "" に戻る。同時に prisma/seed.ts:468 の settingsOrganization.upsert が update: organizationData を渡し、production では emailPlaceholders が `{ senderEmail: null, replyToEmail: null }`（prisma/seed.ts:416）なので replyToEmail が null 化する。src/shared/lib/email/send.ts:152 の `const resolvedReplyTo = payload.replyTo ?? delivery.replyToEmail ?? undefined;` により、以後の全送信メールから Reply-To ヘッダーが消え、顧客の返信が届かなくなる。公開サイトはサンプルロゴとサンプル社名で配信され続け、エラーは一切出ない。

#### 直し方

seedLocations / seedNavigation と同じ分離を入れる。`seedSettings` に reconcile 判定（`options.includeBusinessPlaceholders !== false` は既に production 判別子として存在する）を足し、settingsSeo と settingsOrganization の `update` を production では `{}` にする。併せて seed-locations-reconcile.test.ts と同型の gate を 1 本置く。

#### 該当箇所

```
update: seoData,
```

#### 到達経路

prisma/seed.ts:6342 main() → prisma/seed.ts:6300-6310 evaluateSeedSafety({argv:\["--production", email, name\]}) → prisma/seed-safety.ts:122-124 `if (mode === "production") return { ok: true, mode }`（再実行を止めるガード無し／初回と再実行を区別しない） → prisma/seed.ts:6326-6329 case "production" → seedProduction(email, name) → prisma/seed.ts:6253 `await seedSettings({ includeBusinessPlaceholders: false })` → prisma/seed.ts:383-384 includeBusinessPlaceholders=false → 分岐1: prisma/seed.ts:411-416 emailPlaceholders = `{ senderEmail: null, replyToEmail: null }` → prisma/seed.ts:418-428 organizationData → prisma/seed.ts:466-470 `settingsOrganization.upsert({ where:{id:"singleton"}, update: organizationData })` が既存行に replyToEmail=NULL を書き込む（schema.prisma:1844 `replyToEmail String? @db.VarChar(254)` = nullable のため実際に NULL 化）→ 誤った結果A: src/shared/lib/email/send.ts:152 `const resolvedReplyTo = payload.replyTo ?? delivery.replyToEmail ?? undefined;` が undefined を返し、以後の全送信メールから Reply-To ヘッダーが消える。分岐2: prisma/seed.ts:435-449 seoData → prisma/seed.ts:486-490 `settingsSeo.upsert({ where:{id:"singleton"}, update: seoData })` → 誤った結果B: admin が src/shared/domain/settings/commands/site-chrome.ts:102 で同一 singleton に保存した siteName/siteDescription/footerCopyright/headerLogoUrl/footerLogoUrl/defaultOgpImageUrl/faviconUrl が seed テンプレート値に巻き戻る。いずれもエラー・ログ・例外を一切出さない。

#### 既存の検査

\_\_tests\_\_/unit/architecture-boundaries.test.ts:1099-1101 は seedProduction が `await seedSettings({ includeBusinessPlaceholders: false });` を呼ぶことだけを固定しており、update 経路が空かどうかは見ていない。\_\_tests\_\_/unit/architecture/seed-\*.test.ts の 11 本を grep しても settingsSeo / settingsOrganization / seedSettings への言及は 0 件。ESLint の local/seed-respects-unique-constraints は一意制約だけを見るので無関係。

#### 反証官による訂正

指摘の事実主張はすべて裏取りできた（引用逐語一致、:468/:416/send.ts:152 も一致、既存カバレッジ 0 件も一致）。誤認ではなく補正が要るのは深刻度と、設計意図の切り分けの 2 点。

【深刻度を high → medium に補正】(a) 起動条件が「運用者が手動で `--production` を再実行する」ことに限定される。自動経路は無い — package.json / CI workflow / e2e / prisma.config.ts の seed 既定経路はいずれも seedDev() のみを呼び、seedProduction は完全手動コマンド。(b) 復旧が安価: 管理画面での再入力で完全に戻る。R2 上の画像実体は消えず、失われるのは URL 参照と設定文字列だけで、不可逆な損失はゼロ。(c) 検知は比較的早い — 公開サイトに "Myrrh Rental Space" とサンプルロゴが出るのは目立つ（ただし Reply-To 消失だけは無言で、顧客の返信が届かなくなるまで気づけない。ここが本件で最も陰湿な部分であり、low ではなく medium に留める理由）。(d) 先行事例の seedLocations はこれより厳密に重い（テンプレート値の書き戻しに加えて公開中の拠点が isPublished:false に落ちた）。本件は設定 singleton 2 行に閉じる。

【設計意図の切り分け — 指摘が触れていない重要な非対称性】prisma/seed.ts:411-416 の `senderEmail: null, replyToEmail: null` は **create 経路では正しく意図通り**。:407-410 のコメントが述べる意図は「架空値を本番に投入しない」であって、新規 install で null 始まりにするのは設計の通り。欠陥はこの同一オブジェクトを update にも再利用している点にあり、それによって「偽の値を入れない」という意図が「管理者が入れた実値を消す」に反転している。したがって修正は emailPlaceholders/seoData の値を変えることではなく、seedLocations:743 の `reconcileDeclaredContent` と同型の dev/prod 分岐、または settingsFeatures:458 と同型の「production では update を空にする」形にすることになる。

【指摘の記述で一点だけ弱いもの】faviconUrl が "" に戻る件は他項目より実害が軽い。prisma/seed.ts:441-444 のコメント通り、未設定時は dynamic icon Route Handler (src/app/icon/route.tsx) が ImageResponse の fallback を返すため、UX 上は常に何らかのアイコンが配信される。列も NOT NULL + DEFAULT '' で null にはならない。失われるのは admin がアップロードしたファビコンの参照のみ。

---

### F-20

**本番監査の Secret Manager 検査母集合が Cloud Run runtime map 由来で、direct DB 資格情報 `DIRECT_URL` が version 検査・per-secret IAM 検査から丸ごと外れている**

<sub>[対処の記録](2026-08-12-codebase-audit-progress.md) ／ [棄却一覧](2026-08-12-codebase-audit-refuted.md)</sub>

|        |                                                |
| ------ | ---------------------------------------------- |
| 深刻度 | 中 ／ 重複統合                                 |
| 箇所   | `scripts/audit-gcp-production-iap.ts:831`      |
| 領域   | gate（本番インフラ） / 本番 IAP 監査スクリプト |

#### 起きること

`REQUIRED_CLOUD_RUN_SECRET_ENV_REFS`(scripts/gcp-production-audit-model.ts:185-207) は 18 件で、`DIRECT_URL` を含まない（設計上 Cloud Run runtime には注入しないため）。その結果:(1) 誰かが Secret Manager の `DIRECT_URL` secret に `user:someone@gmail.com` へ `roles/secretmanager.secretAccessor` を per-secret で付与しても、`required Secret Manager accessor IAM is least privilege` は 18 件しか get-iam-policy を叩かないので永久に検出されない。同じ付与を `DATABASE_URL` にすれば検出される。project-level を見る `project IAM has no unexpected Secret Manager accessor grants`(同 script:1153) は per-secret binding を見ないので補えない。漏れるのは pooled ではなく **Neon direct host の本番 DB URL**（terraform/secrets.tf:21-23）で、全データへの読み書きに直結する。(2) rotation 後始末で `DIRECT_URL` の versions/2 を DISABLE / DESTROY しても `required Secret Manager versions are enabled`(同 script:824) は緑のまま。実際に壊れるのは次の Deploy Production の migrate-execute で、Cloud Run が instance startup に secret を解決して Job が起動不能になり（docs/gcp-production-setup.md:766）、デプロイ経路ごと停止する。

#### 直し方

audit-gcp-production-iap.ts:799 と :831 のループ母集合を `[...REQUIRED_CLOUD_RUN_SECRET_ENV_REFS, ...REQUIRED_CLOUD_RUN_MIGRATE_JOB_SECRET_ENV_REFS]` にする。あわせて gcp-production-audit-terraform-sync.test.ts に「audit の secret 母集合 ⊇ terraform/secrets.tf の `local.runtime_secrets`」を照合する assertion を足し、secrets.tf に entry を足した時点で落ちるようにする。

#### 該当箇所

```
REQUIRED_CLOUD_RUN_SECRET_ENV_REFS.map(async (ref) => {
```

#### 到達経路

package.json:45 (`gcp:audit-production-iap`) -\> scripts/audit-gcp-production-iap.ts main -\> :830-864 secretAccessorPolicyResults = Promise.all(REQUIRED\_CLOUD\_RUN\_SECRET\_ENV\_REFS.map(...)) -\> scripts/gcp-production-audit-model.ts:185-207 (18 refs, DIRECT\_URL absent) -\> `secrets get-iam-policy DIRECT_URL` never issued -\> scripts/gcp-production-audit-model.ts:693-755 readSecretManagerSecretAccessorPolicyErrors never evaluated for DIRECT\_URL -\> audit-gcp-production-iap.ts:874-880 "required Secret Manager accessor IAM is least privilege" reports errors=none while a per-secret roles/secretmanager.secretAccessor grant to an arbitrary principal on DIRECT\_URL exists. Not compensated by audit-gcp-production-iap.ts:1128-1162 -\> scripts/gcp-production-audit-model.ts:660-679 (project-level bindings only). Same shape for the version check: audit-gcp-production-iap.ts:798-828 -\> scripts/gcp-production-audit-model.ts:1231-1261 readSecretManagerVersionStateErrors never sees DIRECT\_URL:2, so a DISABLED/DESTROYED version leaves "required Secret Manager versions are enabled" green while terraform/cloud\_run\_migrate\_job.tf:85-90 still pins it.

#### 既存の検査

gcp-production-audit.test.ts:1739-1790 は auditScript に `readSecretManagerVersionStateErrors` 等の文字列が含まれることしか見ておらず、母集合の網羅性は検査していない。gcp-production-audit-terraform-sync.test.ts:106 は `versions.size === REQUIRED_CLOUD_RUN_SECRET_ENV_REFS.length` を assert するが、比較相手の `cloud_run_secret_versions` にもともと DIRECT\_URL が無いので通る。

#### 反証官による訂正

Facts check out; the severity framing does not. (1) This is a detective-control coverage gap in an operator-run script, not a production defect. scripts/audit-gcp-production-iap.ts has exactly one entry point, package.json:45; nothing under .github/ invokes it, so no CI gate regresses and no deploy path changes behaviour. It does not grant anyone access — it fails to notice a per-secret grant that a principal with Secret Manager/IAM admin must first create, and the more common drift path (`gcloud projects add-iam-policy-binding`) is still caught at :1153. (2) The rotation half of the scenario is over-weighted: disabling DIRECT\_URL:2 makes the migrate Job fail at instance startup, i.e. the next Deploy Production goes red loudly. The gap costs an advance warning, it does not create a silent failure — the opposite of the silent-success mode the design actually guards against (FORBIDDEN\_CLOUD\_RUN\_MIGRATE\_JOB\_ENV\_NAMES, model:216-230). (3) A caveat the report does not mention, which bears on the proposed fix: getExpectedSecretManagerSecretAccessorMembers (model:681-691) expects the runtime SA as an \*unconditional per-secret\* member, while secretAccessor is granted project-level only (scripts/bootstrap-terraform.sh:311-320) and per-secret Terraform bindings were removed in the F1 refactor (terraform/secrets.tf:50-52). `gcloud secrets get-iam-policy` returns the resource policy without inherited project bindings, so the per-secret check plausibly already emits "missing serviceAccount:\<runtime-sa\>" for all 18 secrets in a live run. I cannot verify live IAM state from the repo, but it means "the same grant on DATABASE\_URL would be detected" is true only in the unexpected-member direction, and simply appending DIRECT\_URL to the 18-entry array inherits the same unresolved question. (4) Minor: the cited counts are right (terraform/secrets.tf runtime\_secrets = 19 including DIRECT\_URL; REQUIRED\_CLOUD\_RUN\_SECRET\_ENV\_REFS = 18), and docs/gcp-production-setup.md:765-767 does state Cloud Run resolves secret env at instance startup.

---

### F-21

**Secret Manager accessor の期待値が三者で矛盾し、audit に従うと runtime SA の唯一の grant を剥がす手順に誘導される**

<sub>[対処の記録](2026-08-12-codebase-audit-progress.md) ／ [棄却一覧](2026-08-12-codebase-audit-refuted.md)</sub>

|        |                                            |
| ------ | ------------------------------------------ |
| 深刻度 | 中                                         |
| 箇所   | `scripts/audit-gcp-production-iap.ts:1149` |
| 領域   | 本番 IAP 監査スクリプト                    |

#### 起きること

3 つの宣言が食い違っている。(1) docs/gcp-production-setup.md:1561-1563 は監査対象 posture として「Secret Manager accessor grants are **secret-level only**: runtime secrets allow `$RUNTIME_SA` … and \*\*project-level `roles/secretmanager.secretAccessor` is absent\*\*」と書く。(2) スクリプトは上記引用のとおり project-level の runtime/build grant を **expected（正常）** として素通しする。(3) scripts/bootstrap-terraform.sh:311-315 は `gcloud projects add-iam-policy-binding … --role="roles/secretmanager.secretAccessor"` を実際に実行し、terraform/README.md:54-56 は「削除済 (2026-07-14 F1 refactor): `secret_iam.tf` — runtime-sa / build-sa への project-level `secretAccessor` binding は bootstrap の SSoT に移管」と述べる。つまりリポジトリ内に **secret-level binding を作る手段は 1 つも存在しない**（`gcloud secrets add-iam-policy-binding` は docs/ scripts/ terraform/ のどこにも無い）。それでも監査は 18 secret すべてについて secret-level の runtime member を要求する（model:681-691 / 735-741）。state 再構築や新環境で bootstrap-terraform.sh + terraform apply を正規手順どおり流すと、`gcloud secrets get-iam-policy DATABASE_URL` は空 policy を返し、"required Secret Manager accessor IAM is least privilege" が 18 件の missing で FAIL する。ここで運用者が runbook §8（「project-level は absent」）を正としてしまうと、bootstrap が付けた project-level binding を削除する — それが runtime SA の唯一の secretAccessor なので、次のリビジョンは instance startup の secret 解決に失敗して起動できない（docs/gcp-production-setup.md:755「Cloud Run resolves environment variable secrets at instance startup」）。Terraform には該当 binding の宣言が無いため apply でも復旧せず、project owner が bootstrap を再実行するまで公開・管理の両サービスが上がらない。

#### 直し方

どれが正かを 1 つ決めて 3 箇所を揃える。bootstrap が project-level SSoT である現状を正とするなら、getExpectedSecretManagerSecretAccessorMembers は secret-level を「期待」ではなく「許容しない（unexpected のみ検出）」形に変え、runbook §8 の本文と test:1430 の fixture を同時に更新する。secret-level を正とするなら、その binding を作る手順（bootstrap の section 8 か Terraform）を先に用意する。

#### 該当箇所

```
const expectedProjectSecretAccessorMembers = [
`serviceAccount:${runtimeServiceAccount}`,
`serviceAccount:${buildServiceAccount}`,
];
```

#### 到達経路

scripts/audit-gcp-production-iap.ts:830（main → REQUIRED\_CLOUD\_RUN\_SECRET\_ENV\_REFS 18 件に `gcloud secrets get-iam-policy`）→ scripts/audit-gcp-production-iap.ts:840（getExpectedSecretManagerSecretAccessorMembers）→ scripts/gcp-production-audit-model.ts:681-691（戻り値は \[runtimeMember\]、NEXT\_SERVER\_ACTIONS\_ENCRYPTION\_KEY のみ \[buildMember, runtimeMember\]）→ scripts/gcp-production-audit-model.ts:735-741（unconditionalMembers に無い → missing error。リポジトリ由来の環境では secret-level policy が空なので全 18 件 + NSAEK の build 分 = 19 件が積まれる）→ scripts/audit-gcp-production-iap.ts:874-881（addCheck "required Secret Manager accessor IAM is least privilege" が FAIL）。前提の裏付け: scripts/bootstrap-terraform.sh:311-321（project-level のみ付与）、terraform/secrets.tf:49-52（per-secret 付与は廃止）、terraform/README.md:54-59（secret\_iam.tf 削除済）。対照として project-level 側は scripts/audit-gcp-production-iap.ts:1149-1157 → scripts/gcp-production-audit-model.ts:669-678 で runtime/build を expected として通すため error にならない。旧方針が残っているのは docs/gcp-production-setup.md:1561-1564 のみ。

#### 既存の検査

\_\_tests\_\_/unit/architecture/gcp-production-audit.test.ts:1430 のテスト名は "requires Secret Manager accessor IAM to stay **secret-level** and least privilege" で、1438-1453 は `readProjectSecretManagerAccessorErrors({bindings:[{role:"roles/secretmanager.secretAccessor", members:[runtimeMember]}]})` を **第 2 引数なし**で呼び、「project-level grant must be removed for runtime」を期待する。つまりテストは runbook §8 と同じ古い方針を固定しており、スクリプトが実際に渡す引数（expectedMembers あり＝真逆の判定）は一度も実行されない。gcp-production-audit-terraform-sync.test.ts は version 番号だけを Terraform と突き合わせ、accessor member については何も見ない。

#### 反証官による訂正

深刻度 high は誇張。以下は事実誤認または過大評価。(1) 見出しの「audit に従うと runtime SA の唯一の grant を剥がす手順に誘導される」は誤り。監査は project-level の runtime/build grant を明示的に expected として通し（script:1149-1157、詳細行に `expected=...` を出力）、削除コマンド（formatSecretManagerSecretAccessorRemovalCommands, script:857-861）は secret-level の **unexpected member 限定**で、project-level binding の削除は一切示唆しない。誤誘導しうるのは docs/gcp-production-setup.md:1563-1564 の 1 節だけで、監査出力ではない。(2) 「三者で矛盾」は不正確。docs は自己矛盾しており、同一ファイルの 603-611 / 685-691 が「project-level secretAccessor は bootstrap が付与する現行設計」と明記している。script・bootstrap・terraform/README・docs の大多数が一致していて、外れているのは posture 項目 8（1561-1564）だけ。従って運用者が項目 8 だけを信じて project-level を消す、という前提はコード経路ではなく人的誤読の連鎖で、しかも監査自身の PASS 行と正面から矛盾する。「起動不能 → project owner の bootstrap 再実行まで復旧しない」という本番障害シナリオは再現経路として示せない。(3) 実害の範囲: この監査は CI に組み込まれておらず（.github 配下に `gcp:audit-production-iap` の参照ゼロ）、本番 runtime・ビルド・データには一切影響しない。read-only の手動 ops スクリプトが 1 チェック分の false FAIL を出すこと、および doc 1 節の stale が実害。(4) 「18 件の missing」は件数としては正しい（REQUIRED\_CLOUD\_RUN\_SECRET\_ENV\_REFS は model:189-206 の 18 件）が、NSAEK は build 分も加わるため error 文字列は 19 本。(5) 既存本番の実状態は確認不能（live GCP 参照が必要）。リポジトリから確定できるのは「リポジトリの provisioning 経路のみで構築した環境では当該チェックは構造的に通らない」ことまで。修正方向は project-level 設計に合わせて secret-level 期待値と docs 項目 8 を更新する側であり、per-secret binding を手で足す方向ではない（F1 closure で runner の setIamPolicy を外した設計に反する）。

---

### F-22

**build service account の project 権限検査は 2 role の denylist — roles/editor や roles/owner を足しても緑**

<sub>[対処の記録](2026-08-12-codebase-audit-progress.md) ／ [棄却一覧](2026-08-12-codebase-audit-refuted.md)</sub>

|        |                                             |
| ------ | ------------------------------------------- |
| 深刻度 | 中                                          |
| 箇所   | `scripts/gcp-production-audit-model.ts:617` |
| 領域   | 本番インフラ gate                           |

#### 起きること

デプロイが権限不足で落ちたときの定番対処として `gcloud projects add-iam-policy-binding myrrh-rental-space --member=serviceAccount:myrrh-rental-space-build@... --role=roles/editor` を実行する。readBuildServiceAccountProjectIamRoleErrors は required 2 role の存在と forbidden 2 role の不在しか見ないので、editor / owner / iam.serviceAccountAdmin / resourcemanager.projectIamAdmin / secretmanager.admin はどれも errors に出ない。監査は 'PASS build service account project-level roles are limited to Cloud Build execution' を表示し続ける。実際には main への push で WIF 経由に impersonate できるこの SA が project 全体の書き込み権を持ち、任意 image を runtime SA で Cloud Run にデプロイできる → runtime SA は project-level secretmanager.secretAccessor を持つ（scripts/bootstrap-terraform.sh:311-321）ため全 secret が読める。bootstrap-terraform.sh が『structural closure』として設計した特権分離が丸ごと無効化されているのに、それを証明するはずの gate が緑のまま。

#### 直し方

denylist を allowlist に反転する。projectIam の全 binding を走査し、build SA が保持する role が \['roles/cloudbuild.builds.builder','roles/logging.logWriter','roles/secretmanager.secretAccessor'\] の集合と完全一致しないなら error を返す。runtime SA / scheduler SA にも同型の allowlist を置く。

#### 該当箇所

```
const forbiddenBroadRoles = ["roles/iap.admin", "roles/run.admin"];
```

#### 到達経路

package.json:45 (`gcp:audit-production-iap`) → scripts/audit-gcp-production-iap.ts:1128 (`gcloud projects get-iam-policy`) → scripts/audit-gcp-production-iap.ts:1163-1167 (readBuildServiceAccountProjectIamRoleErrors 呼び出し) → scripts/gcp-production-audit-model.ts:613-617 (requiredRoles 2 件 / forbiddenBroadRoles 2 件) → :619-623 (bootstrap-terraform.sh:322-333 が付ける cloudbuild.builds.builder と logging.logWriter は存在するので missingRoleErrors は空) → :624-628 (roles/editor の binding は forbiddenBroadRoles のどちらにも一致しないので forbiddenRoleErrors も空) → :630 が `[]` を返す → scripts/audit-gcp-production-iap.ts:1168-1172 addCheck(..., true) → :1597 が `PASS build service account project-level roles are limited to Cloud Build execution` を出力し、project 全体の書き込み権を持つ build SA が「Cloud Build 実行に限定されている」と誤って報告される。

#### 既存の検査

test:439-469 の落ちる見本は iap.admin / run.admin という『実装が知っている 2 role』だけを入れており、実装の網羅性を一切問うていない。role を 1 つ足し忘れても fixture が落ちないので、denylist の穴は構造上テストで見えない。

#### 反証官による訂正

機構は実在するが high は誇張。(1) これは CI gate ではなく手動運用スクリプト (package.json:45)。どの workflow からも呼ばれておらず、grep で .github 配下に出現しない。「gate が緑のまま」は「人が走らせた audit が PASS を出す」の意味で、自動 required check が偽装されるわけではない。\_\_tests\_\_/unit/architecture/gcp-production-audit.test.ts:416-470 は純関数のテストで、本番 posture を守る gate ではない (原理的にそうなり得ない)。(2) addCheck は 51 件ではなく 45 件 (実測)。(3) audit は検知 (detection) 制御であって防止 (prevention) 制御ではなく、失敗シナリオは「project IAM admin を既に持つ人間が editor を付ける」という先行操作を前提とする。audit が見逃すのは二次的な検知漏れ。(4) ただし terraform/README.md:148-152 が break-glass での直接 grant を明示的に容認しているため、この drift を拾う仕組みはこの audit 以外に存在せず、「限定されている」と名乗る check が実際には 2 role しか見ていない点は実質的な誤った保証にあたる。修正は forbiddenBroadRoles を allowlist (build SA の project-level role は requiredRoles のみ許可) に反転させるか、少なくとも denylist であることを docstring と check 名に明記するかの二択で、いずれも小さい。

---

### F-23

**`bun run setup` の migrate deploy が破壊的 DB ガードを通らず、.env.local の本番 DIRECT\_URL に当たる**

<sub>[対処の記録](2026-08-12-codebase-audit-progress.md) ／ [棄却一覧](2026-08-12-codebase-audit-refuted.md)</sub>

|        |                              |
| ------ | ---------------------------- |
| 深刻度 | 中                           |
| 箇所   | `scripts/setup-local.ts:167` |
| 領域   | scripts 安全装置             |

#### 起きること

.env.local に本番の DIRECT\_URL が残っている開発者（assert-destructive-db-target.ts の docblock が「守るべき状況そのもの」として名指ししている状態）が、README / CONTRIBUTING が案内する `bun run setup` を実行する。import.meta.main は runSetup の前に applyEnvFile(envLocalPath) を呼び、`process.env[key] = value`（setup-local.ts:32）で DIRECT\_URL をこのプロセスの env に載せる。steps の 3 番目がその env のまま `bunx --bun prisma migrate deploy` を起動し、Prisma CLI の datasource は prisma.config.ts の resolvePrismaCliDatasourceUrl() が DIRECT\_URL を最優先で返す（prisma.config.ts:24-25）。結果、リポジトリにあって本番 \_prisma\_migrations に無い migration が全件、開発中ブランチのものも含めて本番 DB へ適用される。本番の migrate は本来 Cloud Run migrator Job だけが実行し、その CMD は `bun scripts/migration-preconditions.ts && bunx --bun prisma migrate deploy`（Dockerfile:144）でリハーサルと履歴照合を先に通し、破壊的 DDL のときは deploy-production.yml が両サービスを scaling=0 にしてから流す。setup 経路はそのどちらも通らないので、DROP COLUMN 等が計画ダウンタイム無しで本番に入り、旧 revision が壊れたスキーマを叩いて 500 になる。compose 照合（setup-local.ts:195 の targetsSetupManagedDatabase）はこの後にしか走らず、止められるのは seed だけで migration は既に適用済み。

#### 直し方

migrate step を接続先確定の後ろに移し、かつ migrate-test-db.ts の createPrismaMigrateEnv と同じく DATABASE\_URL / DIRECT\_URL を compose のターゲットに固定して spawn する（前段に `bun scripts/assert-destructive-db-target.ts` を挟むだけでも本番 Neon / Cloud SQL は弾ける）。

#### 該当箇所

```
["Applying migrations", ["bunx", "--bun", "prisma", "migrate", "deploy"]],
```

#### 到達経路

package.json:24 `"setup": "bun scripts/setup-local.ts"` → scripts/setup-local.ts:221 `import.meta.main` → :224 `ensureEnvLocal()`（既存 `.env.local` は Bun が process 起動時に自動ロード済み。:227-229 の `applyEnvFile` は再適用）→ :232 `runSetup(runInherited, captureInherited, () => process.env["DATABASE_URL"])` → :148-168 `steps` に接続先検証の分岐なし → :170-177 のループで step 3 に到達 → :167 `["bunx","--bun","prisma","migrate","deploy"]` → :53-57 `runInherited` が `env: process.env`（DIRECT\_URL を含む）で spawn → prisma.config.ts:36 `datasource.url` ← :23-25 `resolvePrismaCliDatasourceUrl()` が `process.env["DIRECT_URL"]` を最優先で返す → 本番 DB に repo の pending migration が全件適用（`Dockerfile:144` の `bun scripts/migration-preconditions.ts &&` リハーサルも、deploy-production の scaling=0 も通らない）→ 制御が setup-local.ts:191-207 に戻る → `DATABASE_URL` がローカル compose なら :195 `targetsSetupManagedDatabase` が **true** → :209 seed をローカルに実行 → :215-218 exit 0 "Local bootstrap complete."（誤った結果: 本番へ DDL 適用済みだが出力は完全な成功）

#### 既存の検査

\_\_tests\_\_/unit/architecture/destructive-db-guard.test.ts は `db:reset` / `db:push` / `db:migrate` の 3 つだけを見ており（同 66 行 `for (const name of ["db:reset", "db:push", "db:migrate"])`）、setup は対象外。\_\_tests\_\_/unit/scripts/setup-local-target.test.ts は逆に 161 行で `expect(commands.some((command) => command.includes("migrate"))).toBe(true);` と書き、接続先が TUNNELED\_PROD でも migrate が先に走る現状を固定してしまっている。scripts/migrate-test-db.ts:59-69 の createPrismaMigrateEnv は DATABASE\_URL と DIRECT\_URL の両方を明示上書きしており、対処法は既にリポジトリ内にあるが setup では使われていない。

#### 反証官による訂正

記述の事実誤認・不正確な点:

\1. **見出しの「破壊的 DB ガードを通らず」は既存不変条件の違反を含意するが、それは誤り。** `scripts/assert-destructive-db-target.ts:1-2` の docblock はこのガードの対象を「`migrate reset` / `db push`」と明示的に宣言し、gate 側 docblock（destructive-db-guard.test.ts:26-45）が `migrate dev` を追加した理由も「Prisma 公式が DB reset を伴うと書いているから」。`migrate deploy` はその破壊クラスに意図的に含まれておらず、むしろ本番の正規経路（Dockerfile:144 / .github/workflows/ci.yml:861 / scripts/migrate-test-db.ts:78）。したがって「ガードをバイパスしている」のではなく「ガードが張られていない領域」。指摘の性質は invariant 違反ではなく coverage gap。

\2. \*\*`applyEnvFile` が DIRECT\_URL を env に載せる機構だ、という説明は不正確。\*\* 失敗シナリオの前提は「`.env.local` が既に存在する」であり、その場合 `.env.local` は **Bun が process 起動時に自動ロード**している（setup-local.ts:5-7 と prisma.config.ts:4-6 が両方そう書いている）。setup-local.ts:228 の `applyEnvFile` は再適用にすぎない。到達可能性そのものは変わらない。

\3. **「止められるのは seed だけ」は、最も起きやすい変種では成り立たない。** `DIRECT_URL`=本番 / `DATABASE_URL`=ローカル compose（destructive-db-guard.test.ts:100-111 が「今回の穴そのもの」と呼ぶ形）では :195 の照合が true を返し、seed も走り、exit 0 で成功表示。何も止まらず、警告も出ない。指摘は自らの失敗シナリオを**過小評価**している。

\4. **一方で被害の記述は過大。** 「DROP COLUMN 等が本番に入り旧 revision が 500」に至るには、開発者のローカルに本番未適用の破壊的 DDL migration が pending であることが追加で必要。main と同期していれば `No pending migrations to apply.` で無害。

\5. **トリガーは repo が明示的に禁止している env 状態を要する。** `.env.example:33` は "Never point local at production Neon." と書き、DIRECT\_URL の既定値はローカル docker。`ensureEnvLocal`（setup-local.ts:43-46）の新規作成パスは常に安全で、危険なのは開発者が自分で本番 DIRECT\_URL を残したケースのみ。リモートから引ける経路も、攻撃者が関与する経路も無い。以上より high ではなく medium。

\6. **既存カバレッジの申告は正確。** destructive-db-guard.test.ts:66 の 3 スクリプト限定、setup-local-target.test.ts:161 が `migrate` 先行を固定していること、migrate-test-db.ts:59-69 の `createPrismaMigrateEnv` が DATABASE\_URL と DIRECT\_URL を両方上書きしていること（＝対処の手本が repo 内に既にある）は、いずれも実物と一致する。

---

### F-24

**デバイス編集フォームから isActive=false にしてもパスコードが失効しない（トグル経路だけが失効する）**

<sub>[対処の記録](2026-08-12-codebase-audit-progress.md) ／ [棄却一覧](2026-08-12-codebase-audit-refuted.md)</sub>

|        |                                                                               |
| ------ | ----------------------------------------------------------------------------- |
| 深刻度 | 中                                                                            |
| 箇所   | `src/app/(admin)/admin/(dashboard)/_shared/actions/smart-lock-devices.ts:107` |
| 領域   | スマートロック                                                                |

#### 起きること

Keypad が盗難・故障・撤去されたので管理者が「設定 \> SwitchBot \> デバイス登録簿」の編集ダイアログを開き、有効フラグのスイッチを OFF にして保存する（SmartLockDeviceRegistry.tsx:638-645 が同一フォーム内に isActive スイッチを描画し、smartLockDeviceFormSchema にも isActive が含まれる）。updateSmartLockDevice は isActive:false をそのまま保存するだけで revokePasscodesAfterPadDeactivated を呼ばない。一方、一覧のトグルボタン経由（toggleSmartLockDeviceActive、同ファイル:176-178）では同じ状態変化で失効が走る。編集フォーム経由で無効化した場合、発行済み CONFIRMED パスコードは物理 Keypad 上で全予約の endTime+buffer まで生き続ける。さらに顧客側は customer-passcode-queries.ts:161-167 が device.isActive=false で unavailable を返すため「解錠番号は使えない」という表示になり、実際には開くコードが野放しになっていることを誰も検知できない。

#### 直し方

updateSmartLockDevice の execute で、更新前の isActive を読み、true→false の遷移なら toggleSmartLockDeviceActive と同じく await revokePasscodesAfterPadDeactivated(deviceRowId) を呼ぶ。もしくは編集フォームから isActive を外し、有効/無効の変更経路をトグル 1 本に集約する。

#### 該当箇所

```
isActive: data.isActive,
```

#### 到達経路

前提: SwitchBot 連携 ON かつ対象 Pad が Device List になお存在する（下記 correctionNote 参照）。settings:manage 権限の管理者が「設定 \> SwitchBot \> デバイス登録簿」で Pad の編集ダイアログを開く。
\1. src/app/(admin)/admin/(dashboard)/\_shared/components/SmartLockDeviceRegistry.tsx:444 — isEdit なので action は `updateSmartLockDevice.bind(null, device.id)`
\2. 同 :479 — `const [isActive, setIsActive] = useState<boolean>(device?.isActive ?? true)`（現在値 true で初期化）
\3. 同 :636-642 — Switch を OFF にすると setIsActive(false)
\4. 同 :531-532 — hidden input `name={fields.isActive.name}` の value が `""` になり送信
\5. src/app/(admin)/admin/(dashboard)/\_shared/actions/smart-lock-devices.ts:86-88 — executeConformMutation が smartLockDeviceFormSchema でパース
\6. src/app/(admin)/admin/(dashboard)/\_shared/lib/validations/smart-lock-device.ts:39 → src/app/(admin)/admin/(dashboard)/\_shared/actions/settings/schemas/form-schema-helpers.ts:36-38 — `z.boolean().default(false)` により data.isActive === false（分岐は成功側へ）
\7. src/app/(admin)/admin/(dashboard)/\_shared/actions/smart-lock-devices.ts:90-93 — deviceIdSchema.safeParse は成功（早期 return せず）
\8. 同 :99-102 → src/shared/domain/smart-lock/device-inventory.ts:31-53 — deviceId/deviceType のみ検証、Device List に在るので throw せず通過
\9. 同 :103-108 — `updateSmartLockDeviceCommand(parsedDevice.data, { ..., isActive: data.isActive })`
\10. src/shared/domain/smart-lock/commands.ts:274-286 — `prisma.smartLockDevice.update({ data: { ..., isActive: false } })` を実行して return。revoke 系の呼び出しは一切無い
\11. 対照経路 src/app/(admin)/admin/(dashboard)/\_shared/actions/smart-lock-devices.ts:176-178 — 同一の状態遷移でこちらだけ `if (!isActive) await revokePasscodesAfterPadDeactivated(...)` が走る
誤った結果: src/shared/domain/smart-lock/assignment-side-effects.ts:77-97 が呼ばれないため、当該 Pad に紐づく将来 CONFIRMED 予約の SmartLockPasscode 行は CONFIRMED のまま残り、src/shared/domain/smart-lock/revoke-passcode.ts:174-178 の deletePasscode（SwitchBot deleteKey）が発行されない。よって物理 Keypad 上の解錠コードは各予約の endTime 到来まで有効。同時に src/shared/domain/smart-lock/customer-passcode-queries.ts:161-167 が `!device.isActive` で `{ status: "unavailable" }` を返すため、顧客画面は「解錠番号は使えない」と表示し、生きているコードの存在が UI からは観測できない。

#### 既存の検査

\_\_tests\_\_/unit/domain/smart-lock/commands.test.ts:494-526 の updateSmartLockDeviceCommand テストは「錠デバイスにペア錠を設定しようとすると拒否される」1 本のみ。revokePasscodesAfterPadDeactivated を grep しても \_\_tests\_\_/ と e2e/ に参照は 0 件で、トグル経路の失効すら検査されていない。

#### 反証官による訂正

中核の主張（編集フォーム経由の無効化が失効を伴わない／トグル経由だけが失効する）は正しく、引用・行番号・カバレッジ申告もすべて実在を確認した。ただし記述に 4 点の事実誤認・誇張がある。

(1) **提示された発火シナリオ自体が、ほぼ自己反証になっている。** 「Keypad が盗難・撤去された」場合、smart-lock-devices.ts:99-102 の assertDeviceMatchesSwitchBotInventory が updateSmartLockDeviceCommand の**前**に走り、device-inventory.ts:39-44 が fail-closed で `指定のデバイスIDは SwitchBot アカウントに存在しません` を throw する。つまり SwitchBot アカウントから外れた Pad は編集フォームでは保存自体が通らず、isActive:false が書かれることはない。管理者は必然的にトグル経路（失効する側）へ誘導される。撤去・盗難は本欠陥の再現条件として成立しない。実際に到達するのは「Pad がなお Device List に在る」状態（故障・引退予定・単に停止したい等）に限られる。

(2) **逆側の窓も閉じている。** SwitchBot 連携 OFF または資格情報が復号できない場合、device-inventory.ts:26-29 が早期 return するので編集フォームの保存は通るが、対照経路の revoke も revoke-passcode.ts:379-395 で「資格情報が復号できないためスキップ」して deleteKey を出さずに return する。つまりこの条件下では**両経路とも失効しない**ので、そもそも差異が生じない。実際の乖離窓は「連携 ON かつ Pad が Device List に在る」ときのみで、指摘が想定するより狭い。

(3) **「全予約の endTime+buffer まで生き続ける」は永続性を誇張している。** 発行済みパスコードは元より時間境界付きで、さらに cleanup cron の findRevocableSmartLockPasscodes（revoke-passcode.ts:411-428）が `endTime < now` または予約 CANCELLED の CONFIRMED 行を拾って失効させる。放置しても各予約枠の終了時点で自己回復する。無期限に野放しになるわけではない。

(4) **深刻度 high は過大。** 到達には settings:manage の RBAC を持つ管理者自身の操作が必要で、攻撃者に到達可能な経路ではない。残存するアクセス権を握るのは第三者ではなく、その スペースに CONFIRMED の将来予約を持つ正規顧客であり、しかも自分の予約枠内でしか使えない。実害は「管理者が意図した即時遮断が効かない」「顧客表示 unavailable と実態が食い違い検知できない」という運用上の乖離であって、権限昇格や無関係な第三者の侵入ではない。medium が妥当。

なお付随的に確認した点として、同ファイルの createSmartLockDevice:59 も isActive を直書きするが新規作成なので既存パスコードは存在せず問題にならない。JSDoc が言及する旧経路 location-smart-lock-devices.ts には update/toggle が無く（isActive/toggle/revoke いずれの参照も 0 件）、第二の欠落箇所にはなっていない。

---

### F-25

**スペースの Pad 付け替えで、旧デバイスのパスコードが失効されないまま新デバイス分も発行されない**

<sub>[対処の記録](2026-08-12-codebase-audit-progress.md) ／ [棄却一覧](2026-08-12-codebase-audit-refuted.md)</sub>

|        |                                                                                    |
| ------ | ---------------------------------------------------------------------------------- |
| 深刻度 | 中                                                                                 |
| 箇所   | `src/app/(admin)/admin/(dashboard)/_shared/actions/space-smart-lock-devices.ts:49` |
| 領域   | action・決済の残り                                                                 |

#### 起きること

スペース S に Pad A が割り当てられ、将来 (endTime 未到来) の CONFIRMED 予約 R に A 上の CONFIRMED パスコードが発行済みとする。管理者がスペース編集画面の「スマートロックデバイス」カードで Pad A → Pad B を選んで保存する (SpaceSmartLockDeviceCard.tsx:119 は選択値をそのまま渡すため、null を経由しない直接の付け替えが 1 回の保存で成立する)。この action は deviceId !== null なので else 分岐に入り issuePasscodesAfterSpaceBound だけを呼ぶ。revokePasscodesAfterSpaceUnbound は null 分岐にしか無いため、R の A 上のパスコードは CONFIRMED のまま生き続ける。一方 issuePasscodesAfterSpaceBound の絞り込みは smartLockPasscodes: { none: {} } なので、既に A のパスコード行を持つ R は除外され B 用のパスコードは発行されない。結果、予約者は (a) 自分が予約していない旧ドア A を開けられる状態が残り、(b) 実際に予約しているドア B は開けられない。fireAndForget かつ対象 0 件で正常終了するため、ログにも UI にも何も出ない。

#### 直し方

解除と付け替えを対称に扱う。deviceId が null かどうかではなく「変更前の smartLockDeviceId と異なるか」で判定し、旧デバイスが存在した場合は先に revokePasscodesAfterSpaceUnbound(spaceId) を await してから、新デバイスがあれば issuePasscodesAfterSpaceBound(spaceId) を呼ぶ。setSpaceSmartLockDeviceCommand は既に advisory lock 内で旧値を読めるので、戻り値に previousSmartLockDeviceId を含めて action 側の判定材料にするのが素直。

#### 該当箇所

```
issuePasscodesAfterSpaceBound(parsedSpace.data);
```

#### 到達経路

src/app/(admin)/admin/(dashboard)/spaces/\_components/space-edit-form/SpaceSmartLockDeviceCard.tsx:119 (保存ボタン: 選択中の Pad B をそのまま渡す。null を経由しない) → src/app/(admin)/admin/(dashboard)/\_shared/actions/space-smart-lock-devices.ts:27 setSpaceSmartLockDevice → :42 setSpaceSmartLockDeviceCommand で Space.smartLockDeviceId を A→B に更新 (src/shared/domain/smart-lock/commands.ts:548-551、パスコードには非干渉) → src/app/(admin)/admin/(dashboard)/\_shared/actions/space-smart-lock-devices.ts:46 の分岐が deviceId !== null なので :47 の revokePasscodesAfterSpaceUnbound を飛ばして :49 issuePasscodesAfterSpaceBound のみ実行 → src/shared/domain/smart-lock/assignment-side-effects.ts:129 の `smartLockPasscodes: { none: {} }` により、A のパスコード行を持つ予約 R が母集合から脱落 → 誤った結果 (b): B のパスコードは発行されず、src/shared/domain/smart-lock/customer-passcode-queries.ts:173-197 が deviceId=B で 0 件を引いて status "pending" のまま固定 (顧客は予約したドア B を開けられない) → 誤った結果 (a): A 上の CONFIRMED パスコードは残存し、src/shared/domain/smart-lock/revoke-passcode.ts:411-428 の候補条件 (endTime 経過 or CANCELLED) に該当しないため cleanup cron でも予約終了時刻まで失効しない。action は fireAndForget かつ 0 件正常終了で成功を返し、UI は「保存しました」を表示する。

#### 既存の検査

\_\_tests\_\_/unit/domain/smart-lock/commands.test.ts:278 の describe("setSpaceSmartLockDeviceCommand") は domain command のみ (拠点不一致・Pad 以外の拒否・null 解除の戻り値) を検証する。assignment-side-effects.ts の 2 関数を参照するテストはリポジトリ内に 1 件も無く、action 層の分岐 (line 46-50) も未検証。

#### 反証官による訂正

振る舞いの主張は全て確認できたが、high は 3 点で過大。(1) 「旧ドア A を開けられる状態が残る」は無期限ではない。旧行の endTime は予約自身の窓（発行時に焼き込み）なので、予約終了後は revoke-passcode.ts:411-428 の候補条件 `endTime < now` に該当し cleanup cron が deleteKey する。残存窓は「その顧客が元々正当にアクセスを許されていた時間」と同じ長さで、かつ相手は同一拠点の実在予約者。さらに顧客 UI は付け替え後 deviceId=B で引くため旧コードを表示しなくなる（customer-passcode-queries.ts:176）ので、付け替えが reveal 窓より前に起きた場合は誰もコードを知らない「孤児キー」になるだけ。(2) 一方で影響範囲は報告より広い。「直接の付け替えだから起きる」という限定は不正確で、B→なし→B の 2 段階（実装の JSDoc が想定する正規手順）でも復旧しない。revoke は行を REVOKED に倒すだけで削除しないため、`none: {}` は依然その予約を除外する。つまり管理画面から回復する手段が無く、実質 DB 直接操作が必要（管理画面にスマートロックパスコードの手動再発行 UI は存在しない。grep で該当は receipt の再発行のみ）。(3) 仕様との関係。docs/superpowers/plans/2026-07-26-switchbot-audit-hardening.md:70 の要件文は "when deactivating or unbinding" と "binding a new pad to a space with future CONFIRMED reservations **lacking passcodes**" しか書いておらず、実装はこの仕様に忠実。よってリグレッションではなく仕様側の欠落であり、既存 gate/テストが守っていたものを壊した類ではない。総合すると、発生条件が「将来 CONFIRMED 予約かつ発行済みパスコードを持つスペースの Pad 交換」という管理者の低頻度操作に限られ、顧客に誤ったコードを見せるのではなく「手続き中」で止まる（fail-closed 側）ため medium が妥当。

---

### F-26

**ImageNode は DecoratorNode 既定の isInline()=true のまま block の \<figure\> を exportDOM する（段落内挿入で保存 HTML の段落構造が壊れる）**

<sub>[対処の記録](2026-08-12-codebase-audit-progress.md) ／ [棄却一覧](2026-08-12-codebase-audit-refuted.md)</sub>

|        |                                                                                              |
| ------ | -------------------------------------------------------------------------------------------- |
| 深刻度 | 中                                                                                           |
| 箇所   | `src/app/(admin)/admin/(dashboard)/_shared/components/editor/lexical/nodes/ImageNode.ts:119` |
| 領域   | Lexical ノード                                                                               |

#### 起きること

管理者が本文段落「前半後半」の途中にカーソルを置き、ツールバーから画像を挿入する。ImageNode は isInline() を override していないため Lexical 0.49 の DecoratorNode 既定値 true が効き（node\_modules/lexical/src/nodes/LexicalDecoratorNode.ts:75 `isInline(): boolean { return true; }`）、$insertNodes は「全ノードが inline」判定（node\_modules/lexical/src/LexicalSelection.ts:1202 `($isElementNode(node) || $isDecoratorNode(node)) && !node.isInline();`）で ParagraphNode の子として splice する。保存時の exportDOM は `<p>前半<figure data-image="true" ...><img></figure>後半</p>`を出す。これは不正な入れ子で、保存パイプラインの enrich が DOMParser で再パースして doc.body.innerHTML を返す（enrich-lexical-content-html-icons.ts:75 と :85）ため、HTML 仕様どおり \<figure\> の直前で \<p\> が閉じられ、DB に入る contentHtml が`<p>前半</p><figure>...</figure>後半<p></p>` に変換されて確定する。結果、公開ページでは画像より後ろの本文が \<p\> の外に出て prose の段落スタイル（行間・margin）を失い、末尾に空段落が残る。編集画面は Lexical が DOM を programmatic に組むので再パースが起きず、管理者には正常に見える。

#### 直し方

ImageNode に `override isInline(): false { return false; }` を足す（PageBreakNode.ts:70-72 が既に同じ形で明示している）。同じ理由で block DOM を出しながら override が無い DecoratorNode（YouTubeNode / VimeoNode / XNode / InstagramNode / BookmarkNode / ButtonNode / MapEmbedNode / AudioNode / FigmaNode / SpotifyNode。いずれも exportDOM が \<div\>）も、クリップボード貼り付け経由で同じ経路に乗るため合わせて棚卸しする。

#### 該当箇所

```
export class ImageNode extends DecoratorNode<ReactElement | null> {
```

#### 到達経路

src/app/(admin)/admin/(dashboard)/\_shared/components/editor/lexical/plugins/ImagePlugin.tsx:45 `$insertNodes(nodes)`（同型: plugins/ImageDropPlugin.tsx:69） → node\_modules/lexical/src/LexicalSelection.ts:4004 `$insertNodes` → selection.insertNodes → node\_modules/lexical/src/LexicalSelection.ts:1201-1204 CASE 2 の `notInline` が false（node\_modules/lexical/src/nodes/LexicalDecoratorNode.ts:76-78 `isInline(): boolean { return true; }` を ImageNode.ts:119-202 が override しないため） → node\_modules/lexical/src/LexicalSelection.ts:1212 `firstBlock.splice(index, 0, nodes)` で ImageNode が ParagraphNode の子になる → 保存: src/app/(admin)/admin/(dashboard)/\_shared/actions/post/mutations.ts:56,160 → src/app/(admin)/admin/(dashboard)/\_shared/components/editor/lexical/preview/derive-lexical-content-html-core.ts:24 → preview/render-editor-state-json-to-html-core.ts:32 `$generateHtmlFromNodes` → node\_modules/@lexical/html/src/index.ts:352,355 で子 fragment が親 \<p\> 要素に append され、nodes/ImageNode.ts:152-178 exportDOM の \<figure\> が \<p\> の内側に入る → src/shared/lib/html/lexical-content-html-pipeline.ts:9 → src/shared/lib/html/enrich-lexical-content-html-icons.ts:75 `new DOMParser().parseFromString(...)` / :85 `doc.body.innerHTML` で \<p\> が \<figure\> 直前で閉じられる → src/shared/lib/html/sanitize-content-html-core.ts:72 はこの形を保持 → contentHtml として persist（誤った結果: 画像以降の本文が \<p\> の外に出て prose の段落スタイルを失い、末尾に空 \<p\>\</p\> が残る）

#### 既存の検査

\_\_tests\_\_/unit/components/editor/lexical/ に ImageNode を ParagraphNode の子として配置する経路のテストは無い。InlineImageNode.test.ts は本来 inline の InlineImageNode のみを扱う。DecoratorNode の isInline() を検査する architecture gate も無い（\_\_tests\_\_/unit/architecture-boundaries.test.ts の isInline 一致は `isInlineTypeOnly` という無関係な import 判定ヘルパー）。

#### 反証官による訂正

事実関係はおおむね正確だが 4 点補正する。(1) 行番号のずれ: DecoratorNode 既定 isInline() は node\_modules/lexical/src/nodes/LexicalDecoratorNode.ts:76-78（申告の :75 は空行）。CASE 2 の述語は LexicalSelection.ts:1201-1204、splice は :1212（申告の :1202 は述語本文の途中）。(2) 影響範囲は申告より広い: 「段落の途中」に限らず、空段落にカーソルを置いて挿入する最も一般的な操作でも ImageNode は空 ParagraphNode の子になるため、再パース後 `<p></p><figure>…</figure><p></p>` になり、ツールバー挿入・drag&drop 挿入のたびに空段落が 2 つ残る。ただしこの形の被害は余白のみで軽微で、本文が \<p\> の外に出る重い形は「画像より後ろにテキストがある」場合に限られる。(3) 影響の性質: 本文テキストは失われず（\<p\> ラッパを失うだけ）、contentJson 正本も壊れないため、node 側に `override isInline(): false` を足せば以後の保存で自動的に正しい形（CASE 3 経由で段落が分割され figure が兄弟になる）に戻る。データ損失・セキュリティ・保存失敗ではないので high ではなく medium が妥当。(4) 既存カバレッジの申告は正しい: \_\_tests\_\_/unit/architecture-boundaries.test.ts:2322 の `isInlineTypeOnly` は import 行の `import type` 判定ヘルパーで無関係、ImageNode.isInline() を検査するテスト・gate は 0 件。なお enrich の DOMParser 分岐は browser 側（:94-95）でも headless jsdom 側（:98-100）でも同じ再パースを通るため、再パースを回避する環境は存在しない。

---

### F-27

**TimelineContainerNode の flat state key "direction" が ElementNode の direction と衝突し、横→縦に戻せない**

<sub>[対処の記録](2026-08-12-codebase-audit-progress.md) ／ [棄却一覧](2026-08-12-codebase-audit-refuted.md)</sub>

|        |                                                                                                 |
| ------ | ----------------------------------------------------------------------------------------------- |
| 深刻度 | 中                                                                                              |
| 箇所   | `src/app/(admin)/admin/(dashboard)/_shared/components/editor/lexical/nodes/TimelineNode.tsx:30` |
| 領域   | エディタ内部                                                                                    |

#### 起きること

記事本文にタイムラインを挿入 → インスペクタで「横（水平）」に変更 → 保存 → 記事を開き直す（ここで `direction:"horizontal"` が `setDirection` 経由で ElementNode の `__dir` に入る）→ 「縦（垂直）」に戻して保存 → もう一度開くと横のまま。公開ページも `data-direction="horizontal"` のまま。縦に戻す手段はノードを削除して挿入し直す以外に無く、エラーも出ない。仕組み: TimelineNode.tsx:49 で `flat: true` を付けているため NodeState は `direction` を JSON 直下に書く（lexical/src/LexicalNodeState.ts:716-721）。ElementNode.exportJSON は `direction: this.getDirection()` を先に置いて最後に `...super.exportJSON()` を spread する（lexical/src/nodes/LexicalElementNode.ts:848-856）ので、horizontal のとき state が ElementNode の direction を上書きし、import 時に `.setDirection(serializedNode.direction)`（同 883 行）が `__dir="horizontal"` を作る。vertical に戻すと state は default 扱いで JSON から消え（LexicalNodeState.ts:709-712）、残った `__dir="horizontal"` が `direction` として書き出され、次の import で `$updateStateFromJSON`（LexicalNodeState.ts:899-908）がそれを timelineDirectionState として読み戻す。

#### 直し方

state key を予約語と衝突しない名前（例 `timelineDirection`）に変えるか、この 1 件だけ `flat: true` をやめて `$` 配下に置く。既存データは `direction` を旧キーとして読む parse を 1 リリース残すか、`data-direction` を持つ HTML からの再取り込みで吸収する。ついでに「flat state key が SerializedElementNode / SerializedTextNode の予約キーと衝突しない」ことを見る gate を 1 本足すと同型の再発を止められる。

#### 該当箇所

```
export const timelineDirectionState = createState("direction", {
```

#### 到達経路

エントリ: src/app/(admin)/admin/(dashboard)/\_shared/components/editor/lexical/plugins/TimelinePlugin.tsx:72 `$createTimelineContainerNode(direction)` で horizontal を挿入（または src/app/(admin)/admin/(dashboard)/\_shared/components/editor/lexical/inspector/panels/TimelineContainerInspectorPanel.tsx:98-104 `handleDirectionChange` → `$setState(n, timelineDirectionState, "horizontal")`）
→ src/app/(admin)/admin/(dashboard)/\_shared/components/editor/lexical/nodes/TimelineNode.tsx:30 `createState("direction", ...)` + 同:49 `{ flat: true, stateConfig: timelineDirectionState }`
→ node\_modules/lexical/src/LexicalNodeState.ts:523-524 flatKeys.add("direction")
→ \[保存\] node\_modules/lexical/src/nodes/LexicalElementNode.ts:850 `direction: this.getDirection()`（null）… 同:856 `...super.exportJSON()` を最後に spread → node\_modules/lexical/src/LexicalNode.ts:1535-1542 `...state.toJSON()` → node\_modules/lexical/src/LexicalNodeState.ts:716-721 flat キー "direction" を JSON 直下へ → JSON は `"direction":"horizontal"`
→ \[開き直し\] node\_modules/lexical/src/nodes/LexicalElementNode.ts:883 `.setDirection(serializedNode.direction)` → 同:632-634 `self.__dir = "horizontal"`（無検証）
→ \[縦へ戻す\] TimelineContainerInspectorPanel.tsx:98-104 `$setState(n, timelineDirectionState, "vertical")` → node\_modules/lexical/src/LexicalNodeState.ts:709-712 default と等しいため JSON から削除 → LexicalElementNode.ts:850 が汚染済み `this.getDirection()`="horizontal" を書き出す（**誤った結果: 縦を選んだのに JSON は horizontal**）
→ \[再度開く\] node\_modules/lexical/src/LexicalNodeState.ts:899-908 `$updateStateFromJSON` が top-level "direction" を timelineDirectionState へ読み戻す → 横に戻る
→ \[公開ページ\] src/app/(admin)/admin/(dashboard)/\_shared/actions/post/mutations.ts:56 `deriveLexicalContentHtmlFromJson` → src/app/(admin)/admin/(dashboard)/\_shared/components/editor/lexical/preview/derive-lexical-content-html-core.ts:21 → TimelineNode.tsx:108 exportDOM `data-direction="horizontal"` のまま

#### 既存の検査

無し。`__tests__/unit/components/editor/lexical/` に TimelineNode のテストは存在せず、`registered-node-types.test.ts` / `editor-nodes-ssot.test.ts` は登録集合しか見ない。flat state key と SerializedElementNode の予約キー（children/direction/format/indent/type/version/textFormat/textStyle）の衝突を見る gate も無い。

#### 反証官による訂正

機構・到達経路・失敗シナリオはすべて正確で、実際に再現した。ただし以下を補正する。

\1. 【事実誤認】「`__tests__/unit/components/editor/lexical/` に TimelineNode のテストは存在せず」は誤り。`__tests__/unit/components/editor/lexical/pattern-blocks-export.test.ts` が実在し、TimelineContainerNode / TimelineItemNode / `$createTimelineContainerNode` を import して headless editor で exportDOM を検証している。ただし同テストは (a) HTML 出力のみで JSON 往復を見ておらず、(b) `$createTimelineContainerNode("vertical")`（既定値）しか使わないため、この欠陥は素通りする。結論「この欠陥を捕まえるカバレッジは無い」は成立するが、根拠として挙げた前提が不正確。

\2. 【深刻度】high → medium。silent かつ UI からは回復不能（ノード削除・再挿入のみ）で実データ破損だが、影響範囲は 1 ブロック種の任意レイアウトトグル 1 つに限定される。本文コンテンツは失われず、クラッシュもセキュリティ影響も無い。既定の vertical のまま使う限り発現せず、発現条件は「horizontal を選ぶ」→「vertical に戻したい」の 2 段。

\3. 【補足・報告より軽い点】公開 HTML に不正な `dir="horizontal"` は漏れない。TimelineContainerNode.exportDOM (TimelineNode.tsx:105-111) は新しい div を組み立てて super を呼ばないため、ElementNode.exportDOM の `element.dir = direction`（LexicalElementNode.ts:838-840）を通らない。公開側の症状は報告どおり `data-direction` が horizontal のまま固定される点のみ。なお**エディタ内の DOM** には LexicalReconciler.ts:731 `$setElementDirection` 経由で `dir="horizontal"`（HTML 的に不正値）が付く。

\4. 【補足・報告より重い点】「横に戻せない」以前に、horizontal を一度保存した時点で永続 JSON が lexical の `SerializedElementNode.direction: 'ltr'|'rtl'|null` という型契約に違反した値を持つ。切り替えを試みなくても DB 上のデータは既に汚染されている。

\5. 【範囲の確定】同種の衝突は他に無い。全 createState キーを列挙した結果、SerializedElementNode の予約キー（children/direction/format/indent/type/version/textFormat/textStyle）と衝突する flat キーは TimelineNode の "direction" のみ。GalleryNode.tsx:35 の `createState("style")` も flat だが、`style` は SerializedTextNode の予約キーであって GalleryContainerNode は ElementNode 継承（同:44）なので衝突しない。

\6. 【行番号】報告が引用した lexical の行番号（LexicalNodeState.ts:716-721 / 709-712 / 899-908、LexicalElementNode.ts:848-856 / 883）は 0.49.0 の実ソースと一致していた。

---

### F-28

**⋮⋮ メニューの「複製」が中身のない空ブロックを作る**

<sub>[対処の記録](2026-08-12-codebase-audit-progress.md) ／ [棄却一覧](2026-08-12-codebase-audit-refuted.md)</sub>

|        |                                                                                                            |
| ------ | ---------------------------------------------------------------------------------------------------------- |
| 深刻度 | 中                                                                                                         |
| 箇所   | `src/app/(admin)/admin/(dashboard)/_shared/components/editor/lexical/plugins/DraggableBlockPlugin.tsx:163` |
| 領域   | Lexical プラグイン                                                                                         |

#### 起きること

本文に「本日は晴天なり」という段落があり、左のドラッグハンドル ⋮⋮ をクリック →「複製」を選ぶ。直下に段落は増えるが中身は空（Group / Callout / Collapsible / Layout など入れ子コンテナを複製した場合は、枠だけで中身が全部消えた箱が挿入される）。DecoratorNode（画像・YouTube 等）は state を exportJSON に含むため複製できるので、「画像は複製できるのに段落だけ空になる」という一貫性のない挙動になる。

#### 直し方

BlockTemplatePlugin と同じ根本原因（ElementNode.exportJSON() の children が常に \[\]、node\_modules/lexical/src/nodes/LexicalElementNode.ts:849）。ElementNode の複製には children を再帰的に埋める自前の serializer を通すか、$exportNodeToJSON 相当の再帰を持つ共通ヘルパーを 1 本用意して両プラグインから使う。

#### 該当箇所

```
const serialized = node.exportJSON();
```

#### 到達経路

src/app/(admin)/admin/(dashboard)/\_shared/components/editor/lexical/LexicalEditor.tsx:270 (\<DraggableBlockPlugin anchorElem={contentWidthRef} /\>) → src/app/(admin)/admin/(dashboard)/\_shared/components/editor/lexical/plugins/DraggableBlockPlugin.tsx:66 (DragHandle onClick={onMenuOpen}) → DraggableBlockPlugin.tsx:120-134 handleMenuOpen で $getNearestNodeFromDOMNode(blockElem) の getKey() を menu.nodeKey に格納 → DraggableBlockPlugin.tsx:248 (\<DropdownMenuItem onClick={handleDuplicate}\>複製\</DropdownMenuItem\>) → DraggableBlockPlugin.tsx:158-168 handleDuplicate → DraggableBlockPlugin.tsx:161 $getNodeByKey(menu.nodeKey) が ParagraphNode を返す → DraggableBlockPlugin.tsx:163 node.exportJSON() → node\_modules/lexical/src/nodes/LexicalParagraphNode.ts:102-103 が super.exportJSON() に委譲 → node\_modules/lexical/src/nodes/LexicalElementNode.ts:847-857 が children:\[\] を固定で返す（子の直列化は node\_modules/lexical/src/LexicalEditorState.ts:76-94 の $exportNodeToJSON 側にしか無く、ここは通らない） → DraggableBlockPlugin.tsx:164 $parseSerializedNode(serialized) → node\_modules/lexical/src/LexicalUpdates.ts:433-445 で importJSON 後に空の children 配列をループするため子が 1 つも append されない → DraggableBlockPlugin.tsx:165 node.insertAfter(parsed) が中身の無いブロックを直下に挿入（実測: getTextContent() === ""）

#### 既存の検査

複製操作の unit / e2e テストは無い。

#### 反証官による訂正

指摘は本質的に正確。実測で判明した 3 点だけ補正・精緻化する。(1) 「複製が空ブロックになる」は canBeEmpty() が true のノード（段落・見出し等）の場合。canBeEmpty() が false のコンテナ（例: @lexical/list の ListNode）では、子の無い複製が Lexical の正規化で除去されるため、複製結果は「空のブロックが増える」ではなく**何も起きない（無反応に見える）**。実測でリスト複製後の root 子要素は増えなかった。指摘本文の「枠だけで中身が全部消えた箱が挿入される」は Group / Callout / Collapsible / Layout のように canBeEmpty() が既定 true のコンテナに当てはまる記述で、ノード種別によって「空箱」と「無反応」に分かれる。(2) 原因の所在をより正確に言うと、$parseSerializedNode は children を再帰的に復元する正しい実装（LexicalUpdates.ts:434-445）であり、欠陥は export 側にのみある。node.exportJSON() は仕様上「そのノード自身のプロパティのみ」を返す API で、children を埋めるのは editorState.toJSON() 経路の $exportNodeToJSON（LexicalEditorState.ts:76-94）だけ。したがって「exportJSON が壊れている」のではなく「単体ノードの複製に exportJSON を使うのが誤用」。(3) DecoratorNode が複製できる理由は指摘どおりで、基底 LexicalNode.exportJSON()（LexicalNode.ts:1535-1542）が \_\_state.toJSON() を展開するため。本リポジトリの ImageNode.ts / GroupNode.tsx 等は createState ベースで、nodes/ 配下に exportJSON の override は 1 件も無いことを確認済み。GroupNode は ElementNode 継承なので自身の style / color state は複製されるが children は失われる、という「枠だけ残る」挙動と整合する。深刻度は自己申告どおり medium が妥当。管理画面（admin surface）限定で、元ブロックは破壊されず追加されるだけなので恒久的なデータ損失ではなく、Ctrl+Z で戻せる。一方で「複製」メニューは DecoratorNode 以外のほぼ全ブロック種別（段落・見出し・リスト・引用・Group・Callout・Collapsible・Layout・Table・Steps・Tabs 等）で機能しておらず、出荷済み UI が常時不動作なので low ではない。high でもない（公開面に影響せず、失敗は即座に目視可能）。

---

### F-29

**設備がちょうど1件のスペースは保存できず、エラーも表示されない**

<sub>[対処の記録](2026-08-12-codebase-audit-progress.md) ／ [棄却一覧](2026-08-12-codebase-audit-refuted.md)</sub>

|        |                                                                         |
| ------ | ----------------------------------------------------------------------- |
| 深刻度 | 中                                                                      |
| 箇所   | `src/app/(admin)/admin/(dashboard)/_shared/lib/validations/space.ts:70` |
| 領域   | admin エンティティ編集                                                  |

#### 起きること

スペース編集画面で設備リストを「Wi-Fi」1件だけにして（または既存の1件だけのスペースを開いて）保存を押すと、保存が実行されず、画面には何のエラーも出ない。設備0件・2件以上なら正常に保存できるため、管理者は「保存ボタンが効かない」としか認識できない。新規作成でも同じ（設備1件で作成不能）。

#### 直し方

preprocess の入口でスカラーを配列に正規化する（`const items = isUnknownArray(value) ? value : [value];` としてから map する）。加えて SpaceEditDetailsTab の表示を `fields.facilities.allErrors` ベースにして、子要素のエラーが無言で消えないようにする。

#### 該当箇所

```
if (!isUnknownArray(value)) return value;
```

#### 到達経路

src/app/(admin)/admin/(dashboard)/spaces/\_components/SpaceEditForm.tsx:380-387（設備1件につき hidden input を1つだけ出力、name="facilities"）→ src/app/(admin)/admin/(dashboard)/spaces/\_components/SpaceEditForm.tsx:341（getFormProps で conform の onSubmit を配線）→ src/app/(admin)/admin/(dashboard)/spaces/\_components/SpaceEditForm.tsx:205-207 onValidate → parseWithZod(formData, {schema: spaceFormSchema}) → node\_modules/@conform-to/dom/dist/submission.mjs:29-41（entries が1件なので payload.facilities はスカラー文字列のまま）→ node\_modules/@conform-to/zod/dist/v4/parse.mjs:43 coerceFormValue → node\_modules/@conform-to/zod/dist/v4/coercion.mjs:326（pipe 分岐で z.preprocess を in=transform / out に再構築し、ユーザー preprocess を先に実行）→ src/app/(admin)/admin/(dashboard)/\_shared/lib/validations/space.ts:70（!isUnknownArray(value) が真 → JSON 文字列を素通し）→ node\_modules/@conform-to/zod/dist/v4/coercion.mjs:219-233（配列でないので \["{...}"\] にラップ）→ src/shared/lib/json-validators.ts:113,133-134 facilityItemSchema(object) が string を拒否 → issue path = facilities\[0\] → node\_modules/@conform-to/react/dist/context.mjs:102-104（errors = state.error\["facilities"\] は undefined）→ src/app/(admin)/admin/(dashboard)/spaces/\_components/space-edit-form/SpaceEditDetailsTab.tsx:194 と src/app/(admin)/admin/(dashboard)/spaces/\_components/SpaceEditForm.tsx:474 のどちらも何も描画しない → node\_modules/@conform-to/react/dist/context.mjs:255 event.preventDefault() で送信中断（サーバー到達時も src/shared/lib/forms/conform-action.ts:97 が同じスキーマで同じ結果）→ 誤った結果: 設備がちょうど1件のスペースは、エラー表示ゼロのまま保存が実行されない（新規作成・編集の両方）

#### 既存の検査

\_\_tests\_\_/unit/lib/validations/space.test.ts と \_\_tests\_\_/integration/actions/admin/space.test.ts は object literal を直接 safeParse するだけで FormData/conform 経路を通らない（facilities は常に3件の配列）。\_\_tests\_\_/unit/app/admin/spaces/space-edit-form-facilities-guard.test.tsx は読み取り失敗ガードの Alert と送信ボタン活性のみを検証し、送信経路は検証しない。よって全緑のまま通り抜ける。

#### 反証官による訂正

指摘の技術的内容は全て正しく、引用・行番号（coercion.mjs:326 の pipe 分岐、219-233 の array 分岐、submission.mjs の setPathValue ループ、context.mjs:102-104 の errors ゲッター）も実際のコードと一致していた。事実誤認は見つからなかった。

補足として確認した点:
\- 送信が止まる直接の実装箇所は指摘が挙げていない node\_modules/@conform-to/react/dist/context.mjs:246-256（createFormContext.submit が submission.error !== null のとき event.preventDefault()）。指摘の「client onValidate 失敗で submit 自体が止まる」は結論として正しい。
\- 「設備0件・2件以上なら正常に保存できる」も実測で裏付いた（0件は payload undefined → preprocess が \[\] を返す、2件以上は配列化されて preprocess が正しく JSON parse する）。
\- 同じ hidden-input パターンでも gallery は conform の構造化フィールド名（gallery\[i\].url 等）で送られており、この欠陥の影響を受けない。影響は facilities 単独。

深刻度のみ high → medium に補正する。理由:
\- 影響面は管理画面のみで、公開ストアフロント・顧客・決済には波及しない。
\- データ破壊・データ損失・権限迂回は発生しない（保存が実行されないだけで、DB の既存値は無傷）。
\- 管理者側に回避手段が存在する（設備を 2 件にする、または 0 件にすれば保存できる）。
ただし「保存が完全に止まり、かつ画面に何も出ない」ため発見コストは高く、設備1件のスペースはフォームから一切編集できなくなる。low ではなく medium が妥当。

---

### F-30

**イベントの一括削除に確認ダイアログが無く、管理画面に復元経路も無い**

<sub>[対処の記録](2026-08-12-codebase-audit-progress.md) ／ [棄却一覧](2026-08-12-codebase-audit-refuted.md)</sub>

|        |                                                                                 |
| ------ | ------------------------------------------------------------------------------- |
| 深刻度 | 中                                                                              |
| 箇所   | `src/app/(admin)/admin/(dashboard)/events/_components/EventBulkActions.tsx:144` |
| 領域   | admin エンティティ編集                                                          |

#### 起きること

イベント一覧で複数行を選択した状態（最大100件）で、フローティングバーの「一括削除」を1回誤クリックすると、確認なしで即座に選択中の全イベントが soft delete され、公開ページからも消える。管理画面には events のゴミ箱／復元 UI が存在しないため、操作者は元に戻せず DB 直接操作が必要になる。

#### 直し方

同ファイルに既にある DeleteConfirmDialog を「一括削除」にも配線する（cancelOpen と同型の deleteOpen state を足す）。復元不能である点を description に明記するか、events のゴミ箱ページを posts/terms と同型で用意して restoreEventCommand を配線する。

#### 該当箇所

```
onClick={handleBulkDelete}
```

#### 到達経路

src/app/(admin)/admin/(dashboard)/events/page.tsx (list page) → src/app/(admin)/admin/(dashboard)/events/\_components/EventTable.tsx:141 renders EventBulkActions → src/app/(admin)/admin/(dashboard)/events/\_components/EventBulkActions.tsx:141-153 destructive 「一括削除」Button, onClick={handleBulkDelete} at :144 with no dialog interposed (contrast :133 setCancelOpen(true) → DeleteConfirmDialog :156-163) → EventBulkActions.tsx:81-93 handleBulkDelete immediately awaits bulkSoftDeleteEvents(selectedIds) → src/app/(admin)/admin/(dashboard)/\_shared/actions/event/bulk.ts:170-220; the only validation is bulkIdsSchema (bulk.ts:35-38, min 1 / max 100 entity ids) — no status guard, no confirmation token → src/shared/domain/events/bulk-commands.ts:90-102 selects every id with deletedAt: null and updateMany sets deletedAt/deletedById on all of them regardless of EventStatus → wrong result: up to 100 events (incl. PUBLISHED) leave the public site and simultaneously drop out of every admin tab because src/shared/domain/events/admin-queries.ts:184 filters deletedAt: null; bulk.ts:217 fireBulkOutboundDeletes → calendar-outbound.ts:23-31 deleteEventOutbound also removes the linked Google Calendar events; the guarded recovery routine src/shared/domain/events/commands.ts:603 restoreEventCommand has no admin action or page caller.

#### 既存の検査

確認ダイアログの有無を検査する gate は無い。restore 側は integration テストがあるが UI 経路が無いことは誰も検査していない。

#### 反証官による訂正

Severity left at medium, but only the missing-confirmation half is actionable; the report's framing has four inaccuracies. (a) Not events-specific: src/app/(admin)/admin/(dashboard)/pages/\_components/BulkActions.tsx:104 has the identical unconfirmed bulk delete. The finding says "削除だけが直結している" about this file (true) but presents it as an events-only anomaly (false) — a fix should cover both, or the finding should be restated repo-wide. (b) "元に戻せず DB 直接操作が必要" overstates permanence. It is a soft delete: the row survives, deletedById is stamped (bulk-commands.ts:101), and emitBulkAuditRecords (bulk.ts:204-216) logs AuditAction.DELETE with every affected resourceId and slug, so the recovery target set is fully recoverable from the audit log. Nothing is destroyed, and the action is admin-authenticated (executeAdminMutationResult, resource "event" / action "delete"). (c) The "復元経路が無い" half is a product-scope gap shared with news / spaces / coupons / pages — only faq, posts and terms have trash routes at all — so bundling it with the confirm-dialog defect inflates the item; it belongs in a separate product decision, not in this fix. (d) One aggravating fact the report missed, which is why I did not downgrade to low: restoreEventCommand exists precisely to re-acquire the space occupancy safely — it checks slug conflict and runs advisory-locked checkSpaceOverlap over all slots (commands.ts:588-640), because a soft-deleted event releases its space. With no UI path, an operator's natural fallback is a raw `UPDATE ... SET deleted_at = NULL`, which bypasses both guards and can materialize a double booking. Separately, the Google Calendar deletion fired at bulk.ts:217 is an external, non-transactional side effect that restoreEventCommand does not undo, so even a correct restore leaves GCal out of sync until a re-publish/sync.

---

### F-31

**参加申込の一括キャンセル／一括出席が、ページ遷移で見えなくなった過去の選択にも及ぶ**

<sub>[対処の記録](2026-08-12-codebase-audit-progress.md) ／ [棄却一覧](2026-08-12-codebase-audit-refuted.md)</sub>

|        |                                                                                            |
| ------ | ------------------------------------------------------------------------------------------ |
| 深刻度 | 中                                                                                         |
| 箇所   | `src/app/(admin)/admin/(dashboard)/events/[id]/_components/EventRegistrationTable.tsx:459` |
| 領域   | admin エンティティ編集                                                                     |

#### 起きること

申込30件・1ページ20件のイベント詳細で、1ページ目のヘッダーチェックで20件を全選択 → 2ページ目へ移動（または「ステータス」フィルタを切り替え）すると、表示中の10件はどれもチェックが付いていないのにフローティングバーは「20件選択」のまま残る。そこで「一括キャンセル」を押すと、画面に1件も出ていない1ページ目の20件がキャンセルされ、Stripe 返金・キャンセルメール・キャンセル待ち繰り上げまで発火する。確認ダイアログも無い。

#### 直し方

SpaceTable と同型に `const visibleIdSet = new Set(registrations.map(r => r.id)); const effective = [...selectedIds].filter(id => visibleIdSet.has(id));` を作って BulkActions に渡し、ヘッダーの全選択判定も visible 基準にする。合わせて一括キャンセルにも DeleteConfirmDialog 相当の確認を付ける。

#### 該当箇所

```
selectedIds={[...selectedIds]}
```

#### 到達経路

src/app/(admin)/admin/(dashboard)/events/\[id\]/page.tsx:72-85 (loadAdminEventRegistrationsSearchParams → getEventRegistrations でページ分割、perPage 既定 20) → page.tsx:300-307 (EventRegistrationTable を key 無しで描画) → src/app/(admin)/admin/(dashboard)/events/\[id\]/\_components/EventRegistrationTable.tsx:155 (selectedIds = ローカル Set state) → :169-175 toggleSelectAll で 1 ページ目 20 件を選択 → :415-421 Pagination → src/app/(admin)/admin/(dashboard)/\_shared/components/ui/Pagination.tsx:99-113 (useQueryStates shallow:false / history:"replace" で page=2 へ。同一 route の searchParams 変更のため client component は remount されない ← 同ファイル EventRegistrationTable.tsx:256 の key={search} がその証拠) → :313-326 registrations は 2 ページ目 10 件に入れ替わり全チェックボックス off、しかし selectedIds は 1 ページ目の 20 件のまま → :459 selectedIds={\[...selectedIds\]} が可視行での絞り込み無しに全件を渡す → \_components/EventRegistrationBulkActions.tsx:28-41 handleBulkCancel が確認ダイアログ無しで bulkCancelEventRegistrations(selectedIds) を呼ぶ → src/app/(admin)/admin/(dashboard)/\_shared/actions/event-registration.ts:517 (zod は形式と min(1) のみ) → :530-543 per-id で adminCancelEventRegistrationCommand（registration-cancel-commands.ts:121-128）+ applyEventRegistrationCancellationSideEffects（Stripe 返金 / キャンセル待ち繰り上げ / 顧客・管理者メール / 監査ログ）を実行 → 画面に 1 件も表示されていない 1 ページ目の 20 件が取り消され、返金とメールが発火する

#### 既存の検査

同種の欠陥は他テーブルでは修正済みで、SpaceTable.tsx:34-39 に「Round-4 audit Cluster J / Finding #10 sibling」のコメント付きで visibleIdSet による絞り込みが入っている（CouponTable / CustomerTable / EventTable / InquiryTable / NewsTable / PostTable / ReservationTable も同様）。このテーブルだけ絞り込みが無く、gate もテストも無い。

#### 反証官による訂正

事実関係は指摘どおりで、誤認は見つからなかった。ヘッダー全選択が size 比較のみ（:293-296）で、残留 20 件と可視 20 件が一致すると「全選択済み」表示になり、押すと new Set() 側へ反転する（:169-175）という記述も正しい。bulkCheckInEventRegistrations は eventId を取るが（actions:573-587）、残留 id は同一イベントのものなので出席側にも歯止めにならない点も指摘のとおり。

severity は high → medium に補正する。理由は緩和材料が 2 つあるため:
(a) FloatingBulkActionBar は selectedCount\>0 の間つねに表示され「N件選択中」を aria-live 付きで出し続ける（FloatingBulkActionBar.tsx:42,54-60）。可視行が全部 off なのにバーが残るという矛盾は画面上に出ており、完全に無言の破壊ではない。
(b) 発火には event:update 権限を持つ管理者が、残留選択を失念したまま一括キャンセルを押すという操作誤りが要る。外部入力から到達できる経路ではない。
一方で加重材料として、返金とキャンセルメールは取り消せず確認ダイアログも無いこと、8 兄弟テーブルの中で副作用が最も重いのがこのテーブルであることは残る。低くは無いが「high」ほどではない、という位置づけ。

補足: 被害は同一イベント詳細内に限られる見込み（別イベントへ移ると dynamic segment の値が変わる）。また gate 側は \*BulkActions.tsx が FloatingBulkActionBar を import するかしか検査しておらず（\_\_tests\_\_/unit/architecture-boundaries.test.ts:3192-3255）、「可視 id との積集合を渡す」不変条件を守る gate・ESLint ルール・単体テストは 1 つも存在しない — つまり同じ取りこぼしは今後も検知されない。

---

### F-32

**FAQ 質問の D&D 並び替えが「order は 0..N-1 で連続」を前提にしており、削除履歴のあるカテゴリの 2 ページ目以降で必ず失敗する**

<sub>[対処の記録](2026-08-12-codebase-audit-progress.md) ／ [棄却一覧](2026-08-12-codebase-audit-refuted.md)</sub>

|        |                                                                                   |
| ------ | --------------------------------------------------------------------------------- |
| 深刻度 | 中                                                                                |
| 箇所   | `src/app/(admin)/admin/(dashboard)/faq/_components/FaqCategoryItemsTable.tsx:250` |
| 領域   | admin コンテンツ編集                                                              |

#### 起きること

あるカテゴリに 25 件の質問があり order は 0..24（createFaqItem が max+1 で採番）。管理者が order=0 の質問を削除すると deleteFaqItem は deletedAt を立てるだけで採番し直さないため、生存 24 件の order は 1..24 と歯抜けになる。perPage=20 なので 1 ページ目に order 1..20、2 ページ目に order 21..24 が並び、startIndex=(2-1)\*20=20。2 ページ目で行をドラッグすると orderedItems は order=20,21,22,23 になる。reorderFaqItems（item-commands.ts:261 の重複チェック）は同カテゴリ・deletedAt IS NULL・ids に含まれない行で order ∈ {20,21,22,23} を探し、1 ページ目末尾の order=20 の質問がヒットして DomainError「指定した並び順は他の質問と重複します」を投げる。クライアントは toast.error を出して setItems(\[...initialItems\]) で巻き戻すため、以後そのカテゴリの 2 ページ目以降では並び替えが一切通らない。管理者には理由が分からず、UI から採番を詰め直す手段も無い（1 ページ目を一度並び替えると 0..19 に詰まって偶然直る、という非自明な回避策のみ）。カテゴリ移動（updateFaqItem の categoryId 変更）でも同じ歯抜けが発生する。

#### 直し方

絶対 index を推測せず、サーバー側で解決する。reorderFaqItems の入力を「ページ内の id 並び + 隣接関係」または「対象 id 群が現在占有している order 値の集合を昇順に再割り当て」に変える（対象行の既存 order をソートして順に振り直せば、歯抜けがあっても他ページと衝突しない）。あるいは deleteFaqItem / updateFaqItem のカテゴリ移動時に残りを詰め直して order の連続性を不変条件にする。

#### 該当箇所

```
order: startIndex + index,
```

#### 到達経路

前提（穴を作る）: src/shared/domain/faq/item-commands.ts:146-153 deleteFaqItem がソフトデリートのみで再採番しない（同 :126-142 のカテゴリ移動、src/shared/domain/faq/item-bulk-commands.ts:103-119 の bulk move も同じ）→ 例: 25 件 order 0..24 のカテゴリで order=0 を削除し、生存 24 件が order 1..24 になる。
到達経路: src/app/(admin)/admin/(dashboard)/faq/\[categoryId\]/page.tsx:88（sortable でもページングを迂回せず page/limit をそのまま渡す）→ :91-96 reorderEnabled が page を条件に含まない → :97 startIndex = (page-1)\*params.perPage = 20 → :119 → src/app/(admin)/admin/(dashboard)/faq/\_components/FaqCategoryDetailView.tsx:126 → src/app/(admin)/admin/(dashboard)/faq/\_components/FaqCategoryItemsTable.tsx:236 handleDragEnd（:238-242 の早期 return を通過）→ :248-251 orderedItems = 2 ページ目 4 件に order 20,21,22,23 を割り当て → :252 → src/app/(admin)/admin/(dashboard)/\_shared/actions/faq.ts:311-330（idSchema / faqItemOrderSchema は形のみ検証で通過）→ src/shared/domain/faq/item-commands.ts:261-269 conflictingItems が同カテゴリ・deletedAt IS NULL・id NOT IN(2 ページ目 4 件)・order IN (20,21,22,23) で 1 ページ目末尾の order=20 を拾う → :271-273 DomainError「指定した並び順は他の質問と重複します」→ src/app/(admin)/admin/(dashboard)/\_shared/lib/admin-action.ts:157-161 で MutationResult.error 化 → src/app/(admin)/admin/(dashboard)/faq/\_components/FaqCategoryItemsTable.tsx:253-256 toast.error + setItems(\[...initialItems\]) で巻き戻し（DB は無変更のまま、以後も同じ失敗を繰り返す）。

#### 既存の検査

\_\_tests\_\_/integration/domain/faq/item-reorder.test.ts と \_\_tests\_\_/unit/domain/faq/commands.test.ts はドメイン側の reorderFaqItems を呼ぶだけで、クライアントの startIndex+index による絶対 order 算出（=order 連続の前提）を検証していない。ページネーション 2 ページ目 × 歯抜け order の組み合わせを踏むテストは存在しない。

#### 反証官による訂正

見出しの「必ず失敗する」は言い過ぎ。失敗するのは「穴（欠番）が 1 ページ目の境界より下にあるとき」だけで、削除位置によっては通る。反例: 25 件 order 0..24 で order=24（最終）を削除 → 生存 24 件は 0..23、1 ページ目 0..19 / 2 ページ目 20..23、startIndex=20 で目標 20..23 は現状と一致し、衝突検査に引っかからず成功する。order=22 を削除した場合（1 ページ目が 0..19 のまま）も同様に成功する。正しい条件は「1 ページ目に載っている項目（より正確には 1 ページ目の最大 order より小さい order を持つ項目）を削除・移動したとき、2 ページ目以降の D&D が通らなくなる」。指摘本文の具体例（order=0 を削除）はこの条件を満たすので、そこは正確。
もう 1 つ、指摘が触れていない併発モードがある。欠番が蓄積して 1 ページ目の最大 order が startIndex + (2 ページ目の件数) - 1 を超えると、衝突検査に何も引っかからず DomainError にならないまま更新が成功し、2 ページ目の項目が 1 ページ目末尾より小さい order を持つ（＝ページをまたいで順序が入れ替わる）静かな破壊になる。エラーが出ないぶんこちらのほうが気づきにくい。
事実確認の補足: 引用・行番号・エラーメッセージ・巻き戻し挙動・既存テストの申告はすべて正確。カテゴリ移動でも歯抜けが出るという指摘も updateFaqItem:126-142 と bulkMoveFaqItems:103-119 で確認できる。
修正時の注意（範囲外の情報）: `__tests__/unit/architecture/display-order-surfaces-clean-break.test.ts:781` が `order: startIndex + index` の文字列を、:782-787 が reorderEnabled の条件式を FAQ について固定しているため、実装を直すならこの gate も同時に更新が要る。他 3 面が採っている回避策は同 gate :799-837 が固定する `page: sortable ? 1 : ...` / `limit: sortable ? SORTABLE_VIEW_LIMIT : ...` + `{!sortable && (` パターンだが、FAQ 質問はカテゴリ 1 つあたり数百件になりうる点で locations/taxonomy とはデータ規模の前提が違うので、同じ「全件 1 ページ」で機械的に揃えてよいかは別途判断が要る。
深刻度は自己申告どおり medium 相当と判断した（管理画面限定・データ損失なし・1 ページ目を 1 度並び替えれば 0..19 に詰まって解消する回避策あり、だが発動条件は 1 カテゴリ 20 件超 + 通常の削除操作という現実的なもので、エラー文言から原因を推測できず UI 上の復旧手段も無い）。

---

### F-33

**問い合わせ添付は Next の既定 1MB body 上限に当たり、UI が約束する 5MB/10MB のアップロードが 413 で無言に失敗する**

<sub>[対処の記録](2026-08-12-codebase-audit-progress.md) ／ [棄却一覧](2026-08-12-codebase-audit-refuted.md)</sub>

|        |                                                                                           |
| ------ | ----------------------------------------------------------------------------------------- |
| 深刻度 | 中 ／ 実コード確認済                                                                      |
| 箇所   | `src/app/(admin)/admin/(dashboard)/inquiries/[id]/_components/InquiryAttachments.tsx:162` |
| 領域   | 問い合わせ                                                                                |

#### 起きること

管理者が問い合わせ詳細で 2MB の現地写真（または 3MB の見積書 PDF）を「ファイルを追加」で選ぶ。multipart の Server Action リクエストが Next の既定 bodySizeLimt=1MB を超えるため、action 本体が実行される前に Next が HTTP 413 を返す（node\_modules/next/dist/server/app-render/action-handler.js:669 `if (size > bodySizeLimitBytes)`、同 519 `: 1024 * 1024 // 1 MB`）。呼び出し側 InquiryAttachments.tsx:58-59 の `startUploadTransition(async () => { const result = await uploadInquiryAttachment(formData); ...})` には try/catch が無く、`isMutationError(result)` にも到達しないので toast.error は出ず、transition が reject して error boundary 側に飛ぶ。ユーザーには「サイズが大きすぎる」旨が一切表示されず、1MB 未満のファイルだけが通る。ドメイン側の per-MIME 上限（attachment-commands.ts:159-166 の 5MB/10MB）と magic-byte 検証は一度も実行されない。

#### 直し方

next.config.ts の experimental に `serverActions: { bodySizeLimit: "12mb" }`（PDF 10MB + multipart オーバーヘッド分の余裕。Next 同梱 docs が「10〜20KB 程度の余裕を見よ」と明記）を追加する。合わせて InquiryAttachments.tsx の transition コールバックを try/catch で包み、413 を「ファイルサイズが上限を超えています」に変換して toast する。同じ制限は media ライブラリの uploadMedia（5MB/50MB を謳う）にも掛かっているので、値は両者の最大を基準に決めること。

#### 該当箇所

```
JPEG / PNG / WebP（5MB以下）・ PDF（10MB以下）
```

#### 到達経路

src/app/(admin)/admin/(dashboard)/inquiries/\[id\]/\_components/InquiryDetail.tsx:238 が InquiryAttachments を描画 → 管理者が src/app/(admin)/admin/(dashboard)/inquiries/\[id\]/\_components/InquiryAttachments.tsx:144-151 の \<input type="file"\> で 2MB の JPEG を選択（accept による MIME 絞りのみで file.size guard 無し） → InquiryAttachments.tsx:54-59 が multipart FormData を組み Server Action `uploadInquiryAttachment(formData)` を呼ぶ → node\_modules/next/dist/server/app-render/action-handler.js:517-519 が `bodySizeLimitBytes = 1MB` を算出（next.config.ts:169-222 に experimental.serverActions が無く、リポジトリ全体の bodySizeLimit grep も 0 件） → 同 :680-706 の node multipart fetch-action 分岐が body を :666-671 の sizeLimitTransform に通し、1MB 超で `ApiError(413)` を throw → src/app/(admin)/admin/(dashboard)/\_shared/actions/inquiry.ts:219-257 の action 本体が起動せず、src/shared/domain/inquiries/attachment-commands.ts:139（AGGREGATE 上限）および :159-166（per-MIME 5MB/10MB）の検証に到達しない → クライアント側は node\_modules/next/dist/client/components/router-reducer/reducers/server-action-reducer.js:135-143 が content-type ≠ text/x-component を検出して throw → InquiryAttachments.tsx:59 の await が reject し、:60 の isMutationError(result) は評価されず :61 の toast.error は発火しない。誤った結果: :162 が約束する 5MB/10MB のうち 1MB 未満のファイルしか通らず、サイズ超過である旨は一切表示されないまま src/app/(admin)/admin/(dashboard)/error.tsx のエラー画面に遷移する（加えて :66-68 の input.value リセットは await の後段なので実行されず、同一ファイルの再選択では change イベントが再発火しない）。

#### 既存の検査

next.config.ts に experimental.serverActions は無い（next.config.ts:169 の experimental ブロックには cachedNavigations / globalNotFound / turbopack キャッシュのみ）。\_\_tests\_\_/unit/architecture/ に next-config 関連 gate は next-config-cache-tag-emission.test.ts と next-config-cached-navigations-off.test.ts の 2 本のみで、どちらも bodySizeLimit を見ていない。e2e/ 配下に添付アップロードを踏むテストは 0 件（grep で attachment/添付 のヒット無し）。unit テスト \_\_tests\_\_/unit/domain/inquiries/attachment-commands.test.ts は command を直接呼ぶため Next の body 制限を通らない。

#### 反証官による訂正

中核の主張は正しく、引用・行番号・Next 内部の参照先（action-handler.js:669 と :519）はいずれも実体と一致した。ただし記述に 2 点の事実誤認・不正確がある。

\1) 「無言に失敗」は言い過ぎ。src/app/(admin)/admin/(dashboard)/error.tsx が実在するため、React 19 が async transition の reject を最寄り境界へ送った結果、ユーザーにはダッシュボードのエラー画面が表示される。表示されないのは「サイズが大きすぎる」という原因説明であって、エラーの存在自体ではない。症状は「無言」ではなく「原因不明のエラー画面 + ページ状態の喪失」。

\2) 観点「inquiries」への切り分けが誤り。これは問い合わせ添付固有ではなく、multipart FormData を受ける Server Action すべてに等しく効く。src/app/(admin)/admin/(dashboard)/\_shared/actions/media.ts:24 の uploadMedia は同形で、src/app/(admin)/admin/(dashboard)/media/\_components/MediaUploadDialog.tsx:119 から呼ばれ、src/shared/lib/r2/media-size.ts:26-36 が画像 5MB / 動画 50MB / 音声 20MB / PDF 10MB を SSoT として宣言している。MediaUploadDialog.tsx:71 の validateFile は 5MB/50MB 基準の事前 guard なので 1MB 天井には無力。つまり修正は inquiries 局所の変更ではなく next.config.ts への設定キー 1 つ（および UI 表示との整合）であり、指摘の置き場所が実態より狭い。逆に言えば、この 1MB 天井が本当に効いているならメディアライブラリも同時に壊れているはずで、影響範囲の見積もりを inquiries に閉じたのは過小評価。

\3) 軽微: 引用元として挙げられた attachment-commands.ts:159-166（per-MIME 上限）は正しいが、その手前の :139 に AGGREGATE\_MAX\_SIZE\_BYTES（許可 MIME の最大値 = 10MB）による事前チェックがあることに触れていない。結論は変わらない（どちらも 413 の後段で未到達）。

深刻度は high → medium に補正した。管理画面限定（IAP 配下）でデータ損失・セキュリティ影響が無く、完全に回復可能（ファイルを縮めれば通る）で、修正コストも設定 1 行。一方で 2〜5MB という現実的な入力の大半が失敗し、原因が利用者に伝わらないため low ではない。

---

### F-34

**配列アイテム追加時に select フィールドへ "" を入れるため、ボタンを1件足すとセクションが保存不能（無反応）になる**

<sub>[対処の記録](2026-08-12-codebase-audit-progress.md) ／ [棄却一覧](2026-08-12-codebase-audit-refuted.md)</sub>

|        |                                                                                                          |
| ------ | -------------------------------------------------------------------------------------------------------- |
| 深刻度 | 中                                                                                                       |
| 箇所   | `src/app/(admin)/admin/(dashboard)/pages/[slug]/_sections/_components/auto-fields/AutoArrayField.tsx:89` |
| 領域   | admin コンテンツ編集                                                                                     |

#### 起きること

cta セクション（他に hero / hero-parallax / page-hero の全 variant も同型）を開き「ボタン」の 追加 を押す。createEmptyItem() が itemFields 全キーに "" を入れるので form.insert の defaultValue は { label:"", url:"", variant:"", size:"", openInNewTab:"", backgroundColor:"", textColor:"" }。AutoSelectField は control.value="" のまま \<input type="hidden" name="buttons\[0\].variant" value=""\> を描画し、Radix Select は value prop 無し（=プレースホルダー表示）になるため、管理者には「未選択」であることが分からない。ラベルと URL を入力して 保存 を押すと、conform の parse は空文字をそのまま payload に載せる（@conform-to/dom setPathValue は "" を除去しない）ので ctaConfigSchema.safeParse に buttons\[0\].variant="" が渡る。field.select は z.enum(...).default(...) で preprocess が無く、ZodDefault は input===undefined のときしか発火しないため enum が "" を拒否 → submission.status==="error" → onSubmit の `if (!submission || submission.status !== "success") return;` で onSave が呼ばれない。エラーキーは "buttons.0.variant"（helpers.ts の path 表記）で conform のフィールド名 "buttons\[0\].variant" と一致せず、form.errors も描画箇所が無いので画面には何も出ない。結果、管理者から見て 保存 ボタンが完全に無反応になり、そのセクションで行った他の編集（見出し・説明文・背景色）もすべて保存できない。variant と size を手動で選び直すまで復帰しない。

#### 直し方

createEmptyItem() の switch に select / dynamicSelect 分岐を足し、fieldType==="select" のキーは値を入れない（undefined のままにして ZodDefault を発火させる）か、zod-introspection の getSelectOptions で得た先頭 option（あるいは schema の default）を初期値にする。前者なら AutoSelectField 側も control.value===undefined を扱えるようにする。

#### 該当箇所

```
empty[f.key] = "";
```

#### 到達経路

src/app/(admin)/admin/(dashboard)/pages/\[slug\]/edit/\_components/SectionEditPanel.tsx:114 (AutoSectionForm, section.type="cta") → src/app/(admin)/admin/(dashboard)/pages/\[slug\]/\_sections/\_components/auto-section-form.tsx:486-506 (case "array" → AutoArrayField) → src/app/(admin)/admin/(dashboard)/pages/\[slug\]/\_sections/\_components/auto-fields/AutoArrayField.tsx:113-118 (「追加」onClick → form.insert({defaultValue: createEmptyItem()})) → 同 AutoArrayField.tsx:79-96 (createEmptyItem が全 itemFields に "" を代入、select も line 89 の default 分岐) → node\_modules/@conform-to/dom/dist/submission.mjs の normalize() が "" を落とすため field.initialValue は undefined → src/app/(admin)/admin/(dashboard)/pages/\[slug\]/\_sections/\_components/auto-fields/AutoSelectField.tsx:58-72 (rawValue="" のまま `<input type="hidden" name="buttons[0].variant" value="">` を無条件描画) → FormData に buttons\[0\].variant="" / buttons\[0\].size="" (実測) → src/app/(admin)/admin/(dashboard)/pages/\[slug\]/\_sections/\_components/auto-section-form.tsx:91-105 (onValidate → ctaConfigSchema.safeParse) → src/shared/lib/sections/definitions/\_shared/buttons.ts:45-52 → src/shared/lib/sections/field-registry.ts:312-315 (z.enum().default() は "" を拒否) → src/app/(admin)/admin/(dashboard)/pages/\[slug\]/\_sections/\_components/auto-section-form/helpers.ts:53 (キーが "buttons.0.variant" になり conform の "buttons\[0\].variant" と不一致 → field.errors 空 → 画面表示ゼロ) → src/app/(admin)/admin/(dashboard)/pages/\[slug\]/\_sections/\_components/auto-section-form.tsx:108 (status!=="success" で早期 return、onSave 未呼び出し = 保存ボタン無反応)

#### 既存の検査

\_\_tests\_\_/unit/components/admin/auto-section-form.test.tsx の「配列フィールドの追加ボタン…」テストは featuresConfigSchema（items の子は icon / portableTextInline / portableTextBlock のみで select を含まない）を使い、しかも追加後に #1 が出ることしか見ておらず submit を通していない。select を子に持つ配列（createButtonsArraySchema）を追加→保存する経路は unit / integration とも未カバー。

#### 反証官による訂正

欠陥自体は確認済み（CONFIRMED）。ただし申告に 4 点の事実誤認・過大評価がある。

\1. **深刻度 high → medium。** 新規 item は select 以前に `url` が必須で空のため必ず invalid（`createInternalAppRouteSchema` は空文字を許さない。実測: `buttons.0.url` に「内部パス（/で始まり // ではないパス）を入力してください」）。つまり管理者は追加した item を必ず触る必要があり、その流れで「ボタンの種類/大きさ」の Select を選ぶのは自然な操作。逃げ道が 2 クリックで存在し、データ破損も公開面への影響も無い（admin surface 限定・セッション内で回復可能）。

\2. **「管理者には『未選択』であることが分からない」は誤り。** AutoSelectField.tsx:80 の `SelectValue placeholder` により Radix Select は「選択してください」を表示するので、未選択であること自体は画面に出ている。見えないのは \*エラー\* のほうだけ。

\3. \*\*line 89 を `undefined` に変えても直らない。\*\* conform の `normalize()`（@conform-to/dom submission.mjs）は insert 時の state 生成（flatten）で "" を落とすので `field.initialValue` は "" でも undefined でも同じく undefined になり、"" の実際の出所は AutoSelectField.tsx:58-72 が値なしのとき `value=""` の hidden input を無条件に描画する点。修正は「createEmptyItem が select に zod の default（"primary"/"lg"）を入れる」か「AutoSelectField が値なしのとき hidden input を出さない」のどちらかで、前者を採るなら line 89 は正しい修正箇所。

\4. **エラー不可視は独立した 2 つ目の欠陥。** `formatZodFieldErrors`（helpers.ts:53）が zod path を dot 連結するため配列 index を含むキーが conform の bracket 記法と噛み合わない。これは variant/size だけでなく \*\*`url` 必須エラーも同様に握り潰す\*\*ので、select を直しても「URL 未入力のまま保存 → 無反応」は残る。指摘に含まれてはいるが、こちらのほうが根本原因として広い。

---

### F-35

**AutoGroupField を折りたたんだまま保存すると group 内の値が黙って消える**

<sub>[対処の記録](2026-08-12-codebase-audit-progress.md) ／ [棄却一覧](2026-08-12-codebase-audit-refuted.md)</sub>

|        |                                                                                                          |
| ------ | -------------------------------------------------------------------------------------------------------- |
| 深刻度 | 中                                                                                                       |
| 箇所   | `src/app/(admin)/admin/(dashboard)/pages/[slug]/_sections/_components/auto-fields/AutoGroupField.tsx:72` |
| 領域   | エディタ内部                                                                                             |

#### 起きること

page-hero の compact variant を編集中、「ヒーロー画像」グループのヘッダをクリックして折りたたむ（AutoGroupField.tsx:59-71 の toggle ボタン）。その状態でタイトルだけ直して「保存」を押すと、`image.url` / `image.alt` の input が DOM から unmount されているため FormData に `image.*` が 1 件も入らない。AutoSectionForm.tsx:93 の `parse(formData, …)` が作る payload に `image` キーが無くなり、page-hero/schema.ts:73-84 の `z.object({url, alt}).prefault({})` が `{url:"",alt:""}` を補って parse が成功するため、`submission.status === "success"` のまま `onSave({config})` に到達し、選択済みのヒーロー画像 URL が空文字で上書き保存される。エラーも警告も出ず、admin は画像が消えた理由を知る手がかりが無い。media variant の `posterImage`（page-hero/schema.ts:134-146）も同じ helper なので同型。

#### 直し方

折りたたみを表示だけの操作にする。`{isOpen && (<CardContent …>)}` をやめ、CardContent を常に mount したうえで `hidden` 属性か CSS（`data-state` + `display:none`）で隠す。Tabs 側で forceMount を選んだのと同じ理由がここにも当てはまる。

#### 該当箇所

```
{isOpen && (
```

#### 到達経路

src/app/(admin)/admin/(dashboard)/pages/\[slug\]/edit/\_components/SectionEditPanel.tsx:114 (AutoSectionForm を描画)
→ src/app/(admin)/admin/(dashboard)/pages/\[slug\]/\_sections/\_components/auto-section-form.tsx:204-208 (mediaFields = subGroup:"media" を renderTopLevelField)
→ auto-section-form.tsx:519-538 (case "group" → AutoGroupField)
→ src/app/(admin)/admin/(dashboard)/pages/\[slug\]/\_sections/\_components/auto-fields/AutoGroupField.tsx:38 (useState(true)) → :59-63 (ヘッダ button で setIsOpen(false))
→ AutoGroupField.tsx:72 `{isOpen && (` が false → :73-83 の CardContent ごと unmount
→ src/app/(admin)/admin/(dashboard)/pages/\[slug\]/\_sections/\_components/auto-section-form/AutoImageFieldControlled.tsx:21 の `<input type="hidden" name="image.url">` が DOM から消える（代替 input 無し。node\_modules/@conform-to/react/dist/integrations.js:257-262 の dummy select は実要素があるため元々未生成）
→ 送信時の FormData に image.url / image.alt が 1 件も無い
→ node\_modules/@conform-to/dom/dist/submission.js:19-49 getSubmissionContext が body.entries() のみで payload を構築 → payload に image キーが無い
→ auto-section-form.tsx:91-104 onValidate → :93 parse(formData, {resolve}) → :94 activeSchema.safeParse(payload)
→ src/shared/lib/sections/definitions/page-hero/schema.ts:73-84 image: z.object({url,alt}).prefault({}) + src/shared/lib/sections/field-registry.ts:345-347 (image は .default("")) / :200-202 (text は .default("")) → {url:"",alt:""} で **成功**
→ auto-section-form.tsx:106-112 submission.status === "success" → onSave({config})
→ SectionEditPanel.tsx:61-74 handleSave → updatePageSection(section.id, {config})
→ src/app/(admin)/admin/(dashboard)/\_shared/actions/page-section.ts:56-82
→ src/shared/domain/sections/commands.ts:78-91 prisma.section.update({data:{config: cloneJsonValue(config)}}) が config を丸ごと置換
→ 誤った結果: 選択済みヒーロー画像 URL が空文字で上書きされ、公開ページの画像が消える。保存時にエラー・警告は一切出ない。

#### 既存の検査

同種の unmount 問題は `__tests__/unit/components/editor/inline/settings-dialog-structure.test.ts` が SettingsDialog の TabsContent に `forceMount` を強制する形で既に gate 化されており、AutoSectionForm 自身も TabsContent に forceMount を付けている（auto-section-form.tsx:230,233）。AutoGroupField だけがその対象外。`__tests__/unit/components/admin/auto-section-form.test.tsx` は配列の追加ボタン 1 本のみで group を触っていない。

#### 反証官による訂正

**指摘は成立する（refuted=false）。** ただし severity は high → medium に補正。

高すぎると判断した理由:
\- 既定は開いた状態（AutoGroupField.tsx:38 `useState(true)`）。通常の保存フローでは発生せず、**ユーザーが明示的にヘッダをクリックして畳む**という操作が前提。放置して起きる類の欠陥ではない。
\- 保存直後に SectionEditPanel.tsx:115 の `key={section.id-updatedAt}` で AutoSectionForm が remount され、`useState(true)` に戻って group が開く。つまり **消えた事実は保存直後に画面上で見える**（報告の「admin は理由を知る手がかりが無い」は言い過ぎ。手がかりが無いのは \*原因\* であって \*結果\* ではない）。
\- 損失は画像を選び直せば復旧可能。認証・権限・課金・公開データ破壊のような不可逆性は無く、admin 権限保持者にしか起こせない。

一方、報告が **過小評価**している点（severity を medium 未満に落とさない理由）:
\- 影響範囲は page-hero の `image` / `posterImage` だけではない。`fieldType:"group"` は他に src/shared/lib/sections/definitions/\_shared/image.ts:33,48 と \*\*src/shared/lib/sections/definitions/\_shared/layout.ts:39-64 の `sectionLayoutSchema`\*\* にも付いており、後者は全 23 section に `layout:` として注入されている（layout.ts:5 のコメント）。デザインタブでこの group を畳んで保存すると containerWidth / hideOnMobile / hideOnDesktop / animateOnScroll が **全て既定値へ黙って戻る**。同一の欠陥がリポジトリのほぼ全 section に効く。
\- 皮肉なことに SectionEditPanel.tsx:51-56 のコメントは「無関係な 1 項目を直して保存した時点で本物の設定が既定値で上書きされる」ことを明示的に危険と認識し、そのためだけにフォーム自体を出さない gate を設けている。同じ失敗モードが group 折りたたみ経由で素通りしている。

報告の事実誤りの訂正:
\- ファイル名は `AutoSectionForm.tsx` ではなく \*\*`auto-section-form.tsx`\*\*（同名の .tsx は存在しない）。行番号 93 / 230,233 自体は正しい。
\- 「conform の useInputControl が張る dummy select も unmount cleanup で除去されるため代替経路が残らない」— 結論は正しいが理由が違う。integrations.js:257-262 の `createDummySelect` は `getEventTarget(form, meta.name)` が実要素を見つけられなかったときにだけ生成される。AutoImageFieldControlled.tsx:21 が実 input を出しているので dummy select は**そもそも一度も作られない**。cleanup の有無に関係なく代替経路は最初から存在しない。
\- 「`__tests__/unit/components/admin/auto-section-form.test.tsx` は配列の追加ボタン 1 本のみ」— 正確（test は :216 の 1 本だけ）。
\- 「settings-dialog-structure.test.ts が forceMount を強制」— 正確だが、その gate は SettingsDialog.tsx を readFileSync するだけの単一ファイル走査（:5-17, :33-38）で、他コンポーネントへ波及する性質のものではない。「AutoGroupField だけが対象外」という書き方は、あたかも横断 gate があるかのように読めて誤解を招く。

修正方針として妥当なのは forceMount 相当（`hidden` 属性 + CSS で隠すか、値だけ hidden input で常時出す）で、AutoGroupField.tsx:72 の条件描画を DOM 保持に変えること。ただし本タスクの範囲外なので実装はしていない。

---

### F-36

**繰返し予約の「終了日」指定が UTC 深夜で切られ、終了日当日の予約が作成されない**

<sub>[対処の記録](2026-08-12-codebase-audit-progress.md) ／ [棄却一覧](2026-08-12-codebase-audit-refuted.md)</sub>

|        |                                                                                |
| ------ | ------------------------------------------------------------------------------ |
| 深刻度 | 中                                                                             |
| 箇所   | `src/app/(admin)/admin/(dashboard)/reservations/_components/rrule-utils.ts:77` |
| 領域   | 予約                                                                           |

#### 起きること

管理画面で「毎週火曜 10:00-12:00、終了日 2026-09-29」の繰返し予約を 2026-09-01(火) 起点で作成する。UI の想定（RecurrencePreview は「2026-09-29 まで」と表示）では 9/1・9/8・9/15・9/22・9/29 の 5 件。実際は UNTIL=20260929T000000Z（= JST 09-29 09:00）となり、9/29 の occurrence は UTC 2026-09-29T01:00:00Z で UNTIL を超えるため rrule に除外され、4 件しか作られない。予約開始時刻が JST 09:00 より後であれば（既定営業時間 09:00-21:00 の実質すべての枠で）終了日当日の 1 件が必ず落ちる。エラーも警告も出ず「4 件の予約を作成しました」とだけ表示され、顧客は最終日の予約があると思って来訪する（その枠は他の予約に取られうる）。

#### 直し方

UNTIL は「JST 終了日の 23:59:59 に相当する UTC 時刻」で出す。つまり終了日 YYYY-MM-DD に対し JST 翌日 00:00 の直前 = `<YYYY-MM-DD>T14:59:59Z`（JST=UTC+9 固定）を出力する。JST 変換は既存 SSoT（src/shared/lib/date-format.ts の parseDateTimeLocalAsJst 相当）に寄せ、client bundle に持ち込めないなら server 側 (series.ts) で終了日文字列から UNTIL を組み立てる。あわせて「終了日当日を含む／含まない」を 1 本のテストで固定する。

#### 該当箇所

```
function formatUntil(isoDate: string): string {
return `${isoDate.replaceAll("-", "")}T000000Z`;
}
```

#### 到達経路

e2e 相当の手動導線: 管理画面 繰返し予約フォーム → RecurrenceFields.tsx:194-203 で「終了日」を選択 → RecurrenceFields.tsx:220-225 の date input に 2026-09-29 → RecurringReservationForm.tsx:182-191 が endMode="until" / until="2026-09-29" を hidden input で送信 → reservation-form-schema.ts:296-301,330-338 を素通り（形式・非空のみ）→ src/app/(admin)/admin/(dashboard)/\_shared/actions/reservation/series.ts:61 で dtstart = parseDateTimeLocalAsJst("2026-09-01T10:00") = 2026-09-01T01:00:00Z（src/shared/lib/date-format.ts:119-127 が "+09:00" 付与）→ series.ts:88-95 buildRruleString({until:"2026-09-29"}) → rrule-utils.ts:64-66 → rrule-utils.ts:77-79 formatUntil が "UNTIL=20260929T000000Z" を生成 → series-commands.ts:133-141 validateRruleForSeries → src/shared/domain/reservations/series-rrule.ts:19-21 parseRruleString が series-rrule.ts:110-118 toIcalDate（getUTC\*）で "DTSTART:20260901T010000Z" を出力 → series-rrule.ts:93 rule.between(dtstart, dtstart+2y, true) が 2026-09-29T01:00:00Z \> UNTIL(2026-09-29T00:00:00Z) を除外して 4 件を返す → series-commands.ts:143-147 で instanceWindows が 4 件 → series.ts:130-132,157 が「4 件の予約を作成しました」を返す（RecurrencePreview.tsx:79 は「2026-09-29 まで」と表示したまま、警告なし）。

#### 既存の検査

none。\_\_tests\_\_/unit/app/admin/reservations/rrule-utils.test.ts:39 は `FREQ=DAILY;INTERVAL=2;UNTIL=20260901T000000Z` という文字列生成のみを固定し、その UNTIL で実際に何 instance が展開されるかは見ていない。\_\_tests\_\_/unit/domain/reservations/series-rrule.test.ts の UNTIL ケース (line 122-131) は上限超過の判定のみ。E2E の create-recurring-reservation.spec.ts も件数の境界は検証していない。

#### 反証官による訂正

記述自体に事実誤認は無い（境界条件「JST 09:00 より後」も実測と一致。ちょうど 09:00 JST 起点なら UNTIL と同値で inclusive のため 5 件作られる）。補足 3 点。(1) 深刻度は high ではなく medium が妥当: 影響面が admin 専用フォームに閉じ、endMode の既定は "count"（RecurringReservationForm.tsx:64）で「終了日」モードは opt-in、かつ結果件数は series.ts:157 の success message と作成後の instance 一覧で可視。データ破壊・課金・認可への波及は無く、admin が 1 件追加すれば復旧できる。ただし UI プレビューと実結果が無警告で食い違う点は実在の欠陥で、修正対象。(2) 指摘のスコープは根本原因より狭い。同じ「tzid 無し + UTC 実時刻 DTSTART」設計により、09:00 JST より前の開始時刻では BYDAY の曜日自体がずれる（実測: 2026-09-01(火) 08:00 JST 起点 + BYDAY=TU → 生成は 2026-09-01T23:00Z 等 = JST では水曜）。UNTIL だけを直しても曜日ずれは残るため、修正は formatUntil 単体ではなく zoning 契約全体で検討すべき。(3) rrule-utils.ts:73-76 の JSDoc は「validation 側 series-rrule.ts と同じ zoning」と主張するが、series-rrule.ts には UNTIL の zone 変換ロジックが存在しない（parse して between するだけ）。この整合性の主張は現状の実装に対応していない。

---

### F-37

**Instagram の VIDEO 投稿は動画 URL を next/image に渡すため公開トップのタイルが必ず壊れる**

<sub>[対処の記録](2026-08-12-codebase-audit-progress.md) ／ [棄却一覧](2026-08-12-codebase-audit-refuted.md)</sub>

|        |                                                        |
| ------ | ------------------------------------------------------ |
| 深刻度 | 中                                                     |
| 箇所   | `src/app/(public)/_components/InstagramSection.tsx:87` |
| 領域   | メディア・R2・OAuth                                    |

#### 起きること

Instagram Graph API は VIDEO メディアの media\_url に .mp4 の CDN URL を返し、画像は thumbnail\_url にしかない（IMAGE / CAROUSEL\_ALBUM は media\_url が画像）。cron が 30 分ごとに syncInstagramFeed で mediaType=VIDEO / mediaUrl=\<mp4\> を保存し、InstagramSection がそれをそのまま `<Image src>` に渡す。ブラウザは /\_next/image?url=\<mp4 の encode\> を叩き、Next の image-optimizer が detectContentType で video/mp4 を得て 400 "The requested resource isn't a valid image." を返す。結果、リール/動画投稿のタイルは bg-muted の空箱に再生アイコン（同ファイル111-118行の VIDEO indicator）だけが載った状態で公開トップに並ぶ。管理画面側に差し替え手段は無い。

#### 直し方

getInstagramPosts の select と InstagramPostRecord に thumbnailUrl を足し、InstagramSection では VIDEO のとき thumbnailUrl を優先して src にする。thumbnailUrl が null の VIDEO は既存の IconBrandInstagram fallback に落とす（`post.mediaUrl ?` の分岐を mediaType 込みの派生値にする）。

#### 該当箇所

```
src={post.mediaUrl}
```

#### 到達経路

src/app/api/cron/instagram-sync/route.ts:61 `fetchInstagramFeed(token, 12)` → src/shared/lib/instagram/index.ts:200（fields に media\_url と thumbnail\_url を両方要求）→ index.ts:209-219（VIDEO でも `mediaUrl: item.media_url` を素通し、置換なし）→ route.ts:64 `syncInstagramFeed(items)` → src/shared/domain/instagram/commands.ts:152,156（mediaUrl=\<mp4\> と thumbnailUrl=\<jpg\> を両方 INSERT）→ src/app/(public)/\_shared/components/sections/section-renderer.tsx:570-575（SectionType.INSTAGRAM → `getInstagramPosts()`）→ src/shared/domain/instagram/queries.ts:62-71（select に thumbnailUrl が無い / 型は src/shared/domain/instagram/types.ts:4-13）→ src/app/(public)/\_components/InstagramSection.tsx:85（`post.mediaUrl` は zod 必須なので常に truthy: src/shared/lib/instagram/index.ts:35）→ InstagramSection.tsx:86-92 `<Image src={<mp4>}>`（mediaType で分岐しない。111-118 は再生アイコンを重ねるだけ）→ next.config.ts:133-152（unoptimized / loaderFile 無し）→ ブラウザが /\_next/image?url=\<mp4 encode\> を要求 → node\_modules/next/dist/server/image-optimizer.js:312（detectContentType は画像 magic bytes のみ → mp4 は null）→ 同 1081-1086 `throw new ImageError(400, "The requested resource isn't a valid image.")` → InstagramSection.tsx:83 の aspect-square bg-muted が空箱のまま、再生アイコンだけが載ったタイルが公開ページに並ぶ

#### 既存の検査

無し。managed-media-clean-break.test.ts は MediaPicker の showUrlTab と hero の preload しか見ない。Instagram セクションを描画する e2e / unit も無い。

#### 反証官による訂正

欠陥そのものは実在するが、見出しの「必ず壊れる」は誇張。壊れるのは VIDEO タイルだけで、IMAGE / CAROUSEL\_ALBUM は正常（前者は media\_url が画像）。しかも成立には 3 条件が要る: (a) Instagram が OAuth 接続済み（未接続なら cron は route.ts:52-58 で skip して DB は空 → InstagramSection.tsx:58-67 の「投稿を準備中です」空状態）、(b) 誰かが instagram セクションを公開ページに配置済み（prisma/seed.ts は instagram セクションを一切作らないので既定では未配置。ただし page-templates.ts:55 で全テンプレート追加可）、(c) 直近 12 件に動画/リールが含まれる。影響はクラッシュでも情報漏れでもなく、タイルが空箱＋再生アイコンになるだけで a 要素のリンクは機能し、他セクションの描画も止まらない。よって high ではなく medium。事実誤認の訂正 1 件: 「既存カバレッジ無し」は結論としては正しいが、\_\_tests\_\_/unit/domain/instagram/commands.test.ts:379-386 に VIDEO=.mp4 mediaUrl ＋ 別 thumbnailUrl という**まったく同じ前提の fixture が既にあり、thumbnailUrl の永続化まで assert している**。つまり「VIDEO の media\_url は mp4」という外部 API の前提は repo 自身のテストが追認しており、欠けているのは読み出し側（queries.ts の select と JSX）のテストだけ。これは指摘の補強材料であって反証ではない。副次的な確認: 400 の分岐は content-type 判定に依らずとも起きうる（video CDN のホストが remotePatterns の `*.cdninstagram.com` / `*.fbcdn.net` に一致しない場合も別経路で 400）ので、可視的な結果は同じ。修正は thumbnailUrl を queries.ts の select・types.ts の InstagramPostRecord・JSX の fallback（VIDEO は thumbnailUrl ?? mediaUrl）の 3 箇所に通すだけで、DB 列も migration も既に存在する。

---

### F-38

**メンテナンス中でもマイページ経由の予約キャンセル/変更は通り、Stripe 返金とメール送信が実行される**

<sub>[対処の記録](2026-08-12-codebase-audit-progress.md) ／ [棄却一覧](2026-08-12-codebase-audit-refuted.md)</sub>

|        |                                                              |
| ------ | ------------------------------------------------------------ |
| 深刻度 | 中                                                           |
| 箇所   | `src/app/(public)/mypage/_shared/actions/reservation.ts:124` |
| 領域   | Server Action                                                |

#### 起きること

管理者が Settings でメンテナンスモードを ON にする（breaking migration の計画ダウンタイム等、公開側の書込を止めたい状況）。MaintenanceGate は「描画層」しか塞がないため、直前に /mypage/reservations/\[id\] を開いていた会員（またはその Server Action を直接 POST する者）は cancelReservationAction / updateReservationAction / cancelReservationSeriesCustomerAction / startCheckoutSessionAction / replyToInquiryAction をそのまま実行できる。cancelReservationAction は applyCancellationSideEffects まで到達し、書込凍結中に Stripe 返金・GCal 削除・顧客/管理者メール・監査ログが発火する。同じ「予約キャンセル」でもゲストのメールリンク経路（/reservation/cancel）は runGuestTokenMutation が必ず maintenance ブロックを返すため拒否され、会員だけが素通りするという非対称な挙動になる。

#### 直し方

guest 経路と同じく、mypage の書込 Server Action の先頭（rate limit より前）で `getPublicMaintenanceBlockMutation()` / `checkPublicSiteWritable()` を呼び、ブロック時に MutationError（または `{ ok:false, error }`）を返す。対象は cancelReservationAction / updateReservationAction / startCheckoutSessionAction / cancelReservationSeriesCustomerAction / replyToInquiryAction。ゲスト側は runGuestTokenMutation が `getMaintenanceBlock` を必須フィールドにして機械的に強制しているので、会員側も同様に「maintenance 判定を通らないと mutation に入れない」共通 runner か、公開 mutation 一覧を SSoT にした gate（public-mutation-guard-order.test.ts と同型）で漏れを固定するのが drift しにくい。

#### 該当箇所

```
export async function cancelReservationAction(
reservationId: string,
cancellationReason: string | null = null,
turnstileToken?: string,
): Promise<MutationResult<null>> {
const rateLimit = await checkActionRateLimit(formSubmitRateLimiter);
if (!rateLimit.success) return createMutationError("リクエストが多すぎます");
```

#### 到達経路

エントリポイント: src/app/(public)/mypage/reservations/\[id\]/\_components/cancel-button.tsx:46 `await cancelReservationAction(...)`（またはアクション ID を直接 POST） → src/app/(public)/mypage/\_shared/actions/reservation.ts:119 cancelReservationAction → :124 checkActionRateLimit（maintenance 判定なし）→ :127 validateTurnstile → :136 getCustomerSession（維持: api/customer-auth の 503 は POST 限定・セッション読みは in-process）→ :152 isFeatureEnabled("reservation")（maintenance とは別フラグなので通過）→ :163 cancelCustomerReservation（DB 書込）→ :181 applyCancellationSideEffects → src/shared/domain/reservations/cancellation/apply-instance-side-effects.ts:51-58 requiresRefund 判定 → Stripe 返金 / GCal 削除 / 顧客・管理者メール / 監査ログが書込凍結中に発火。対照（正しく塞がる側）: src/app/(public)/reservation/cancel/\_actions/cancel.ts:54 → src/shared/domain/guest-token-actions/run-guest-mutation.ts:104 `if (maintenanceBlock) return maintenanceBlock;`

#### 既存の検査

none。`grep -rn "checkPublicSiteWritable|getPublicMaintenanceBlockMutation|assertPublicSiteWritable" src` の結果に mypage/\_shared/actions/{reservation,reservation-series,inquiry,profile,account,customer-merge}.ts は 1 件も現れない。\_\_tests\_\_/unit/architecture/ に maintenance を見る gate は無し（`grep -rln maintenance __tests__/unit/architecture/` は playwright-docker-image-tag.test.ts の誤ヒットのみ）。e2e にも maintenance を扱う spec は無し。\_\_tests\_\_/integration/actions/public/mypage-reservation.test.ts は maintenance-guard を mock すらしていない＝import されていない。

#### 反証官による訂正

記述はおおむね正確だが 2 点補足。(1) 抜けているアクションが 1 つ多い: src/app/(public)/mypage/\_shared/actions/event-registration.ts は指摘では「maintenance を見ている側」の対照として挙げられているが、実際にガードがあるのは同ファイル :33 updateCustomerEventRegistrationAction のみで、:157 startEventCheckoutSessionAction は同じファイル内にありながら maintenance 判定を持たない。つまり「mypage で唯一ガード済みのファイル」でさえ片肺。加えて mypage/\_shared/actions/account.ts:65 unlinkAccountAction / :174 deleteAccountAction、profile.ts:39、customer-merge.ts:59,157 も同様に無ガード。(2) 深刻度は medium で妥当だがレンジの下限寄り。認可バイパス・IDOR・情報漏洩は無く、実行者は自分の予約に対してのみ操作でき、所有権・feature flag・締切ルール・レート制限は全て生きている。失われるのは「メンテナンス中は公開側の書込を凍結する」という契約そのもの（helper 名 assertPublicSiteWritable / checkPublicSiteWritable が示す通り write freeze が設計意図）と、その凍結中に Stripe 返金という不可逆な外部副作用が走る点。発火にはメンテナンス ON の窓とログイン済みの stale tab（または action ID を持った直接 POST）が要るため確率は低い。

---

### F-39

**クーポンコードの 1 打鍵ごとに料金プレビュー Server Action が飛び、公開クエリのレート上限（30回/分/IP）を食い潰して料金表示と時間枠取得が壊れる**

<sub>[対処の記録](2026-08-12-codebase-audit-progress.md) ／ [棄却一覧](2026-08-12-codebase-audit-refuted.md)</sub>

|        |                                                                     |
| ------ | ------------------------------------------------------------------- |
| 深刻度 | 中                                                                  |
| 箇所   | `src/app/(public)/reservation/_components/reservation-form.tsx:304` |
| 領域   | フロントエンド                                                      |

#### 起きること

conform の `fields.couponCode.value` は `input` イベントごとに更新される（`@conform-to/dom/dist/form.mjs:410-425` の `onInput` が `updateFormValue` か validate dispatch のどちらかで payload を書き換え、`@conform-to/react/dist/context.mjs:150` の `case 'value'` が購読を張るため毎打鍵で再レンダーされる）。その値を effect の依存に置いているので、「WELCOME2026」と入力するだけで `fetchReservationPricingPreview` が 11 回、打ち直せばさらに増える。この Server Action は `publicQueryRateLimiter`（60 秒 / 30 リクエスト、IP 単位。rate-limit.ts:317-319）を消費し、同じバケットを `fetchAvailableSlots` / `fetchSpaceBlockedDates`（availability.ts:34,58）と、`/claim/reservation`・`/events/cancel`・`/mypage/merge/confirm` 等のページ描画まで共有している。上限を超えると (1) `fetchReservationPricingPreview` が null を返し `setPricePreview(null)` → `price` が null → BookingSummary は価格ブロックごと非表示（booking-summary.tsx:95 `{price !== null ? ... : null}`）になり、利用者は金額が一切表示されないまま「予約を確定する」を押すことになる、(2) 日付を選び直すと `fetchAvailableSlots` が `{ ok:false, reason:"rate_limit" }` を返して時間枠エラー表示になり、再試行ボタンも同じ分の間ずっと失敗する。共有 IP（社内 NAT・キャリア CGNAT）では複数利用者で上限を分け合うためさらに早く到達する。

#### 直し方

クーポンコードだけ他 3 依存から切り離し、既に依存に入っている `use-debounce` の `useDebouncedCallback`（あるいは `useDeferredValue`）で 300〜500ms 落としてから effect の依存に渡す。スペース・日時の変更は即時のままでよい。あわせて、プレビューが取れなかったときに価格ブロックを黙って消さず「料金を計算できませんでした」を出す。

#### 該当箇所

```
const couponCode = fields.couponCode.value?.trim() ?? "";
（…同 320 行）
}, [previewSpaceId, previewStartIso, previewEndIso, couponCode]);
```

#### 到達経路

src/app/(public)/reservation/\_components/customer-step.tsx:222（getInputProps(fields.couponCode) で配線された入力欄に打鍵）→ node\_modules/@conform-to/react/dist/hooks.mjs:40（document の input リスナ）→ node\_modules/@conform-to/dom/dist/form.mjs:410-425 onInput → 同 402-408 updateFormValue もしくは 470-474 report で meta.value 更新 → 同 342 shouldNotify(value) で購読者通知 → node\_modules/@conform-to/react/dist/context.mjs:150-153（reservation-form.tsx:304 の fields.couponCode.value 読み取りが張った value/name 購読）→ src/app/(public)/reservation/\_components/reservation-form.tsx:304 で couponCode が変化 → 同 307-320 useEffect 再実行（:308 の early return は previewSpaceId/StartIso/EndIso が揃っているため通過）→ 同 311 fetchReservationPricingPreview → src/app/(public)/\_shared/actions/reservation.ts:320-321 checkActionRateLimit(publicQueryRateLimiter) → src/shared/lib/action-helpers.ts:114-115（token = client IP）→ src/shared/lib/rate-limit.ts:317-338（30 req / 60s / IP、同バケットを src/app/(public)/\_shared/actions/availability.ts:34 と 58 が共有）→ 超過時 reservation.ts:321 が return null → reservation-form.tsx:318 setPricePreview(null) → 同 322-323 basePrice / price が null → customer-step.tsx:125 で BookingSummary に price={null} → src/app/(public)/reservation/\_components/booking-summary.tsx:95 `{price !== null ? ... : null}` で金額ブロックが丸ごと非表示。同時に availability.ts:34-35 が { ok:false, reason:"rate\_limit" } を返し reservation-form.tsx:391 dispatch({type:"setSlotsError"}) となる。加えてレート上限に達しない場合でも、打鍵ごとに src/shared/domain/reservations/pricing-preview.ts:85-105 が getSpaceRatePlans と validateCoupon の Prisma クエリを実行する。

#### 既存の検査

none。`fetchReservationPricingPreview` の呼び出し回数を見るテストは `__tests__/` `e2e/` に無い（`previewReservationPricing` を参照するのは domain/action の単体・integration とスモーク 1 本のみ）。debounce はこの repo の既存作法で、`use-filter-params.ts:130,195` や `CommandPaletteProvider.tsx:84`、`PageFilters.tsx` が `useDebouncedCallback` を使っているが、この経路だけ素通しになっている。

#### 反証官による訂正

3 点訂正。(1) **事実誤認**: 「admin action 側にこの IP 制限は無い」は誤り。src/app/(admin)/admin/(dashboard)/\_shared/actions/reservation/admin.ts:630-632 が getClientIpFromHeaders() + apiRateLimiter.check(ip) を実行しており（src/shared/lib/rate-limit.ts:227-230、100 req/分/IP）、上限が緩いだけで IP 制限自体は存在する。(2) **見出しの誇張**: 「1 打鍵ごとに…上限を食い潰して壊れる」は、クーポン入力単独では成立しない。11 文字なら消費は 30 のうち 11 で、上限到達には同一 60 秒窓内での fetchSpaceBlockedDates / fetchAvailableSlots / 日時変更ごとの preview との累積、打ち直し、または共有 IP（NAT・CGNAT）が追加条件として要る。単独ユーザーが専有 IP で step 1-2 に 60 秒以上かけた後にクーポンを打つ通常経路では、上限には届かない可能性が高い。したがって「利用者に金額が表示されないまま確定を押す」という結末は条件付きであり、無条件ではない。(3) 引用行番号の軽微なずれ: admin 側の同型コードは ReservationForm.tsx:157-178（報告は 158-178）。なお報告が過小評価している点として、レート上限に達しなくても打鍵ごとに pricing-preview.ts:85-105 の Prisma クエリ 2 本（getSpaceRatePlans / validateCoupon）が無認証の公開エンドポイントで走る、という確実なコストがある。欠陥の実体は「network + DB 呼び出しを打鍵に直結させ debounce を欠いている」ことで、これは実在し、medium 相当。

---

### F-40

**配信停止リンクの GET が副作用を実行し、メールの link scanner のプリフェッチだけで顧客が勝手に opt-out される**

<sub>[対処の記録](2026-08-12-codebase-audit-progress.md) ／ [棄却一覧](2026-08-12-codebase-audit-refuted.md)</sub>

|        |                                                                 |
| ------ | --------------------------------------------------------------- |
| 深刻度 | 中 ／ 重複統合                                                  |
| 箇所   | `src/app/api/email/unsubscribe/route.ts:101`                    |
| 領域   | 認証・認可 / API / cron / webhook / メール・通知 / セキュリティ |

#### 起きること

運営がマーケ一斉配信を送る。本文には `<a href={unsubscribeUrl}>`（src/shared/emails/customer-broadcast.tsx:64、src/shared/emails/event-broadcast.tsx:99）として `/api/email/unsubscribe?token=...` が入る。受信側の Outlook SafeLinks / Gmail のリンクプリフェッチ / Slack unfurl / iMessage プレビューがこの URL を GET で取得した時点で、`processUnsubscribe` → `optOutCustomerMarketingById(verified.customerId)` が実行され、顧客は一度もクリックしていないのに `marketingOptIn=false` になる。トークン TTL は 90 日なので、同じメールが後日スキャンされても同様に発火する。User 未リンクのゲスト Customer はマイページを持たないため自力で戻せず、運営に連絡するしかない。

#### 直し方

receipts / verify-email と同じ HTTP-02 の 2-step に揃える。GET は副作用ゼロにし、token を hidden field に載せた `<form method="POST" action="/api/email/unsubscribe">` の確認 HTML だけを返す（トークンの検証は read-only で行い「無効/期限切れ」表示だけ出す）。実際の `optOutCustomerMarketingById` は POST（RFC 8058 の one-click と同じ endpoint・同じ 200 応答）でのみ実行する。併せて既存テストを『GET は optOut を呼ばない』へ反転させ、POST 側で副作用を検証する。

#### 該当箇所

```
export async function GET(request: Request) {
try {
const result = await processUnsubscribe(extractToken(request));
return confirmationHtml(result);
```

#### 到達経路

src/shared/lib/email/customer-emails.ts:51 createMarketingUnsubscribeArtifacts(customer.id) → src/shared/lib/tokens/marketing-unsubscribe-token.ts:80-87（url を本文リンクと List-Unsubscribe ヘッダで共有）→ src/shared/emails/customer-broadcast.tsx:64 href={unsubscribeUrl}（メール本文に GET リンクとして着地）→ メールゲートウェイ/プレビューが GET /api/email/unsubscribe?token=... → src/proxy.ts:52-56（/api/email は public surface blocklist に無く 404 にならない）→ src/proxy.ts:483,519 checkRateLimit → src/shared/lib/rate-limit.ts:579 apiRateLimiter.check（100/分を通過するだけ、method 判定なし）→ src/app/api/email/unsubscribe/route.ts:99-101 GET → :101 processUnsubscribe(extractToken(request)) → :35-37 token あり・検証通過（TTL 90 日: marketing-unsubscribe-token.ts:20）→ :39 optOutCustomerMarketingById(verified.customerId)（分岐なし・確認なし）→ src/shared/domain/customers/commands.ts:321-326 prisma.customer.update({ data: { marketingOptIn: false } })（監査ログ書き込みなし）→ route.ts:102 confirmationHtml("ok") が 200 で返り、顧客はクリックしていないのに配信停止され、誰にも通知されない。

#### 既存の検査

\_\_tests\_\_/unit/api/email-unsubscribe.test.ts:62-73 の「GET: 有効トークンで確認 HTML を返す」が `expect(mockOptOut).toHaveBeenCalledWith("cust-1")` で**現在の副作用付き GET を固定**しており、欠陥として検出しない。同一リポジトリ内の同種問題は HTTP-02 として既に POST 2-step に切り分け済み（src/app/api/receipts/\[serialNo\]/pdf/route.ts:32-41 が『link scanner がメール内リンクを GET プリフェッチし…』と明記、src/app/api/customer/verify-email/route.ts:4-9 も GET は redirect のみで consume しない）が、この route だけ適用漏れ。

#### 反証官による訂正

指摘の記述は概ね正確だが 3 点補足。(1) 影響範囲が過小申告: customer-broadcast だけでなく event-broadcast も同一 URL を使う（src/shared/lib/email/event-emails.ts:923,938 → src/shared/emails/event-broadcast.tsx:99）。(2) optOutCustomerMarketingById は src/shared/domain/customers/commands.ts:321 で `if (existing.marketingOptIn)` を見るため 2 回目以降の GET は UPDATE を発行しない（冪等）。ただし最初の 1 回で確実に false に倒れるので欠陥の成立には影響しない。なお同関数は監査ログを書かないため「管理者にも通知は出ない」という記述は正しい。(3) 修正時の注意として、POST 側（route.ts:82-97）は RFC 8058 one-click の正しい実装であり変更してはいけない。直すのは本文リンクの着地点のみで、receipts / verify-email と同じく確認ページ + `<form method="POST">` の 2-step flow にする必要がある。既存 \_\_tests\_\_/unit/api/email-unsubscribe.test.ts:62-73 は現行挙動を固定しているため、修正時はこのテストの書き換えが必須（gate を弱めるのではなく主張を反転させる）。

---

### F-41

**proxy の matcher に prefetch 除外があり、`purpose: prefetch` ヘッダ 1 本で全 API の IP レート制限が無効化される**

<sub>[対処の記録](2026-08-12-codebase-audit-progress.md) ／ [棄却一覧](2026-08-12-codebase-audit-refuted.md)</sub>

|        |                                 |
| ------ | ------------------------------- |
| 深刻度 | 中 ／ 実コード確認済 / 重複統合 |
| 箇所   | `src/proxy.ts:586`              |
| 領域   | 認証・認可 / ビルド・デプロイ   |

#### 起きること

攻撃者が `curl -H 'purpose: prefetch' -X POST https://<public>/api/customer-auth/sign-in/email` を無制限に連投する。Next.js の matcher は `missing` に列挙したヘッダが**存在する**リクエストで proxy 自体を起動しないため、`src/proxy.ts:483` の `/api` 分岐に一度も入らず `checkRateLimit` が呼ばれない。結果、Better Auth の mutation 経路に効くはずの `authMutationRateLimiter`（20 回/15 分/IP、credential stuffing・アカウント列挙の唯一の緩和策）が完全に空振りする。同様に `/api/faq/[id]/helpful`（route 冒頭が『サーバー側は proxy.ts の rate limit（100/min/IP）でスパム防御』と明記し、自前の limiter を持たない）へ無認証 POST を無制限に投げられ、helpfulCount / notHelpfulCount を任意の値まで水増しできる。`/admin/api/*` の expensiveAdminRateLimiter、`/api/webhooks` `/api/cron` の infraEndpointRateLimiter も同じヘッダで素通りする。付随して `isBlockedOnPublicSurface`（public サービスで /admin・/api/admin・/api/health を 404 にする層）も走らなくなる（各 route 側で認可・surface 判定が二重にあるため認可バイパスには至らないが、多層防御の 1 枚が失われる）。

#### 直し方

`missing` による prefetch 除外は「nonce 入りレスポンスを prefetch キャッシュに載せない」ためのもので、Next.js 公式の CSP サンプルでは matcher の source 側が `/((?!api|_next/static|...).*)` と **api を除外した上で**使われている。matcher を 2 エントリに分割し、(1) ページ/ドキュメント用エントリだけに `missing` を残す、(2) `"/api/:path*"` と `"/admin/api/:path*"` を `missing` 無しの別エントリとして追加する。加えて『/api を含む matcher エントリは `missing` を持たない』ことを固定する gate を \_\_tests\_\_/unit/architecture/ に追加し、`config` を import して静的に検査する（現状 proxy テストは関数しか呼んでおらず matcher の回帰を一切捕まえられない）。

#### 該当箇所

```
missing: [
{ type: "header", key: "next-router-prefetch" },
{ type: "header", key: "purpose", value: "prefetch" },
],
```

#### 到達経路

攻撃者が `POST /api/faq/<published-uuid>/helpful` を `purpose: prefetch` 付きで送る
→ src/proxy.ts:586-589（config.matcher\[0\].missing）
→ .next/server/functions-config-manifest.json functions\["/\_middleware"\].matchers\[0\].missing（ビルド済み実物）
→ node\_modules/next/dist/server/lib/router-utils/filesystem.js:281-282（この matchers で middlewareMatcher を構築）
→ node\_modules/next/dist/shared/lib/router/utils/middleware-route-matcher.js:19-24（matcher.missing があるので matchHas へ、false なら continue）
→ node\_modules/next/dist/shared/lib/router/utils/prepare-destination.js:118（`!missing.some((item)=>hasMatch(item))` がヘッダ存在で false）
→ node\_modules/next/dist/server/lib/router-utils/resolve-routes.js:336-345（match() が偽なので middleware を invoke しない）
→ src/proxy.ts:450 proxy() が起動せず、src/proxy.ts:483 の `/api` 分岐と src/proxy.ts:519 の checkRateLimit に到達しない
→ src/app/api/faq/\[id\]/helpful/route.ts:31 POST が自前 limiter なしで実行（route.ts:5 のコメントが proxy.ts への依存を明言）
→ src/shared/domain/faq/analytics-commands.ts:40-46 `helpfulCount: { increment: 1 }` が無制限に加算（誤った結果）

#### 既存の検査

none。proxy 系テスト（\_\_tests\_\_/unit/proxy-infra-rate-limit.test.ts:42、\_\_tests\_\_/unit/proxy-public-surface.test.ts:16、\_\_tests\_\_/unit/proxy/rate-limit-routing.test.ts、\_\_tests\_\_/unit/proxy/probe-rate-limit-exemption.test.ts）はいずれも `proxy(req)` を直接呼ぶだけで `config.matcher` を一切検査していない（`import { proxy } from "@/proxy"` のみ）。\_\_tests\_\_/unit/architecture/ 配下にも matcher を読む gate は無い。インフラ側の代替もない — terraform/variables.tf:90 の `rate_limit_backend` は `in-memory` 固定で、terraform/\*.tf に Cloud Armor / security\_policy / WAF のレート制限リソースは存在しない。

#### 反証官による訂正

指摘の記述に 3 点の事実誤認がある。いずれも「認証面の実害」を過大評価させている。

\1. **「authMutationRateLimiter が credential stuffing・アカウント列挙の唯一の緩和策」は誤り。** Better Auth は組み込み rate limiter を持ち、本番では既定で有効になる — node\_modules/better-auth/dist/context/create-context.mjs:168-174 の `enabled: options.rateLimit?.enabled ?? isProduction`（isProduction は @better-auth/core/dist/env/env-impl.mjs:32 の `nodeENV === "production"`）。src/shared/lib/customer-auth.ts:91-190 は rateLimit を一切上書きしていないため既定が効く。さらに node\_modules/better-auth/dist/api/rate-limiter/index.mjs:370-383 の既定 special rule により `/sign-in*` `/sign-up*` `/change-password*` `/change-email*` は **3 回 / 10 秒**、`/forget-password*` 等は 3 回 / 60 秒。これは proxy の 20 回/15 分より厳しく、しかも **route handler の内側**にあるので prefetch ヘッダでは迂回できない。auth mutation は素通りにならない。

\2. \*\*PoC に挙げた `/api/customer-auth/sign-in/email` は本番に存在しない。\*\* src/shared/lib/customer-auth.ts:110-115 で `emailAndPassword.enabled = NODE_ENV === "development" || isE2EOptIn`。本番では資格情報を検証するエンドポイントとして機能しないため、そこへの連投は credential stuffing にならない。

\3. **観点ラベル「authz」が不適切。** 指摘自身が「認可バイパスには至らない」と認めているとおり、これは認可欠陥ではなく rate-limit / abuse-control の欠落。`/api/cron/*` も src/app/api/cron/\*/route.ts の authorizeCronRequest で個別に認可されており（calendar-sync/route.ts:175 ほか全 route）、infraEndpointRateLimiter の迂回は認可バイパスではなく DoS 面の話に留まる。

以上より、実残存リスクは (a) /api/faq/\[id\]/helpful の投票数水増し（データ完全性、無認証で到達可能）、(b) 公開 API 全般の apiRateLimiter 100/min 失効による DoS 増幅、(c) isBlockedOnPublicSurface という多層防御 1 枚の喪失（route 側に二重防御あり）に限られる。high ではなく medium が妥当。なお機構自体は本物で、config.matcher を検査する gate が 0 件という申告も正しいため、修正（missing を /api 系に効かせない matcher 分割 + gate 追加）自体は妥当な対応。

---

### F-42

**監査ログ CSV エクスポートが 10,000 件で無言に打ち切られ、しかも古い順なので直近の証跡が欠落する**

<sub>[対処の記録](2026-08-12-codebase-audit-progress.md) ／ [棄却一覧](2026-08-12-codebase-audit-refuted.md)</sub>

|        |                                              |
| ------ | -------------------------------------------- |
| 深刻度 | 中                                           |
| 箇所   | `src/shared/domain/audit-log/queries.ts:303` |
| 領域   | API / cron / webhook                         |

#### 起きること

AuditLog は管理操作・ログイン・EXPORT・日次 INTEGRITY\_CHECK・領収書 DL のたびに追記されるため容易に 1 万行を超える。SUPER\_ADMIN が /api/admin/export/audit-logs を期間指定なし（または広い dateFrom/dateTo）で叩くと、createdAt 昇順 + take 10,000 で最も古い 10,000 行だけが返る。CSV にも HTTP 応答にも打ち切りの表示は無く、export 自体を記録する監査行の metadata.exportedCount も 10000 と書かれるだけなので、受け取った側は全件だと信じる。改ざん調査や監査提出で「直近の行が 1 件も入っていない CSV」を完全な証跡として扱ってしまう。route 側が渡す perPage: 10\_000 は getAuditLogsForExport で読まれず死んでおり、上限を変えたつもりでも効かない。

#### 直し方

上限に達したかを検出できる形にする（take: LIMIT + 1 で判定）。到達時は 400/409 で「期間を絞って再実行」を返すか、Content-Disposition と別ヘッダ・CSV 末尾行に打ち切りを明示し、監査行の metadata に truncated: true と実際の該当総件数（count）を記録する。並び順も直近が落ちない向き（desc）か、明示的なページング分割に変える。route 側の死んだ perPage は削除するか、実際に take へ渡す。

#### 該当箇所

```
const logs = await prisma.auditLog.findMany({
where,
select: auditLogSelect,
orderBy: { createdAt: "asc" },
take: AUDIT_LOG_EXPORT_LIMIT,
});
```

#### 到達経路

src/app/(admin)/admin/(dashboard)/audit-logs/\_components/AuditLogFilters.tsx:97 (filter 未設定 → query 無しの export href) → :231 \<a href={exportHref}\> クリック → src/app/api/admin/export/audit-logs/route.ts:69 GET → :71 checkPermission("auditLog","manage") 通過 → :80 auditLogExportQuerySchema.safeParse（全項目 optional、dateFrom/dateTo は "" のまま通る） → :91 getAuditActionFilterOrAll("") → src/shared/lib/validations/enums/helpers.ts:378 が "ALL" を返す → route.ts:88-99 filters（perPage: 10\_000 は以降読まれない） → :101 getAuditLogsForExport → src/shared/domain/audit-log/queries.ts:295 buildAuditLogWhere → :162 action==="ALL" かつ securityOnly=false、:168/:172/:176/:186/:198 も全て偽 → :205 return {}（述語ゼロ） → :299-304 prisma.auditLog.findMany({ where: {}, orderBy: { createdAt: "asc" }, take: 10\_000 }) → 総行数 \> 10,000 のとき最も古い 10,000 行だけが返り、直近の行が 1 件も含まれない → route.ts:103-134 generateCsv（打ち切り列・警告行なし） → :149-155 応答ヘッダにも合図なし → :136-145 createAuditLogRecord({ metadata: { exportedCount: 10000, filters } }) が「10000 件 export した」証跡だけを残す

#### 既存の検査

none。\_\_tests\_\_/unit/api/admin-export-audit-logs.test.ts は 403 と「no-store の CSV を返し export を監査する」の 2 本のみで、件数上限も並び順も検証していない。\_\_tests\_\_/unit/architecture/ に export 行数に関する gate は無い。管理画面側にも上限の注記は見つからなかった（audit-logs ページ配下を grep 済み）。

#### 反証官による訂正

3 点。(1) 既存カバレッジの申告「none」は不正確。\_\_tests\_\_/unit/domain/audit-log/queries.test.ts:387-411 に「export は同じ filter を使い最大 10000 件を古い順で取得する」というテストがあり、`orderBy: { createdAt: "asc" }` と `take: 10000` を明示的に assert している。これは失敗を防いでいないので指摘自体は成立するが、「監査していない」ではなく「現在の挙動が意図として固定されている」が正しい記述で、修正時はこのテストの更新が必須（api 側の \_\_tests\_\_/unit/api/admin-export-audit-logs.test.ts しか見ていない申告は範囲不足）。(2)「perPage: 10\_000 は死んでいる」は言い過ぎ。クエリには効かないが route.ts:143 で `metadata.filters` としてそのまま EXPORT 監査行に永続化されるため、「10,000 件指定で取得した」という誤解を証跡側にも残す。また filters の型が Required\<AuditLogFilters\> なので、route は page/perPage を渡さざるを得ない（型を変えずに削除はできない）。(3)「しかも古い順なので」は設計上の帰結の可能性が高い。AuditLog は sequence/previousHash/entryHash のハッシュチェーンを持ち（queries.ts:83-99 の select）、チェーン検証には昇順が要る。欠陥は昇順そのものではなく「take による打ち切りに一切の合図が無いこと」で、修正方向も並び順の反転ではなく（件数超過の明示 / ストリーミング / 期間必須化）が筋。

---

### F-43

**キャンセル時の自動返金額を総額から計算し、既存の部分返金を差し引かないため返金が丸ごとスキップされる**

<sub>[対処の記録](2026-08-12-codebase-audit-progress.md) ／ [棄却一覧](2026-08-12-codebase-audit-refuted.md)</sub>

|        |                                                                   |
| ------ | ----------------------------------------------------------------- |
| 深刻度 | 中                                                                |
| 箇所   | `src/shared/domain/cancellation/run-auto-refund-on-cancel.ts:164` |
| 領域   | Stripe handler                                                    |

#### 起きること

totalPriceWithTax=10000 の PAID 予約に対し、管理者が先に 3000 円の部分返金を実行する (paymentStatus=PARTIALLY\_REFUNDED、Refund 累計 3000)。その後 startTime の 48 時間前に顧客がキャンセルし、返金ポリシーが「48h 以上前は 100%」だとすると、chargeBase には steps.ts:50 で totalPriceWithTax (10000) がそのまま渡るため refundAmount=10000 になる。executeRefund → refundReservationPaymentCommand → resolveRefundAmount は remaining = 10000 - 3000 = 7000 に対し amount=10000 なので `返金額が残額を超えています (残額: 7000 円)` を throw (stripe-refund-orchestration.ts:81-86) → runAutoRefundOnCancel の catch (line 203-215) が {status:"error"} を返して終わる。つまり**キャンセル分の返金が 1 円も実行されない**。予約は PARTIALLY\_REFUNDED のまま、顧客には返金完了メールも届かず、痕跡は集約 AuditLog metadata の sideEffects.refund.reason と HIGH ログだけで、管理者が手動で返金し直すまで顧客は回復できない。逆にポリシーが 50% の場合は refundAmount=5000 ≤ remaining=7000 で通ってしまい、累計 8000 (80%) が返金されてポリシーの 50% を超える。

#### 直し方

policy を当てる基準額を「まだ返金していない額」に揃える。runAutoRefundOnCancel に cumulativeSoFar (または remaining) を渡して chargeBase から差し引くか、chargeBase は総額のままにして最終額を Math.min(policyAmount, remaining) で丸める契約に変える。どちらを正とするかを resolveRefundAmount と同じ 1 か所で決め、over-refund 防止 (amount \> remaining の reject) はそのまま残すこと。

#### 該当箇所

```
refundAmount = calculateRefundAmount(
```

#### 到達経路

\1. 管理者が部分返金: src/app/(admin)/admin/(dashboard)/\_shared/actions/reservation/payment.ts:112 refundReservationPayment(id, {amount:3000}) → src/shared/domain/reservations/payment-commands.ts:723 resolveRefundAmount → Refund(amount=3000, status=succeeded) + paymentStatus=PARTIALLY\_REFUNDED (payment-commands.ts:788-802)
\2. 顧客/管理者がキャンセル: src/shared/domain/reservations/cancel-core.ts:106-112 は PENDING のみ拒否 → PARTIALLY\_REFUNDED は CANCELLED 化を通過
\3. src/shared/domain/reservations/cancellation/apply-instance-side-effects.ts:48-51 wasPaid=true(PARTIALLY\_REFUNDED を含む) / requiresRefund=true
\4. src/shared/domain/reservations/cancellation/run-instance-side-effects.ts:51 runRefundStep → src/shared/domain/reservations/cancellation/steps.ts:44-50 chargeBase = totalPriceWithTax = 10000（既存返金 3000 を引かない）
\5. src/shared/domain/cancellation/run-auto-refund-on-cancel.ts:163-169 resolution.status==="configured" → refundAmount = calculateRefundAmount(policy, 10000, startTime, now) = 10000 (src/shared/domain/refund/policy.ts:116-124 は cumulativeSoFar を見ない)
\6. :173 の refundAmount\<=0 skip を通過 → :190 executeRefund({amount:10000}) → src/shared/domain/reservations/cancellation/steps.ts:59-65 → src/shared/domain/reservations/payment-commands.ts:714-728 cumulativeSoFar=3000
\7. src/shared/domain/payment/stripe-refund-orchestration.ts:67 remaining=7000 → :81-86 amount(10000) \> remaining(7000) → DomainError「返金額が残額を超えています (残額: 7000 円)」
\8. src/shared/domain/cancellation/run-auto-refund-on-cancel.ts:203-215 catch → {status:"error"}。Stripe 返金は 0 円、paymentStatus は PARTIALLY\_REFUNDED のまま（誤った結果）
別分岐: policy 50% のとき refundAmount=5000 ≤ remaining=7000 なので通り、累計 8000（総額の 80%）が返金され policy の 50% を超える。
同型欠陥: src/shared/domain/events/registration-cancellation/steps.ts:64 chargeBase=registration.paidAmount → events/payment-commands.ts:890- 同じ resolveRefundAmount 経路。

#### 既存の検査

refund policy のテストは calculateRefundAmount / calculateRefundRate 単体で、cumulativeSoFar \> 0 の予約をキャンセルする合成が無い。resolveRefundAmount 側のテストも requestedAmount を直接与えるだけで、policy 由来の額との突き合わせは無い。architecture gate も無し。

#### 反証官による訂正

深刻度 medium は妥当（実金銭の誤り・自動復旧なし・人手の再返金が必要だが、返金は総額を超えない＝ resolveRefundAmount が remaining で頭打ちするため過剰課金にはならず、事前の部分返金という管理者操作を前提とする）。ただし申告に事実誤りが 3 点ある。(1) 場所の表記 `cancellation/steps.ts:50` は誤りで、正しくは `src/shared/domain/reservations/cancellation/steps.ts:50`（`src/shared/domain/cancellation/` にあるのは run-auto-refund-on-cancel.ts のみ）。requiresRefund の算出も run-instance-side-effects.ts ではなく apply-instance-side-effects.ts:51。(2)「痕跡は集約 AuditLog metadata と HIGH ログだけ」は不正確。runNotificationStep（reservations/cancellation/steps.ts:183-185）が requiresRefund=true のとき管理者 in-app 通知「PAID 予約のキャンセル — 要返金確認」を必ず作るため、運用側の検知導線は存在する（ただし返金成功時も同じ通知が出るので、失敗を特定する信号ではない）。(3)「顧客に返金完了メールも届かない」は、成功時なら届くかのように読めるが誤り。このキャンセル経路は返金メールを送らず、送信は charge.refunded / refund.updated webhook の finalize（reservations/payment-queries.ts:582）が担う。メールが出ないのは返金自体が存在しない結果であって別個の欠落ではない。加えて申告より範囲は広く、イベント申込側（events/registration-cancellation/steps.ts:64、chargeBase=paidAmount）も同一形状。なお同じ関数内の unset 分岐（run-auto-refund-on-cancel.ts:171、amount 未指定 → 残額全額）は正しく残額基準であり、configured 分岐だけ総額基準という内部不整合である点が、これが意図設計ではなく漏れであることの根拠。

---

### F-44

**ゲスト履歴統合で会員自身のメールが恒久 suppression され、管理画面から復旧できない**

<sub>[対処の記録](2026-08-12-codebase-audit-progress.md) ／ [棄却一覧](2026-08-12-codebase-audit-refuted.md)</sub>

|        |                                                                  |
| ------ | ---------------------------------------------------------------- |
| 深刻度 | 中                                                               |
| 箇所   | `src/shared/domain/customers/customer-lifecycle-commands.ts:407` |
| 領域   | 顧客ライフサイクル                                               |

#### 起きること

\1) X@example.com がゲストで予約 → 予約確認メールが hard bounce（DNS 一時障害等）し、当時存在する唯一の Customer 行（ゲスト行）が HARD\_BOUNCED になる。2) その後同じ人が Google でサインアップし、email=X の会員 Customer が新規作成される（この行の emailDeliveryStatus は OK）。3) mypage が「ゲスト履歴の統合」を提案し、本人が確認 URL を踏む。loadMergeCustomers は target.emailCanonical === source.emailCanonical を要求するので source と target は同じアドレス X。4) mergeCustomerCommand で sourceSuppressionHash = H(X)、target.suppressedEmailHash === null、targetAlreadySuppressed === false なので shouldPreserveOnTarget が true になり、会員行に「自分の現用アドレス X のハッシュ」が焼かれる。5) 統合でゲスト行は削除されるため emailDeliveryStatus 経路の抑制は消えるが、getSuppressedEmailSet は suppressedEmailHash 経路で H(X) を返し続け、以後この会員宛の予約確認・領収書・リマインダーが sendEmail で無言に drop される。6) 管理者が顧客詳細を開いても emailDeliveryStatus は OK なので「メール配信」カードも「配信状態をリセット」ボタンも描画されず、押しても resetCustomerEmailDeliveryStatusCommand が previous: OK で即 return する。suppressedEmailHash を null に戻すコードはリポジトリ内に 1 箇所も存在しない（書き込みは commands.ts:237 / customer-lifecycle-commands.ts:166 / :407 の 3 箇所のみ）。

#### 直し方

(a) mergeCustomerCommand で sourceSuppressionHash === targetOwnHash のときは targetAlreadySuppressed の有無に関わらず書き込まない（同一アドレス統合では emailDeliveryStatus 側で表現できるため）、かつ (b) resetCustomerEmailDeliveryStatusCommand に suppressedEmailHash: null を含め、CustomerDetail の表示条件を `emailDeliveryStatus !== OK || suppressedEmailHash !== null` に広げて管理者が状態を見られるようにする。

#### 該当箇所

```
data: { suppressedEmailHash: sourceSuppressionHash },
```

#### 到達経路

src/app/(admin)/admin/(dashboard)/\_shared/actions/customer.ts:822 findDuplicateCandidateForCustomer（src/shared/domain/customers/duplicate-detection.ts:29- が emailCanonical 一致でグループ化）で重複候補が提示される → src/app/(admin)/admin/(dashboard)/customers/\[id\]/\_components/MergeCustomerDialog.tsx:85 mergeCustomers(sourceCustomer.id=HARD\_BOUNCED のゲスト行, selected.id=同一 emailCanonical の会員行) → src/app/(admin)/admin/(dashboard)/\_shared/actions/customer.ts:637 mergeCustomerCommand(source, target)（この経路には loadMergeCustomers 相当の email 一致 / userId / anonymizedAt guard が無い） → src/shared/domain/customers/customer-lifecycle-commands.ts:338-343 sourceSuppressionHash = hashSuppressedEmailCandidate(X) → :350-355 target.suppressedEmailHash === null かつ targetAlreadySuppressed === false（bounce が会員行の作成より前に記録されたため src/shared/domain/customers/commands.ts:401 の updateMany が会員行に届いていない）→ shouldPreserveOnTarget = true → :404-408 tx.customer.update で会員行に suppressedEmailHash = H(X) を書き込み、:411 でゲスト行を削除 → src/shared/domain/customers/queries.ts:445 の `{ suppressedEmailHash: { not: null } }` で会員行がヒットし、:453 が hash(emailCanonical)=H(X) を、:455 が保存 hash H(X) を Set に投入 → src/shared/lib/email/send.ts:101-128 で当該会員宛の全送信が drop（全宛先 suppressed なら {ok:false, reason:"suppressed"}）→ 復旧経路: src/shared/domain/customers/commands.ts:450-452 が previous=OK で即 return し suppressedEmailHash を触らず、src/app/(admin)/admin/(dashboard)/customers/\[id\]/\_components/CustomerDetail.tsx:417 が status=OK のためカードもリセットボタンも描画しない。suppressedEmailHash への書き込みは commands.ts:237 / customer-lifecycle-commands.ts:166 / :407 の 3 箇所のみで、null 化は 0 箇所（grep 実測）。

#### 既存の検査

\_\_tests\_\_/unit/domain/customers/anonymize-preserves-suppression.test.ts と suppression-hash.test.ts / queries-suppressed-email-hashing.test.ts は hash が「書かれる・保たれる」ことだけを固定している。reset-email-delivery.test.ts のテストは 5 本とも emailDeliveryStatus の遷移だけを見ており、suppressedEmailHash への言及が 0 件（grep 済み）。「解除できること」を主張する検査はどこにも無い。

#### 反証官による訂正

申告内容に 4 点の誤りがある。

(1) **主張された到達経路（mypage のゲスト履歴統合）は成立しない。** shouldPreserveOnTarget の必要条件 sourceSuppressionHash !== null は、source 行が queries.ts:434-447 の WHERE（status 抑制 OR suppressedEmailHash NOT NULL）に必ずヒットすることを意味する。すると queries.ts:453 が hash(source.emailCanonical) を無条件に Set へ入れる。一方 loadMergeCustomers（customer-merge-commands.ts:85）は source.emailCanonical === target.emailCanonical を要求し、確認メールの宛先は customer-merge.ts:126 の guest.email（= その同一アドレス）である。したがって sendCustomerMergeVerificationEmail → customer-merge-emails.ts:20 sendEmail → send.ts:101-128 で全宛先が suppressed となり {ok:false, reason:"suppressed"} が返り、customer-merge.ts:136-138 が「確認メールの送信に失敗しました」で終わる。raw token は 32 バイト乱数でメール以外に配布経路が無いため、**consumeCustomerMergeTokenCommand には到達できない**。指摘の見出し「ゲスト履歴統合で」と 到達経路欄の customer-merge-commands.ts:257 はどちらも誤り。実際に到達するのは admin の重複マージダイアログのみ。

(2) **「以後この会員宛の…が drop される」は誤り（マージによる新規の配信喪失ではない）。** 統合前からゲスト行が emailDeliveryStatus=HARD\_BOUNCED かつ emailCanonical=X なので、queries.ts:453 により H(X) は既に suppression set に入っており、会員宛メールは統合前から drop されている。マージが変えるのは配信可否ではなく**復旧手段**（統合前はゲスト行に「配信状態をリセット」ボタンが出るが、統合後は行ごと消える）。

(3) **同一アドレスのケースは大半が :355 の guard で救われる。** bounce webhook は commands.ts:401 で emailCanonical 一致の**全行**を updateMany するため、会員行が既に存在する時点の bounce では会員行も HARD\_BOUNCED になり、targetAlreadySuppressed && sourceSuppressionHash === targetOwnHash が成立して書き込みは skip され、会員行自身に status が付くので admin UI からリセットできる。書き込みが起きるのは「bounce の記録が会員行の作成（またはそのアドレスへの変更）より前」という順序に限定される。

(4) **根本原因は :407 よりむしろ queries.ts:453。** 保存 hash だけでヒットした行に対しても hash(emailCanonical) を無条件に投入するため、匿名化行（placeholder アドレスで無害）と違い、生きている会員行では**現用アドレスが恒久的に抑制される**。さらに commands.ts:227 が email 変更時に suppressedEmailHash を引き継ぐので、管理者がアドレスを変更しても解除されないどころか新アドレスまで抑制される。指摘はこの増幅に触れていない。

なお queries.ts:395-397 は「emailDeliveryStatus のリセットを経由しても suppression は残り続ける設計（persistent audit trail）」と明記しており、"解除できない" こと自体は機能全体の意図的設計。欠陥は「その恒久 hash が匿名化行ではなく**稼働中の会員行**に載りうる」点に限られる。以上より high は過大で medium が妥当。

---

### F-45

**イベント一斉配信が marketingOptIn を無視するため、One-Click 配信停止を押しても次の配信が届く**

<sub>[対処の記録](2026-08-12-codebase-audit-progress.md) ／ [棄却一覧](2026-08-12-codebase-audit-refuted.md)</sub>

|        |                                                 |
| ------ | ----------------------------------------------- |
| 深刻度 | 中                                              |
| 箇所   | `src/shared/domain/events/email-queries.ts:141` |
| 領域   | メール・通知                                    |

#### 起きること

顧客 A（Customer.marketingOptIn=true）がイベント E に CONFIRMED で申込済み。管理者が /admin/events/... から一斉配信 #1 を送る → A のメールには List-Unsubscribe / List-Unsubscribe-Post: One-Click ヘッダと本文の「配信停止はこちら」リンクが付く（src/shared/lib/email/event-emails.ts:921-941、src/shared/emails/event-broadcast.tsx:95-106）。A が Gmail の「配信停止」を押す → POST /api/email/unsubscribe → optOutCustomerMarketingById で marketingOptIn=false、確認画面は「今後、運営からのお知らせ・キャンペーンメールは配信されません」と表示する。その後、管理者が同じイベント（または A が申し込んでいる別イベント）で一斉配信 #2 を送ると、getEventBroadcastPayload の where は status=CONFIRMED のみで marketingOptIn を見ないため A は再び recipients に入り、配信停止したはずのメールが届く。顧客一斉配信（findCustomersForBroadcast, src/shared/domain/customers/queries.ts:561 は marketingOptIn:true で絞る）とは挙動が非対称。結果として Gmail/Yahoo の bulk sender 要件（配信停止を honor すること）を満たさず、spam 報告 → COMPLAINED → getSuppressedEmailSet 経由で当該顧客の予約確認・領収書など取引メールまで全停止する。

#### 直し方

getEventBroadcastPayload の registrations 抽出時に配信可否を解決する。registration.customerId が非 null の顧客は marketingOptIn=true のみ対象にし、customerId が null で emailCanonical から Customer を引けたケース（同関数 159-175 の customerIdByEmail 解決）も同様に marketingOptIn で絞る。Customer に解決できない walk-in / ゲストは現行どおり unsubscribe URL を付けない扱いのまま skipped に加算する。「イベント連絡は取引メールなので opt-out 対象外」という判断を採るなら、逆に List-Unsubscribe ヘッダと本文の配信停止リンクを付けないのが筋（守れない配信停止を提示しない）。どちらにせよ、ヘッダの有無と送信対象の判定を 1 つの述語に揃える。

#### 該当箇所

```
registrations: {
where: { status: RegistrationStatus.CONFIRMED },
select: {
id: true,
email: true,
customerId: true,
},
},
```

#### 到達経路

src/app/(admin)/admin/(dashboard)/events/\[id\]/broadcast/\_components/BroadcastForm.tsx:35 (broadcastEventAction.bind) → src/app/(admin)/admin/(dashboard)/\_shared/actions/event-broadcast.ts:79 getEventBroadcastPayload(validId) → src/shared/domain/events/email-queries.ts:141 `where: { status: RegistrationStatus.CONFIRMED }`（marketingOptIn 条件なし）→ 同 154-156 で email !== null のみ filter、同 177-184 で recipients を返す → src/app/(admin)/admin/(dashboard)/\_shared/actions/event-broadcast.ts:83 sendEventBroadcast → src/shared/domain/email/lib-dispatch.ts:250-257（guard は requireSendContext のみ）→ src/shared/lib/email/event-emails.ts:905（recipients.length === 0 でのみ early return）→ 同 913-952 で payload.recipients を全件 fan-out、921-924 で createMarketingUnsubscribeArtifacts(customerId) のヘッダ/URL を付与 → src/shared/lib/email/send.ts:92-149 の宛先フィルタは suppressedEmailHashes のみ（src/shared/domain/customers/queries.ts:434-449 = bounce/complaint 由来のみ）→ 一方 One-Click 押下の効果は src/app/api/email/unsubscribe/route.ts:39 → src/shared/domain/customers/commands.ts:321-325 の `marketingOptIn: false` だけ。誤った結果: 配信停止済み顧客が次の一斉配信 #2 の recipients に再び入り、送信される。

#### 既存の検査

none。marketingOptIn を参照するのは src/shared/domain/customers/queries.ts:561（顧客一斉配信）と commands.ts の書き込み経路のみで、events 側には 1 箇所も無い（src/shared/domain/ 全体を grep 済み）。\_\_tests\_\_/unit/actions/event-broadcast.test.ts / e2e/authenticated/admin/events-broadcast.spec.ts / \_\_tests\_\_/unit/shared/lib/email/event-emails-bulk-member-url.test.ts のいずれにも marketingOptIn / unsubscribe の assertion は無い（grep 0 件）。\_\_tests\_\_/unit/architecture/ の email 系 gate（notification-email-clean-break / reservation-email-idempotency / customer-email-canonical-contract 等）も宛先の opt-out 判定は見ていない。DB 側にも制約は無い。

#### 反証官による訂正

3点訂正する。(1) 前提の事実誤認: `Customer.marketingOptIn` は prisma/schema.prisma:1003 で `@default(false)`。指摘は「顧客 A（marketingOptIn=true）」を出発点にするが、これは明示的に opt-in した少数派。実際には CONFIRMED 参加者の大半が既定で false のまま一斉配信を受け取っている。この事実は欠陥を弱めないが、指摘が暗に示す修正（顧客一斉配信 src/shared/domain/customers/queries.ts:561 の `marketingOptIn: true` と対称にする）を採ると参加者のほぼ全員が宛先から消え、機能が壊れる。単純な parity 修正では済まない。(2) 「非対称」の描き方が不正確: 顧客一斉配信は管理者が任意の顧客を選ぶ（同意ゲートが要る）のに対し、イベント一斉配信は当該イベントに自ら申し込んで CONFIRMED になった参加者だけが対象で、関係性ベースの通知として区別する設計自体は不合理ではない（src/shared/emails/\_registry/data.ts:181-186 も category:"event" として登録）。欠陥の本体は「marketingOptIn を見ていないこと」ではなく、「One-Click 配信停止を自ら提示し、確認画面で停止を明言しておきながら、その書込先を送信経路が一切参照しないこと」。(3) 深刻度 high は誇張。管理者の手動操作が起点で自動発火ではなく、宛先は自分で申し込んだ参加者に限られ、データ破壊もセキュリティ侵害も無い。「spam 報告 → COMPLAINED → 取引メール全停止」の連鎖は機構としては実在する（queries.ts:434-449 と send.ts:92-129）が、顧客の spam 報告を挟む推測的なエスカレーションで、直接の帰結ではない。「Gmail/Yahoo bulk sender 要件（5000通/日規模）」の適用もこのサイトの配信量では立証されていない。ただし自ら掲げた配信停止を履行しない矛盾は実在し修正も小さいため low ではなく medium が妥当。

---

### F-46

**Google Calendar 側でイベントを消すと、公開済み・申込ありのイベントまで無条件に CANCELLED にされる**

<sub>[対処の記録](2026-08-12-codebase-audit-progress.md) ／ [棄却一覧](2026-08-12-codebase-audit-refuted.md)</sub>

|        |                                                                  |
| ------ | ---------------------------------------------------------------- |
| 深刻度 | 中                                                               |
| 箇所   | `src/shared/domain/events/event-calendar-import-commands.ts:216` |
| 領域   | 外部連携                                                         |

#### 起きること

管理画面で作成し PUBLISHED にしたイベント E（申込 30 件が RegistrationStatus!=CANCELLED）は、event-calendar-outbound が GCal イベント G を作り EventTimeSlot.googleCalendarEventId=G を書き込む（event-calendar-outbound.ts:139-142 saveEventGoogleCalendarEventId）。スタッフが Google Calendar 上で G を削除（または別カレンダーへ移動＝元カレンダー上は cancelled）すると、次の event-import cron で fetchEventImportChanges が G を拾う。削除済みイベントは description が返らないため event-inbound-fetch.ts:81 の isAppGeneratedCalendarEvent(undefined) が false になりループ防止マーカー「イベントID:」が効かず、:87 で cancelledEventIds に入る。cancelImportedEventFromCalendar は EventTimeSlot.googleCalendarEventId で親 Event を引くだけで、import 由来かアプリ由来かも、PUBLISHED か、申込があるかも見ないため、E が CANCELLED になる。同ファイルの upsertEventFromCalendar は :65-78 で published\_event\_protected / has\_active\_registrations を明示的に skip しているのに、cancel 側にはその対称ガードが無い。JSDoc（:204-205）どおり参加者通知も発火しないので、30 名は中止を知らされないまま公開ページからイベントが消える。

#### 直し方

cancelImportedEventFromCalendar に upsertEventFromCalendar と同じガードを入れる。すなわち対象 Event を status と registrations(where status != CANCELLED, take:1) 付きで読み、PUBLISHED または未キャンセル申込ありなら CANCELLED にせず skip して admin 通知（createNotificationCommand）を上げる。加えて「アプリ由来の GCal イベント」を description マーカーに頼らず識別できるようにする（EventTimeSlot に outbound 由来フラグ、または Event.source を追加し、cancel 経路では import 由来のみ対象にする）。

#### 該当箇所

```
const slot = await prisma.eventTimeSlot.findFirst({
where: { googleCalendarEventId },
select: { eventId: true },
});
if (!slot) return { cancelled: false };

const claim = await prisma.event.updateMany({
where: {
id: slot.eventId,
deletedAt: null,
status: { not: EventStatus.CANCELLED },
},
data: { status: EventStatus.CANCELLED },
});
```

#### 到達経路

src/app/api/cron/event-import/route.ts:71 importCalendarEvents（前段ガードは cron 認証 :39 / feature "events" :48 / isGoogleCalendarEnabled :53 / eventImportEnabled :63 のみ、status・申込は不問） → src/shared/domain/events/event-calendar-import.ts:117 fetchEventImportChanges（:105-112 の calendarSettings.calendarId は outbound と同一カレンダー） → src/shared/lib/calendar-sync/event-inbound-fetch.ts:81 isAppGeneratedCalendarEvent が false（import 由来イベントは元々マーカー非保持。アプリ由来でも GCal は削除済イベントの description を返さないため同様に false） → :86-89 cancelledEventIds.push(event.id) → src/shared/domain/events/event-calendar-import.ts:158-160 cancelImportedEventFromCalendar(cancelledId) → src/shared/domain/events/event-calendar-import-commands.ts:210-213 googleCalendarEventId だけで slot→eventId を逆引き（由来・status・申込を一切見ない） → :216-223 prisma.event.updateMany({where:{id, deletedAt:null, status:{not:CANCELLED}}, data:{status:CANCELLED}}) が PUBLISHED かつ RegistrationStatus!=CANCELLED の申込を持つ Event を CANCELLED に遷移させ、:196-206 の設計どおり参加者通知は発火しない。なお import 経路で作られたイベントは :175 で DRAFT 生成 → 管理者が公開 → 申込発生、という順で同じ行に到達するため、「GCal が削除済イベントの description を返さない」という外部 API 挙動の仮定を置かなくても到達可能。

#### 既存の検査

none（既存テストはむしろ現状の無ガード挙動を固定している）。\_\_tests\_\_/unit/domain/events/event-calendar-import-commands.test.ts:374-417 の 3 ケースは「スロット無し→false」「スロット有り→CANCELLED へ claim」「既に CANCELLED→false」だけで、PUBLISHED / 申込あり / アプリ由来スロットの見本入力が無い。prisma/schema.prisma の Event / EventTimeSlot(:2422-2445) にも import 由来を判別する source 列や DB 制約は無い。

#### 反証官による訂正

記述はおおむね正確。訂正・補足は4点。(1) 行番号: 引用ブロックの開始は :210 で、:216 は updateMany 行。見出しの位置指定としては許容範囲だが厳密には :210-223。(2) 指摘のシナリオはアプリ由来イベント（GCal が削除済イベントの description を返さない＝外部 API 挙動）に依存する形で書かれているが、この仮定はリポジトリ内では検証できない。ただし import 由来イベント（:175 で DRAFT 作成 → 管理者が公開 → 申込発生 → スタッフが GCal 側を削除）なら同じ仮定なしに同一行へ到達するため、欠陥そのものは仮定に依存しない。指摘の本質（cancel 側に upsert 側と対称なガードが無い）は正しい。(3) 指摘が触れていない加重要因: calendar-sync.ts:165 の outbound は status: PUBLISHED で絞るため、outbound が googleCalendarEventId を書いた slot は構造上すべて PUBLISHED イベントのもの。つまりアプリ由来で到達しうる集合は upsertEventFromCalendar:65-71 が守る集合と完全に一致する。(4) 併発する副次的欠陥: この updateMany は EVENT\_STATUS\_TRANSITIONS を経由しないため、ARCHIVED（terminal）のイベントも CANCELLED に巻き戻る。severity を high から medium に下げた根拠: eventImportEnabled が schema.prisma:1979 で @default(false) の opt-in であり、加えてスタッフの GCal 削除操作を要する。さらに被害は復旧可能（EventRegistration 行は無傷、返金処理も発火せず、管理者が再公開できる）。ただし公開ページからイベントが消え参加者に通知が行かない点は顧客影響があり、low ではない。

---

### F-47

**EventTicket.capacity の下限検証だけがイベント全体集計で、実際の定員enforcementはスロット単位**

<sub>[対処の記録](2026-08-12-codebase-audit-progress.md) ／ [棄却一覧](2026-08-12-codebase-audit-refuted.md)</sub>

|        |                                                            |
| ------ | ---------------------------------------------------------- |
| 深刻度 | 中                                                         |
| 箇所   | `src/shared/domain/events/event-slot-sync-commands.ts:176` |
| 領域   | イベント（中核）                                           |

#### 起きること

EventTicket.capacity は「そのスロットにおけるそのチケット種別の定員」として一貫して扱われている(registration-create-commands.ts:134-145 の aggregate は `slotId: data.slotId` 込み、DB の assert\_event\_capacity\_not\_exceeded は `WHERE slot_id = target_slot_id AND ticket_id = target_ticket_id`、公開表示の getTicketSlotConfirmedCount も (slotId, ticketId) 単位)。ところが管理画面の保存経路 syncEventTicketsCommand の下限検証だけが `slotId` を持たず eventId 全体で合計する。TIMED\_ENTRY のイベントでスロット A に 8 名・スロット B に 8 名が同じチケット種別で確定している状態で、管理者がそのチケットの定員を 10（1スロットあたり10名の意図）に設定しようとすると confirmedQuantity=16 と計算され「定員を確定済み申込人数（16名）未満にはできません」で保存が拒否される。DB の trigger はスロット毎に 8\<=10 を満たすので通るはずの正当な設定変更が、恒久的に不可能になる。スロット数が増えるほど設定可能な下限が膨らむため、複数枠イベントではチケット定員を後から絞れない。

#### 直し方

aggregate を per-slot の最大値で判定する。具体的には `groupBy({ by: ['slotId'], where: { ticketId: ticket.id, eventId, status: CONFIRMED }, _sum: { quantity: true } })` を取り、最大の合計値と ticket.capacity を比較する(DB trigger と同じ判定式にする)。メッセージも「あるスロットの確定済み申込人数」と分かる文言に直す。

#### 該当箇所

```
eventId,
```

#### 到達経路

src/app/(admin)/admin/(dashboard)/\_shared/actions/event.ts:154 updateEventAction (フォーム submit) → :180 buildEventCommandInput(data) が tickets(id 付き)を素通し (:80-87) → :181 updateEventCommand → src/shared/domain/events/commands.ts:404 updateEventCommand → :554 syncEventSlotsAndTicketsCommand → src/shared/domain/events/event-slot-sync-commands.ts:93 syncEventTicketsCommand → :170 `if (ticket.id)` 分岐 → :172 `if (ticket.capacity != null)` → :173-181 tx.eventRegistration.aggregate({ where: { ticketId: ticket.id, eventId, status: CONFIRMED }, \_sum: { quantity: true } }) — slotId 欠落によりイベント全スロットを合算 → :182 `ticket.capacity < confirmedQuantity` → :183-186 DomainError「定員を確定済み申込人数（16名）未満にはできません」。対照: 同じ状態を DB は許す — prisma/baseline/invariants.sql:235-246 の assert\_event\_capacity\_not\_exceeded は slot\_id 単位で 8\<=10 を満たし、:500-514 の check\_event\_ticket\_capacity\_not\_exceeded も DISTINCT slot\_id ごとに検査するため通る。また slot 側の同型検査 src/shared/domain/events/slot-commands.ts:139-152 は `slotId: slot.id` を持ち正しい。

#### 既存の検査

未捕捉。\_\_tests\_\_/unit/domain/events/slot-commands.test.ts の「確定済み申込人数より定員を下げると DomainError」は EventTimeSlot 側(スロット単位で正しい)のみ。\_\_tests\_\_/integration/events/ticket-delete-guard.test.ts はチケット削除ガードのみ、\_\_tests\_\_/integration/domain/events/event-update-capacity-lock.test.ts はスロット定員引き下げの並行性のみ。チケット定員下限検証の集計スコープを固定するテストは存在しない。prisma/baseline/invariants.sql:499-514 の check\_event\_ticket\_capacity\_not\_exceeded は DISTINCT slot\_id ごとに検査しており、意図された意味論が per-slot であることを示している。

#### 反証官による訂正

指摘は概ね正確だが 4 点の不正確さがある。(1) 影響範囲の過小申告: 指摘は「定員を後から絞れない」と下げ操作の話にしているが、:172 の分岐は capacity が変わったかを見ておらず `capacity != null` なら毎回走る。したがって累計が capacity を超えた時点で、タイトルや本文だけを直す無関係な保存も含め **イベント更新が丸ごと不可能になる**。指摘より広い。(2) 既存カバレッジの申告が雑: 「未捕捉」とあるが \_\_tests\_\_/unit/domain/events/commands.test.ts:1407「チケット定員を CONFIRMED 合計未満に下げると VALIDATION」がチケット側の floor 検証自体は通っている。ただし aggregate を mock し単一スロットで where 節を assert しないため、集計スコープは固定していない — 「スコープを固定するテストは存在しない」という結論だけは正しい。指摘が挙げた slot-commands.test.ts / ticket-delete-guard.test.ts / event-update-capacity-lock.test.ts の位置づけは正しい。(3) 欠陥箇所の名指しがずれている: 問題は `eventId` の存在ではなく `slotId` の欠落。ticketId は FK で既に event に閉じているので `eventId` は冗長なだけで無害。指摘の場所が :176 (`eventId,`) を指しているのはミスリードで、正しくは :173-181 の where 全体。(4) 整合性リスクは無い: per-event 合計は per-slot 最大値以上なので、この検査は DB trigger より常に厳しい。すなわち overbooking を通す方向の穴ではなく、正当な保存を誤拒否する一方向の欠陥。したがって critical/high ではなく medium が妥当（データ破損もセキュリティ影響も無く、失敗は明示的なエラーメッセージで可視。ただし TIMED\_ENTRY + 複数区分という「スキーマが必須化している通常形」で管理画面の編集が恒久的に詰むため low でもない）。

---

### F-48

**イベント checkout の Stripe idempotency key が申込 ID 固定で、24 時間以内の再決済が必ず失敗する**

<sub>[対処の記録](2026-08-12-codebase-audit-progress.md) ／ [棄却一覧](2026-08-12-codebase-audit-refuted.md)</sub>

|        |                                                    |
| ------ | -------------------------------------------------- |
| 深刻度 | 中                                                 |
| 箇所   | `src/shared/domain/events/payment-commands.ts:275` |
| 領域   | Stripe handler                                     |

#### 起きること

顧客がイベント申込 X の決済を開始 → session S1 が expires\_at = claimedAt + UNPAID\_EVENT\_REGISTRATION\_EXPIRY\_MINUTES (line 235-237) で作られる → 支払わず放置 → checkout.session.expired → claimEventRegistrationAsFailed で paymentStatus=FAILED。同日中に顧客がもう一度「支払う」を押すと claim は FAILED→PENDING を許す (line 195, PAYMENT\_STATUSES\_REOPENABLE\_FOR\_CHECKOUT) が、checkout.sessions.create は同じ idempotency key で expires\_at だけが違うリクエストになる。Stripe の idempotency key は 24 時間保持され、同一キー・異なるパラメータには 400 idempotency\_error を返すため create が throw → handleCheckoutSessionCreateFailure が PENDING を UNPAID に revert し、顧客には「決済セッションの作成に失敗しました。しばらく経ってからお試しください。」だけが返る。24 時間経つまで何度押しても同じで、申込期限が先に来れば購入不能のまま終わる。line 548 の createWaitlistOfferCheckoutSessionCommand は expires\_at が offer の expiresAt 固定 (line 511) でパラメータが完全一致するため、逆に Stripe が初回レスポンスをそのまま再生し、既に complete / expired になった S1 の URL が返る → 顧客は死んだ Checkout ページに飛ばされる。しかもこの再決済は line 339-344 で「offer には 24h の確定期限があり、途中で決済に失敗しても期限内は再挑戦できる必要がある」と明示設計された導線で、Stripe のキー保持期間 24h と完全に重なる。

#### 直し方

key に「その checkout 試行」を識別する値を混ぜる。claim の updateMany で試行 ID (paymentInitiatedAt 相当の列か crypto.randomUUID()) を書き込み、それを key に含める。同一リクエストのネットワーク再送だけを吸収したいならリクエスト単位生成で足りる。reservations/payment-commands.ts:311 と 3 か所同時に直すこと。

#### 該当箇所

```
idempotencyKey: `checkout/event-registration/${registrationId}/pending-claim`,
```

#### 到達経路

src/app/(public)/events/registrations/checkout/route.ts:57（またはログイン導線 src/app/(public)/mypage/\_shared/actions/event-registration.ts:186 / 管理導線 src/app/(admin)/admin/(dashboard)/\_shared/actions/event-registration.ts:710）→ src/shared/domain/events/payment-commands.ts:93 createEventCheckoutSessionCommand → \[1 回目\] :190 claimedAt=T → :191-198 claim UNPAID→PENDING → :235-237 expires\_at=T+3600 → :239-277 checkout.sessions.create(body\_1, key="checkout/event-registration/{id}/pending-claim") 成功 → :280 settleCheckoutSessionWrite が stripeCheckoutSessionId=S1 を書込 → \[放置\] Stripe が T+3600 に session を expire → src/shared/domain/payment/stripe-webhook/checkout-session-failed.ts:80 handleCheckoutSessionExpired → src/shared/domain/events/payment-queries.ts:151 claimEventRegistrationAsFailed（stripeCheckoutSessionId=S1 一致）→ paymentStatus=FAILED → \[2 回目、T+3600〜T+7200 の間に顧客が再度「支払う」\] payment-commands.ts:126 status=CONFIRMED 通過 → :135-143 FAILED を明示許容して通過 → :191-198 claim FAILED→PENDING 成功（src/shared/domain/payment/payment-status-guards.ts:12-15）→ :190 claimedAt=T' (≠T) → :235-237 expires\_at=T'+3600（body\_2 ≠ body\_1）→ :275 同一 idempotencyKey で create → Stripe が 400 idempotency\_error を返す（node\_modules/stripe/cjs/Error.js:14,53,201 が StripeIdempotencyError に変換）→ :303 catch（DomainError ではないので :304 の再 throw を通らない）→ :315 handleCheckoutSessionCreateFailure（src/shared/domain/payment/checkout-session-write-orchestration.ts:101-117）が createdSessionId=null のため expire を skip して :116 revertPending で PENDING→UNPAID → :325 DomainError「決済セッションの作成に失敗しました。しばらく経ってからお試しください。」→ route.ts:70-84 が /events/registrations/checkout-error へ 302。誤った結果 = 設計上サポートされているはずの FAILED からの再決済導線が、この申込に対して構造的に 100% 失敗し、顧客は決済不能のまま src/shared/domain/events/unpaid-expiry.ts:95 expireStaleUnpaidEventRegistrationsCommand に CANCELLED 化されて申込を失う。

#### 既存の検査

\_\_tests\_\_/unit/domain/events/payment-commands.test.ts は Stripe client を mock するため、同一キー再送に対する Stripe 側の挙動は再現されない。architecture gate も無し。reservations 側の同型キー (reservations/payment-commands.ts:311) は既報告だが、こちらは別ファイル・別コマンドで、片方を直しても解消しない。

#### 反証官による訂正

中核（:275 の固定キーで FAILED 再決済が必ず 400 になる）は成立するが、報告の失敗シナリオには 3 点の事実誤認がある。(1)「24 時間経つまで何度押しても同じで、申込期限が先に来れば購入不能のまま終わる」は誤り。src/shared/domain/events/unpaid-expiry.ts:36-59,95 の expireStaleUnpaidEventRegistrationsCommand が CONFIRMED + FAILED を updatedAt \< now-60min（revert 後の UNPAID は createdAt \< now-60min なので即時対象）で CANCELLED 化し、定員も解放する。hourly cron なので破綻状態は概ね 1 サイクル以内で解消し、顧客は再申込すれば新しい registrationId → 新しいキーで決済できる。実被害窓は「session expire 後 cron が拾うまでの最大 60 分」であって 24 時間ではなく、money loss / 二重課金 / DB 不整合は発生しない（PENDING は :315 で UNPAID に revert される）。UNPAID\_EVENT\_REGISTRATION\_EXPIRY\_MINUTES は 60（src/shared/domain/events/payment-expiry-constants.ts:14）。(2) waitlist 側（:548）の主張はほぼ refuted。expires\_at = offer expiresAt 固定（:511）なので checkout.session.expired が発火するのは offer 期限そのものの時刻であり、その時点の再試行は :476（expiresAt \<= now で revert + VALIDATION）と :490（残り 30 分未満で revert + VALIDATION）が先に弾く。したがって「expired になった S1 の URL が返る」経路は offer window 内に存在しない。replay が起きうるのは async\_payment\_failed（konbini / customer\_balance）→ FAILED → 期限まで 30 分超の残り時間で再試行、という部分集合だけで、Settings で非同期決済手段が有効な場合に限られる。(3)「同日中にもう一度『支払う』を押すと」の一般化も不正確。PENDING は REOPENABLE 集合に入っていないため、Stripe の cancel\_url から戻って再度押す最も普通の経路は :199-204 の CONFLICT で先に止まり、idempotency には到達しない。刺さるのは FAILED 経由のみ。なお reservations/payment-commands.ts:279-311 は expires\_at の算出（claimedAt 基準）もキー形状も完全に同型で、報告どおり別ファイルなので修正は 2 箇所必要。修正方針としては、キーに「その claim を一意化する discriminator」（例: claimedAt のエポック秒、または settle 時に確定する試行カウンタ）を足すのが筋で、expires\_at を body から動かす方向で辻褄を合わせないこと（:235-237 のコメントどおり cron cutoff と揃える設計が silent orphan 防止の本体）。

---

### F-49

**非同期返金の確定処理が AUTO\_ON\_CANCEL を「常に全額」と決め打ちし、ポリシー按分の部分返金を REFUNDED に確定させる**

<sub>[対処の記録](2026-08-12-codebase-audit-progress.md) ／ [棄却一覧](2026-08-12-codebase-audit-refuted.md)</sub>

|        |                                                   |
| ------ | ------------------------------------------------- |
| 深刻度 | 中                                                |
| 箇所   | `src/shared/domain/events/payment-queries.ts:428` |
| 領域   | イベント返金・税額                                |

#### 起きること

Settings で konbini / customer\_balance を有効化し、返金ポリシーに「72h 前まで 50%」の tier を設定している状態。paidAmount=5000 円の PAID なイベント申込を開始 100 時間前に顧客がキャンセルすると、run-auto-refund-on-cancel.ts:164 の calculateRefundAmount が floor(5000\*50/100)=2500 を算出し、steps.ts:73-79 が `refundEventRegistrationPaymentCommand({amount: 2500, actorType: AUTO_ON_CANCEL})` を呼ぶ。konbini 決済への返金は Stripe が status="pending" で返すため payment-commands.ts:985 の `if (isSettled)` が false になり paymentStatus は PAID のまま温存される。後日 refund.updated (succeeded) が届くと handleRefundStatusUpdated が finalizeSettledEventRegistrationRefund(..., AUTO\_ON\_CANCEL) を呼び、AUTOMATED\_FULL\_REFUND\_TYPES に AUTO\_ON\_CANCEL が含まれるため willBeFullyRefunded が無条件 true になり、実際には 2500 円 (半額) しか返金されていない申込が paymentStatus=REFUNDED に確定する。結果 (1) 残り 2500 円が未返金なのに「全額返金済み」として記録され、(2) refundEventRegistrationPaymentCommand は PAID / PARTIALLY\_REFUNDED しか受け付けないので以降その申込への追加返金導線が完全に閉じ、(3) 予約側の同一コード (reservations/payment-queries.ts:497) では finalize が sendReservationRefundEmail に isFullyRefunded: true を渡すため、半額しか返っていない顧客に「全額を返金いたしました」というメール (emails/reservation-refund.tsx:62) が届く。docstring (payment-queries.ts:371-374「呼び出し元が必ず単発で残額全額を請求する自動返金経路」) の前提が AUTO\_ON\_CANCEL については成立していないのが根本原因で、AUTO\_CAPACITY\_RACE / AUTO\_AMOUNT\_MISMATCH は実際に常に全額なので前提が成り立つ。

#### 直し方

AUTOMATED\_FULL\_REFUND\_TYPES による分岐を actorType ではなく「呼び出し元が残額全額を要求したか」で行う。refundEventRegistrationPaymentCommand / refundReservationPaymentCommand が requestedAmount === undefined (= 残額全額) だったことを Refund 行または finalize 引数に明示的に伝え、finalize はそのフラグが立っているときだけ無条件 REFUNDED にする。フラグが無い経路は AUTO\_\* でも cumulativeSettled \>= chargeTotal の累積判定に落とす。あわせて unit テスト payment-queries.test.ts:825 の期待値を「按分額なら PARTIALLY\_REFUNDED」に直す。

#### 該当箇所

```
const willBeFullyRefunded = isAutomatedFullRefund
? true
: cumulativeSettled >= registration.paidAmount;
```

#### 到達経路

Precondition (non-default): Settings.stripePaymentMethodTypes includes konbini or customer\_balance (default is \["card"\], prisma/schema.prisma:1917) and Settings.refundPolicy has a tier below 100%.

\1. applyEventRegistrationCancellationSideEffects → src/shared/domain/events/registration-cancellation/steps.ts:58 runRefundStep (chargeBase = registration.paidAmount = 5000, steps.ts:64)
\2. src/shared/domain/cancellation/run-auto-refund-on-cancel.ts:163-170 → calculateRefundAmount (src/shared/domain/refund/policy.ts:116-124) returns floor(5000\*50/100)=2500; passed as `amount` at run-auto-refund-on-cancel.ts:190-193
\3. src/shared/domain/events/registration-cancellation/steps.ts:73-79 → refundEventRegistrationPaymentCommand({ amount: 2500, actorType: REFUNDED\_BY\_TYPE.AUTO\_ON\_CANCEL })
\4. src/shared/domain/events/payment-commands.ts:972 isSettled=false (Stripe returns status "pending" for konbini/customer\_balance — node\_modules/stripe/cjs/resources/Refunds.d.ts:131); :974-981 Refund row written with refundedByType=AUTO\_ON\_CANCEL, status="pending"; :985 `if (isSettled)` is false → EventRegistration.paymentStatus stays PAID
\5. Days later, refund.updated (succeeded) → src/shared/domain/payment/stripe-webhook/refund-status-updated.ts:62,77-82 → finalizeSettledEventRegistrationRefund(registrationId, refund.id, entity.refundedByType = AUTO\_ON\_CANCEL)
\6. src/shared/domain/events/payment-queries.ts:420-424 cumulativeSettled = 2500; :375-379 AUTOMATED\_FULL\_REFUND\_TYPES contains AUTO\_ON\_CANCEL → :426-427 isAutomatedFullRefund = true
\7. WRONG BRANCH — src/shared/domain/events/payment-queries.ts:428-430 willBeFullyRefunded = true (the `cumulativeSettled >= registration.paidAmount` comparison, which would yield false for 2500 \< 5000, is skipped)
\8. WRONG RESULT — src/shared/domain/events/payment-queries.ts:432-449 updateMany WHERE paymentStatus != REFUNDED sets paymentStatus = REFUNDED; :459-474 writes an AuditLog recording paymentStatus REFUNDED with refundedAmount 2500 (self-contradictory row)
\9. Downstream lock-out — src/shared/domain/events/payment-commands.ts:888-896 rejects any registration not in PAID/PARTIALLY\_REFUNDED, so the unrefunded 2500 can no longer be refunded through the app
\10. Reservation twin, identical branch — src/shared/domain/reservations/payment-queries.ts:495-520, then :592 passes isFullyRefunded: willBeFullyRefunded into sendReservationRefundEmail → src/shared/emails/reservation-refund.tsx:62 renders "全額を返金いたしました" to a customer who received half

Contrast proving the branch is wrong rather than intentional: src/shared/domain/payment/stripe-refund-orchestration.ts:94 (sync path) computes willBeFullyRefunded = newCumulative === chargeTotal for the same AUTO\_ON\_CANCEL 2500/5000 input, and \_\_tests\_\_/integration/domain/reservations/cancellation-with-refund-policy.test.ts:513-525 asserts the resulting PARTIALLY\_REFUNDED.

#### 既存の検査

\_\_tests\_\_/unit/domain/reservations/payment-queries.test.ts:825「AUTO\_ON\_CANCEL: 入口 paymentStatus を問わず (REFUNDED 以外なら) 無条件 REFUNDED に遷移する」は totalPriceWithTax=10000 / 累積 4000 で REFUNDED を期待しており、この欠陥そのものを正解として固定している。\_\_tests\_\_/integration/domain/reservations/cancellation-with-refund-policy.test.ts:513 は AUTO\_ON\_CANCEL で 2500/5000 の部分返金が実際に起票されることを証明しているが、同期返金 (status=succeeded) しか流さないため finalize 経路に到達せず、両テストが緑のまま欠陥が残る。architecture gate 群 (\_\_tests\_\_/unit/architecture/) には refund 金額の意味論を見る gate は無い。

#### 反証官による訂正

The finding is technically accurate — quote verbatim, line number correct, chain reachable, and its claim that reservations/payment-queries.test.ts:825-849 pins the defect as intended behavior checks out. Four corrections, all of which lower it from high to medium:

\1. Reachability is gated behind a non-default admin toggle the report never mentions. prisma/schema.prisma:1917 defaults stripePaymentMethodTypes to \["card"\]. Card refunds return "succeeded" synchronously, so under default configuration the sync path (stripe-refund-orchestration.ts:94) computes the correct PARTIALLY\_REFUNDED and finalize is never entered. Triggering requires an admin to enable konbini/customer\_balance, a policy tier below 100%, and a cancellation landing in that tier. Each is a supported configuration, so this is latent rather than dead — but it is not the default path, and the report presents it as if the configuration were ordinary.

\2. The most vivid harm cited is not at the reported location. Claim (3), the false "全額を返金いたしました" email, lives on the reservation twin (reservations/payment-queries.ts:592 → emails/reservation-refund.tsx:62), not in the events file this finding is filed against. events/payment-queries.ts:385 states outright that events has no refund-completion email at all, so the events-side harm is limited to a wrong paymentStatus, a self-contradictory AuditLog (REFUNDED alongside refundedAmount 2500), and a closed in-app refund path. The report's own header scopes this to events while borrowing the reservation file's customer-facing consequence.

\3. Claim (2) overstates the lock-out as total. The in-app path does close (payment-commands.ts:888-896), but an admin can still refund the remaining amount through the Stripe Dashboard; that refund arrives with STRIPE\_DASHBOARD attribution and takes the non-automated branch. The money is recoverable — it is the in-product path that is lost, not the funds.

\4. One framing correction in the codebase's favour: this is not drift introduced after the invariant was written. The tier policy shipped in #1134, before the AUTO\_\* full-refund invariant in #1665/#1666, so the docstring premise at payment-queries.ts:371-374 was already false when authored rather than falsified later.

Net: a genuine financial-correctness defect with a verified end-to-end path and an internal contradiction between the sync and async settlement paths, but config-gated and manually recoverable. Medium, not high.

---

### F-50

**管理画面の返金残額が failed / canceled な Refund 行も合算し、返金再試行の導線を塞ぐ**

<sub>[対処の記録](2026-08-12-codebase-audit-progress.md) ／ [棄却一覧](2026-08-12-codebase-audit-refuted.md)</sub>

|        |                                                       |
| ------ | ----------------------------------------------------- |
| 深刻度 | 中                                                    |
| 箇所   | `src/shared/domain/events/registration-queries.ts:85` |
| 領域   | イベント返金・税額                                    |

#### 起きること

paidAmount=10000 円のイベント申込に対し、管理者が 10000 円の返金を実行する。konbini / customer\_balance (あるいは Stripe が pending を返したカード) のため Refund 行は status="pending" で作られ、paymentStatus は PAID のまま。数日後 Stripe が返金を失敗させ refund.updated (status="failed") が届くと、refund-status-updated.ts:93 が Refund.status を "failed" に更新し、:102 で CRITICAL ログ「manual intervention required (alternative refund method)」を出して管理者に再手配を促す。ところが管理者がイベント詳細画面を開くと、この query が status を絞らず全 Refund 行の amount を返すため page.tsx:92 の reduce が cumulativeRefunded=10000 を算出し、EventRegistrationTable.tsx:120 の `reg.paidAmount > reg.cumulativeRefunded` が false になって返金ボタンが消える。ドメイン側 (stripe-refund-orchestration.ts:326 REFUND\_AGGREGATE\_EXCLUDED\_STATUSES) は failed/canceled を除外しているので refundEventRegistrationPaymentCommand なら 10000 円の再返金を受け付けるのに、UI からは到達できない。部分返金が混ざる場合はさらに数値が嘘になる: 10000 円のうち 3000 円が succeeded、2000 円が failed のとき、ドメインの残額は 7000 円だが RefundDialog は「累積返金額 ¥5,000 — 残額 ¥5,000」と表示し (RefundDialog.tsx:176)、:128 の `parsed > remaining` で 5000 円超の入力を拒否する。

#### 直し方

registration-queries.ts:85 と reservations/admin-queries.ts:390 の refunds select に `where: { status: { notIn: [...REFUND_AGGREGATE_EXCLUDED_STATUSES] } }` を付け、ドメイン側の残額計算と同じ SSoT (stripe-refund-orchestration.ts:326) を使う。UI 側で reduce するのではなく query 側で除外することで、page.tsx / ReservationDetail.tsx の 2 箇所の reduce をそのまま使い回せる。

#### 該当箇所

```
refunds: { select: { amount: true } },
```

#### 到達経路

src/app/(admin)/admin/(dashboard)/events/\[id\]/page.tsx:58 EventDetailPage → :77 getEventRegistrations → src/shared/domain/events/registration-queries.ts:63-93 findMany（:85 refunds: { select: { amount: true } } — status 無条件）→ page.tsx:92-95 r.refunds.reduce で failed 行も合算し cumulativeRefunded=10000 → :108 で serialize → :302 EventRegistrationTable へ受け渡し → src/app/(admin)/admin/(dashboard)/events/\[id\]/\_components/EventRegistrationTable.tsx:314 showRefund = isRefundable(reg) → :112-121 isRefundable の :120 `reg.paidAmount > reg.cumulativeRefunded` が 10000 \> 10000 = false → :386-395 返金ボタンが描画されない。一方 src/shared/domain/events/payment-commands.ts:909-916 は status: { notIn: REFUND\_AGGREGATE\_EXCLUDED\_STATUSES } で cumulativeSoFar=0 を得るため同じ 10000 円の再返金を受理し、prisma/baseline/invariants.sql:258/269 の assert\_refund\_total\_within\_paid も failed を除外するので DB も受理する。部分返金混在時は src/app/(admin)/admin/(dashboard)/reservations/\[id\]/\_components/RefundDialog.tsx:85 remaining = refundableTotal - cumulativeRefunded → :176 で誤った累積額/残額を表示 → :128 `parsed > remaining` で正当な入力を拒否。同型の第 2 経路: src/shared/domain/reservations/admin-queries.ts:390-394 → src/app/(admin)/admin/(dashboard)/reservations/\[id\]/\_components/ReservationDetail.tsx:82-86 / :695。

#### 既存の検査

\_\_tests\_\_/unit/components/admin/refund-dialog.test.tsx は cumulativeRefunded を props で直接与えるため、その値の算出元 (query に status フィルタが無いこと) は検査していない。\_\_tests\_\_/unit/components/admin/event-registration-table.test.tsx:161 も cumulativeRefunded: 0 固定。\_\_tests\_\_/unit/reservation-detail.test.tsx:192 は refunds: \[\] 固定。ドメイン側の除外契約は stripe-refund-orchestration.ts の定数と reservations/events の refund command テストで守られているが、query/UI 層には対応する検査が無い。architecture gate にも Refund 集計の status 条件を強制するものは存在しない。

#### 反証官による訂正

事実関係はほぼ正確。数値も検算して合う: 成功側の返金は paidAmount を減らさない（payment-commands.ts:986-998 は paymentStatus のみ更新）ため refundableTotal=10000 のままで、3000 succeeded + 2000 failed のとき UI は累積 5000 / 残額 5000、ドメインと DB は残額 7000 になる。high → medium に補正する理由は 3 点。(a) 前提が tail event である: 非同期返金（konbini / customer\_balance、または Stripe が pending を返したカード）が後日 failed/canceled になる、という条件が要る。同期カード返金は作成時点で succeeded を返すので paymentStatus が REFUNDED に確定し、そこから failed に落ちてもボタンが消える理由は cumulativeRefunded ではなく paymentStatus になる（=この指摘の経路ではない別事象）。(b) fail-closed である: 誤差は常に「返金可能額を過少に見せる」方向で、二重返金や過大返金は起きない。DB 側 assert\_refund\_total\_within\_paid も独立に上限を守っている。(c) 見出しの「返金再試行の導線を塞ぐ」は failed に関しては言い過ぎ: Stripe の失敗返金は資金が残高に戻り代替手段の手配が必要で、refund-status-updated.ts:101-121 の CRITICAL ログ自身が "alternative refund method" と案内している。同一 Stripe 返金の再試行が本来の是正手段になるのは canceled 側と、失敗試行とは無関係な後続の正当な返金のケース。ただしその 2 ケースと、管理者に嘘の金額を見せる表示バグ自体は実害として残る。修正時の注意: 直すべき箇所は events だけではなく reservations/admin-queries.ts:390-394 も同型なので両方。SSoT は既に REFUND\_AGGREGATE\_EXCLUDED\_STATUSES（stripe-refund-orchestration.ts:326）と invariants.sql に二重に存在するので、query 側はその定数を再利用すべきで、新しいリテラルを書き足さないこと。

---

### F-51

**公開 FAQ の閲覧・投票が updatedAt を更新するため、鮮度チェック cron と管理画面の「未更新」指標が恒久的に 0 になる**

<sub>[対処の記録](2026-08-12-codebase-audit-progress.md) ／ [棄却一覧](2026-08-12-codebase-audit-refuted.md)</sub>

|        |                                                  |
| ------ | ------------------------------------------------ |
| 深刻度 | 中                                               |
| 箇所   | `src/shared/domain/faq/analytics-commands.ts:12` |
| 領域   | コンテンツ                                       |

#### 起きること

FaqItem.updatedAt は Prisma の @updatedAt（schema.prisma:1665）なので、updateMany でも必ず現在時刻に書き換わる。訪問者が /faq でアコーディオンを開くと FaqViewTracker が POST /api/faq/\[id\]/view を叩き、この updateMany が走って updatedAt が now になる。dedup は localStorage の 24 時間 TTL（ブラウザ単位）だけなので、別の訪問者が開けば再び発火する。FAQ\_STALE\_DAYS は 180（faq/constants.ts:10）なので、180 日に 1 度でも誰かに開かれた FAQ 項目は detectStaleFaqItems の `updatedAt: { lt: threshold }` に永久に一致しない。結果、weekly の /api/cron/faq-stale-check は常に detected: 0 を返し、管理画面の getFaqHealthSummary().staleCount と quickFilter='stale' も 0 件になる。内容が 3 年間見直されていない人気 FAQ ほど確実に検知対象から外れるという逆転が起きる。voteFaqItemHelpful（同ファイル 40-46 行）も同様に updatedAt を進める。

#### 直し方

鮮度判定を「管理者による編集時刻」に分離する。閲覧・投票の updateMany は $executeRaw で updated\_at を触らないようにするか、FaqItem に contentUpdatedAt（updateFaqItem / createFaqItem のみが書く列）を足して detectStaleFaqItems・getFaqHealthSummary・quickFilter='stale' の 3 箇所をそちらへ向ける。

#### 該当箇所

```
data: { viewCount: { increment: 1 }, lastViewedAt: new Date() },
```

#### 到達経路

src/app/(public)/faq (公開ページ) → src/shared/domain/sections/queries.ts:227-228 (helpfulCount/notHelpfulCount を select) → src/app/(public)/\_components/FaqListSection.tsx:105-106 (hasTracking=true) → :150 \<FaqViewTracker\> → src/app/(public)/faq/\_components/faq-view-tracker.tsx:70-76 (open かつ localStorage 24h TTL 未ヒット) → :45-48 POST /api/faq/{id}/view → src/app/api/faq/\[id\]/view/route.ts:31 (feature ON で通過) → :35-38 (uuid 検証を通過) → :40 incrementFaqItemViewCount → src/shared/domain/faq/analytics-commands.ts:10-13 prisma.faqItem.updateMany（data に updatedAt 未指定 → schema.prisma:1665 の @updatedAt が now を書く）→ 誤った結果: src/shared/domain/faq/analytics-commands.ts:29 `updatedAt: { lt: threshold }` に一致しなくなり src/app/api/cron/faq-stale-check/route.ts:59-63 が detected:0 で返る／src/shared/domain/faq/queries.ts:309 staleCount=0・:210-212 quickFilter="stale" が 0 件。投票側も同型: src/app/api/faq/\[id\]/helpful/route.ts:56 → analytics-commands.ts:40-46。

#### 既存の検査

未捕捉。\_\_tests\_\_/unit/domain/faq/commands.test.ts:1212- の detectStaleFaqItems テストは prisma.faqItem.findMany を mock し where の形だけを assert するため、実 DB の @updatedAt 副作用は観測できない。integration テストにも faq view→stale の連動を見るものは無い（grep: detectStaleFaqItems / incrementFaqItemViewCount は \_\_tests\_\_/unit/domain/faq/commands.test.ts のみ）。

#### 反証官による訂正

主張はほぼ正確。事実誤認・過大表現は次の 4 点。(1) 見出しの「恒久的に 0 になる」は誇張。閲覧も投票もされていない公開項目は今も検知される。正しくは「180 日に 1 度でも開かれた項目だけが恒久的に検知対象から外れる」で、結果として『人気のある FAQ ほど見直し通知が来ない』という逆転が起きる、が正しい要約。(2) 到達経路の行番号にずれ。faq-view-tracker.tsx:46 は sendView 内の fetch 行であり、発火の判定は :70-76 の useEffect。それ以外（analytics-commands.ts:12/29、schema.prisma:1665、constants.ts:10、view/route.ts:40、cron route.ts:59、queries.ts:211/309）は実測で一致。(3) dedup の記述が不完全。localStorage 24h TTL に加えて同一マウント内は sentRef（faq-view-tracker.tsx:67）で 1 回に抑えられる。ただしページ再訪・別ブラウザ・localStorage 無効時（hasRecentlyViewed が catch で false を返す）には再発火するので結論は変わらない。(4) 影響範囲の申告漏れ。同じ原因で quickFilter="recent"（queries.ts:207-209, FAQ\_RECENT\_DAYS=7）が閲覧されただけの項目を「最近更新」と誤表示し、管理一覧の sortBy="updatedAt"（queries.ts:239-241）も訪問者トラフィック順に歪む。つまり被害は stale 検知だけではない。なお私は DB へのプローブを実行していない。updateMany が @updatedAt を bump する点の根拠はスキーマ（DB 既定値なし）とリポジトリ自身の設計文書であって、実行時観測ではない。修正するなら incrementFaqItemViewCount / voteFaqItemHelpful の data に既存値を保つ形で updatedAt を明示するか、鮮度判定を別列（contentUpdatedAt）へ移す必要があり、どちらも 1 行では済まないので着手前に方針確認が要る。

---

### F-52

**匿名化が Inquiry.subject（自由記入 200 文字）を消さず、GDPR 相当の削除後も件名の PII が残り続ける**

<sub>[対処の記録](2026-08-12-codebase-audit-progress.md) ／ [棄却一覧](2026-08-12-codebase-audit-refuted.md)</sub>

|        |                                                        |
| ------ | ------------------------------------------------------ |
| 深刻度 | 中                                                     |
| 箇所   | `src/shared/domain/inquiries/anonymize-commands.ts:83` |
| 領域   | 問い合わせ                                             |

#### 起きること

顧客が「田中太郎 090-1234-5678 の予約について」という件名で問い合わせる（publicInquirySchema の subject は min1/max200 の自由記入テキスト、src/shared/lib/validations/inquiry.ts:27-31）。後日その顧客が削除を請求し、管理者が匿名化ダイアログで理由「顧客からの依頼 (GDPR / 個人情報保護法相当)」を選んで実行する。anonymizeInquiryInTx の update データ（78-86 行）には name / email / phoneNumber / companyName / message しか無く subject が含まれないため、件名の氏名と電話番号がそのまま DB に残る。残った件名は (1) 管理画面詳細に「個人情報は削除されています」というバナーの直下でそのまま表示され（InquiryDetail.tsx:192 のバナー文言と 227 行 `<DetailField label="件名" value={inquiry.subject} />`）、(2) 一覧の select に subject が含まれ（queries.ts:313）、(3) 管理画面検索が subject を contains 検索する（queries.ts:282）ため、匿名化後も氏名で検索してヒットする。同じ問題は退会時の連鎖匿名化（customer-lifecycle-commands.ts:240 の anonymizeInquiryInTx 呼び出し）にも及ぶ。

#### 直し方

anonymizeInquiryInTx の update に subject のプレースホルダ化（例 `subject: INQUIRY_ANONYMIZE_PLACEHOLDER_SUBJECT`）を追加し、admin actions/inquiry.ts:307 の ANONYMIZED\_INQUIRY\_FIELDS にも "subject" を足す。あわせて InquiryInternalNote.body（顧客について書かれた社内メモ）を残す判断が意図的なのかを決め、意図的なら anonymize-commands.ts の JSDoc に「残す列」を明示列挙して、置換対象列と AuditLog の申告が一致することを固定する unit テストを 1 本置く。

#### 該当箇所

```
message: INQUIRY_ANONYMIZE_PLACEHOLDER_MESSAGE,
```

#### 到達経路

src/app/(admin)/admin/(dashboard)/inquiries/\[id\]/\_components/AnonymizeInquiryButton.tsx:42 anonymizeInquiry(inquiryId, "customer-requested") → src/app/(admin)/admin/(dashboard)/\_shared/actions/inquiry.ts:332-345 zod で reason 検証後 anonymizeInquiryCommand → src/shared/domain/inquiries/anonymize-commands.ts:158-172（未匿名化の実在行なので NOT\_FOUND / CONFLICT の両分岐とも成立せず通過）→ :174 anonymizeInquiryInTx → :76-87 tx.inquiry.update の data が name/email/phoneNumber/companyName/message/anonymizedAt/anonymizedReason のみで subject を含まない → prisma/schema.prisma:1203 の subject VARCHAR(200)（自由記入: src/shared/lib/validations/inquiry.ts:27-31 と src/app/(public)/\_shared/components/forms/public-inquiry-form-card.tsx:410）が原文のまま残存 → 誤った結果: (a) src/app/(admin)/admin/(dashboard)/inquiries/\[id\]/\_components/InquiryDetail.tsx:186-195 の「個人情報は削除されています」バナー直下 :227 で件名を素のまま表示、(b) src/shared/domain/inquiries/queries.ts:244-286 の where が anonymizedAt を除外しないため :282 の subject contains 検索が匿名化後もヒット、:305/:330 で一覧に件名を返す。連鎖経路: src/shared/domain/customers/customer-lifecycle-commands.ts:240 → 同一の anonymize-commands.ts:76-87。

#### 既存の検査

\_\_tests\_\_/unit/domain/inquiries/anonymize-commands.test.ts は placeholder 化を検証しているが subject への言及が 0 件（grep で companyName:null の 1 件のみヒット）。プレースホルダ列の SSoT gate も無い。逆に data-retention/commands.ts:180 は「Inquiry は subject / message にも PII が入り得るため partial NULL 化ではなく完全削除する」と明記しており、リポジトリ自身が subject を PII と認めている。

#### 反証官による訂正

指摘は事実関係としてはほぼ正確だが、以下 4 点を訂正・補足する。(1) 「1 ファイルの実装漏れ」という含意は不正確。subject の除外は 3 箇所で一貫している — 設計書 §6.5（docs/superpowers/specs/2026-07-24-inquiry-overhaul-completion-design.md:177 が placeholder 対象を name/email/phoneNumber/companyName/message/replies.body と列挙し subject を含まない）、command の JSDoc（anonymize-commands.ts:25-34 の同じ列挙）、監査ログ定数 ANONYMIZED\_INQUIRY\_FIELDS（src/app/(admin)/admin/(dashboard)/\_shared/actions/inquiry.ts:307-315）。したがって**監査ログは「subject を匿名化した」と偽っておらず**、修正は 1 行追加ではなく設計判断（件名を placeholder 化するか、匿名化後は件名を伏せて表示・検索対象から外すか）になる。(2) パス表記が不正確。admin action は `admin actions/inquiry.ts` ではなく `src/app/(admin)/admin/(dashboard)/_shared/actions/inquiry.ts`（行 342 は一致）。(3) ダイアログ文言は理由ラベル「顧客からの依頼」と説明文「顧客本人が削除を希望した場合 (GDPR / 個人情報保護法相当)」の 2 要素（AnonymizeInquiryConfirmDialog.tsx:35-36）で、指摘はこれを 1 つの理由名として連結している。また action 側の reason enum は customer-requested / admin-purge / data-retention の 3 値のみで、customer-cascade は UI から選べない（inquiry.ts:298-301）。(4) 深刻度 high → medium。残存するのは「件名に PII を打った場合に限り」PII であって必然ではなく、露出面は認証済み admin 画面（および本人の mypage 行）に限られ匿名・公開経路は無い。退会連鎖の場合は anonymizeCustomerCommand が紐づく認証 User を消す（customer-lifecycle-commands.ts:223-225）ため mypage 経由の再閲覧経路も実質消える。さらに purgeExpiredInquiries が保持期限で行ごと hard delete する（data-retention/commands.ts:213-）ため残存は無期限ではない。一方で、明示的な削除請求（GDPR 相当）を満たしきれず、UI が「個人情報は削除されています」と断言する隣で件名が氏名・電話番号を保持し得る点、匿名化後も氏名で検索ヒットする点は実在の是正対象であり、ノイズではない。

---

### F-53

**システムページから削除したセクションが、編集画面を開くたび／管理サービス起動のたびに初期デモ文言つきで復活する**

<sub>[対処の記録](2026-08-12-codebase-audit-progress.md) ／ [棄却一覧](2026-08-12-codebase-audit-refuted.md)</sub>

|        |                                                       |
| ------ | ----------------------------------------------------- |
| 深刻度 | 中                                                    |
| 箇所   | `src/shared/domain/pages/system-pages-commands.ts:40` |
| 領域   | CMS                                                   |

#### 起きること

管理者が /admin/pages/about/edit で custom セクション（自社で書き換えた本文）を削除する。削除アクションが revalidateTag を呼ぶため編集ルートが再レンダーされ、EditPagePage が再び ensureSystemPageCommand("about") を実行する。ensurePageSectionsCommand は「DEFAULT\_PAGE\_SECTIONS\['about'\] にあって DB に無い type」を欠落とみなし、custom を order:1（削除で空いたばかりなので UNIQUE 衝突しない）で再作成する。復活した config は管理者が書いた内容ではなくコード同梱のデモ文（default-page-sections.ts:366 の「私たちは、すべての人が自分らしい活動ができる『場』を…」）なので、公開 /about に未承認の初期文言が再掲載される。編集画面を開かなくても、admin サービスのコールドスタート時に instrumentation.ts:26 の bootstrapSystemPages() が全システムページで同じ復活を行う。

#### 直し方

ensurePageSectionsCommand を「Page 行を新規作成した直後にだけ既定セクションを流す」ブートストラップに限定する（bootstrapSystemPagesCommand:110 と commands.ts:113 の既存ページ経路からは呼ばない）。既存ページに対して既定を補充し続けたいなら、Section 側に「既定由来かつ管理者が削除した」ことを表す列（例: bootstrappedAt / dismissedDefaults）を持たせ、削除済みの type を二度と再生成しない。

#### 該当箇所

```
const missingSections = defaults.filter(
(section) => !existingTypes.has(section.type),
);
```

#### 到達経路

src/app/(admin)/admin/(dashboard)/pages/\[slug\]/edit/\_components/SectionListSidebar.tsx:163 handleDelete → :165 deletePageSection(id) → src/app/(admin)/admin/(dashboard)/\_shared/actions/page-section.ts:131 deletePageSectionCommand → src/shared/domain/sections/commands.ts:183 type!=="page-hero" で素通り → :189 isRequiredSectionForTemplate("content","custom") が src/shared/lib/sections/page-templates.ts:219 で false（TEMPLATE\_DEFS.content:81-87 に requiredSectionTypes 無し）→ :195 prisma.section.delete で order:1 が空く → SectionListSidebar.tsx:170 router.refresh() → src/app/(admin)/admin/(dashboard)/pages/\[slug\]/edit/page.tsx:57 ensureSystemPageCommand("about") → src/shared/domain/pages/commands.ts:113 ensurePageSections(page.id,"about") → src/shared/domain/pages/system-pages-server.ts:14 → src/shared/domain/pages/system-pages-commands.ts:40 missingSections に "custom" が入る → :59 toCreate 同上 → :67-75 createMany が src/shared/lib/constants/default-page-sections.ts:363-370 の config（:366 のデモ本文）を order:1 で再作成 → page.tsx:59 getPageForEdit が復活後を返し、公開 /about にもコード同梱のデモ文が再掲載される。別経路: src/instrumentation.ts:23-26 bootstrapSystemPages（APP\_SURFACE==="admin" のコールドスタート時）→ system-pages-commands.ts:110 で全システムページに同じ復活。

#### 既存の検査

none。\_\_tests\_\_/unit/domain/pages/system-pages-commands.test.ts は section.findMany を常に \[\] で mock しており（64行 `mockSectionFindMany.mockResolvedValue([])`）、「一部 type だけ既存」のケースを一切通していない。\_\_tests\_\_/unit/domain/pages/commands.test.ts:245 も findMany が呼ばれることしか見ていない。

#### 反証官による訂正

3点訂正。(1) 再レンダーの引き金は revalidateTag ではない。deletePageSection の afterSuccess は revalidatePages(pageSlug)（actions/page-section.ts:137-139）で公開側 tag を叩くだけで、編集ルートを再実行させているのはクライアント側の明示的な router.refresh()（SectionListSidebar.tsx:170）。結果として復活は「次に開いたとき」ではなく削除直後に起き、管理者の目に即座に見える（page.tsx:57 の ensure が :59 の getPageForEdit より前に走るため）。この即時可視性が「未承認の初期文言が気付かれずに公開され続ける」という筋書きを弱めるので、深刻度は high ではなく medium が妥当。回避策もある（削除ではなく isActive を OFF にすれば type が残るので復活しない）。(2) 復活が常に起きるとは限らない。削除後に残ったセクションを DnD で並び替えて order:1 が埋まっていると、createMany が sections\_page\_id\_order\_key（prisma/schema.prisma:1572）に衝突し、system-pages-commands.ts:81-86 の catch が P2034 以外を握り潰して return 0 するため復活しない（ただしこの握り潰しでエラーが完全に無言になるのは別の問題）。(3) 影響範囲は custom だけではない。about の order:0 は "page-hero" ではなく "hero"（default-page-sections.ts:345）なので deletePageSectionCommand:183 のガードに掛からず、同じく削除→復活する。requiredSectionTypes を持たない content / custom テンプレートの全 default type が同じ性質を持つ。

---

### F-54

**charge.refunded 経路の Refund 行が Stripe の実 status を記録せず既定値 "succeeded" で焼かれ、未確定・失敗返金が「返金済み」として確定する**

<sub>[対処の記録](2026-08-12-codebase-audit-progress.md) ／ [棄却一覧](2026-08-12-codebase-audit-refuted.md)</sub>

|        |                                                                |
| ------ | -------------------------------------------------------------- |
| 深刻度 | 中                                                             |
| 箇所   | `src/shared/domain/payment/payment-claim-orchestration.ts:194` |
| 領域   | 決済・返金                                                     |

#### 起きること

入力: konbini / customer\_balance のような非同期返金（Stripe Refund.status="pending"）が Stripe Dashboard 手動操作で作られた、あるいは app 側返金経路（refundReservationPaymentCommand の Phase C）に webhook が先着した状態で charge.refunded が届く。

(1) createRefundRecord に渡すオブジェクトに status が無いため、Refund 行は schema の `status String @default("succeeded")`（prisma/schema.prisma:2736）で "succeeded" として INSERT される。app 側の全経路（reservations/payment-commands.ts:782, 1000, 1150、events/payment-commands.ts:980, 1207, 1367, 1525）はいずれも `status: refund.status ?? "pending"` を明示的に渡しており、この経路だけが実 status を捨てている。
(2) 直後に applyStripeChargeRefundIdempotent は `resolveRefundStatusFromChargeAmounts` の金額比較だけで updatePaymentStatus を無条件に呼び、paymentStatus を REFUNDED / PARTIALLY\_REFUNDED へ遷移させる（payment-claim-orchestration.ts:205-210）。app 側経路が `if (isRefundSettledSuccess(refund.status))` で意図的に保留しているのと真逆の挙動。
(3) 後日 Stripe が refund.failed を送っても handleRefundStatusUpdated は applyConfirmedRefundStatus で status 列を "failed" にし CRITICAL ログを出すだけで、entity の paymentStatus を戻す経路がコード上存在しない（refund-status-updated.ts:101-122）。結果、Stripe 側は無返金・DB 側は REFUNDED という会計 mismatch が焼き付く。
(4) 逆に後日 "succeeded" が確定した場合も、claimRefundSettlement の `status: { notIn: ["succeeded", "failed", "canceled"] }`（stripe-refund-orchestration.ts:206-210）が count=0 になるため finalizeSettledReservationRefund は null 早期 return で false を返し、返金完了メール（sendReservationRefundEmail）と完了 AuditLog が永久に出ない。

#### 直し方

applyStripeChargeRefundIdempotent の createRefundRecord 引数に `status` を追加し、webhook payload の `charge.refunds.data[0].status` をそのまま渡す（handleChargeRefunded の latestRefund 組み立て時に status を保持する）。併せて updatePaymentStatus は `isRefundSettledSuccess(latestRefund.status)` が真のときだけ呼び、未確定時は refund.updated 側の finalizeSettled\* に委ねる（app 側 refund 経路と同一契約に揃える）。latestRefund が payload に含まれない場合（refunds 未展開）は paymentStatus を動かさず refund.updated に委ねるか、Stripe から refund を retrieve して status を解決する。既定値に頼る設計自体をやめ、schema の `@default("succeeded")` も削って全経路に status 明示を強制するのが本筋。

#### 該当箇所

```
try {
await input.createRefundRecord({
amount: fromStripeUnitAmount(latestRefund.amount, currency),
stripeRefundId: latestRefund.id,
refundedByType,
});
```

#### 到達経路

src/app/api/webhooks/stripe/route.ts:169 (dispatchStripeWebhookEvent) → src/shared/domain/payment/stripe-webhook/dispatch.ts:39-41 (case "charge.refunded") → src/shared/domain/payment/stripe-webhook/charge-refunded.ts:51-61 (latestRefund を id/amount/metadata のみで再構築し status を捨てる) → :66 applyChargeRefundIdempotent → src/shared/domain/reservations/payment-queries.ts:361 applyStripeChargeRefundIdempotent → :369-386 createRefundRecord callback が `{reservationId, ...refundData}` のみ渡す → src/shared/domain/payment/payment-claim-orchestration.ts:194-198 (status 未指定) → prisma/schema.prisma:2736 `@default("succeeded")` で pending 返金が "succeeded" として INSERT → payment-claim-orchestration.ts:205-210 (resolveRefundStatusFromChargeAmounts の金額比較のみで updatePaymentStatus を無条件呼出) → payment-status-guards.ts:43-46 の起点集合に PAID が含まれるため reservation.paymentStatus = REFUNDED。以後: (a) 後日 refund.updated(succeeded) → refund-status-updated.ts:62-76 → payment-queries.ts:467,476 claimRefundSettlement の `status: { notIn: ["succeeded","failed","canceled"] }` (stripe-refund-orchestration.ts:205-211) が count=0 → :477-478 で null 早期 return → 返金完了メール・完了 AuditLog が永久欠落。(b) 後日 refund.failed → refund-status-updated.ts:92-99 で Refund.status のみ "failed" に訂正、:101-122 は CRITICAL ログのみで paymentStatus を戻す経路が無い → Stripe 側無返金 / DB 側 REFUNDED。さらに src/shared/domain/reservations/payment-commands.ts:690-697 の入口 gate (`PAID` / `PARTIALLY_REFUNDED` のみ許可) により、app からの是正返金も不能になり Dashboard 手動対応が必須になる。events 側も同型 (events/payment-queries.ts:338, :407)。

#### 既存の検査

none。確認した対象: (a) \_\_tests\_\_/unit/architecture/refund-append-only.test.ts は refunds の UPDATE/DELETE を DB trigger で拒否することと、payment-commands.ts / payment-queries.ts に `tx.refund.update*` が 0 件であることのみを検査し、INSERT 時の status 値は見ていない。(b) \_\_tests\_\_/unit/api/stripe-webhook.test.ts:1074-1200 の charge.refunded テスト群は applyChargeRefundIdempotent 自体を mock しており（同ファイル:242）、永続化される Refund.status を検査していない。(c) DB 側 prisma/baseline/invariants.sql:250 assert\_refund\_total\_within\_paid は金額合計のみ、:596 prevent\_refunds\_mutation は status 以外の列の不変性のみを見る。(d) \_\_tests\_\_/integration/domain/payment/refund-duplicate-detection.test.ts は P2002 検出のみ。

#### 反証官による訂正

指摘本文はほぼ正確（引用・行番号 payment-claim-orchestration.ts:194 / schema.prisma:2736 / payment-commands.ts:782 / stripe-refund-orchestration.ts:206-210 はいずれも実在を確認）。訂正 3 点。(1) 因果の切り分け: 主張 (2) の「paymentStatus 無条件遷移」は status 未指定の帰結ではなく独立した第 2 の欠陥。applyStripeChargeRefundIdempotent は Refund 行に正しい "pending" が入っていても :205-210 で無条件に updatePaymentStatus を呼ぶため、app 側経路が先着して P2002 で webhook 側 insert が握り潰される通常順序（stripe-refund-orchestration.ts:267-283 の savepoint rollback）でも paymentStatus は REFUNDED に飛ぶ。修正は status 伝搬だけでは不十分で、遷移自体の gate も要る。(2) 主張 (3) の「会計 mismatch が焼き付く」は entity.paymentStatus のみに当てはまる。Refund.status 列は refund.failed 到着時に refund-status-updated.ts:92-99 の applyConfirmedRefundStatus("succeeded"→"failed") で訂正され、:101-122 が CRITICAL ログを出すので完全に無言ではない（検知可能・要手動対応）。ただし REFUND\_AGGREGATE\_EXCLUDED\_STATUSES が failed を除外する一方 paymentStatus が REFUNDED のままなので、payment-commands.ts:690-697 の入口 gate で app からの是正返金は塞がる。(3) 前提条件が抜けている: 実害には Stripe Refund.status が非終端であることが必要で、カードのみ構成では refunds.create が同期的に "succeeded" を返すため既定値は正しい。konbini / customer\_balance は管理画面の payment\_method\_types で opt-in 選択された場合のみ（ハードコード fallback 無し、StripeSection.tsx:585 付近）。この設定依存性のため high ではなく medium とした（発火時の影響は金銭整合・顧客通知欠落で重いが、発火条件が構成依存かつ失敗側は CRITICAL アラート経路あり）。

---

### F-55

**charge.refunded が未確定 (pending) の返金でも paymentStatus を確定させ、返金失敗後も戻らない**

<sub>[対処の記録](2026-08-12-codebase-audit-progress.md) ／ [棄却一覧](2026-08-12-codebase-audit-refuted.md)</sub>

|        |                                                                |
| ------ | -------------------------------------------------------------- |
| 深刻度 | 中                                                             |
| 箇所   | `src/shared/domain/payment/payment-claim-orchestration.ts:210` |
| 領域   | Stripe handler                                                 |

#### 起きること

settings の stripePaymentMethodTypes に konbini / customer\_balance が入っている環境 (src/shared/lib/stripe-payment-methods.ts:29-30 で許可済み)。管理者が totalPriceWithTax=10000 / PAID の予約 R を全額返金する → Stripe の refunds.create が status="pending" を返す → refundReservationPaymentCommand は設計どおり paymentStatus を書き換えず PAID のまま残す (src/shared/domain/reservations/payment-commands.ts:788 `if (isSettled) {`)。その直後に Stripe が charge.refunded (charge.amount=10000 / charge.amount\_refunded=10000) を配送する → handleChargeRefunded → applyChargeRefundIdempotent → ここで resolveRefundStatusFromChargeAmounts が金額比較だけで REFUNDED を返し、Refund の settlement 状態を一切見ずに updateMany が走る → paymentStatus=REFUNDED に確定。数日後に返金が失敗して refund.failed が届くと handleRefundStatusUpdated は Refund.status を "failed" にして CRITICAL ログを出すだけで paymentStatus は戻さない (src/shared/domain/payment/stripe-webhook/refund-status-updated.ts:101-121)。結果、顧客に金が戻っていないのに予約は REFUNDED で焼き付き、refundReservationPaymentCommand は PAID / PARTIALLY\_REFUNDED しか入口にしない (payment-commands.ts:690-698) ため管理画面から再返金もできない。EventRegistration 側 (src/shared/domain/events/payment-queries.ts:358-366) も同一実装。付随して createRefundRecord に status を渡していないため、Dashboard 起点の pending 返金は schema default の "succeeded" (prisma/schema.prisma:2736) で記録され、後続の refund.updated(succeeded) で claimRefundSettlement が count=0 になり返金完了メールと AuditLog が丸ごと欠落する。

#### 直し方

applyStripeChargeRefundIdempotent に Refund の settlement 状態を渡し、他経路と同じく status="succeeded" が確定した分だけで paymentStatus を決める。charge.refunded 単体では確定できないなら、この handler は Refund 行の idempotent 書込 (status を Stripe の値で明示) までに留め、paymentStatus 反映は refund.updated 側の finalizeSettled\*Refund に一本化する。

#### 該当箇所

```
await input.updatePaymentStatus(newStatus);
```

#### 到達経路

前提: Settings.stripePaymentMethodTypes に konbini / customer\_balance を追加（既定は \["card"\] — prisma/schema.prisma:1917、値域は src/shared/lib/stripe-payment-methods.ts:27-32）

\1. 管理者が totalPriceWithTax=10000 / PAID の予約を全額返金 → src/shared/domain/reservations/payment-commands.ts:740 createStripeRefundOrThrow → refund.status="pending"
\2. src/shared/domain/reservations/payment-commands.ts:774 `const isSettled = isRefundSettledSuccess(refund.status)` = false → :788 `if (isSettled) {` が偽 → paymentStatus は PAID のまま温存（設計どおり）
\3. Stripe が charge.refunded を配送 → src/app/api/webhooks/stripe/route.ts:169 dispatchStripeWebhookEvent → src/shared/domain/payment/stripe-webhook/dispatch.ts:39-41 → src/shared/domain/payment/stripe-webhook/charge-refunded.ts:51-61（refunds.data\[0\].status を読まずに id/amount/metadata のみ抽出）→ :66 applyChargeRefundIdempotent
\4. src/shared/domain/reservations/payment-queries.ts:361 → src/shared/domain/payment/payment-claim-orchestration.ts:205 resolveRefundStatusFromChargeAmounts（src/shared/domain/payment/payment-status-guards.ts:89-96 = 金額比較のみ、settlement 判定なし）→ :210 updatePaymentStatus(REFUNDED)
\5. src/shared/domain/reservations/payment-queries.ts:381-390 の updateMany は WHERE に buildChargeRefundPaymentStatusWhere()（src/shared/domain/payment/payment-claim-orchestration.ts:214-222 → PAID/PARTIALLY\_REFUNDED）を spread するだけなので PAID にマッチ → paymentStatus=REFUNDED が確定【誤った結果】
\6. 後日 refund.failed → src/shared/domain/payment/stripe-webhook/refund-status-updated.ts:92-99 で Refund.status="failed"、:101-121 で CRITICAL ログのみ。paymentStatus は REFUNDED のまま
\7. 管理画面からの再返金は src/shared/domain/reservations/payment-commands.ts:691-696 の入口 guard（PAID / PARTIALLY\_REFUNDED のみ）で DomainError。DB 直介入以外に回復手段が無い

EventRegistration 側も同一（src/shared/domain/events/payment-queries.ts:338-367 → 同じ payment-claim-orchestration.ts:205-210）。

付随（同じ helper 由来・独立に確認済み）: payment-claim-orchestration.ts:194-198 の createRefundRecord 呼び出しが status を渡さず、reservations/payment-queries.ts:373-378 / events/payment-queries.ts:350-355 がそのまま spread するため、行は prisma/schema.prisma:2736 の default "succeeded" で作られる。その後 refund.updated(succeeded) が来ても src/shared/domain/payment/stripe-refund-orchestration.ts:201-213 claimRefundSettlement の `status: { notIn: ["succeeded","failed","canceled"] }` に当たらず count=0 → finalize が false を返し返金完了メールと完了 AuditLog が欠落。

#### 既存の検査

\_\_tests\_\_/unit/api/stripe-webhook.test.ts:1077-1196 は applyChargeRefundIdempotent を mock 差し替えして「入力が伝播するか」だけを見ており、この関数の中身は 1 行も走らない。\_\_tests\_\_/unit/architecture/refund-append-only.test.ts は refund.update\* の grep のみで status 遷移の意味は見ない。他の全返金経路 (payment-commands.ts:788 / :1005 / :1155、events/payment-commands.ts:1213) は isRefundSettledSuccess で gate しており、charge.refunded だけが例外になっている。

#### 反証官による訂正

high → medium に補正。理由と事実誤認の訂正:

【誇張の補正】
\- 既定構成では発火しない。Settings.stripePaymentMethodTypes の DB 既定は \["card"\]（prisma/schema.prisma:1917）で、konbini / customer\_balance は管理者が明示的に有効化した環境でのみ入る。指摘文は「入っている環境」と前提を明示していて誤りではないが、"high" の判定は既定構成での被害を含意するので過大。card のみの環境では refunds.create が同期的に "succeeded" を返し、charge.refunded 時点で金額比較は正しい。
\- 成功確定側は自己修復する。refund.updated(succeeded) → refund-status-updated.ts:62-85 → finalizeSettledReservationRefund が走り、paymentStatus は既に REFUNDED でも整合する。実害が残るのは (a) refund.failed / canceled で終わった場合、(b) 返金完了メール・完了 AuditLog が欠落する場合の 2 つに限られる。
\- 完全な silent failure ではない。refund.failed / canceled では refund-status-updated.ts:101-121 が CRITICAL ログを出し「管理者の手動対応が必要」と明示する。paymentStatus が戻らないことと再返金 guard により復旧に DB 直介入が要る点は指摘のとおりだが、検知手段は存在する。

【指摘が正確だった点（訂正なし）】
\- 引用行、行番号（payment-claim-orchestration.ts:210 / payment-commands.ts:788 / :691-696 / refund-status-updated.ts:101-121 / events/payment-queries.ts:358-366 / schema.prisma:2736）はいずれも実在し内容も一致。
\- 「他の全返金経路が isRefundSettledSuccess で gate しており charge.refunded だけが例外」は事実。charge-refunded.ts は refund の status を一切参照しない（同ファイルに "status" の出現 0 件）。
\- 既存カバレッジの申告（stripe-webhook.test.ts は helper を mock、refund-append-only.test.ts は grep のみ）も事実。この欠陥を落とすテストは存在しない。
\- createRefundRecord の status 未指定 → default "succeeded" → claimRefundSettlement が count=0、という付随指摘も再現経路まで確認済み。ただし影響範囲は Dashboard 起点の非同期返金と webhook 先着 race に限定される（アプリ起点なら payment-commands.ts:781 が実 status で先に行を作る）。

【確定できなかった前提】
\- 「Stripe が pending 返金でも charge.refunded を配送し amount\_refunded を即時に増やす」は node\_modules から確定できない（stripe パッケージは型定義のみで、esm/resources/Events.d.ts:618 の一文以上の情報が無い）。ただし amount\_refunded に pending が含まれない場合でも PAID → PARTIALLY\_REFUNDED という別の誤書き込みになるため、「未確定返金で paymentStatus を書く」という欠陥の核は前提に依存しない。

---

### F-56

**非ゼロ小数点通貨の部分返金で Refund.amount に小数が渡り webhook が 500 ループに入る**

<sub>[対処の記録](2026-08-12-codebase-audit-progress.md) ／ [棄却一覧](2026-08-12-codebase-audit-refuted.md)</sub>

|        |                                                                |
| ------ | -------------------------------------------------------------- |
| 深刻度 | 中                                                             |
| 箇所   | `src/shared/domain/payment/payment-claim-orchestration.ts:195` |
| 領域   | 決済 webhook テスト                                            |

#### 起きること

設定通貨は SUPPORTED\_CURRENCY\_VALUES = \["jpy","usd","eur"\] から選べる（form-schemas-security-integrations.ts:112 が z.enum で受理）。currency=usd の課金に対し管理者が Stripe ダッシュボードで $12.50 を部分返金すると、charge.refunded の refund.amount=1250 に対し fromStripeUnitAmount が 1250/100=12.5 を返す。この値が prisma.refund.create の `amount` に入るが、schema.prisma:2723 の Refund.amount は `Int`（コメントも「円、正整数」）なので Prisma が float を拒否して throw する。この例外は line 200 の `isPrismaUniqueConstraintError` 以外は rethrow される契約なので handleChargeRefunded → route.ts:190 で 500、Stripe は最大 3 日 exponential backoff で同じイベントを再送し続け、毎回同じ場所で落ちる。Refund 行も paymentStatus 遷移も永久に反映されない（返金済みなのに DB は PAID のまま）。※既報告の line 194「status 既定値 succeeded」とは別の欠陥（金額単位変換と列型の不整合）。

#### 直し方

Refund.amount へ書く前に整数保証する。fromStripeUnitAmount の結果が Number.isInteger でなければ最小単位で保持できる列に直すか、少なくとも CRITICAL ログ + 管理者通知にして丸め方針を明示する（無言の 500 ループにしない）。events/payment-queries.ts の applyEventChargeRefundIdempotent も同じ helper 経由で同型。

#### 該当箇所

```
amount: fromStripeUnitAmount(latestRefund.amount, currency),
```

#### 到達経路

前提: 管理画面 設定 → Stripe → 通貨 = "usd"（src/app/(admin)/admin/(dashboard)/settings/\_components/sections/StripeSection.tsx:667 の select、src/app/(admin)/admin/(dashboard)/\_shared/actions/settings/schemas/form-schemas-security-integrations.ts:112 の z.enum が受理、src/app/(admin)/admin/(dashboard)/\_shared/actions/settings/stripe.ts:84 で永続化）。管理者が Stripe ダッシュボードから $12.50 を手動部分返金する。
\1. Stripe → POST src/app/api/webhooks/stripe/route.ts:169 dispatchStripeWebhookEvent
\2. src/shared/domain/payment/stripe-webhook/dispatch.ts:40 case "charge.refunded" → handleChargeRefunded
\3. src/shared/domain/payment/stripe-webhook/charge-refunded.ts:51-61 latestRefund = { id, amount: 1250 }（Stripe 最小単位）、:70 currency = charge.currency = "usd"
\4. charge-refunded.ts:66 applyChargeRefundIdempotent → src/shared/domain/reservations/payment-queries.ts:361 applyStripeChargeRefundIdempotent
\5. src/shared/domain/payment/payment-claim-orchestration.ts:188 latestRefund が非 null → :194-198 createRefundRecord({ amount: fromStripeUnitAmount(1250, "usd") })
\6. src/shared/lib/stripe-shared.ts:91-93 "usd" は ZERO\_DECIMAL\_CURRENCIES に無い → 1250 / 100 = 12.5（Math.round 無し）
\7. src/shared/domain/reservations/payment-queries.ts:374-379 tx.refund.create({ data: { reservationId, amount: 12.5, ... } })
\8. node\_modules/@prisma/client/runtime/client.js の値型推論が 12.5 を {type:"Float"} と判定 → Int 入力型（prisma/schema.prisma:2723 `amount Int` / prisma/migrations 内 migration.sql:1458 `"amount" INTEGER NOT NULL`）と非互換 → throw
\9. payment-claim-orchestration.ts:199-201 P2002 ではないので rethrow → :210 updatePaymentStatus に到達しない
\10. src/app/api/webhooks/stripe/route.ts:174 markStripeEventProcessed をスキップし :190 で 500 → processedAt が null のまま → Stripe が最大 3 日 exponential backoff で再送 → 毎回 5〜9 を繰り返す。誤った結果: Refund 行が作られず paymentStatus は PAID のまま（実際は返金済み）、webhook は永久 500。

#### 既存の検査

stripe-webhook.test.ts:1156「charge.refunded (USD) → charge.currency が applyChargeRefundIdempotent に伝播する」はコメントで「Stripe cents → USD ドル逆変換の入力」を検証すると謳っているが、assert しているのは mock が currency:"usd" を受け取ったことだけで、変換関数も create も mock の向こう側。しかも amountRefunded は 5000（=$50.00、割り切れる）固定なので、端数が出る値が一度も流れていない。

#### 反証官による訂正

指摘は本質的に正しい。事実関係の訂正・補足は以下。

\1) ファイルパスの記載が不正確。`form-schemas-security-integrations.ts:112` の実パスは `src/app/(admin)/admin/(dashboard)/_shared/actions/settings/schemas/form-schemas-security-integrations.ts:112`、`stripe-webhook.test.ts:1156` は `__tests__/unit/api/stripe-webhook.test.ts:1156`。内容自体はどちらも申告どおり。

\2) 「部分返金」に限定するのは狭すぎる。トリガーは「usd/eur 設定下で、Stripe 最小単位の返金額が 100 の倍数でないこと」であって partial/full の別ではない。アプリ発の返金（stripe-refund-orchestration.ts:247 の `toStripeUnitAmount` が整数 app 金額を `Math.round(amount*100)` で送る）は必ず 100 の倍数になるので安全で、危険なのはダッシュボード等アプリ外で任意額が指定される経路だけ。皮肉なことに、この分岐は元々その経路のために書かれている（payment-claim-orchestration.ts:192 の `REFUNDED_BY_TYPE.STRIPE_DASHBOARD` fallback、payment-queries.ts の JSDoc「Dashboard 手動 refund 経路のみ書込」）。

\3) 破綻の壁は 1 枚ではなく 2 枚。Prisma の Int 型検証に加え、DB 側にも `CHECK (amount >= 1)`（prisma/migrations 内 migration.sql:2666）があるため、仮に丸めだけ足しても $0.50（→0.5、round で 1 か 0）のようなケースは別途検討が要る。「Math.round を挟せば済む」という単純な修正指針にはならない（USD/EUR ではセントが表現不能という、Refund.amount が Int である設計そのものの帰結）。

\4) 深刻度は medium 据え置きが妥当。既定通貨は "jpy" で、全 fallback も "jpy"（availability.ts:70 / admin-queries.ts:659 / checkout-helpers.ts:218,329）なので、既定構成の本番では発火しない。一方で usd/eur は管理画面から無警告で選べ、通貨別の決済手段検証（stripe-payment-methods.ts:74）や小数点通貨の変換テストまで揃った「正式サポート扱い」の構成であり、発火時の影響（webhook 永久 500 + 返金済みなのに paymentStatus が PAID のまま stuck）は大きい。条件付きだが実在の欠陥なので low への引き下げも high への引き上げもしない。

\5) 「既報告の line 194 status 既定値とは別」という自己申告は妥当。両者は同じ create 呼び出しの別々の引数に関する独立した問題。

---

### F-57

**refund.updated の順序前後で確定済み Refund.status が succeeded から pending へ巻き戻り、以後の返金確定判定が過小になる**

<sub>[対処の記録](2026-08-12-codebase-audit-progress.md) ／ [棄却一覧](2026-08-12-codebase-audit-refuted.md)</sub>

|        |                                                                        |
| ------ | ---------------------------------------------------------------------- |
| 深刻度 | 中                                                                     |
| 箇所   | `src/shared/domain/payment/stripe-webhook/refund-status-updated.ts:92` |
| 領域   | 決済・返金                                                             |

#### 起きること

入力: 非同期返金 re\_X が requires\_action → pending → succeeded と遷移し、Stripe が refund.updated を 2 通以上送る。Stripe は配送順を保証しないため、succeeded のイベントが pending のイベントより先に処理されうる。

(1) succeeded 側が先に処理され、finalizeSettledReservationRefund が Refund.status を "succeeded" に claim し、reservation.paymentStatus を REFUNDED に、完了 AuditLog と返金完了メールを送る。
(2) その後に届いた古い pending イベントで entity.status="succeeded" ≠ refund.status="pending" が成立し、applyConfirmedRefundStatus(prisma, re\_X, "succeeded", "pending") が呼ばれる。updateMany の WHERE は `{ stripeRefundId, status: previousStatus }` すなわち status="succeeded" に一致するため count=1 で成功し、確定済み行が "pending" に巻き戻る。
(3) 以後 finalizeSettledReservationRefund / finalizeSettledEventRegistrationRefund の `aggregate({ where: { ..., status: "succeeded" } })`（reservations/payment-queries.ts:489-493、events/payment-queries.ts:420-424）からこの返金額が抜ける。同一予約で別の部分返金が後から確定すると cumulativeSettled が実額より小さくなり、全額返金済みなのに `cumulativeSettled >= totalPriceWithTax` が偽になって paymentStatus が PARTIALLY\_REFUNDED のまま確定し、顧客への返金完了メールも isFullyRefunded=false / 過小な累計額で届く。

この挙動は applyConfirmedRefundStatus 自身の docstring（stripe-refund-orchestration.ts:149-152「既に "succeeded" / "failed" 等に確定済みの行を webhook の再送・順序前後で誤って再書込みしない」）が防ぐと明記している事象そのもので、実装は WHERE に現在値を入れているだけなので並行書込は防げても終端状態からの巻き戻しは防げていない。

#### 直し方

終端状態（succeeded / failed / canceled）に達した行は非終端へ戻さない。claimRefundSettlement が既に持っている `status: { notIn: ["succeeded", "failed", "canceled"] }` と同じ終端集合を SSoT として切り出し、applyConfirmedRefundStatus の WHERE にも併記する（`where: { stripeRefundId, status: previousStatus, NOT: { status: { in: TERMINAL_REFUND_STATUSES } } }`）か、handleRefundStatusUpdated 側で `isTerminalRefundStatus(entity.status)` なら非終端イベントを破棄する。Stripe が順序保証しない以上、遷移の受理は「終端に達していない行のみ」で判定するのが正しい。

#### 該当箇所

```
if (entity.status !== refund.status) {
await applyConfirmedRefundStatus(
prisma,
refund.id,
entity.status,
refund.status,
);
}
```

#### 到達経路

src/app/api/webhooks/stripe/route.ts:160-166 (claimStripeEventForProcessing → "claimed" または "retry\_unprocessed" は短絡しない) → src/app/api/webhooks/stripe/route.ts:169 (dispatchStripeWebhookEvent) → src/shared/domain/payment/stripe-webhook/dispatch.ts:43-45 (case "refund.updated") → src/shared/domain/payment/stripe-webhook/refund-status-updated.ts:42 (status 非 null なので通過) → 同:44-60 (entity 実在なので通過、entity.status="succeeded") → 同:62 (isRefundSettledSuccess("pending")=false、stripe-refund-orchestration.ts:125-127 → succeeded 分岐に入らない) → 同:92 ("succeeded" !== "pending" で真) → 同:93-98 applyConfirmedRefundStatus(prisma, refund.id, "succeeded", "pending") → src/shared/domain/payment/stripe-refund-orchestration.ts:161-164 (updateMany where {stripeRefundId, status:"succeeded"} → count=1、Refund.status が "pending" へ巻き戻る) → 誤った結果: src/shared/domain/reservations/payment-queries.ts:489-493 の aggregate({ where: { reservationId, status: "succeeded" } }) からこの返金額が脱落 → 同:497-499 の `cumulativeSettled >= reservation.totalPriceWithTax` が偽 → 同:501-503 で paymentStatus=PARTIALLY\_REFUNDED 確定、同:585-586 で cumulativeRefundAmount=過小 / isFullyRefunded=false のまま返金完了メール送信。events 側の同型経路は src/shared/domain/events/payment-queries.ts:420-424 → :430-431。

#### 既存の検査

none。確認した対象: \_\_tests\_\_/unit/domain/payment/stripe-webhook/refund-status-updated.test.ts:313-331 は requires\_action → pending（どちらも非終端）の遷移だけを検査しており、succeeded → pending / succeeded → requires\_action の巻き戻しケースが無い。\_\_tests\_\_/unit/domain/payment/stripe-refund-orchestration.test.ts の test は namespace 整合 / advisory lock / createStripeRefundOrThrow / createRefundRecordIdempotent / resolveRefundAmount ×2 の 6 本のみで applyConfirmedRefundStatus を一切呼んでいない。DB 側 prevent\_refunds\_mutation（prisma/baseline/invariants.sql:596）は status 列の更新を明示的に許可しているため、遷移方向のガードは無い。

#### 反証官による訂正

機構の記述は正確（引用・行番号・docstring 参照・カバレッジ申告すべて実物と一致。docstring は stripe-refund-orchestration.ts:149-151 が正確な範囲）。補足と訂正は 4 点。(1) 前提が弱く書かれている: この欠陥は Stripe の配送順無保証に依存しなくても再現する。repo 自身の dedup が "retry\_unprocessed"（src/shared/domain/stripe-events/dedup.ts:51-55、route.ts:160-166）で processedAt=null の古い event の handler 再実行を意図的に許可するため、「pending の event が handler 途中で throw → 500 → その間に succeeded が処理 → Stripe が pending を再送」という単一プロセス内の決定的な経路で成立する。(2) 巻き戻しの被害は succeeded 起点だけではない。entity.status="failed"/"canceled"（refund-status-updated.ts:101-122 が CRITICAL ログで管理者対応を要求した終端状態）から "pending" への巻き戻しも同じ line 92 を通り、(a) 手動代替返金が必要というインシデント状態を記録から消し、(b) claimRefundSettlement の `status: { notIn: ["succeeded","failed","canceled"] }`（stripe-refund-orchestration.ts:205-211）の除外から外れて再 claim 可能な行に戻す。指摘はこの面に触れていない。(3) 影響範囲は konbini / customer\_balance 等の非同期返金に限られる。カード返金は refunds.create 時点で "succeeded" が返り（reservations/payment-commands.ts:774-783）非終端 refund.updated が来ないため、全返金が対象という読み方は誤り。(4) severity は medium が妥当で誇張ではないが、金額誤りという最終被害には「同一 entity で後続の返金がもう 1 件確定する」という追加条件が要る。その条件が無い場合の直接被害は Refund.status 列の値そのものの汚損（管理画面表示・以後の集計・冪等性ゲートの再開放）に留まる。line 88-91 のコメント「再送での重複更新は同値書込になるだけで実害がない」は、届く status が保存済みより古くなり得ないという暗黙の前提に立っており、その前提自体が誤り。

---

### F-58

**管理者の予約編集が、消費済みクーポンを now 基準で再検証するため、クーポンが期限切れ/上限到達した瞬間にその予約が永久に編集不能になる**

<sub>[対処の記録](2026-08-12-codebase-audit-progress.md) ／ [棄却一覧](2026-08-12-codebase-audit-refuted.md)</sub>

|        |                                                        |
| ------ | ------------------------------------------------------ |
| 深刻度 | 中                                                     |
| 箇所   | `src/shared/domain/reservations/admin-commands.ts:377` |
| 領域   | 金額計算・クーポン                                     |

#### 起きること

2026-08-10 に顧客がクーポン SUMMER10（validUntil=2026-08-31、usageLimit=100）で予約。2026-09-05 に管理者が同じ予約の「利用人数」や「メモ」だけを直そうと編集フォームで保存する。ReservationEditForm は couponCode を `reservation.coupon?.code` で prefill して常に再送するため（ReservationEditForm.tsx:194 `couponCode: reservation.coupon?.code ?? ""`）、updateAdminReservationCommand は tx に入る前に validateCoupon を無条件で呼ぶ。payloads.ts:166-170 が `coupon.validUntil < now` を見て DomainError("無効なクーポンコードです", VALIDATION) を throw し、保存が丸ごと拒否される。usageLimit 到達（payloads.ts:172 `if (coupon.usageLimit !== null && coupon.usageCount >= coupon.usageLimit)`）や管理者による isActive=false でも同じ。つまり「限定クーポンを配り切る」「クーポンの有効期限が来る」という正常な運用の結果として、そのクーポンを使った全予約が admin から編集不能になる。唯一の回避策はクーポンコード欄を空にして保存することだが、それは couponChanged 経路（admin-commands.ts:583-596）に落ちて couponDiscountAmount=0・totalPrice がクーポン割引分だけ上昇し、usageCount も decrement される。エラー文言は管理者が触ってもいない項目を指すため原因も伝わらない。

#### 直し方

更新経路では「couponCode が現在の Reservation.coupon.code と同一なら再検証をスキップし、既存の couponId / couponDiscountAmount をそのまま維持する」分岐を入れる。再検証（validateCoupon + claimCouponUsage）は couponCode が実際に変わったときだけ走らせる。

#### 該当箇所

```
const validatedCoupon = await validateCoupon(
```

#### 到達経路

src/app/(admin)/admin/(dashboard)/reservations/\[id\]/edit/page.tsx:40 getReservationById → src/shared/domain/reservations/admin-queries.ts:368 coupon.code を select → src/app/(admin)/admin/(dashboard)/reservations/\_components/ReservationEditForm.tsx:194 defaultValue.couponCode = reservation.coupon.code（:476-481 の編集可能 Input に prefill され、無編集でも常に送信される） → src/app/(admin)/admin/(dashboard)/\_shared/actions/reservation/admin.ts:303-315 updateReservationAction が couponCode を素通しで command へ → src/shared/domain/reservations/admin-commands.ts:377 validateCoupon(input.couponCode, ...) を無条件呼出（tx 開始 :482 より前、currentReservation.couponId(:398) との一致分岐なし） → src/shared/domain/reservations/payloads.ts:167 `coupon.validUntil < now` または :172 `coupon.usageCount >= coupon.usageLimit` または :161 `!coupon.isActive` が成立 → payloads.ts:169/173/162 で DomainError("無効なクーポンコードです","VALIDATION") を throw → src/app/(admin)/admin/(dashboard)/\_shared/lib/admin-action.ts:63 で MutationError に変換 → admin.ts の isMutationError 分岐 → ReservationEditForm.tsx:274-279 の form エラー表示。誤った結果: 既に claim 済み（usageCount に計上済み）のクーポンを持つ予約が、そのクーポンの期限到来・上限到達・無効化の瞬間から、メモ/ゲスト連絡先/日時/スペース/ステータスのいずれの編集でも保存不能になる。なお回避策とされるクーポン欄クリアは admin-commands.ts:399 couponChanged=true → :427 chargeAffectingChange=true を経由するため、PAID/PARTIALLY\_REFUNDED/REFUNDED/PENDING の予約では :437-446 で別の DomainError に落ち、回避策自体が成立しない。

#### 既存の検査

\_\_tests\_\_/integration/reservations/admin-commands.test.ts は updateAdminReservationCommand を 8 ケース検証しているが、クーポン付き予約の update は 1 件も無い（grep: coupon 0 hit）。\_\_tests\_\_/integration/domain/reservations/coupon-claim-validity.test.ts は claimCouponUsage の 5 条件のみで、update 経路の validateCoupon 再実行は対象外。architecture gate 175 本に pricing/coupon 名のものは無い。

#### 反証官による訂正

指摘は成立するが、記述に 3 点の事実誤認がある。(1)「利用人数だけ直す」シナリオは成立しない — admin 予約編集フォームにも updateReservationAction にも numberOfGuests は存在しない（grep 0 hit。admin-commands.ts:288-289 の JSDoc も「admin UI に guest 入力が無い既存契約」と明記）。numberOfGuests を持つのは顧客セルフ変更経路（customer-commands.ts:583、\_\_tests\_\_/unit/architecture/edit-reservation-guest-count.test.ts）のほう。実際に阻害されるのは メモ / ゲスト連絡先（姓名・メール・電話・会社名・顧客区分）/ 日時 / スペース / PENDING↔CONFIRMED のステータス変更。(2)「唯一の回避策はクーポン欄を空にして保存」は不正確 — 空にすると couponChanged=true（admin-commands.ts:399）が chargeAffectingChange=true（:427）を誘発するため、paymentStatus が PAID/PARTIALLY\_REFUNDED/REFUNDED なら :442、PENDING なら :432 で別の DomainError に落ちる。クーポン予約が checkout を通って PAID になっている典型ケースでは回避策が一切無く、逆に指摘より状況は悪い。回避策が機能するのは UNPAID/FAILED のときだけで、その場合は指摘どおり couponDiscountAmount=0・totalPrice 上昇・usageCount decrement という損失を伴う。(3)「エラー文言は管理者が触ってもいない項目を指すため原因も伝わらない」は誇張 — 文言は「無効なクーポンコードです」で、prefill 済みのクーポンコード欄がフォーム上に見えている状態で form-level エラー box（ReservationEditForm.tsx:274-279）に出るため、原因の特定自体は可能。ただし非破壊的な修正手段が無い点は指摘のとおり。深刻度は high → medium に補正する: データ損失・セキュリティ・顧客向け画面の破壊ではなく、明示的なエラー付きで失敗する admin 限定の操作阻害であり、爆風半径も「予約編集フォーム」に限定される（ステータス変更・キャンセル・返金・入金記録・削除は validateCoupon を呼ばない別 command 経路。validateCoupon の呼出は admin-commands.ts:117/:377、public-commands.ts:183、pricing-preview.ts:99 の 4 箇所のみ）。一方で誘発条件は例外的でなく（usageLimit=1 のクーポンは発行直後に自動的に該当し、その 1 予約が即座に編集不能になる）、修正価値は十分ある。なお指摘者が挙げていない最有力の根拠は customer-commands.ts:512-531 で、同一 repo 内に既に「消費済みクーポンを now でなく予約期間で判定し、throw せず pricing から落とすだけ」の実装が存在する点。修正時はこの既存実装が参照実装になる。

---

### F-59

**updateAdminReservationCommand に終端ステータスのガードが無く、CANCELLED 予約の編集でクーポンの二重解放・解放されない再 claim が起きる**

<sub>[対処の記録](2026-08-12-codebase-audit-progress.md) ／ [棄却一覧](2026-08-12-codebase-audit-refuted.md)</sub>

|        |                                                        |
| ------ | ------------------------------------------------------ |
| 深刻度 | 中                                                     |
| 箇所   | `src/shared/domain/reservations/admin-commands.ts:586` |
| 領域   | 金額計算・クーポン                                     |

#### 起きること

クーポン X（usageLimit=100、他の顧客の有効予約で usageCount=50）を使った予約を管理者がキャンセルする → lifecycle-commands.ts:142-147 が usageCount を 50→49 に戻す（この予約分の解放は完了）。その後、管理者が同じ予約（status=CANCELLED）の編集画面を開いて保存する。admin-commands.ts:344-352 の終端ステータス gate は `input.status !== currentReservation.status` のときしか発火せず、status.ts:9 `if (from === to) return;` も素通りするため、CANCELLED のまま保存できてしまう。ここでクーポン欄を別コードに変えるか空にすると couponChanged=true になり、585-588 行が X を再度 decrement（49→48）する。X をこの予約が消費した実体は既に返却済みなので、他人の予約 1 件分の使用が帳簿から消え、usageLimit=100 のクーポンが 101 回使えるようになる。逆に空欄だった CANCELLED 予約にコードを入れると 591 行の claimCouponUsage が +1 するが、キャンセル済み予約には解放経路が無い（cancel-core.ts:98 が CANCELLABLE\_STATUSES を要求）ため恒久 leak になり、さらに SUPER\_ADMIN が restoreReservationStatusCommand で復元すると lifecycle-commands.ts:328 が同じ予約に対して 2 度目の claim を行う。

#### 直し方

updateAdminReservationCommand の冒頭で `TERMINAL_STATUS_SET.has(currentReservation.status)` を弾く（内容編集は非終端のみ、復元は restoreReservationStatusCommand 経由という既存の役割分担に合わせる）。少なくとも couponChanged 分岐は非終端ステータスのときだけ実行する。

#### 該当箇所

```
where: { id: oldCouponId, usageCount: { gt: 0 } },
```

#### 到達経路

前提: クーポン X を使った予約が admin にキャンセルされ、paymentStatus は UNPAID のまま残っている（lifecycle-commands.ts:142-147 で usageCount は既に 1 件分解放済み、couponId は行に残存）。
\1. src/app/(admin)/admin/(dashboard)/reservations/\[id\]/page.tsx:102 — 編集リンクは canUpdate（ロールのみ）で表示され status を見ない
\2. src/app/(admin)/admin/(dashboard)/reservations/\[id\]/edit/page.tsx:44 — notFound 以外の guard 無しで ReservationEditForm を描画
\3. src/app/(admin)/admin/(dashboard)/reservations/\_components/ReservationEditForm.tsx:98-109 / :171 / :262 — CANCELLED が選択肢に残り、hidden input で status=CANCELLED が submit される。:194 で prefill されたクーポンコードを admin が空にする
\4. src/app/(admin)/admin/(dashboard)/reservations/\_components/reservation-form-schema.ts:243 — status: z.enum(ReservationStatus)、update 側に CREATABLE refine 無し → 通過
\5. src/app/(admin)/admin/(dashboard)/\_shared/actions/reservation/admin.ts:303-316 — status/couponCode をそのまま domain へ中継（couponCode 空文字は undefined 化）
\6. src/shared/domain/reservations/admin-commands.ts:344-352 — input.status === currentReservation.status === CANCELLED なので条件の第 1 項が false、throw しない
\7. src/shared/domain/reservations/status.ts:9 — validateStatusTransition(CANCELLED, CANCELLED) は from === to で早期 return
\8. src/shared/domain/reservations/admin-commands.ts:377-399 — validateCoupon(undefined) → newCouponId=null、oldCouponId=X → couponChanged=true
\9. src/shared/domain/reservations/admin-commands.ts:429-447 — chargeAffectingChange=true だが paymentStatus=UNPAID なので PENDING/PAID/REFUNDED 系の throw をすべて回避
\10. src/shared/domain/reservations/admin-commands.ts:503-515 — updateMany の WHERE（version 一致 + paymentStatus in \[UNPAID, FAILED\]）が成立し count=1
\11. src/shared/domain/reservations/admin-commands.ts:583-589 — oldCouponId=X で 2 度目の `usageCount: { decrement: 1 }`
→ 誤った結果: X の実使用（他予約 1 件分）が帳簿から消え、usageLimit を 1 回分超えて使えるようになる。
逆方向: 同 :590-595 の claimCouponUsage が CANCELLED 予約に +1 → 解放経路が無い（lifecycle-commands.ts:423-426 により CANCELLED の削除は decrement しない）→ さらに lifecycle-commands.ts:327-334 の restore が同一予約に 2 度目の claim。

#### 既存の検査

\_\_tests\_\_/unit/domain/status-transition-atomic-claim.test.ts と status.ts のテストは遷移表のみを検査し、「終端ステータスの予約に対する内容編集」は対象外。\_\_tests\_\_/integration/reservations/admin-commands.test.ts の update 系 8 ケースは全て active な予約で、クーポン変更も含まない。

#### 反証官による訂正

指摘は概ね正確だが、影響範囲の記述に重要な欠落と細かい不正確さがある。(A) 最大の欠落: paymentStatus による絞り込みに触れていない。クーポン変更は必ず chargeAffectingChange=true になるため admin-commands.ts:431-436（PENDING）と :437-446（PAID / PARTIALLY\_REFUNDED / REFUNDED）で throw され、さらに :510-514 の updateMany WHERE が UNPAID/FAILED を要求する。つまり二重解放が起きるのは「一度も決済されていない（UNPAID）か決済失敗（FAILED）のままキャンセルされた予約」に限られ、シナリオ本文が示唆する「決済済み→返金→キャンセル」の予約は 583 行に到達する前に必ず落ちる。実務上の発生頻度は指摘の書きぶりよりかなり低い。(B) `usageCount: { gt: 0 }` ガードにより下限は 0 で、負値には落ちない（帳簿のズレは発生するが無制限には進行しない）。(C) ensureNoOverlap（:356-361 と tx 内 :490-498）は、キャンセルで空いた枠が再予約されていた場合には保存自体を CONFLICT で止める。これは guard ではなく偶発的な緩和要因だが、常に到達するわけではないという意味で「必ず起きる」ではない。(D) 引用行の細かい点: 586 は WHERE 句であり、実際に減算するのは 587 行。(E) zod についての申告は結果的に正しいが理由の補足が要る — updateReservationFormSchema (reservation-form-schema.ts:243) には create 側 (:186-197) にある CREATABLE 制限の superRefine が無く、CANCELLED を弾いているのは zod ではなく UI の選択肢生成 (ReservationEditForm.tsx:98-109) だけ。しかもその UI は「currentStatus 自体が終端でも表示は維持する」という明示的な設計判断で CANCELLED を残しているため、手製 POST を仮定しなくても通常操作で到達する。(F) 「恒久 leak」の主張は正しい。裏付けは指摘に無いが lifecycle-commands.ts:423-426 の needsCancellationTracking が CANCELLED では false になり、削除経路の decrement (:453-458) が走らないため。深刻度は自己申告どおり medium が妥当 — 対称の欠陥（admin キャンセル時の decrement 欠落）を本リポジトリ自身が high 相当として修正した経緯が lifecycle-commands.ts:88-95 に残っており帳簿の重要性は認識されているが、本件は特権ユーザーが終端予約のクーポン欄を能動的に書き換えるという限定的な操作を要し、金銭損失やデータ破壊には直結しない。

---

### F-60

**admin 予約編集の updateMany に status 述語が無く、cancel 経路は version を進めないためキャンセル済み予約が復活する**

<sub>[対処の記録](2026-08-12-codebase-audit-progress.md) ／ [棄却一覧](2026-08-12-codebase-audit-refuted.md)</sub>

|        |                                                        |
| ------ | ------------------------------------------------------ |
| 深刻度 | 中                                                     |
| 箇所   | `src/shared/domain/reservations/admin-commands.ts:503` |
| 領域   | 並行制御                                               |

#### 起きること

updateAdminReservationCommand は現在 status を tx の外・advisory lock の外で読む（297-324 行の prisma.reservation.findUnique）。遷移可否の判定（354 行 `validateStatusTransition(currentReservation.status, input.status);`）もその読み値に対して行われ、実際の書込 (503-515 行) の WHERE には status 述語が無い。version 述語はあるが、キャンセル経路は version を触らない（設計上の明示的非対象。docs/superpowers/specs/2026-07-18-reservation-optimistic-concurrency-design.md:129-139 が calendar-sync / pending-expiry / cancel-core を列挙）ため、この race を一切検出できない。具体シナリオ: 管理者が予約 R (CONFIRMED, 10:00-12:00) の編集画面で保存を押す。findUnique が CONFIRMED を返した直後〜tx 開始までの間（ensureNoOverlap の DB 往復、getSpaceRatePlans、validateCoupon が挟まるので数十〜数百 ms ある）に、GCal 上でイベントが削除されて cancelReservationFromCalendar (calendar-sync-inbound-mutations.ts:78) が status=CANCELLED・cancelledAt・cancellationReason・googleCalendarEventId=null を書いて commit する（version は据え置き）。管理者側の tx は 485 行で space lock を取り、503 行の updateMany が {id, deletedAt:null, version:N} に一致して成功し、status を CONFIRMED に戻す。cancelledAt / cancelledByType / cancellationReason は data に含まれないのでそのまま残り、「CONFIRMED なのにキャンセル理由が入っている」行になる。顧客には既に自動キャンセルメールが届いており、GCal 側のイベントは削除済み。管理者にはエラーも CONFLICT も出ない。同じ形は mypage 顧客キャンセル (cancel-core) / pending-expiry cron が窓に入った場合にも起きる。

#### 直し方

503 行の updateMany の where に `status: { in: [...CREATABLE_RESERVATION_STATUSES] }`（＝終端 status を除外する述語）を足し、count===0 を既存の CONFLICT 分岐に落とす。tx 外の validateStatusTransition は UX 用の早期 reject として残してよいが、権威は WHERE 述語側に置く。

#### 該当箇所

```
const updateResult = await tx.reservation.updateMany({
where: {
id,
deletedAt: null,
version: input.version,
```

#### 到達経路

src/app/(admin)/admin/(dashboard)/\_shared/actions/reservation/admin.ts:279 updateReservationAction → :303 updateAdminReservationCommand(id, { status: data.status, version: data.version }) → src/shared/domain/reservations/admin-commands.ts:297-318 tx 外・lock 外の findUnique が status=CONFIRMED / version=N を読む → :344-352 CREATABLE\_RESERVATION\_STATUSES gate と :354 validateStatusTransition が stale 値に対して通過 → :356-361 ensureNoOverlap（tx 外）/ :364 getSpaceRatePlans / :377 validateCoupon の DB 往復＝競合窓 → 【並行 tx】src/shared/domain/reservations/reservation-calendar-inbound.ts:163 cancelReservationFromCalendar → src/shared/domain/reservations/calendar-sync-inbound-mutations.ts:69 $transaction → :75 lockSpaceForTransaction → :78-95 updateMany where {status in ACTIVE} data {status=CANCELLED, cancelledAt, cancelledByType=SYSTEM, cancellationReason, googleCalendarEventId=null, notes+=\[Google Calendarで削除\]}（version 据え置き）→ commit、続いて inbound.ts:175 applyCancellationSideEffects が顧客へキャンセル通知 → 【admin tx 再開】src/shared/domain/reservations/admin-commands.ts:482 prisma.$transaction（isolationLevel 未指定＝READ COMMITTED）→ :485 lockSpacesForTransactionInOrder（ここで初めて lock 取得、既に cancel は commit 済み）→ :490-498 ensureNoOverlap は自分自身を除外するので通過 → :503-515 updateMany where {id, deletedAt:null, version:N} — cancel が version を進めていないため一致、status 述語が無いため CANCELLED を弾けない → count=1 → :521 status: input.status で CONFIRMED を書き戻し、:543 notes を上書き（同期メモ消失）、cancelledAt / cancelledByType / cancellationReason は data に無いので残存 → :567 の CONFLICT 分岐に入らない → :628-651 previousStatus=CONFIRMED と stale な currentReservation.googleCalendarEventId（DB 上は既に null）を返し、呼出側の outbound 同期が削除済み GCal イベントを対象にする → 結果: status=CONFIRMED なのに cancelledAt / cancellationReason=「Google Calendar 上でイベントが削除されたため自動キャンセル」が入った行が残り、管理者にはエラーも CONFLICT も出ない。

#### 既存の検査

\_\_tests\_\_/integration/reservations/admin-commands.test.ts:550-700 の "optimistic concurrency (version)" は admin↔admin / admin↔顧客の form 同士 race しか再現しておらず（両者とも version を increment する経路）、version を触らない cancel 経路との race は 1 本も無い。updateMany の WHERE に status 述語が無いことを検査する gate も見当たらない。

#### 反証官による訂正

技術的な機序は全て裏が取れたが、深刻度 high は過大。以下 4 点を訂正・補足する。

\1) 二重予約は起きない（影響範囲の限定）。指摘は明示していないが「復活」という語から占有衝突を連想させる。復活時も admin-commands.ts:490-498 の tx 内 ensureNoOverlap と、prisma/baseline/invariants.sql:648 の partial EXCLUDE 制約（`WHERE deleted_at IS NULL AND status IN (PENDING, CONFIRMED)`）が効くため、窓の間に他客が同枠を取っていれば admin 側が throw / 制約違反で落ちる。実害は「終端メタデータが残ったまま status だけ戻った 1 行の不整合」＋「削除済み GCal イベントに対する outbound 同期の空振り」に閉じ、金銭・認可・可用性への波及は無い。

\2) notes は残らず上書きされる（引用の事実誤り）。指摘は「cancelledAt / cancelledByType / cancellationReason は data に含まれないのでそのまま残る」とだけ書くが、notes は admin-commands.ts:543 の `notes: input.notes || null` で data に含まれる。cancelReservationFromCalendar が calendar-sync-inbound-mutations.ts:63-66,93 で追記した `[Google Calendarで削除] …` の痕跡は admin 保存で消える。矛盾行の検出はむしろ難しくなる方向で、指摘の記述より不利側だが、記述自体は不正確。

\3) 発火条件は指摘が示すより狭い。競合側が commit しなければならないのは admin の findUnique（:297）と updateMany（:503）の間だけで、そこは ensureNoOverlap 1 往復 + getSpaceRatePlans + validateCoupon の数十〜数百 ms。しかも interleaving は 50/50 — admin が先に advisory lock を取った場合は cancel 側が後続し、cancel の `status in ACTIVE` 述語に CONFIRMED が一致して正しくキャンセルされる。GCal 側は cron/webhook 由来の inbound 同期であり、同一予約に対して管理者の保存とミリ秒単位で重なる必要がある。

\4) 「同じ形が顧客 form path でも起きる」とは読まないこと。customer-commands.ts:570-576 の updateMany も status 述語を欠く（where は {id, deletedAt:null, paymentStatus:UNPAID, version}）が、data に status を書かないため、並行キャンセル済み行を CONFIRMED に戻すことはできない（日時・金額だけが書き換わる別種の不整合になる）。status を明示的に書き戻す admin edit path が唯一の「復活」ベクタであり、その点で指摘の scope 指定は正しい。なお設計文書は非 form path を「status / paymentStatus gate が race を吸収済み」と正当化している（design.md:129-130）が、admin form path 側にその status gate が存在しないため、正当化の前提は admin 経路については成立していない — これは指摘の中核として妥当。

---

### F-61

**series instance の GCal update/delete 失敗が 3 つの retry pool すべてから漏れ、恒久的に取り残される**

<sub>[対処の記録](2026-08-12-codebase-audit-progress.md) ／ [棄却一覧](2026-08-12-codebase-audit-refuted.md)</sub>

|        |                                                       |
| ------ | ----------------------------------------------------- |
| 深刻度 | 中                                                    |
| 箇所   | `src/shared/domain/reservations/calendar-sync.ts:134` |
| 領域   | 予約（未読分）                                        |

#### 起きること

繰返し予約（ReservationSeries）が GCal に同期済みで、各 instance は自分の child event id を googleCalendarEventId に持つ。admin が予約詳細画面からその中の 1 回だけをキャンセルする（updateReservationStatus → applyCancellationSideEffects → cancellation/steps.ts:81 deleteCalendarSync）。Google 側が 503/429 を返すと deleteCalendarSync は googleCalendarEventId を保持したまま calendarSyncError に `gcal_delete_failed:...` を書く。この行は seriesId != null なので getFailedCalendarSyncReservations の `seriesId: null` に弾かれ、getFailedCalendarSyncSeriesIds は calendar-sync-series.ts:40 の `googleCalendarEventId: null` を要求するので（eventId が残っているため）弾かれ、getSeriesIdsWithMasterOperationFailure は `gcal_series_master_*` prefix しか拾わないので弾かれる。結果、キャンセル済み予約の GCal イベントが共有カレンダー上に恒久的に残り、スタッフはその枠を埋まっていると誤認し続ける。cron による自動復旧は一切起こらず、calendarSyncError も消えない。ACTIVE 側でも同じで、series instance に対する updateCalendarSync 失敗（reservation-calendar-outbound.ts:254 の平文エラー、typed prefix 無し・eventId 有り）はどの pool にも入らないため、GCal 上の時刻・件名が古いまま二度と再同期されない。

#### 直し方

series-child でも『create だけは危険、update/delete は安全』という切り分けが必要。getFailedCalendarSyncReservations の `seriesId: null` を外し、代わりに『googleCalendarEventId === null かつ seriesId != null のときだけ standalone create をスキップ』という分岐を retryFailedStandaloneCalendarSyncs 側に置く（eventId を持つ series-child は既存 child event への update / delete なので master の RRULE 展開とは衝突しない）。最低限、`gcal_delete_failed:` prefix + seriesId != null の行だけでも delete 再試行に載せる。

#### 該当箇所

```
seriesId: null,
```

#### 到達経路

src/app/(admin)/admin/(dashboard)/reservations/\[id\]/\_components/SeriesInfoSection.tsx:94 (scope="this-only" の CancelForm) → src/app/(admin)/admin/(dashboard)/\_shared/actions/reservation/series.ts:188 (cancelReservationSeriesCommand) → src/shared/domain/reservations/series-commands.ts:551-552 (resolveIdsToCancel が this-only で単一 id を返す) → src/shared/domain/reservations/series-commands.ts:424-436 (this-only 分岐: suppress を渡さず applyCancellationSideEffects を呼ぶ。bulk 側 apply-bulk-side-effects.ts:88-93 の gcalDelete:true が効かない) → src/shared/domain/reservations/cancellation/apply-instance-side-effects.ts:53 → src/shared/domain/reservations/cancellation/steps.ts:69-84 (runGcalStep: guard は suppress と !googleCalendarEventId のみ、seriesId 判定なし) → src/shared/domain/reservations/reservation-calendar-outbound.ts:312 deleteCalendarEvent が GCal 503/429 で失敗 → src/shared/domain/reservations/reservation-calendar-outbound.ts:322-325 (googleCalendarEventId を保持したまま calendarSyncError = `gcal_delete_failed:…`) → 行は seriesId!=null / status=CANCELLED / eventId!=null / error prefix=gcal\_delete\_failed: → src/app/api/cron/calendar-sync-retry/route.ts:79 retryFailedSyncs → reservation-calendar-outbound.ts:375-379 の 3 pool すべてで除外: (a) reservation-calendar-outbound.ts:402 → calendar-sync.ts:134 `seriesId: null` で除外、(b) reservation-calendar-outbound.ts:471 → calendar-sync-series.ts:40 `googleCalendarEventId: null` および :42 status IN (PENDING,CONFIRMED) で二重に除外、(c) series-calendar-outbound.ts:171 → calendar-sync-series.ts:73-80 の typed prefix 前方一致に該当せず除外 → 誤った結果: キャンセル済み instance の GCal child event が共有カレンダーに残り続け、calendarSyncError も消えない (Reservation.calendarSyncError を表示する admin 画面も無いため検知経路が無い)

#### 既存の検査

GCAL-RETRY-04 のコメント（calendar-sync.ts:116-121）は series-child を standalone pool から外す理由を『standalone create が master の RRULE 展開と二重になるため』と説明し、代替として『series 側は retryFailedSeriesCalendarSyncs 経由で fetchEventInstances + write-back のみを再試行する』としているが、その pool は googleCalendarEventId が null の instance しか拾わない。この穴を突く gate/テストは \_\_tests\_\_ に存在しない（calendar-sync 関連テストは cron-calendar-sync / webhooks / sync-token-save / inbound-pricing の 4 本のみ）。

#### 反証官による訂正

欠陥自体は成立するが high は過大。(1) 影響は「1 instance ぶんの GCal event が消え残る」に留まり、データ破損・課金・認可の誤りは無い。DB 側の状態は正しく CANCELLED で、二重予約は EXCLUDE 制約が別途防ぐ。Google Calendar UI から手動削除すれば回復し、後日 series-all キャンセルが走れば master 削除で child ごと消える。(2) 発火には「繰返し予約が GCal 同期済み」「this-only での単発キャンセル（または series instance の時刻編集）」「その瞬間に GCal が 5xx/429」の 3 条件が同時に要る。(3) ただし 3 pool 構成は『どの失敗も取り残さない』ことを目的に設計されており (GCAL-RETRY-04/05/06, GCAL-OUTBOUND-07)、その不変条件が破れている点と、Reservation.calendarSyncError を出す admin 画面が無く検知手段が無い点で low には落とせない。

指摘本文の事実誤認 2 点:
(A) 既存カバレッジの申告が誤り。「calendar-sync 関連テストは cron-calendar-sync / webhooks / sync-token-save / inbound-pricing の 4 本のみ」は不正確で、実際は unit 5 本 (event-outbound / loop-prevention / retry-failed-syncs / series-outbound-retry / sync-token-save) + integration 2 本 (meet-writeback / series-outbound)。特に \_\_tests\_\_/unit/lib/calendar-sync/retry-failed-syncs.test.ts は GCAL-RETRY-04 の series/standalone 分離と GCAL-AUDIT-05 の create/update/delete 振り分けを専用 describe で扱っている。ただし結論は変わらない — 同 test は getFailedCalendarSyncReservations / getFailedCalendarSyncSeriesIds を mock 置換して where 句を一度も実行しないため、除外条件そのものは未検証のまま。
(B) 到達経路の列挙が広すぎる。delete 失敗について bulk.ts / mutations.ts を並列に挙げているが、series の bulk 経路 (this-and-following / series-all) は apply-bulk-side-effects.ts:88-93 で per-instance の gcalDelete を suppress し、master 操作の失敗は typed prefix で pool 3 に載る。したがって delete 側の穴を開けるのは実質 this-only scope (series-commands.ts:424-436) だけ。mutations.ts 側は CANCELLED 遷移時の applyCancellationSideEffects (mutations.ts:161-183) と CONFIRMED→PENDING 格下げ時の deleteCalendarSync (mutations.ts:208-215) がいずれも seriesId 無 gate なので第 2 の入口として成立するが、指摘が示唆する bulk.ts 経由の delete は成立しない。ACTIVE 側の update 失敗については指摘どおり (updateCalendarSync 呼出はどれも seriesId を見ない)。

---

### F-62

**paymentStatus=FAILED の予約は編集画面が開けるのに保存が必ず失敗し、誤ったエラー文言で永久に変更できない**

<sub>[対処の記録](2026-08-12-codebase-audit-progress.md) ／ [棄却一覧](2026-08-12-codebase-audit-refuted.md)</sub>

|        |                                                           |
| ------ | --------------------------------------------------------- |
| 深刻度 | 中                                                        |
| 箇所   | `src/shared/domain/reservations/customer-commands.ts:574` |
| 領域   | 予約                                                      |

#### 起きること

顧客が Stripe Checkout を開始して離脱し、checkout.session.expired webhook で paymentStatus=FAILED になった CONFIRMED 予約（status は CANCELLED にならない）に対し、マイページ /mypage/reservations/\[id\]/edit またはゲスト /reservation/status/edit から日時を変更して保存する。ページ側の gate である isReservationEditableForCustomerSelfServe は FAILED を編集可と判定するのでフォームは正常に表示・送信できるが、tx 最終の updateMany は WHERE に paymentStatus=UNPAID を要求するため count=0 になり、「予約情報が別のデバイスまたはタブで変更されました。ページを再読み込みしてから、もう一度お試しください。」を返す。再読み込みしても FAILED のままなので何度やっても同じで、顧客は予約を変更できず、原因も判別できない（実際には同時更新は起きていない）。

#### 直し方

updateMany の WHERE を eligibility の SSoT に合わせて `paymentStatus: { in: [PaymentStatus.UNPAID, PaymentStatus.FAILED] }` にする（PENDING/PAID を弾く TOCTOU 防御という本来の目的は保たれる）。許可集合は edit-eligibility.ts 側に定数として切り出して両方から参照し、以後の drift を型で塞ぐ。仕様として FAILED を編集不可にしたいなら逆に edit-eligibility.ts:35-40 を UNPAID 限定に直し、ページ側で「決済失敗のため変更不可」を出す。どちらにせよ現状の「開けるが保存できない」は残さない。

#### 該当箇所

```
const updated = await tx.reservation.updateMany({
where: {
id: reservationId,
deletedAt: null,
paymentStatus: PaymentStatus.UNPAID,
version: updateInput.version,
},
```

#### 到達経路

src/app/(public)/mypage/reservations/\[id\]/edit/page.tsx:63-78（FAILED を編集可と判定しフォーム描画。ゲストは src/app/(public)/reservation/status/edit/page.tsx:91-106）→ src/shared/domain/reservations/edit-eligibility.ts:35-40（UNPAID と FAILED を許可）→ src/app/(public)/mypage/\_shared/actions/reservation.ts:263（updateCustomerReservation 呼出。ゲストは src/app/(public)/reservation/status/edit/\_actions/update.ts:204）→ src/shared/domain/reservations/customer-commands.ts:256 → 289 updateReservationCommand → 同 428 の tx 内 validateReservationEditableForUpdate も FAILED を通過 → 同 570-576 updateMany の WHERE が paymentStatus: UNPAID のため 0 行一致 → 同 608-618 で「予約情報が別のデバイスまたはタブで変更されました。…」を返す（同時更新は起きていないのに競合文言）。FAILED 状態の生成元は src/shared/domain/payment/stripe-webhook/checkout-session-failed.ts:56-75 → src/shared/domain/reservations/payment-queries.ts:215-231（status 不変）。

#### 既存の検査

none。\_\_tests\_\_/unit/domain/reservations/edit-eligibility.test.ts:49 が「FAILED は UNPAID と同様に編集可」を明示的に固定しているが、書込側 updateMany を FAILED で通す統合テストは無い（\_\_tests\_\_/integration/reservations/customer-commands.test.ts と \_\_tests\_\_/integration/actions/public/guest-reservation-edit.test.ts に FAILED ケースは存在しない）。DB 制約も無関係。

#### 反証官による訂正

3 点訂正。(1) カバレッジ申告「none」は不正確: \_\_tests\_\_/unit/domain/reservations/customer-commands.test.ts:272-279 が updateMany の WHERE に `paymentStatus: "UNPAID"` を含むことを明示 assert している（FAILED を許す修正時はこの assertion も更新が必要。「書込側を FAILED で通す統合テストが無い」という部分は正しい）。(2) 「必ず FAILED で残る」は言い過ぎ: Stripe session の expires\_at は PENDING\_RESERVATION\_EXPIRY\_MINUTES(60分) に揃えられており (payment-commands.ts:272-281)、fail-safe cron が先に claim すると status=CANCELLED になり編集ページ側が status 理由で弾く。webhook が先着した場合、および konbini 等の checkout.session.async\_payment\_failed が 60 分前に届いた場合に「FAILED × active status」が焼き付く。(3) 「永久に変更できない」は self-serve 編集についてのみ正しく、完全ロックではない: キャンセルは cancel-core.ts:108-133 が PENDING のみ拒否するため FAILED でも成功し（キャンセル→再予約の回避策あり）、admin 側編集は admin-commands.ts:508-514 が FAILED を claim 対象に含むため通る。データ破損・金銭影響・権限逸脱は無く、影響は「該当予約の顧客セルフ変更が誤文言で不能」に限定されるため high ではなく medium が妥当。

---

### F-63

**テンプレート必須セクションを複製できてしまい、複製後は削除も非表示もできず公開ページに二重表示が固定される**

<sub>[対処の記録](2026-08-12-codebase-audit-progress.md) ／ [棄却一覧](2026-08-12-codebase-audit-refuted.md)</sub>

|        |                                              |
| ------ | -------------------------------------------- |
| 深刻度 | 中                                           |
| 箇所   | `src/shared/domain/sections/commands.ts:218` |
| 領域   | CMS                                          |

#### 起きること

管理者が /admin/pages/contact/edit でセクション一覧の kebab メニューから contact-form の「複製」を押す。duplicatePageSectionCommand は page-hero だけを弾き、isRequiredSectionForTemplate を見ないので複製が成功し、Section 行が 2 本になる。公開 /contact には問い合わせフォーム（Turnstile ウィジェット込み）が 2 つ並ぶ。復旧しようと片方を消そうとしても deletePageSectionCommand:189 の `isRequiredSectionForTemplate(existing.pageTemplate, existing.type)` が型で判定するため両方 CONFLICT、togglePageSectionActiveCommand:291 も同じ理由で両方 CONFLICT。UI 側も SectionListSidebar.tsx:251 が `canDuplicate={!isPageHero}` で複製だけ許し、削除/表示切替は isRequired で無効化しているため、管理画面からは一切戻せない（DB 直接操作でしか消せない）。同じことが /faq(faq-list)・/reservation(reservation-form)・/spaces(space-list)・/access(location-list)・/news(news-list)・/blog(post-list)・/events(event-calendar)・/terms(terms-list) で起きる。

#### 直し方

duplicatePageSectionCommand に deletePageSectionCommand と同じ `isRequiredSectionForTemplate(pageTemplate, source.type)` ガードを足し（source の select に `page: { select: { slug: true, template: true } }` を追加）、必須型は CONFLICT で拒否する。UI 側も SectionListSidebar.tsx:251 を `canDuplicate={!isPageHero && !isRequired}` に揃える。既に必須型が複数存在する DB があるなら、削除ガードを「型が必須 かつ 同型が 1 本しか無い」場合に限定する形へ直すのが本筋。

#### 該当箇所

```
if (source.type === "page-hero") {
throw new DomainError("ヒーローは複製できません", "CONFLICT");
}
```

#### 到達経路

src/app/(admin)/admin/(dashboard)/pages/\[slug\]/edit/\_components/SectionListSidebar.tsx:251 `canDuplicate={!isPageHero}`（必須セクションでも複製メニューが有効）→ 同 249 onDuplicate → 同 151-161 handleDuplicate → src/app/(admin)/admin/(dashboard)/\_shared/actions/page-section.ts:148 duplicatePageSection（uuid 検査と認可のみ）→ 同 160 → src/shared/domain/sections/commands.ts:200 duplicatePageSectionCommand → 同 218 の分岐が page-hero でないため素通り → 同 240-249 prisma.section.create（type=contact-form, isActive=true, order=source.order+1）→ 公開側 src/app/(public)/contact/page.tsx:29 getPageSectionsWithFallback → src/app/(public)/\_shared/components/sections/section-stack.tsx:39 が 2 行とも描画。復旧経路の遮断: src/shared/domain/sections/commands.ts:189（delete）と :291（toggle）が型で判定するため両方 CONFLICT、src/shared/domain/pages/commands.ts:169/187 で /contact 等の system page 削除も不可。

#### 既存の検査

none。\_\_tests\_\_/unit/domain/sections/crud-commands.test.ts の duplicatePageSectionCommand ブロック（396-470行）は「NOT\_FOUND / page-hero は複製不可 / 二段シフト」の 3 本のみで、必須セクションの複製を検証していない。\_\_tests\_\_/unit/architecture/display-order-surfaces-clean-break.test.ts も削除/reorder の文言しか見ていない。

#### 反証官による訂正

2 点訂正・補足がある。(1) 入口は複製だけではない。同じ回復不能状態は通常の「セクション追加」でも作れる: PageEditor.tsx:81-88 の availableTypes フィルタは既存重複を page-hero だけ（同 84 行 `if (type === "page-hero" && hasPageHero) return false;`）しか除外せず、createPageSectionCommand（commands.ts:104-177）も allowedSectionTypes と page-hero 単一性しか見ない。contact-form は contact テンプレートの allowedSectionTypes に含まれる（page-templates.ts:100）ため、追加ダイアログから 2 本目を足せて、その後は同じく削除も非表示もできない。したがって根本原因は「duplicate に required チェックが無い」ことではなく、**required/singleton の不変条件が create・duplicate 側に無く、delete/toggle 側だけが型スコープ（「最後の 1 本か」ではなく「その型か」）で判定していること**。修正を duplicate だけに入れると追加経路が残る。(2) 深刻度は high ではなく medium が妥当。認証済み管理者の意図的な操作（kebab メニューの「複製」クリック）が必要で、データ損失・権限昇格・クラッシュは無く、影響は公開ページの二重表示という表示・運用面に限られる。ただし system page では管理画面からの復旧手段が実在せず DB 直操作が要る点は指摘のとおりで、low ではない。なお指摘が列挙したテンプレート対応（faq/faq-list, reservation/reservation-form, spaces/space-list, access/location-list, news/news-list, blog/post-list, events/event-calendar, terms/terms-list）は page-templates.ts:94-161 および SLUG\_TO\_TEMPLATE:222-234 と一致しており誤りは無い。

---

### F-64

**公開ページの全セクションを非表示にすると、コード同梱の初期デモセクションが公開面に復帰する**

<sub>[対処の記録](2026-08-12-codebase-audit-progress.md) ／ [棄却一覧](2026-08-12-codebase-audit-refuted.md)</sub>

|        |                                             |
| ------ | ------------------------------------------- |
| 深刻度 | 中                                          |
| 箇所   | `src/shared/domain/sections/queries.ts:131` |
| 領域   | CMS                                         |

#### 起きること

管理者が /admin/pages/about/edit で hero / custom / cta の 3 セクションすべての表示スイッチを OFF にする（about のテンプレートは content で requiredSectionTypes が無く、page-hero も無いので 3 本とも OFF にできる）。getPageSections は `where: { pageId, isActive: true }` なので空配列を返し、この分岐が「ページ未カスタマイズ」と誤認して DEFAULT\_PAGE\_SECTIONS\['about'\] を返す。結果、公開 /about には管理者が消したはずのデモ文言（会社概要 hero + デモ本文 + CTA）がそのまま表示され続ける。管理者は「非表示にしたのに公開ページに出ている」状態を編集画面から説明できず、最低 1 本を表示に戻す以外に空ページにする手段が無い。

#### 直し方

フォールバックの条件を「Page 行が存在しない」に限定する（`const page = await getPublicPage(slug); if (!page) return getDefaultSections(slug); return getPageSections(page.id);`）。Page 行が存在するなら 0 件は 0 件として返し、公開ページは空セクションで描く。

#### 該当箇所

```
const page = await getPublicPage(slug);
if (page) {
const sections = await getPageSections(page.id);
if (sections.length > 0) return sections;
}

return getDefaultSections(slug);
```

#### 到達経路

src/app/(admin)/admin/(dashboard)/pages/\[slug\]/edit/\_components/SectionListSidebar.tsx:235（canToggleActive=true。about は content template で requiredSectionTypes 未定義） → src/app/(admin)/admin/(dashboard)/\_shared/actions/page-section.ts:178 togglePageSectionActive → src/shared/domain/sections/commands.ts:287-297（page-hero でも必須型でもないため両ガードを素通り）→ commands.ts:299 isActive=false を 3 本に適用 → page-section.ts:200 revalidatePages("about") → src/app/(public)/about/page.tsx:27 requireSystemPagePublished は isPublished=true なので通過 → about/page.tsx:28 getPageSectionsWithFallback("about") → src/shared/domain/sections/queries.ts:131 getPublicPage は行を返す（PUBLIC\_WHERE は isPublished/isActive のみ、pages/queries.ts:19-22）→ queries.ts:133 getPageSections → queries.ts:104-108 where {pageId, isActive:true} で 0 件 → queries.ts:134 の length\>0 が偽で分岐を抜ける → queries.ts:137 getDefaultSections("about") → queries.ts:30-42 → src/shared/lib/constants/default-page-sections.ts:343-390 のデモ hero/custom/cta が公開 /about に描画される

#### 既存の検査

none。\_\_tests\_\_ 配下に getPageSectionsWithFallback / getDefaultSections を参照するテストは 0 件（grep 済み）。require-published-server.ts:10-12 の JSDoc は「行がまだ存在しない場合」だけをフォールバック対象と書いており、行が存在して全 section が非表示のケースは意図外。

#### 反証官による訂正

3 点訂正・補足する。(1) 影響範囲は指摘が書いていないが実質 /about 1 ページに限定される。getPageSectionsWithFallback を使う他 10 ルートは template が requiredSectionTypes を宣言済み（page-templates.ts:78-165: home=page-hero, faq=faq-list, contact=contact-form, access=location-list, spaces=space-list, news=news-list, blog=post-list, events=event-calendar, terms=terms-list, reservation=reservation-form）で、commands.ts:291 と SectionListSidebar.tsx:235 がその 1 本の非表示化を拒むため「全 section 非表示」に到達できない。さらに page.template は resolveTemplateForSlug 由来で管理画面から編集不可（pages/commands.ts:81,134）なので、この抜け道を他 slug へ広げることもできない。公開の動的 \[slug\] ページも存在しない。この単一ページ・可逆・セキュリティ/データ損失なしという性質から high ではなく medium が妥当。(2)「最低 1 本を表示に戻す以外に手段が無い」は不正確。管理者にはページ単位の「非公開にする」トグルがあり、isPublished=false にすれば requireSystemPagePublished(require-published-server.ts:22)経由で /about は 404 になる。空の公開ページは作れないが、デモ文言を公開面から消す手段自体は存在する。(3) 同じ結果は削除経路（commands.ts:180-197、about は必須型でないため 3 本とも削除可）でも起きるが、そちらは instrumentation の bootstrapSystemPagesCommand が type 基準で欠損 section を再作成する（system-pages-commands.ts:26-45）ため次回起動で復元される。isActive=false の行は type が存在するので再作成対象にならず、トグル経路だけが恒久的に残る＝指摘が挙げたトグル経路の選択は正しい。引用・行番号（queries.ts:131 / about/page.tsx:28 / commands.ts:267 / default-page-sections.ts:343）はいずれも実際と一致。

---

### F-65

**feature toggle が公開 Cloud Run サービスに最大24時間届かない（Data Cache はサービス跨ぎで無効化されない）**

<sub>[対処の記録](2026-08-12-codebase-audit-progress.md) ／ [棄却一覧](2026-08-12-codebase-audit-refuted.md)</sub>

|        |                                                     |
| ------ | --------------------------------------------------- |
| 深刻度 | 中 ／ 実コード確認済                                |
| 箇所   | `src/shared/domain/settings/queries/features.ts:21` |
| 領域   | feature フラグ                                      |

#### 起きること

全 feature 判定（requireFeatureEnabled / isFeatureEnabled / getFeatureFilterContext）は getFeatureModulesSettings() を通り、これは 'use cache' + cacheLife(CACHE\_LIFE.STATIC\_SETTINGS) である。STATIC\_SETTINGS は cache.ts:37 で `STATIC_SETTINGS: "days",`、Next 16.3.0 の days プロファイルは node\_modules/next/dist/server/config-shared.js:169-173 で `revalidate: 60*60*24`（24時間）。無効化は admin 側 Server Action の invalidateSiteWideCache(\[CACHE\_TAGS.FEATURE\_MODULES, ...\])（other.ts:307-319）だけで、updateTag はデフォルトキャッシュハンドラ＝プロセス内メモリにしか効かない（next.config.ts に cacheHandler / NEXT\_DEFAULT\_CACHE\_HANDLER\_PATH の配線は無し）。admin と public は別 Cloud Run サービス（terraform/cloud\_run\_admin.tf と terraform/cloud\_run\_public.tf、public は name = "myrrh-rental-space"）なので、admin コンテナの updateTag は public コンテナに一切届かない。具体例: Stripe の設定ミスで二重課金が起きたため運用者が /admin/settings/features で payment を OFF にする → 保存は成功、Cloudflare は feature-modules-v1 が SITE\_WIDE\_CDN\_TAGS（cdn-cache-tags.ts:100）なので全公開ページを purge → しかし public サービスの origin が再レンダリングするとき自分の Data Cache に残った古い featureModules map を読むため、requireFeatureEnabled("payment") も assertOnlinePaymentAvailable() も「ON」のまま。checkout セッションが最大24時間作られ続ける。reservation を緊急停止する場合も同じで、公開予約フォームと createPublicReservationCommand の fail-closed ガード（public-commands.ts:97）が両方すり抜ける。public は min\_instance\_count = 0 なので無トラフィック時にコンテナが落ちれば偶然直るが、トラフィックがあるほど直らない。

#### 直し方

getFeatureModulesSettings の cacheLife を短命プロファイル（minutes 相当）に落とすか、feature 判定だけ 'use cache' の外に出す。恒久策としては共有キャッシュハンドラ（NEXT\_DEFAULT\_CACHE\_HANDLER\_PATH に Redis/GCS 実装）を両サービスに配線するか、admin→public の内部 revalidate エンドポイントを1本用意する。どれを取るにせよ「admin の保存が public に届く経路」を1つ決めて、その反映上限を docstring に書くこと（現状はどこにも書かれていない）。

#### 該当箇所

```
cacheLife(CACHE_LIFE.STATIC_SETTINGS);
```

#### 到達経路

admin service: src/app/(admin)/admin/(dashboard)/settings/features/page.tsx → src/app/(admin)/admin/(dashboard)/\_shared/actions/settings/other.ts:291 updateFeatureModulesSettings → other.ts:306-319 invalidateSiteWideCache(\[CACHE\_TAGS.FEATURE\_MODULES, ...\]) → src/shared/lib/cache/site-wide.ts:71 updateTag(tag) → node\_modules/next/dist/server/lib/cache-handlers/default.js updateTags()（admin プロセス内 tagsManifest のみ。共有ハンドラ未配線: next.config.ts に cacheHandler 無し／node\_modules/next/dist/server/config-shared.js:183-187 の NEXT\_DEFAULT\_CACHE\_HANDLER\_PATH を terraform/locals\_cloud\_run.tf が設定しない）+ site-wide.ts:78 queueTagPurge(feature-modules-v1)（Cloudflare のみ）。||| public service (terraform/cloud\_run\_public.tf:39 name="myrrh-rental-space", APP\_SURFACE=public @ terraform/locals\_cloud\_run.tf:41-45): CDN purge 後の origin 再レンダー → 公開予約 Server Action → src/shared/domain/reservations/public-commands.ts:97 isFeatureEnabled("reservation") → src/shared/domain/features/check.ts:59 → check.ts:29 getFeatureModulesSettings() → src/shared/domain/settings/queries/features.ts:19-22（"use cache" + cacheLife("days") + cacheTag(FEATURE\_MODULES)）→ node\_modules/next/dist/server/lib/cache-handlers/default.js:76-79（timestamp + entry.revalidate\*1000 まで hit。revalidate=86400 @ config-shared.js:168-172）かつ default.js:81-88 の areTagsExpired/areTagsStale は public プロセス内 tagsManifest を見るため admin の updateTag を観測しない → トグル前の featureModules map を返す → check.ts:33 stored\["reservation"\]===true → public-commands.ts:97 のガードを素通り → 運営者が OFF にした後も予約が受理される。同経路の決済版: src/app/(public)/mypage/\_shared/actions/reservation.ts:103 → src/shared/domain/payment/availability.ts:89 isFeatureEnabled("payment") → 同じ stale エントリ → availability.ts:96 loadStripeCredentials() へ進み checkout session が作られ続ける。

#### 既存の検査

\_\_tests\_\_/unit/domain/settings/features-query.test.ts は parse と DB エラー時の throw のみを検証。\_\_tests\_\_/unit/domain/features/check.ts のテストは解決ロジックのみ。e2e/public/feature-module-off-gate.spec.ts は単一プロセス（bun run e2e は 1 サーバー）で走るため、この境界を踏まない。\_\_tests\_\_/unit/architecture/ に cache handler / サービス跨ぎ無効化を見る gate は無い。皮肉なことに e2e-feature-module-ownership.test.ts:29-32 の JSDoc は「feature 解決は 'use cache' の内側で走る」と正しく認識しているが、その帰結（別サービスからの updateTag が効かない）は扱っていない。

#### 反証官による訂正

機構は正しいが、記述に 5 点の不正確さ・誇張がある。(1) **場所の帰属が誤り**: これは features.ts:21 の欠陥ではなく、'use cache' プロデューサ全体の性質。STATIC\_SETTINGS を使う producer は site.ts / organization.ts / display.ts / navigation/queries.ts / tax.ts / discount.ts / sidebar.ts / notification.ts / integration.ts / announcement-bar.ts / api-key-queries.ts / public-queries.ts / data/turnstile.ts など 20 箇所以上あり、PUBLIC\_CONTENT（hours）系も同じく admin の updateTag が public プロセスに届かない。FEATURE\_MODULES が他と違うのは「kill switch であり stale の向きが fail-open」という一点だけで、単一行の bug ではなく「2 サービス構成に共有 cache handler が無い」というアーキテクチャ全体の性質。(2) **24h の根拠がずれている**: 上限が 24h なのは days の expire（7 日、config-shared.js:172）ではなく、本番の既定ハンドラが entry.revalidate を過ぎたエントリを missing 扱いで捨てるため（default.js:76-79。stale-while-revalidate 保持は \_\_NEXT\_DEV\_SERVER 限定）。数値は結果的に正しいが、指摘文が挙げた revalidate=86400 だけでは「なぜ expire の 7 日ではないか」を説明できていない。(3) **実運用の窓の見積もりが片側だけ**: public は min\_instance\_count=0 に加えて **max\_instance\_count=1**（cloud\_run\_public.tf:48-51）なので stale なのは常に 1 プロセス分のみで、deploy 毎の新 revision と idle scale-to-zero でリセットされる。24h は理論上限であって「トラフィックがあるほど直らない」は誇張気味（Cloud Run の idle instance 回収がある）。(4) 引用したテストのパスが誤り: `__tests__/unit/domain/features/check.ts` は存在せず、実体は `__tests__/unit/domain/features/check.test.ts`。他の引用（other.ts の invalidateSiteWideCache、public-commands.ts:97、cdn-cache-tags.ts:100 の SITE\_WIDE\_CDN\_TAGS、e2e-feature-module-ownership.test.ts の 'use cache' に関する JSDoc、e2e/public/feature-module-off-gate.spec.ts の存在）はいずれも実在を確認済み。(5) 「repo が全く認識していない」わけではない: src/shared/lib/constants/cdn-cache-tags.ts:5 が CACHE\_TAGS を明示的に "origin in-process cache" と定義しており、2 系統のタグを分離する設計自体は意図的。未処理なのは「admin プロセスの updateTag が public プロセスに届かない」という一点。深刻度は high ではなく medium 相当 — 発火には運営者が feature を OFF にするという稀な操作が必要で、データ破損や認可バイパスは無く、影響は「緊急停止の反映が最悪 24h（実際はインスタンス寿命分）遅れる」に限られる。ただし fail-open 方向であることと、修正には共有 cache handler の導入という非自明な設計変更が要る点で、無視してよい指摘ではない。

---

### F-66

**サイドバーの「最近の投稿／人気記事」が予約公開（未来日時）記事を公開面に露出させる**

<sub>[対処の記録](2026-08-12-codebase-audit-progress.md) ／ [棄却一覧](2026-08-12-codebase-audit-refuted.md)</sub>

|        |                                           |
| ------ | ----------------------------------------- |
| 深刻度 | 中                                        |
| 箇所   | `src/shared/domain/sidebar/queries.ts:72` |
| 領域   | コンテンツ                                |

#### 起きること

管理者が 2026-09-01 10:00 公開予定の記事を status=PUBLISHED + 未来 publishedAt で保存する（この運用は blog-scheduled-publish cron の docstring が「管理画面の「公開日時」欄は未来日時を入力可能（上限バリデーションなし）で、status: PUBLISHED のまま保存できる」と明記している正規の予約公開手順）。/blog 一覧・/blog/\[slug\]・feed.xml・sitemap は publicPostsWhere() の publishedAt\<=now で正しく伏せる。しかし BlogLayout のサイドバーはこの where を使わないため、recent ウィジェットが orderBy:{publishedAt:'desc'} で当該記事を**先頭**に表示する。結果、公開日の何日も前から全ブログ系公開ページにタイトル・サムネイル・カテゴリが出て、クリックすると getPublishedPost が null を返して 404 になる。categories ウィジェットの postCount と tags ウィジェットも同じ where を使うため、未公開記事しか持たないタグがサイドバーに現れ、その /tag/\[slug\] は 0 件ページになる。

#### 直し方

publishedWhere を publicPostsWhere()（@/shared/domain/posts/queries）に置き換える。posts/queries.ts の docstring が「新規 query 追加時の publish gate 漏れを構造的に防ぐため、公開 query は必ずこの helper 経由で where を組み立てる」と宣言している契約に sidebar だけが従っていない状態。

#### 該当箇所

```
const publishedWhere = {
status: PostStatus.PUBLISHED,
deletedAt: null,
} satisfies Prisma.PostWhereInput;
```

#### 到達経路

前提（欠陥を有効化する状態）: 管理画面で status=PUBLISHED・publishedAt=未来 を保存 → src/app/(admin)/admin/(dashboard)/\_shared/lib/validations/post.ts:52-56（上限なし）→ src/shared/domain/posts/post-commands.ts:59-68 `resolvePostPublishedAt` が未来日時をそのまま採用 → src/app/(admin)/admin/(dashboard)/\_shared/actions/post/mutations.ts:114 で DB 保存。

露出経路: /blog アーカイブ → src/app/(public)/\_components/PostListSection.tsx:76 `<BlogLayout>` → src/app/(public)/\_shared/components/layouts/blog-layout.tsx:22-36（guard 3 つとも既定で通過）→ blog-layout.tsx:38 `getSidebarData(settings.widgets, ...)` → src/shared/domain/sidebar/queries.ts:67 `needRecent=true` → queries.ts:72-75 `publishedWhere`（`publishedAt: { lte: now }` が欠落）→ queries.ts:90-95 `prisma.post.findMany({ where: publishedWhere, orderBy: { publishedAt: "desc" }, take: recentCount })` が未来記事を返し、desc 順のため先頭に来る → src/app/(public)/\_shared/components/layouts/blog-sidebar.tsx:27 `posts={data.recentPosts}` → src/app/(public)/\_shared/components/sidebar/sidebar-post-list.tsx:31-50 で `<Link>` + thumbnail + category + `<time>` を描画（誤った結果 = 未公開記事のメタ情報が公開面に出る）。

リンク先での不整合: 上記 Link → src/app/(public)/blog/\[slug\]/page.tsx:33-34 `getPublishedPost(slug)` → src/shared/domain/posts/queries.ts:191 `...publicPostsWhere()` → queries.ts:42 `publishedAt: { lte: now }` に不一致で null → page.tsx:34 `notFound()` で 404（サイドバーに出ているのに開けない）。

同一 where の他 2 経路: (a) src/shared/domain/sidebar/queries.ts:129 `_count.posts: { where: publishedWhere }` → sidebar-categories.tsx:28 が未来記事を含む postCount を表示（同ページの /category/\[slug\] は publicPostsWhere で数が合わない）。(b) queries.ts:146 `postTag.findMany({ where: { posts: { some: { post: publishedWhere } } } })` → 未公開記事しか持たないタグが sidebar-tags に出現し、その /tag/\[slug\] は 0 件。

対比（正しい側）: src/shared/domain/link-cards/resolve-queries.ts:62, search-queries.ts:51, sitemap/queries.ts:132,146,151 はすべて `publicPostsWhere()` 経由。sidebar/queries.ts だけが SSoT helper を迂回している。

#### 既存の検査

未捕捉。src/ 全体で `publishedAt <= now` gate を持たずに PostStatus.PUBLISHED を where に書いているのは sidebar/queries.ts:73 だけで（他の公開経路 link-cards/resolve-queries.ts:62, link-cards/search-queries.ts:51, sitemap/queries.ts:132,146,151 はすべて publicPostsWhere() 経由）、この 1 箇所だけが SSoT helper を迂回している。\_\_tests\_\_/unit/domain/sidebar/queries.test.ts は prisma を mock し orderBy と take のみ assert（`expect.objectContaining({ orderBy: { publishedAt: "desc" }, take: 7 })`）で where を一切検査していない。\_\_tests\_\_/unit/architecture/ に公開 query の publish gate を列挙する gate は存在しない（sidebar-db-invariants.test.ts は sidebarWidgets の JSON 形だけを見る）。

#### 反証官による訂正

結論（欠陥の実在・到達経路・未カバレッジ）は正しいが、記述に 3 点の不正確さがある。

\1. 深刻度は high ではなく medium。露出するのは title / thumbnailUrl / category 名 / publishedAt のメタ情報とリンクだけで、本文（contentHtml）・下書き・非公開データは漏れない。詳細ページは publicPostsWhere で正しく 404 になり、feed.xml / sitemap / /blog 一覧も汚染されない。認可バイパスでもデータ破壊でもなく、影響は「予約公開のエンバーゴが記事タイトル単位で破れる」ことと「404 になる導線がサイドバーに出る」ことに限定される。予約公開が terraform の Cloud Scheduler + 専用 cron を伴う一級機能である点を踏まえても、metadata-only の早期露出は medium が妥当。

\2. 「src/ 全体で publishedAt \<= now gate を持たずに PostStatus.PUBLISHED を where に書いているのは sidebar/queries.ts:73 だけ」は不正確。src/shared/domain/posts/analytics-commands.ts:10 も `where: { id, status: PostStatus.PUBLISHED }` で publishedAt gate を持たない。ただしこれは閲覧数インクリメントの command で公開面にコンテンツを出す read ではないため、結論（公開 read 経路で helper を迂回しているのは sidebar だけ）は変わらない。

\3. categories ウィジェットについての含意が実際よりやや強い。`prisma.postCategory.findMany` はカテゴリ自体に where を掛けていない（queries.ts:122-134）ため、公開記事 0 件のカテゴリは元から一覧に出る仕様であり、「未公開記事しかないカテゴリが新たに現れる」わけではない。実害は `_count.posts` が未来記事を含んで水増しされる点のみ（sidebar-categories.tsx:28 の表示数と、リンク先 /category/\[slug\] の実件数が食い違う）。一方 tags ウィジェットは `where: { posts: { some: { post: publishedWhere } } }`（queries.ts:146）でタグ自体を絞っているため、「未公開記事しか持たないタグが出現する」という指摘はこちらについては正しい。

なお popular ウィジェットは `orderBy: [{ viewCount: "desc" }, { publishedAt: "desc" }]`（queries.ts:109）のため、viewCount 0 の新規予約記事が「先頭に出る」ことは通常なく、take の枠に入るかも既存記事の閲覧数次第。「先頭に表示」が確実に成立するのは recent ウィジェットのみ。

---

### F-67

**issuePasscodesAfterSpaceBound の `none: {}` が失効済み行も数え、解除→再割当した予約にパスコードが二度と発行されない**

<sub>[対処の記録](2026-08-12-codebase-audit-progress.md) ／ [棄却一覧](2026-08-12-codebase-audit-refuted.md)</sub>

|        |                                                               |
| ------ | ------------------------------------------------------------- |
| 深刻度 | 中                                                            |
| 箇所   | `src/shared/domain/smart-lock/assignment-side-effects.ts:129` |
| 領域   | action・決済の残り                                            |

#### 起きること

上の直接付け替えを避け、管理者が UI 上の正規手順どおり 2 段階で操作した場合でも同じ結末になる。スペース S に Pad A、将来 CONFIRMED 予約 R は A のパスコードを保持。(1) 管理者が「なし」を選んで保存 → revokePasscodesAfterSpaceUnbound が走り、revoke-passcode.ts:84-90 の updateMany で R のパスコードは status=REVOKED に更新される (行は削除されない。SmartLockPasscodeStatus に REVOKED が存在し、schema.prisma:2869 のとおり失効確定を表す状態として残す設計)。(2) 続けて Pad B を選んで保存 → issuePasscodesAfterSpaceBound の where 句は smartLockPasscodes: { none: {} } で「関連行が 1 件も無い予約」しか拾わないため、REVOKED 行が残っている R は除外される。R には B 用のパスコードが発行されず、予約者は当日ドアを開けられない。findFutureConfirmedReservationIdsForSpace (line 58-67) が status を PENDING/CONFIRMED に絞っているのと非対称で、issue 側だけが状態を見ていない。

#### 直し方

「パスコード行が 1 件も無い」ではなく「生きたパスコードが無い」で絞る。同ファイルの findFutureConfirmedReservationIdsForSpace と揃えて smartLockPasscodes: { none: { status: { in: \[SmartLockPasscodeStatus.PENDING, SmartLockPasscodeStatus.CONFIRMED\] } } } とすれば、REVOKED / FAILED しか残っていない予約が再発行対象に戻る。

#### 該当箇所

```
smartLockPasscodes: { none: {} },
```

#### 到達経路

src/app/(admin)/admin/(dashboard)/spaces/\_components/space-edit-form/SpaceSmartLockDeviceCard.tsx:119 (「なし」選択して保存 → submitDeviceChange(null)) → 同 :57 setSpaceSmartLockDevice(spaceId, null) → src/app/(admin)/admin/(dashboard)/\_shared/actions/space-smart-lock-devices.ts:46-47 (parsedDevice.data === null 分岐) → src/shared/domain/smart-lock/assignment-side-effects.ts:102-113 revokePasscodesAfterSpaceUnbound → src/shared/domain/smart-lock/revoke-passcode.ts:355-405 revokeSmartLockPasscodesForReservation → 同 :196-213 revokeOne が updateMany で status=REVOKE\_PENDING（行は削除されない） → 同 :84-93 confirmRevokeByKeyAbsence が status=REVOKED へ確定（行は残る） → 管理者が続けて Pad B を選択して保存 → src/app/(admin)/admin/(dashboard)/\_shared/actions/space-smart-lock-devices.ts:49 issuePasscodesAfterSpaceBound → src/shared/domain/smart-lock/assignment-side-effects.ts:124-137 の findMany が where `smartLockPasscodes: { none: {} }` (:129) を課すため、REVOKED 行が残る予約 R は母集合から脱落 → 同 :139-148 の issueSmartLockPasscodes が R について一度も呼ばれない（誤った結果: R に Pad B 用パスコードが発行されず、admin 通知も出ない） → 復旧不能: src/shared/domain/smart-lock/reissue-passcode.ts:105 deleteTerminalPasscodeRowsForReservation は同 :87 の smartLockReissuePendingAt gate の先にあり、そのフラグは src/shared/domain/reservations/edit-side-effects.ts:183 だけが立てるため、src/app/api/cron/smart-lock-cleanup/route.ts:85 の processPendingSmartLockReissues は R を拾わない。

#### 既存の検査

無し。assignment-side-effects.ts を import または名指しするテストはリポジトリ内に存在せず (\_\_tests\_\_/ e2e/ を grep して 0 件)、この where 句の意味論を固定している assertion は無い。

#### 反証官による訂正

結論は維持するが、申告 high は medium へ補正し、事実誤認を 2 点訂正する。

【severity 補正の根拠】発火には「将来 CONFIRMED 予約がパスコードを保持しているスペースで、管理者が Pad の割当を変更する」という条件付きの管理操作が要る。データ喪失でもセキュリティ欠陥でもなく、影響は当該予約の入室手段が失われる degraded service。ただし (a) 無言（通知経路に到達しない）、(b) 自動復旧手段が皆無、(c) 顕在化するのが当日の入室時点、という 3 点は悪化要因なので low ではなく medium が妥当。

【訂正 1: 失効の遷移先と行番号】指摘は「revoke-passcode.ts:84-90 の updateMany で R のパスコードは status=REVOKED に更新される」と書くが不正確。revokeSmartLockPasscodesForReservation から最初に走るのは revokeOne (:196-213) で、ここでの遷移先は REVOKED ではなく REVOKE\_PENDING。:84-93 の confirmRevokeByKeyAbsence は fireAndForget の poll (:218) 経由で走る第 2 段で、Device List から key が消えて初めて REVOKED になる。さらに deleteKey API が失敗した場合 (:180-191) は行が CONFIRMED のまま残り、REVOKE\_PENDING が 30 分 stale になれば expireStaleRevokePendingSmartLockPasscodes (:563-588) が CONFIRMED へ戻す。もっとも `none: {}` は status を一切見ないため、REVOKE\_PENDING / REVOKED / CONFIRMED のいずれに落ち着いても予約は等しく除外される。結論に影響しないが、根拠として引かれた行は主経路ではない。

【訂正 2: 前提が狭すぎる（欠陥はより広い）】指摘は「直接付け替えを避け、2 段階で操作した場合でも」と述べ、null を挟む手順を必須条件のように扱っているが、null を挟まない直接付け替え（Pad A → Pad B を 1 回の保存で選択）でも同じ結末になる。space-smart-lock-devices.ts:46-49 の else 分岐は issuePasscodesAfterSpaceBound を無条件に呼ぶ一方、旧デバイス分の revoke は一切行わないため、予約 R は Pad A 用の CONFIRMED 行を保持したまま `none: {}` に弾かれる。結果、R は Pad B のパスコードを得られないうえ、物理的に無関係になった Pad A の生きたパスコードを保持し続ける。つまり本欠陥は「2 段階操作という限定的な手順」ではなく、Pad 割当変更の両ルートで発生する。

【付随して確認した事実】schema.prisma:2869 が REVOKED である点、findFutureConfirmedReservationIdsForSpace が :58-67 で status を絞っている点、および「assignment-side-effects.ts を import / 名指しするテストが 0 件」という既存カバレッジの申告は、いずれも実測どおり正しい（src 側の import は space-smart-lock-devices.ts:13 と smart-lock-devices.ts:31 の 2 件のみ）。

---

### F-68

**スペースの拠点変更が smartLockDeviceId を無言で外すだけで、発行済みパスコードを失効させない**

<sub>[対処の記録](2026-08-12-codebase-audit-progress.md) ／ [棄却一覧](2026-08-12-codebase-audit-refuted.md)</sub>

|        |                                            |
| ------ | ------------------------------------------ |
| 深刻度 | 中                                         |
| 箇所   | `src/shared/domain/spaces/commands.ts:256` |
| 領域   | スマートロック                             |

#### 起きること

管理者がスペース「会議室A」を拠点X→拠点Yへ付け替える（移転・棟の統合など）。updateSpaceCommand は smartLockDeviceId を null にするだけで、そのスペースの将来 CONFIRMED 予約に発行済みの CONFIRMED パスコードには一切触れない。呼び出し側 updateSpaceAction（src/app/(admin)/admin/(dashboard)/\_shared/actions/space.ts:187）も revokePasscodesAfterSpaceUnbound を import していない。以後そのパスコードはどの副作用経路からも到達不能になる: revokePasscodesAfterSpaceUnbound は呼ばれず、revokePasscodesAfterPadDeactivated は `space: { smartLockDeviceId: deviceRowId }` で絞る（assignment-side-effects.ts:31）ので unbind 済みスペースの予約を拾えず、cron の findRevocableSmartLockPasscodes は endTime 経過か CANCELLED しか拾わない。結果、旧拠点Xの物理 Keypad は、そのスペースの全既存予約の終了時刻（+buffer）まで顧客のコードで開き続ける。顧客は新拠点Yへ案内されており、旧拠点Xは第三者に引き渡し済みかもしれない。同じ状態変化を明示的に行う setSpaceSmartLockDevice(spaceId, null) は revokePasscodesAfterSpaceUnbound を呼んでおり（space-smart-lock-devices.ts:47）、2 経路で挙動が食い違う。

#### 直し方

updateSpaceCommand が拠点変更を検出したことを戻り値で呼び出し側に伝え（例: { smartLockUnbound: true }）、updateSpaceAction の execute 内で setSpaceSmartLockDevice と同様に revokePasscodesAfterSpaceUnbound(spaceId) を await する。

#### 該当箇所

```
...(isLocationChanging ? { smartLockDeviceId: null } : {}),
```

#### 到達経路

src/app/(admin)/admin/(dashboard)/spaces/\_components/space-edit-form/SpaceEditBasicTab.tsx:169-171（拠点 Select は編集時も操作可）→ src/app/(admin)/admin/(dashboard)/spaces/\_components/SpaceEditForm.tsx:356（locationId を hidden で送出）→ src/app/(admin)/admin/(dashboard)/\_shared/actions/space.ts:161-199（updateSpaceAction、:187 で updateSpaceCommand。同ファイル 1-35行の import に smart-lock 副作用なし）→ src/shared/domain/spaces/commands.ts:250（isLocationChanging = true）→ :256（smartLockDeviceId: null）→ :260 return（失効呼び出し無しでトランザクション終了）。以後の到達不能性: src/shared/domain/smart-lock/assignment-side-effects.ts:31（Pad 無効化側は space:{smartLockDeviceId: deviceRowId} で絞るため unbind 済みスペースを拾えない）／src/shared/domain/smart-lock/revoke-passcode.ts:411-427（cron は endTime 経過か CANCELLED のみ）。結果、src/shared/domain/smart-lock/issue-passcode.ts:247-250 で type:"timeLimit" として旧拠点 Pad に登録済みのコードが、buffer 付き予約時間帯に旧拠点の物理ドアで有効なまま残る。対照経路: src/app/(admin)/admin/(dashboard)/\_shared/actions/space-smart-lock-devices.ts:46-47 → src/shared/domain/smart-lock/assignment-side-effects.ts:102。

#### 既存の検査

\_\_tests\_\_/unit/domain/spaces/update-space-location-change.test.ts は 4 テストとも update データに smartLockDeviceId: null が含まれるか（TOCTOU 含む）のみを検証し、パスコード失効には一切言及しない（ファイル内に revoke の文字列なし）。

#### 反証官による訂正

事実関係はおおむね正確だが、影響の見積もりに 3 点の誇張・不足がある。(1)「どの副作用経路からも到達不能になる」は言い過ぎ。予約単位の失効経路は生きており（reservations/cancellation/steps.ts:247、reservation/mutations.ts:195,225、reservation/admin.ts:499、reservations/edit-side-effects.ts:172）、予約のキャンセルや時間変更が入れば失効する。また cron も endTime 経過後には拾う（revoke-passcode.ts:417）ので、残存は「予約終了まで」で恒久ではない。(2)「終了時刻まで開き続ける」も正確には、SwitchBot 側は type:"timeLimit" + buffered startTime/endTime で登録される（issue-passcode.ts:212-213,247-250）ため、開くのは元々の予約時間帯（±buffer）に限られ、拠点変更直後から常時開くわけではない。(3) 逆に指摘が触れていない副作用がある: 拠点変更後に新拠点デバイスを割り当て直しても、issuePasscodesAfterSpaceBound は smartLockPasscodes:{ none: {} }（assignment-side-effects.ts:129）で絞るため、旧デバイス宛の古いパスコードを持つ予約には新コードが発行されない — 顧客は新拠点で開けられない。深刻度は high ではなく medium が妥当: 発火にはスペースの拠点付け替えという稀な管理操作＋将来 CONFIRMED 予約＋発行済みパスコードが同時に必要で、露出窓は元の予約時間帯に限定される。

---

### F-69

**必須規約の同意ゲートが DB 一時障害で fail-open し、その空結果が 'use cache' に最大1時間焼き付く**

<sub>[対処の記録](2026-08-12-codebase-audit-progress.md) ／ [棄却一覧](2026-08-12-codebase-audit-refuted.md)</sub>

|        |                                          |
| ------ | ---------------------------------------- |
| 深刻度 | 中                                       |
| 箇所   | `src/shared/domain/terms/queries.ts:233` |
| 領域   | 暗号・env・同意                          |

#### 起きること

`getRequiredTermsByScope()` は `"use cache"` + `cacheLife(CACHE_LIFE.PUBLIC_CONTENT)`（Next 既定 hours = revalidate 3600s / expire 86400s、node\_modules/next/dist/server/config-shared.js:164-168 で実測）の producer でありながら、中の `prisma.termsDocument.findMany` を `safeFetch({ fallback: [] })` で包んでいる。本番で 1 回でも DB 例外（statement timeout / pool 枯渇 / 接続断）が起きると、safeFetch が例外を握って `[]` を「正常な戻り値」として返すため、Next はその空配列を Data Cache に格納する。以後 revalidate まで最大 1 時間（stale-while-revalidate 込みで最長 24 時間）、この関数は DB が復旧しても `[]` を返し続ける。結果:

\1. `assertAllRequiredTermsAgreed`（consent-gate.ts:32-35）が `requiredTerms.length === 0` で即 `{ matchedTermsIds: [] }` を返し、**必須規約への同意チェックが完全に無効化される**。
\2. 同じ関数がフォーム描画側（ReservationFormSection.tsx:81 / section-renderer.tsx:531 / events/\[slug\]/\_components/event-registration-context.ts:49 / login/page.tsx:62）でも使われるため、UI にもチェックボックスが 1 つも出ない。ユーザーは何も気付かず送信でき、`recordTermsAgreementsCommand` は `termsIds.length === 0` で `{count: 0}` を返して 1 行も記録しない（commands.ts:541）。
\3. その窓で成立した予約・問い合わせ・イベント申込は **TermsAgreement 行を 1 件も持たないまま確定する**。RESERVATION / INQUIRY / EVENT\_REGISTRATION scope には再同意による回収経路が無い（`getReagreeRequiredTermsForCustomer` は LOGIN\_SIGNUP scope 専用）ため、その取引の同意証跡は事後に再構成できない。

同一ファイルの `getReagreeRequiredTermsForCustomer` は queries.ts:252-254 で「safeFetch で fallback を空にしない: 「差分なし」と誤認して redirect gate をすり抜ける silent failure になるため、DB 例外は bubble させて mypage の error boundary で拾う (fail-closed)」と明記して意図的に fail-closed にしている。つまり同じ判断が公開 4 経路の本丸ゲート側にだけ適用されていない。

#### 直し方

`getRequiredTermsByScope` はセキュリティ／法務ゲートの入力なので、`getReagreeRequiredTermsForCustomer` と同じく safeFetch を外して例外を bubble させる（呼出側の Server Action は既に try/catch で `{ok:false}` に落とすため、ユーザーには「送信できない」= fail-closed が伝わる）。フォーム描画側で可用性を保ちたいなら、描画用（safeFetch あり・キャッシュあり）とゲート用（例外 bubble・キャッシュなし、reagree と同型の生 Prisma クエリ）に関数を分けて、consent-gate.ts が後者だけを呼ぶようにする。

#### 該当箇所

```
fallback: [],
```

#### 到達経路

src/app/(public)/\_components/ReservationFormSection.tsx:81（描画側）または src/app/(public)/\_shared/actions/reservation.ts:127（送信側）
→ src/shared/domain/terms/consent-gate.ts:32 `getRequiredTermsByScope(TermsScope.RESERVATION)`
→ src/shared/domain/terms/queries.ts:216-221 `"use cache"` + `cacheLife(CACHE_LIFE.PUBLIC_CONTENT)`（src/shared/lib/constants/cache.ts:31 で "hours" → node\_modules/next/dist/server/config-shared.js:164-168 で revalidate 3600 / expire 86400）
→ src/shared/domain/terms/queries.ts:223-238 `safeFetch({ fetch: prisma.termsDocument.findMany, fallback: [] })`
→ src/shared/lib/errors/safe-fetch.ts:54-65 Prisma 例外を catch → `return options.fallback`（= `[]` を正常戻り値として返す）
→ node\_modules/next/dist/server/use-cache/use-cache-wrapper.js:1498（`case 'request'` が通常 cache 経路へ fallthrough）/ :2393-2396（`saveToCacheHandler`）で `[]` が Data Cache に格納される
→ 以後 revalidate 3600 秒（expire 86400 秒）まで DB 復旧後も `[]` を返す
→ src/shared/domain/terms/consent-gate.ts:33-35 `if (requiredTerms.length === 0) return { matchedTermsIds: [] }` — 同意ゲートが no-op 化
→ src/app/(public)/\_shared/actions/reservation.ts:129 `data.agreedTermsIds` は `[]`（src/shared/lib/validations/public-reservation.ts:56-61 に `.min(1)` が無く `.default([])` なので zod も通す）
→ src/shared/domain/reservations/public-commands.ts:285 `if (input.agreedTermsIds && input.agreedTermsIds.length > 0)` が false → src/shared/domain/terms/commands.ts:657 `recordTermsAgreements` を呼ばない
→ src/shared/domain/reservations/public-commands.ts:298 予約行のみ commit。TermsAgreement 0 件のまま予約が確定する（RESERVATION scope に再同意回収経路は無い — queries.ts:270 で `getReagreeRequiredTermsForCustomer` は LOGIN\_SIGNUP 固定）

#### 既存の検査

未捕捉。\_\_tests\_\_/unit/domain/terms/consent-gate.test.ts:23-26 は `mock.module("@/shared/domain/terms/queries", ...)` で `getRequiredTermsByScope` 自体を丸ごと差し替えるため safeFetch 経路を一切通らず、さらに同ファイル :39-46 の「required が空のときは validate を通す (no-op)」テストが「必須規約が未設定」と「DB 読みが失敗した」を区別せず fail-open 側を仕様として固定している。\_\_tests\_\_/unit/architecture/ に safeFetch を走査する gate は errors-server-mock-coverage.test.ts のみで（mock 網羅の検査であり fallback の意味論は見ない）、`"use cache"` producer 内の safeFetch fallback を禁じる gate も ESLint ルールも存在しない（eslint.config.mjs に "use cache" 関連の記述なし）。

#### 反証官による訂正

欠陥そのものは実在するが、指摘には 3 点の事実誤認と 1 点の深刻度誇張がある。

【誤認 1】記録関数の取り違え。指摘は「`recordTermsAgreementsCommand` が `termsIds.length === 0` で `{count: 0}` を返す（commands.ts:541）」としているが、公開予約 / 問い合わせ / イベント申込の 3 経路が呼ぶのは `recordTermsAgreements`（src/shared/domain/terms/commands.ts:657、空配列で `return []` は :660）であり、しかもそこに到達する前に呼出側の `if (input.agreedTermsIds.length > 0)` guard（src/shared/domain/reservations/public-commands.ts:285 / src/shared/domain/inquiries/commands.ts:507 / src/shared/domain/events/registration-create-commands.ts:185 / src/shared/domain/events/waitlist-register-commands.ts:179）で記録処理ごと skip される。`recordTermsAgreementsCommand` を実際に呼ぶのは consume-signup-terms.ts:94 と mypage/terms/reagree/\_actions.ts:73 の LOGIN\_SIGNUP 系 2 箇所だけ。結論（同意行 0 件で取引が確定する）は変わらないが、引用した file:line は誤り。

【誤認 2】「stale-while-revalidate 込みで最長 24 時間」は過大。`expire: 86400` は entry を強制破棄する上限であって滞留期間ではない。`revalidate: 3600` を過ぎた最初のリクエストで background revalidation が走る（use-cache-wrapper.js:2364, 2384-2396）ため、DB が復旧していれば実際の滞留は「1 障害あたり最大 1 時間 + 次の 1 リクエスト」。ただし revalidation 自体が safeFetch で失敗すると `[]` が再書き込みされて窓が連鎖しうる点は指摘のとおり（むしろ指摘が書いていない悪化要因）。

【誤認 3】`stale: 300` を「最大 1 時間」の根拠に混ぜていないのは正しいが、Cloud Run の複数インスタンス構成では既定 cache handler がインスタンスローカルなため、汚染は全インスタンス同時ではなく「その fault を踏んだインスタンスのみ」。全ユーザーが一律に無ゲートになるわけではない。

【深刻度】high → medium に補正。理由: (a) 発火に DB 例外という運用障害が必要で、攻撃者が任意に誘発できる入力経路が無い（rate limiter / Turnstile も前段にある）、(b) 認証 bypass でも情報漏えいでもなく、被害は「有界な窓での同意証跡の欠落」という compliance / 証拠性の問題、(c) 管理画面での規約編集による `revalidateTag(CACHE_TAGS.TERMS)` および 1 時間ごとの revalidate で自然復旧する、(d) 汚染範囲は当該インスタンスに限定。「high」は exploitable な gate bypass を含意するので過大。ただし同意記録を法的証跡として扱う要件が明示されているなら high 寄りに再評価する余地はある（queries.ts:252-254 が同種の判断を fail-closed として明文化している以上、設計意図としては本来 fail-closed 側が正）。

---

### F-70

**welcome メールの唯一の CTA が /mypage/mypage を指し 404 になる**

<sub>[対処の記録](2026-08-12-codebase-audit-progress.md) ／ [棄却一覧](2026-08-12-codebase-audit-refuted.md)</sub>

|        |                                    |
| ------ | ---------------------------------- |
| 深刻度 | 中 ／ 実コード確認済               |
| 箇所   | `src/shared/emails/welcome.tsx:26` |
| 領域   | メールテンプレート                 |

#### 起きること

Google/LINE で新規会員登録 → src/shared/domain/customers/link.ts:85 が loginUrl: `${getAppUrl()}/mypage` を渡す → テンプレ側がさらに /mypage を連結し、ボタンと URL fallback の両方が https://\<app\>/mypage/mypage になる。src/app/(public)/mypage/ 配下に mypage セグメントは無く、root catch-all src/app/(public)/\[...segments\]/page.tsx は segments.length === 1 のときしか Page を返さないため notFound()（soft-404）になる。ウェルカムメールには他の導線が無いので、全新規会員がメールから 404 に着地する。

#### 直し方

テンプレ側の連結をやめて href={loginUrl} をそのまま使う（prop 名も mypageUrl に改名）か、link.ts:85 を getAppUrl() に戻す。どちらにせよ fixture を本番と同じ値（https://example.com/mypage）に揃えてプレビューが本番と乖離しないようにする。

#### 該当箇所

```
const mypageUrl = `${loginUrl}/mypage`;
```

#### 到達経路

src/app/(public)/mypage/layout.tsx:73 (MypageAuthGate、新規会員の初回 /mypage アクセス) → src/shared/domain/customers/link.ts:62 prisma.customer.create 成功 → link.ts:80-88 fireAndForget(sendWelcomeEmail({ loginUrl: `${getAppUrl()}/mypage` })) \[= "https://\<host\>/mypage"\] → src/shared/domain/email/lib-dispatch.ts:87 sendWelcomeEmailLib(data, sendContext) → src/shared/lib/email/welcome-emails.ts:18-20 WelcomeEmail({ loginUrl: data.loginUrl }) → src/shared/emails/welcome.tsx:26 で二重連結し mypageUrl = "https://\<host\>/mypage/mypage" → welcome.tsx:40 (Button href) と welcome.tsx:50 (urlFallbackText) に出力 → 受信者がクリック → /mypage 配下に mypage セグメント無し・src/proxy.ts に redirect 無し → src/app/(public)/\[...segments\]/page.tsx:55-58 で segments=\["mypage","mypage"\] のため `segments.length === 1` が false → :78 notFound()（ADR 0004 により HTTP 200 + noindex の soft-404）。同ファイル :36 の generateMetadata も同じ分岐で "ページが見つかりません" を返す。

#### 既存の検査

無し。welcomeFixture は loginUrl: "https://example.com"（/mypage 無し）なので管理画面プレビューでも \_\_tests\_\_/unit/emails/email-template-registry-render.test.ts でも正しい URL に見える。\_\_tests\_\_/unit/shared/lib/email/welcome-email-key.test.ts:64 は本番同型の "https://example.com/mypage" を渡すが idempotencyKey しか assert しない。\_\_tests\_\_/unit/shared/domain/customers/link.test.ts にも loginUrl の assertion は無い。

#### 反証官による訂正

欠陥そのものは事実。ただし深刻度と前提に補正が要る。(a) high → medium。データ破損・認可・決済・セキュリティのいずれにも影響せず、失うのは「メールからの復帰導線」1本だけ。着地先は src/app/(public)/not-found.tsx で公開サイトの chrome 付きなので復帰は容易。(b) 「Google/LINE で新規会員登録 → link.ts:85」という限定は不正確。sendWelcomeEmail は ensureCustomerLinked の Customer 新規作成時に無条件で発火し、その主経路は src/app/(public)/mypage/layout.tsx:73 の MypageAuthGate、他に claim/reservation・claim/event-registration・merge/request・terms/reagree・consume-signup-terms の計8箇所。つまり発火の瞬間、ユーザーは大抵すでに /mypage 上におり、壊れたリンクが実害になるのは「後日メールから戻るとき」に限られる。この点は指摘が触れていない緩和要因。(c) 「404 になる」という表現は、指摘本文が soft-404 と補足している通り正しい。ADR 0004 のとおり HTTP ステータスは 200 で、Next.js が robots noindex を注入する。ステータスコードで監視している場合は検知されない（＝本番で気付かれにくい）ので、この点はむしろ悪化要因。(d) 修正はどちら側か一方に限定すること。welcome.fixture.ts:6 が loginUrl に素の origin "https://example.com" を入れているため、テンプレ側の契約は「loginUrl = ベース URL」。契約に従うなら link.ts:85 を `getAppUrl()` に戻すのが最小修正で、逆に welcome.tsx:26 の連結を消す場合は fixture も "https://example.com/mypage" に直さないとプレビューと registry render テストが壊れた URL を映し続ける。(e) 既存カバレッジの申告は正確だった（3ファイルとも実際に loginUrl を assert していないことを確認済み）。回帰防止を入れるなら、fixture を本番同型にするだけでは不十分で、link.ts が渡す値とテンプレの出力 href を突き合わせる assertion が要る。

---

### F-71

**bot 判定が「クライアント時計」と「サーバー時計」を引き算するため、端末の時計が進んでいる利用者は全公開フォームを送信できない**

<sub>[対処の記録](2026-08-12-codebase-audit-progress.md) ／ [棄却一覧](2026-08-12-codebase-audit-refuted.md)</sub>

|        |                                       |
| ------ | ------------------------------------- |
| 深刻度 | 中                                    |
| 箇所   | `src/shared/lib/action-helpers.ts:86` |
| 領域   | フロントエンド                        |

#### 起きること

`formRenderedAt` はフォーム初回マウント時に **ブラウザの** `Date.now()` で焼かれる（reservation-form.tsx:214 `const [formRenderedAt] = useState(() => Date.now());`、public-inquiry-form-card.tsx:108、receipt-resend-form.tsx:48、event-registration-form.tsx:117 も同型）。サーバーはそれを **サーバーの** `Date.now()` から引く。端末の時計が S 秒進んでいると差は (実入力時間 F − S) になり、`F − S < 3000ms` の間はすべて bot 判定で拒否される。具体例: NTP 同期していない PC の時計が 5 分進んでいる利用者が /reservation で 2 分かけて入力し「予約を確定する」を押す → 差は約 −180000ms → 「セキュリティ検証に失敗しました。しばらく経ってから再度お試しください。」が返り、Turnstile も張り直される。押し直しても同じで、フォームを 5 分以上開いたままにするまで一度も予約が成立しない。お問い合わせフォーム（入力 30 秒〜2 分）では 1 分程度のずれで同じことが起きる。逆向き（時計が遅れている端末）では差が過大になり時間トラップが常に素通りする。

#### 直し方

クライアント時計の絶対値をサーバー時刻と比較しない。サーバーが発行した署名付き（または暗号化した）タイムスタンプをフォームに埋め、サーバー側で自分が発行した値とだけ突き合わせる（この repo には `src/shared/lib/tokens/` / `crypto-purposes.ts` の purpose 付きトークン基盤が既にある）。署名を入れないなら、少なくとも `performance.now()` 由来の「経過時間（差分）」を送らせ、絶対時刻の突き合わせをやめる。

#### 該当箇所

```
if (
params.formRenderedAt !== undefined &&
Date.now() - params.formRenderedAt < MIN_FORM_FILL_TIME_MS
) {
return { success: false, error: BOT_DETECTED_ERROR };
}
```

#### 到達経路

src/app/(public)/reservation/\_components/reservation-form.tsx:214 `const [formRenderedAt] = useState(() => Date.now())`（クライアント時計で焼く。マウント時＝日付選択より前に確定） → 同:570-574 `<input type="hidden" name={fields.formRenderedAt.name} value={formRenderedAt} />` → src/shared/lib/validations/public-reservation.ts:69 `formRenderedAt: z.coerce.number().optional()`（上限チェック無しでそのまま通過） → src/app/(public)/\_shared/actions/reservation.ts:97-103 `checkBotHeuristics({ honeypot: data.website, formRenderedAt: data.formRenderedAt })`（77/82/89 の guard を抜けた後、105 の Turnstile 検証より前） → src/shared/lib/action-helpers.ts:84-89 サーバーの `Date.now()` から減算。端末時計が S ミリ秒進んでいると差は (実入力時間 F − S) となり、S \> F − 3000 の間は同:88 `return { success: false, error: BOT_DETECTED_ERROR }` → reservation.ts:102 `return { ok: false, error: botCheck.error }` で「セキュリティ検証に失敗しました。しばらく経ってから再度お試しください。」が返り、フォームを開いたまま S ミリ秒経過するまで何度押しても予約が成立しない。同一経路: src/app/(public)/\_shared/actions/inquiry.ts:61 / event-registration.ts:113,343 / src/app/(public)/receipts/reissue-request/\_actions/resend.ts:83。実測記録は e2e/helpers/reservation-date.ts:153-159（CI run 30731786539）。

#### 既存の検査

none（本番挙動としては未検査）。`__tests__/unit/lib/action-helpers.test.ts:107-142` は `Date.now() - 10_000` 等、client と server が同一時計である前提のケースしか置いていない。`__tests__/unit/architecture/e2e-calendar-date-selection.test.ts:118-140` と `e2e/helpers/reservation-date.ts:145-163` はこの引き算の仕組みを実測付きで文書化しているが、目的は「E2E spec が clock.install で時計を固定してはいけない」という **テスト側の制約** であり、実利用者の時計ずれは守っていない。integration テストは `checkBotHeuristics` 自体を mock している（`__tests__/integration/actions/public/inquiry.test.ts:52` 等）。

#### 反証官による訂正

技術的記述はほぼ正確（引用・行番号 4 箇所のフォーム、reservation.ts:97 / inquiry.ts:61 / resend.ts:83 はいずれも実際の行と一致）。2 点だけ補正する。(1) 見出しの「全公開フォーム」はやや過大。`formRenderedAt` を持つのは reservation / public-inquiry / event-registration / receipt-resend の 4 種で、`src/app/(public)/events/waitlist/confirm/_actions/confirm.ts:38` は「honeypot / formRenderedAt は無し」と明示しており影響を受けない。(2) 深刻度は high → medium に補正。発火条件が「端末時計が (入力所要時間 − 3 秒) を超えて進んでいる」という利用者側の環境不備に限定され、NTP 同期済みの一般的な端末では起きない。ただし該当した利用者には回避手段が無く（エラー文言が原因を示さず Turnstile も張り直される）、予約という主要導線が完全に不成立になるため、確率は低いが影響は全損で、low ではない。修正コストも小さい（差が負のときを pass 扱いにする、または基準時刻をサーバー側で焼く）。なお「逆向きの素通り」はセキュリティ面の弱体化だが、honeypot / Turnstile / IP・email rate limit という他層が残るため単独では low。

---

### F-72

**起動時の Cloudflare canary purge が最大 10 分 × 3 回スリープしうるため、Cloud Run の startup probe 予算 90 秒を超えてコンテナが起動不能になる**

<sub>[対処の記録](2026-08-12-codebase-audit-progress.md) ／ [棄却一覧](2026-08-12-codebase-audit-refuted.md)</sub>

|        |                                     |
| ------ | ----------------------------------- |
| 深刻度 | 中                                  |
| 箇所   | `src/shared/lib/cache/health.ts:53` |
| 領域   | ビルド・デプロイ                    |

#### 起きること

`src/instrumentation.ts:32-34` が `register()` の中でこの関数を await しており、Next.js 同梱 docs（node\_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/instrumentation.md:18）は register について「must complete before the server is ready to handle requests」と明記している。`callPurgeApi` は 429 / 5xx を受けると `await sleep(retryAfterMs ?? purgeBackoffMs(attempt))`（src/shared/lib/cloudflare.ts:136）で待機し、`retryAfterMs` の上限は `PURGE_API_MAX_RETRY_AFTER_MS = 10 * 60 * 1000`（同 L77）、リトライは `PURGE_API_MAX_RETRIES = 3`（同 L71）。一方 Cloud Run の startup probe は public / admin とも `period_seconds = 10` × `failure_threshold = 9` = 約 90 秒（terraform/cloud\_run\_public.tf:76-85、terraform/cloud\_run\_admin.tf:74-83）。Cloudflare の purge API が `429` と `Retry-After: 120` を返した時点で register が 120 秒ブロックし、`/api/live` が応答できないまま 9 回連続で probe が失敗してコンテナが kill される。`min_instance_count = 0`（同 L49-51）なのでコールドスタートのたびに同じことが起き、Cloudflare 側が 429 を返し続ける間は公開サイトが復旧しない（デプロイも新 revision が ready にならず失敗する）。

#### 直し方

起動時の canary は「観測」であって「起動条件」ではないので、register をブロックさせない。`assertCloudflareCredentials()` に短い全体予算（例: `AbortSignal.timeout` 相当の数秒）を渡す専用パスを設け、その中では retry / Retry-After 待機を行わない実装にする（`callPurgeApi` にリトライ無効フラグを足すのが最小）。資格情報の形式検証（getCloudflareCredentialsValidated）は同期なので register に残してよい。

#### 該当箇所

```
// Canary tag purge. Success proves credentials and API permission are usable.
const result = await callPurgeApiPublic(creds.zoneId, creds.apiToken, {
tags: [CANARY_TAG],
});
```

#### 到達経路

Cloud Run コールドスタート (terraform/cloud\_run\_public.tf:49-51 min\_instance\_count=0) → Dockerfile:219 CMD \["node","server.js"\] (NODE\_ENV=production は Dockerfile:175) → node\_modules/next/dist/server/lib/start-server.js:266 listen 後、:218-225 requestListener が handlersPromise を await (:187-197 も同様に待機、503 にしない) → node\_modules/next/dist/server/base-server.js:488 handleRequest 冒頭の await this.prepare() → node\_modules/next/dist/server/next-server.js:573-579 prepareImpl → runInstrumentationHookIfAvailable → src/instrumentation.ts:17 register() → :32-34 await assertCloudflareCredentials() → src/shared/lib/cache/health.ts:28 (production なので継続) → :32 (E2E\_RUNTIME 未設定なので継続) → :35 creds 非 null (terraform/variables.tf:163-164 → terraform/cloud\_run\_public.tf:108-119 で注入) → :54 await callPurgeApiPublic → src/shared/lib/cloudflare.ts:131 の 429/5xx 分岐 → :133-135 parseRetryAfterMs が数値 Retry-After を解釈 (:85-92、上限 :77 の 600000ms) → :136 await sleep(...) を最大 3 回 (:71) → その間 src/app/api/live/route.ts:20 の GET が返らない → terraform/cloud\_run\_public.tf:76-85 (admin は cloud\_run\_admin.tf:74-83) の startup\_probe が timeout\_seconds=1 × period\_seconds=10 × failure\_threshold=9 ≒ 90 秒で打ち切り、コンテナが kill され revision が ready にならない

#### 既存の検査

none。\_\_tests\_\_/unit/lib/cache/health.test.ts は 3 本（E2E ランタイムでの skip / 資格情報欠落の報告 / canary 失敗の報告）だけで、所要時間や probe 予算との整合は見ていない。\_\_tests\_\_/unit/architecture/ を `startup_probe|failure_threshold` で grep しても terraform の probe 設定を検査する gate は無い（ヒットしたのは lighthouse-ci-env.test.ts と lexical の register-layout-node-transforms.test.ts で、いずれも無関係）。

#### 反証官による訂正

見出しの「最大 10 分 × 3 回」自体は正しい（PURGE\_API\_MAX\_RETRIES=3 なので attempt 0/1/2 の 3 回 sleep、理論上限は合計 30 分）が、発火条件は見出しが示唆するより狭い。指摘が触れていない 2 点を補足する: (1) 各 fetch は AbortSignal.timeout(10000)（src/shared/lib/cloudflare.ts:119）で 10 秒に制限されるため、Retry-After ヘッダーが無い純粋な exponential backoff 経路では最悪でも 4 回 × 10 秒 + sleep 1/2/4 秒 ≒ 47 秒にしかならず、90 秒の probe 予算を単独では破れない。つまりこの欠陥は「Cloudflare が 429/5xx を返し、かつ数値 delta-seconds の Retry-After を約 90 秒以上で返す」ときにのみ成立する。(2) parseRetryAfterMs（同 :85-92）は delta-seconds のみ対応で HTTP-date 形式は null を返し backoff にフォールバックするため、Cloudflare が日付形式で返す場合も成立しない。なお指摘が挙げた行番号（cloudflare.ts:71/77/136、cloud\_run\_public.tf:76-85/49-51、cloud\_run\_admin.tf:74-83、instrumentation.ts:32-34）と Next 同梱 docs の引用文は全て実在を確認済みで、誤りは無い。

---

### F-73

**イベント slug が cancel/waitlist/registrations で始まると詳細ページの Cache-Tag が丸ごと消える（lookahead が前方一致）**

<sub>[対処の記録](2026-08-12-codebase-audit-progress.md) ／ [棄却一覧](2026-08-12-codebase-audit-refuted.md)</sub>

|        |                                                  |
| ------ | ------------------------------------------------ |
| 深刻度 | 中                                               |
| 箇所   | `src/shared/lib/constants/cdn-cache-tags.ts:215` |
| 領域   | キャッシュ                                       |

#### 起きること

生成される source は `/events/:slug((?!registrations|waitlist|cancel)[^/]+)`。negative lookahead はセグメント先頭位置でしか評価されないため、`cancellation-policy-seminar` / `waitlist-guide` / `registrations-open-day` のような slug は「cancel で始まる」だけで除外される。イベント slug のバリデーションは SLUG\_REGEX（小文字英数字とハイフン）だけで予約語チェックが無いため、この slug は管理画面から普通に作成できる。作成後 /events/cancellation-policy-seminar は EVENT\_PUBLIC\_DETAIL\_HEADER\_SOURCE にマッチせず blanket /:path\* だけが当たり、Cache-Tag が 1 つも付かない。以後 announcement-bar / navigation / layout など全 site-wide タグ purge がこのページに届かず、最大 s-maxage+SWR（2 時間）stale。イベント本体の編集だけは event.ts の /events/\<slug\> URL purge で救われるため、症状は「イベント内容は即反映されるのにサイト共通部分だけ古い」という切り分けの難しい形で出る。

#### 直し方

lookahead をセグメント境界に固定する: `/events/:slug((?!(?:registrations|waitlist|cancel)(?:/|$))[^/]+)`。あわせて gate に path-to-regexp の実マッチを使った見本入力（/events/cancel は非マッチ、/events/cancellation-policy-seminar はマッチ、/events/registrations/status は非マッチ）を足し、変異検査になる形にする。

#### 該当箇所

```
export const EVENT_PUBLIC_DETAIL_HEADER_SOURCE =
`/events/:slug((?!${EVENT_PRIVATE_FIRST_SEGMENTS.join("|")})[^/]+)` as const;
```

#### 到達経路

\1. 管理画面 イベント作成フォーム → slug に `cancellation-policy-seminar` を入力
\2. src/app/(admin)/admin/(dashboard)/events/\_components/event-form-schema.ts:174-184 — `.regex(SLUG_REGEX)` のみ。予約語 deny 無しで通過（SLUG\_REGEX 定義: src/shared/lib/validations/params.ts:16）
\3. src/shared/domain/slugs/validation.ts:18 / 44-93 — 予約語チェックは ContentType `post|news|page|space` 専用かつ完全一致。events から未参照のため到達しない
\4. prisma/schema.prisma:2478 — `slug String @db.VarChar(100)`。CHECK 制約なしで永続化
\5. 公開 GET /events/cancellation-space-seminar → src/app/(public)/events/\[slug\]/ がレンダリング
\6. next.config.ts:292 — `source: EVENT_PUBLIC_DETAIL_HEADER_SOURCE`
\7. src/shared/lib/constants/cdn-cache-tags.ts:215-216 — 生成される `/events/:slug((?!registrations|waitlist|cancel)[^/]+)` が `^\/events(?:\/((?!registrations|waitlist|cancel)[^/]+))[\/]?$` にコンパイルされ、セグメント先頭の lookahead が `cancel` 前方一致で失敗 → **非マッチ**（bundled path-to-regexp で実測）
\8. next.config.ts:243-251 の blanket `/:path*` のみ適用 → `Cache-Control` だけ付き `Cache-Tag` ヘッダーが 1 つも付かない状態で Cloudflare にキャッシュされる
\9. 以後 src/shared/lib/cache/site-wide.ts の `invalidateSiteWideCache()` → `queueTagPurge(...cdnTags, CDN_CACHE_TAGS.SITEMAP)` が announcement-bar-v1 / navigation-v1 / layout-v1 等を purge しても、タグ purge のためこのページに届かない
\10. 誤った結果: s-maxage 3600 + SWR 3600 = 最大 2 時間、サイト共通部分（お知らせバー・ナビ・フッター等）が stale のまま配信される。イベント本文だけは event.ts:42-46 の `/events/${slug}` URL purge で更新されるため、症状が部分的にしか出ず切り分けが難しい

#### 既存の検査

none。next-config-cache-tag-emission.test.ts:75 は EVENT\_PUBLIC\_DETAIL\_HEADER\_SOURCE を「その文字列の source entry が存在し site-wide タグを含む」ことの確認にしか使っておらず、正規表現が実際にどの path にマッチ/非マッチするかは一切試していない。src/shared/lib/validations 側にもイベント slug の予約語チェックは存在しない。

#### 反証官による訂正

指摘本文に事実誤認はない。実測で判明した補足が 3 点。

(1) トリガー条件の正確な形: 「3 語のいずれかで始まる」で正しいが、境界はハイフンではなく**素の文字列前方一致**。`canceling-101`（ハイフン区切りでは cancel ではない）も非マッチになる一方、`my-cancel-day` は先頭でないためマッチする。修正時のテストケースはこの 2 つを含めるべき。

(2) 「予約語チェックが無い」は結論として正しいが、リポジトリには予約語 SSoT 自体は存在する（src/shared/domain/slugs/validation.ts:44-86 の `RESERVED_PATHS` / `isReservedPath`）。ただし `ContentType` が `post|news|page|space` でイベントを含まず、events 側からの参照は 0 件。さらに `RESERVED_PATHS.has(slug.toLowerCase())` は完全一致判定なので、仮に events に配線しても `cancellation-policy-seminar` は防げない。つまりこの SSoT は反証材料ではなく、「配線しても直らない」という点でむしろ指摘を補強する。修正は正規表現側（`(?!(?:registrations|waitlist|cancel)$)` へ変更、あるいは `EVENT_PRIVATE_FIRST_SEGMENTS` を除外する別の表現）で行うのが筋。

(3) 指摘が触れていない追加の防御欠落: prisma/schema.prisma:2478 の Event.slug は `String @db.VarChar(100)` のみで、migrations にも slug の CHECK 制約は存在しない。DB 層でも止まらない。

---

### F-74

**予約メールの「料金」が税抜合計。実際の請求・領収書・振込額は税込**

<sub>[対処の記録](2026-08-12-codebase-audit-progress.md) ／ [棄却一覧](2026-08-12-codebase-audit-refuted.md)</sub>

|        |                                                  |
| ------ | ------------------------------------------------ |
| 深刻度 | 中                                               |
| 箇所   | `src/shared/lib/email/reservation-emails.ts:219` |
| 領域   | メールテンプレート                               |

#### 起きること

Reservation.totalPrice は prisma/schema.prisma:841 で「割引後・税抜」、totalPriceWithTax(:866) が「税込み合計」で Stripe charge / 返金上限 / 領収書金額の SSoT（receipts/issue-core.ts:104 は totalPriceWithTax を使う）。税抜 8,000 円・標準税率 10% の予約で、公開ページは useFormatPrice 経由 formatPriceWithTax（既定 displayModePublic = TAX\_INCLUDED）で「¥8,800（税込）」、領収書 PDF も 8,800 円。ところが確認メールは reservation-confirmation.tsx:137 の「料金:」に ¥8,000 を税抜と明示せず出す。payment feature OFF の運用では shouldShowTransferAccounts が同じメールに「お振込先」を描画する（reservation-confirmation.tsx:146）ため、顧客はメール記載の 8,000 円を振り込み 800 円不足する。同じ欠陥が :369（変更通知）、:585（ステータス更新）、:712（管理者通知）にもあり、返金メールだけは originalTotal: emailData.totalPriceWithTax ?? ... と税込なので同一予約で税抜/税込が混在する。

#### 直し方

ReservationEmailData に totalPriceWithTax を必須で通し（buildPayload の呼び出し側 public-commands.ts:317 等も渡す）、メールは税込合計を表示する。税抜も出すなら「小計（税抜）/ 消費税 / 合計（税込）」の 3 行にして、mypage の予約詳細（reservation-detail.tsx:224-243）と同じ内訳に揃える。

#### 該当箇所

```
totalPrice: formatPrice(data.totalPrice, "未設定"),
```

#### 到達経路

src/shared/domain/reservations/public-commands.ts:317 (buildPayload に totalPrice: pricing.totalPrice = 税抜のみ渡す) → src/shared/domain/reservations/payloads.ts:389-391 (totalPriceWithTax が null のため payload から省略) → src/shared/domain/reservations/confirmation-side-effects.ts:85 (input.payload をそのまま送信) → src/shared/lib/email/reservation-emails.ts:219 formatPrice(data.totalPrice, "未設定") (税ラベル無し) → src/shared/emails/reservation-confirmation.tsx:137 「料金: ¥8,000」 / 同ファイル:146 で shouldShowTransferAccounts (src/shared/lib/settings/transfer-account-gate.ts:9-21, payment OFF + UNPAID/FAILED + 口座 1 件以上) が「お振込先」を同一メールに描画 → 請求実体は src/shared/domain/reservations/payment-commands.ts:479 chargeBase = totalPriceWithTax、src/shared/domain/receipts/issue-core.ts:104 amount = totalPriceWithTax = ¥8,800 で 800 円乖離

#### 既存の検査

無し。\_\_tests\_\_/unit/architecture/reservation-email-idempotency.test.ts と confirmation-email-no-receipt-cta.test.ts は key と CTA だけを見る。\_\_tests\_\_/unit/emails/ に金額 assertion は 1 件も無い（grep で totalPrice ヒット 0）。fixture も totalPrice: "8,000円" という文字列なので税抜/税込の区別を持たない。

#### 反証官による訂正

high は誇張。指摘の中核は正しいが、支柱の事実認識に 3 点の誤りがある。(1) 「公開ページは ¥8,800（税込）」は予約**前**の面（use-format-price.ts の formatTotal → booking-summary.tsx:80、space-list 等）に限った話で、予約**後**の公開面はメールと同じ税抜値を出す。確認メールの CTA が指す先そのものである /reservation/status は page.tsx:277 で `合計金額: {formatPrice(reservation.totalPrice, "未定")}` を出し、その直下に同じ TransferAccountsSection を描画する。mypage 詳細 (reservation-detail.tsx:225-227) も totalPrice を「合計金額」と呼び、その後に「消費税」「税込合計」行を足す。つまりこれは email 層だけが誤った列を掴んでいる field 誤配線ではなく、post-booking 面に共通する表示規約で、メールにだけ税内訳行が無いという**欠落**。修正はメール側 1 箇所では閉じず、status ページも同じ性質を持つ。(2) 「同じ欠陥が :369 / :585 / :712 にもある」は独立した 4 件ではなく :219 と同一規約の一貫した適用で、件数による重み付けは成立しない。(3) 「返金メールだけ税込なので混在」は事故ではなく明示的な設計で、types.ts:412 に「予約の元請求額 (円)。totalPriceWithTax を優先 (Stripe charge SSoT)」と文書化されている。加えて到達条件は payment feature OFF かつ active 振込口座 1 件以上かつ UNPAID/FAILED に限定され (transfer-account-gate.ts:9-21)、口座欄の直上には運用者が自由記述する transferGuidance が描画されるため、振込額の案内は運用側で補える。一方で「既存カバレッジ無し」の申告は正確で、\_\_tests\_\_/unit/emails/ の金額 assertion は reservation-refund.test.tsx:40-41 の refundAmount 文字列のみ、gate も型も税抜/税込を区別しない。実害は「税込内訳行が無いことによる過少振込リスク」であり、データ破損でも本番機能停止でもない。

---

### F-75

**記事本文の contentWidth が Tailwind に存在しないクラス名として出力され、公開ページで常に無効になる**

<sub>[対処の記録](2026-08-12-codebase-audit-progress.md) ／ [棄却一覧](2026-08-12-codebase-audit-refuted.md)</sub>

|        |                                              |
| ------ | -------------------------------------------- |
| 深刻度 | 中                                           |
| 箇所   | `src/shared/lib/styles/layout-mapper.ts:106` |
| 領域   | 共通ライブラリ                               |

#### 起きること

管理者が「サイト設定 → レイアウト → コンテンツ幅」を「極小(640px)」に変更して保存する。DB には LayoutWidth.XS が保存され、resolveWidthStyles は className: "mx-auto max-w-\[640px\]" を返し、article-layout.tsx:103 の `<div className={cn("min-w-0", widthStyles?.className)}>` に付く。しかし `max-w-[640px]` という文字列はソース上に静的に存在せず（`max-w-[${preset.px}px]` というテンプレートリテラルとしてしか現れない）、Tailwind v4 のスキャナは実行時の値を知り得ないため対応する CSS ルールが生成されない。実測: 既存ビルド成果物 .next/static/chunks/\*.css に含まれる arbitrary な max-w は 140/200/240/300/360/400/480/500/520/540/560px のみで、プリセットの 640/720/800/900/1024（CONTENT\_WIDTH\_PRESETS）も 900/1000/1100/1200/1400（SITE\_WIDTH\_PRESETS）も 1 つも存在しない。結果、/blog/\[slug\]・/news/\[slug\]・/terms/\[slug\] の本文幅は設定値ではなく Tailwind Typography の `prose` 既定（max-width: 65ch）のままで、XS〜XL のどれを選んでも、CUSTOM で任意 px を入れても見た目が一切変わらない。さらに管理側の PostEditor/NewsEditor/TermsInlineEditor は同じ SSoT の `.px`（数値）を resolveContentWidthPx 経由で受け取ってインラインに適用するため、エディタでは幅が変わって見える → 保存して公開ページを見ると変わっていない、という WYSIWYG 乖離になる。FULL だけは静的な `mx-auto max-w-full` を返すので唯一機能する。

#### 直し方

className でピクセル幅を表現するのをやめ、getContainerSiteCss と同じく解決済みの CSS 長さ文字列を返してインライン style（または CSS 変数）で適用する。WidthStyles は既に `style?: CSSProperties` と `px` を持っているので、preset/custom 分岐は `{ className: "mx-auto", style: { maxWidth: `${px}px` }, px }` を返し、article-layout.tsx:103 で `style={widthStyles?.style}` を渡せば済む（FULL の `mx-auto max-w-full` は静的クラスなので現状維持で可）。

#### 該当箇所

```
className: `mx-auto max-w-[${preset.px}px]`,
```

#### 到達経路

src/app/(public)/blog/\[slug\]/page.tsx → src/app/(public)/blog/\_components/post-detail-page-content.tsx:69 PostDetailPageContent → src/shared/domain/settings/queries/site.ts:40 (既定 contentWidth = LayoutWidth.MD) → src/shared/domain/settings/queries/site.ts:221-235 mergeContentLayout（override が null なので site 値 MD がそのまま残る） → src/app/(public)/blog/\_components/post-detail-page-content.tsx:123 contentWidth={layoutConfig.contentWidth} → src/app/(public)/\_shared/components/layouts/article-layout.tsx:96-98 resolveWidthStyles({width: MD, customPx: null}) → src/shared/lib/styles/layout-mapper.ts:91 FULL 不一致 → :95 CUSTOM 不一致 → :103-104 preset = CONTENT\_WIDTH\_PRESETS.MD, preset.px = 800 が truthy → src/shared/lib/styles/layout-mapper.ts:106 className = "mx-auto max-w-\[800px\]" を返す → src/app/(public)/\_shared/components/layouts/article-layout.tsx:103 \<div className={cn("min-w-0", widthStyles?.className)}\> で DOM に付与 → 誤った結果: .next/static/chunks/26dffengx-5o3.css（public surface）に "800px" が 0 件のため max-w-\[800px\] に対応する CSS ルールが存在せず、幅指定が無効。同様の経路が src/app/(public)/news/\_components/news-detail-page-content.tsx:128 と src/app/(public)/terms/\_components/terms-detail-page-content.tsx:57（TERMS\_CONTENT\_WIDTH = LayoutWidth.MD, src/shared/lib/validations/terms.ts:18）にも存在する。対照として src/shared/lib/styles/layout-mapper.ts:92 の FULL だけは静的な "mx-auto max-w-full" なので機能し、サイト全体幅は src/shared/lib/styles/layout-mapper.ts:127 getContainerSiteCss が CSS 変数を注入する別経路なので無傷。

#### 既存の検査

未捕捉。\_\_tests\_\_/ 全体に layout-mapper / resolveWidthStyles を参照するテストは 0 件（grep 実測）。\_\_tests\_\_/unit/architecture/ に Tailwind のクラス生成可能性を検査する gate は無い（tailwind/class 名の gate は csp-inline-style-hashes.test.ts のみで無関係）。仮に unit テストがあっても戻り値の文字列一致しか見られないため、CSS が生成されないこの欠陥は原理的に検出できない。Visual regression のベースラインは欠陥がある状態で採取されているため差分も出ない。tailwind.config.\* は存在せず、public.css / admin.css に @source inline(...) や safelist の指定も無い（grep 実測）。

#### 反証官による訂正

指摘は成立するが、記述に 3 点の事実誤認がある（うち 2 点は影響を過小評価している）。

【誤り1・影響を過小評価】「本文幅は Tailwind Typography の prose 既定（max-width: 65ch）のままになる」は誤り。3 つの呼び出し元すべてが `<Prose variant="editorial" className="max-w-none">` を明示している（post-detail-page-content.tsx:166 / news-detail-page-content.tsx:151 / terms-detail-page-content.tsx:74）。つまり prose の max-width は意図的に無効化されており、フォールバック先は 65ch ではなく **Container の --container-site（public.css:185 の 80rem = 1280px）** になる。実際の見た目は「800px を意図した本文が最大 1280px まで広がる」であって、指摘が書いた「65ch に収まる」よりずれ幅が大きい。

【誤り2・影響を過小評価】「管理者が XS に変えたとき」という前提が狭すぎる。既定値が MD（queries/site.ts:40）である以上、**誰も設定を触っていない状態でも既に max-w-\[800px\] が出力されて無効になっている**。/terms/\[slug\] に至っては TERMS\_CONTENT\_WIDTH = LayoutWidth.MD（validations/terms.ts:18）でハードコードされており、設定画面を一度も開かなくても常に壊れている。「設定を変えても変わらない」ではなく「最初から一度も効いたことがない」が正確。

【誤り3・カバレッジ申告】「\_\_tests\_\_/ 全体に layout-mapper / resolveWidthStyles を参照するテストは 0 件（grep 実測）」は誤り。`__tests__/unit/shared/lib/validations/terms.test.ts:10-13` が resolveWidthStyles と CONTENT\_WIDTH\_PRESETS の両方を import している。ただし assert しているのは戻り値の `.px`（同 :28-34）だけで className には一切触れないため、「この欠陥を捕捉できない」という結論自体は変わらない。grep の実測結果として不正確なだけ。

【軽微】「.next/static/chunks/\*.css に含まれる arbitrary な max-w は 140〜560px のみ」は max-w クラス名としては正しいが、CSS 全体の `max-width:` 値としては 768px も存在する（media query 由来）。結論には影響しない。

【深刻度】medium を維持する（誇張ではない）。根拠: 影響は表示のみでデータ破損・セキュリティ・例外のいずれも無く、壊れても本文が広がるだけでグレースフルに劣化するため high ではない。一方で /blog/\[slug\]・/news/\[slug\]・/terms/\[slug\] の 3 系統すべてで管理画面の「コンテンツ幅」設定が恒久的に無効であり、かつ編集画面側は LexicalEditor.tsx:171-172 の inline maxWidth で正しく効くため「エディタでは変わるのに公開すると変わらない」という WYSIWYG 乖離を生む。顧客が設定できる機能が丸ごと死んでいる以上 low では過小。

---

## 低（58 件）

### F-76

**module-reachability の import 抽出正規表現が JSDoc 例示コードを実 import として辺に加える**

<sub>[対処の記録](2026-08-12-codebase-audit-progress.md) ／ [棄却一覧](2026-08-12-codebase-audit-refuted.md)</sub>

|        |                                           |
| ------ | ----------------------------------------- |
| 深刻度 | 低                                        |
| 箇所   | `__tests__/helpers/architecture-fs.ts:41` |
| 領域   | テストの空振り（app）                     |

#### 起きること

src/shared/lib/forms/conform-action.ts:78 は JSDoc の使用例として ` * import { updateBasicInfo } from "@/shared/domain/settings/commands/site-chrome";` を含む。この行は実 import ではないが IMPORT\_SPECIFIER\_RE の `from\s+["']` に一致し、buildModuleGraph が conform-action.ts → src/shared/domain/settings/commands/site-chrome.ts の辺を張る。site-chrome.ts の実 importer は現在 src/app/(admin)/admin/(dashboard)/\_shared/actions/settings/basic.ts:21 と .../other.ts:36 の 2 本だけなので、この 2 本の import が消えた時点で site-chrome.ts は本来 orphan になるが、コメント由来の偽の辺で reachable と判定され module-reachability.test.ts の `newOrphans` は空のまま緑になり、死んだ command モジュールが本番バンドルに残り続ける。同型の解決可能な偽の辺は現時点で 6 箇所実在する（use-node-updater.ts:64 → nodes/ButtonNode、z-index.ts:18 → use-admin-z-index-layer、cache.ts:10/67 → @/shared/lib/constants、portable-text/index.ts:13 → portable-text/schema、page-hero/index.ts:7 → page-hero/schema）。

#### 直し方

extractImportSpecifiers で行/ブロックコメントを除去してから走査する（最小でも `^\s*\*` と `^\s*//` で始まる行を落とす）。それが重いなら、コメント内に import 例を書くことを禁じる側に倒すか、docstring に「コメント内の解決可能な import 例は偽の到達辺になる」と明記して .claude/rules/architecture-gates.md の『粗いなら粗いと書く』に従う。

#### 該当箇所

```
/(?:from\s+|^\s*import\s+|import\s*\(\s*)["']([^"']+)["']/gm;
```

#### 到達経路

\_\_tests\_\_/unit/architecture/module-reachability.test.ts:61 buildModuleGraph(REPO\_ROOT) → \_\_tests\_\_/helpers/architecture-fs.ts:141 readFileSync("src/shared/lib/forms/conform-action.ts")（コメント除去なし）→ :142 extractImportSpecifiers → :41 IMPORT\_SPECIFIER\_RE が src/shared/lib/forms/conform-action.ts:78 の JSDoc @example 行を実 import として捕捉 → :146 resolveModuleSpecifier が @/shared/ alias で kind:"internal" / relPath="src/shared/domain/settings/commands/site-chrome" を返す（:90-97、コメント由来かの分岐は無い）→ :149 resolveToExistingFile が実在ファイル src/shared/domain/settings/commands/site-chrome.ts に解決（:114-116）→ :154 targets.push で偽の辺が確定 → module-reachability.test.ts:95 findReachableFiles が reachable な conform-action.ts 経由で site-chrome.ts を reachable に入れる（architecture-fs.ts:176-179）→ :99 orphans から漏れる → :116 newOrphans が \[\] のまま → :118 expect 緑。誤った結果の実測: 実 importer である src/app/(admin)/admin/(dashboard)/\_shared/actions/settings/basic.ts:21 と .../other.ts:36 の辺だけを落として BFS を回すと、site-chrome.ts は実 import 0 本にもかかわらず reachable=true（scratchpad の probe2.ts 実行結果: "site-chrome reachable (after deleting BOTH real imports): true"）。

#### 既存の検査

module-reachability.test.ts:76-92 の sanity テストは「解決できない」コメント由来 specifier だけを KNOWN\_DOC\_COMMENT\_FALSE\_POSITIVES（2 件）として扱っており、解決できてしまうコメント由来 specifier（＝偽の到達判定を作る側）は検査も文書化もされていない。docstring（:1-15）も module 単位の到達不能を 0 件にすると書くだけで、この方向の粗さに触れていない。

#### 反証官による訂正

機構は本物だが、指摘文の被害記述と裏付けリストに 3 点の不正確がある。

(1) 現時点の実害はゼロ。「死んだ command モジュールが本番バンドルに残り続ける」は現状の記述ではなく反実仮想。生 regex 版と コメント除去版で orphan 集合を実測比較したところ、どちらも \[\] で完全一致し、コメント由来の辺に隠されている orphan は現在 0 件（"MASKED BY COMMENT EDGES: \[\]"）。gate は今日、正しい答えを出している。指摘が本当に示しているのは「gate の精度に将来効く false-negative チャネルがある」であって、既存の緑が嘘だという話ではない。

(2) 「解決できてしまうコメント由来 specifier は検査も文書化もされていない」は半分誤り。regex がコメントを除去しないこと自体は module-reachability.test.ts:79-81 に同じ原因で明記されている（「regex ベースの抽出はコメントを除去しないため、JSDoc の使用例コードに書かれた import 文も拾ってしまう（実 import ではない）」）。未文書なのは「解決できてしまう側は到達判定を汚す」という帰結のほうで、粗さの存在自体は既知として扱われている。.claude/rules/architecture-gates.md の「粗いなら粗いと docstring に書く」に対する差分は、この帰結の 1 文だけ。

(3) 「同型の偽の辺は 6 箇所」は数え方が不正確。実測した非 self-loop の偽の辺は 5 本（conform-action.ts→site-chrome.ts、use-node-updater.ts→nodes/ButtonNode.ts、z-index.ts→use-admin-z-index-layer.ts、constants/cache.ts→constants/index.ts、portable-text/index.ts→portable-text/schema.ts）。指摘が挙げた page-hero/index.ts:7 → page-hero/schema は含まれない — 同ファイル :13-19 に実コードの `export { ... } from "./schema";` があり、コメント由来の辺は実在する辺の重複で到達性を一切増やさない。また z-index.ts / constants/index.ts / conform-action.ts / serialize.ts では self-loop も生成されるが、これは到達性に無害。将来 orphan を隠しうる候補は実質 4 モジュール（site-chrome.ts / ButtonNode.ts / use-admin-z-index-layer.ts / portable-text/schema.ts）に限られ、いずれも今は実 import で独立に到達している。

以上より severity は自己申告どおり low が妥当。修正するなら extractImportSpecifiers にコメント除去を足すのが筋だが、費用対効果は「JSDoc @example に import を書いたモジュール 4 件だけが orphan 検知を 1 段すり抜けうる」に見合うかで判断すべきで、最小の是正は module-reachability.test.ts の docstring に「解決できるコメント由来 specifier は偽の到達辺を作るため、この gate の到達判定はその分だけ緩い」と 1 文足すこと。

---

### F-77

**数値列の母集合が BigInt を落とし、AuditLog.sequence が実際に無制約のまま緑**

<sub>[対処の記録](2026-08-12-codebase-audit-progress.md) ／ [棄却一覧](2026-08-12-codebase-audit-refuted.md)</sub>

|        |                                                  |
| ------ | ------------------------------------------------ |
| 深刻度 | 低                                               |
| 箇所   | `__tests__/support/numeric-column-domains.ts:82` |
| 領域   | gate（DB）                                       |

#### 起きること

prisma/schema.prisma:2143 の ` sequence BigInt @unique`（AuditLog.sequence）はこの正規表現に一致しない（`\w+` の後の `\s+` を挟んで `Int|Float|Decimal` を要求するため `BigInt` の先頭 `B` で外れる）。結果この列は COLUMNS に入らず、NUMERIC\_COLUMN\_DOMAINS にも UNBOUNDED\_NUMERIC\_COLUMNS にも載っていないのに `numeric-column-domains.test.ts:99`「すべての数値列が CHECK に覆われている」が緑になる。実際 prisma/baseline/invariants.sql に audit\_logs 向け CHECK は 6 本あるが sequence を縛るものは 1 本も無い（chain\_version / entry\_hash / hash\_algorithm / hash\_key\_id / metadata / previous\_hash のみ）。同じ形で新しい列を `amountMinor BigInt` / `sizeBytes BigInt` のように足すと、値域 CHECK を 1 行も書かずに gate は緑のまま通過する — この gate の docstring が「免除リストではなく列の全体を母集合にする。列を足せば分類するまで赤になり、『宣言し忘れ』が『黙って対象外』に化けない」と主張している不変条件が、Int/Float/Decimal 以外の数値型では成立していない。

#### 直し方

decl の型リストに `BigInt`（必要なら `Bytes` を除く残りの数値型）を足し、AuditLog.sequence を NUMERIC\_COLUMN\_DOMAINS（positive = 1 始まりの連番）か UNBOUNDED\_NUMERIC\_COLUMNS のどちらかへ分類する。型名を列挙し続けたくないなら「モデル名・enum 名・String/Boolean/DateTime/Json/Bytes 以外は数値」と反転して母集合を作る（新しい数値型が増えても自動で入る）。

#### 該当箇所

```
const decl = /^\s*(\w+)\s+(Int|Float|Decimal)(\[\])?\??\s*(.*)$/u.exec(
```

#### 到達経路

\_\_tests\_\_/unit/architecture/numeric-column-domains.test.ts:58 (const COLUMNS = readNumericColumns()) → \_\_tests\_\_/support/numeric-column-domains.ts:43 readNumericColumns() → 同 :82 の decl 正規表現が (Int|Float|Decimal) のみ受理 → prisma/schema.prisma:2143 `sequence BigInt @unique` が非マッチ（実行確認: Int 84 / Float 2 は収集、BigInt 1 のみ脱落、COLUMNS.length = 86） → \_\_tests\_\_/unit/architecture/numeric-column-domains.test.ts:100-107 の unprotected は COLUMNS 由来なので AuditLog.sequence を候補にすら入れない → prisma/baseline/invariants.sql:36-41 に audit\_logs の CHECK は 6 本あるが sequence を縛るものは無い（prisma/migrations/00000000000000\_init/migration.sql の定義も素の `"sequence" BIGINT NOT NULL` で identity/default 無し） → 同 test.ts:99「すべての数値列が CHECK に覆われている」が緑のまま

#### 既存の検査

\_\_tests\_\_/unit/architecture/numeric-column-domains.test.ts:90 の自己検査は `COLUMNS.length > 70` と Reservation.taxRate の 1 本だけを見るので、型の取りこぼしでは落ちない。\_\_tests\_\_/integration/prisma/numeric-column-domains.test.ts は NUMERIC\_COLUMN\_DOMAINS に載った列の境界値しか流さないため、載っていない列は同じく見えない。

#### 反証官による訂正

medium → low へ補正。事実は正しいが影響の見積もりが過大。

\1. 現在の露出は 1 列だけ。schema 全体で BigInt は `AuditLog.sequence` のみ（Int 84 / Float 2 / BigInt 1 を実測）。指摘が挙げる `amountMinor BigInt` / `sizeBytes BigInt` は現存しない仮定の列で、既存の `InquiryAttachment.sizeBytes` / `Media.size` はいずれも Int として宣言済み・nonNegative で覆われている。

\2. その 1 列の危険度も、gate の docstring が並べる例（rating / latitude / tax rate = 顧客に直接見える値）とは性質が違う。audit\_logs は append-only（UPDATE/DELETE を trigger が拒否、invariants.sql:652-654）で、sequence を書くのはサーバ側の chain 生成コードだけ。外部入力が直接届く列ではないので「無制約のまま」の実害は今のところ潜在的。

\3. 事実誤認 1 件: 「helper が黙って絞っている」わけではない。`__tests__/support/numeric-column-domains.ts:34` の docstring は収集対象を「schema.prisma の Int / Float / Decimal 列を物理名つきで集める」と明示している。矛盾しているのは `__tests__/unit/architecture/numeric-column-domains.test.ts:23-26` 側の「列の全体を母集合にする」という記述で、これは docstring 間の不整合。指摘本文はこの区別をせず helper 側の主張として引用している。

\4. main / 本番への漏れは無い。既存の欠陥ではなく gate の網羅漏れなので、`.claude/rules/architecture-gates.md` の「gate を足すのは実際に起きた欠陥に対してだけ」には当たらない（新設ではなく既存 gate の 1 トークン修正）。

修正は小さいが no-op ではない: 82 行目を `(Int|BigInt|Float|Decimal)` にすると gate は即座に赤くなり、`AuditLog.sequence` を NUMERIC\_COLUMN\_DOMAINS（positive 相当）+ CHECK 追加 migration + invariants.sql 再生成 で分類するか、理由つきで UNBOUNDED\_NUMERIC\_COLUMNS に載せるまで通らない。赤くなること自体が穴が実在する証拠でもある。なお `UNBOUNDED_NUMERIC_COLUMNS` は現在空リストとして維持されているので、後者を選ぶなら「空であるべきリスト」という宣言（同ファイル 436-443）との整合を別途判断する必要がある。

---

### F-78

**webhook 境界 mock の `latestRefund` 型が `metadata` を落としており、返金 attribution 復元に assertion が 1 つも無い**

<sub>[対処の記録](2026-08-12-codebase-audit-progress.md) ／ [棄却一覧](2026-08-12-codebase-audit-refuted.md)</sub>

|        |                                                 |
| ------ | ----------------------------------------------- |
| 深刻度 | 低                                              |
| 箇所   | `__tests__/unit/api/stripe-webhook.test.ts:104` |
| 領域   | 決済テストの共有 mock                           |

#### 起きること

app 側の返金（admin 返金 / AUTO\_ON\_CANCEL / AUTO\_CAPACITY\_RACE / AUTO\_AMOUNT\_MISMATCH）は Stripe refund に `metadata.initiator` を仕込む。webhook が先着したときはその値から RefundedByType を復元する設計だが、handleChargeRefunded が metadata の転送をやめる（例: latestRefund の組み立てを id/amount だけの helper に抽出する）と、`latestRefund.metadata?.["initiator"]` が undefined になり **すべての返金が STRIPE\_DASHBOARD として記録される**。監査ログ・返金理由表示・「誰が返金したか」の集計が全件誤る。この変更で赤くなるテストは 1 本も無い — 境界 mock の型に metadata が無く、fixture も metadata を作らないため、`toHaveBeenCalledWith` でも検出できない。

#### 直し方

mockApplyChargeRefundIdempotent の input 型を `ChargeRefundLatestRefund` の import に置き換え（`import type { ChargeRefundLatestRefund } from "@/shared/domain/payment/payment-claim-orchestration"`）、makeChargeRefundedEvent が metadata を渡せるようにしたうえで、`metadata: { initiator: "ADMIN" }` 付き payload で `toHaveBeenCalledWith(expect.objectContaining({ latestRefund: expect.objectContaining({ metadata: { initiator: "ADMIN" } }) }))` を 1 本足す。合わせて applyStripeChargeRefundIdempotent 自体の単体テスト（createRefundRecord / updatePaymentStatus を注入するだけで書ける純粋な形）を 1 本置く。

#### 該当箇所

```
latestRefund: { id: string; amount: number } | null;
```

#### 到達経路

\_\_tests\_\_/unit/api/stripe-webhook.test.ts:1077 (charge.refunded テスト) → src/shared/domain/payment/stripe-webhook/dispatch.ts:40 → src/shared/domain/payment/stripe-webhook/charge-refunded.ts:52-61 (ここで `metadata: latestRefundData.metadata` を削除する変異を加える。payment-claim-orchestration.ts:164 が optional 宣言のため type-check は通過) → charge-refunded.ts:66 applyChargeRefundIdempotent → src/shared/domain/reservations/payment-queries.ts:361 → src/shared/domain/payment/payment-claim-orchestration.ts:189 `const initiatorMeta = latestRefund.metadata?.["initiator"]` が undefined → :190-192 isValidRefundedByType(undefined) が false → REFUNDED\_BY\_TYPE.STRIPE\_DASHBOARD へ fallback → :194-198 createRefundRecord が誤った refundedByType で Refund 行を作成 → 後続 src/shared/domain/payment/stripe-webhook/refund-status-updated.ts:74 が entity.refundedByType を読み戻す → src/shared/domain/reservations/payment-queries.ts:495-499 で isAutomatedFullRefund=false となり、AUTO\_\* 用の「入口 paymentStatus を問わず無条件 REFUNDED」分岐 (:506) ではなく累積額判定分岐に落ちる。この変異で赤くなるテストは 0 本 (assertion は stripe-webhook.test.ts:1101/1124/1147/1176 の 4 箇所すべてが metadata を含まない完全一致リテラル)。

#### 既存の検査

`applyChargeRefundIdempotent` / `applyEventChargeRefundIdempotent` は \_\_tests\_\_ 全体で 8 箇所ヒットするが**すべて mock.module の差し替え側**で、実装本体を呼ぶテストは 0 本（payment-kernel.test.ts は describe が "payment/payment-status-guards" の 1 つだけで applyStripeChargeRefundIdempotent に触れない）。`initiator` を assert しているのは stripe-refund-orchestration.test.ts:82 と integration/domain/events/refund-command.test.ts:381 の 2 本だけで、どちらも Stripe へ**送る**側の metadata であって webhook で**復元する**側ではない。makeChargeRefundedEvent の options も `latestRefund?: { id: string; amount: number } | null`（同ファイル 479）で metadata を作れない。

#### 反証官による訂正

2 点の事実誤認を補正する。(1) 見出しの因果が誤り。「境界 mock の型に metadata が無いから toHaveBeenCalledWith でも検出できない」は機構の誤診断。同じ 104 行の型は `currency` も落としているが、currency は 1101/1176 で現に assert され検出される — mock.module の wrapper (:242-248) が input オブジェクト全体をそのまま転送し、toHaveBeenCalledWith は型ではなく実行時の値を比較するため、型注釈は検出可否に一切影響しない。真の欠落は「fixture が metadata を作らず assertion が存在しない」ことだけで、型を直しても何も検出されるようにはならない (fixture と assertion の追加が必要)。(2) 失敗シナリオの blast radius が誇張。「すべての返金が STRIPE\_DASHBOARD として記録される」「全件誤る」は誤り。app 側 refund path は Stripe 呼出と同一フローで Refund 行を書くため、通常順序では webhook 側の createRefundRecord が Refund.stripeRefundId の P2002 に当たり payment-claim-orchestration.ts:199-202 で握り潰される (app が書いた正しい attribution が残る)。誤るのは webhook が app の行書込に先着した race の分だけで、Stripe ダッシュボード発の返金は元々 STRIPE\_DASHBOARD が正しい。加えて、この指摘は現存する欠陥ではなく仮想的な refactor に対する mutation 検出力の欠如であり、CLAUDE.md の「新しい gate を足すのは実際に起きた欠陥に対してだけ」に照らせば任意対応。修正するなら makeChargeRefundedEvent の options に metadata を通し、initiator 復元を assert する 1 本を足すだけで閉じる (型 104 行の更新は付随的)。

---

### F-79

**required check の path filter gate が block 形式の `paths:` しか検出せず、事故の原型である flow 形式 `paths: [terraform/**]` を見逃す**

<sub>[対処の記録](2026-08-12-codebase-audit-progress.md) ／ [棄却一覧](2026-08-12-codebase-audit-refuted.md)</sub>

|        |                                                       |
| ------ | ----------------------------------------------------- |
| 深刻度 | 低                                                    |
| 箇所   | `__tests__/unit/architecture-boundaries.test.ts:1642` |
| 領域   | gate 本体                                             |

#### 起きること

`.github/workflows/terraform.yml` の `on:` を `on:\n pull_request:\n paths: [terraform/**]` へ戻す（CI 予算削減の名目で最も書かれやすい 1 行形式で、terraform.yml:9 と actionlint.yml:5 のコメントが再発防止対象として名指ししている綴りそのもの）。この行は `paths:` の後に ` [terraform/**]` が続くため `\s*$` が成立せず regex にヒットしない。offenders は空のまま gate は緑。terraform 以外を触る PR で `Terraform / validate` が発火せず required check が MISSING になり、branch protection が auto-merge を永久 block する（2026-07-14 PR #1103 と同一障害）。復旧は workflow を直して push し直すまで不可能。

#### 直し方

1642 行を `/^\s+paths(-ignore)?:/mu`（行末条件を外す）にするか、`Bun.YAML.parse` で `on` を構造として読んで `paths` / `paths-ignore` キーの有無を見る（`workflow-shell-pipefail.test.ts:76` が既に `Bun.YAML.parse` を使っており依存は増えない）。合わせて `paths: [terraform/**]` と block 形式の 2 本を fixture 入力として判定関数に通し、両方が検出されることを固定する。

#### 該当箇所

```
if (/^\s+paths(-ignore)?:\s*$/mu.test(onBlock)) {
```

#### 到達経路

\_\_tests\_\_/unit/architecture-boundaries.test.ts:1587 (test entry) → :1605-1619 reads .github/branch-protection.json:12-13 into requiredNames {"Terraform / validate", "Validate GitHub Actions workflows"} → :1622-1624 enumerates .github/workflows/\*.yml → :1631-1634 extracts 4+-space-indented job names; .github/workflows/actionlint.yml:28 ` name: Validate GitHub Actions workflows` matches requiredNames → :1635 `if (providedRequired.length === 0) continue` does NOT fire → :1640-1641 slices onBlock, which for a mutated actionlint.yml:18-19 yields `" push:\n branches: [main]\n pull_request:\n branches: [main]\n paths: [.github/workflows/**, .github/actions/**]\n\n"` (verified by running the same regex) → :1642 `/^\s+paths(-ignore)?:\s*$/mu` returns FALSE because ` [.github/workflows/**, ...]` follows the colon so `\s*$` cannot anchor → :1643-1646 push is skipped, offenders stays \[\] → :1648 `expect(offenders).toEqual([])` passes green. Same chain with .github/workflows/terraform.yml:65 / :20 and `paths: [terraform/**]` → onBlock `" pull_request:\n paths: [terraform/**]\n\n"`, flagged=false.

#### 既存の検査

actionlint（required check の 1 つ）は YAML/式の構文検査で、branch protection との整合という方針は見ない。`ci-workflow-contract.test.ts` / `ci-workflow.test.ts` にも paths filter の検査は無い。現状はどの workflow にも `paths:` が無いため（`grep -rn paths .github/workflows/` の結果はすべてコメント行）、この gate は今日は空振り状態で、regex の狭さが露見しない。

#### 反証官による訂正

Two factual corrections to the report. (1) The chosen example is the weaker of the two. For terraform.yml the scenario is largely self-limiting: the PR that adds `paths: [terraform/**]` edits `.github/workflows/terraform.yml`, which does NOT match `terraform/**`, so `Terraform / validate` goes MISSING on that very PR and branch protection blocks it before it can reach main. The reachable-to-main variant is actionlint.yml, whose documented anti-pattern filter `[.github/workflows/**, .github/actions/**]` (actionlint.yml:5) matches the file being edited — that PR runs green, merges, and only then starves every later non-workflow PR of "Validate GitHub Actions workflows". The report should have named actionlint.yml. (2) "復旧は workflow を直して push し直すまで不可能" is stated as if unrecoverable; it is blocked-until-fixed by a one-line workflow edit, and the symptom is loud (a named required check visibly MISSING on the PR), not silent corruption. Severity lowered medium→low: no current breakage (grep confirms every `paths` occurrence in .github/workflows/ today is a comment line, so the gate is vacuous), no product/data impact, and the trigger requires a human deliberately reintroducing an anti-pattern warned about in three separate places. It is still worth fixing because it violates the repo's own "gate must reproduce the original defect shape" rule and the fix is one line — either drop the `$` anchor to `/^\s+paths(-ignore)?:/mu`, or reuse the `.not.toContain("paths:")` form already used at deploy-production-workflow.test.ts:115-116. Note the gate also has no fixture proving it can fail (per .claude/rules/architecture-gates.md), which is why the narrowness went unnoticed — a mutation check would have caught it.

---

### F-80

**import{} block 必須判定の母集合が `google_*` 決め打ち配列で、Cloudflare resource は永久に検査されない（既に 1 件が import 無しで存在）**

<sub>[対処の記録](2026-08-12-codebase-audit-progress.md) ／ [棄却一覧](2026-08-12-codebase-audit-refuted.md)</sub>

|        |                                                       |
| ------ | ----------------------------------------------------- |
| 深刻度 | 低                                                    |
| 箇所   | `__tests__/unit/architecture-boundaries.test.ts:1331` |
| 領域   | gate（本番インフラ）                                  |

#### 起きること

この gate は「resource を宣言したら同一 file に `import {}` を書け」を強制するが、判定対象は 1331-1349 行の 17 個の `google_*` type だけで、それ以外は 1362-1368 行の `continue` で無条件に素通りする。実際に terraform/cloudflare\_r2.tf:39 の `resource "cloudflare_r2_bucket" "myrrh_rental_space_inquiries"` は対応する import block を持たない（同 file の import block は :15-18 の `myrrh_rental_space` 1 件のみ、コメント :36 が「新規 bucket のため import block は不要」と書いた当時のまま）。この bucket は既に本番に存在する（terraform/variables.tf:172 で `R2_INQUIRIES_BUCKET_NAME` を Cloud Run に pin 済み）。tfstate 消失後の再 apply（この gate の JSDoc :1310-1316 と secrets.tf:66-78 / cloud\_scheduler.tf:184-188 が繰り返し警戒しているシナリオ）で Terraform は import ではなく create を試み、Cloudflare が既存 bucket 名で衝突エラーを返して `terraform apply` が abort、Deploy Production の terraform 段が止まる。手で import するまでデプロイ不能。新しい type（`google_monitoring_alert_policy`、`cloudflare_r2_custom_domain` など）を足したときも同様に永久に無検査。

#### 直し方

母集合を allowlist から反転させる — 全 `resource "..."` を対象にし、「import 不要」と判断した type だけを理由つきの EXEMPT 配列（現状の `*_iam_member` 系）に置く。あわせて terraform/cloudflare\_r2.tf の `myrrh_rental_space_inquiries` に `import { to = cloudflare_r2_bucket.myrrh_rental_space_inquiries, id = "${var.cloudflare_account_id}/myrrh-rental-space-inquiries/default" }` を追加する。

#### 該当箇所

```
const IMPORT_REQUIRED_RESOURCE_TYPES: readonly string[] = [
```

#### 到達経路

\_\_tests\_\_/unit/architecture-boundaries.test.ts:1354 (terraform/\*.tf 全件ループ) → :1359 resourceDeclRe が terraform/cloudflare\_r2.tf:39 の `resource "cloudflare_r2_bucket" "myrrh_rental_space_inquiries"` を捕捉 → :1362-1368 `IMPORT_REQUIRED_RESOURCE_TYPES.includes("cloudflare_r2_bucket")` が false (母集合 :1331-1349 は google\_\* 17 件のみ) → `continue` で offender 未記録 → :1385 `expect(offenders).toEqual([])` が緑。補完経路も無し: :1388 の Cloudflare gate は :1462 `for (const block of importBlocks)` と :1466 `if (!toMatch || !idMatch) continue` により import block 側からしか走査せず、import block が存在しない resource には到達しない。結果として terraform/cloudflare\_r2.tf:39 が terraform/cloud\_scheduler.tf:184-188 および terraform/secrets.tf:72-74 が必須と明記する 段階 B 契約に違反したまま無検知で固定され、tfstate rebuild 時に terraform は既存 bucket を adopt せず create を試みる。

#### 既存の検査

terraform 全 .tf を走査する gate は architecture-boundaries.test.ts:1309（本件）と :1388、:1217 の 3 本。うち import block の存在を要求するのは本件のみ。deploy-packaging-contract.test.ts:196 は cron\_jobs↔imported\_cron\_jobs だけを両方向で照合しており、resource 一般には効かない。

#### 反証官による訂正

medium → low に補正。理由: (a) 発火には tfstate 消失という稀な事象が必要で、state bucket は scripts/bootstrap-terraform.sh:147-150 で versioning ON のため一次復旧は state restore であり、再 apply はその後段。(b) 発火時の被害は resource 1 件で、復旧は import block 1 行の追加か手動 `terraform import` で済む。爆風半径は限定的。事実誤認の補正: (1) 指摘は「gate 母集合が google\_\* 決め打ちで Cloudflare が永久に未検査」を主見出しに置くが、この gate は test 名・JSDoc (:1309, :1315-1316) が自ら "pre-existing **GCP** resource" と範囲宣言しており、Cloudflare を見ないこと自体は設計通りで欠陥ではない。実際の欠陥は「terraform/cloudflare\_r2.tf:39 の 段階 B follow-up が未実施」という 1 件の構成漏れであり、gate 母集合の拡張はその副次的な再発防止策 (CLAUDE.md の「gate は実際に起きた欠陥に対してだけ」には合致する — 欠陥は実在するため)。主たる修正は import block 1 行であって gate の書き換えではない。(2) 「この bucket は既に本番に存在する（terraform/variables.tf:172 で R2\_INQUIRIES\_BUCKET\_NAME を Cloud Run に pin 済み）」は根拠が誤り。variables.tf:172 が pin しているのは Secret Manager の secret version ("1") であって bucket の存在ではない。正しい根拠は PR #1476 (95f344b35) が import block 無しで resource を宣言し、以降の deploy が緑＝`terraform apply` が bucket を create 済みであること。結論は変わらない。(3) 「Cloudflare が既存 bucket 名で衝突エラーを返して terraform apply が abort」の最終段だけは本 repo からは確定できない (terraform provider は node\_modules に無い)。ただし被害モデル自体は cloud\_scheduler.tf:184-188 が repo の SSoT として明記しており、同 file の姉妹 bucket `myrrh_rental_space` が create ではなく import で adopt されている事実も同じ前提に立つ。(4) 「新しい type を足したときも永久に無検査」は allowlist 型 gate 一般の性質で、google\_\* 側にも同じことが言える。これ自体は独立した欠陥ではない。

---

### F-81

**page-header 折り返し gate の母集合が class の並び順に依存する（並べ替えた新ページは永久に無検査）**

<sub>[対処の記録](2026-08-12-codebase-audit-progress.md) ／ [棄却一覧](2026-08-12-codebase-audit-refuted.md)</sub>

|        |                                                                         |
| ------ | ----------------------------------------------------------------------- |
| 深刻度 | 低                                                                      |
| 箇所   | `__tests__/unit/architecture/admin-page-header-actions-wrap.test.ts:68` |
| 領域   | gate（UI / CSP）                                                        |

#### 起きること

headerBlocks() は開始タグにこの**文字列が完全一致で含まれる**ことを母集合の入口条件にしている（170 行 `.includes(HEADER_CLASSNAME)`）。Tailwind のクラス順序は意味を持たず、この repo は prettier-plugin-tailwindcss を入れていない（.prettierrc.json / package.json に無い）ので順序は誰も正規化しない。新しい管理ページを `<div className="flex flex-col gap-4 sm:items-center sm:flex-row sm:justify-between">` と書くと（items-center と flex-row が入れ替わっただけ）、そのヘッダーは母集合に入らず、直下の `<div className="flex gap-2">` に flex-wrap が無くても violations は空。headerCount も既存 29 箇所ぶん残るので下限 `>= 15` は通り、gate は完全に緑。docstring が「3 回別々に修正されている」と書いた 390px 横溢れ（run 30631098725 実測: htmlScrollWidth 519 / client 390）がそのまま再発する。同様に、操作列側の ACTION\_CLASSNAME (83 行 `/className=\{?"(?=[^"]*\bflex\b)(?=[^"]*\bgap-2\b)[^"]*"/u`) も二重引用符リテラルしか見ないため、`<div className={cn("flex gap-2", extra)}>` と書けば同じく無検査になる。fixture 9 本はすべて `HEADER_OPEN`（= 定数そのもの）を使うので、入口条件を変異させる見本が 1 本も無い。

#### 直し方

入口条件を文字列一致から「クラス集合の包含」に変える（`flex`・`flex-col`・`gap-4`・`sm:flex-row` を個別に照合）。ACTION\_CLASSNAME も `cn()` の引数を結合した値に対して判定する。加えて fixture に「並び順違いのヘッダー」「cn() で組んだ操作列」を落ちるべき形として足す。

#### 該当箇所

```
const HEADER_CLASSNAME = "flex flex-col gap-4 sm:flex-row sm:items-center";
```

#### 到達経路

\_\_tests\_\_/unit/architecture/admin-page-header-actions-wrap.test.ts:268 (実走査 test) → :246 listAdminDashboardFiles() が glob "src/app/(admin)/admin/(dashboard)/\*\*/\*.tsx" で 719 ファイルを列挙 → :228 headerBlocks(readSource(file)) → :170 `source.slice(token.start, token.after).includes(HEADER_CLASSNAME)` が開始タグの literal 部分文字列一致で母集合を決定 → 新規ページ `<div className="flex flex-col gap-4 sm:items-center sm:flex-row sm:justify-between">` は :68 の定数と部分文字列一致しないため false → :171 `continue` でブロックごと破棄（:191 childTags も :199 hasH1 も評価されない）→ :231 headerCount が加算されない → :237 violations に追加されない → :273 `expect(violations).toEqual([])` 通過、:284 `expect(headerCount).toBeGreaterThanOrEqual(15)` も既存 19 で通過 → 直下の flex-wrap 無し操作列（390px で横溢れ）が無検査のまま緑。

副次経路（母集合には入るが操作列を見逃す）: :233 childTags ループ → :234 `ACTION_CLASSNAME.exec(tag)` → :83 の `/className=\{?"…/u` が `className=` + 省略可の `{` + `"` しか受け付けないため `className={cn("flex gap-2", extra)}` は null → :235 `continue` → violations 空。

#### 既存の検査

e2e/authenticated/admin/responsive-shell.spec.ts が実測で拾うが、docstring どおり opt-in の広域 run でしか回らない

#### 反証官による訂正

medium → low。機構は正しいが、指摘は影響と現状カバレッジを誇張している。

【事実誤認 1】「headerCount も既存 29 箇所ぶん残る」は誤り。実測 headerCount は **19**（docstring :283 の「実測 19 箇所」と一致、私の probe 出力も 19）。クラス文字列を含むファイルは 30 だが、うち 1 件は公開側の cookie-consent-banner.tsx（glob 外）、残り 29 のうち 10 件は h1 を持たない filter bar / loading skeleton で :230 が除外する。下限 15 に対する余裕は 14 ではなく **4 ヘッダーぶん**しかない。

【事実誤認 2】「E2E は opt-in の広域 run でしか回らない」だけでは不正確で、機械強制が 1 段ある。`__tests__/unit/architecture/e2e-admin-responsive-a11y-coverage.test.ts:27-37` が `urls` の \*\*admin\* キー全件\*\*を responsive-shell.spec.ts に `urls.<key>` として出現させることを強制しており、`e2e/authenticated/admin/responsive-shell.spec.ts:56-138` の expectNoPageHorizontalOverflow は htmlScrollWidth / bodyScrollWidth を 390px で実測する。この層は**クラス順序にも cn() にも一切依存しない**ので、本指摘の失敗形をそのまま捕まえる。残る穴は「新ページが urls キーを貰うこと」を強制する gate が無い点だけで、`e2e-admin-url-fixtures.test.ts:31` は urls→page の存在方向しか見ておらず page→urls の逆方向は見ていない。つまり二重防御は「実運用上は効くが機械強制ではない」が正確な記述。

【指摘が触れていない緩和】admin の**詳細ページは構造的に免疫**。`src/app/(admin)/admin/(dashboard)/_shared/components/AdminDetailLayout.tsx` が操作列を `flex flex-wrap items-center gap-2` でハードコードしており、ここを通る限り regress しえない。手書きヘッダーは一覧系ページに限られる。

【深刻度】最悪の結果は内部管理画面 1 ページの mobile 横スクロール（外観・操作性）であって、正しさ・セキュリティ・データ整合性への影響は無い。現時点で違反インスタンスは 0 件（REAL violations=\[\]）で、これは純粋に将来形の指摘。既存 30 箇所がバイト単位で同一順序という事実は、実際にはコピペ運用が守られていることを示す。

【残る妥当な部分】(a) :81 が ACTION\_CLASSNAME を「並び順に依存しない」と明記する一方、:56-62 の「走査の限界」節が **母集合の入口条件 :170 は順序依存**であることを書いていない非対称性、(b) fixture 9 本すべてが HEADER\_OPEN をそのまま使うため入口条件に変異検査が無いこと。修正するなら ACTION\_CLASSNAME と同じ lookahead 方式（`flex` / `flex-col` / `gap-4` / `sm:flex-row` / `sm:items-center` を順不同で要求）に揃えるのが最小、それが過剰なら docstring に 1 行「入口は literal 一致なので house pattern の並び順を変えると外れる」と書くだけでも repo 規約（.claude/rules/architecture-gates.md「粗いなら粗いと docstring に書く」）は満たす。いずれも任意対応でよい水準。

---

### F-82

**CSP prelude gate の「数え漏らしていない」判定が、先頭が `next build` の script を数えない**

<sub>[対処の記録](2026-08-12-codebase-audit-progress.md) ／ [棄却一覧](2026-08-12-codebase-audit-refuted.md)</sub>

|        |                                                                 |
| ------ | --------------------------------------------------------------- |
| 深刻度 | 低                                                              |
| 箇所   | `__tests__/unit/architecture/csp-nonce-prelude-gate.test.ts:65` |
| 領域   | gate（UI / CSP）                                                |

#### 起きること

この gate の唯一の役目は「`next build` を走らせる entry point が増えたら BUILD\_SCRIPTS に足させ、`bun scripts/check-static-prelude-empty.ts` を必ず通させる」こと。ところが母集合の抽出正規表現は先頭に**半角スペースを要求する**ため、コマンド文字列が `next build` で始まる script を 1 件も拾わない。例えば package.json に `"build:ci": "next build --experimental-build-mode compile"` を足すと、runsNextBuild は今と同じ `["build", "build:skip-env:next"]` のままなので `expect(runsNextBuild).toEqual([...BUILD_SCRIPTS].sort())` は緑、その新 entry point の per-script test も BUILD\_SCRIPTS に無いので実行されない。結果、prelude gate を一度も通さないビルド成果物が出荷可能になる。これは docstring が記録している実害そのもの（`global-not-found.tsx` が `○ (Static)` だった間、`/_not-found` が nonce 無しの `<script>` を 13 本抱えた静的 HTML を配信し、本番 404 ページの JS が strict-dynamic で全ブロックされた）を再現する経路。現行 2 script はどちらも `&& next build &&` / `SKIP_ENV_VALIDATION=true next build &&` の形なので前置スペースがあり、今日は偶然一致している。

#### 直し方

先頭一致も拾う形にする（例: `/(^|\s)next build(\s|$)/u`）。`&&next build` のような空白なし連結も拾いたいなら `/(?:^|[\s&|;])next build(?:\s|$)/u`。

#### 該当箇所

```
.filter(([, command]) => / next build(\s|$)/u.test(command))
```

#### 到達経路

package.json:9 の scripts に `"build:ci": "next build --experimental-build-mode compile"` を追加 → \_\_tests\_\_/unit/architecture/csp-nonce-prelude-gate.test.ts:64 `Object.entries(scripts)` が母集合を作る → :65 `/ next build(\s|$)/u` が先頭の半角スペースを要求して false（実測確認済み）→ :66-67 `runsNextBuild` は `["build","build:skip-env:next"]` のまま → :70 `expect(runsNextBuild).toEqual([...BUILD_SCRIPTS].sort())` が緑（数え漏らし検出が空振り）→ :54 のループは :31 `BUILD_SCRIPTS` だけを回るため、新 entry point に対する `expect(command).toContain(GATE_SCRIPT)`（:59）が一度も実行されず、`bun scripts/check-static-prelude-empty.ts` を含まない build 経路が無検査で残る。修正は 1 箇所、:65 を `/(?:^|\s)next build(?:\s|$)/u` にするだけ。

#### 既存の検査

このファイル自身が唯一の検査。scripts/check-static-prelude-empty.ts は build script から呼ばれる側で、自分が呼ばれているかは検査しない。CI も `bun run build` を叩くだけで entry point の網羅は見ていない

#### 反証官による訂正

high は過大。実害の申告「prelude gate を一度も通さないビルド成果物が出荷可能になる」は、現行ツリーでは成立しない。(1) 現時点の欠陥はゼロ。runsNextBuild は今日も正しく `["build","build:skip-env:next"]` を返し、テストは正当に緑（偽陽性でも偽陰性でもない）。混入するのは将来の追記時のみ。(2) 出荷経路は package.json の script 名では選ばれない。成果物を作るのは Dockerfile:114 の `bun run build`（cloudbuild は `--target=runner/migrator`）と .github/workflows/ci.yml:693 `bun run build` / :415,:553,:870,:953 `bun run build:skip-env:prepared` だけで、いずれも gate を含む既存 2 entry point に到達する。新 script を足しただけでは何も出荷されず、出荷させるには Dockerfile か ci.yml を別途書き換える必要がある。しかも CI 側は \_\_tests\_\_/unit/architecture/ci-workflow-contract.test.ts:120,137,139 が `run: bun run build` / `run: bun run build:skip-env:prepared` を完全一致で固定しているため、CI 経路の差し替えは別 gate で落ちる（無防備なのは Dockerfile 経路だけ）。(3) 引き金となる書き方自体がリポジトリの慣行に反する。全 build script が `bun run toolchain:check && ` で始まる規約で、typescript-toolchain-compat.test.ts:53-71 が 4 本についてそれを強制している。慣行どおり書けば前置スペースが付くので一致する。したがってこれは「稼働中の欠陥」ではなく、drift gate の母集合正規表現に残った**アンカー 1 文字ぶんの潜在的な取りこぼし**。修正コストは 1 行で、直す価値はあるが low 相当。なお引用中の docstring 実害（global-not-found.tsx の `/_not-found` に nonce 無し script 13 本）は scripts/check-static-prelude-empty.ts が成果物を直接検査して防いでおり、その本体には今回の指摘は及ばない。

---

### F-83

**e2e-fixture-singleton-writes gate は scripts/e2e/ しか見ず、receiver も `prisma.` 決め打ち — e2e/helpers に現存する違反を素通りさせている**

<sub>[対処の記録](2026-08-12-codebase-audit-progress.md) ／ [棄却一覧](2026-08-12-codebase-audit-refuted.md)</sub>

|        |                                                                       |
| ------ | --------------------------------------------------------------------- |
| 深刻度 | 低                                                                    |
| 箇所   | `__tests__/unit/architecture/e2e-fixture-singleton-writes.test.ts:35` |
| 領域   | gate（seed / E2E fixture）                                            |

#### 起きること

この gate の不変条件は「E2E fixture は settings singleton を書き換えない（戻せないので seed の宣言へ移す）」。ところが母集合は `readdirSync(join(root, "scripts/e2e"))` だけで、判定regex も line 47 の `/prisma\.settings\w*\.(?:upsert|update|updateMany|create)\(/u` と receiver 名 `prisma` 固定。この二重の狭さを両方すり抜けている fixture が**今このリポジトリに実在する**: `e2e/helpers/refund-policy-bulk-cancel-fixture.ts:99` の `await client.settingsCommerce.update({ where: { id: "singleton" }, data: { refundPolicy: REFUND_FIXTURE_POLICY } });`。置き場が `e2e/helpers/`（走査外）かつ receiver が `client`（regex 外）なので gate は緑のまま。実害: (a) `fullyParallel: true` / workers 2 で並走する他 spec が、この spec の実行中は返金率 50% tier に差し替わった SettingsCommerce.refundPolicy を読む（money-touching な共有状態）、(b) worker が timeout で殺されると `teardownRefundPolicyBulkCancelFixture` の restore（同ファイル 142-150 行）が走らず、共有 test DB に fixture 値が恒久的に残る — これは gate の docstring が実測として記録している `create-passcode-reveal-fixture` の `switchbotEnabled: true` 残置とまったく同型の壊れ方。

#### 直し方

listFixtureScripts() を `scripts/e2e/*.ts` + `e2e/helpers/*.ts` に広げ、SINGLETON\_WRITE を receiver 非依存（`/\b(?:prisma|client|tx|db)\.settings\w*\.(?:upsert|update|updateMany|create)\(/u` 相当、または `\.settings\w*\.` の leading-dot 形）にする。そのうえで refund-policy fixture を SINGLETON\_WRITE\_EXEMPT へ理由付きで登録するか、refundPolicy を seed 宣言へ移して fixture 側は前提確認だけにする。

#### 該当箇所

```
return readdirSync(join(root, "scripts/e2e"));
```

#### 到達経路

\_\_tests\_\_/unit/architecture/e2e-fixture-singleton-writes.test.ts:70 (test "fixture script が settings singleton を書き換えていない") → 同ファイル:34-39 listFixtureScripts() = readdirSync(join(root,"scripts/e2e")) のみ（scripts/e2e の 14 ファイルに refund fixture は含まれない） → 同ファイル:47 SINGLETON\_WRITE = /prisma\\.settings\\w\*\\.(?:upsert|update|updateMany|create)\\(/u（receiver 固定） → 実際の書込は e2e/helpers/refund-policy-bulk-cancel-fixture.ts:99 の `await client.settingsCommerce.update({ where: { id: "singleton" }, data: { refundPolicy: REFUND_FIXTURE_POLICY } })`（client は同:86 getE2EPrismaClient()、e2e/helpers/e2e-prisma.ts:19） → 走査外かつ regex 外で violations === \[\] → 同:79 expect(violations).toEqual(\[\]) が緑 → 一方この fixture は e2e/authenticated/admin/reservation-recurring-series-bulk-cancel-refund.spec.ts:108 で import され :118-120 の beforeAll から実行され、playwright.config.ts:83 fullyParallel:true / :91 workers:2 の下で spec 実行中は SettingsCommerce.refundPolicy が差し替わったままになる（比較対照: \_\_tests\_\_/unit/architecture/e2e-fixture-space-ownership.test.ts:70-78 は同じ穴を塞ぐため e2e/helpers/\*-fixture.ts まで母集合を広げている）

#### 既存の検査

同ディレクトリの `e2e-fixture-space-ownership.test.ts:70-78` は同じ穴を踏んで既に `e2e/helpers/*-fixture.ts` まで母集合を広げており（docstring に「`scripts/e2e/` だけを見ていた頃は…実際 refund-policy-bulk-cancel-fixture.ts は…gate はそれを一度も報告していない」と明記）、この gate だけが取り残されている。`e2e-global-state-restore.test.ts` は spec の describe marker しか見ないので helper は対象外。

#### 反証官による訂正

申告 high は過大。事実誤認が 4 点ある。(1)「create-passcode-reveal-fixture の switchbotEnabled 残置とまったく同型」は誤り。あちらは復元処理そのものが無かったのに対し、refund fixture は teardownRefundPolicyBulkCancelFixture (e2e/helpers/refund-policy-bulk-cancel-fixture.ts:127-151) で非 null は settingsCommerce.update、null は $executeRaw で NULL 代入と両分岐を復元する。しかも復元は page/context に依存しない独立 PrismaClient (e2e/helpers/e2e-prisma.ts:19) 経由なので、gate の docstring が実測として記録している失敗モード（「timeout で page も context も閉じられ hook は走っても仕事ができない」＝ hook 自体は走る）はこの fixture には当てはまらない。恒久残置が起きるのは worker の hard kill のような別の狭い経路だけ。(2)「e2e-global-state-restore.test.ts は helper を見ないので対象外」は片手落ち。消費側 spec は reservation-recurring-series-bulk-cancel-refund.spec.ts:110 が test.describe.serial、:122-126 に test.afterAll を持つため、その gate の「復元は hook で行う」不変条件は現に機械強制されている（marker レベルではあるが、実体の復元コードも正しい）。(3) 実害 (a)「並走する他 spec が 50% tier を読む」は本リポジトリでは実証されない。e2e で refundPolicy を観測可能な形で読む spec は無い — stripe-3ds-sca-challenge.spec.ts の refund 言及は webhook 経路の散文のみ、reservation-cancel-flow.spec.ts はキャンセルを確定させず policy 由来の文言も assert しない、公開側の RefundPolicyNotice は予約フォームの customer step（2 段目）にしか描画されず e2e/visual/public-pages.spec.ts の baseline は homepage/spaces/blog/news/faq/contact のみで届かない。(4) 走査を広げても「実装を直す」結果にはならない見込み。seed の settingsCommerce は create:{id:"singleton"} だけで refundPolicy を宣言しておらず、この 50% tier を seed に移せば全テストと dev DB の返金挙動が変わる。よって現実的な着地は SINGLETON\_WRITE\_EXEMPT への理由付きエントリ追加＋docstring への走査範囲明記であり、CLAUDE.md の「免除の入口を増やさない」と衝突する。本番コード経路への影響はゼロで、落ちているテストも無い。

---

### F-84

**「実行対象ゼロの dead project を禁じる」と謳う gate が、実際にはファイル一致しか見ておらず 0 テスト実行を見逃す**

<sub>[対処の記録](2026-08-12-codebase-audit-progress.md) ／ [棄却一覧](2026-08-12-codebase-audit-refuted.md)</sub>

|        |                                                                            |
| ------ | -------------------------------------------------------------------------- |
| 深刻度 | 低                                                                         |
| 箇所   | `__tests__/unit/architecture/playwright-mobile-device-projects.test.ts:90` |
| 領域   | 検証の空振り                                                               |

#### 起きること

gate が守る `chromium-mobile` / `webkit-mobile` の testMatch は `e2e\/mobile\/public-mobile\..*\.spec\.ts`（同ファイル :12,:36）で、一致するのは e2e/mobile/public-mobile.interactions.spec.ts ただ 1 本。その 1 本は :4-9 で `const appSurface = process.env["APP_SURFACE"] ?? "admin";` / `test.skip(appSurface !== "public", ...)` を file スコープに持ち、この 2 project を回す唯一の step（ci.yml:571-578）が `APP_SURFACE: admin` なので実行テスト数は 0。つまり gate が「静的に禁じる」と書いた状態そのもの（Pixel 5 / iPhone 13 のタッチ回帰を検証しているという誤った安心）が現に成立しており、ci.yml:539 の `# webkit-*-mobile project (e2e/mobile/*.spec.ts) はこの job でのみ実行される。` も 2 project ぶんは事実と異なる。ファイルが存在する限り gate は常に緑なので、この状態は永久に検出されない。

#### 直し方

gate の判定を「testMatch が拾ったファイルが、CI が渡す APP\_SURFACE の下で 1 件でもテストを実行しうるか」まで進める（拾ったファイルに file スコープ `test.skip(appSurface !== "public")` があるなら、ci.yml のどこかに APP\_SURFACE=public でその project を回す step が存在することを要求する）。静的に難しいなら Playwright 側で解決する — 該当 project に `--fail-on-empty`（または実行後の JSON reporter で expected+skipped の内訳を検査する step）を置き、0 実行を CI の失敗にする。docstring に「ファイル一致しか見ていない」と粗さを明記するのは最低限。

#### 該当箇所

```
// testMatch が 1 件も拾わない dead project は、CI が緑のまま
// 「そのデバイスを検証している」という誤った安心を与える。
// browser install（webkit 等）だけ増えて実行対象がゼロ、という状態を静的に禁じる。
test(`${project.name} testMatch resolves to at least one spec file`, () => {
const matcher = new RegExp(project.testMatch, "u");
const matched = e2eFiles.filter((file) => matcher.test(file));

expect(matched.length).toBeGreaterThan(0);
});
```

#### 到達経路

.github/workflows/ci.yml:572 `bunx playwright test --fail-on-flaky-tests`（env は同ファイル :578 `APP_SURFACE: admin`） → playwright.config.ts:170-179 `chromium-mobile` / :180-190 `webkit-mobile`（testMatch `/e2e\/mobile\/public-mobile\..*\.spec\.ts/`） → 一致する唯一のファイル e2e/mobile/public-mobile.interactions.spec.ts → 同 :4 `process.env["APP_SURFACE"] ?? "admin"` が "admin" を返す → :6-9 `test.skip(appSurface !== "public", ...)` が file スコープで成立 → :32 の唯一の test 本体が 1 度も実行されない（Pixel 5 / iPhone 13 の touch 回帰は未検証） → 一方 \_\_tests\_\_/unit/architecture/playwright-mobile-device-projects.test.ts:84 `collectE2eFiles(E2E_ROOT)` → :91 `new RegExp(project.testMatch, "u")` → :92 パス文字列一致で 1 件 → :94 `expect(matched.length).toBeGreaterThan(0)` が pass。ファイルが存在する限り gate は緑のままで、:88-89 が「静的に禁じる」と書いた「実行対象がゼロ」の状態を自動検知する仕組みは無い。

#### 既存の検査

none。gate 自身（:90-95）とファイル存在チェック以外に、project ごとの実行テスト数を確かめる仕組みは無い。playwright.config.ts:171-190 の project 定義は同ファイル :97-112 で文字列一致検査されるが、これも実行数は見ない。

#### 反証官による訂正

3 点訂正。(1)「実行テスト数は 0」は実行された test 本体の数としては正しいが、Playwright は file スコープ skip でも test を collect して「skipped」として報告するため、project 自体は 0 件収集ではない。よって「永久に検出されない」のは自動 gate による検出であって、nightly の Playwright report には skipped として現れている（読む人がいないだけ）。gate 追加 PR #1686 が検証に使った `--list` がこの skip を反映しないのが見落としの直接原因。(2) ci.yml:539 のコメント「webkit-\*-mobile project (e2e/mobile/\*.spec.ts) はこの job でのみ実行される。」は事実と異なるとは言えない。webkit-customer-mobile / webkit-admin-mobile が対象とする e2e/mobile/customer-mobile.dialog.spec.ts と e2e/mobile/admin-mobile.dialog.spec.ts には surface ガードが無く（git grep 済み）実際に実行されるので、webkit install 自体は無駄ではない。実行テストがゼロなのは webkit-mobile（public）1 project だけ。(3) gate の test 名（:90）は「testMatch resolves to at least one spec file」で検査内容を正確に述べており、指摘の見出しが言う「ファイル一致しか見ていない」のは名前どおりの挙動。修正すべきは :87-89 の JSDoc が「実行対象がゼロ…を静的に禁じる」と一段踏み越えている点で、.claude/rules/architecture-gates.md の「検査できないことを検査できるように書かない／粗いなら粗いと docstring に書く」に照らした docstring の是正が本筋。実行テスト数を見たいなら別途 runtime 側（例: 各 mobile project の実行結果を確認する CI step）が必要で、静的 gate の守備範囲外。

---

### F-85

**prisma-delegate-arg-types は引数のどこかに Prisma. があれば通すので、手書き where が Prisma.Select と同居すると素通りする**

<sub>[対処の記録](2026-08-12-codebase-audit-progress.md) ／ [棄却一覧](2026-08-12-codebase-audit-refuted.md)</sub>

|        |                                                                     |
| ------ | ------------------------------------------------------------------- |
| 深刻度 | 低                                                                  |
| 箇所   | `__tests__/unit/architecture/prisma-delegate-arg-types.test.ts:192` |
| 領域   | gate（DB）                                                          |

#### 起きること

referencesPrismaInput() は型ノード全体を walk して `Prisma.` 修飾の参照が 1 つでもあれば true を返す。したがって

readonly space: {
findMany(args: {
where: { deletedAt: null };
select: Prisma.SpaceSelect;
}): Promise\<{ id: string }\[\]\>;
};

は `select` の `Prisma.SpaceSelect` だけで合格し、gate は緑のまま `where` が手書きのリテラル型で残る。これは gate の docstring が本番障害として記録している形そのもの（Space に無い `deletedAt` を where に書き、GLOBAL / LOCATION スコープの休業日の作成・更新・削除が全て 500 になった）と同じで、schema 側で列を rename しても手書き where は追随せず、呼び出しはコンパイルを通って実行時に PrismaClientValidationError で 500 になる。update / upsert / delete は `where` と `data` を同時に取るため、`data: Prisma.XUncheckedUpdateManyInput` を付けたうえで `where: { id: string }` と手書きする書き方が最も自然に発生する。

#### 直し方

引数リテラルの中で `where` / `data` / `orderBy` / `select` / `include` / `cursor` といった Prisma が意味を持つプロパティを個別に取り出し、**そのプロパティごとに** Prisma. 修飾の型参照を要求する（現在の「引数のどこかに 1 つ」ではなく）。落ちるべき見本として上記の混在形を fixture に追加する。

#### 該当箇所

```
return params.some((param) => {
```

#### 到達経路

\_\_tests\_\_/unit/architecture/prisma-delegate-arg-types.test.ts:207 collect() → :249 forEachChild(source, walk) → :240-246 walk が PropertySignature 名 `space` を DELEGATES(:92, schema.prisma 由来 77 件) に一致させ memberContainer(:159) で本体を取得 → :219 inspectDelegateBody が member `findMany` を GUARDED\_METHODS(:95) に一致させ :226 methodParameters で引数 1 個を取得 → :229 parametersUsePrismaInput → :192 params.some（引数単位の OR）→ :200 referencesPrismaInput → :141-153 walk が型ノード全体を降り、`select: Prisma.SpaceSelect` の QualifiedName 左端 `Prisma` に当たって :148 found=true → :229 の否定が成立せず :230-234 の Violation を push しない＝緑。結果、同じ引数の `where: { id: string; deletedAt: null }` は無検査のまま残り、実測でも repo の tsconfig.json:12 strict 設定下で PrismaClient → その構造型の代入がエラー無しに通る（tsc 6.0.3 / generated/prisma 実測）。誤った結果＝「デリゲート引数がすべて Prisma Input 型を経由している」と gate の docstring :44-46 が主張する不変条件が、gate 緑のまま破れている。

#### 既存の検査

同ファイル 279-309 の fixture は `object` / `unknown` / `Record` / 手書き where **単独** / alias 経由の 5 形しか置いておらず、「手書き where と Prisma 型が同じ引数に同居する」形の見本が無い。311-328 の合格 fixture も where 全体が Prisma 型のものだけ。

#### 反証官による訂正

指摘の中核（引数のどこかに Prisma. があれば通る）は正しいが、事実誤認が 3 点ある。(1) 失敗シナリオとして掲げられたコードそのもの（space.findMany に `where: { deletedAt: null }` と `select: Prisma.SpaceSelect` を同居）は**コンパイルできない**。repo の tsc 6.0.3 + 実 generated/prisma で実測すると TS2322 で落ちる: 「Type '{ deletedAt: null; }' has no properties in common with type 'SpaceWhereInput'」＝ TypeScript の weak type detection が効く。したがって「本番障害と同じ形が再発して 500 になる」という筋書きは、その引用形については成立しない。実際に素通りするのは (a) 実在列と存在しない列が混在する where（`{ id: string; deletedAt: null }`）と (b) 指摘が「最も自然」と述べた updateMany 形（`where: { deletedAt: null }` + `data: Prisma.ReservationUncheckedUpdateManyInput`）で、この 2 つは実測でエラー無し。穴は実在するが、主張より狭い。(2) 深刻度: src 全ファイルを厳しい判定（引数プロパティ単位で Prisma 型を要求）で再走査した結果、手書き where は **0 件**。唯一の該当は src/shared/domain/reservations/series-commands.ts:481 と :485 の手書き `select`（`{ seriesId: true; startTime: true }` / `{ id: true }`）で、いずれも実在列であり戻り値型を絞るための意図的な形。しかも「存在しない列だけの手書き select」は tsc が TS2322 で落とす（実測）。live な欠陥は無く、gate の false negative（将来の取りこぼし）にとどまるので medium ではなく low。(3) 指摘が挙げていない、より広い同型の穴がある: parametersUsePrismaInput が `params.some` である以上、\*\*引数が複数あると第1引数が `object` でも通る\*\*。`findMany(args: object, opts: Prisma.SpaceSelect)` は緑になり、これは本番障害を起こした `args: object` そのもの。直すなら「1 引数でも Prisma がどこかにあれば OK」ではなく「型リテラル引数の各プロパティが Prisma 型を経由していること」＋「全 params が条件を満たすこと」に変え、fixture に混在形と複数引数形の 2 本を足すのが最小。なお gate の docstring は :33-37 の「判定」節では基準を正直に書いている一方、:44-46 の「証明する」節が「引数がすべて Prisma の Input 型を経由しており」と実装より強く主張しており、読む人を誤らせるのはこの不整合。

---

### F-86

**navigation reconcile の列取りこぼし検査が declaredContent ブロックの平文一致 — コメントに列名があるだけで満たされる**

<sub>[対処の記録](2026-08-12-codebase-audit-progress.md) ／ [棄却一覧](2026-08-12-codebase-audit-refuted.md)</sub>

|        |                                                                    |
| ------ | ------------------------------------------------------------------ |
| 深刻度 | 低                                                                 |
| 箇所   | `__tests__/unit/architecture/seed-navigation-reconcile.test.ts:80` |
| 領域   | gate（seed / E2E fixture）                                         |

#### 起きること

この gate の不変条件は「dev の reconcile が宣言している列を全部戻す」。判定は `const declaredContent = { … }` ブロックの**テキスト**に列名が現れるかどうかだけで、キーとして存在するかを見ていない。`prisma/seed.ts:4304-4310` の declaredContent から `isExternal: false,` / `isActive: true,` / `parentId: null,` を削り、代わりにブロック内へ `// isExternal / isActive / parentId は管理画面の編集を尊重するため戻さない` という 1 行コメントを置くと、`\bisExternal\b` 等がすべてコメントに一致して missing が空になり gate は緑。実際には `update: reconcile ? declaredContent : {}`（line 4316）が label と url しか戻さなくなり、この gate の docstring line 15-18 がそのまま再現する — 管理画面で `isExternal: true` にされた行が `url: "/"` のまま外部リンク扱いで残り、`isActive: false` の既定項目がヘッダーに出てこない。

#### 直し方

declared\[1\] から `//` と `/* */` を除去してから一致を取る（`e2e-feature-gate-routes-are-public.test.ts:65-69` が Codex P2 指摘を受けて同じ対策をしている）。より強くするなら `\b${column}\s*:` のようにキー位置での一致を要求する。

#### 該当箇所

```
(column) => !new RegExp(`\\b${column}\\b`, "u").test(String(declared[1])),
```

#### 到達経路

\_\_tests\_\_/unit/architecture/seed-navigation-reconcile.test.ts:66 test「宣言できる列を取りこぼしていない」→ :68 の /const declaredContent = \\{(\[\\s\\S\]\*?)\\n {6}\\};/ が prisma/seed.ts:4304-4310 のブレース内テキストだけを declared\[1\] に切り出す（ブロック直上の説明コメント prisma/seed.ts:4292-4303 は捕捉範囲外＝現状 gate は空振りしていない）→ :75 declarableColumns() が prisma/schema.prisma:1578-1600 から \["parentId","label","url","isExternal","isActive"\] を得る → :79-81 で `new RegExp("\\b"+column+"\\b").test(declared[1])` がキーとしての存在ではなく素の単語一致だけを見る → prisma/seed.ts:4307-4309 の isExternal/isActive/parentId を削除し、ブレース内に列名 3 つを含むコメント 1 行を置くと missing=\[\] となり :83 の expect(missing).toEqual(\[\]) が緑（probe 実測）→ prisma/seed.ts:4316 `update: reconcile ? declaredContent : {}` が label と url しか戻さなくなる → prisma/seed.ts:6210 の seedNavigation()（dev の収束経路）で、管理画面で isExternal:true / isActive:false / parentId 付きにされた行がそのまま残り、gate docstring line 15-18 の欠陥形が再現する。

#### 既存の検査

line 66-84 のこのテスト自体が唯一の検査。line 77 の `expect(columns.length).toBeGreaterThan(0)` は schema 側の空振りだけを見ており、declaredContent 側の判別力は検証されていない。

#### 反証官による訂正

深刻度 low は妥当（据え置き）。ただし指摘の書き方に 3 点補正が要る。(1) 「gate に判別力が無い」と読める書き方は過大。実測では素の削除（＝docstring が語る歴史的欠陥そのものの形）は missing=\["parentId","isExternal","isActive"\] で赤になる。これは死んだ gate ではなく精度の穴で、素通りには「3 キーの削除」と「ブレース内へのコメント配置」という 2 つの意図的編集の同時成立が要る。(2) 既存コード prisma/seed.ts:4292-4303 の説明コメントは既に 3 列すべての名前を含むが、捕捉正規表現の外側（`{` より前）にあるため gate を今すでに無力化してはいない。素通りさせるにはコメントを**ブレースの内側**に置く必要があり、自然な位置（オブジェクト直上、現状のスタイル）に書けば gate は赤のままになる。到達経路の記述はこの位置依存を明示すべき。(3) 影響範囲の補正が最重要。reconcile=true は dev 専用経路（prisma/seed.ts:6210）で、本番は prisma/seed.ts:6274 の seedNavigation(false) が update を空にする。この dev/prod 境界は同ファイル line 86-98 の第 3 テストが別途固定している。したがって引用中の「isExternal:true の行が外部リンク扱いで残る」等の実害文言は gate docstring からの引き写しであり、dev / test / E2E の DB に限った話で、本番の障害として読んではならない。既存カバレッジの申告（line 66-84 が唯一・line 77 は schema 側の空振りしか見ていない）は正確。

---

### F-87

**cron\_oidc\_failure メトリックが /api/cron/\* の 500 を無条件に数えるため、OIDC と無関係な cron 障害で「cron OIDC failure」が発火し、runbook が当直を誤誘導する**

<sub>[対処の記録](2026-08-12-codebase-audit-progress.md) ／ [棄却一覧](2026-08-12-codebase-audit-refuted.md)</sub>

|        |                                                          |
| ------ | -------------------------------------------------------- |
| 深刻度 | 低                                                       |
| 箇所   | `infra/monitoring/log-metrics/cron-oidc-failure.yaml:15` |
| 領域   | 共通ライブラリ・監視                                     |

#### 起きること

Resend / Stripe / Google API 側の障害で `/api/cron/reservation-reminder` と `/api/cron/event-reminder` がそれぞれ 2 回ずつ 500 を返す（各 route の catch は `unstable_rethrow(error)` の後に `jsonError("Internal error", 500)` を返す — reservation-reminder/route.ts:158、event-reminder/route.ts:182 ほか cron 20 本すべて同型）。Cloud Run の request log は status=500 / requestUrl=/api/cron/... なので、この filter に 4 件マッチし 15 分閾値 3 を超えて「myrrh-rental-space: cron OIDC failure」が発火する。alert policy の documentation は `CRON_OIDC_AUDIENCE` と `CRON_SERVICE_ACCOUNT_EMAIL` を Cloud Scheduler の oidc\_token ブロックと突き合わせろと指示するが、それらは正常なので当直は空振りし、実際の障害（メール送信失敗）はこのアラートからは一切読み取れない。逆向きにも壊れる: 汎用 500 が背景で数件出ている状態では、本物の OIDC 401 が 1〜2 件混ざっても閾値 3 の意味が失われ、authorizeCronRequest の 401 は MEDIUM(=WARNING) ログしか出さない（cron-auth.ts:102,116）ため他に検知経路が無い。

#### 直し方

OIDC/config 由来だけを数えるように filter を絞る。401 は現状どおり残し、500 側は `authorizeCronRequest` の fail-closed だけが出す CRITICAL ログ（severity="CRITICAL" かつ jsonPayload.category="AUTHORIZATION"）で表現する。汎用 cron handler failure を監視したいなら別メトリック＋別 displayName/runbook のポリシーに分ける（現状は reported-error-burst が HIGH ログ経由で拾える）。どちらにせよ YAML 冒頭コメントと docs/observability/alerting.md の説明を実際の filter と一致させる。

#### 該当箇所

```
(httpRequest.status=401 OR httpRequest.status=500)
```

#### 到達経路

terraform/cloud\_scheduler.tf:67-69 (instagram-sync job, schedule \*/30, GET ${public\_domain}/api/cron/instagram-sync) -\> src/app/api/cron/instagram-sync/route.ts:61 fetchInstagramFeed(token, 12) called directly in the outer try with no inner catch; a Meta/Instagram API outage throws -\> route.ts:75 catch -\> route.ts:76 unstable\_rethrow(error) returns undefined for a non-Next error (node\_modules/next/dist/esm/client/components/unstable-rethrow.js) -\> route.ts:82 return jsonError("Instagram feed sync failed", 500) -\> Cloud Run request log emits httpRequest.status=500, requestUrl=.../api/cron/instagram-sync, resource.labels.service\_name="myrrh-rental-space" (terraform/cloud\_run\_public.tf:39) -\> matches infra/monitoring/log-metrics/cron-oidc-failure.yaml:12-15, incrementing cron\_oidc\_failure -\> terraform/cloud\_scheduler.tf:254-255 retry\_count=3 / min\_backoff=30s means one persistently failing job emits 1+3=4 log-metric hits inside a single 900s window -\> infra/monitoring/alert-policies/cron-oidc-failure.yaml:36-40 (alignmentPeriod 900s, REDUCE\_SUM, COMPARISON\_GT, thresholdValue 3) exceeds 3 -\> incident "myrrh-rental-space: cron OIDC failure" opens for a failure that has nothing to do with OIDC, and its documentation step 2 (cron-oidc-failure.yaml:22-25) directs the responder to diff CRON\_OIDC\_AUDIENCE / CRON\_SERVICE\_ACCOUNT\_EMAIL against terraform oidc\_token, which are correct.

#### 既存の検査

`__tests__/unit/architecture/alert-policy-no-active-replaceme.test.ts` は REPLACE\_ME 行の有無だけを見る。filter が何を数えるかを検査する gate は無い。docs/observability/alerting.md:121-126 も「401 か、config 欠落の 500」の 2 経路しか想定しておらず、handler 由来の 500 が同じメトリックに入ることは記述されていない。

#### 反証官による訂正

The finding is real but four of its specifics are wrong, and its impact is overstated.

(1) The named trigger is wrong. The report says a Resend outage makes reservation-reminder and event-reminder return 500. It does not. Both routes wrap the per-recipient send in an inner try/catch (reservation-reminder/route.ts:83-127, event-reminder same shape), release the claim, log at ErrorSeverity.LOW, and continue the loop; the route then returns jsonSuccess at reservation-reminder/route.ts:150 and event-reminder/route.ts:174. Also, sendEmail does not throw on delivery failure — it returns { ok: false } (route.ts:100-113). A Resend outage therefore yields HTTP 200, not 500, and never touches this metric. The real triggers are (a) DB/Prisma errors on the unwrapped calls — connection(), isFeatureEnabled, isEmailEnabled, findReservationsForReminderWindow, and claimReservationReminder at route.ts:77 all sit outside the inner catch — and (b) routes that call an external API directly in the outer try, e.g. instagram-sync/route.ts:61. Only (b) matches the report's "third-party outage" framing, and it is not one of the two routes it cited.

(2) Route count is 20 in the report; it is 23 (every directory under src/app/api/cron/ returns a 500 from its outer catch).

(3) The trigger is easier to hit than the report claims, not harder. It posits two jobs failing twice each. terraform/cloud\_scheduler.tf:254-255 sets retry\_count=3 with min\_backoff 30s, so a single persistently failing job emits 4 requests within roughly four minutes and clears thresholdValue 3 on its own.

(4) "The real failure is completely unreadable from this alert" is overstated. The metric extracts request\_url and status as labels (log-metrics/cron-oidc-failure.yaml:34-36), and the runbook's step 1 (alert-policies/cron-oidc-failure.yaml:19-21) is the Cloud Logging filter itself, which immediately shows status=500 and which cron path is failing. The misdirection is the alert title plus wasted step 2, not diagnostic blindness. Likewise the reverse-direction argument is weaker than stated: with retry\_count=3 amplifying every genuine 401 across 23 jobs, a real OIDC failure clears threshold 3 comfortably; the harm is attribution ambiguity, not a suppressed alert.

Severity medium -\> low. There is no product-correctness, data, or user-facing impact; this is observability signal hygiene. Critically, no notification channel is wired anywhere — all five policies in infra/monitoring/alert-policies/ keep notificationChannels commented out, which docs/observability/alerting.md:50-53 documents as the intended not-yet-wired state and alert-policy-no-active-replaceme.test.ts enforces. Nobody is paged by any of these today, so the misdirection is latent until an operator wires channels. The underlying mismatch between the filter and its documented intent is genuine and worth narrowing (split the 401 condition from a 500 condition discriminated on the config-missing log entry, or group the alert by the existing status label), but it is a low-severity infra-config cleanup, not a medium.

---

### F-88

**/events とイベント詳細の Cache-Tag に space-v1 / location-v1 が無く、会場住所・スペース名の変更が edge に反映されない**

<sub>[対処の記録](2026-08-12-codebase-audit-progress.md) ／ [棄却一覧](2026-08-12-codebase-audit-refuted.md)</sub>

|        |                     |
| ------ | ------------------- |
| 深刻度 | 低                  |
| 箇所   | `next.config.ts:85` |
| 領域   | キャッシュ          |

#### 起きること

管理画面で Location の住所を変更すると purgeLocationCaches() が invalidateSiteWideCache(CACHE\_TAGS.LOCATIONS)（→ CDN location-v1）と /access の URL purge を発火する。location-v1 を emit しているのは /spaces/:path\* だけなので、/events と /events/\[slug\] の edge コピーは purge されない。両ページの producer は cacheTag(CACHE\_TAGS.EVENTS, CACHE\_TAGS.LOCATIONS, CACHE\_TAGS.SPACES) を貼り、publicEventSelect が location: { name, address } と space: { name, slug } を select して会場として描画している。よって s-maxage=3600 + SWR=3600 の間、旧住所のイベントページが配信され続ける（来場者が古い住所を見る）。スペース改名でも同じ: space.ts の revalidateSpaces は space-v1 タグと /spaces/\<slug\> URL、HOME\_MARKETING しか purge しないため /events 側は取り残される。

#### 直し方

EVENTS\_CACHE\_TAG に CDN\_CACHE\_TAGS.SPACE と CDN\_CACHE\_TAGS.LOCATION を追加する（EVENT\_WAITLIST を EVENT と co-inline したのと同じ手当て。cdn-cache-tags.ts:70-72 のコメントが先例）。恒久対策としては、cacheTag の第 1 引数群（CACHE\_TAGS.X）と、その関数を消費するルートの emit タグ集合を突き合わせる gate を 1 本足すのが本筋。

#### 該当箇所

```
const EVENTS_CACHE_TAG = joinWithSiteWide([
CDN_CACHE_TAGS.EVENT,
CDN_CACHE_TAGS.EVENT_CATEGORY,
CDN_CACHE_TAGS.EVENT_WAITLIST,
...SIDEBAR_CDN_TAGS,
]);
```

#### 到達経路

エントリ: src/app/(admin)/admin/(dashboard)/\_shared/actions/location.ts:123 updateLocationAction（住所変更）
→ :148-154 afterSuccess → :36 purgeLocationCaches
→ :37 invalidateSiteWideCache(CACHE\_TAGS.LOCATIONS)
→ src/shared/lib/cache/site-wide.ts:71 updateTag("locations")（origin Data Cache は正しく失効）
→ :75 translateToCdnTags(\["locations"\]) → src/shared/lib/constants/cdn-cache-tags.ts:166 LOCATIONS→CDN\_CACHE\_TAGS.LOCATION のみ解決
→ site-wide.ts:78 queueTagPurge(location-v1, sitemap-v1) → src/shared/lib/cache/batcher.ts:32-44 で **この 2 タグだけ** Cloudflare purge
→ location.ts:38-41 の URL purge 対象は \["/access"\] のみ
分岐（誤った結果の分かれ目）: next.config.ts:288-294 の `/events` / EVENT\_PUBLIC\_DETAIL\_HEADER\_SOURCE が emit する値は :85-90 EVENTS\_CACHE\_TAG で、location-v1 / space-v1 を含まない → tag purge が両ページの edge コピーに一致しない
→ 結果: next.config.ts:242-251 の blanket `s-maxage=3600, stale-while-revalidate=3600` が生き残り、最大 ~2 時間、src/app/(public)/events/\[slug\]/page.tsx:121 formatEventAddress（src/shared/lib/events/venue.ts:49 `location.address`）と src/app/(public)/\_shared/components/sections/section-renderer.tsx:588 formatEventVenue が描いた**旧住所・旧スペース名の HTML** が edge から配信される。
space 側の同型経路: src/app/(admin)/admin/(dashboard)/\_shared/actions/space.ts:46 revalidateSpaces → :48-53 は SPACES/SPACE\_CATEGORIES/LOCATIONS/REVIEWS、:70 の URL purge は `/spaces/<slug>` のみ → event-v1 も /events URL も purge されない。

#### 既存の検査

none。next-config-cache-tag-emission.test.ts は「各 collection source に SITE\_WIDE\_CDN\_TAGS 全量が入っていること」しか見ておらず、producer の cacheTag 集合 ⊆ そのページが emit する CDN タグ集合、という対応関係は一切検証していない。eslint-rules/no-raw-updatetag-for-cdn-mapped-cache-tag.mjs は updateTag/revalidateTag の呼び方だけを見る規則で、この不足は検出範囲外。

#### 反証官による訂正

指摘の骨子は正しいが、記述に 3 点の不正確・誇張がある。

(1) producer の帰属が /events では部分的にしか当たらない。`/events` の list variant が使うのは `src/shared/domain/events/public-queries.ts:252 getPublishedEventsPaginated` で、これは JSDoc(:241-251) の通り `"use cache"` **非対応**＝`cacheTag` を一切貼らない。`cacheTag(EVENTS, LOCATIONS, SPACES)` を持つのは :94 `getPublishedEvents`（calendar / toggle variant、section-renderer.tsx:631/637 経由）と :174 `getPublishedEventBySlug` の 2 本。「両ページの producer は cacheTag(...)」は /events の list variant については誤り。ただし欠落しているのは CDN 側の purge 到達なので、結論（edge に旧値が残る）は list variant でも変わらない。

(2) 行番号が 1 箇所ずれている。「site-wide.ts:88 invalidateSiteWideCache」の :88 は関数本体ではなく直後の JSDoc 行。実体は `src/shared/lib/cache/site-wide.ts:66-85`（CDN タグ purge は :78）。

(3) 深刻度は medium ではなく low が妥当。理由は 3 つ:
\- 露出は無期限ではなく最大 s-maxage 3600 + SWR 3600 ≒ 2 時間の有界窓。
\- origin の Next Data Cache は `updateTag("locations")`(site-wide.ts:71) で正しく失効しており、データ不整合や恒久的な誤配信ではない。
\- event-v1 は極めて高頻度に purge される（`event-registration.ts:417` / `waitlist/confirm.ts:137` / `event.ts:40` / cron 3 本 / stripe-webhook `cache-invalidation.ts:47` が invalidateSiteWideCache(EVENTS) を叩く）。任意のイベント申込 1 件で event-v1 が global purge され /events 系 edge が入れ替わるため、実運用での実効窓はさらに短い。
\- トリガー（拠点住所の変更・スペース改名）自体が稀で、`/access` と `/spaces` は正しく purge される。

なお「既存カバレッジ none」の申告は正しい（`next-config-cache-tag-emission.test.ts` / `type-safety-cast-and-cache-tag-drift.test.ts` / `eslint-rules/no-raw-updatetag-for-cdn-mapped-cache-tag.mjs` いずれも producer↔emitter の対応関係を見ていない）。

---

### F-89

**seedSpaceCategories が本番再実行でスペースカテゴリーの説明・アイコン・色を宣言値へ戻す**

<sub>[対処の記録](2026-08-12-codebase-audit-progress.md) ／ [棄却一覧](2026-08-12-codebase-audit-refuted.md)</sub>

|        |                      |
| ------ | -------------------- |
| 深刻度 | 低                   |
| 箇所   | `prisma/seed.ts:829` |
| 領域   | seed                 |

#### 起きること

本番 seed が作った 4 カテゴリー（会議室 / セミナールーム / コワーキング / イベントスペース）は名前が汎用なので運用でもそのまま残る。管理者が「会議室」の description を自社の実文言に直し、icon を Users から別のものへ、color をブランド色へ変更する。その後スタッフ追加のために `--production` を再実行すると、seedSpaceCategories は `findFirst({ name: "会議室", isActive: true })` で既存行を見つけ、reconcile 判定を一切持たないまま description を「少人数から中規模のミーティングに最適」、icon を "Users"、color を "#3B82F6" に書き戻す。sortOrder だけは意図的に温存されるので、並び順は変わらず内容だけが seed 値に戻り、変更に気付きにくい。

#### 直し方

seedSpaceCategories に seedLocations と同じ reconcile 引数を足し、seedProduction からは `seedSpaceCategories(false)` で呼んで既存行を skip する（create 側の max+1 採番はそのままで良い）。

#### 該当箇所

```
await prisma.spaceCategory.update({
```

#### 到達経路

prisma/seed.ts:6326 (`case "production"`) → prisma/seed.ts:6329 `await seedProduction(...)` → prisma/seed.ts:6257 `await seedSpaceCategories();` → prisma/seed.ts:824-826 `findFirst({ where: { name: cat.name, isActive: true } })` が管理画面で編集済みの既存行を掴む → prisma/seed.ts:827 `if (existing)`（prisma/seed.ts:743 `const reconcileDeclaredContent = overridePublished === undefined` / 754 `if (!reconcileDeclaredContent)` に相当する本番弾きが無い）→ prisma/seed.ts:829-836 `prisma.spaceCategory.update({ data: { description, icon, color } })` が宣言リテラル（prisma/seed.ts:786-808）で上書き → src/shared/domain/space-categories/commands.ts:80 `updateSpaceCategory` で管理者が保存した 3 列が失われ、うち `icon` は src/shared/domain/spaces/public-queries.ts:57 `category: { select: { id: true, name: true, icon: true } }` 経由で公開ストアフロントにも反映される。

#### 既存の検査

seedSpaceCategories を名指しする gate は存在しない（\_\_tests\_\_ 全体を grep して seedSpaceCategories は 0 件）。seed-locations-reconcile.test.ts / seed-space-reconcile.test.ts / seed-navigation-reconcile.test.ts はいずれも別関数のみを対象にしている。

#### 反証官による訂正

medium → low に補正する。指摘の事実関係はほぼ正確だが、被害範囲が手本にした seedLocations の事例より一段小さい。

【補正の根拠（severity）】
seedLocations の元欠陥は住所・電話・座標・料金レンジを架空値へ戻したうえ `isPublished: false` で公開中の拠点を落としていた（seed.ts:734-742 のコメント）。今回上書きされるのは最大 4 行 × 任意 3 列（description / icon / color）だけで、`name` / `sortOrder` / `isActive` と Space 関連は一切触られず、公開状態も反転しない。復旧も /admin/space-categories で再入力するだけ。発火にも運用者が手で `--production` を再実行する必要がある。無言のデータ喪失であることは事実なので none ではなく low。

【指摘の記述で正しかった点（検証済み）】
\- 引用文字列・行番号（829）は改変なし。827-836 の分岐構造も記載どおり。
\- 「sortOrder だけは意図的に温存される」— 正しい（828 のコメントと update の data に sortOrder が無いことで確認）。
\- 「seedLocations は 743/754 に本番弾きを持つが seedSpaceCategories は overridePublished 相当の引数自体を持たない」— 正しい。
\- 「\_\_tests\_\_ を grep して seedSpaceCategories は 0 件」— 再現確認済み（e2e/ scripts/ docs/ を含めても 0 件）。

【指摘に足りなかった/補強すべき点】
\1. 深刻度を「none 寄り」に落とし切れない理由は、指摘が挙げていない事実にある。`icon` は管理画面だけの飾りではなく src/shared/domain/spaces/public-queries.ts:57 で公開クエリの select に入っており、巻き戻しが公開ストアフロントのスペースカードに出る。
\2. 「seedSpaceCategories が唯一の外れ値」であることは指摘が主張していないが、実際に唯一である。本番経路の他関数は全て skip か dev 限定 reconcile を持つ: seedEventCategories は既存行で `continue`（seed.ts:884）、seedTermsDocuments は「既にある規約は一切触らない」、seedBlockTemplates は `count > 0` で早期 return（seed.ts:5562-5568）、seedLocations(false) / seedSpaces(false) / seedFaq(false) / seedNavigation(false) は明示引数で弾く。
\3. ただし 2 を「他所では意図的に内容を守っている」証拠として使いすぎないこと。EventCategory の本番 fixture は `[{ name: "未分類" }]` だけで description/icon/color を持たないため、そこの `continue` は内容保護の判断とは限らない。
\4. 修正時の注意（指摘が触れていない制約）: 単純に「本番は skip」にすると seed-locations-reconcile.test.ts の docblock が説明する dev 側の収束要件（migrate deploy しか流さない dev/test DB が宣言と静かに乖離する）を壊す。seedLocations と同型の引数付き二分岐にする必要があり、「本番だけ弾く」一行では済まない。

---

### F-90

**seedNavigation の (type, order) 一致判定が、管理画面の削除・並び替え後に別項目を指し、本番でナビゲーションが重複する**

<sub>[対処の記録](2026-08-12-codebase-audit-progress.md) ／ [棄却一覧](2026-08-12-codebase-audit-refuted.md)</sub>

|        |                       |
| ------ | --------------------- |
| 深刻度 | 低                    |
| 箇所   | `prisma/seed.ts:4314` |
| 領域   | seed                  |

#### 起きること

本番運用で管理者がヘッダーから「ブログ」（HEADER\_DESKTOP, order 3）を削除する。deleteNavigationItem（src/shared/domain/navigation/commands.ts:276-298）は残りの order を詰めないので穴が空いたままだが、その後にドラッグ並び替えかインデント操作を 1 回でも行うと updateNavigationOrder に `order: i`（src/app/(admin)/admin/(dashboard)/settings/appearance/\_components/navigation/navigation-utils.ts:138 の `updates.push({ id: item.id, order: i, parentId: null });`）で 0..6 の詰め直しが送られる。この状態でスタッフ追加のために `--production` を再実行すると、seedNavigation(false) の upsert は (HEADER\_DESKTOP, 0..6) を既存として update:{} で素通りし、空いた (HEADER\_DESKTOP, 7) だけを create する。その create のペイロードは宣言配列の 7 番目、つまり label「お問い合わせ」/ url "/contact"。結果として公開ヘッダーに「お問い合わせ」が 2 つ並ぶ。並び替えを挟まず削除だけの場合は、削除した項目が同じ order にそのまま復活する。

#### 直し方

本番（reconcile=false）では欠けている項目の再作成そのものを止めるのが最小の修正。`seedNavigation` の create を reconcile 分岐の内側に入れ、production では `count()` が 0 のとき（= 完全な初回投入）だけ全項目を作る形にする。再作成を残すなら、判定キーを (type, order) ではなく (type, url) など項目の同一性を表すものに変え、order は max+1 で採番する（seedSpaceCategories / seedTermsDocuments と同型）。

#### 該当箇所

```
where: { type_order: { type: group.type, order: item.order } },
```

#### 到達経路

\[管理画面での削除\] src/app/(admin)/admin/(dashboard)/settings/appearance/\_components/navigation/hooks/use-navigation-handlers.ts:142 → src/app/(admin)/admin/(dashboard)/\_shared/actions/navigation.ts:43 → src/shared/domain/navigation/commands.ts:295-297（order を詰めずに delete。HEADER\_DESKTOP の order 3「ブログ」が消え 0,1,2,4,5,6,7 になる）
\[管理画面での並び替え/インデント\] use-navigation-handlers.ts:296 / :329 → navigation-utils.ts:155-165（`updates.push({ id: item.id, order: i, parentId: null })` で 0..n-1 に圧縮） → \_shared/actions/navigation.ts:61 → src/shared/domain/navigation/commands.ts:338-347（`allTypeItems.length !== items.length` で全件送信を強制 → 実行後は 0..6、穴は order 7 へ移動）
\[本番 seed の再実行\] prisma/seed.ts:6299 main() → prisma/seed-safety.ts:122-124（`mode === "production"` を無条件 ok。DB の空判定なし） → prisma/seed.ts:6329 seedProduction() → prisma/seed.ts:6274 seedNavigation(false) → prisma/seed.ts:4312-4322 upsert
\[誤った分岐\] where `{ type_order: { type: "HEADER_DESKTOP", order: 7 } }` が該当行なし → update:{} ではなく **create** 側へ → prisma/seed.ts:4304-4321 で宣言配列 7 番目 prisma/seed.ts:4249 `{ text: "お問い合わせ", url: "/contact", order: 7 }` を isActive:true / parentId:null で挿入
\[誤った結果\] src/shared/domain/navigation/queries.ts:82-105, 119-135 getPublicNavigation が order 6（既存「お問い合わせ」）と order 7（seed が作った「お問い合わせ」）を重複排除せず両方返す → 公開ヘッダーに「お問い合わせ」が 2 つ並ぶ

#### 既存の検査

\_\_tests\_\_/unit/architecture/seed-navigation-reconcile.test.ts:86-98「本番の再実行は既存行を書き換えない」は `update: reconcile ? declaredContent : {}` と `seedNavigation(false)` の 2 点だけを固定しており、create 側（欠けている order を埋める経路）は検査していない。他の seed gate にも type\_order への言及は無い。

#### 反証官による訂正

事実関係の誤りは無い。引用・行番号・create ペイロードの中身（HEADER\_DESKTOP order 7 = 「お問い合わせ」/contact, seed.ts:4249）・削除のみの場合は「重複」ではなく「削除項目の復活」になるという但し書きまで、すべて実物と一致した。補足 2 点: (a) 指摘は並び替えを「1 回でも行えば」としているが、実際はより強い — updateNavigationOrder (commands.ts:338-347) が対象 type の全行送信を要求し computeOrderFromFlat が index をそのまま order にするので、並び替え・インデント・アウトデントのどれか 1 操作で **必ず** 0..n-1 へ圧縮され、穴は必ず末尾（宣言配列の最終要素の位置）に移る。つまり「運が悪ければ」ではなく決定的に最終項目が複製される。(b) これは新種ではなく、同ファイルの seedLocations が既に踏んで直した欠陥の同型残り（seed.ts:726-742。あちらは位置キー sortOrder を書き戻して P2002 で seed 全体が中断した。seedNavigation は upsert 化で P2002 は回避したが、代わりに「うるさい中断」が「無言の重複行」に化けた）。

深刻度は medium → low に下げる。理由: (1) 既存行は `update: {}` で一切書き換わらないのでデータ破壊も設定の巻き戻しも起きない（seedLocations の旧欠陥が「実データの破壊」だったのとはここが決定的に違う）。(2) seed が P2002 等で中断せず、後続 phase も完走する。(3) 影響は公開メニューに項目が 1 つ余分に出る（または削除済み項目が復活する）という可視の内容不整合のみで、管理画面から 1 クリック削除で回復できる。(4) 発火には「本番 seed の再実行 × 削除 × 並び替え」の連言が必要で、再実行自体はコメントが認める運用だが日常操作ではない。認証・課金・予約データには一切触れない。

---

### F-91

**Bun.spawnSync().exitCode is null on signal-kill, so `process.exit(run())` turns a killed `prisma migrate deploy` into exit 0**

<sub>[対処の記録](2026-08-12-codebase-audit-progress.md) ／ [棄却一覧](2026-08-12-codebase-audit-refuted.md)</sub>

|        |                                 |
| ------ | ------------------------------- |
| 深刻度 | 低                              |
| 箇所   | `scripts/migrate-test-db.ts:83` |
| 領域   | scripts 終了コード              |

#### 起きること

CI runs `bun run test:all` (= `db:generate && test:db:migrate && run-tests.ts __tests__/unit __tests__/integration`) or Playwright's webServer chain (`playwright.config.ts:29-31`: `bun run db:generate` → `bun run test:db:migrate` → `bun prisma/seed.ts --dev` → ...). The runner OOM-kills `bunx --bun prisma migrate deploy` (the repo has measured 15.28 GB peak on a 16 GB runner — `project_eslint-concurrency-is-a-memory-budget`), so the child is reaped with WIFSIGNALED. Measured on the installed Bun 1.3.14: `Bun.spawnSync(...).exitCode` is **null** in that case (`{"exitCode":null,"t":"object","success":false,"signalCode":"SIGKILL"}`), and `bun -e 'process.exit(null)'` exits **0**. So `run()` returns null, line 87 `process.exit(run())` exits 0, the `&&` chain proceeds, and unit+integration tests / `seed --dev` run against a half-applied schema on the \*shared\* CI Postgres (`TEST_DATABASE_URL` == `DATABASE_URL` == `test_db`, ci.yml:71-77). The same collapse hits line 38 `runInherited` (docker-compose start): it prints `[test:db:migrate] Failed to start docker-compose test-db` and then exits 0 — the script announces failure and reports success.

#### 直し方

Apply the guard the repo already uses at `scripts/lint-migrations.ts:83` to every `Bun.spawnSync().exitCode` read: `return proc.exitCode ?? 1;` at scripts/migrate-test-db.ts:38 and :83, `return proc.exitCode ?? 1;` at scripts/setup-local.ts:58, and `process.exit(proc.exitCode ?? 1);` at scripts/ensure-next-types.ts:23. A regression test can drive the pure boundary without spawning anything: `ensureDefaultLocalTestDatabase("default-local", () => null as unknown as number)` must not produce 0. Note `scripts/validate.ts:69`, `scripts/type-check.ts:103`, `scripts/lint-format.ts:103` and `scripts/prettier.ts:75` need **no** change — they read `await proc.exited`, which was measured to resolve to `137` (128+SIGKILL), never null, so `failed?.exitCode ?? 0` only fires on the `undefined` from `.find()`.

#### 該当箇所

```
return proc.exitCode;
```

#### 到達経路

package.json `test:all` (`bun run db:generate && bun run test:db:migrate && bun scripts/run-tests.ts __tests__/unit __tests__/integration`) → scripts/migrate-test-db.ts:87 `process.exit(run())` → scripts/migrate-test-db.ts:71 run() → scripts/migrate-test-db.ts:78 `Bun.spawnSync(["bunx","--bun","prisma","migrate","deploy"], ...)`; child is signal-killed (POSIX WIFSIGNALED) → scripts/migrate-test-db.ts:83 `return proc.exitCode` yields null (measured: exitCode=null, signalCode="SIGKILL", success=false) though bun-types/bun.d.ts:7295 types it `number` → scripts/migrate-test-db.ts:87 `process.exit(null)` exits 0 (measured) → the `&&` chain proceeds and run-tests.ts executes against a partially-migrated database. Second path, same file: scripts/migrate-test-db.ts:38 `return proc.exitCode` (null) → :51 `if (exitCode !== 0)` is true so :52-54 prints "\[test:db:migrate\] Failed to start docker-compose test-db" → :56 `return exitCode` (null) → :76 `if (ensureExitCode !== 0) return ensureExitCode` returns null → :87 `process.exit(null)` exits 0 — the script announces failure and reports success. Same shape at scripts/setup-local.ts (runInherited `return proc.exitCode` → runSetup `return exitCode` → `process.exit(runSetup(...))`) and scripts/ensure-next-types.ts:23 (`if (!proc.success) process.exit(proc.exitCode)` → exit 0).

#### 既存の検査

Not caught by anything. (1) type-check cannot see it: `node_modules/bun-types/bun.d.ts:7295` declares `SyncSubprocess.exitCode: number` (non-nullable) while the runtime returns null — the bundled docs at `node_modules/bun-types/docs/runtime/child-process.mdx:558` even document the async twin as `readonly exitCode: number | null`. (2) `__tests__/unit/scripts/migrate-test-db.test.ts` only exercises `ensureDefaultLocalTestDatabase` with an injected `CommandRunner` that returns literal 0/1 (lines 57-80), so `runInherited` — the only place `proc.exitCode` is read — is never executed, and `run()` / `process.exit(run())` have no test at all. Same for `scripts/setup-local.ts` (`__tests__/unit/scripts/setup-local-target.test.ts` injects runners) and `scripts/ensure-next-types.ts` (no test). (3) No ESLint rule covers it. The repo already knows this trap and guards it in two other places — `scripts/lint-migrations.ts:83` `return result.status ?? 1;` with the comment 「signal kill は status=null。安全側に倒して失敗扱いにする。」 and `scripts/build-baseline-migration.ts:160` `if (result.status !== 0)` — so this is an inconsistently-applied known guard, not an unknown risk.

#### 反証官による訂正

Real defect, but the report inflates it to medium on three inaccurate supports. (1) The OOM trigger is misattributed: the 15.28 GB peak cited from project\_eslint-concurrency-is-a-memory-budget was ESLint with 4 workers in the lint job — already resolved by dropping concurrency to 2 — not `prisma migrate deploy`, which is a small process running alone in the `test:all` chain. No realistic single-child-kill scenario is demonstrated; the common ones (Ctrl+C, GHA job cancellation) signal the whole process group and kill the parent too. (2) The consequence is overstated as a false green. On CI the Postgres service is fresh per job, so a half-applied schema makes integration tests and `bun prisma/seed.ts --dev` fail loudly; the false success is confined to that one step's exit code. A genuinely silent pass needs a long-lived already-migrated DB, which is a local-dev-only condition. (3) `scripts/ensure-next-types.ts:23` is not an undetected case — it sits inside `if (!proc.success)`, so it correctly detects the kill and only then exits 0; its bug is narrower than described. Additional correction the report omits: this is POSIX-only. On the repo's own platform (Windows, bun 1.3.14) I measured `Bun.spawnSync` returning `exitCode: 1` (a number) for a killed child, so local Windows development never sees it; only ubuntu-latest CI does. Also worth noting for anyone fixing it: `proc.success` is already false in this case, so `return proc.exitCode ?? 1` (matching scripts/lint-migrations.ts:83) is a one-line, behavior-preserving fix. Version caveat: the null behavior was measured on bun 1.3.5 under WSL because Windows cannot produce WIFSIGNALED; the repo runs 1.3.14, and the auditor independently reports measuring null on 1.3.14, which matches the documented `number | null` semantics of the async twin.

---

### F-92

**command palette の検索が EDITOR の userPageAssignment 絞り込みを迂回し、全ページのタイトル/slug を返す**

<sub>[対処の記録](2026-08-12-codebase-audit-progress.md) ／ [棄却一覧](2026-08-12-codebase-audit-refuted.md)</sub>

|        |                                                                                  |
| ------ | -------------------------------------------------------------------------------- |
| 深刻度 | 低                                                                               |
| 箇所   | `src/app/(admin)/admin/(dashboard)/_shared/actions/command-palette/search.ts:38` |
| 領域   | admin Server Action                                                              |

#### 起きること

EDITOR ロールのスタッフに page A だけを割り当てる。ヘッダーの command palette に他ページのタイトル片（例「料金」）を 2 文字以上入力すると、searchPages の where が OR\[title, slug\] だけで assignment も isActive も見ないため、割当外ページ・未公開ページ・ゴミ箱送り (isActive:false) のページのタイトルと slug が最大 5 件返り、`/admin/pages/{slug}` へのリンクとして描画される。管理画面の他の読取経路は EDITOR に対して例外なく assignedPageIds で絞っている（\_shared/queries/pages.ts:27-30 / :50-52 / :58-60、admin/api/pages/deleted/route.ts:37）ため、この 1 箇所だけが resource-level access 境界の穴になっている。

#### 直し方

searchAdminResources 内で isEditorRole(auth.user.role) のとき getAssignedPageIdsForUser(auth.user.id) を解決し、searchByResource 経由で searchPages の where に id: { in: allowedPageIds } を足す（\_shared/queries/pages.ts の getPagesList と同じ形）。併せて searchPages の where に isActive: true を足し、ゴミ箱のページが検索結果に出ないようにする。

#### 該当箇所

```
hasPermission(auth.user.role, r, "read"),
```

#### 到達経路

src/app/(admin)/admin/(dashboard)/layout.tsx:60 (requireAdminDashboardPage — EDITOR は src/shared/lib/admin-roles.ts:49 isDashboardRole を通過) → src/app/(admin)/admin/(dashboard)/layout.tsx:116,120 (SearchTriggerSlot / CommandPalette を role 条件なしでマウント) → src/app/(admin)/admin/(dashboard)/\_shared/components/command-palette/CommandPaletteProvider.tsx:90 (searchAdminResources(query)) → src/app/(admin)/admin/(dashboard)/\_shared/actions/command-palette/search.ts:21-22 (checkAdminAuth → canAccessAdmin=isDashboardRole で EDITOR 通過) → search.ts:37-39 (SEARCHABLE\_RESOURCES.filter(hasPermission(role,r,"read")); src/shared/lib/admin-permissions.ts:249-251 の ROLE\_PERMISSIONS.EDITOR が "page:read" を持つため "page" が残る) → search.ts:42 (searchByResource("page", trimmed)) → src/shared/domain/admin-search/queries.ts:304 → src/shared/domain/admin-search/queries.ts:147-154 (prisma.page.findMany の where が OR\[{title},{slug}\] のみ。assignment 条件も isActive/isPublished 条件も無い ← 誤った分岐) → src/shared/domain/admin-search/queries.ts:155-161 (label=title / description=`/${slug}` / href=`/admin/pages/${slug}` を最大 5 件返す) → src/app/(admin)/admin/(dashboard)/\_shared/components/command-palette/CommandPalette.tsx:64-79 (query.length\>=2 で結果を描画) → 割当外・未公開・ゴミ箱 (isActive:false) ページの title/slug が EDITOR に露出。対照: src/app/(admin)/admin/(dashboard)/\_shared/queries/pages.ts:27-30, :50-52, :58-60 と src/app/(admin)/admin/api/pages/deleted/route.ts:36-37 は同じ EDITOR に対し getAssignedPageIdsForUser で絞っている。

#### 既存の検査

admin-read-boundaries.test.ts / admin-permission-denial-mechanism.test.ts はいずれも resource-level (userPageAssignment) の narrowing を検査していない。resource-access.ts:12-22 の JSDoc は「EDITOR は page resource 専用の resource-level access 制御を受ける」と宣言するが、検索経路はその制御を通らない。

#### 反証官による訂正

medium は過大。影響は「認証済み内部スタッフ (EDITOR=編集者、招待制) に対する、1 クエリ最大 5 件の page メタデータ (title / slug) 露出」に限定される。(a) 本文・section・PII は一切返らない (select は id/title/slug のみ、id は React key にしか使われず描画されない)。(b) リンクは踏んでも通らない: /admin/pages/\[slug\] は \_shared/queries/pages.ts:33-42 の getPageBySlug 経由で requireAdminResourcePermission("page","read", page.id) を実行し (\_helpers.ts:74-93)、割当外なら denyAdminAccess する。つまり dead link であって権限昇格ではない。(c) 公開済みページの title/slug は公開サイト側で誰でも見られる情報であり、真に新規な露出は isPublished:false / isActive:false / PAGES\_MANAGED\_ELSEWHERE (admin-queries.ts:9 の posts/news/terms) の分だけ。mutation 経路は無傷 (admin-action.ts:108-109 が checkResourceAccess を通す)。したがって confidentiality breach ではなく最小権限の一貫性欠落であり low が妥当。

事実誤認の補正 2 点:
\1. 「管理画面の他の読取経路は例外なく assignedPageIds で絞っている」は不正確。src/shared/domain/pages/admin-queries.ts:100-108 の getPageBySlugQuery と :159-172 の getActivePagesForAssignmentPickerQuery は query 層では絞っていない。前者は呼び出し側 (pages.ts:38) が fetch 後に requireAdminResourcePermission を当てて塞ぎ、後者は user:read を持たない EDITOR から到達できないだけで、「query に条件が入っている」形で守られているわけではない。正しい言い方は「EDITOR が到達できる page 読取のうち、事前絞り込みも事後 resource チェックも無いのは searchPages だけ」。
\2. 「resource-access.ts:12-22 の JSDoc が検索経路も対象と宣言している」は言い過ぎ。当該 JSDoc は userHasResourceAccess 自身の resourceId 契約 (page UUID 必須) を説明したもので、検索経路を名指ししていない。この経路が userHasResourceAccess を呼ばないこと自体は事実だが、JSDoc 違反ではない。

なお指摘の他の主張 (未公開・isActive:false も返る、rate limit は 60/分で実質妨げにならない、EDITOR の検索対象は page 1 件のみに縮む) はすべてコード上で確認済みで正しい。

---

### F-93

**顧客一括メールの rate limit が認証前かつ全体で 1 バケットのため、低権限アカウントが機能を 1 時間停止できる**

<sub>[対処の記録](2026-08-12-codebase-audit-progress.md) ／ [棄却一覧](2026-08-12-codebase-audit-refuted.md)</sub>

|        |                                                                          |
| ------ | ------------------------------------------------------------------------ |
| 深刻度 | 低                                                                       |
| 箇所   | `src/app/(admin)/admin/(dashboard)/_shared/actions/customer/bulk.ts:274` |
| 領域   | admin Server Action                                                      |

#### 起きること

customer:update を持たない VIEWER（または EDITOR）のスタッフアカウントで管理ダッシュボードにログインし、broadcastCustomersAction(\[\<任意の UUID\>\], "a", "b") を 3 回呼ぶ。zod は通り、rate limit チェックが executeAdminMutationResult より前にあるため 3 回ともトークンを消費してから RBAC で拒否される。バケットは固定文字列 "customer-broadcast" をキーにした global 1 本（3 回 / 1 時間、rate-limit.ts:497-500）なので、以降 1 時間は ADMIN が正規の顧客一括メールを送ろうとしても「リクエストが多すぎます」で送信できない。復旧手段は待つことだけで、なぜ塞がったのかを示す情報も残らない。

#### 直し方

rate limit チェックを executeAdminMutationResult の execute 内（認証 + RBAC 通過後）へ移すか、少なくともキーを user.id 単位にして 1 アカウントの消費が他アカウントの予算を食わないようにする。event-broadcast.ts:59 も同じ順序へ揃える。

#### 該当箇所

```
check: (_token) => customerBroadcastRateLimiter.check("customer-broadcast"),
```

#### 到達経路

src/app/(admin)/admin/(dashboard)/customers/page.tsx:61 (requireAdminDashboardPage — セッションのみ、VIEWER 通過) → src/app/(admin)/admin/(dashboard)/customers/\_components/CustomerTable.tsx:189 (CustomerBulkActions を role 無条件で描画) → src/app/(admin)/admin/(dashboard)/customers/\_components/CustomerBulkActions.tsx:199-207 (「一括メール送信」ボタン) → :123 broadcastCustomersAction(selectedIds, subject, body) → src/app/(admin)/admin/(dashboard)/\_shared/actions/customer/bulk.ts:266-271 (zod 通過) → :273-275 checkActionRateLimit({check: () =\> customerBroadcastRateLimiter.check("customer-broadcast")}) → src/shared/lib/action-helpers.ts:114-115 (IP を算出するがコールバックが破棄) → src/shared/lib/rate-limit.ts:106-112 (定数キーの count を +1、認証前に消費) → src/app/(admin)/admin/(dashboard)/\_shared/actions/customer/bulk.ts:278 executeAdminMutationResult → src/app/(admin)/admin/(dashboard)/\_shared/lib/admin-action.ts:75 checkAdminAuth(成功) → :95 hasPermission(VIEWER,"customer","update") === false (admin-permissions.ts:258-277 に customer:update 無し) → :102 拒否。3 回繰り返すと rate-limit.ts:98-104 が以後 1 時間 success:false を返し、ADMIN/SUPER\_ADMIN の正規送信も bulk.ts:276 で createMutationError に落ちる。

#### 既存の検査

\_\_tests\_\_/unit/architecture/public-mutation-guard-order.test.ts は (public) tree の Server Action 配列を SSoT にしており admin action を含まない。admin-permission-denial-mechanism.test.ts は拒否の実現方法を見るが rate limit との前後関係は見ていない。

#### 反証官による訂正

medium → low に補正。指摘の機序（認証前消費・グローバル 1 バケット）は正しいが、以下 4 点が事実として不正確または誇張。

\1. 「なぜ塞がったのかを示す情報も残らない」は誤り。バケットを消費する 3 回はいずれも RBAC まで到達するため、admin-action.ts:96 の logPermissionDenied が VIEWER の userId / resource "customer" / action "update" で AuditLog を残す。調査時に同時刻の permission-denied 3 件として必ず可視化される（rate limit 到達後の 4 回目以降は無記録、という区別が正しい）。

\2. 「復旧手段は待つことだけ」も不正確。バケットは InMemoryRateLimitStore（rate-limit.ts:71-119、LRUCache ttl=interval）のプロセスローカル状態で、Cloud Run インスタンスの再起動・再デプロイで消える。createRateLimiter は reset(token) も公開している（rate-limit.ts:134）。in-app の管理 UI が無いだけ。

\3. 攻撃前提が「IAP 越しに管理ダッシュボードへ入れる認証済みスタッフ」に限定される。外部の未認証者からは到達しない。実質は内部者による単一機能の 1 時間 DoS で、機密性・完全性の影響はゼロ、可用性影響も自動復旧する。

\4. 「機能を停止できる」の新規性が小さい。3 回/1 時間のグローバル上限自体は製品判断として明文化されており（bulk.ts:248-250、rate-limit.ts:493-496）、正規の ADMIN が 3 通送っても同じロックが起きる。本指摘が足しているのは「customer:update を持たない者もその予算を消費できる」点のみ。

補足（範囲外・別件）: event-broadcast.ts:57-58 のコメントは認証前配置の根拠を「IP 取得コスト無し」としているが、checkActionRateLimit は action-helpers.ts:114 で常に getClientIpFromHeaders() を呼んでから結果を捨てるため、この根拠は現実装と食い違っている。修正するなら check コールバックに token を渡さない専用ヘルパーに寄せるのが筋で、bulk.ts / event-broadcast.ts の両方に効く。

---

### F-94

**管理画面の手動「期限切れ」が次の WAITLISTED を繰り上げず、待機列が永久に stall する**

<sub>[対処の記録](2026-08-12-codebase-audit-progress.md) ／ [棄却一覧](2026-08-12-codebase-audit-refuted.md)</sub>

|        |                                                                           |
| ------ | ------------------------------------------------------------------------- |
| 深刻度 | 低                                                                        |
| 箇所   | `src/app/(admin)/admin/(dashboard)/_shared/actions/event-waitlist.ts:217` |
| 領域   | admin Server Action                                                       |

#### 起きること

定員 10 のスロットが満席、待機列は A(先頭)/B/C。1 名キャンセルで A が WAITLISTED\_OFFERED (24h offer) になる。A が支払わないまま管理者がイベント詳細の「期限切れにする」を押す → adminExpireWaitlistOfferAction → expireWaitlistOfferCommand は A を EXPIRED にするだけで offerNextWaitlistEntryCommand を呼ばない。cron /api/cron/waitlist-expire は findExpiredWaitlistOfferCandidates が status=WAITLISTED\_OFFERED の行しか拾わないため、EXPIRED になった A は二度と走査対象にならず、B には繰り上げ当選メールが永久に届かない。offer が専有していた 1 枠は別のキャンセルが偶然起きるまで空席のまま残り、B/C にも管理者にも異常の signal は一切出ない。

#### 直し方

expireWaitlistOfferCommand の select に slotId / ticketId を足し、claim 成功後に同一 tx 内で offerNextWaitlistEntryCommand を呼んで promoted を戻り値に載せる（expireAndPromoteWaitlistForEventCommand と同型）。action 側は promoted があれば sendEventWaitlistOffered + fireEventWaitlistOfferedAdminNotification を発火する（adminPromoteWaitlistEntryAction の afterSuccess と同じ経路を再利用）。回帰ガードは「EXPIRED へ遷移させる全 command が offerNextWaitlistEntryCommand を呼ぶ」を見る 1 本で足りる。

#### 該当箇所

```
const { registration } = await expireWaitlistOfferCommand({
```

#### 到達経路

src/app/(admin)/admin/(dashboard)/events/\[id\]/waitlist/\_components/WaitlistQueueTable.tsx:176-185 (status===WAITLISTED\_OFFERED に「期限切れにする」を描画) → 同ファイル:78 handleExpire → src/app/(admin)/admin/(dashboard)/\_shared/actions/event-waitlist.ts:204 adminExpireWaitlistOfferAction → 同:217 expireWaitlistOfferCommand → src/shared/domain/events/waitlist-offer-commands.ts:154-166 (select は id/eventId/email/name/paymentStatus のみ、slotId/ticketId 無し) → 同:178-187 updateMany{status: EXPIRED} → 同:190-197 return（offerNextWaitlistEntryCommand の呼び出しが関数全体に無い） → src/shared/domain/events/waitlist-queries.ts:411-417 findExpiredWaitlistOfferCandidates は where status: WAITLISTED\_OFFERED のため EXPIRED 行を二度と拾わない → 結果: 同一 (slotId, ticketId) の FIFO 先頭 B は WAITLISTED のまま offer メールを受け取らない。対照群: 同ファイル:306 (cron) / src/shared/domain/events/unpaid-expiry.ts:152 / src/shared/domain/events/registration-cancel-core.ts:207 はいずれも claim 成功後に offerNextWaitlistEntryCommand を呼ぶ。

#### 既存の検査

\_\_tests\_\_/unit/domain/events/waitlist-commands.test.ts は expireWaitlistOfferCommand について paymentStatus: PENDING ガード（Codex P1-C / PR#1080）だけを検査し、promote の有無を assert していない。\_\_tests\_\_/unit/actions/admin-event-waitlist.test.ts も監査ログとメール送出の shape のみ。architecture gate に該当なし。

#### 反証官による訂正

high → low に補正。失敗シナリオの被害記述に 3 つの事実誤認がある。(1)「offer が専有していた 1 枠は空席のまま残る」は誤り。このコードベースの在庫会計は CONFIRMED のみを数える（slot-queries.ts:92-99 の groupBy where status: CONFIRMED、同:117/:134、public-slot-options.ts:179）。WAITLISTED\_OFFERED は在庫を 1 枠も押さえていないので、A の offer 中も EXPIRED 化後も残席は同じで、その枠は公開側で売りに出たままである。失われるのは席ではなく B の FIFO 順番だけ。(2)「永久に stall」は誤り。B は FIFO 先頭のままなので、同じ (slotId, ticketId) で次に CONFIRMED がキャンセルされれば registration-cancel-core.ts:207 が、未入金失効が起きれば unpaid-expiry.ts:152 が自動で B を promote する。stall するのは「この 1 回分の順番送り」であって待機列そのものではない。(3)「管理者にも異常の signal は一切出ない」は誤り。ボタンは待機列テーブル自身の中にあり（WaitlistQueueTable.tsx:167-175 が全 WAITLISTED 行に「今すぐ繰り上げ」を描画）、handleExpire は :88 で router.refresh() する。expire 直後に A が一覧から消え（EXPIRED は WAITLIST\_ACTIVE\_STATUSES 外、helpers.ts:671-675 / waitlist-queries.ts:185-196）、B が先頭に上がった状態が同じ画面に出る。押した本人が 1 クリックで復旧できる。場所の記述も「イベント詳細」ではなく待機列タブ (events/\[id\]/waitlist)。さらに、これがバグか仕様かは確定できない: 関数名と JSDoc が意図的に分けられており（waitlist-offer-commands.ts:117-119「called from admin manual expire only — the cron path uses expireAndPromoteWaitlistForEventCommand instead」）、admin 手動 waitlist 操作は capacity チェックを意図的に飛ばす override と明記されている（waitlist-register-commands.ts:457-461）。admin が容量超過で手動 promote した offer を expire する場合、自動 promote は「次の人に offer し直す」を強制してしまい override を取り消せなくなる。修正するなら製品意図の確認が先で、実装欠陥として無条件に直す対象ではない。指摘のうち既存カバレッジの申告（PENDING ガードと監査ログ/メール shape のみ、該当 gate 無し）は正確。

---

### F-95

**Google Calendar 設定保存が NOTIFICATION\_SETTINGS を無効化せず、.ics 添付／カレンダー追加リンクの OFF が数日反映されない**

<sub>[対処の記録](2026-08-12-codebase-audit-progress.md) ／ [棄却一覧](2026-08-12-codebase-audit-refuted.md)</sub>

|        |                                                                                     |
| ------ | ----------------------------------------------------------------------------------- |
| 深刻度 | 低                                                                                  |
| 箇所   | `src/app/(admin)/admin/(dashboard)/_shared/actions/settings/google-calendar.ts:101` |
| 領域   | 設定                                                                                |

#### 起きること

管理者が /admin/settings/integrations の Google Calendar タブで「予約確認メールに .ics を添付する」(icalAttachmentEnabled) または「カレンダーに追加リンクを表示する」(addToCalendarLinksEnabled) を OFF にして保存する。updateGoogleCalendarSettingsCommand はこの 2 列を SettingsGoogleCalendar に書く（google-calendar-commands.ts:50-51）が、afterSuccess は refreshIntegrationSettings → invalidateSiteWideCache(CACHE\_TAGS.INTEGRATION\_SETTINGS) だけを呼ぶ。この 2 列を読む唯一の producer は getCalendarEmailSettings（queries/notification.ts:181-208）で、cacheTag は NOTIFICATION\_SETTINGS、cacheLife は STATIC\_SETTINGS = "days"。NOTIFICATION\_SETTINGS を updateTag するのは actions/settings/email.ts:105 と :137 の 2 箇所のみで、Google Calendar 設定の保存経路からは呼ばれない。結果、OFF にしたはずの .ics 添付と「カレンダーに追加」リンクが、以後**数日間**すべての予約確認メール・イベントメール・リマインダーメールに付き続ける。管理画面の表示は getAdminSettings（非キャッシュ）由来なので OFF に見えており、管理者は不整合に気づけない。復旧手段はメール設定フォームを保存して NOTIFICATION\_SETTINGS を巻き添えで無効化することだけだが、その関係は UI 上どこにも示されていない。

#### 直し方

updateGoogleCalendarSettings の afterSuccess を INTEGRATION\_SETTINGS + NOTIFICATION\_SETTINGS の両方を無効化する専用ハンドラに変える（updateEmailSettings と同じく updateTag(CACHE\_TAGS.NOTIFICATION\_SETTINGS) を併記、CDN 露出は無いので skipCdnPurge は維持）。あわせて settings-cache-tag-coverage.test.ts の SETTINGS\_COLUMN\_TAGS と ACTIONS にこの 2 列と action を追加して機械強制の対象に入れる。

#### 該当箇所

```
afterSuccess: refreshIntegrationSettings,
```

#### 到達経路

src/app/(admin)/admin/(dashboard)/settings/\_components/sections/GoogleCalendarSection.tsx:65 (useActionState(updateGoogleCalendarSettings)) / :543 (icalAttachmentEnabled トグルを OFF にして送信) → src/app/(admin)/admin/(dashboard)/\_shared/actions/settings/google-calendar.ts:90-98 (updateGoogleCalendarSettingsCommand に icalAttachmentEnabled/addToCalendarLinksEnabled を渡す) → src/shared/domain/settings/google-calendar-commands.ts:48-50,80 (SettingsGoogleCalendar upsert = DB は OFF になる) → src/app/(admin)/admin/(dashboard)/\_shared/actions/settings/google-calendar.ts:101 (afterSuccess: refreshIntegrationSettings) → 同ファイル:67-71 (invalidateSiteWideCache(CACHE\_TAGS.INTEGRATION\_SETTINGS, {skipCdnPurge:true})) → src/shared/lib/cache/site-wide.ts:70 (updateTag("integration-settings") のみ。"notification-settings" は触らない) → src/shared/domain/settings/queries/notification.ts:185-187 ("use cache" / cacheLife(CACHE\_LIFE.STATIC\_SETTINGS = "days", src/shared/lib/constants/cache.ts:37) / cacheTag(CACHE\_TAGS.NOTIFICATION\_SETTINGS)) のエントリが失効せず旧値 true を返す → src/shared/domain/settings/queries/email-render-context.ts:129/150/267 (getCalendarEmailSettings()) → src/shared/lib/email/reservation-emails.ts:184 (if (calendarSettings.icalAttachmentEnabled) → .ics を添付) / :133 (addToCalendarLinksEnabled → 「カレンダーに追加」リンクを描画)、src/shared/lib/email/reminder-emails.ts:69、src/shared/lib/email/event-emails.ts:199 でも同様 → 誤った結果: 管理画面 (getAdminSettings は非キャッシュ、src/shared/domain/settings/admin-queries.ts:382) では OFF 表示なのに、送信メールと /reservation/complete/page.tsx:90・/reservation/status/page.tsx:187 では ON のまま。復旧は src/app/(admin)/admin/(dashboard)/\_shared/actions/settings/email.ts:105 / :137 の updateTag(CACHE\_TAGS.NOTIFICATION\_SETTINGS) を踏むか、cacheLife 期限切れ待ちのみ。

#### 既存の検査

未捕捉。\_\_tests\_\_/unit/actions/settings-cache-tag-coverage.test.ts の ACTIONS 配列は updateBasicInfo / updateBusinessInfo / updateBusinessHoursSettings / updateSearchVerification の 4 件のみで、SETTINGS\_COLUMN\_TAGS にも icalAttachmentEnabled / addToCalendarLinksEnabled のエントリが無い（同ファイル冒頭 JSDoc が「網羅対象は現在 settings actions で update している列に限る」と明記）。\_\_tests\_\_/integration/actions/admin/settings-google-calendar.test.ts は googleCalendarFormSchema と googleCalendarConnectionTestSchema の検証のみでキャッシュには触れない。

#### 反証官による訂正

核心（tag 不一致）は正しいが、影響の記述に誇張と欠落がある。(1) 「数日間付き続ける」は過大。CACHE\_LIFE.STATIC\_SETTINGS は cache.ts:37 で "days"、これは Next 組み込みプロファイル（revalidate 1 日 / expire 1 週）で stale-while-revalidate。実際に誤った設定でメールが出るのは最大 ~1 日 + 再検証を起こす直後の 1 通で、以後は自動回復する。恒久的固定でも「数日確定」でもない。(2) 「復旧手段はメール設定フォームの保存だけ」も不正確。email.ts:105 (updateEmailSettings) だけでなく :137 (updateNotificationSettings) でも巻き添え無効化が起き、加えて再デプロイでも "use cache" エントリは実質破棄される。(3) 逆に影響範囲は過小申告。メール 3 系統だけでなく、同じ producer を読む公開ページ src/app/(public)/reservation/complete/page.tsx:70,90 と src/app/(public)/reservation/status/page.tsx:117,187 の「カレンダーに追加」ボタンも同じ tag のキャッシュ越しなので stale になる。また OFF→ON 方向（表示させたいのに出ない）も同じ遅延を受ける。(4) gate 未カバーの申告は正確に確認できた（ACTIONS は 4 件、SETTINGS\_COLUMN\_TAGS に当該 2 列なし、integration テストは schema 検証のみ）。(5) 深刻度は medium → low に補正。データ破壊・認可・課金への影響は無く、症状は「添付とリンクの有無」という表示上のもので、最大 1 日程度で自己回復するため。ただし管理者側に不整合の手がかりが無い点は指摘のとおりで、修正は afterSuccess に CACHE\_TAGS.NOTIFICATION\_SETTINGS を足す 1 行 + settings-cache-tag-coverage.test.ts の SSoT 拡張で足りる。

---

### F-96

**FigmaNode のラベルも公開ページで消える（data-figma-label を描画する実装が無い）**

<sub>[対処の記録](2026-08-12-codebase-audit-progress.md) ／ [棄却一覧](2026-08-12-codebase-audit-refuted.md)</sub>

|        |                                                                                             |
| ------ | ------------------------------------------------------------------------------------------- |
| 深刻度 | 低                                                                                          |
| 箇所   | `src/app/(admin)/admin/(dashboard)/_shared/components/editor/lexical/nodes/FigmaNode.ts:94` |
| 領域   | Lexical ノード                                                                              |

#### 起きること

管理者が Figma 埋め込みにラベルを設定すると、エディタでは decorator が見出し帯としてラベルを描画し、iframe の title にも使う（FigmaNode.decorator.client.tsx:31-35 の `{label && (<p ...>{label}</p>)}` と :40 `title={label || "Figma デザイン"}`）。exportDOM はラベルを data-figma-label 属性に入れるだけで可視要素を出さず、iframe にも title を付けない（FigmaNode.ts:91-101）。リポジトリ内で data-figma-label を読むのは同ファイルの importDOM (FigmaNode.ts:71) だけで、lexical-content.css には \[data-figma\] と \[data-figma\] \> iframe しか無くラベル用の規則が無い。よって公開ページではラベルが完全に消え、iframe もアクセシブルネームを失う。MapEmbedNode と同型で、AudioNode（exportDOM で data-audio-title-text / data-audio-artist-text を可視出力）だけが正しい形になっている。

#### 直し方

AudioNode.ts:93-110 と同じく exportDOM でラベルを可視要素として出力し、iframe に title 属性（label または既定文言）を付ける。

#### 該当箇所

```
wrapper.setAttribute("data-figma-label", $getState(this, figmaLabelState));
```

#### 到達経路

src/app/(admin)/admin/(dashboard)/\_shared/components/editor/lexical/config/insert-items/embed.ts:78-87 (picker の "figma" → dialogId:"figma") → src/app/(admin)/admin/(dashboard)/\_shared/components/editor/lexical/plugins/FigmaPlugin.tsx:90-97 (「ラベル（任意）」入力) → FigmaPlugin.tsx:46-50 ($createFigmaNode({embedUrl, label}) → $insertNodeToNearestRoot) → src/app/(admin)/admin/(dashboard)/\_shared/components/editor/lexical/nodes/FigmaNode.ts:124 ($setState(node, figmaLabelState, label)) → 保存: src/app/(admin)/admin/(dashboard)/\_shared/components/editor/lexical/preview/derive-lexical-content-html-core.ts:24-25 (finalizeLexicalExportedHtml(renderEditorStateJsonToHtmlCore(json))) → src/app/(admin)/admin/(dashboard)/\_shared/components/editor/lexical/preview/render-editor-state-json-to-html-core.ts:32 ($generateHtmlFromNodes → exportDOM 経路。decorator は通らない) → src/app/(admin)/admin/(dashboard)/\_shared/components/editor/lexical/nodes/FigmaNode.ts:91-101 (分岐なし。\<div data-figma data-figma-label="ラベル"\>\<iframe src loading allow\>\</div\> を出力し、可視要素も iframe title も出さない) → src/shared/lib/html/lexical-content-html-pipeline.ts:8 (sanitizeLexicalContentHtml) → src/shared/lib/html/lexical-html-sanitize-config.ts:16 ("data-\*" glob により data-figma-label は生存。ただし読み手が居ない) → 公開描画: src/shared/components/SanitizedHtml.tsx:154-161 (dangerouslySetInnerHTML のみ。data-figma-label を扱う分岐なし) + src/shared/styles/lexical-content.css:1770-1779 (\[data-figma\] / \[data-figma\] \> iframe の 2 規則のみ) → 誤った結果: 管理者が入力したラベルが公開ページに一切描画されず、iframe もアクセシブルネームを持たない（比較: YouTubeNode.tsx:149 / VimeoNode.tsx:131 / InstagramNode.tsx:153 / XNode.tsx:136 は exportDOM で iframe title を付ける）。

#### 既存の検査

data-figma-label を検証するテストも CSS 規則も存在しない（参照は FigmaNode.ts の 2 箇所のみ）。

#### 反証官による訂正

medium は過大。理由: (a) データ喪失ではない。ラベルは contentHtml 中の data-figma-label に保持され、FigmaNode.ts:71 の importDOM が読み戻すのでエディタへ復元できる。壊れるのは「公開側の見た目とアクセシブルネーム」だけ。(b) 機能が周辺的。Figma 挿入は embed.ts:84 で showInToolbar:false（picker 経由のみ）で、レンタルスペース予約サイトの公開コンテンツで使われる想定が薄い。(c) 正しさ・セキュリティ・整合性への影響がゼロ（sanitizer もスキーマも無傷）。

事実誤認の訂正:
\1. 「AudioNode だけが正しい形になっている」は誤り。iframe の title は YouTubeNode.tsx:149 / VimeoNode.tsx:131 / InstagramNode.tsx:153 / XNode.tsx:136 の 4 ノードが exportDOM で付けており、付けていないのは Figma / Spotify / MapEmbed の 3 つ。AudioNode が唯一なのは「可視テキストを exportDOM に出す」点だけで、a11y 名の観点では多数派が正しい形になっている。
\2. MapEmbedNode との「同型」には差がある。MapEmbedNode.tsx:148 は `if (label)` で非空時のみ属性を出すが、FigmaNode.ts:94 は無条件に設定するため、ラベル未設定でも公開 HTML に `data-figma-label=""` が常に残る。実害はないが「同型」ではない。
\3. 指摘が検証していない点を補足すると、修正は sanitizer にブロックされない。iframe の `title` は sanitize-content-html-core.ts:61 の IFRAME\_ATTRIBUTES に既に含まれ、可視要素を出す場合の `p`/`div` も LEXICAL\_ALLOWED\_TAGS 内。つまり「出せば通る」状態で、単に出していないだけ。
\4. カバレッジ不在の理由も明確にしておくと、Gate E (ssot-drift-gates.test.ts:646-669) は extractTagNames によるタグ集合比較であり、属性・可視テキストの欠落は原理的に検出範囲外。加えて代表ドキュメント (:557-559) の $createFigmaNode は label 引数自体を渡していない。

---

### F-97

**MapEmbedNode のラベルが公開ページに一切描画されない（data-map-label は書き込み専用で CSS も hydrate も無い）**

<sub>[対処の記録](2026-08-12-codebase-audit-progress.md) ／ [棄却一覧](2026-08-12-codebase-audit-refuted.md)</sub>

|        |                                                                                                  |
| ------ | ------------------------------------------------------------------------------------------------ |
| 深刻度 | 低                                                                                               |
| 箇所   | `src/app/(admin)/admin/(dashboard)/_shared/components/editor/lexical/nodes/MapEmbedNode.tsx:148` |
| 領域   | Lexical ノード                                                                                   |

#### 起きること

管理者が「Google マップを挿入」ダイアログでラベル欄に「アクセスマップ」と入力して挿入する（MapEmbedPlugin.tsx:98-105 の Label + Input、:54 で $createMapEmbedNode(embedUrl, label)）。エディタでは decorate() が `<p className="text-sm text-muted-foreground">{label}</p>` を描画するのでラベルが見える（MapEmbedNode.tsx:95）。しかし exportDOM は可視要素を一切出さず data-map-label 属性に入れるだけで、公開側にその属性を読む実装が無い（リポジトリ全体で data-map-label を参照するのは同ファイルの importDOM MapEmbedNode.tsx:77 のみ。src/shared/styles/lexical-content.css に data-map で始まるセレクタは 0 件で、SanitizedHtml.tsx の hydrate 対象も \[data-tabs-container\] と img のみ）。結果、公開ページではラベルが消える。同時に exportDOM の iframe には title 属性が付かない（MapEmbedNode.tsx:149-152。YouTube/Vimeo/X/Instagram はいずれも title を出している）ため、埋め込み地図がアクセシブルネームを失う。さらに \[data-map\] のスタイル規則が無いため、YouTube/Vimeo/Spotify/Figma/Instagram が持つ aspect-ratio・幅指定（lexical-content.css:1703 以降）を受けられず、公開ページの地図は iframe 既定の 300x150 で描画される。

#### 直し方

AudioNode.ts:93-110 と同じ形にする — exportDOM でラベルを可視要素として出力し（例: `<p data-map-label-text>`）、iframe に `title` を付ける。合わせて lexical-content.css に \[data-map\] / \[data-map\] \> iframe の規則（他の埋め込みと同じ aspect-ratio + 幅）を追加する。

#### 該当箇所

```
if (label) div.setAttribute("data-map-label", label);
```

#### 到達経路

src/app/(admin)/admin/(dashboard)/\_shared/components/editor/lexical/plugins/MapEmbedPlugin.tsx:98-105（ラベル入力）→ 同:54 `$createMapEmbedNode(embedUrl, label)` → src/app/(admin)/admin/(dashboard)/\_shared/components/editor/lexical/nodes/MapEmbedNode.tsx:190 `$setState(node, mapLabelState, mapLabel)` → 保存時 src/app/(admin)/admin/(dashboard)/\_shared/components/editor/lexical/preview/derive-lexical-content-html-core.ts:22 `finalizeLexicalExportedHtml(renderEditorStateJsonToHtmlCore(contentJson))` → MapEmbedNode.tsx:144-155 exportDOM が `<div data-map data-map-label="..."><iframe src loading referrerpolicy></div>` を出力（:148 でラベルは属性へ／:149-152 で iframe に title も width/height も付けない） → src/shared/lib/html/lexical-content-html-pipeline.ts:8 → src/shared/lib/html/sanitize-content-html-core.ts:90（`"*": LEXICAL_HTML_GLOBAL_ATTRIBUTES` = data-\* 許可なので属性は残るが誰も読まない） → 公開ページ src/shared/components/SanitizedHtml.tsx:160 `dangerouslySetInnerHTML`（hydrate は :58 hydrateLexicalTabs = `[data-tabs-container]` と :106 attachBrokenImageFallback = `img` のみ） → src/shared/styles/lexical-content.css に `[data-map]` 規則が無い（1703-1800 に他 6 埋め込みの規則のみ） → 誤った結果: 公開ページの地図はラベル非表示・iframe にアクセシブルネーム無し・sizing 規則も width/height 属性も無いため UA 既定寸法（300x150）で描画される

#### 既存の検査

data-map / data-map-label を検証するテストも CSS も存在しない（リポジトリ内の参照は MapEmbedNode.tsx の 4 箇所のみ）。embed-node-sanitize-pipeline.test.ts は sanitize 通過を見るだけでラベルの可視化は検査していない。

#### 反証官による訂正

事実は概ね正しいが、見出しの重み付けが逆で「MapEmbed 固有」という含意が不正確。

\1) ラベル非描画は MapEmbed 固有ではなく、FigmaNode と同一の既存パターン。FigmaNode.ts:94 は同じく `data-figma-label` を書くだけで、FigmaNode.decorator.client.tsx:31-33/40 はエディタ側でだけラベルを可視 `<p>` と iframe title に使う。`data-figma-label` を読む実装も同ファイルの importDOM（FigmaNode.ts:71）以外に無い（grep 済み）。つまり「label はエディタ側の表示＋round-trip 保存用メタデータ」という慣行が既に 2 node に跨って成立しており、MapEmbed だけが壊れているのではない。またラベルはデータとしては失われない（contentJson と data-map-label に残り、MapEmbedNode.tsx:77 の importDOM で編集画面に戻る）。「消失」ではなく「公開側レンダラ未実装」。

\2) 「YouTube/Vimeo/X/Instagram はいずれも title を出している」は文字どおりには正しいが、埋め込み 7 種のうち title を出すのは実際にはこの 4 つだけで、Spotify（SpotifyNode.ts:126-129）と Figma（FigmaNode.ts:95-98）も title を出していない。iframe title 欠落も MapEmbed 単独の劣化ではなく 3 node 共通のギャップで、指摘としての価値は低い。

\3) 3 点の中で唯一 MapEmbed 固有かつ実害があるのは、指摘が「さらに」として最後に付けた CSS 被覆の欠落。`[data-map]` の規則が 0 件なのは 7 種の埋め込みコンテナの中で MapEmbed だけで（lexical-content.css:1703/1724/1740/1756/1770/1783 に他 6 種）、ラベルの有無に関係なくすべての地図埋め込みが公開ページで 300x150 になる。指摘の見出しはここを主題にすべきだった。

\4) 深刻度: 正しさ・データ・セキュリティへの影響は無く、失われるものも無い（再編集で復元可能）。影響は「エディタ表示と公開表示の乖離」という視覚/a11y の範囲に閉じ、かつ影響を受けるのはこの任意機能を使った本文のみ（公開サイトのアクセスマップは別系統の src/app/(public)/\_components/MapSection.tsx が担当）。medium は過大で low が妥当。

---

### F-98

**TabTitleNode の exportDOM が type 無しの \<button\> を出し、sanitize allowlist も type を通さないため再同意フォーム内で暗黙の submit ボタンになる**

<sub>[対処の記録](2026-08-12-codebase-audit-progress.md) ／ [棄却一覧](2026-08-12-codebase-audit-refuted.md)</sub>

|        |                                                                                                 |
| ------ | ----------------------------------------------------------------------------------------------- |
| 深刻度 | 低                                                                                              |
| 箇所   | `src/app/(admin)/admin/(dashboard)/_shared/components/editor/lexical/nodes/TabTitleNode.tsx:84` |
| 領域   | Lexical ノード                                                                                  |

#### 起きること

規約本文（terms）に Tabs ブロックが含まれると、contentHtml には `<button role="tab" data-tab-index="0" aria-selected="true">` が入る。この HTML は再同意画面で \<form\> の内側に描画される（reagree-form.tsx:62 の \<form\> 内、:108 と :124 の \<SanitizedHtml\>）。\<button\> に type が無いので既定は submit であり、しかも sanitize-content-html-core.ts:75-91 の allowedAttributes に button の項目が無い（グローバルの class/id/role/data-\*/aria-\* だけ）ため、ノード側で type="button" を出しても保存時に剥がされる。クリック時の submit を止めているのは SanitizedHtml.tsx:92-95 の `event.preventDefault()` だけで、これは useEffect 内の hydrateLexicalTabs が走った後にしか効かない。ユーザーが全チェックボックスを付けた直後、hydration 完了前にタブを押すと（checkbox は required なので検証も通る）再同意フォームがそのまま送信され、reagreeAction の redirect でページを離脱する。sanitizeRawEmbedHtml 側だけは button に type/disabled を許している（sanitize-content-html-core.ts:173）ため、Lexical 経路だけが取り残されている。

#### 直し方

TabTitleNode.exportDOM で `element.setAttribute("type", "button")` を出し、同時に sanitize-content-html-core.ts の Lexical 側 allowedAttributes に `button: ["type"]` を追加して属性が保存時に落ちないようにする（sanitizeRawEmbedHtml 側は既に許可済み）。

#### 該当箇所

```
const element = document.createElement("button");
```

#### 到達経路

src/app/(public)/mypage/terms/reagree/page.tsx:51 sanitizeRenderedContentHtml → src/shared/lib/html/sanitize.ts:33 → src/shared/lib/html/sanitize-content-html-core.ts:50（button はタグ許可）/ :75-91（button 用 allowedAttributes 無し＝type は除去、global の role/data-\*/aria-\* のみ残る）→ src/app/(public)/mypage/terms/reagree/\_components/reagree-form.tsx:62 `<form {...getFormProps(form)} action={formAction}>` → :108 `<SanitizedHtml sanitizedHtml={term.contentHtml} />` → src/shared/components/SanitizedHtml.tsx:160 dangerouslySetInnerHTML で src/app/(admin)/admin/(dashboard)/\_shared/components/editor/lexical/nodes/TabTitleNode.tsx:84-88 由来の type 無し `<button role="tab">` が form 内に出現 → SanitizedHtml.tsx:143-152 の useEffect 実行前は :96 tab.addEventListener("click") が未登録＝:93 event.preventDefault() が効かない → HTML 既定の type=submit で form 送信（node\_modules/react-dom/cjs/react-dom-server.node.development.js:4077-4102 により SSR 時点で実 action URL が出ているので実 POST になる）→ src/app/(public)/mypage/terms/reagree/\_actions.ts:34 reagreeAction が起動し、全 pending が checked なら recordTermsAgreementsCommand → redirect でページ離脱。

#### 既存の検査

SanitizedHtml.tsx の hydrateLexicalTabs を検証するテストは見当たらず、規約本文に Tabs を含めた再同意フォームの E2E も無い。sanitize の button 属性契約を固定するテストも見つからなかった。

#### 反証官による訂正

事実誤認と過大評価の補正。(1)「checkbox は required なので検証も通る」は誤り。conform の useNoValidate は既定値 true の useState で初期化され（node\_modules/@conform-to/react/dist/hooks.js:19-21）、getFormProps が noValidate を返す（dist/helpers.js:50）ので、SSR された最初の HTML から native 検証は無効。required は最初から一切効いていない。したがって「全部チェックしてから」という前提抜きでも hydration 前 submit は飛ぶ一方、サーバー側 \_actions.ts の pending⊇agreed 強制（missing.length\>0 → "すべての規約に同意する必要があります"）と reagree-schema.ts の min(1) が受け止めるため、未チェックでの誤同意は成立しない。実害は (a) 全チェック済みなら「本人が次に押すはずだった submit と同一の結果」、(b) 未チェックなら full POST 後にエラー表示、の二択で、データ破壊・権限昇格・consent の偽造はいずれも無い。(2) hydration 後は無害であることを構造で確認済み: TabsContainerNode.exportDOM:161 の data-tabs-container と TabListNode.exportDOM:54 の role=tablist が SanitizedHtml.tsx:66/70 の `:scope >` セレクタと一致するため、通常構造の Tabs には必ず preventDefault が付く。エディタ内は createDOM が div（TabTitleNode.tsx:94）なので無関係。(3) 発火には「管理者が規約本文に Tabs ブロックを入れる」＋「hydration 未完了 or JS 無効の窓でタブをクリック」が同時に要る。前者は可能だが規約文書としては非典型、後者は SSR 一般に存在する短い窓（JS 無効なら常時）。(4) 「ノード側で type="button" を出しても剥がされる」は正しく、修正は TabTitleNode の exportDOM と sanitize-content-html-core.ts:75-91 の button allowlist（値を "button" に限定する形が望ましい）の 2 点セットになる。sanitizeRawEmbedHtml:173 だけが button:\["type","disabled"\] を許しているという指摘も事実。(5) 既存カバレッジの申告はほぼ正しいが、html-sanitize.test.ts:64-84 が button タグ保持自体は既に固定している（type 契約のテストが無いだけ）。

---

### F-99

**「全置換」が自己重複する検索語で余分な置換を行い本文を壊す**

<sub>[対処の記録](2026-08-12-codebase-audit-progress.md) ／ [棄却一覧](2026-08-12-codebase-audit-refuted.md)</sub>

|        |                                                                                                         |
| ------ | ------------------------------------------------------------------------------------------------------- |
| 深刻度 | 低                                                                                                      |
| 箇所   | `src/app/(admin)/admin/(dashboard)/_shared/components/editor/lexical/plugins/FindReplacePlugin.tsx:212` |
| 領域   | Lexical プラグイン                                                                                      |

#### 起きること

本文の段落に「ーーーー」（長音 4 つ）が入っている状態で、検索「ーー」置換「—」→「全置換」。indexOf の再開位置が index+1 なので重複マッチを 3 回拾い、lastIndex(=index+2) より小さい index に対する text.slice(lastIndex, index) が空文字になるため、結果は「——」（正しい 2 回置換）ではなく「———」になる。原文の文字が消え、置換文字が 1 個多く残る。「。。。。」「 」（連続スペース）「--」など、繰り返し記号を正規化する用途で必ず踏む。

#### 直し方

非重複検索にする（`startIdx = index + searchText.length;`）。同ファイル 92 行 `startIndex = index + 1;`（findMatches）も同じ理由で件数表示を水増ししているので合わせて直す。

#### 該当箇所

```
startIdx = index + 1;
```

#### 到達経路

src/app/(admin)/admin/(dashboard)/news/\_components/NewsEditor.tsx:166 (LazyLexicalEditor) → src/app/(admin)/admin/(dashboard)/\_shared/components/editor/lexical/LexicalEditor.tsx:106,215 (contentWrapperRef = useState + callback ref, マウント後に非 null) → LexicalEditor.tsx:297 \<FindReplacePlugin anchorElem={contentWrapperRef} /\> → FindReplacePlugin.tsx:372-382 (Ctrl+F / Ctrl+H で setIsOpen(true)) → FindReplacePlugin.tsx:389 (isOpen && anchorElem 非 null なのでガード通過) → FindReplacePlugin.tsx:298 (置換トグル setShowIconReplace) → FindReplacePlugin.tsx:320,343 (全置換ボタン onClick=handleIconReplaceAll、disabled は matchCount\>0 なので無効) → FindReplacePlugin.tsx:187 (matchCount===0 ガード通過。matchCount は FindReplacePlugin.tsx:131 → findMatches:83-93 が startIndex=index+1 で重複を数え、"ーーーー"/"ーー" で 3) → FindReplacePlugin.tsx:206-213 ループ: index=0 → result="—", lastIndex=2, startIdx=1 / index=1 → text.slice(2,1)==="" なので result="——", lastIndex=3, startIdx=2 / index=2 → text.slice(3,2)==="" なので result="———", lastIndex=4, startIdx=3 → FindReplacePlugin.tsx:214 result += text.slice(4) === "" → FindReplacePlugin.tsx:216 node.setTextContent("———")（正しくは "——"）

#### 既存の検査

findMatches / handleIconReplaceAll はコンポーネント内クロージャで export されておらず、unit テストは存在しない。

#### 反証官による訂正

欠陥の機序・行番号・失敗シナリオはすべて実測どおりで、事実誤認は無い。深刻度だけ medium → low に補正する。理由: (a) 管理画面のエディタ UI 限定で、公開面・API・DB 制約には触れない。(b) 破綻するのは「検索語が自分自身と重なる」場合だけで、非自己重複語では正しく動く（実測: "abc"→"abcabc"、"o"→"hello world" は正解）。(c) 結果はエディタ上に即座に見える文字列変化で、LexicalEditor.tsx:256 の HistoryPlugin が有効なので Ctrl+Z で戻せる。保存操作を挟まない限り永続化されない。指摘本文の細部に 2 点だけ不正確な箇所がある(判定には影響しない): (1)「findMatches はコンポーネント内クロージャ」は誤りで、findMatches は module スコープの関数 (FindReplacePlugin.tsx:66)。ただし export されておらず unit テストが無いという結論部分は正しい。handleIconReplaceAll の方は確かにコンポーネント内クロージャ。(2) 到達経路の「Ctrl+H → 全置換」は 1 手足りない。Ctrl+F と Ctrl+H は FindReplacePlugin.tsx:372-382 でどちらも setIsOpen(true) しかせず挙動が同一で、showIconReplace の初期値は false (:114) なので、置換行を出すには :298 のトグルボタンを押す必要がある。あわせて、指摘されていないが同根の欠陥が 2 つある(参考): findMatches:92 の同じ index+1 再開により、(i) 件数表示 ":246" が実際の非重複マッチ数より多く出る("ーーーー"/"ーー" で "1/3")、(ii) 単発の「置換」handleIconReplace:172 も重複マッチを currentMatchIndex で掴むため、2 番目以降を選ぶと 1 文字ずれた位置を置換する。修正するなら 2 箇所とも再開位置を index + searchText.length にする（searchText 空文字は :71 と :166/:187 で弾かれているため無限ループにはならない）。

---

### F-100

**Ctrl+Shift+数字 の見出し / リスト ショートカットが一切効かない**

<sub>[対処の記録](2026-08-12-codebase-audit-progress.md) ／ [棄却一覧](2026-08-12-codebase-audit-refuted.md)</sub>

|        |                                                                                                               |
| ------ | ------------------------------------------------------------------------------------------------------------- |
| 深刻度 | 低                                                                                                            |
| 箇所   | `src/app/(admin)/admin/(dashboard)/_shared/components/editor/lexical/plugins/KeyboardShortcutsPlugin.tsx:170` |
| 領域   | Lexical プラグイン                                                                                            |

#### 起きること

管理者が本文にキャレットを置いて Ctrl+Shift+2 を押す（ショートカット一覧ダイアログに「見出し2」と表示されている）。KeyboardEvent.key は Shift 修飾を反映した文字を返すため JIS / US 配列ではこのとき "\\""（US では "@"）であり "1"〜"6" の範囲に入らず、見出しにならず何も起きない。同じ理由で Ctrl+Shift+7（"'" / "&"）、Ctrl+Shift+8（"(" / "\*"）、Ctrl+Shift+/（"?"）も無反応。同ファイルは英字については event.key が "g"/"G" 両方になることを扱っている（216・223 行）のに数字・記号だけ未対応。162 行の `event.key === "Numpad0"` も key には現れない値（それは event.code）で恒常的に死んでいる。

#### 直し方

数字・記号キーは event.code（"Digit1"…"Digit6", "Numpad0", "Slash"）で判定する。event.key に依存するのは Shift の影響を受けない英字だけにする。

#### 該当箇所

```
if (event.key >= "1" && event.key <= "6") {
```

#### 到達経路

src/app/(admin)/admin/(dashboard)/\_shared/components/editor/lexical/LexicalEditor.tsx:299 で \<KeyboardShortcutsPlugin\> をマウント → src/.../plugins/KeyboardShortcutsPlugin.tsx:153-155 useEffect で editor.registerCommand(KEY\_DOWN\_COMMAND, handler, COMMAND\_PRIORITY\_HIGH) → 管理者が本文にキャレットを置いて Ctrl+Shift+2 を押す → node\_modules/lexical/dist/Lexical.dev.mjs:5115 onKeyDown → 同:5125 dispatchCommand(editor, KEY\_DOWN\_COMMAND, event) が native KeyboardEvent をハンドラへ渡す → KeyboardShortcutsPlugin.tsx:157-159 isCtrl && event.shiftKey が真なので早期 return されず通過 → KeyboardShortcutsPlugin.tsx:162 `event.key === "0" || event.key === "Numpad0"` は event.key が ")"（US）/ Numpad0 は event.code 値なので両方偽 → KeyboardShortcutsPlugin.tsx:170 `event.key >= "1" && event.key <= "6"` を event.key === "@"（US Shift+2, JIS では '"'）で評価（根拠: node\_modules/playwright-core/lib/coreBundle.js:20690 と :20877-20878）→ 偽 → 174-179 の $setBlocksType($createHeadingNode) に到達しない → KeyboardShortcutsPlugin.tsx:184（"7"）:191（"8"）:239（"/"）も同じ理由で全て偽 → KeyboardShortcutsPlugin.tsx:245 で return false → preventDefault も行われず、見出しにならず何も起きない（誤った結果: :63-70,77,79 の SHORTCUT\_LIST がダイアログで「見出し2 = Ctrl+Shift+2」と提示しているのに無反応）

#### 既存の検査

e2e/authenticated/admin 配下に editor keyboard shortcut の spec は無い（grep で Ctrl+Shift+ を含むのはこのファイルと表示用の title 文字列のみ）。

#### 反証官による訂正

指摘内容はほぼ正確。US/JIS のシフト側グリフの対応（Ctrl+Shift+2 → "@"/'"'、7 → "&"/"'"、8 → "\*"/"("、/ → "?"）も、216・223 行が英字だけ大小両方を扱っているという観察も、162 行の "Numpad0" が event.code の値で key には現れないという指摘も、すべて実コードと一次資料で裏が取れた。

補正 3 点。

(1) 影響範囲の申告が一箇所だけ狭い。162 行は「Numpad0 の側が死んでいる」だけでなく **branch 全体が死んでいる**。Ctrl+Shift+0 の event.key は US で ")"、JIS でも "0" にならないため `event.key === "0"` も成立せず、InspectorControls.tsx:53-54 と InspectorSidebar.tsx:318 が tooltip で案内しているインスペクター開閉ショートカットも同様に無反応。結果、SHORTCUT\_LIST 全 21 項目のうち数字・記号系 10 項目（見出し1-6 / 番号付きリスト / 箇条書き / ブロック設定 / ショートカット一覧）が全滅する。

(2) 深刻度は low で妥当（据え置き）。管理画面限定、データ破壊なし、かつ壊れている全機能に生きた代替導線がある — 見出し/リストはツールバーのブロック種別ドロップダウンと ComponentPickerPlugin の「/」コマンド、ブロック設定は InspectorControls.tsx:53 のボタン、ショートカット一覧は InspectorControls.tsx:72 のボタン（ToolbarPlugin.tsx:450 が ShortcutsHelpDialog を直接描画）。英字系（Ctrl+Shift+K/M/G/Alt+G）と Lexical core 側の Ctrl+B/I/U/Z は無傷なので、見出しの「一切効かない」は数字・記号ショートカットに限った話として読む必要がある。

(3) 修正方針への注意（指摘には無いが、素直な直し方が罠になる）。lexical は `isExactShortcutMatch` を public export しており数字用の `event.code === "Digit<N>"` フォールバックを持つ（dist/Lexical.dev.mjs:15963-15966）が、その手前の :15958 に「event.key が長さ 1 の ASCII なら code で照合しない」guard があるため、"!" や "@" はそこで false を返して Digit フォールバックに**到達しない**。つまり upstream helper へ差し替えても US/JIS 配列では直らない。実際に直すなら event.code（"Digit1".."Digit6" / "Digit7" / "Digit8" / "Digit0" / "Slash"、必要なら "Numpad0".."Numpad8"）で判定する必要がある。

---

### F-101

**空段落への URL 単独ペースト（OGP カード / YouTube 等の自動埋め込み）が発火しない**

<sub>[対処の記録](2026-08-12-codebase-audit-progress.md) ／ [棄却一覧](2026-08-12-codebase-audit-refuted.md)</sub>

|        |                                                                                                     |
| ------ | --------------------------------------------------------------------------------------------------- |
| 深刻度 | 低                                                                                                  |
| 箇所   | `src/app/(admin)/admin/(dashboard)/_shared/components/editor/lexical/plugins/PasteUrlPlugin.tsx:74` |
| 領域   | Lexical プラグイン                                                                                  |

#### 起きること

エディタ末尾の空段落（Enter で作った直後 / 新規記事を開いた直後の初期状態）にキャレットを置き、https://www.youtube.com/watch?v=dQw4w9WgXcQ を単独ペーストする。子を持たない空 ElementNode の DOM キャレットは element 型 point に解決される（node\_modules/lexical/src/LexicalSelection.ts:2928-2932 が resolvedElement で 'element' point を返す）ため、selection.anchor.getNode() は ParagraphNode 本体になる。すると parent = RootNode、parent.getParent() = null で $isRootOrShadowRoot(null) は false（LexicalUtils.ts:1812-1816）となり isEmptyParagraph が false。ハンドラは return false し、YouTube 埋め込みも OGP ブックマークカードも作られず、URL がただのテキスト（AutoLink のリンク）として貼られる。この条件が true になるのは段落が空の TextNode を子に持つ場合だけで、JSDoc が謳う「空段落に URL を単独ペースト」の主要ケースを外している。

#### 直し方

アンカーが element 型 point（＝空 ElementNode 自身）のケースを含める。例: アンカーから最も近い top-level block を求め、その block の親が root/shadow root かつ block.getTextContent() === "" で判定する（node ではなく block を見る）。

#### 該当箇所

```
$isRootOrShadowRoot(parent.getParent()) &&
```

#### 到達経路

src/app/(admin)/admin/(dashboard)/\_shared/components/editor/lexical/LexicalEditor.tsx:296 (\<PasteUrlPlugin /\> マウント) → src/app/(admin)/admin/(dashboard)/\_shared/components/editor/lexical/plugins/PasteUrlPlugin.tsx:58-59 (PASTE\_COMMAND / COMMAND\_PRIORITY\_LOW 登録) → src/app/(admin)/admin/(dashboard)/\_shared/components/editor/lexical/plugins/ImageDropPlugin.tsx:119-125 (HIGH だがテキストのみのクリップボードでは false を返し素通し) → src/app/(admin)/admin/(dashboard)/\_shared/components/editor/lexical/plugins/PasteUrlPlugin.tsx:65 (isPasteableUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ") = true) → 同:70 selection.anchor.getNode() が ParagraphNode になる \[node\_modules/lexical/src/nodes/LexicalElementNode.ts:615-617 と :570-611 が 'element' point を作る / DOM 経路は node\_modules/lexical/src/LexicalSelection.ts:2827-2932。空 TextNode は node\_modules/lexical/src/LexicalNormalization.ts:55-56 で除去済み\] → 同:71 parent = RootNode, parent.getParent() = null → 同:74 $isRootOrShadowRoot(null) === false \[node\_modules/lexical/src/LexicalUtils.ts:1812-1816\] → 同:72-75 isEmptyParagraph = false → 同:77 return false（preventDefault されず、detectPasteEmbed / insertBookmarkFromUrl に到達しない）→ 誤った結果: YouTube 埋め込みも OGP ブックマークカードも生成されず、URL が AutoLink のプレーンリンクとして貼られる

#### 既存の検査

\_\_tests\_\_/unit/components/editor/lexical/paste-url-plugin.test.ts は detectPasteEmbed（純粋関数）だけを検証しており、この空段落ゲートは一切通らない。e2e にも無い。

#### 反証官による訂正

深刻度は medium → low に補正。理由: 管理画面限定の UX 機能で、データ欠損・不整合・セキュリティ影響が無く、失敗時の劣化が穏当（URL は AutoLink のリンクとしてそのまま貼られ、内容は失われない）。同ディレクトリに YouTubePlugin / VimeoPlugin / SpotifyPlugin / FigmaPlugin / LinkCardPlugin の手動挿入ダイアログが揃っており（\_\_tests\_\_/unit/components/editor/lexical/ssot-drift-gates.test.ts:403 も linkCard ダイアログを代替経路として明記）、機能自体は手動で到達できる。

指摘の事実誤認 1 件: 「この条件が true になるのは段落が空の TextNode を子に持つ場合だけ」は不正確。node.getTextContent() === "" は ElementNode でも成立するため、root の 1 段下にある空 ElementNode でも true になる。具体的には (a) トップレベルのコンテナ（Layout カラム・Callout 等）直下の空段落 → parent = コンテナ, parent.getParent() = RootNode で true、(b) 空のリスト項目 → parent = ListNode, parent.getParent() = RootNode で true。つまりこのゲートは「決して true にならない」のではなく**判定が 1 階層ずれて反転している**（本来効かせたいトップレベル空段落では発火せず、ネストした空ブロックでは発火する）。後者では $insertNodeToNearestRoot（PasteUrlPlugin.tsx:84）がコンテナの外側に埋め込みノードを挿入するため、副次的にコンテナ構造を崩す。

もう 1 点、指摘の到達経路の書き方について: 引用の LexicalSelection.ts:2928-2932 は DOM 由来のセレクション解決経路であり正しいが、実際にはプログラム経路（Enter キー → ElementNode.selectStart() → select() → LexicalElementNode.ts:610 の 'element' point）でも同じ結果になるので、結論はどちらの経路でも変わらない。

修正方針の参考（範囲外・任意）: parent.getParent() を見るのではなく、anchor が element point のときは node 自身が段落かを見る（例: $isParagraphNode(node) && $isRootOrShadowRoot(node.getParent()) && node.getTextContent() === "" を、TextNode anchor のときの既存条件と OR で束ねる）。修正時は「トップレベル空段落で発火する」「テキストのある段落で発火しない」「ネストした空ブロックで意図どおりか」の 3 形を固定するテストが要る（現状 0 件）。

---

### F-102

**権限拒否の監査ログが after() に登録されない裸の detached promise で、notFound() 直前に投げっぱなしにされる**

<sub>[対処の記録](2026-08-12-codebase-audit-progress.md) ／ [棄却一覧](2026-08-12-codebase-audit-refuted.md)</sub>

|        |                                                                    |
| ------ | ------------------------------------------------------------------ |
| 深刻度 | 低                                                                 |
| 箇所   | `src/app/(admin)/admin/(dashboard)/_shared/queries/_helpers.ts:68` |
| 領域   | admin 読み取り境界                                                 |

#### 起きること

EDITOR が /admin/customers/\<id\> のような権限外 URL を連続で叩く。requireAdminPermission は line 68 で logPermissionDenied を `void` で投げ、次の行の denyAdminAccess() が即座に notFound() を throw してレンダーを巻き戻す。logPermissionDenied は内部で await getRequestMetadata() → await createAuditLogRecord() → await notifyPermissionDeniedSpikeIfNeeded() と 3 段の await を持つため、レスポンス確定時点で DB 書き込みは未完了。このリポジトリ自身の SSoT である src/shared/lib/async-utils.ts:47 fireAndForget は「完了の追跡を Next.js の after() に委譲する…デタッチされた Promise が黙ってドロップされる事故を防ぐ」と明記しており、src 配下で 171 箇所がそれを使っているのに、権限拒否ログの 6 箇所（\_helpers.ts:68/:88、action-auth.ts:96/:122、admin-action.ts:96/:116）だけが素の void。Cloud Run のリビジョン切り替え / scale-down による graceful drain 中にこれらのリクエストが当たると PERMISSION\_DENIED 行が書かれず、権限探索のスパイク検知（notifyPermissionDeniedSpikeIfNeeded）も発火しない。監査ログは hash chain で完全性検証される設計（/api/admin/audit-logs/integrity）だが、そもそも行が書かれないので欠落は検出できない。

#### 直し方

6 箇所の `void logPermissionDenied(...)` を fireAndForget(logPermissionDenied(...), { operation: "logPermissionDenied", category: ErrorCategory.DATABASE, severity: ErrorSeverity.MEDIUM }) に置き換える。\_helpers.ts は Server Component レンダー中なので after() はリクエストスコープ内で成立する。

#### 該当箇所

```
void logPermissionDenied(user.id, resource, action);
```

#### 到達経路

src/app/(admin)/admin/(dashboard)/\_shared/queries/\_helpers.ts:60 requireAdminPermission → :64 await headers() → :65 verifyAdminSession() → :67 hasPermission(user.role, resource, action) === false → :68 void logPermissionDenied(...)【裸の detached promise。after() 未登録】 → src/app/(admin)/admin/(dashboard)/\_shared/lib/audit.ts:152 logPermissionDenied → :161 await createAuditLog(...) → :91 await getRequestMetadata() → :92 await createAuditLogRecord(...)【DB INSERT 発行中】 → 呼び出し元は待たず \_helpers.ts:69 denyAdminAccess() → :52 notFound() throw → 404 境界を描画してレスポンス完了。

【ここで SIGTERM が来た場合の分岐】
(A) 正しい経路（他 171 箇所）: src/shared/lib/async-utils.ts:66 after(() =\> guarded) → node\_modules/next/dist/server/after/after-context.js:88 addCallback → :104 this.waitUntil(this.runCallbacksOnClosePromise) → node\_modules/next/dist/server/next-server.js:1434 new AwaiterOnce() / :1438 this.onServerClose(() =\> awaiter.awaiting()) → node\_modules/next/dist/server/lib/start-server.js:346 await nextServer.close() → awaiter.awaiting() が全 promise を待つ → :375 process.exit(143)。→ 書き込み完走。

(B) 本件（\_helpers.ts:68）: promise は AwaiterMulti.promises（awaiter.js:37）に一度も入らないため、start-server.js:346 の待機対象に含まれない → :375 process.exit(143) が INSERT 途中でプロセスを落とす → audit\_logs の PERMISSION\_DENIED 行が欠落し、audit.ts:169 notifyPermissionDeniedSpikeIfNeeded も未発火のまま消える（誤った結果 = 権限拒否イベントの監査記録欠落）。

#### 既存の検査

admin-permission-denial-mechanism.test.ts は denyAdminAccess() が notFound() を呼ぶことと呼び出し回数（\>=3）しか見ておらず、ログ発火の追跡方法は検査していない。fireAndForget を強制する ESLint ルール / gate は存在しない（eslint-rules/ に該当なし）。

#### 反証官による訂正

指摘は成立するが、深刻度は medium → low に補正する。事実誤認・誇張が 3 点ある。

【誇張1: 「notFound() が巻き戻すから未完了」という因果は誤り】
「denyAdminAccess() が即座に notFound() を throw してレンダーを巻き戻す**ため** DB 書き込みは未完了」という書き方は、throw が log をキャンセルするかのように読める。JS の promise はキャンセル不能で、`void` で投げた promise は notFound() の throw と無関係に Node のイベントループ上で走り続け、**通常運転では数 ms で完走して行は書かれる**。fireAndForget に変えても「レスポンス確定時点で未完了」なのは同じ（非ブロッキングが設計意図）。両者の差分は throw でもレスポンス完了でもなく、**SIGTERM ドレイン中の process.exit(143) に awaiter の待機対象として捕捉されるか否か、その 1 点だけ**。損失窓は「権限拒否リクエストがリビジョン切替 / scale-down のドレインと重なった瞬間」に限定される。

【誇張2: 認可そのものには影響しない】
拒否は notFound() で確実に成立しており、権限バイパスは無い。壊れるのは監査ログの完全性（それも denial イベントのみ）で、機能退行でもセキュリティホールでもない。hash chain / integrity endpoint への言及は「行が無ければ欠落は検出できない」という一般論として正しいが、これを根拠に深刻度を押し上げるのは過大。行の欠落は chain 断裂ではないので integrity 検証は緑のままだが、それは本件固有の性質ではない。

【誤認3: 既存カバレッジの申告が不正確】
「ログ発火の追跡方法は検査していない」という結論自体は正しいが、根拠として挙げた「呼び出し回数（\>=3）しか見ていない」は admin-permission-denial-mechanism.test.ts の話であり、\*\*\_\_tests\_\_/unit/queries/admin-query-helpers.test.ts:102-106 / :125-130 は `logPermissionDenied` が正確な引数で呼ばれたことを assert している\*\*（発火自体はカバー済み）。ただし同テストは mock.module("@/admin/lib/audit") でモジュールごと差し替えるため after() 登録の有無は原理的に観測不能で、「追跡方法は未検査」という結論は維持される。

【補足（指摘に無いが修正時に有用）】
同じ audit.ts の emitBulkAuditRecords(:213-246) は fireAndForget を使っており、不整合はモジュール内部で閉じている。また git log -L で当該行は 2026-03-08 の初版から未変更＝fireAndForget 導入時の変換漏れであり、意図的な例外ではない。修正は 6 箇所を fireAndForget でラップするだけで、fireAndForget 側が after() の throw を try/catch でフォールバックする（async-utils.ts:64-70）ため、リクエストスコープ外のユニットテスト文脈でも壊れない。

---

### F-103

**サイトヘッダーの Reserve CTA が feature gate を持たず、reservation OFF で全公開ページから 404 へ誘導する**

<sub>[対処の記録](2026-08-12-codebase-audit-progress.md) ／ [棄却一覧](2026-08-12-codebase-audit-refuted.md)</sub>

|        |                                                                   |
| ------ | ----------------------------------------------------------------- |
| 深刻度 | 低                                                                |
| 箇所   | `src/app/(public)/_shared/components/layouts/site-header.tsx:514` |
| 領域   | feature フラグ                                                    |

#### 起きること

Header は269行で `const items = navItems.filter((item) => item.url !== "/reservation");` と DB 由来のナビから /reservation を意図的に除外し、コメントで「/reservation は CTA ボタンで導線があるためナビから除外」と宣言している。つまり /reservation への唯一の常設導線がこのハードコード CTA（デスクトップ514行、モバイル628行）。ところがこの CTA には feature 判定が一切入っていない（同ファイルに isFeatureEnabled / featureEnabled 系の prop も無い）。運用者が reservation を OFF にする、あるいは spaces を OFF にして依存カスケード（registry.ts:80 の requires: \["spaces"\]）で reservation が落ちると、navigation/queries.ts:117 の isUrlDisabled が DB ナビを刈り、/reservation 自体は requireFeatureEnabled で 404 になるのに、全公開ページのヘッダー右上（およびモバイルメニュー最下部）に一次 CTA として「Reserve」が残り続け、押した訪問者は soft-404 ページに着く。同一ページ内の spaces/\[slug\] の予約ウィジェットは reservationEnabled / contactEnabled で厳密に出し分けている（reservation-widget.tsx:156,164）ので、ヘッダーだけが規約から外れている。同型のハードコード導線が mypage/\_components/reservation-list.tsx:42(/spaces),45(/faq)、mypage/\_components/unlinked-guest-history-notice.tsx:49(/contact)、mypage/merge/request/page.tsx:55(/contact) にもある。

#### 直し方

Header に reservationEnabled 相当の prop を追加し、レイアウト側（navItems を解決している場所）で getFeatureFilterContext().enabled.has("reservation") を渡して514/628行を出し分ける。ついでに mypage の3箇所の /contact・/spaces・/faq ハードコードリンクも同じ判定に揃えると、「公開導線は必ず feature 判定を経由する」という不変条件が1本になる。

#### 該当箇所

```
href="/reservation"
```

#### 到達経路

運用者が /admin/settings/features で reservation を OFF（または spaces を OFF → src/shared/lib/features/registry.ts:80 `requires: ["spaces"]` により src/shared/domain/features/check.ts:40-50 の fixed-point 解決で reservation も除外） → 訪問者が任意の公開ページを開く → src/app/(public)/layout.tsx:454 `<HeaderWithData />` → src/app/(public)/layout.tsx:318-334 HeaderWithData が getHeaderSettings / getHeaderNavigation / getMobileHeaderNavigation のみ取得し、feature context を Header に渡さない → src/app/(public)/\_shared/components/layouts/site-header.tsx:269 で DB ナビから /reservation を除外（feature prune 済みナビには元々残っていない） → src/app/(public)/\_shared/components/layouts/site-header.tsx:511-518 デスクトップ CTA `<Button href="/reservation">Reserve</Button>` が条件分岐なしで描画（モバイルは同ファイル:627-636 の `<Link href="/reservation">`） → 訪問者がクリック → src/app/(public)/reservation/page.tsx:34 `await requireFeatureEnabled("reservation")` → src/shared/domain/features/check.ts:186-188 `if (!(await isFeatureEnabled(module))) notFound();` → 404 着地

#### 既存の検査

\_\_tests\_\_/unit/lib/features/public-route-gates.test.ts は「page 側が gate を呼ぶか」だけを見て、そこへのリンク側は見ない。e2e/public/feature-module-off-gate.spec.ts の MODULE\_CASES（295-330行）は OFF 時に対象 URL が not-found になることだけを検証し、ヘッダーの CTA が残っているかは見ていない。\_\_tests\_\_/unit/components/public/site-header-mobile-menu.test.tsx:260 はむしろ "Reserve" アンカーの存在を無条件に固定している。

#### 反証官による訂正

中核の主張（ヘッダー CTA に feature 判定が無く、reservation OFF 時に全公開ページから 404 へ誘導する）は正確で、既存カバレッジの申告も実測どおり: e2e/public/feature-module-off-gate.spec.ts の MODULE\_CASES は routes の not-found のみ検証、public-route-gates.test.ts は page 側 grep gate、site-header-mobile-menu.test.tsx:255-267 は確かに "Reserve" アンカーの存在を無条件に前提としている（focus ring の検証対象として掴んでいる）。以下は記述の誤りと補正。

【誤り 1 — 例示の 1 つは実際には gate されている】「同型のハードコード導線」として挙げた src/app/(public)/mypage/\_components/unlinked-guest-history-notice.tsx:49 の /contact は**既に feature gate されている**。同ファイル:9/22/46 が `showContactLink: boolean` を prop で受け、src/app/(public)/mypage/layout.tsx:133 が `showContactLink={contactEnabled}` を渡す。これは反例ではなく規約が守られている側の実例で、「ヘッダーだけが規約から外れている」という結論をむしろ補強する。なお src/app/(public)/mypage/\_components/reservation-list.tsx:42/45 の /spaces・/faq は確かに無条件。

【誤り 2 — 規約の適用範囲を過小に引用】「reservation-widget.tsx:156,164 で厳密に出し分け」とあるが、実際の分岐はより広い: reservation-widget.tsx:76(`showCtaBlock`)/83/116/156/164 に加え、mobile-reserve-cta.tsx:31 の早期 return、space-availability-calendar.tsx:91/95 も同じ `reservationEnabled` で出し分けている。spaces/\[slug\]/page.tsx:106-107 が feature から解決し :279/336-337/357 で 3 コンポーネントへ配っている。規約は 2 箇所ではなく 3 コンポーネント全体で一貫している。

【補足 — 指摘より広い】/reservation は feature OFF 以外でも 404 になる。reservation/page.tsx:35 に `await requireSystemPagePublished("reservation")` があり、Page が未公開でも同じ dead link が成立する。修正するなら feature 判定だけでは片手落ち。

【深刻度を medium → low に補正】理由は 3 点。(a) 既定構成では発現しない — registry.ts:232-262 `buildInitialFeatureModules` は data-retention 以外を全 ON で初期化するため、運用者が明示的に OFF にした構成でのみ再現する。(b) 影響は soft-404 着地のみで、correctness・データ・認可・セキュリティへの影響が無い（/reservation 自体は fail-closed で正しく 404 している）。(c) 発現条件を作った本人が運用者であり、切り替え直後に自サイトを見れば即座に観測できる。全公開ページの一次 CTA という露出の広さは事実だが、それは medium 相当の被害ではなく「規約からの逸脱を直す優先度」を押し上げる要素にとどまる。

---

### F-104

**公開面の税込表示が Space.taxRateType を無視して常に標準税率で計算するため、予約確認画面の金額と実際の請求額が食い違う**

<sub>[対処の記録](2026-08-12-codebase-audit-progress.md) ／ [棄却一覧](2026-08-12-codebase-audit-refuted.md)</sub>

|        |                                                         |
| ------ | ------------------------------------------------------- |
| 深刻度 | 低                                                      |
| 箇所   | `src/app/(public)/_shared/hooks/use-format-price.ts:20` |
| 領域   | 金額計算・クーポン                                      |

#### 起きること

管理者がスペースの「税率設定」で軽減税率を選ぶ（SpaceEditPricingTab.tsx:317-319 に軽減税率の SelectItem があり、validations/space.ts:243 で Space.taxRateType として永続化される）。hourlyPrice=5000、標準10%/軽減8% とすると、サーバー側の calculate-reservation-pricing.ts:105 は space.taxRateType=REDUCED を使って 2 時間予約の totalPriceWithTax=10800 を DB に書き、payment-commands.ts:294 がその 10800 をそのまま Stripe の unit\_amount に渡す。一方、顧客が見る最終確認画面 BookingSummary は税抜 totalPrice だけを受け取り、この hook（常に TaxRateType.STANDARD）で `formatTotal` するので「¥11,000（税込）」と表示する。同じズレが SpaceCard の時間単価（space-card.tsx:86 `const taxRate = getTaxRate(TaxRateType.STANDARD, tax);`）と /spaces/\[slug\] の JSON-LD 価格（tax.ts:73、resolvePublicDisplayPrice 内で TaxRateType.STANDARD 固定）にも出る。つまり公開面は軽減税率スペースを一切表現できず、提示額と請求額が 200 円ずれる。管理画面の料金プレビュー（SpaceEditPricingTab.tsx:100 `getTaxRate(taxRateType, taxSettings)`）だけが正しい値を出すので、管理者側からは差異に気付けない。

#### 直し方

SpaceCard / BookingSummary / resolvePublicDisplayPrice に space の taxRateType を渡し、`getTaxRate(space.taxRateType, settings)` で解決する。もし公開面が軽減税率を扱わない方針なら、逆に Space.taxRateType の選択肢から REDUCED を外すか、予約フォームの表示を計算済みの pricing.totalPriceWithTax（サーバー SSoT）で直接描画して二重計算をやめる。

#### 該当箇所

```
const taxRate = getTaxRate(TaxRateType.STANDARD, {
```

#### 到達経路

前提: Settings は既定 (prisma/schema.prisma:1859-1861 → taxStandardRate=10 / taxReducedRate=8 / taxDisplayModePublic=TAX\_INCLUDED)。管理者が対象スペースの税率タイプを「軽減税率」にする。
\[設定\] src/app/(admin)/admin/(dashboard)/spaces/\_components/space-edit-form/SpaceEditPricingTab.tsx:313 (SelectItem value=REDUCED) → src/app/(admin)/admin/(dashboard)/spaces/\_components/SpaceEditForm.tsx:373 (hidden input で送信) → src/app/(admin)/admin/(dashboard)/\_shared/lib/validations/space.ts:243 (z.enum(TaxRateType) が REDUCED を許可) → src/shared/domain/spaces/commands.ts:101 (Space.taxRateType = REDUCED を永続化)
\[請求側 = 正しい\] src/shared/domain/reservations/pricing-preview.ts:119 (space.taxRateType を渡す) → src/shared/lib/pricing/calculate-reservation-pricing.ts:105 (getTaxRate(REDUCED, ...) = 8) → :110-111 (hourlyPrice 5000 × 2h → totalPrice 10000, taxAmount 800, totalPriceWithTax 10800) → src/shared/domain/reservations/public-commands.ts:196,247 (DB に snapshot) → src/shared/domain/reservations/payment-commands.ts:294-296 (unit\_amount = authoritative.totalPriceWithTax = 10800 を Stripe に渡す)
\[表示側 = 誤り\] src/app/(public)/reservation/\_components/reservation-form.tsx:323 (`const price = pricingWindow ? (pricePreview?.totalPrice ?? null) : null;` — 税抜 10000 のみ採用、同じ結果内の taxRate=8 / totalPriceWithTax=10800 を捨てる) → :616 (summary.price = 10000) → src/app/(public)/reservation/\_components/customer-step.tsx:125 (price={summary.price}) → src/app/(public)/reservation/\_components/booking-summary.tsx:80,103 (formatTotal(price)) → src/app/(public)/\_shared/hooks/use-format-price.ts:20 (`getTaxRate(TaxRateType.STANDARD, ...)` = 10 に固定) → :32-36 formatPriceWithTax → src/shared/lib/pricing/format.ts:47 calculateTaxIncludedPrice(10000, 10) = 11000 → :53 `¥11,000（税込）`
\[誤った結果\] 最終確認画面が「¥11,000（税込）」を表示し、Stripe Checkout は ¥10,800 を請求する（差額 200 円、表示が請求より高い）。同型の固定は src/app/(public)/\_components/space-list/space-card.tsx:86、src/shared/lib/pricing/tax.ts:73 (/spaces/\[slug\] page.tsx:130 の JSON-LD)、src/shared/domain/spaces/resolve-space-card-embeds.ts:87 にもある。

#### 既存の検査

\_\_tests\_\_/unit/lib/pricing/tax.test.ts の resolvePublicDisplayPrice 3 ケース（439-465行）は displayModePublic の分岐のみで、taxRateType=REDUCED のスペースを一度も通していない。getTaxRate 自体の REDUCED テスト（194/212/241行）はあるが、公開面が STANDARD 固定である事実を検査する gate は無い。

#### 反証官による訂正

指摘は成立するが、深刻度 medium は高い。以下を補正する。

\[深刻度を下げる根拠\]
\1. 既定構成では発現しない。Space.taxRateType の既定は STANDARD (schema.prisma:668 `@default(STANDARD)`、validations/space.ts:243 の `.default(TaxRateType.STANDARD)`) で、管理者が明示的に軽減税率を選んだスペースにだけ出る。
\2. 日本の軽減税率 8% は飲食料品と定期購読新聞に限られ、スペース貸しには法的に適用余地が無い。つまり本番で REDUCED が選ばれる合理的理由が存在せず、実運用上の発生確率はほぼゼロ。
\3. ずれの向きは「表示 11,000 \> 請求 10,800」。過大請求ではなく過大表示で、顧客が想定より多く引き落とされる事故にはならない。
\4. 永続データは正しい。Reservation の taxRateType / taxRate / taxAmount / totalPriceWithTax は snapshot として正しい値が入り (calculate-reservation-pricing.ts:129-132)、領収書・返金・管理画面はその正しい値を読む。破損するのは公開面の表示文字列だけ。
\5. 表示モード依存の前提が指摘に書かれていない。Settings.taxDisplayModePublic が TAX\_EXCLUDED の場合、formatPriceWithTax (format.ts:50-51) は taxRate を一切使わず税抜額をそのまま返すため、食い違いは発生しない。シナリオが成立するのは TAX\_INCLUDED / BOTH のときだけ（既定は TAX\_INCLUDED なので既定では成立する）。

\[「意図的な簡略化」という反論 — 一部にのみ有効\]
src/shared/domain/spaces/resolve-space-card-embeds.ts:28 の JSDoc は「既存の公開 SpaceCard コンポーネントと同じ簡略化で TaxRateType.STANDARD 固定（Space.taxRateType による分岐はしない）」と明記しており、少なくともカード系（space-card.tsx:86 / resolve-space-card-embeds.ts:87）の STANDARD 固定は書き残された製品判断であって書き忘れではない。ただしこの注記はカード表示にしか及んでおらず、予約最終確認画面の金額と Stripe 請求額の不一致（本件の中核）を正当化していない。指摘はこの記述の存在に触れていない。

\[事実誤認\]
\6. パス誤り: 「validations/space.ts:243」は `src/shared/lib/validations/space.ts` ではなく `src/app/(admin)/admin/(dashboard)/_shared/lib/validations/space.ts:243`。前者に taxRateType は存在しない（grep 0 件）。
\7. パス・行番号誤り: 「SpaceEditPricingTab.tsx:317-319」の実体は `src/app/(admin)/admin/(dashboard)/spaces/_components/space-edit-form/SpaceEditPricingTab.tsx:313-315`（パスに `space-edit-form/` が欠落、行は約 4 行ずれ）。同様に「SpaceEditPricingTab.tsx:100」も同ファイルの :100 で内容は一致するがパスが同じく不正確。
\8. 「payment-commands.ts:294 がその 10800 をそのまま渡す」は概ね正しいが、正確には :294-296 で `toStripeUnitAmount(authoritative.totalPriceWithTax, currency)` を経由し、しかも create 時の値ではなく claim 直後に再取得した authoritative な行の値を読む（:241-256 のコメントと select）。
\9. 指摘が挙げていない、より強い証拠がある: 表示側は「税率を解決する情報が無い」のではなく、情報を持っているのに捨てている。`pricePreview` の型 `ReservationPricingResult` は taxRate / taxRateType / totalPriceWithTax を保持しており (calculate-reservation-pricing.ts:66-69)、reservation-form.tsx:323 がそのうち totalPrice だけを取り出している。つまり props に space.taxRateType を足すまでもなく、既存 preview 結果の totalPriceWithTax を渡すだけで直る。
\10. 同様に、公開面の TaxSettings context は reducedRate を運んでいるが (tax-settings.tsx:8) 、use-format-price.ts:22 で getTaxRate に渡された後 STANDARD 固定のため一度も読まれない死んだ配線になっている。指摘の主張を補強する事実。
\11. 影響範囲は指摘の 3 箇所より広い。同じ STANDARD 固定は mypage の予約カード (`src/app/(public)/mypage/_components/reservation-card.tsx:135`)、reservation-widget.tsx:74,111、mobile-reserve-cta.tsx:40、space-selector.tsx:149、space-detail-dialog.tsx:117、\_spaces-carousel.tsx:487,535、space-list-simple-view.tsx:183、resolve-space-card-embeds.ts:87 にも及ぶ（useFormatPrice 経由 8 ファイル + 直接 getTaxRate 2 箇所）。

---

### F-105

**post-list / news-list の archive レイアウトを /blog・/news 以外のページに置くと、検索とページ送りが恒久的に効かない**

<sub>[対処の記録](2026-08-12-codebase-audit-progress.md) ／ [棄却一覧](2026-08-12-codebase-audit-refuted.md)</sub>

|        |                                              |
| ------ | -------------------------------------------- |
| 深刻度 | 低                                           |
| 箇所   | `src/app/(public)/[...segments]/page.tsx:72` |
| 領域   | CMS                                          |

#### 起きること

管理者がカスタムページ /company（template=custom）に post-list セクションを追加し、「表示レイアウト」で archive を選ぶ（custom テンプレートの additionalSectionTypes は post-list / news-list / space-showcase を含み、postListConfigSchema の displayLayout は grid/list/archive を許可する）。公開 /company には SearchBar・カテゴリフィルタ・Pagination が描画されるが、\[...segments\]/page.tsx も ManagedPageSections も searchParams を持たないため、SectionRenderer:390 の `searchParams ? await postsSearchParams.parse(searchParams) : { page: 1, q: "" }` が常に固定値に落ちる。訪問者が検索欄に文字を入れると URL は /company?q=... に変わる（search-bar.tsx:17 の useQueryStates は現在 URL を書き換える）のに一覧は 1 ページ目のまま一切変化しない。さらに Pagination の basePath は PostListSection.tsx:89 で "/blog"、NewsListSection.tsx:72 で "/news" とハードコードされているため、ページ送りを押すと訪問者は別ページへ飛ばされる。同じことは /about・/faq・/contact・/access・/terms・/（home）でも起きる（これらは SectionStack に searchParams を渡していない）。

#### 直し方

ManagedPageSections / \[...segments\]/page.tsx（および / ・/about 等の固定ルート）に searchParams を通し、SectionStack の既存 searchParams prop へ forward する。あわせて Pagination の basePath を space-list と同じく catalogBasePathFromPageSlug(pageSlug) 由来にして、/blog・/news 決め打ちをやめる。forward しない方針を採るなら、archive を選べるのは対応テンプレート（blog-archive / news-archive）に限る、とスキーマまたは AutoSectionForm 側で制約する。

#### 該当箇所

```
<ManagedPageSections sections={sections} pageSlug={slug} />
```

#### 到達経路

\[admin\] src/shared/domain/pages/commands.ts:134 createPageCommand が template: resolveTemplateForSlug("company") → src/shared/lib/sections/page-templates.ts:237 が既知 slug 表に無いため "custom" を返す → 管理者が post-list を追加 → src/shared/domain/sections/commands.ts:122-127 の allowedSectionTypes チェックを通過（page-templates.ts:167 custom.additionalSectionTypes = MARKETING\_SECTION\_TYPES、:66-70 に "post-list"/"news-list"）→ 「表示レイアウト」で archive を選択（src/shared/lib/sections/definitions/post-list/schema.ts:22、src/app/(admin)/.../auto-section-form.tsx:408-430 にページ文脈フィルタ無し）。 \[public\] src/app/(public)/\[...segments\]/page.tsx:52 DynamicPage（:24-26 PageProps に searchParams 無し）→ :72 \<ManagedPageSections sections={sections} pageSlug={slug} /\> → src/app/(public)/\_shared/components/pages/ManagedPageSections.tsx:20-23（searchParams を受けも渡しもしない）→ src/app/(public)/\_shared/components/sections/section-stack.tsx:44 `{...(searchParams !== undefined ? { searchParams } : {})}` が空スプレッドになる → src/app/(public)/\_shared/components/sections/section-renderer.tsx:389 archive 分岐 → :390-392 `const sp = searchParams ? await postsSearchParams.parse(searchParams) : { page: 1, q: "" }` が常に else 側へ落ち sp={page:1,q:""} 固定 → :395 getPublishedPostsList(1, 12, "") で常に1ページ目・無条件。 \[誤った結果 その1\] src/app/(public)/\_components/PostListSection.tsx:79 SearchBar が描画され、src/app/(public)/\_shared/components/ui/search-bar.tsx:18-23 useQueryStates(shallow:false) が URL を /company?q=... に書き換えて RSC を再取得するが、DynamicPage は searchParams を読まないため出力は不変＝検索欄が恒久的に無反応。 \[誤った結果 その2\] PostListSection.tsx:86-89 Pagination basePath="/blog" 固定のため、ページ送りリンクが訪問者を /company から /blog へ離脱させる。news-list も同型: section-renderer.tsx:344-347 → src/app/(public)/\_components/NewsListSection.tsx:69-72 basePath="/news"。同じ欠陥は searchParams を渡していない他3面でも成立: src/app/(public)/page.tsx:30（home、template "home" が MARKETING\_SECTION\_TYPES を許可）、src/app/(public)/about/page.tsx:32（template "content"、同上）、src/app/(public)/preview/pages/\[slug\]/page.tsx:54（管理者プレビューでも同じ症状が出るため管理者が気付けない）。対照的に space-list catalog は section-renderer.tsx:161-165 catalogBasePathFromPageSlug + :227-229 の `searchParams ?? Promise.resolve({})` で page-slug 相対に解決済み。

#### 既存の検査

none。space-list の catalog だけは section-renderer.tsx:161 catalogBasePathFromPageSlug + spaces/page.tsx の searchParams forward で解決済みだが、post-list/news-list の archive には同等の配線が無く、architecture gate（section-registry-clean-break / display-order-surfaces-clean-break）も searchParams forward を検査していない。

#### 反証官による訂正

3点の事実誤認あり。(1) 影響ページの列挙が過大: 「/about・/faq・/contact・/access・/terms・/（home）でも起きる」のうち /faq・/contact・/access・/terms では**起きない**。これらのテンプレート（page-templates.ts:104-151）の additionalSectionTypes はそれぞれ faq-list / contact-form / location-list / terms-list のみで、UNIVERSAL\_SECTION\_TYPES（:40-57）にも post-list/news-list は含まれない。管理者が追加を試みても src/shared/domain/sections/commands.ts:122-127 がサーバー側で DomainError("このページに追加できないセクションタイプです") を投げる。実際に到達可能なのは custom ページ（\[...segments\]）・home・/about（template "content"）・管理者プレビューの4面だけ。(2) 行番号が微妙にずれている: post-list の三項は section-renderer.tsx:390-392（"SectionRenderer:390" は `const sp =` の行で、条件式本体は 391-392）。search-bar.tsx の useQueryStates は 17 行目ではなく 18 行目。(3) 深刻度 medium は過大。既定の /blog・/news は正しく searchParams を forward しており（blog/page.tsx:53-55、news/page.tsx:61-63）壊れていない。本件は管理者が「archive は検索 + カテゴリフィルタ + ページネーション付き」と helpText に明記された選択肢を非アーカイブページで意図的に選んだ場合にのみ発現する構成ミス誘発（footgun）で、データ損失・セキュリティ影響は無く、select を戻すだけで完全に復旧する。ただし管理者プレビュー（preview/pages/\[slug\]/page.tsx:54）にも searchParams が渡っていないため、管理者は公開前に破綻を確認できない — これは指摘に書かれていない追加の悪化要因で、修正するなら preview 側も同時に配線する必要がある。修正方針としては space-list catalog と同じく (a) \[...segments\]/home/about/preview から searchParams を forward し、(b) Pagination basePath を catalogBasePathFromPageSlug 相当で pageSlug から導出する、の2点で解ける。

---

### F-106

**繰上げ当選の残り 30 分未満クリックが「システムエラー」表示＋CRITICAL アラートになる**

<sub>[対処の記録](2026-08-12-codebase-audit-progress.md) ／ [棄却一覧](2026-08-12-codebase-audit-refuted.md)</sub>

|        |                                                         |
| ------ | ------------------------------------------------------- |
| 深刻度 | 低                                                      |
| 箇所   | `src/app/(public)/events/waitlist/checkout/route.ts:63` |
| 領域   | イベント（決済・繰上げ）                                |

#### 起きること

繰り上げ当選メールを受け取った顧客が、24h の確定期限の残り 20 分の時点でメール内「お支払いへ進む」を踏む。createWaitlistOfferCheckoutSessionCommand:487-499 は Stripe Checkout の expires\_at 下限（30 分）に抵触するため PENDING を UNPAID に戻し DomainError("確定期限までの残り時間が短いため、決済を開始できません。期限切れ後に次の待機者へ繰り上がります。", "VALIDATION") を投げる。この文言は isGenuineOfferExpiry の allowlist（OFFER\_NOT\_ACTIVE\_MESSAGE / OFFER\_EXPIRED\_MESSAGE の 2 件）に入っていないため genuine expiry と判定されず、route.ts:142-153 の最終分岐に落ちて severity CRITICAL でログ＋/events/waitlist/checkout-error?reason=system へ。顧客には「エラーが発生しました／招待の有効期限が切れたわけではありません。時間をおいて改めてお試しください」（checkout-error/page.tsx:74-77）と、事実と正反対の案内が出る（時間をおけば必ず期限切れになる）。運用側には正常な業務条件のたびに CRITICAL アラートが飛ぶ。

#### 直し方

文言リテラルを payment-commands.ts から export した定数にして route.ts の allowlist と SSoT を共有する（現在の文字列一致密結合を型で強制する）。その上で「残り時間が短い」は EXPIRED\_PATH ではなく専用の reason（例 reason=too-late）を用意し、「まもなく期限切れになり次の待機者へ繰り上がります」と正しく伝え、CRITICAL ログを出さない。

#### 該当箇所

```
error.message === OFFER_EXPIRED_MESSAGE)
```

#### 到達経路

src/app/(public)/events/waitlist/checkout/route.ts:67 GET（メール内「お支払いへ進む」= 残り 20 分の時点）→ route.ts:89 verifyWaitlistOfferToken は exp===expiresAt のため通過 → route.ts:94-102 status===WAITLISTED\_OFFERED で通過 → route.ts:104 ticketPrice!==0 で通過 → route.ts:113 createWaitlistOfferCheckoutSessionCommand → src/shared/domain/events/payment-commands.ts:413-425 claim 成功（paymentStatus PENDING）→ payment-commands.ts:479 `expiresAt <= now` は false（まだ 20 分残っている）→ payment-commands.ts:488-499 remainingSeconds=1200 \< 1800 → revertCheckoutPendingToUnpaid 後 payment-commands.ts:496 `throw new DomainError("確定期限までの残り時間が短いため、決済を開始できません。期限切れ後に次の待機者へ繰り上がります。", "VALIDATION")` → route.ts:126 instanceof DomainError（同一 module @/shared/domain/domain-error なので成立）→ route.ts:127 isGenuineOfferExpiry → route.ts:58-65 code は NOT\_FOUND でなく VALIDATION だが message が 2 件の allowlist いずれとも不一致 → false → route.ts:131 code!=="CONFLICT" → route.ts:142-150 logError(severity: ErrorSeverity.CRITICAL, category: EXTERNAL\_API) → src/shared/lib/errors/logger-core.ts:298 で @type=ERROR\_REPORTING\_TYPE + stack\_trace を付与し Cloud Error Reporting へ → route.ts:151-153 /events/waitlist/checkout-error?reason=system → src/app/(public)/events/waitlist/checkout-error/page.tsx:74-76 「エラーが発生しました／お支払い手続きの開始中に問題が発生しました。招待の有効期限が切れたわけではありません。時間をおいて改めてお試しいただくか…」＝ 事実と逆の案内（20 分後には必ず期限切れになる）

#### 既存の検査

「残り時間が短いため」の文字列は src/ 全体で payment-commands.ts:496 の 1 箇所のみ（grep 済み）で、\_\_tests\_\_ 側に isGenuineOfferExpiry / OFFER\_EXPIRED\_MESSAGE / この文言を検証するテストは 0 件。\_\_tests\_\_/unit/lib/features/public-route-gates.test.ts:91 は checkout-error ページの feature gate だけを見ている。

#### 反証官による訂正

欠陥自体は実在・到達可能で反証できないが、記述に 3 点の不正確さと、深刻度の過大評価がある。

【1. 履歴の因果が逆】指摘は「3 つ目の genuine expiry 文言追加時に（route.ts の定数が）更新されていない」と書くが、実際の順序は逆向き。`git log -S` で確認すると OFFER\_EXPIRED\_MESSAGE を含む allowlist は #1080（waitlist 機能の初回実装、commit 33ee73d81）で既に 2 件揃っており、30 分下限フロアの throw は 3 日後の #1444（af8423de4, 2026-07-23 "fix(audit): remediate CRITICAL/HIGH audit findings"）で後から追加されている。つまり「allowlist を拡張したときに 3 つ目を入れ忘れた」のではなく、「新しい VALIDATION throw を足した側が、route.ts:43 の JSDoc が宣言する密結合契約（メッセージ文言を変える場合はこの定数も合わせて更新する）を守らなかった」。修正責任の所在が変わるので、直す際は payment-commands.ts:474 のコメント（「isGenuineOfferExpiry allowlist と密結合（変更時は両方更新する）」）が 481 の throw にしか掛かっておらず 496 には及んでいない点を見るべき。

【2. OFFER\_EXPIRED\_MESSAGE の JSDoc への言及が誤読】指摘は route.ts:52-54 の JSDoc が 30 分下限に触れていることを密結合の証拠として引くが、そこが指すのは「Stripe expires\_at の 30 分フロアで session だけが生き残り、offer 本体は既に expiresAt を過ぎている」ケース（= payment-commands.ts:479 の分岐）であって、本件の「残り 30 分未満なので開始を拒否する」（= 490 の分岐）とは別事象。同じ「30 分」でも指している分岐が違う。

【3. 「CRITICAL アラートが飛ぶ」の機構】logError は通知連携を持たない。logger-core.ts:287-305 が production 時に severity:"CRITICAL" + @type=ERROR\_REPORTING\_TYPE + stack\_trace を付けた構造化ログを console.error するだけで、着地先は Cloud Error Reporting のエントリ。ページャや Slack 通知ではないので「運用側に CRITICAL アラートが飛ぶ」は Error Reporting のノイズ混入と読み替えるのが正確。

【4. 深刻度 medium → low】顧客側の実質的な結末は正しい実装でも同じ。payment-commands.ts:484-487 のコメントどおり「クリーンに拒否して次候補へ委ねる」が意図した業務挙動であり、EXPIRED\_PATH に誘導していても顧客は枠を失う。状態も revertCheckoutPendingToUnpaid で UNPAID に戻るため stuck しない（金銭移動・データ破損・セキュリティ影響はゼロ）。残る実害は (a) 「時間をおいて改めて」という無駄な再試行を促す誤案内、(b) 正常な業務条件で Error Reporting に CRITICAL が積まれる可観測性の劣化、の 2 点のみで、露出窓も 24h TTL の末尾 30 分（かつ token・status の全ガードを通過した客のみ）。既存カバレッジの申告（当該文言は src 全体で payment-commands.ts:496 の 1 箇所、テスト 0 件、public-route-gates.test.ts:91 は feature gate のみ）は grep で追認済みで正確。修正は route.ts に 3 つ目の定数を足して isGenuineOfferExpiry に含めるだけの 2 行相当。

---

### F-107

**顧客履歴の統合が完了しても成功メッセージが表示されない（`mergeSuccess` を描画する側が存在しない）**

<sub>[対処の記録](2026-08-12-codebase-audit-progress.md) ／ [棄却一覧](2026-08-12-codebase-audit-refuted.md)</sub>

|        |                                                                 |
| ------ | --------------------------------------------------------------- |
| 深刻度 | 低                                                              |
| 箇所   | `src/app/(public)/mypage/_shared/actions/customer-merge.ts:243` |
| 領域   | フロントエンド                                                  |

#### 起きること

ログイン済み顧客が /mypage/merge/request で確認メールを送り、メール内 URL から /mypage/merge/confirm を開いて「統合する」を押す。統合は成功し（予約・問い合わせ・レビュー・イベント参加が移管され、ゲスト側 Customer レコードは削除される＝取り消し不可）、`/mypage?mergeSuccess=履歴の統合が完了しました。マイページからご確認ください。` へ遷移する。しかし `/mypage` は `cancelled` クエリしか読まず（page.tsx:35-37, 75, 83 の `FlashMessage queryKey="cancelled"`）、`mergeSuccess` を読む箇所がリポジトリ内に 1 つも無い。利用者は予約一覧が出るだけで、取り消せない操作が成功したのかどうか一切フィードバックを受けられない。失敗側（`/mypage/merge/confirm?error=...`）だけが描画されるという非対称なので、「押したが何も起きなかった」と誤解して戻って再送信すると、今度はトークン消費済みのエラーが出る。

#### 直し方

`/mypage` に `mergeSuccess` 用の `FlashMessage` を足す。ただしクエリ文字列の値をそのまま描画すると次の指摘と同じ反射になるので、URL には固定のセンチネル（例 `?merged=ok`）だけを載せ、文言はページ側の定数で持つ。

#### 該当箇所

```
redirect(
toAppRoute(
`/mypage?mergeSuccess=${encodeURIComponent(MERGE_SUCCESS_MESSAGE)}`,
),
);
```

#### 到達経路

src/app/(public)/mypage/layout.tsx:131（UnlinkedGuestHistoryNotice）→ src/app/(public)/mypage/\_components/unlinked-guest-history-notice.tsx:36（「自分で統合する」→ /mypage/merge/request）→ src/app/(public)/mypage/merge/confirm/page.tsx:82（ConfirmMergeForm）→ src/app/(public)/mypage/merge/confirm/\_components/confirm-merge-form.tsx:22（form action={confirmCustomerMergeAction}）→ src/app/(public)/mypage/\_shared/actions/customer-merge.ts:200（consumeCustomerMergeTokenCommand 成功、間に early return/throw 無し）→ 同 :241-245（redirect `/mypage?mergeSuccess=...`）→ src/app/(public)/mypage/page.tsx:35（`sp["cancelled"]` のみ参照）/ :75,:83（FlashMessage queryKey="cancelled" のみ）→ mergeSuccess を描画する箇所が存在せず（repo 全体の grep ヒットは customer-merge.ts:243 の 1 件のみ）、完了バナーが出ないまま予約一覧が表示される。E2E も e2e/authenticated/customer/customer-merge.spec.ts:75-81 で URL と CTA 消滅しか見ないため検出しない。

#### 既存の検査

none。`mergeSuccess` を src / \_\_tests\_\_ / e2e 全体で grep したヒットは、この生成箇所 1 行のみ。

#### 反証官による訂正

2 点の誇張・不正確がある。(1)「一切フィードバックを受けられない」は言い過ぎ。統合成功でゲスト Customer 行が消えるため layout.tsx:113 の hasUnlinkedGuestCustomerForEmail が false になり、統合バナーと「自分で統合する」CTA（unlinked-guest-history-notice.tsx:25 の early return）が消え、移管された予約が /mypage の一覧に現れる（customer-merge.ts:202-209 で CUSTOMERS/RESERVATIONS 等を updateTag 済み）。実際 E2E はこの CTA 消滅を完了の観測点にしている（customer-merge.spec.ts:79-81）。したがって欠けているのは明示的な完了バナーであり、成否不明の silent failure ではない。severity は medium ではなく low が妥当。(2)「戻って再送信すると、今度はトークン消費済みのエラーが出る」は不正確。confirm ページへの戻り（GET）時点で validateCustomerMergeTokenCommand が consumedAt を見て VERIFICATION\_ALREADY\_APPLIED\_MESSAGE を throw する（customer-merge-commands.ts:169-171）が、merge/confirm/page.tsx:58-66 は DomainError のメッセージを捨て `message: actionError ?? undefined`（GET では actionError は null）を渡すため、実際に表示されるのは汎用の「確認 URL が無効または期限切れです」で、再送信は不要。なお、この「既に適用済み」メッセージが GET 経路で握り潰されている点は本指摘とは別の（同種だが独立した）UX 欠落。

---

### F-108

**初回メール登録の「確認メールを送信しました」が画面に出ず、利用者は認証リンクを踏む必要に気付けない**

<sub>[対処の記録](2026-08-12-codebase-audit-progress.md) ／ [棄却一覧](2026-08-12-codebase-audit-refuted.md)</sub>

|        |                                                          |
| ------ | -------------------------------------------------------- |
| 深刻度 | 低                                                       |
| 箇所   | `src/app/(public)/mypage/_shared/actions/profile.ts:199` |
| 領域   | Server Action                                            |

#### 起きること

LINE OAuth ログイン（email scope 未付与）で Customer.email が空の会員が /mypage/settings でメールアドレスを入力して保存する。サーバーは Customer.email を更新せず PendingCustomerEmailChange を作って確認メールを送り、`successMessage: "確認メールを送信しました。メールに記載された URL をクリックして登録を完了してください。"` を返す。ところが profile-form.tsx はこの successMessage を一切読まず、`status === "success"` を見て固定文言「プロフィールを更新しました」だけを表示する。しかも `{ resetForm: false }` なので入力欄には打ち込んだアドレスが残る。利用者は「登録が完了した」と受け取り、受信箱の確認リンクを踏まない。次回リロードで欄は空に戻り（Customer.email は未更新）、初回メール登録が永久に完了しない。

#### 直し方

admin 側の既存パターン（RecurringReservationForm.tsx:138-140 / SeriesInfoSection.tsx:182-184）と同型で、profile-form.tsx が `"successMessage" in lastResult && typeof lastResult.successMessage === "string"` を読み、あれば固定文言の代わりにそれを表示する。conform-action.ts の successMessage は SubmissionResult に spread される拡張フィールドなので、読み出し側で in 演算子＋型チェックするのが公式型と両立する唯一の形。

#### 該当箇所

```
return {
ok: true,
successMessage: EMAIL_VERIFICATION_SENT_MESSAGE,
};
```

#### 到達経路

src/app/(public)/mypage/settings/page.tsx:35-44,66-77 (Customer.email === "" の会員に defaultValues.email="" で ProfileForm を描画) → src/app/(public)/mypage/settings/\_components/profile-form.tsx:191-204 (email 入力欄が編集可能で表示される) → :54-57 useActionState(updateProfileAction) / :76 dispatchWithoutFormReset(formAction) → src/app/(public)/mypage/\_shared/actions/profile.ts:39 updateProfileAction → :148-154 shouldRequestVerification が true (customer.email === "") → :179-182 requestCustomerEmailChangeCommand (src/shared/domain/customers/customer-email-change-commands.ts:58-110 は PendingCustomerEmailChange を作るだけで Customer.email は不変) → :190-195 sendChangeEmailVerificationEmail → :197-200 return { ok:true, successMessage: EMAIL\_VERIFICATION\_SENT\_MESSAGE } → src/shared/lib/forms/conform-action.ts:110-121 reply() に successMessage を付与 → node\_modules/@conform-to/dom/dist/submission.mjs:150 status:"success" → src/app/(public)/mypage/settings/\_components/profile-form.tsx:114 showSuccess = true → :140-147 固定文言「プロフィールを更新しました」のみ描画され、successMessage は読まれずに捨てられる（誤った結果: 確認リンクを踏む必要が画面に一切出ない）

#### 既存の検査

none。`grep -rn successMessage "src/app/(public)"` の消費側は request-merge-form.tsx（customer-merge 用）のみで、profile-form.tsx は producer/consumer のどちらにも現れない。`grep -rn "EMAIL_VERIFICATION_SENT_MESSAGE|確認メールを送信しました" __tests__ e2e` は profile 経路を 1 件も assert していない（customer-merge.test.ts:171 が merge 側の別文言を見ているだけ）。\_\_tests\_\_/unit/architecture/admin-form-error-notification.test.ts は (admin) 配下限定かつ form-level \*エラー\* のみで、成功メッセージは対象外。

#### 反証官による訂正

失敗シナリオの結論部「次回リロードで欄は空に戻り、初回メール登録が永久に完了しない」は誇張。src/app/(public)/mypage/layout.tsx:89-90 が `if (!customer.email && !pathname.startsWith("/mypage/settings")) redirect("/mypage/settings?require_email=true")` で、Customer.email が空である限りマイページ内の次の遷移で必ず settings に引き戻し、settings/page.tsx:44,58-62 が「サービスをご利用いただくには、メールアドレスの登録が必要です。」バナーを再表示する（merge/request/page.tsx:67-68 も同じ redirect を持つ）。加えて確認メール自体は入力アドレスに URL 付きで届いている（profile.ts:190-195）。よって「永久に詰む」経路ではなく、直後の画面で確認リンクの必要性が伝わらないという UX 上の情報欠落に留まるため深刻度は low が妥当。その他の記述は正確で、特に「固定文言が実際に描画される」点は conform の reply() 実装 (submission.mjs:150) で裏付けられた。既存カバレッジ none の申告も正しい（\_\_tests\_\_/integration/actions/public/mypage-profile.test.ts は戻り値の successMessage を assert していない）。

---

### F-109

**/mypage/merge/confirm がクエリ `error` の中身を検証せずページ自身の警告文として描画する**

<sub>[対処の記録](2026-08-12-codebase-audit-progress.md) ／ [棄却一覧](2026-08-12-codebase-audit-refuted.md)</sub>

|        |                                                      |
| ------ | ---------------------------------------------------- |
| 深刻度 | 低                                                   |
| 箇所   | `src/app/(public)/mypage/merge/confirm/page.tsx:108` |
| 領域   | フロントエンド                                       |

#### 起きること

`actionError` は `searchParams["error"]` をそのまま採ったもの（48 行 `const actionError = typeof rawError === "string" ? rawError : null;`）で、`rate_limit` 以外は文字列がそのまま出力される。攻撃者がログイン済みの顧客に `https://<site>/mypage/merge/confirm?token=xxxx&error=<任意の日本語>` を送ると、サイト正規ドメインの `role="alert"` ボックスに攻撃者が書いた文章が表示される。トークンが無効な場合はさらに悪く、61 行 `message={actionError ?? undefined}` により `InvalidLinkView` の**主文**（既定の「確認 URL が無効または期限切れです」）ごと攻撃者の文章に差し替わり、既定の補足文（`{!message && ...}`）も消えるため、ページ全体が攻撃者の主張だけを載せた正規ページとして見える。React が escape するため markup / script は入らないが、連絡先や別 URL を平文で書いたフィッシング文面をそのまま表示できる。

#### 直し方

URL にはエラー種別のセンチネル（`rate_limit` / `invalid` / `expired` / `inactive` …）だけを載せ、表示文言はページ側の対応表から引く。未知の値は既定文言にフォールバックし、クエリの中身を画面に出さない。DomainError の生メッセージを URL 経由で往復させるのをやめる。

#### 該当箇所

```
{actionError === "rate_limit"
? "リクエストが多すぎます。しばらく経ってから再度お試しください。"
: actionError}
```

#### 到達経路

エントリ: ログイン済み顧客が GET /mypage/merge/confirm?token=aaaa&error=\<任意の日本語文\> を開く → src/app/(public)/mypage/layout.tsx:142-156 → :66-140 MypageAuthGate(認証のみ、クエリ検証なし)で通過 → src/app/(public)/mypage/merge/confirm/page.tsx:39-42(rate limit 未到達で通過) → :47-48 `searchParams["error"]` を無検証で actionError に採用 → :50 token があるので早期 return せず → :56 validateCustomerMergeTokenCommand(token) → src/shared/domain/customers/customer-merge-commands.ts:156-168 で pending 無し → `throw new DomainError(VERIFICATION_INVALID_MESSAGE, "VALIDATION")` → page.tsx:58-64 で `InvalidLinkView message={actionError ?? undefined}` → :128 `{message ?? "確認 URL が無効または期限切れです"}` で攻撃者文字列が主文として描画され、:130 `{!message && ...}` により既定の補足文が消える。別経路(有効 token 保有時): page.tsx:70 `<Layout actionError={actionError}>` → :99-110 の `role="alert"` ボックスで :108 `: actionError` としてそのまま描画。

#### 既存の検査

none。`actionError` / この経路を検査する gate・テストは `__tests__/unit/architecture/` にも `e2e/` にも無い（クエリ由来の表示文字列を検査する gate 自体が存在しない）。`rate_limit` だけがコード→文言の対応表になっており、他は素通し。

#### 反証官による訂正

2 点訂正。(1) 「ページ全体が攻撃者の主張だけを載せた正規ページとして見える」は誇張。InvalidLinkView 経路でも Layout の `<h1>履歴統合の確認</h1>`(page.tsx:98)は残り、さらに showRetry は `actionError !== "rate_limit"`(page.tsx:62)なので任意文言の場合は true となり、:135-145 の「履歴統合リクエストから再度お試しください。」リンク段落もそのまま描画される。消えるのは既定の主文(:128)と補足文(:130-134)だけ。(2) 場所の行番号は :108 単独ではなく、描画ブロックは :99-110(Layout の警告ボックス)と :128(InvalidLinkView の主文)の 2 箇所。指摘の中核(クエリ由来文字列を無検証で自ページの文言として描画)と到達経路・既存カバレッジ none の申告はいずれも正確。

---

### F-110

**初回メールアドレス登録で「確認メールを送信しました」が捨てられ、「プロフィールを更新しました」と表示されるため利用者が登録を完了できない**

<sub>[対処の記録](2026-08-12-codebase-audit-progress.md) ／ [棄却一覧](2026-08-12-codebase-audit-refuted.md)</sub>

|        |                                                                     |
| ------ | ------------------------------------------------------------------- |
| 深刻度 | 低                                                                  |
| 箇所   | `src/app/(public)/mypage/settings/_components/profile-form.tsx:114` |
| 領域   | フロントエンド                                                      |

#### 起きること

LINE ログインでメールアドレスが取れなかった顧客が /mypage/settings でメールアドレスを入力して保存する。サーバーは `Customer.email` を更新せず、確認 URL 付きメールを送って `{ ok: true, successMessage: EMAIL_VERIFICATION_SENT_MESSAGE }`（= 「確認メールを送信しました。メールに記載された URL をクリックして登録を完了してください。」）を返す。ところが画面はこの `successMessage` を一切読まず、`showSuccess` が真になるだけで固定文言「プロフィールを更新しました」（profile-form.tsx:145）を出す。`resetForm: false` なので入力したメールアドレスは欄に残り、直下のヘルプ文は「LINE アカウントからメールアドレスが取得できませんでした」のまま。利用者は登録が終わったと解釈してメールを開かず、メールアドレスは未登録のまま残る（＝予約確定メールが届かない）。気づいて再送信しようとしても `emailVerificationRequestRateLimiter`（3 回/時, rate-limit.ts:344）で 4 回目から拒否される。

#### 直し方

admin の 2 箇所と同じく `"successMessage" in lastResult && typeof lastResult.successMessage === "string"` で取り出し、あればそれを表示、無ければ既定文言にフォールバックする。`ConformHandlerResult` の `successMessage` を返しているのに読み手がいない状態を残さない。

#### 該当箇所

```
const showSuccess = lastResult?.status === "success";
```

#### 到達経路

src/app/(public)/mypage/layout.tsx:89（email 空 → /mypage/settings?require\_email=true へ redirect）→ src/app/(public)/mypage/settings/page.tsx:66-77（customer.email="" を ProfileForm へ）→ profile-form.tsx:191-213（email 入力欄 + 「LINE アカウントからメールアドレスが取得できませんでした」ヘルプを描画）→ profile-form.tsx:54-57 useActionState(updateProfileAction) → src/app/(public)/mypage/\_shared/actions/profile.ts:148-152（shouldRequestVerification=true）→ profile.ts:179-195（token 発行 + 確認メール送信、Customer.email は未更新）→ profile.ts:197-200 `return { ok: true, successMessage: EMAIL_VERIFICATION_SENT_MESSAGE }` → src/shared/lib/forms/conform-action.ts:111-121（resetForm:false なので `submission.reply()` = status "success"、successMessage を余剰プロパティで付加）→ profile-form.tsx:114 `showSuccess = lastResult?.status === "success"`（successMessage を読まない）→ profile-form.tsx:140-147 固定文言「プロフィールを更新しました」を描画（＝誤った結果。「確認メールを送信しました…」は表示されない）

#### 既存の検査

none。`successMessage` を読んでいるのは admin 側の `SeriesInfoSection.tsx:182-184` と `RecurringReservationForm.tsx:138-140` のみ（src 全体を grep 済み）。`EMAIL_VERIFICATION_SENT_MESSAGE` / 同文言を参照するテストは `__tests__/` と `e2e/` に存在しない（該当文言のヒットは merge 側の `__tests__/integration/actions/customer-merge.test.ts:171` だけ）。

#### 反証官による訂正

見出しの「利用者が登録を完了できない」は誇張。確認メール自体は実際に送信され(profile.ts:190-195)、URL をクリックすれば登録は完了するので、機能が壊れているのではなく「完了に必要な次の一手が画面から伝わらない」表示上の欠陥。さらに指摘が挙げていない緩和シグナルが 3 つ残る: (a) 受信箱に確認メールが届く、(b) Customer.email は空のままなので保存後も email 入力欄と「LINE アカウントから…取得できませんでした」ヘルプ文が残る、(c) mypage/layout.tsx:130 の IncompleteProfileNotice は isCustomerProfileComplete(profile-check.ts:18 が email 非空を要求)を満たさず表示され続ける（ただし文言は「お名前が未登録です」で email を名指ししないため誤誘導ではある）。またレート制限の記述が不正確: 同じアドレスへの再送で先に効くのは emailVerificationByEmailRateLimiter（rate-limit.ts:353-356、2 回/時）で、「4 回目から拒否」ではなく同一アドレスなら 3 回目で拒否される（IP 単位の 3 回/時は rate-limit.ts:344-347 で記述どおり）。深刻度はデータ損失・セキュリティ影響が無く回復可能なため low が妥当。

---

### F-111

**メールの .ics リンクを踏んだ直後 30 分間、ログイン済み顧客はマイページから別予約の .ics を取得できず 401 になる**

<sub>[対処の記録](2026-08-12-codebase-audit-progress.md) ／ [棄却一覧](2026-08-12-codebase-audit-refuted.md)</sub>

|        |                                                      |
| ------ | ---------------------------------------------------- |
| 深刻度 | 低                                                   |
| 箇所   | `src/app/api/calendar/reservation/[id]/route.ts:117` |
| 領域   | API / cron / webhook                                 |

#### 起きること

予約 A と B を持つ会員が、A の確認/リマインダメールの iCal リンク（src/shared/lib/email/reservation-emails.ts:132 の ?token=...）をクリックする。src/proxy.ts:335-360 が token を calendar-reservation-token cookie（path=/api/calendar/reservation、maxAge=30 分）へ転写する。その 30 分以内に同じブラウザでマイページの予約 B 詳細を開き .ics ボタン（src/app/(public)/mypage/reservations/\[id\]/\_components/reservation-detail.tsx:338 の token 無し URL）を押すと、cookie が送られて token 検証は valid（targetId=A）になり、A !== B で 401 "Invalid token" を返す。セッション経路へのフォールバックが無い（route.ts:71 の `if (token === null)` に入らないため）ので、自分の予約なのに .ics が落とせない。cookie 期限切れ（最大 30 分）まで回復手段が無い。同じ欠陥が src/app/api/calendar/event/\[registrationId\]/route.ts:118-131 にもある。

#### 直し方

cookie token の targetId が URL の id と一致しない場合は 401 で終わらせず、cookie を無視して session 経路（getCustomerSession + customerId 所有権照合）へフォールバックする。セッションが無い場合のみ 401 にする。event 側も同じ形に揃える。

#### 該当箇所

```
if (verifiedTokenTargetId !== undefined) {
if (verifiedTokenTargetId !== reservationId) {
// payload と URL の reservationId 不一致 = 改ざんまたは流用
```

#### 到達経路

メールの .ics クリック（src/shared/lib/email/reservation-emails.ts:132 が `/api/calendar/reservation/<A>?token=…` を生成） → src/proxy.ts:453 proxy() 冒頭の handleGuestTokenTransfer → src/proxy.ts:337-342 で prefix ルート一致（:311-316）→ :349-358 で cookie `calendar-reservation-token`（path=/api/calendar/reservation, maxAge=1800）を Set-Cookie → 30 分以内にマイページ予約 B 詳細の `<a href="/api/calendar/reservation/<B>" download>`（reservation-detail.tsx:338 → add-to-calendar.tsx:71-74）をクリック → GET /api/calendar/reservation/&lt;B&gt; に cookie 同送 → route.ts:65-66 で token 取得（非 null）→ :71 の session 経路をスキップ → :82 verifyCalendarToken が valid（targetId=A、寿命 30 日: calendar-token.ts:38, :149-159）→ :103 verifiedTokenTargetId=A → :117-118 で A !== B → :130 `return new NextResponse("Invalid token", { status: 401 })`。ログイン済み本人の予約 B なのに 401。

#### 既存の検査

none。\_\_tests\_\_/integration/api/calendar-reservation.test.ts は「無効な cookie token」「session 無しで有効 cookie token」「別顧客の予約で 404」は見ているが、有効セッション＋別予約向け cookie token の組み合わせが無い。e2e/authenticated/customer/calendar-download.spec.ts はマイページ経路のみで、先行する cookie を持たない。

#### 反証官による訂正

3 点訂正。(1)「cookie 期限切れ（最大 30 分）まで回復手段が無い」は誇張。予約 B 自身の確認メール / リマインダの .ics リンクを踏めば src/proxy.ts:349-358 が targetId=B の新 cookie を上書きするため、B の .ics は即座に取得でき、以後 A も 30 分後に回復する。同一 UI ブロックの Google / Outlook リンク（add-to-calendar.tsx:48-68）は外部 URL なので影響を受けず、代替導線が残る。この「認可失敗ではなく一時的な導線劣化・fail-closed で情報漏洩は無い・回避策あり」という性質から medium ではなく low が妥当。(2) 「場所」の :117 は if ブロックの開始行で、401 を返すのは :130。(3) 指摘が挙げていない同根の系がもう 1 つある: cookie が session 経路を完全に先取りする（route.ts:71）ため、cookie 内 token が expired だと予約 A 本人・ログイン済みでも :98-101 で 410 "Token expired" になる。ただし token 寿命 30 日 / cookie 30 分なので実際に踏む窓は極めて狭い。

---

### F-112

**退会（匿名化）済み顧客の予約でリマインダ cron が placeholder アドレス宛に送信し、確実に hard bounce する**

<sub>[対処の記録](2026-08-12-codebase-audit-progress.md) ／ [棄却一覧](2026-08-12-codebase-audit-refuted.md)</sub>

|        |                                                     |
| ------ | --------------------------------------------------- |
| 深刻度 | 低                                                  |
| 箇所   | `src/app/api/cron/reservation-reminder/route.ts:62` |
| 領域   | メール・通知                                        |

#### 起きること

会員 A が明後日 10:00 の予約（status=CONFIRMED、reminderSentAt=null）を持ったままマイページからアカウント削除を実行する。deleteAccountAction → Better Auth deleteUser → beforeDelete → anonymizeCustomerBeforeAuthUserDelete → anonymizeCustomerCommand が走り、Customer.email/emailCanonical は `deleted+<uuid>@anonymized.local` に、Reservation.guestEmail は null に書き換わる（src/shared/domain/customers/customer-lifecycle-commands.ts:145-183）。予約自体はキャンセルされない。翌日の reservation-reminder cron は findReservationsForReminderWindow（src/shared/domain/reservations/admin-queries.ts:623-653、anonymizedAt / placeholder の除外条件なし）でこの予約を拾い、guestEmail が null なので customer.email = `deleted+<uuid>@anonymized.local` を宛先に採用する。`.local` は RFC 6762 の予約 TLD で MX を持たないため Resend は必ず hard bounce を返す。sendEmail の suppression は emailDeliveryStatus が OK のうちは効かない（src/shared/lib/email/send.ts:94-107）ので初回は素通りし、bounce 後に email.bounced webhook が同 placeholder に HARD\_BOUNCED を書く。以後は reason="suppressed" が返り、cron は release → 次の毎時実行で再 claim → 再 suppressed を同一ウィンドウ日の間ずっと繰り返す（route.ts:105-113 が reason!=="disabled" で claim を解放するため）。データ保持側の匿名化（anonymizeInactiveCustomers）は「recent/upcoming 予約あり」を除外条件に持つのに、マイページ自削除経路にはその前提が無いのでこの状態が作れる。

#### 直し方

「匿名化済み Customer は宛先にしない」を送信境界の 1 箇所で表現する。最小手は findReservationsForReminderWindow / findEventRegistrationsForReminderWindow の where に customer.anonymizedAt=null（および guestEmail が null のケース）を足して cron の母集合から外すこと。より根本的には、匿名化時に placeholder を「送信不可」として扱えるようにする — anonymizeCustomerCommand で suppressedEmailHash に placeholder emailCanonical の hash も入れておけば、リマインダに限らず返金・キャンセル・ステータス変更など全経路で sendEmail が送信前に落とせる（cron 側の release ループも起きない）。あわせて、退会時に未来の CONFIRMED 予約をどう扱うか（キャンセル必須にするか許容するか）を製品判断として決める。

#### 該当箇所

```
for (const reservation of reservations) {
const email = reservation.guestEmail ?? reservation.customer?.email;
if (!email) {
skipped++;
continue;
}
```

#### 到達経路

src/app/(public)/mypage/\_shared/actions/account.ts:203 deleteAccountAction → customerAuth.api.deleteUser（この時点では確認メール送信のみ: src/shared/lib/customer-auth.ts:140-162）→ 本人が確認リンクを踏む → src/shared/lib/customer-auth.ts:169-171 beforeDelete → src/shared/domain/customers/account-deletion.ts:27 anonymizeCustomerBeforeAuthUserDelete → src/shared/domain/customers/customer-lifecycle-commands.ts:143-144（Customer.email = deleted+\<id\>@anonymized.local）/ :174-183（Reservation.guestEmail = null）※予約 status は CONFIRMED、reminderSentAt は null のまま → 翌日 GET /api/cron/reservation-reminder（src/app/api/cron/reservation-reminder/route.ts:52-55）→ src/shared/domain/reservations/admin-queries.ts:627-654 が anonymizedAt 無視で当該予約を返す → route.ts:62 `reservation.guestEmail ?? reservation.customer?.email` が分岐 :63 の !email を通過（placeholder は非空）→ route.ts:77 claimReservationReminder 成功 → route.ts:84 sendReservationReminderEmail → src/shared/domain/email/dispatch.ts:74 → src/shared/lib/email/reminder-emails.ts:95 `to: data.customerEmail` → src/shared/lib/email/send.ts:101 の suppression 判定を素通り（初回は emailDeliveryStatus=OK）→ send.ts:182 resend.emails.send が MX を持たない `.local` 宛に送信＝hard bounce。以降 email.bounced webhook が HARD\_BOUNCED を書くと send.ts:124-128 が reason="suppressed" を返し、route.ts:106-107 が claim を解放 → 毎時（terraform/cloud\_scheduler.tf:95）再 claim → 再 suppressed のループがその窓日中続く。

#### 既存の検査

none。src/shared/domain/reservations/、src/shared/lib/email/、src/app/api/cron/ を `anonymizedAt` / `anonymized.local` で grep して 0 件。\_\_tests\_\_/unit/api/cron-reservation-reminder.test.ts と \_\_tests\_\_/integration/domain/reservations/reminder-idempotency.test.ts にも anonymize 関連の assertion は無い。anonymize 側のテスト（\_\_tests\_\_/integration/domain/customers/anonymize-command.test.ts 等）は列の書き換えだけを見ており、匿名化後の送信経路は見ていない。DB 制約も無い。

#### 反証官による訂正

指摘の骨子は正しいが、記述に 4 点の不正確さがある。(1) 「マイページからアカウント削除を実行する」で即座に匿名化されるかのように書かれているが、deleteAccountAction は確認メールを送るだけで、beforeDelete → 匿名化はユーザーがメール内リンクを踏んだ時点（Better Auth の delete-user callback）に発生する（src/app/(public)/mypage/\_shared/actions/account.ts:164-206、src/shared/lib/customer-auth.ts:134-171）。到達性は変わらないが、再現には確認リンク踏破のステップが要る。(2) 行番号: placeholder 生成は customer-lifecycle-commands.ts:78、Customer 側の書き換えは :143-144、Reservation.guestEmail の null 化は :174-183 で、指摘の「145-183」は Customer 側の起点をずらしている。(3) 「確実に hard bounce」する回数の見積りが過大。実送信は窓日あたり実質 1 回に抑えられる — idempotencyKey が `reservation-reminder/<reservationId>/<reminderWindowDate>`（src/shared/lib/email/reminder-emails.ts:115）で窓日単位に固定されており、Resend の idempotency key は 24h 有効で再実行時は元レスポンスを返すため、suppression が効く前の毎時再試行でも新規送信にはならない。suppression 成立後は send.ts:124-128 で Resend 到達前に短絡する。したがって被害は「退会 1 件あたり hard bounce 1 通 + その窓日の claim churn とログノイズ」に留まり、PII 漏洩も無い（宛先は非ルータブルな `.local`）。発生条件も「予約が窓日に入る状態で確認済み退会」に限られるため medium は過大で low が妥当。(4) route.ts:62 の `reservation.customer?.email` の optional chaining は形式的なもので、Reservation.customer は必須リレーション（prisma/schema.prisma:897）。つまり guestEmail が null なら placeholder が「採用されうる」ではなく「必ず採用される」。

---

### F-113

**認証さえあれば他人の serialNo の DL バケットを焼き切れる（所有者突合より前に消費）**

<sub>[対処の記録](2026-08-12-codebase-audit-progress.md) ／ [棄却一覧](2026-08-12-codebase-audit-refuted.md)</sub>

|        |                                                    |
| ------ | -------------------------------------------------- |
| 深刻度 | 低                                                 |
| 箇所   | `src/app/api/receipts/[serialNo]/pdf/route.ts:122` |
| 領域   | 領収書・PDF                                        |

#### 起きること

serialNo は `YYYY-NNNNNN` の連番で外部から推測できる。攻撃者が任意の Google / LINE アカウントで顧客ログインし（本番は social provider のみだが誰でも作成できる — customer-auth.ts:110-115）、`GET /api/receipts/2026-000123/pdf` を 10 回叩く。115-118 行の session チェックは通り、本行の per-serialNo バケット（10/hour、GET と POST で共有）は 127 行の findReceiptForDownload よりも 137 行の所有者突合よりも前に消費されるため、攻撃者がその領収書を所有していなくてもバケットは枯渇する。以後 1 時間、正規会員の mypage 一覧からの DL(receipt-list.tsx:92) も、ゲストがメールの単発リンク経由で行う POST(199-208 行が同じバケットを引く) も 429 になる。proxy の 100/min/IP 制限下でも 1 時間に約 600 件の serialNo を焼けるため、小規模事業者の 1 年分の領収書番号を継続的に締め出せる。ゲスト側の画面は 429 と「無効または期限切れ」を区別できないので、被害者は再送信フローへ回り finding 1 の日付付け替えまで誘発される。

#### 直し方

GET 経路のバケット key を serialNo 単体ではなく `${customer.id}:${serialNo}` にする、または 137 行の ownership 突合を通過した後にのみ consume する（findReceiptForDownload は serialNo unique の 1 行 read なので前倒しのコスト削減効果は小さい）。POST は token 検証済みなので現状のままでよい。

#### 該当箇所

```
const rateLimit = await receiptDownloadBySerialNoRateLimiter.check(serialNo);
```

#### 到達経路

認証済み非所有者が `GET /api/receipts/2026-000123/pdf` を送信 → src/app/api/receipts/\[serialNo\]/pdf/route.ts:115 `getCustomerSession()` が任意の Google/LINE 顧客 session で non-null（src/shared/lib/customer-auth.ts:261-267 は session 取得のみで所有権も Customer 行も見ない）→ route.ts:116-118 の 404 early return を通過 → route.ts:122 `receiptDownloadBySerialNoRateLimiter.check(serialNo)` → src/shared/lib/rate-limit.ts:133 → src/shared/lib/rate-limit.ts:84-113 が serialNo キーの count を無条件に +1 → route.ts:127 `findReceiptForDownload` / route.ts:137 `ownerId !== customer.id` で 404 が返るがカウントは残存 → 10 回目以降 src/shared/lib/rate-limit.ts:98-104 が `success:false` → 以後 1 時間、正規所有者の GET(route.ts:122-125) と、ゲストの単発 token POST(route.ts:205-208) がいずれも 429。src/shared/lib/rate-limit.ts:410-413 が interval=1h / maxRequests=10、同 7-17 が max-instances=1 前提のためバケットは実質グローバル。

#### 既存の検査

\_\_tests\_\_/integration/api/receipts/receipt-download-blocked.test.ts:300 が「セッションなしのリクエストは shared per-serialNo bucket を消費しない (Codex #1426)」を、token-post-only.test.ts:362 が「無効 token は shared bucket を消費しない」を固定している。どちらも**セッションを持つ非所有者**による消費を検査していない。route.ts:110-114 のコメントはこの並びで Codex #1426 の DoS を塞いだと述べるが、閉じたのは匿名経路だけ。\_\_tests\_\_/unit/rate-limit/receipt-download-rate-limit.test.ts は limiter 単体の挙動のみ。

#### 反証官による訂正

機序は正しいが、記述に 5 点の誤りと過大評価がある。(1) 根拠の取り違え: 「customer-auth.ts:110-115 で誰でも作成できる」は逆で、当該行は `emailAndPassword.enabled` を `NODE_ENV === "development" || isE2EOptIn` に限定しており、本番ではパスワード登録が**無効**であることを示す行。オープン登録の根拠は同 116 行の `socialProviders`(Google/LINE) であって引用行ではない。(2) ゲスト UX の主張が誤り: ゲスト経路は download-form.tsx:35 の native `<form method="POST">` で、429 の際はブラウザが Route Handler の応答へ遷移し `Too many requests`(route.ts:207) の素のテキストを表示する。「無効または期限切れ」(download/page.tsx:80,97,104 の `InvalidLinkView`) はページ側でしか出ないので両者は明確に区別できる。(3) 被害の過大評価: 429 は `claimReceiptForSingleUseTokenDownload`(route.ts:239) より前に return するため `usedAt` は消費されず、24h の token 有効期間内に再試行すればそのまま DL できる。「被害者が再送信フローへ回り finding 1 を誘発する」は成立しない。(4) コメントの読み違い: route.ts:110-114 は「session 自体を持たない匿名リクエストが shared bucket を消費してしまうと」と明示的に匿名経路だけを対象と宣言しており、認証済み非所有者まで塞いだとは述べていない。(5) 局所的欠陥ではなく既定パターン: 同型の resource 単位 limiter は src/app/api/calendar/reservation/\[id\]/route.ts:134-141 でも「認可ゲート(session/token)より後・所有権解決より前」に置かれており、コメントで「receipt PDF DL の HTTP-03 と同型」と明記されている。つまり「DB read を brute-force から守るため所有者突合より前に置く」(route.ts:120-121) という意図的トレードオフであり、この 1 ファイルの見落としではない。なお 100/min/IP 下で 600 serialNo/h の算術は正しいが、LRU の TTL が interval と同値(rate-limit.ts:81)のため締め出しの維持には毎時の再焼却が必要。総合すると、認証必須・可用性のみ・最長 1 時間で自動回復・情報漏洩なしのハードニングギャップで、medium ではなく low。

---

### F-114

**Resend webhook が data.to の全宛先を一括で suppression する（バウンスしていないアドレスまで永久抑止）**

<sub>[対処の記録](2026-08-12-codebase-audit-progress.md) ／ [棄却一覧](2026-08-12-codebase-audit-refuted.md)</sub>

|        |                                            |
| ------ | ------------------------------------------ |
| 深刻度 | 低                                         |
| 箇所   | `src/app/api/webhooks/resend/route.ts:444` |
| 領域   | webhook ルーティング・Resend               |

#### 起きること

管理通知メールは 1 通を複数宛先に送っている（src/shared/lib/email/system-emails.ts:88 `to: [...delivery.notificationEmails]`。contact-emails.ts:94 / event-emails.ts:604 / inquiry-emails.ts:80 / reservation-emails.ts:699,806 も同型）。notificationEmails が \["owner@example.com", "ex-staff@example.com"\] のとき、退職者の ex-staff@ のメールボックスが削除されると Resend は `email.bounced` を 1 件だけ発火し、その payload の `data.to` にはメッセージの全宛先が入る（Resend の bounce payload はどの宛先がバウンスしたかを識別しない）。route.ts:271 `const recipients = event.data.to ?? [];` はこれをそのまま suppression 対象リストとして扱い、applyStatusPerRecipient が owner@example.com にも HARD\_BOUNCED を書く。owner が Customer 行を持っていれば（運営者が自分でストアフロントから予約・検証するのは通常運用）、その瞬間から getSuppressedEmailSet() に載り、sendEmail が予約確認・領収書・リマインダー・管理通知のすべてから silent に除外する（send.ts:97-106 の filteredRecipients）。同じ経路が email.complained / email.failed(invalid\_recipient) / email.suppressed にもあり、失敗は例外もエラーログも出さない（成功パスとして 200 が返る）。復旧は管理 UI の resetCustomerEmailDeliveryStatusCommand を人が気づいて叩くまで無い。

#### 直し方

バウンス起因を宛先に帰属できるのは recipients.length === 1 のときだけ。`event.data.to` が 2 件以上のときは suppression を書かず、breadcrumb（EXTERNAL\_API / MEDIUM、emailId と recipientCount のみ）を残して 200 ack する。email.bounced / email.failed / email.suppressed の 3 経路に同じガードを入れる。email.complained は本人申告なので同様に単一宛先限定にする（複数宛先の 1 通に対する苦情でも、誰が押したかは payload から分からない）。テスト側は「複数宛先 → 誰も抑止されない + breadcrumb が出る」に置き換える。

#### 該当箇所

```
for (const recipient of recipients) {
try {
const updated = await updateCustomerEmailDeliveryStatusByEmail(
recipient,
status,
reason,
);
```

#### 到達経路

前提: SettingsNotification.notificationEmailAddresses = \["owner@example.com", "ex-staff@example.com"\]、かつ owner@example.com が Customer 行を持つ（storefront 予約または問い合わせ経由で作成: src/shared/domain/reservations/resolve-customer.ts:80 / src/shared/domain/inquiries/commands.ts:423）。

\1. src/shared/lib/email/system-emails.ts:88 — `to: [...delivery.notificationEmails]` で 1 通を 2 宛先へ送信（同型: src/shared/lib/email/inquiry-emails.ts:80 / src/shared/lib/email/contact-emails.ts:94 / src/shared/lib/email/event-emails.ts:604 / src/shared/lib/email/reservation-emails.ts:699,806 / src/shared/lib/email/system-emails.ts:158）
\2. ex-staff@ のみが恒久バウンス → Resend は `email.bounced` を 1 件発火。payload 型は node\_modules/resend/dist/index.d.mts:2262-2268 の `EmailBouncedEvent` = `BaseEmailEventData & { bounce: { message; subType; type } }`。`data.to`（同 2163）はメッセージの全宛先、`bounce` にバウンスした宛先の識別子は無い
\3. src/app/api/webhooks/resend/route.ts:122 POST → :188 handleEvent → :235 handleBounced
\4. src/app/api/webhooks/resend/route.ts:271 — `const recipients = event.data.to ?? []` が \["owner@…","ex-staff@…"\] を丸ごと採用。:272 の早期 return は length===0 のみで、複数宛先を弾く分岐が無い
\5. src/app/api/webhooks/resend/route.ts:293-296 — bounce.type==="Permanent" なので status = HARD\_BOUNCED
\6. src/app/api/webhooks/resend/route.ts:444-450 — applyStatusPerRecipient の for ループが owner@ にも HARD\_BOUNCED を適用
\7. src/shared/domain/customers/commands.ts:388-417 — `prisma.customer.updateMany({ where: { emailCanonical } , data: { emailDeliveryStatus: HARD_BOUNCED } })` が owner@ の Customer 行を書き換え（PROTECTED\_BY\[HARD\_BOUNCED\] は COMPLAINED のみ保護なので OK 行は素通しで更新される）
\8. src/shared/domain/customers/queries.ts:426-455 — getSuppressedEmailSet が HARD\_BOUNCED 行の hash を返す（route.ts:510 の immediate-expire で即時反映）
\9. src/shared/lib/email/send.ts:97-106 — 以後 owner@ 宛は filteredRecipients から落ち、予約確認・領収書・リマインダー・管理通知が silent に届かなくなる。route.ts は failed=0 のまま :197 で 200 を返し、エラーログも出ない
\10. 復旧は src/shared/domain/customers/commands.ts:441 resetCustomerEmailDeliveryStatusCommand を人が手動で叩くまで無い

#### 既存の検査

\_\_tests\_\_/unit/api/resend-webhook.test.ts:352-380（M3, `to: ["a@example.com","b@example.com"]` で 2 件とも更新されることを assert）と :484-520（L3, email.failed + invalid\_recipient で 2 宛先とも HARD\_BOUNCED を expect(applied).toEqual で固定）が、この fan-out を「正しい仕様」として明示的に焼き付けている。つまり 1 件バウンスで無関係宛先まで抑止する挙動を守る側のテストになっており、修正すると赤くなる。

#### 反証官による訂正

確認できた点（指摘どおり）: 引用の逐語一致、guard 不在、4 イベント共通の経路、Resend payload に recipient 識別子が無いこと（SDK 型定義で確定。指摘は「識別しない」と断定していたが、これは正しい）、テスト :484-520 が fan-out を `toEqual` で固定していること、失敗が silent（200 + ログ無し）であること。

深刻度を high → low に補正する理由:

\1. **顧客向けメールは fan-out しない。** 複数宛先 `to` は 7 箇所すべてが `[...delivery.notificationEmails]`（管理通知）で、顧客宛は全件が単一宛先の `to: data.customerEmail` 等（src/shared/lib/email/\*.ts の `to:` 全 40 箇所を確認）。cc/bcc の使用も 0 件。したがって「一般顧客が巻き添えで永久抑止される」経路は存在せず、巻き添えになり得るのは**設定済みの通知アドレスに限られる**。指摘の失敗シナリオ本文もこの点は正しく書いているが、深刻度の見積りが被害範囲に比して過大。

\2. **3 条件の同時成立が必要。** (a) notificationEmails が 2 件以上、(b) そのうち 1 件が Permanent bounce / complaint / invalid\_recipient / suppressed、(c) 別の 1 件が Customer 行を持つ。(c) はコードが作らない偶然のデータ状態で、通知アドレス（settings の任意アドレス + staff User メール）が Customer 行を自動生成する経路は無い。(c) を欠くと updateMany の count=0 で完全な no-op（副作用ゼロ）。

\3. **最も頻度の高いバウンス種別は無害。** route.ts:293-296 で "Permanent" 以外（Transient / Undetermined / 未知値 / undefined）は SOFT\_BOUNCED になり、queries.ts:432-441 の suppression 集合は HARD\_BOUNCED / COMPLAINED のみを対象とするため、一時的バウンスの fan-out では抑止が起きない。

\4. **既存テストの位置づけの誇張。** :352-380 の M3 テストは `email.complained` を使った「1 件目が throw しても 2 件目が処理される」というエラー分離の検証で、複数宛先は題材にすぎない。fan-out を仕様として焼き付けているのは実質 :484-520（L3）の `expect(applied).toEqual([...])` 1 本。「fan-out を守る側のテスト」という表現は L3 には当たるが M3 には過大。

\5. **修正が自明ではない点の未言及。** payload に recipient 識別子が無いことが SDK 型で確定している以上、「バウンスした宛先だけ抑止する」修正は原理的に書けない。取り得るのは「`to.length > 1` のイベントでは suppression を適用せず breadcrumb のみ残す」といった fail-open への倒し方で、これは情報欠落に対する設計判断であって単純なロジックバグの修正ではない。指摘はこの制約に触れていない。

---

### F-115

**コマンドパレット検索が EDITOR の userPageAssignment スコープを無視して全 page を返す**

<sub>[対処の記録](2026-08-12-codebase-audit-progress.md) ／ [棄却一覧](2026-08-12-codebase-audit-refuted.md)</sub>

|        |                                                 |
| ------ | ----------------------------------------------- |
| 深刻度 | 低                                              |
| 箇所   | `src/shared/domain/admin-search/queries.ts:149` |
| 領域   | admin 読み取り境界                              |

#### 起きること

EDITOR が /about だけに割り当てられている状態で、管理画面のコマンドパレットに 2 文字以上を入力する。searchAdminResources（\_shared/actions/command-palette/search.ts:37-39）は SEARCHABLE\_RESOURCES を hasPermission(role, r, "read") でのみ絞るため、EDITOR は page:read を持つので "page" が allowed に入る。searchPages の where は title/slug の部分一致だけで、allowedPageIds も isActive も deletedAt も PAGES\_MANAGED\_ELSEWHERE 除外も掛けていない。対して同じ EDITOR 向けの一覧経路 getPagesList（\_shared/queries/pages.ts:26-30）と /admin/api/pages/deleted（route.ts:36-39）は isEditorRole のとき getAssignedPageIdsForUser で id を絞り込む。結果、割り当て外の未公開ドラフト・ソフト削除済みページのタイトルと slug（= 将来の公開 URL）が EDITOR に露出する。href をクリックすると /admin/pages/\<slug\> 側は requireAdminResourcePermission で notFound になるので、\_helpers.ts の docstring が掲げる existence hiding 方針とも矛盾する。

#### 直し方

searchByResource に呼び出し側の user を渡し、resource === "page" かつ isEditorRole のときだけ getAssignedPageIdsForUser の結果を where.id に足す。ついでに他の search\* と揃えて deletedAt: null / isActive: true も付ける（searchPosts / searchEvents / searchInquiries は既に deletedAt: null を持っている）。

#### 該当箇所

```
OR: [{ title: ci(query) }, { slug: ci(query) }],
```

#### 到達経路

src/app/(admin)/admin/(dashboard)/layout.tsx:120（CommandPalette を role 無条件で描画）→ \_shared/components/command-palette/CommandPaletteProvider.tsx:90 `searchAdminResources(query)` → \_shared/actions/command-palette/search.ts:21-22 `checkAdminAuth`（EDITOR は canAccessAdmin=true / admin-roles.ts:24-28 + permissions.ts:55-57 で通過）→ search.ts:35 2 文字未満のみ早期 return（2 文字以上は通る）→ search.ts:37-39 `hasPermission(EDITOR,"page","read")`=true（admin-permissions.ts:250-251）で allowed に "page" が残る → search.ts:42 `searchByResource("page", trimmed)` → src/shared/domain/admin-search/queries.ts:299-305 → 同:146-154 `searchPages` → `prisma.page.findMany({ where: { OR: [{title},{slug}] } })`（**allowedPageIds / isActive / PAGES\_MANAGED\_ELSEWHERE のいずれの条件も無い** — 対照は admin-queries.ts:45-52 の `getPagesListQuery`）→ 同:155-161 未割り当てページの title と slug が SearchResultItem として EDITOR に返る（href=/admin/pages/&lt;slug&gt;）。クリック時は pages/\[slug\]/page.tsx:15 `getPageBySlug` → \_shared/queries/pages.ts:38 `requireAdminResourcePermission` → \_helpers.ts:87-90 で notFound となり、\_helpers.ts:44-49 が掲げる existence hiding 方針と検索結果が矛盾する。

#### 既存の検査

\_\_tests\_\_/integration/actions/admin/command-palette.test.ts は searchByResource をモックして「11 resource 並列で呼ぶ」ことしか見ておらず、role は SUPER\_ADMIN 固定。EDITOR / page assignment のケースは unit・integration・architecture のいずれにも無い（grep 済み）。

#### 反証官による訂正

欠陥自体は実在するが medium は過大。実害は「認証済みの社内 EDITOR に対し、担当外ページの title と slug が 1 クエリあたり最大 5 件（SEARCH\_LIMIT\_PER\_RESOURCE=5, queries.ts:12）漏れる」メタデータ開示に留まる。PII も本文も含まず、書き込み権限は一切増えず、href をクリックしても requireAdminResourcePermission で notFound になる（申告どおり）。またロール横断の情報漏洩でもない — 他の 10 resource は EDITOR に read 権限が無いためパレットに出ず、ADMIN/VIEWER は元々 page を全件読めるので、影響を受けるのは EDITOR ロールだけ。\\n\\n事実誤認 2 点: (a) 「deletedAt も掛けていない」は Page モデルに関しては誤り。Page に deletedAt 列は存在せず（schema.prisma:1526-1545、ソフト削除は isActive=false / getDeletedPagesListQuery は isActive:false で引く）、正しくは「isActive=false の削除済みページを除外していない」。なお isActive 未フィルタは EDITOR 固有ではなく ADMIN のパレットにも同じく削除済みページを出すので、スコープ問題とは別の小欠陥として切り分けるべき。(b) 「PAGES\_MANAGED\_ELSEWHERE 除外も掛けていない」は事実だが、当該 slug は posts / news / terms という公開 URL であり秘匿価値が無い。これはセキュリティではなく dead link (/admin/pages/posts は EDITOR で notFound) という UX の指摘。\\n\\n修正するなら searchPages に呼び出し元からの allowedPageIds を渡す必要があるが、admin-search/queries.ts は現状 role を受け取らない純粋な resource→検索の写像であり、searchByResource のシグネチャ変更（+ SEARCH\_BY\_RESOURCE 全 11 関数への影響）を伴う。低深刻度に対して波及が大きいので、対処は任意。

---

### F-116

**予約の自由記述「備考」が匿名化でもデータ保持 purge でも消えない**

<sub>[対処の記録](2026-08-12-codebase-audit-progress.md) ／ [棄却一覧](2026-08-12-codebase-audit-refuted.md)</sub>

|        |                                                                  |
| ------ | ---------------------------------------------------------------- |
| 深刻度 | 低                                                               |
| 箇所   | `src/shared/domain/customers/customer-lifecycle-commands.ts:177` |
| 領域   | 顧客ライフサイクル                                               |

#### 起きること

\1) 公開予約フォームの「備考（任意）」（customer-step.tsx:232「ご要望などございましたらお書きください」、最大 2000 文字 / public-reservation.ts:42）に「当日は代理で田中花子（090-1234-5678）が受け取ります」と入力して予約する。2) その顧客が退会して anonymizeCustomerCommand が走る。3) 同 tx の reservations 更新は guest\* 5 列だけを null 化し、同じ行の notes は触らない。4) データ保持 cron の anonymizeExpiredGuestReservations（data-retention/commands.ts:166-172）も列挙が guest\* 5 列だけなので、何ヶ月経っても notes は残る。5) 結果、退会後も管理画面の予約詳細・予約 CSV エクスポート（reservations/export-queries.ts:36 notes: true）に第三者の氏名と電話番号が残り、Google Calendar 同期の description にも載ったままになる（calendar-sync.ts:148/177 が notes を送る）。

#### 直し方

両方の updateMany の data に notes: null を足し、anonymize-covers-pii.test.ts の fixture の reservation に notes: `備考${TOKEN}` を追加して走査が空振りしないようにする。

#### 該当箇所

```
guestLastName: null,
```

#### 到達経路

\1) 入力: G:/workspace/work/website/customer/myrrh-rental-space/src/app/(public)/reservation/\_components/customer-step.tsx:232 「備考（任意）」textarea（fields.notes, 238 行 getInputProps） → 2) 検証: src/shared/lib/validations/public-reservation.ts:42-47 `notes: z.string().trim().max(2000)...` 内容制約なし → 3) Server Action: src/app/(public)/\_shared/actions/reservation.ts:167-173 `createPublicReservationCommand({ ...data, ... })` で notes が透過 → 4) 永続化: src/shared/domain/reservations/public-commands.ts:259 `notes: input.notes || null` → reservations.notes → 5) 退会分岐: src/shared/domain/customers/customer-lifecycle-commands.ts:174-183 `tx.reservation.updateMany({ where: { customerId }, data: { guestLastName: null, guestFirstName: null, guestEmail: null, guestPhone: null, guestCompanyName: null } })` — data に notes が無く同じ行の notes は無変更（Customer 側は同 156 行で `notes: null` にしているのに対し非対称） → 6) 保持 cron 分岐: src/shared/domain/data-retention/commands.ts:155-173 `anonymizeExpiredGuestReservations` の updateMany も同じ 5 列のみ（runDataRetentionPurge:360-385 から呼ばれる） → 7) 誤った結果（残存の観測点）: src/shared/domain/reservations/admin-queries.ts:463 `notes: reservation.notes`（管理画面の予約詳細）、src/shared/domain/reservations/export-queries.ts:36 `notes: true`（予約 CSV エクスポート）、src/shared/domain/reservations/calendar-sync.ts:148 / 177（Google Calendar description）で、anonymizedAt 刻印後も顧客が書いた自由記述がそのまま読める → 8) gate 不在の確認: \_\_tests\_\_/integration/domain/customers/anonymize-covers-pii.test.ts:71-89 の全表走査は fixture が書いたトークンしか見えず、141-162 の reservation fixture に notes が無いため常に緑。

#### 既存の検査

anonymize-covers-pii.test.ts の fixture は reservations に guestLastName / guestFirstName / guestEmail / guestPhone / guestCompanyName しかトークンを置かない（同テスト 155-159 行）ため、notes 列は全表走査の網に一度も掛からない。Customer.notes は ANONYMIZED\_CUSTOMER\_FIELDS（src/shared/lib/constants/anonymized-customer-fields.ts:30）に入っており自由記述を消す方針自体は採られている。Inquiry については data-retention/commands.ts:180 が「subject / message にも PII が入り得るため partial NULL 化ではなく完全削除する」と同じ理由づけを明記している。

#### 反証官による訂正

引用・行番号は全て実在で改変なし（customer-lifecycle-commands.ts:177 / data-retention/commands.ts:166-172 / public-reservation.ts:42 / customer-step.tsx:232 / export-queries.ts:36 / calendar-sync.ts:148,177 / anonymize-covers-pii.test.ts:155-159 / anonymized-customer-fields.ts:30 / data-retention/commands.ts:180 を個別に確認）。その上で 4 点の事実誤認・誇張がある。

(1) 「データ保持 purge で消えない」というフレーミングが誤解を招く。runDataRetentionPurge（data-retention/commands.ts:360-385）に Reservation 行を削除する経路はそもそも存在せず、reservations は会計証跡として意図的に永久保持される。notes だけが purge を生き延びているのではなく、「guest\* 5 列だけが redact 対象に選ばれている」が正確。「何ヶ月経っても notes は残る」は真だが、同じ行の startTime / totalPrice / numberOfGuests も同様に永久に残る（設計通り）。

(2) Reservation.notes は顧客専用の自由記述ではなく多重所有の列である。admin-commands.ts:211-214 が `【手動割引】¥… - 理由` を追記し、これは manualAdjustmentAmount / priceOverriddenById と対になる価格上書きの根拠（領収書金額の根拠）。さらに calendar-sync-inbound-mutations.ts:93 / 237 が Google Calendar の description を書き戻す。したがって指摘が暗に要求する「updateMany に `notes: null` を足す」は、anonymizeCustomerCommand の JSDoc（customer-lifecycle-commands.ts:20-23）が「決済歴のある Customer を物理削除しない」理由として挙げている会計証跡の保全と正面から衝突する。欠陥というより「顧客入力分だけを分離して消すか、Customer.notes と同様に丸ごと消すと明示的に決めるか」の未決の設計判断に近い。

(3) 失敗シナリオの主軸に第三者 PII（代理人の氏名・電話）を据えたのは論拠として弱い。第三者データは顧客本人の削除請求で消える性質のものではなく、事業記録として保持されるのが原則。実際に効く論点は「顧客本人が自分について書いた自由記述が anonymizedAt 刻印後も平文で残り、EventRegistration.note（event-registration.ts:17 の同型 備考、max 500）や Customer.notes は消しているのに Reservation.notes だけ消していない」という消去契約の非整合のほう。

(4) 深刻度 medium は過大で low が妥当。理由: (a) notes への PII 混入は条件付きで、guest\* 5 列のように必ず実名・メール・電話が入る列とは性質が違う（多くは空か無害な要望文）、(b) 露出面は管理画面詳細・管理者 CSV・staff の Google Calendar のみで公開面には出ない、(c) 正しい修正が自明でない多重所有列である。

なお既存カバレッジの申告は正確だが、このテストは「fixture が書いた列だけ」を見る設計であり、reservation fixture（anonymize-covers-pii.test.ts:141-162）に `notes: \`備考${TOKEN}\\`` を 1 行足せば 296 行のテストが即座に赤になる。gate 側を書き換えずに検出可能で、これが最小の再現手段。

---

### F-117

**管理者による「顧客の紐づけ解除」は顧客の次回ログインで自動的に巻き戻り、問い合わせ本文と添付がマイページに復帰する**

<sub>[対処の記録](2026-08-12-codebase-audit-progress.md) ／ [棄却一覧](2026-08-12-codebase-audit-refuted.md)</sub>

|        |                                           |
| ------ | ----------------------------------------- |
| 深刻度 | 低                                        |
| 箇所   | `src/shared/domain/customers/link.ts:131` |
| 領域   | 問い合わせ                                |

#### 起きること

管理画面の問い合わせ詳細で「顧客の紐づけを解除」を押すと updateInquiryCustomer(inquiryId, null) が走り（commands.ts:342-345）、Inquiry.customerId が null になる。この時点でマイページ一覧からは消え（customer-queries.ts:62 の `where: { customerId, deletedAt: null }`）、添付ダウンロードも 404 になる（api/mypage/inquiries/attachments/\[id\]/route.ts:54-55 の `attachment.customerId === null` 判定）。ところが対象の顧客が次にログインすると ensureCustomerLinked が既紐付けパスでも毎回 backfillGuestInquiriesForCustomer を呼び（link.ts:54）、`customerId: null` かつ Inquiry.email が顧客の email と case-insensitive 一致する行をすべて自分に付け替える（128-134 行）。結果、管理者が意図的に外した問い合わせが自動で復帰し、本文・返信スレッド・添付ファイルが再びマイページから読める状態に戻る。管理者側にはこの巻き戻りの通知も履歴も残らない。現行コードでは公開フォーム経由の新規問い合わせは必ず customerId を持つ（commands.ts:471-473 の resolveOrCreateGuestInquiryCustomer が常に id を返す）ため、`customerId: null` を今も作るのは事実上この管理者の解除操作だけであり、この backfill が現在唯一実効しているのは「管理者の解除を取り消すこと」になっている。

#### 直し方

「解除された」ことを状態として持たせ、backfill の対象から外す。最小の形は Inquiry に `customerLinkDetachedAt`（または unlink 理由列）を足し、backfill の where に `customerLinkDetachedAt: null` を加えること。あるいは backfill 自体を legacy 移行済みとして削除できるかを先に確認する（現行の書き込み経路が customerId=null を作らないなら、backfill は解除の打ち消し以外の効果を持たない）。どちらを採るかは製品判断なので、実装前に確認すること。

#### 該当箇所

```
email: { equals: normalized, mode: "insensitive" },
```

#### 到達経路

src/app/(admin)/admin/(dashboard)/inquiries/\[id\]/\_components/InquiryDetail.tsx:170-172 handleUnlinkCustomer(null) → src/app/(admin)/admin/(dashboard)/\_shared/actions/inquiry.ts:180 updateCustomerSchema の customerId は .nullable() で null を許可 → :197-200 updateInquiryCustomerCommand(id, null) → src/shared/domain/inquiries/commands.ts:328 `if (customerId)` が false で Customer 存在検査を skip → :338 `inquiry.customerId === customerId` は false（非null → null）なので early return しない → :342-345 prisma.inquiry.update({ data: { customerId: null } }) ／ ここで src/shared/domain/inquiries/customer-queries.ts:61-62 の `where: { customerId, deletedAt: null }` から外れ、src/app/api/mypage/inquiries/attachments/\[id\]/route.ts:53-56 の `attachment.customerId === null` 判定で添付も 404 になる ／ 次に当該顧客が /mypage の任意のページを開く（ログイン時に限らない）→ src/app/(public)/mypage/layout.tsx:73 ensureCustomerLinked(user) → src/shared/domain/customers/link.ts:47-51 userId で既紐付け Customer がヒット → :54 backfillGuestInquiriesForCustomer(linked.id, linked.email)（early return 無し）→ :125-126 normalizeEmailForIdentity は trim+lowercase のみで length\>0 なので継続 → :128-134 prisma.inquiry.updateMany({ where: { customerId: null, email: { equals: normalized, mode: "insensitive" } }, data: { customerId } }) → 解除したはずの Inquiry.customerId が復活し、customer-queries.ts:61-62 の一覧と :97-100 の詳細に再び現れる。AuditLog は解除時（executeAdminMutationResult 経由）にしか残らず、この復帰は無記録。

#### 既存の検査

\_\_tests\_\_/integration/domain/customers/ghost-inquiry-linking.test.ts が backfill を 4 ケースで固定しており、そのうち「既紐付け Customer への再ログイン時 (2 回目以降) でも backfill が走る」(207-232 行) はまさにこの毎回実行を意図的に固定している。ただしテストの fixture は createGuestInquiry が customerId を明示的に null で作る形で、現行の書き込み経路（resolveOrCreateGuestInquiryCustomer が必ず customerId を埋める）を再現していない。管理者の解除操作との相互作用を見るテストは unit / integration / e2e のいずれにも無い。

#### 反証官による訂正

機構は正しいが、記述に 5 点の不正確さがある。(1)「次にログインすると」は誤り。ensureCustomerLinked は src/app/(public)/mypage/layout.tsx:73 の MypageAuthGate から /mypage の毎リクエストで呼ばれ、他に claim/reservation・claim/event-registration・mypage/merge・mypage/terms/reagree・consume-signup-terms からも呼ばれる。つまりログイン契機ではなく「マイページを開くたび」で、指摘より頻度は高い（＝反証ではなく訂正）。(2) 影響範囲の誇張。復帰するのは `inquiries.email` が当該会員 Customer 自身の OAuth 検証済み email と一致する行だけで、link.ts:130 の `customerId: null` 条件により他 Customer に紐付いた行は決して奪えない（ghost-inquiry-linking.test.ts:155-202 が固定）。他人の問い合わせが見えるようになる経路ではなく、クロスアカウントの情報漏洩ではない。(3) 「本文・返信スレッドが再び読める状態に戻る」の危険度も過大。本文と返信はもともと同じ email 宛にメール送信済みで、マイページ限定の資産は返信添付だけ。(4) 管理者の秘匿手段は「紐づけ解除」ではなく anonymizeInquiryCommand（src/shared/domain/inquiries/anonymize-commands.ts:70-109）で、こちらは email を `deleted+<id>@anonymized.local` に書き換え添付を実削除するため backfill は原理的に再一致しない。つまり正しい道具は用意されており、unlink は本来「紐付けの訂正」用。(5)「customerId: null を今も作るのは事実上この解除だけ」は言い過ぎ。src 内に他の `Inquiry.customerId = null` 書き込みが無いのは確認できた（マージは customer-lifecycle-commands.ts:376-379 で tx 内に付け替えてから :411 で delete するので onDelete: SetNull は発火せず、data-retention は inquiry 行ごと deleteMany）が、prisma/schema.prisma の Inquiry.customer は `onDelete: SetNull` のままなので、Customer の物理削除経路が増えれば null 行は再び発生する。backfill は将来にわたる no-op ではない。以上より、実害は「管理者操作が無言で巻き戻り、監査証跡にも残らない」という正しさ／運用一貫性の欠陥に留まるため medium → low。なお「fixture が現行の書き込み経路（resolveOrCreateGuestInquiryCustomer が常に customerId を埋める）を再現していない」という指摘部分は事実として正しい。

---

### F-118

**論理削除されたイベントの返金が charge.refunded で無言で捨てられ、PAID のまま残る**

<sub>[対処の記録](2026-08-12-codebase-audit-progress.md) ／ [棄却一覧](2026-08-12-codebase-audit-refuted.md)</sub>

|        |                                                   |
| ------ | ------------------------------------------------- |
| 深刻度 | 低                                                |
| 箇所   | `src/shared/domain/events/payment-queries.ts:241` |
| 領域   | 決済 webhook テスト                               |

#### 起きること

運営がイベントを論理削除（event.deletedAt 設定）した後、参加者に返金する必要が出る。アプリの返金 UI は payment-commands.ts:875 が同じ `event: { deletedAt: null }` 述語で申込を引くため NOT\_FOUND("イベント申込が見つかりません") で拒否され、管理者に残る手段は Stripe ダッシュボードからの返金だけになる。その返金で発火する charge.refunded は handleChargeRefunded → findEventRegistrationByPaymentIntent がこの述語で null を返し、charge-refunded.ts:92 の severity LOW ログを 1 行出して 200 で終了する。実際には Stripe 側で送金が完了しているのに EventRegistration.paymentStatus は PAID のまま、Refund 行も作られない。以後 /api/cron/receipt-backfill が `paymentStatus IN [PAID, PARTIALLY_REFUNDED] AND receipt: null` 走査で返金済み申込に領収書を発行しうるうえ、返金累計が 0 のままなので後続の返金判定・売上集計も実額とずれる。

#### 直し方

webhook の照合は決済主体の同定であって公開可否判定ではないので、findEventRegistrationByPaymentIntent から event.deletedAt 述語を外す（Reservation 側の deletedAt: null も同様に見直す）。落とす方針を維持するなら severity LOW ではなく CRITICAL ログ + 管理者通知にして、返金と DB のズレを検知可能にする。

#### 該当箇所

```
event: { deletedAt: null },
```

#### 到達経路

Admin soft-deletes an event holding PAID registrations: src/app/(admin)/admin/(dashboard)/\_shared/actions/event.ts:228 deleteEvent -\> src/shared/domain/events/commands.ts:575 deleteEventCommand -\> commands.ts:582-585 sets event.deletedAt with no PAID-registration guard. Operator then needs to refund a participant; the in-app path is closed at src/shared/domain/events/payment-commands.ts:874-886 (findFirst with `event: { deletedAt: null }` -\> DomainError NOT\_FOUND). Operator refunds from the Stripe Dashboard; Stripe delivers charge.refunded -\> src/shared/domain/payment/stripe-webhook/charge-refunded.ts:64 findReservationByPaymentIntent returns null (different table) -\> charge-refunded.ts:78-79 findEventRegistrationByPaymentIntent -\> src/shared/domain/events/payment-queries.ts:238-244 findFirst WHERE stripePaymentIntentId matches AND `event: { deletedAt: null }` -\> null because the parent event is trashed -\> the `if (registration)` branch at charge-refunded.ts:80 is skipped -\> charge-refunded.ts:92-104 logs at ErrorSeverity.LOW and returns, route answers 200. Backstop absent: src/shared/domain/payment/stripe-webhook/refund-status-updated.ts:44-60 needs a Refund row that was never created, so it also returns after a LOW log. Wrong result: Stripe has moved the money, EventRegistration.paymentStatus remains PaymentStatus.PAID and no Refund row exists. The divergence becomes visible if the event is later restored via src/shared/domain/events/commands.ts:603 restoreEventCommand, which clears deletedAt and makes the stale PAID row addressable again.

#### 既存の検査

stripe-webhook.test.ts:1197「charge.refunded で予約が見つからない → ログのみ、200 を返す」は mock が null を返す前提で「無言で捨てる」挙動を追認しているだけで、未知 PI と『存在するが述語で除外された』を区別しない。findEventRegistrationByPaymentIntent 自体が mock（line 270-271）なので deletedAt 述語はテスト境界の向こう側。

#### 反証官による訂正

Mechanism confirmed, but two of the three stated consequences are factually wrong and the framing misattributes the defect. (1) The receipt-backfill claim is false. src/shared/domain/receipts/backfill.ts:101-111 selects EventRegistration with `paymentStatus IN [PAID, PARTIALLY_REFUNDED] AND receipt: null AND paidAmount > 0` AND the identical `event: { deletedAt: null }` filter at line 108. The same predicate that hides the row from the webhook also excludes it from backfill, so the cron can never issue a receipt for a soft-deleted event's registration. The finding cites this as the primary downstream harm; it does not exist. (2) The "返金累計が0のままなので後続の返金判定・売上集計も実額とずれる" claim is unsupported. Every downstream reader applies the same predicate — export-queries.ts:10 (getEventRegistrationsForExport), and roughly fifteen sites in registration-queries.ts (:50, :113, :169, :197, :232, :265, :335, :406, :609, :644, :703 ...). While the event is trashed the row is uniformly invisible, not selectively counted, so no aggregate is skewed by it. (3) The finding is framed as an event-side oversight at a specific line, but the behavior is symmetric and systemic. The Reservation twin findReservationByPaymentIntent (src/shared/domain/reservations/payment-queries.ts:260-268) filters `deletedAt: null` the same way, and deleteReservationCommand (src/shared/domain/reservations/lifecycle-commands.ts:401-449) soft-deletes without a PAID guard either — so a Dashboard refund of a trashed reservation is dropped identically. This is a repo-wide soft-delete convention, and fixing only payment-queries.ts:241 would leave the mirror-image hole open. (4) Severity medium -\> low: the residual harm is a stale paymentStatus on a row that is invisible everywhere until restoreEventCommand (commands.ts:603) brings it back, it requires an unusual operator sequence (trash an event that has PAID registrations, then need a refund), and the operator performing the Dashboard refund necessarily knows the refund happened. The genuine defect worth reporting is narrower than stated: charge.refunded has no reconciliation path for soft-deleted entities on either the event or the reservation side, and the LOW-severity log gives operations no signal distinguishing "unknown PaymentIntent" from "known PaymentIntent excluded by a soft-delete predicate".

---

### F-119

**非公開スペースの名前と slug が公開イベントページにリンク付きで出て、リンク先が 404**

<sub>[対処の記録](2026-08-12-codebase-audit-progress.md) ／ [棄却一覧](2026-08-12-codebase-audit-refuted.md)</sub>

|        |                                                 |
| ------ | ----------------------------------------------- |
| 深刻度 | 低                                              |
| 箇所   | `src/shared/domain/events/public-queries.ts:40` |
| 領域   | 公開面の露出                                    |

#### 起きること

status=PUBLISHED のイベントが spaceId を持ったまま、その Space を管理画面で非公開にする（個別トグル、または src/shared/domain/spaces/bulk-commands.ts の一括非公開。イベント側の status は変わらない）。/events/\<slug\> は buildEventVenues が event.space をそのまま venue に積み（src/app/(public)/events/\[slug\]/\_components/event-static-panel-props.ts:19-24）、event-info-panel.tsx:393 が `href={toAppRoute(`/spaces/${venue.slug}`)}` でスペース名をリンクとして描画する。閲覧者には非公開スペースの名前と slug が見え、クリック先は存在しない（ADR 0004 により 200+noindex の soft-404）。さらに events/\[slug\]/page.tsx:185 が schema.org Event の venue.url に同じ 404 URL を入れて構造化データとして配信する。イベント作成側も spaceId の公開状態を検証しないため（src/shared/domain/events/commands.ts の spaceId 経路に isPublished チェックなし）、最初から未公開スペースを会場に選ぶこともできる。

#### 直し方

Prisma の to-one relation は select 側で where を掛けられないので、publicEventSelect の space に isPublished / isActive も select し、buildEventVenues と JSON-LD 生成で「非公開なら venue に積まない（または名前だけ出してリンクしない）」に落とす。合わせて event の spaceId 検証（createEvent/updateEvent）で未公開スペースを会場に選べるかどうかを製品判断で決める。

#### 該当箇所

```
space: { select: { id: true, name: true, slug: true } },
```

#### 到達経路

前提操作: 管理画面で PUBLISHED イベントが参照中の Space を非公開化する → src/app/(admin)/admin/(dashboard)/\_shared/actions/space/bulk.ts:85 → src/shared/domain/spaces/bulk-commands.ts:75-81（または src/shared/domain/spaces/commands.ts:264-282 updateSpacePublishedCommand）で isPublished=false / publishedAt=null。Event 参照チェック無し（対照: src/shared/domain/spaces/bulk-commands.ts:131-139 の削除経路は ACTIVE\_EVENT\_STATUSES を見て skip する）。イベント側 status は PUBLISHED のまま。
表示経路: src/app/(public)/events/\[slug\]/page.tsx:97 → src/shared/domain/events/public-queries.ts:174-197 getPublishedEventBySlug（where は src/shared/domain/events/public-queries.ts:182-186 の slug/status/deletedAt のみ）→ src/shared/domain/events/public-queries.ts:61-71 publicEventDetailSelect → src/shared/domain/events/public-queries.ts:40 の space 無条件 join → src/app/(public)/events/\[slug\]/\_components/event-static-panel-props.ts:18-25 buildEventVenues が format !== ONLINE の分岐で kind:"space" を push → src/app/(public)/events/\[slug\]/\_components/event-info-panel.tsx:389-397 case "space" が href={toAppRoute(`/spaces/${venue.slug}`)} で描画。
誤った結果 A（リンク切れ）: /spaces/\<slug\> → src/app/(public)/spaces/\[slug\]/page.tsx:97-98 getSpaceBySlug → src/shared/domain/spaces/public-queries.ts:488 の where { ...PUBLIC\_SPACE\_WHERE, slug }（src/shared/domain/spaces/public-queries.ts:39-42 = isPublished:true, isActive:true）が null → notFound()。docs/adr/0004-accept-soft-404-under-streaming.md により HTTP 200 + noindex の not-found 本文。
誤った結果 B（構造化データ）: src/app/(public)/events/\[slug\]/page.tsx:183-187 が同じ URL を schema.org Event の venue.url として配信する。
キャッシュは救わない: getPublishedEventBySlug は src/shared/domain/events/public-queries.ts:177 で CACHE\_TAGS.SPACES も貼っており、非公開化で再生成されても space は同じ内容で載り直す。

#### 既存の検査

未捕捉。同種の逆向き（イベントカード側）は src/shared/domain/link-cards/resolve-queries.ts:151 が status+deletedAt を対で見る規律をコメント付きで守っているが、event → space の公開状態は誰も見ていない。\_\_tests\_\_ / e2e に event venue の公開状態を検証するものは無い。

#### 反証官による訂正

\1) 「イベント作成側も…最初から未公開スペースを会場に選ぶこともできる」は UI 経路では誤り。管理フォームの会場候補は src/shared/domain/events/admin-queries.ts:234-240 getSpacesForEvent() が where { isPublished: true, isActive: true } で絞っており（EventForm.tsx:38/55、EventLocationSpaceSelector.tsx:26/39 が唯一の供給源）、未公開スペースは選択肢に出ない。成立するのは「公開後に非公開化する」経路と、認証済み admin が候補外の spaceId を直接投げる場合だけ。前者だけが現実的なシナリオ。
\2) 観点「public-exposure」は過大。space.name は src/shared/lib/events/venue.ts:22-35 formatEventVenue 経由で JSON-LD の venue.name、Add-to-Calendar URL の location（page.tsx:141）、メール / iCal / イベントカードにも出る設計上の公開文字列で、リンクを外しても消えない。今回のリンクと venue.url で新規に露出するのは slug のみ。「非公開スペースの名前が公開される」は本質ではない。
\3) 実害の記述は概ね正確だが 404 ではない。docs/adr/0004 の通り公開側の動的ルートは streaming 下で HTTP 200 + noindex（10/10 実測）であり、indexation は起きない。残るのは壊れた内部リンクと、構造化データが解決しない URL を含むこと。したがって深刻度は low（リンク整合性 / 構造化データ品質）。
\4) 「event → space の公開状態は誰も見ていない」は publish トグルに限れば正しいが、削除経路は既に守られている（bulk-commands.ts:131-139、deleteSpaceCommand も同型）。無防備なのは updateSpacePublishedCommand（commands.ts:264-282）と bulkTogglePublishedSpacesCommand（bulk-commands.ts:75-81）の 2 本だけ。
\5) 対照として挙げた link-cards は「逆向き（イベントカード側）」ではなく、/spaces リンク生成の同型ケース。src/shared/domain/link-cards/resolve-queries.ts:114-118 resolveSpaceCards が where { isPublished: true, isActive: true } を課しており、指摘の 151 行は resolveEventCards（status+deletedAt）。正確には「/spaces へのリンクを作る箇所のうち event venue だけが公開状態を見ていない」。
\6) 副次的に、非公開化後に該当イベントを編集すると getSpacesForEvent() の候補に現在の space が含まれないため、編集フォーム上で会場が失われうる（本指摘の範囲外だが同じ根に由来）。

---

### F-120

**waitlist promote の session lock (728354) は interactive tx が timeout すると finally でも release できず、その event の繰上げが止まる**

<sub>[対処の記録](2026-08-12-codebase-audit-progress.md) ／ [棄却一覧](2026-08-12-codebase-audit-refuted.md)</sub>

|        |                                                           |
| ------ | --------------------------------------------------------- |
| 深刻度 | 低                                                        |
| 箇所   | `src/shared/domain/events/waitlist-offer-commands.ts:335` |
| 領域   | 並行制御                                                  |

#### 起きること

728354 は session lock で、waitlist-locks.ts:20-22 が明記するとおり commit でも rollback でも自動解放されない。release は `finally` に置かれているが、release 自身が「その tx client」でのクエリなので、tx そのものが死んでいると実行できない。具体シナリオ: cron 停止後の初回実行などで 1 つの event に期限切れ offer が数百件たまる。expireAndPromoteWaitlistForEventCommand は 1 event = 1 interactive tx（342 行 `{ maxWait: 5000, timeout: 20000 }`）で candidate をループし、1 件あたり savepoint + advisory lock + updateMany + FIFO promote の 4 往復を行う。合計が 20 秒を超えると Prisma が interactive transaction を打ち切って ROLLBACK し、以後この tx への問い合わせは P2028 (Transaction already closed) になる。finally の release はその P2028 で失敗し、728354 はロールバックされた物理コネクション上に残ったまま pool へ返る（pool は idleTimeoutMillis=300\_000 まで、トラフィックがあれば実質無期限にそのコネクションを保持する。src/shared/db/prisma.ts:106）。次回以降の cron 実行が別コネクションを引くと tryAcquireWaitlistPromoteSessionLock が false を返し、277-279 行で expired/offered を空のまま return する — その event のキャンセル待ち繰上げだけが、エラーらしいエラーも出さずに（cron route 側は 1 event 分の catch を MEDIUM でログするだけ）停止し続ける。

#### 直し方

release を tx client ではなく別接続に依存しない形にするか、728354 を DB ロウベースの lease（`running` + `leasedUntil` を UPDATE ... WHERE で原子的に取得し TTL で自動回復）に置き換える（calendar-sync/locks.ts:28-31 が同じ結論を書いている）。暫定的には 1 tx で処理する candidate 数に上限を設けて tx を分割し、timeout に到達しないようにする。

#### 該当箇所

```
await releaseWaitlistPromoteSessionLock(tx, args.eventId);
```

#### 到達経路

src/app/api/cron/waitlist-expire/route.ts:41 GET → :59 findExpiredWaitlistOfferCandidates（件数無制限: src/shared/domain/events/waitlist-queries.ts:410-425 に take 無し） → :78 expireAndPromoteWaitlistForEventCommand → src/shared/domain/events/waitlist-offer-commands.ts:263 prisma.$transaction（オプションは :342 の {maxWait:5000, timeout:20000}） → :273 tryAcquireWaitlistPromoteSessionLock（src/shared/domain/events/waitlist-locks.ts:78-81 = pg\_try\_advisory\_lock 728354 / session scope） → :282-333 の candidate ループが 20s を超過（多件数、または src/shared/db/prisma.ts:108 の statement\_timeout=15s まで 728350 の待ちに入る contended candidate 経由） → Prisma の TransactionManager タイマーが発火し ROLLBACK 実行 → PgTransaction.rollback() が client.release()（破棄せず pool へ返却, node\_modules/@prisma/adapter-pg/dist/index.js:691-693） → 以後この tx への問い合わせは status=timed\_out の closed transaction として P2028 を throw（node\_modules/@prisma/client/runtime/client.js の transaction lookup） → src/shared/domain/events/waitlist-offer-commands.ts:335 finally の releaseWaitlistPromoteSessionLock が P2028 で失敗し pg\_advisory\_unlock が発行されない → 728354 が pool 内の物理 connection に残存 → 次回 cron 実行が別 connection を引いた場合 :273 が false → :277-279 で expired/offered を空のまま return し、その event の繰上げだけが無言で skip される

#### 既存の検査

\_\_tests\_\_/integration/domain/events/waitlist-session-lock-leak.test.ts が回帰ガードだが、対象は「candidate の SQL エラーが savepoint で吸収され、外側 tx が健全なまま release できる」ケースだけ（同ファイル 183-233 行、`SELECT 1/0` で 22012 を起こす）。外側 tx 自体が Prisma の timeout で閉じたときの release 失敗は再現していない。

#### 反証官による訂正

機構は正しいが、影響の記述に 4 点の事実誤認がある。

\1) 「pool は idleTimeoutMillis=300\_000 まで、トラフィックがあれば実質無期限にそのコネクションを保持する」— 本番構成では成立しにくい。公開サービスは terraform/cloud\_run\_public.tf:48-51 で min\_instance\_count=0 / max\_instance\_count=1、cron は terraform/cloud\_scheduler.tf:124-127 で hourly（0 \* \* \* \*）。汚染された connection が次回 cron まで生き残るには、単一インスタンスが 1 時間死なず、かつその connection が 5 分未満の間隔で再 checkout され続ける必要がある。どちらか途切れれば pg が connection を閉じ、backend 終了で 728354 は Postgres 側が解放する = 次回 cron より前に自己修復する。

\2) 「次回以降の cron 実行が別コネクションを引くと false を返し…停止し続ける」— 決定的ではなく確率的。pg-pool は idle connection を LIFO で払い出すため、直前に返却された汚染 connection が最も再利用されやすい。かつ advisory lock は session 内で再入可能で、同一 connection を引いた実行は acquire に成功してバッチが正常に走る（この再入性はリポジトリ自身のテスト \_\_tests\_\_/integration/domain/events/waitlist-session-lock-leak.test.ts:23-28 が「偽陰性の実測」として明記している）。したがって「停止し続ける」ではなく「一部の実行が skip される可能性がある」が正しい。

\3) 「エラーらしいエラーも出さずに」— leak を作る当の実行は無音ではない。timeout 後の残り candidate は 1 件ずつ waitlist-offer-commands.ts:323-331 で MEDIUM ログを出し、finally の P2028 は $transaction 外へ伝播して route.ts:166-174 が eventId + candidateCount 付きで MEDIUM ログを出す。無音なのは leak 後にスキップされる後続実行（:277-279 の空 return）だけ。

\4) 到達性の論証（「数百件で 20 秒超過」）は最も弱い部分だが、方向としては指摘に不利ではなく有利。src/shared/db/prisma.ts:108-110 の statement\_timeout / idle\_in\_transaction\_session\_timeout はいずれも 15s で ITX の 20s 予算より短いため、728350 の待ちに入った candidate が 1〜2 件あるだけで 20s を超えうる。数百件は必要条件ではない。

参考（本指摘の範囲外の別件）: waitlist-offer-commands.ts:289 の JSDoc が回帰ガードとして `expire-and-promote-waitlist-session-lock.test.ts` を名指ししているが、そのファイルは存在しない。実体は \_\_tests\_\_/integration/domain/events/waitlist-session-lock-leak.test.ts。

深刻度: データ破損・二重昇格・金銭影響は無く（EXPIRED 化も promote も atomic claim のまま）、帰結は 1 event の繰上げが最大数十分〜1 時間程度遅延する可能性のみで、connection 破棄／インスタンス再生成で自己修復する。medium は過大で low が妥当。

---

### F-121

**bulkMoveFaqItems だけが lock 取得後のカテゴリ再確認を欠き、削除済みカテゴリ配下に生きた FAQ が孤児化して 30 日後に cascade で消える**

<sub>[対処の記録](2026-08-12-codebase-audit-progress.md) ／ [棄却一覧](2026-08-12-codebase-audit-refuted.md)</sub>

|        |                                                  |
| ------ | ------------------------------------------------ |
| 深刻度 | 低                                               |
| 箇所   | `src/shared/domain/faq/item-bulk-commands.ts:98` |
| 領域   | コンテンツ                                       |

#### 起きること

管理者 A が空カテゴリ C を削除、管理者 B が同時に FAQ 3 件を C へ一括移動する。(1) B の ensureFaqCategoryExists(C) は $transaction の**外**で走り、C はまだ active なので通る。(2) A の deleteFaqCategory が advisory lock faq\_items:C を取り、active items = 0 を確認して C.deletedAt をセットし commit。(3) B の tx が同じ lock を取得し、prisma.faqItem.updateMany({ where: { id, deletedAt: null }, data: { categoryId: C } }) で 3 件を C 配下へ移す。結果、deletedAt=null の生きた FAQ 3 件が deletedAt≠null のカテゴリ配下に残る。この状態の項目は管理一覧（buildFaqItemWhere が `category: { deletedAt: null }` で除外, queries.ts:196）にもゴミ箱（getDeletedFaqItems は deletedAt≠null が条件, queries.ts:347）にも公開 /faq（category: { deletedAt: null, isActive: true }, sections/queries.ts:154）にも一切現れず、管理者からは消滅したように見える。30 日後に faq-trash-cleanup cron が C を deleteMany すると、FaqItem.category の onDelete: Cascade（schema.prisma:1668）で 3 件が物理削除され復旧不能になる。

#### 直し方

ensureFaqCategoryExists(newCategoryId) の呼び出しを $transaction 内、buildOrderScopeLockSql(`faq_items:${newCategoryId}`) の直後へ移す（createFaqItem / updateFaqItem / restoreFaqItem と同じ形にする）。合わせて faq-trash-cleanup の faqCategory.deleteMany に「配下に deletedAt IS NULL の item が無い」条件を足すと二重の防波堤になる。

#### 該当箇所

```
await ensureFaqCategoryExists(newCategoryId);
```

#### 到達経路

src/app/(admin)/admin/(dashboard)/faq/\_components/FaqBulkMoveDialog.tsx:49 → src/app/(admin)/admin/(dashboard)/\_shared/actions/faq.ts:454 bulkMoveFaqItems → :468 bulkMoveFaqItemsCommand → src/shared/domain/faq/item-bulk-commands.ts:98 ensureFaqCategoryExists(C)（$transaction の外・lock 取得前に成功） ⟂ 並行セッション: src/shared/domain/faq/category-commands.ts:134 lock `faq_items:C` 取得 → :136-148 active items = 0 → :161-164 C.deletedAt 書込 → commit → 戻って src/shared/domain/faq/item-bulk-commands.ts:101 同 lock 取得（再確認なし） → :112-115 updateMany({ where: { id, deletedAt: null }, data: { categoryId: C } }) → deletedAt=null の item が deletedAt≠null の C 配下に着地。以降の不可視: src/shared/domain/faq/queries.ts:196 `category: { deletedAt: null }` で管理一覧から除外 / queries.ts:347 `deletedAt: { not: null }` でゴミ箱の項目一覧から除外 / src/shared/domain/sections/queries.ts:154 `category: { deletedAt: null, isActive: true }` で公開 /faq から除外。30 日後: src/app/api/cron/faq-trash-cleanup/route.ts:42 → src/shared/domain/faq/analytics-commands.ts:62 `faqCategory.deleteMany({ deletedAt: { lt: threshold } })` → prisma/schema.prisma:1668 `onDelete: Cascade` で生存 item が物理削除。

#### 既存の検査

未捕捉。同ファイルの兄弟コマンドは全てこの race を明示的に潰しており、createFaqItem（item-commands.ts:58）は「lock 取得後にここで再確認することで、カテゴリ削除とのレースを防ぐ（lock 取得前の事前チェックだと、チェック後・lock 取得前にカテゴリが削除される check-then-act の窓が残る）」とコメント付きで tx 内再確認を行い、updateFaqItem:117 と restoreFaqItem:176 も同型。bulkMoveFaqItems だけが例外。\_\_tests\_\_/unit/domain/faq/item-bulk-commands.test.ts の bulkMoveFaqItems ブロックは 2 本のみ（『per-id updateMany の where で deletedAt: null を claim する』『移動先カテゴリが存在しない場合 NOT\_FOUND エラーをスローする』）で、lock 内再確認は検査していない。

#### 反証官による訂正

欠陥の実在と到達経路は正しく、引用・引用元行番号（queries.ts:196 / :347、sections/queries.ts:154、schema.prisma:1668、category-commands.ts:132-166）は全て実測一致。ただし記述に 3 点の不正確がある。(1)「ゴミ箱にも一切現れない」の理由が違う。getDeletedFaqCategories (queries.ts:359-379) は削除済みカテゴリに対し `items: { where: { deletedAt: null } }` を実際に読み込んでおり、孤児 3 件はサーバー側 payload に載っている。見えないのは FaqTrashTable.tsx:62-90 がカテゴリ行に name/slug/deletedAt/操作しか描画せず `category.items` を一切使っていないためで、クエリが除外しているのではない。結論（管理者から見えない）は変わらないが、原因はクエリ層でなく描画層。(2)「復旧不能」は 30 日経過後のみ。それまでカテゴリ C はゴミ箱に行として残り、restoreFaqCategory (category-commands.ts:168-210) で deletedAt を解除すれば item 3 件は deletedAt=null のままなので管理一覧・公開 /faq に即座に復帰する。孤児であること自体に気づく導線が無いのが問題であって、データが即座に失われるわけではない。(3) severity は medium → low が妥当。トリガーは IAP 保護された管理面で 2 管理者が同一カテゴリに対しミリ秒単位で交錯する必要があり、かつ 30 日間は完全復旧可能。なお過剰一般化を防ぐため付記すると、updateFaqItem (item-commands.ts:96) も tx 外で ensureFaqCategoryExists を呼ぶが、これはカテゴリ不変の分岐（既に所属済み）なので孤児を作れず、同種欠陥の 2 件目ではない。修正は兄弟 3 実装と同型の tx 内再確認を item-bulk-commands.ts:101 の直後に置くだけで、既存の統合テストに bulkMove ケースを 1 本足せば固定できる。

---

### F-122

**bulk ステータス変更の TOCTOU フォールバックが他管理者の遷移を自分の成果と誤認し、append-only な状態履歴に偽の行を書く**

<sub>[対処の記録](2026-08-12-codebase-audit-progress.md) ／ [棄却一覧](2026-08-12-codebase-audit-refuted.md)</sub>

|        |                                                          |
| ------ | -------------------------------------------------------- |
| 深刻度 | 低                                                       |
| 箇所   | `src/shared/domain/inquiries/bulk-status-commands.ts:74` |
| 領域   | 問い合わせ                                               |

#### 起きること

管理者 A と B が同じ 50 件を一覧で選び、ほぼ同時に「対応完了(RESOLVED)」を押す。A の updateMany が 50 件すべてを claim し、B の claim.count は 0 になる。B は `claim.count < allowedTargets.length` に入り、フォールバックとして「今 status が newStatus になっている行」を引き直す（71-77 行）が、この条件は『自分が claim した行』ではなく『誰かが既に newStatus にした行』にヒットする。読み取り時点で既に newStatus だった行は 41 行目の `if (t.status === newStatus) continue;` で除外済みなので、ここでヒットするのは必ず並行書き込み由来である。結果、B は 50 件すべてを confirmed と判定し、inquiryStatusHistory に NEW→RESOLVED の履歴 50 行を changedById=B で追加する（88-96 行）。50 回の遷移に対して履歴が 100 行になり、うち 50 行は B が行っていない遷移として記録される。inquiry\_status\_history は DB trigger で UPDATE / DELETE が禁止（prisma/baseline/invariants.sql:662-664）なので、この偽行は後から訂正も削除もできない。B の画面には「50件を更新しました」と表示され、rejectedIds も空になる。

#### 直し方

「自分が claim したか」を DB に判定させる。updateMany を捨てて `UPDATE inquiries SET status=$1 WHERE id = ANY($2) AND status = $3 AND deleted_at IS NULL RETURNING id, status` の raw update（Prisma は updateManyAndReturn でも可）にし、返ってきた id だけを confirmed とする。フォールバックの再クエリ自体を消せば偽陽性の入口が無くなる。テストは「claim.count=0 かつ全件が既に newStatus」という入力で createMany が呼ばれないことを固定する。

#### 該当箇所

```
status: newStatus,
```

#### 到達経路

src/app/(admin)/admin/(dashboard)/inquiries/\_components/InquiryBulkActions.tsx:40 bulkSetStatusInquiries(selectedIds, RESOLVED) → src/app/(admin)/admin/(dashboard)/\_shared/actions/inquiry/bulk.ts:97 zod 通過（形のみ）→ bulk.ts:105 bulkSetStatusInquiriesCommand(ids, RESOLVED, user.id=B) → src/shared/domain/inquiries/bulk-status-commands.ts:32-35 tx 外 findMany（全 50 件 status=NEW のスナップショット）→ :41 read 時点で newStatus の行は除外 → :43-44 allowedTargets=50 件（fromStatus=NEW）→［ここで管理者 A の同一処理が commit］→ :60 prisma.$transaction（isolationLevel 未指定 = READ COMMITTED）→ :61-67 updateMany WHERE OR(id, status=NEW) が 0 行一致（A の commit 後 EvalPlanQual で WHERE 再評価が外れる）→ claim.count=0 → :70 `claim.count < allowedTargets.length` が真 → :71-77 findMany WHERE id IN allowedTargets AND status=newStatus が A の書き込み結果で 50 件返す ← 誤判定の中心（:74）→ :78 confirmedIds に 50 件、:79-83 rejectedIds は空のまま、:84 confirmed=allowedTargets 全件 → :87-96 tx.inquiryStatusHistory.createMany が fromStatus=NEW / toStatus=RESOLVED / changedById=B の 50 行を append（A の 50 行と合わせ 1 遷移につき 2 行、うち B の 50 行は B が起こしていない遷移）→ prisma/baseline/invariants.sql:662,664 の inquiry\_status\_history\_no\_update / no\_delete により訂正・削除不能 → :102-107 count=50 / rejectedIds=\[\] を返し bulk.ts:114 emitBulkAuditRecords が 50 件の重複 audit\_logs を、bulk.ts:127-143 が同じ顧客への RESOLVED/CLOSED 通知メールを二重送信する。

#### 既存の検査

\_\_tests\_\_/unit/domain/inquiries/bulk-status-commands.test.ts:464-497「claim が一部失敗した場合、実際に遷移できた id だけ StatusHistory に記録される」がこの分岐を通るが、フォールバックの findMany を `[{ id: UUID_A }]` にモックしており、『並行相手が同じ newStatus をセットした』ケース（フォールバックが全件返す形）を作っていない。\_\_tests\_\_/unit/architecture/inquiry-status-history-append-only.test.ts は trigger の存在と E2E helper の非 mutate だけを見ており、書き込み内容の正しさは見ていない。

#### 反証官による訂正

事実関係はおおむね正確だが、3 点の補正がある。

【1】発現条件が申告より狭い。fallback が誤認するのは「並行相手が**同じ** newStatus をセットした」場合だけで、A が IN\_PROGRESS、B が RESOLVED のように**異なる**遷移を打った場合は B の fallback（status: RESOLVED）が 0 件を返し、:79-83 で正しく rejectedIds に落ちる。指摘本文の「ここでヒットするのは必ず並行書き込み由来である」は真だが、「並行書き込みがあれば必ず誤認する」ではない。誤認は『同一 id 集合 × 同一 target status』の組み合わせに限られる。

【2】競合窓が狭い。危険区間は :32 の tx 外 findMany から :61 の updateMany までで、DB 往復 1 回分（Neon 相手でおおむね数〜数十 ms）。A の commit がこの窓に落ちる必要がある。管理者 2 名がこの粒度で同着することは実運用では稀で、「ほぼ同時に押す」という前提はミリ秒級の同着を意味する。

【3】被害範囲は申告より広い（指摘に有利な方向の漏れ）。affectedIds が 50 件になる結果、bulk.ts:114 emitBulkAuditRecords が同じ 50 件について重複した audit\_logs UPDATE 行を書き、さらに bulk.ts:127-143 が RESOLVED/CLOSED のとき fireAndForget で顧客通知メールを再送する。つまり偽の履歴行だけでなく**顧客への重複メール**が出る。

深刻度は medium → low に補正する。理由: (a) 主データである inquiries.status の最終状態は正しく、データ損失・権限・整合性の破壊は起きない（実質 idempotent に収束する）。(b) 実害は副次的な append-only 監査表への重複行（actor が誤り）と重複メールで、しかも上記のとおり同着かつ同一 target status という二重条件が要る。(c) ただし invariants.sql:662-664 により訂正不能である点は事実で、none/informational ではない。

なお、fallback の findMany（:71-77）には :33 の findMany と違い `deletedAt: null` が無いが、これは実害に寄与しない（soft-delete された行が同時に newStatus になっている必要があるため）。

---

### F-123

**soft-delete 済み予約に対する clearReservationCalendarEvent が P2025 で落ち、成功した GCal 削除が「失敗」として記録される**

<sub>[対処の記録](2026-08-12-codebase-audit-progress.md) ／ [棄却一覧](2026-08-12-codebase-audit-refuted.md)</sub>

|        |                                                       |
| ------ | ----------------------------------------------------- |
| 深刻度 | 低                                                    |
| 箇所   | `src/shared/domain/reservations/calendar-sync.ts:105` |
| 領域   | 予約（未読分）                                        |

#### 起きること

admin が GCal 同期済みの CONFIRMED 予約を「削除」する。executeAdminMutationResult の実行順序契約（admin-action.ts:63-64: execute → await afterSuccess）により、まず deleteReservationCommand が `deletedAt: now` を commit し、その後 mutations.ts:450 の applyCancellationSideEffects が走る。runGcalStep → deleteCalendarSync → deleteCalendarEvent は成功して GCal 側のイベントは実際に消える。ところが直後の clearReservationCalendarEvent が `where: { id, deletedAt: null }` で更新対象 0 件になり Prisma が P2025 を throw する。これは deleteCalendarSync の catch に落ち、ErrorSeverity.MEDIUM のエラーログを出し、fireAndForget の markReservationCalendarSyncError も同じ `deletedAt: null` 述語でまた落ちて calendarSyncError すら書けず、戻り値は {success:false} になる。結果、キャンセル副作用の監査メタデータには「gcal 削除失敗」が記録され、運用者はもう存在しないイベントを探しに行く。しかも該当行は deletedAt != null なので retry pool にも入らず、この誤記録は自動では訂正されない。GCal イベントを持つ予約を admin が削除するたびに毎回発生する（例外パスではなく主経路）。

#### 直し方

clearReservationCalendarEvent / markReservationCalendarSyncError / markReservationCalendarSyncUpdated を updateMany に置き換える（reminder-commands.ts が既に採っている方針と同じ）。soft-delete 済み行でも「GCal イベントはもう無い」という事実は記録したいので、deletedAt 述語自体を落とすのが素直。

#### 該当箇所

```
where: { id: reservationId, deletedAt: null },
```

#### 到達経路

src/app/(admin)/admin/(dashboard)/reservations/\_components/ReservationActionCell.tsx:52 deleteReservation(reservationId) → src/app/(admin)/admin/(dashboard)/\_shared/actions/reservation/mutations.ts:429 executeAdminMutationResult → src/app/(admin)/admin/(dashboard)/\_shared/lib/admin-action.ts:63-64（execute → await afterSuccess の順序契約）→ mutations.ts:434 deleteReservationCommand → src/shared/domain/reservations/lifecycle-commands.ts:431-459 $transaction が deletedAt=now を commit（googleCalendarEventId はクリアしない）→ mutations.ts:440,450 afterSuccess で applyCancellationSideEffects（終端ステータス時は mutations.ts:465-467 で deleteCalendarSync を直呼び、以降同一）→ src/shared/domain/reservations/cancellation/apply-instance-side-effects.ts:29 fetchReservationForSideEffects → src/shared/domain/reservations/cancellation/reservation-data.ts:11-13 findUnique({where:{id}})（deletedAt 無フィルタ＝削除済み行がヒット、null 早期 return を回避）→ src/shared/domain/reservations/cancellation/run-instance-side-effects.ts:56 runGcalStep → src/shared/domain/reservations/cancellation/steps.ts:77 googleCalendarEventId は非 null なので skip せず :81 deleteCalendarSync → src/shared/domain/reservations/reservation-calendar-outbound.ts:312 deleteCalendarEvent 成功（GCal 側は実際に削除される）→ :316-317 clearReservationCalendarEvent → src/shared/domain/reservations/calendar-sync.ts:104-110 prisma.reservation.update({where:{id, deletedAt:null}}) が 0 件マッチで P2025 throw → reservation-calendar-outbound.ts:328-352 catch: ErrorSeverity.MEDIUM の偽エラーログ + fireAndForget(markReservationCalendarSyncError) も calendar-sync.ts:93-98 の同一 deletedAt:null 述語で P2025（fireAndForget が握り潰す）→ :351 return {success:false} → steps.ts:96 return {status:"error"} → run-instance-side-effects.ts:63-95 監査ログ metadata.sideEffects.gcal に「削除失敗」が記録される（誤った結果：GCal イベントは削除済みなのに失敗として残る）

#### 既存の検査

同ファイル群にはこの罠を知っている記述がある（reminder-commands.ts:48『予約が claim 後に削除された場合も throw しないよう `updateMany` を用いる』）が、calendar-sync.ts の 4 つの mark/clear ヘルパー（:68 :81 :94 :105）はいずれも `update` + `deletedAt: null` のままで、soft-delete 後に呼ばれる経路との組合せを検査するテストは無い。

#### 反証官による訂正

経路・引用・行番号はいずれも正確で、reminder-commands.ts:48 の先行事例の指摘も実在（同ファイルは updateMany でこの罠を明示的に回避している）。ただし影響評価に誇張と不正確が 3 点ある。(1) 一次的な結果は正しい。GCal イベントは実際に削除され、外部状態・ユーザー可視の挙動は壊れない。壊れるのは観測系だけ（偽の MEDIUM エラーログ + 監査 metadata.sideEffects.gcal の偽「失敗」）と、soft-delete 済み行に googleCalendarEventId が残ること。データ欠損・二重予約・セキュリティ影響は無いので medium ではなく low が妥当。ただし監査 metadata は「完了表示 vs 実挙動の乖離を support 起点で観測する」ために意図的に設けられたもの（apply-instance-side-effects.ts:17-25 の CRITIC-6）なので、その信号を主経路で毎回反転させる点は実害として認める。(2)「4 つの mark/clear ヘルパー（:68 :81 :94 :105）」を同列に扱っているが、到達するのは :105 clearReservationCalendarEvent と、その catch から呼ばれる :94 markReservationCalendarSyncError の 2 つだけ。:68 markReservationCalendarSyncSuccess と :81 markReservationCalendarSyncUpdated は create/update 経路（deletedAt=null）からしか呼ばれず、retry pool も getFailedCalendarSyncReservations（calendar-sync.ts:134 deletedAt:null）で削除済み行を除外しているため、同時削除レースを除いて到達しない。(3)「retry pool に入らないので自動訂正されない」は事実だが実害の根拠にならない。GCal イベントは既に消えているので再試行すべき作業は残っておらず、むしろ retry pool から外れているのは正しい挙動。訂正されないのは「過去の監査レコードの記述」だけで、これは retry の対象ではない。加えて「運用者が存在しないイベントを探しに行く」は推測。なお wasCancelled=false 側（mutations.ts:465-467 の直呼び）には監査 metadata が無く、影響はログのみ。soft-delete 行に残る stale eventId も、CANCELLED は restoreReservationCommand（lifecycle-commands.ts:507-512）が復元自体を拒否するため、実際に stale eventId を持ったまま復活しうるのは COMPLETED / NO\_SHOW を削除した場合に限られる。

---

### F-124

**reminderSentAt が日付に紐づかない永続ラッチのため、リマインダ送信後に日時変更すると新しい日のリマインダが二度と送られない**

<sub>[対処の記録](2026-08-12-codebase-audit-progress.md) ／ [棄却一覧](2026-08-12-codebase-audit-refuted.md)</sub>

|        |                                                          |
| ------ | -------------------------------------------------------- |
| 深刻度 | 低                                                       |
| 箇所   | `src/shared/domain/reservations/reminder-commands.ts:39` |
| 領域   | 予約（未読分）                                           |

#### 起きること

8/14 10:00 の CONFIRMED 予約に対し、8/13 の cron が翌日分リマインダを送って reminderSentAt にスタンプする。同じ 8/13 のうちに顧客が /reservation/status/edit から（変更期限内なので可能）予約を 8/20 10:00 へ変更する、あるいは admin が編集する、あるいは GCal 側で動かして inbound sync が反映する。どの経路も reminderSentAt をクリアしない（src 全体で reminderSentAt に書き込むのは reminder-commands.ts:39 の claim と :55 の release だけ）。8/19 の cron は admin-queries.ts:632 の `reminderSentAt: null` で対象を絞るためこの予約を拾わず、顧客は実際の利用日 8/20 についてリマインダを受け取れない。手元に残っているのは 8/14 を案内する古いリマインダだけで、日付を誤認したまま来訪しない/別日に来る事故につながる。

#### 直し方

startTime を変更する 3 経路の update data に `reminderSentAt: null` を加える（予約日が変わった＝そのリマインダは無効、という意味づけ）。あるいは Reservation に reminderSentForDate（送信対象だった JST 日付）を持たせ、cron の where を `reminderSentForDate != <対象日>` に変える。前者のほうが列追加なしで済む。

#### 該当箇所

```
data: { reminderSentAt: new Date() },
```

#### 到達経路

terraform/cloud\_scheduler.tf:94-96 (schedule "0 \* \* \* \*" → GET /api/cron/reservation-reminder) → src/app/api/cron/reservation-reminder/route.ts:44-51 (JST 翌日 00:00-23:59 の窓を算出。JST 8/13 00:00 の tick で 8/14 10:00 が窓に入る) → src/shared/domain/reservations/admin-queries.ts:627-633 (where に reminderSentAt: null → 対象として返る) → src/app/api/cron/reservation-reminder/route.ts:77 → src/shared/domain/reservations/reminder-commands.ts:32-40 (data: { reminderSentAt: new Date() } — 対象日を持たない永続ラッチ) → 送信成功で route.ts:100 まで到達し release されない → \[分岐A 顧客\] src/app/(public)/reservation/status/edit/\_actions/update.ts:207 → src/shared/domain/reservations/customer-commands.ts:428-434 の validateReservationEditableForUpdate → src/shared/domain/reservations/edit-eligibility.ts:49-57 → src/shared/domain/reservations/deadline.ts:3-10 (34h \>= 24h(src/shared/domain/settings/public-queries.ts:28 の既定) で ok:true) → customer-commands.ts:570-606 の updateMany が startTime を 8/20 10:00 に更新するが data に reminderSentAt が無い / \[分岐B admin\] src/app/(admin)/admin/(dashboard)/\_shared/actions/reservation/admin.ts:303 → src/shared/domain/reservations/admin-commands.ts:503-540 (deadline gate 無し、data に reminderSentAt 無し) / \[分岐C GCal\] src/shared/domain/reservations/reservation-calendar-inbound.ts:244 → src/shared/domain/reservations/calendar-sync-inbound-mutations.ts:287-316 (同上) → 8/19 の cron が src/shared/domain/reservations/admin-queries.ts:632 の reminderSentAt: null で当該行を除外 → 実利用日 8/20 の前日リマインダが送られない（誤った結果）

#### 既存の検査

\_\_tests\_\_/integration/domain/reservations/reminder-idempotency.test.ts は『二重起動で 1 通だけ』という claim の排他性のみを固定しており、日時変更後の再送対象復帰は検査していない。同じ形の registration-reminder-commands.ts（イベント登録側）も同一構造。

#### 反証官による訂正

技術的事実（引用・到達経路・カバレッジ欠落）はすべて正確だが、失敗シナリオの被害記述が誇張されている。medium → low に補正する。

\1) 「手元に残っているのは 8/14 を案内する古いリマインダだけ」は誤り。3 経路すべてで新日時の通知が別途飛ぶ。顧客セルフ変更は src/app/(public)/mypage/\_shared/actions/reservation.ts:340 付近の fireAndForget が sendReservationUpdatedEmail を送り、その ICS は customer-commands.ts:603 の `icsSequence: { increment: 1 }` で SEQUENCE が上がっているため、カレンダークライアント側の 8/14 のエントリは 8/20 に上書き更新される（src/shared/lib/email/reminder-emails.ts:63,68-73 と src/shared/lib/email/reservation-emails.ts:297 が同じ sequence 契約を共有）。admin 経路も admin-commands.ts:473-478 の customerVisibleChanged で変更通知に分岐する。GCal outbound も同アクション内で同期される。

\2) したがって「日付を誤認したまま来訪しない / 別日に来る事故につながる」という因果は成立しない。実損は「前日リマインダ（念押し）が新日付について 1 通欠ける」だけで、顧客が正しい日付を知る手段は複数残っている。

\3) 発生窓も指摘より狭い。顧客セルフ経路は deadline 既定 24h のため、10:00 開始なら JST 8/13 00:00〜10:00 の 10 時間スライスに限られる（deadline を 1h まで下げられる設定 src/app/(admin)/admin/(dashboard)/\_shared/actions/settings/schemas/basic.ts:111 では窓が広がる）。無制限に到達可能なのは admin 編集と GCal inbound で、いずれもスタッフ起因のため「顧客が知らないうちに変わる」ケースではない。

\4) 「registration-reminder-commands.ts も同一構造」は構造の観察としては正しい（src/shared/domain/events/registration-reminder-commands.ts:24-26 が同型）が、イベント登録側に予約と同等の日時変更セルフサービス経路があるかは本反証では未検証。同一欠陥と断定はできない。

\5) 修正するなら「日時変更時に reminderSentAt を null に戻す」より「reminderSentAt を対象日でキーする（送信済みウィンドウ日を保持し窓日と比較する）」ほうが、release 側の意味（送信失敗リトライ）と混線しない。ただし本件は既定動作の欠落であって正しさの破綻ではないため、着手は任意。

---

### F-125

**metadata ルート名（apple-icon / opengraph-image / twitter-image）が予約 slug に無く、その slug のページは作成できるのに公開 URL で永久に表示されない**

<sub>[対処の記録](2026-08-12-codebase-audit-progress.md) ／ [棄却一覧](2026-08-12-codebase-audit-refuted.md)</sub>

|        |                                            |
| ------ | ------------------------------------------ |
| 深刻度 | 低                                         |
| 箇所   | `src/shared/domain/slugs/validation.ts:82` |
| 領域   | CMS                                        |

#### 起きること

管理者が新規ページを slug=`opengraph-image`（または `apple-icon` / `twitter-image`）で作成する。SLUG\_REGEX（^\[a-z0-9\]+(?:-\[a-z0-9\]+)\*$）を満たし、RESERVED\_PATHS に無く、Page/Post/News/Space にも同名が無いため作成は成功し、管理画面では「公開中」と表示され、プレビュー（/preview/pages/opengraph-image）も正常に見える。しかし実 URL /opengraph-image は src/app/(public)/opengraph-image/route.tsx（静的ルートが catch-all より優先）が OGP 画像を返すため、\[...segments\]/page.tsx に到達せずページ本文は永久に表示されない。さらに sitemap.ts の customPages ループは `isReservedPath(page.slug)` でしか除外しないので、この URL が sitemap.xml に載り、Googlebot は HTML の代わりに PNG を受け取る。

#### 直し方

RESERVED\_PATHS に "apple-icon" / "opengraph-image" / "twitter-image" を追加する。転記テストは登録漏れを検出できないので、あわせて src/app/(public)/ と src/app/ 直下の route/page ディレクトリ名を走査して「単一セグメントの静的ルート名がすべて RESERVED\_PATHS に含まれる」ことを検査する gate（走査規模の下限 assert 付き）を 1 本置き、ルート追加時に自動で落ちるようにする。

#### 該当箇所

```
// 動的アイコン生成ルート（src/app/icon* route.tsx、public/admin 両 surface 共通）
"icon",
"icon-192",
"icon-512",
```

#### 到達経路

エントリポイント: src/app/(admin)/admin/(dashboard)/pages/\_components/CreatePageDialog.tsx:113 (parseWithZod(createPageSchema)) → src/app/(admin)/admin/(dashboard)/\_shared/actions/pages.ts:64 executeConformMutation(formData, createPageSchema, ...) \[src/shared/lib/validations/page.ts:151 の SLUG\_REGEX は "opengraph-image" を通す\] → pages.ts:70 createPageCommand(data) → src/shared/domain/pages/commands.ts:124 await ensurePageSlugAvailable(input.slug) → commands.ts:55 checkSlugAvailability(slug, {currentType:"page"}) → src/shared/domain/slugs/validation.ts:145 if (isReservedPath(normalizedSlug)) → validation.ts:92 RESERVED\_PATHS.has("opengraph-image") が false（登録漏れ／set 定義は 44-86 行）→ 分岐に入らず validation.ts:171 return {available:true} → commands.ts:60 の throw を通過 → commands.ts:130 prisma.page.create（Page.slug unique も衝突しないので成功）。誤った結果 (a) 公開 URL: GET /opengraph-image は src/app/(public)/opengraph-image/route.tsx:18 の GET が画像を返し、src/app/(public)/\[...segments\]/page.tsx:54 DynamicPage には到達しないためページ本文が永久に表示されない。誤った結果 (b) sitemap: src/shared/domain/sitemap/queries.ts:155-160 の page.findMany({isPublished:true,isActive:true,isSystemPage:false}) が当該行を返し、src/app/sitemap.ts:249-256 のループで sitemap.ts:251 の isReservedPath(page.slug) が同じ理由で false のため continue せず、sitemap.ts:252-255 で https://…/opengraph-image を emit する。

#### 既存の検査

none。\_\_tests\_\_/unit/domain/slugs/validation.test.ts:32-223 は RESERVED\_PATHS の中身を 1 件ずつ書き写した assertion 集で、SSoT の転記なので登録漏れを検出できない（apple-icon / opengraph-image / twitter-image のケースは 1 件も無い）。app ルート一覧と RESERVED\_PATHS の drift を見る gate も存在しない。

#### 反証官による訂正

指摘の実質は正しいが、記述に 2 点の不正確さと、深刻度に 1 点の過大評価がある。(1) 「metadata ルート名」という括り方は不正確。3 つとも Next.js の metadata file convention (opengraph-image.tsx 等) ではなく、通常の静的 Route Handler (ディレクトリ + route.tsx) である。src/app/(public)/opengraph-image/route.tsx の冒頭 JSDoc が「file convention は使わない」と明示しており、Metadata API 側 (resolveOpenGraphImages / resolveTwitterImages / icons.apple) がこれらのパスを URL として指しているだけ。結論 (静的ルートが catch-all に優先) は変わらないが、原因の呼び名は「metadata 規約の予約語漏れ」ではなく「実在する静的 Route Handler パスの予約漏れ」。(2) 「slugs/validation.ts:145 isReservedPath」は関数定義位置ではなく呼び出し位置。isReservedPath の定義は validation.ts:91-93。(3) 深刻度は medium ではなく low が妥当。到達には管理者が Next.js 内部由来の 3 語 (opengraph-image / apple-icon / twitter-image) のいずれかを日本語レンタルスペース CMS のページ slug として能動的に入力する必要があり、業務上の自然な命名ではない。影響はページが公開 URL で見えないことと sitemap に PNG を返す URL が 1 件載ることに限られ、データ損失・権限逸脱・既存コンテンツへの影響は無く、slug を変えるだけで完全に復旧できる。なお指摘中の「プレビュー (/preview/pages/opengraph-image) は正常に見える」「既存カバレッジ none」はいずれも確認して正しかった (preview は src/app/(public)/preview/pages/\[slug\] の動的ルートで静的な影が無い)。

---

### F-126

**アカウント削除の確認メールが「有効期限 1時間」と書くが実際は 24 時間**

<sub>[対処の記録](2026-08-12-codebase-audit-progress.md) ／ [棄却一覧](2026-08-12-codebase-audit-refuted.md)</sub>

|        |                                                        |
| ------ | ------------------------------------------------------ |
| 深刻度 | 低                                                     |
| 箇所   | `src/shared/emails/delete-account-verification.tsx:63` |
| 領域   | メールテンプレート                                     |

#### 起きること

このリンクは Better Auth の deleteUser フローが発行する。src/shared/lib/customer-auth.ts:134-162 の deleteUser 設定には deleteTokenExpiresIn が無く（src/ \_\_tests\_\_/ e2e/ を grep しても 0 件）、node\_modules/better-auth/dist/api/routes/update-user.mjs:316 の expiresAt: new Date(Date.now() + (…deleteTokenExpiresIn || 3600 \* 24) \* 1e3) により実 TTL は 24 時間（@better-auth/core/src/types/init-options.ts:888 も @default 1 day）。結果 (a) 発行 2 時間後にリンクを踏んだ顧客は「期限切れのはず」と思い込みつつ実際には即時・不可逆にアカウントが削除され、(b) 逆に「1 時間で失効する」と信じた顧客は共有端末やメール転送で 24 時間の漏洩窓が残ることに気づけない。同ディレクトリの他 2 通（change-email-verification.tsx:81 / customer-merge-verification.tsx:103）は自前 TTL 1 時間（customer-email-change-commands.ts:9 / customer-merge-commands.ts:10）と一致しており、ズレているのはこの 1 通だけ。

#### 直し方

customer-auth.ts の deleteUser に deleteTokenExpiresIn: 60 \* 60 を明示して文面と揃える（他 2 通と統一され、削除リンクの漏洩窓も縮む）。TTL を 24h のままにするなら文面を「24時間」に直す。どちらにせよ TTL 定数とテンプレ文言を同じモジュールから引く形にする。

#### 該当箇所

```
このリンクの有効期限は <strong>1時間</strong> です。
```

#### 到達経路

src/app/(public)/mypage/settings/\_components/account-linking.tsx:106 (deleteAccountAction) → src/app/(public)/mypage/\_shared/actions/account.ts:203 customerAuth.api.deleteUser → node\_modules/better-auth/dist/api/routes/update-user.mjs:311 の `if (…deleteUser?.sendDeleteAccountVerification)` が src/shared/lib/customer-auth.ts:140 の設定により成立 → 同 :316 で expiresAt = now + (undefined || 3600\*24)\*1000 の verification 行を作成（実 TTL 24 時間）→ 同 :319 で url を callback に渡す → src/shared/lib/customer-auth.ts:149 sendDeleteAccountVerificationEmail → src/shared/lib/email/delete-account-emails.ts:25 DeleteAccountVerificationEmail → src/shared/emails/delete-account-verification.tsx:63 が「このリンクの有効期限は 1時間 です」と誤表示。発行 1〜24 時間後にリンクを踏むと node\_modules/better-auth/dist/api/routes/update-user.mjs:384 consumeVerificationValue が有効な行を返し（internal-adapter.mjs:677 の expiresAt 判定を通過）、:387 beforeDelete → :388 deleteUser が実行される。session は src/shared/lib/constants/session.ts:9 で 30 日有効なため 24 時間後も生存しており、update-user.mjs:381 の getSessionFromCtx で弾かれない。

#### 既存の検査

無し。email 系 gate（notification-email-clean-break / reservation-email-idempotency 等）はいずれも文面を見ない。他 2 通の 1 時間表記が正しいため、横並びの目視でも気づけない。

#### 反証官による訂正

事実関係は正しいが、深刻度 medium は失敗シナリオ 2 件の過大評価に依存している。両方とも成立しない。

(a)「期限切れのはずと思い込みつつ実際には削除される」は成立しない。押すボタンは同じメール本文の :45-47「アカウントを削除する」で、その直上 :40-41 が「アカウントとすべての関連データが完全に削除されます。この操作は取り消せません。」と明示している。削除ボタンを押す行為自体が意思表示であり、「期限切れだと思ったから安全だと考えて押した」は導線として不自然。TTL の誤記が意図しないクリックを引き起こす経路はコード上に無い。

(b)「24 時間の漏洩窓」は誤り。update-user.mjs:381 の deleteUserCallback は getSessionFromCtx で有効 session を要求し、:385 で `token.value !== session.user.id` なら 404 を返す。つまりリンク単体を入手した第三者は削除できない。使える者は既に victim の session を保持しており、その者はマイページから新規に削除申請できる（account-linking.tsx:106）。したがって 1 時間→24 時間の差分が増やす攻撃面は実質ゼロで、セキュリティ論点として数えるべきではない。

残るのは「不可逆操作を扱う顧客向けトランザクションメールの記載が事実と異なる」という文言の正確性の問題のみ。実害は顧客の期待とのズレに限定されるため low が妥当。

追加の事実誤認（監査側の見落とし）: 同じ「1時間」の記載は src/app/(public)/mypage/settings/\_components/account-linking.tsx:217 の申請完了メッセージ（「リンクの有効期限は1時間です」）にもあり、誤記は 1 箇所ではなく 2 箇所。「ズレているのはこの 1 通だけ」は範囲の過小申告。

なお、正しい直し方は文言を「24時間」に書き換えることではなく、src/shared/lib/customer-auth.ts:134-186 の deleteUser に `deleteTokenExpiresIn: 60 * 60` を足して、既に他 2 経路（customer-email-change-commands.ts:9 / customer-merge-commands.ts:10）で確立している 1 時間の慣行に better-auth 側を揃えること。そうすれば 2 箇所の文言はどちらも無修正で正しくなる。

---

### F-127

**GA4 Data API の retry が実質 no-op — gRPC Status を HTTP status として読むため一時障害で即失敗する**

<sub>[対処の記録](2026-08-12-codebase-audit-progress.md) ／ [棄却一覧](2026-08-12-codebase-audit-refuted.md)</sub>

|        |                                               |
| ------ | --------------------------------------------- |
| 深刻度 | 低                                            |
| 箇所   | `src/shared/lib/analytics/ga-data-api.ts:121` |
| 領域   | 外部連携                                      |

#### 起きること

GA4 Data API が一時障害を返す（BetaAnalyticsDataClient は gRPC 経路で google-gax の GoogleError を throw し、code は Status enum の数値。node\_modules/google-gax/build/src/googleError.d.ts:21 `code?: Status`。UNAVAILABLE=14 / DEADLINE\_EXCEEDED=4 / RESOURCE\_EXHAUSTED=8）。withGoogleApiRetry → isRetryableGoogleApiError → extractStatusCode は error\["code"\] が number なのでそのまま 14 を HTTP status として返す。14 は RETRYABLE\_STATUS\_CODES(429/500/503) に無く、403 でもない。extractSystemErrorCode は code が string のときしか返さないので null。結果 retryable=false で 0 回リトライのまま即 throw され、管理ダッシュボードのアクセス解析は API\_ERROR で落ちる。SDK 側の保険も無い: node\_modules/@google-analytics/data/build/src/v1beta/beta\_analytics\_data\_client\_config.json:35-39 で RunReport は retry\_codes\_name:"non\_idempotent" = 空配列。つまりコメントが謳う exponential backoff は一度も発火しない。

#### 直し方

HTTP クライアント（googleapis / Gaxios）と gRPC クライアント（google-gax）の分類器を分ける。ga-data-api では gRPC Status を判定する専用ラッパー（UNAVAILABLE=14 / DEADLINE\_EXCEEDED=4 / INTERNAL=13 / RESOURCE\_EXHAUSTED=8 を retry 対象にする）を使うか、BetaAnalyticsDataClient 生成時に gax の callOptions.retry で retryableStatusCodes を明示する。少なくとも ga-data-api.ts:120 の「429 / 500 / 503 ... retry」というコメントは実装と一致していないので、どちらかに合わせる。

#### 該当箇所

```
// 基本統計の取得（429 / 500 / 503 + 403 usageLimits は exponential backoff retry）
const [basicResponse] = await withGoogleApiRetry(() =>
client.runReport({
```

#### 到達経路

src/app/(admin)/admin/(dashboard)/page.tsx:81 \<AnalyticsCard /\> → src/app/(admin)/admin/(dashboard)/\_components/AnalyticsCard.tsx:68 getAnalyticsStats(config.gaPropertyId) → src/shared/lib/analytics/ga-data-api.ts:121（同型の欠陥が :135 にも）withGoogleApiRetry(() =\> client.runReport(...)) → gRPC 一時障害で code=14(UNAVAILABLE) の GoogleError が throw（node\_modules/google-gax/build/src/googleError.d.ts:21 + status.d.ts:31、SDK 側 retry は node\_modules/google-gax/build/src/createApiCall.js の retryCodes.length\>0 ガードと beta\_analytics\_data\_client\_config.json:37 の non\_idempotent=\[\] により未装着）→ src/shared/lib/google-api/retry.ts:222 isRetryableGoogleApiError → :149 extractStatusCode → :86 `typeof code === "number"` が真で 14 を返す → :150 RETRYABLE\_STATUS\_CODES.has(14)=false → :152 status!==403 → :157 extractSystemErrorCode は :103 `typeof code === "string"` を満たさず null → :160 return false → :224 `if (!retryable) throw error`（リトライ 0 回）→ ga-data-api.ts:164-179 catch で code:"API\_ERROR" を返す → AnalyticsCard.tsx:70-74 kind:"api-error" 表示。結果、:120 のコメントが謳う exponential backoff は一度も発火しない。

#### 既存の検査

none。\_\_tests\_\_/unit/lib/google-api/retry.test.ts は 429/500/503/400/401/404/410、403+reason、string の system code（ECONNRESET 等）しか見ておらず（:24-133）、gRPC Status 形状（code が 0-16 の数値）の見本入力が無い。src/shared/lib/analytics/ 配下のテストは存在しない。

#### 反証官による訂正

2 点だけ訂正・補足する。(1) 「SDK 側の保険も無い」の機構が指摘の説明より一段強い。retry\_codes が空だと google-gax は「空リストなので全 code を retry 対象外にする」のではなく、node\_modules/google-gax/build/src/createApiCall.js の `if (retry.retryCodes && retry.retryCodes.length > 0)` により retryable() ラッパー自体を装着せず addTimeoutArg だけを掛ける。normalCalls/retries.js は 1 行も実行されない（同ファイル内の `retry.retryCodes.length > 0 && indexOf(err.code) < 0` という条件だけを見ると空配列時に無条件 retry するように読めるため、そこを根拠にすると誤読になる）。(2) 深刻度は medium ではなく low が妥当。影響範囲は管理画面ダッシュボードのアクセス解析カード 1 枚に限られ、AnalyticsCard.tsx:56 の settleDashboardLoad と :70-74 の api-error ビューで既に graceful degradation する。データ破壊・永続化される不整合・公開面への波及は無く、失われるのは回復性とコメントの正しさのみ。なお指摘が挙げる 403 usageLimits 分岐は、この経路では gRPC が quota を RESOURCE\_EXHAUSTED(8) / PERMISSION\_DENIED(7) で返すため元から到達しえず、:120 のコメントはこの呼出に関して全文が実態と乖離している。

---

### F-128

**escapeCsvField の引用判定に \\r が無く、レコード区切りが \\r\\n のため裸の CR を含むフィールドで CSV の行が割れて列がずれる**

<sub>[対処の記録](2026-08-12-codebase-audit-progress.md) ／ [棄却一覧](2026-08-12-codebase-audit-refuted.md)</sub>

|        |                            |
| ------ | -------------------------- |
| 深刻度 | 低                         |
| 箇所   | `src/shared/lib/csv.ts:38` |
| 領域   | 共通ライブラリ・監視       |

#### 起きること

予約の notes やイベント申込の備考など自由入力欄に、後続 LF を伴わない裸の CR（U+000D）が 1 文字含まれる値が保存されているとする（例: "当日10:00着\\r駐車場利用"）。この値は `,` も `"` も `\n` も含まず、先頭文字も `=+-@\t\r` ではないので line 34-39 の条件をすべて外し、引用符で囲まれずそのまま出力される。generateCsv のレコード区切りは line 20 の `\r\n` なので、Excel / LibreOffice は裸の CR もレコード終端として解釈し、その行が CR の位置で 2 行に分割される。結果、その予約行の以降の列（金額・ステータス等）が 1 行下にずれ、後続行と混ざった状態で読まれる。terms-agreements（規約同意記録）エクスポートでも同じ経路なので、同意者と規約の対応がずれた CSV が監査用に出力されうる。

#### 直し方

引用判定に CR を加える。`escaped.includes("\n")` を `/[\r\n]/.test(escaped)` に置き換えるか、条件全体を `/[",\r\n]/.test(escaped)` に統一する（RFC 4180 は CR/LF を含むフィールドの引用を要求している）。formula guard 側の `\r` 扱いと整合が取れる。

#### 該当箇所

```
escaped.includes("\n")
```

#### 到達経路

前提: 非ブラウザ HTTP クライアントが公開予約 Server Action の FormData で notes に裸の CR（%0D、後続 LF なし）を送る。ブラウザ経由では textarea が CRLF へ正規化するため発生しない。

\1. 入力面: src/app/(public)/reservation/\_components/customer-step.tsx:231-238 — Textarea が `fields.notes` に紐づく（この UI 自体は CRLF 化するので、悪用は同じ action への直接 POST）
\2. 検証: src/shared/lib/validations/public-reservation.ts:42-47 — `z.string().trim().max(2000).optional().or(z.literal(""))`。`trim()` は先頭末尾のみ。内部 CR は通過（制御文字除去なし）
\3. 永続化: src/shared/domain/reservations/public-commands.ts:259 — `notes: input.notes || null` を text 列へそのまま保存
\4. 読み出し: src/shared/domain/reservations/export-queries.ts:36 — `notes: true`
\5. 列定義: src/app/api/admin/export/reservations/route.ts:125 — `{ header: "備考", accessor: (r) => r.notes }`
\6. エスケープ: src/shared/lib/csv.ts:17 → `escapeCsvField(String(...))`
\7. 分岐(a): src/shared/lib/csv.ts:31 — `/^[=+\-@\t\r]/` は先頭のみ判定。内部 CR なので false → needsFormulaGuard=false
\8. 分岐(b): src/shared/lib/csv.ts:34-39 — needsFormulaGuard=false / `,` なし / `"` なし / `\n` なし（裸 CR に後続 LF が無い）で 4 条件すべて false
\9. 誤結果: src/shared/lib/csv.ts:42 — `return escaped;` で引用符なしのまま返る
\10. 連結: src/shared/lib/csv.ts:20 — `[header, ...body].join("\r\n")`。レコード区切りと同じ CR がフィールド内に裸で出るため、Excel / LibreOffice がその位置を行終端と解釈し、以降の列（合計・ステータス・作成日）が次行へずれる

同型のもう 1 経路: src/app/api/admin/export/event-registrations/route.ts:44 の `accessor: (r) => r.note`（検証は src/shared/lib/validations/event-registration.ts:17 の `.trim().max(500)`）。なお同ルートの XLSX 出力（ExcelJS）は無関係で影響しない。

#### 既存の検査

先頭 CR は line 31 の `/^[=+\-@\t\r]/` に当たって needsFormulaGuard 経由で引用まで到達するため、その 1 ケースだけは守られている。文字列内部の CR を扱うテストは見当たらない（`__tests__` に csv.ts 向けの CR ケースなし）。ブラウザの textarea は改行を CRLF に正規化するので通常操作では発生せず、HTTP クライアントを直に叩く経路や外部データ取り込み経由でのみ入る。

#### 反証官による訂正

中核の主張（csv.ts:38 の引用判定に `\r` が無く、内部の裸 CR が unquoted で出る）は正しく、zod / DB / 型 / 既存テスト / gate / ESLint のいずれも防いでいない。修正は `escaped.includes("\r")` を足す 1 トークン。ただし失敗シナリオの記述には事実誤認が 4 点あり、影響範囲は申告よりかなり狭い。

\1. **terms-agreements は影響を受けない（誤り）**。route.ts:83-120 の全 13 列は同意ID(UUID) / 規約タイトル / スラッグ / 規約タイプ(enum ラベル) / 適用画面(enum ラベル) / 同意日時(JST 整形) / 顧客名 / 顧客メール / ゲストメール / リソースID / IPアドレス / UserAgent / sha256 ハッシュで、自由入力欄が 1 つも無い。「同意者と規約の対応がずれた CSV が監査用に出力されうる」という結論は出典を欠く。唯一クライアント由来の UserAgent も HTTP ヘッダ値であり、裸 CR はヘッダパーサが拒否するため入らない。

\2. **「外部取り込み経由」の経路は存在しない（誤り）**。notes への外部起点の書き込みは Google Calendar の inbound sync だけで、calendar-sync-inbound-mutations.ts:64-66 が `` `${existingNotes}\n${syncNote}` ``、同:230-232 が `` `${existingNotes}\n\n${rejectionNote}` ``。いずれもシステム生成文字列を `\n` で連結するだけで、外部テキストを notes に取り込まないうえ、`\n` を含むので現行の判定で既に引用される。

\3. **audit-logs エクスポートは JSON 符号化で防御済み**。route.ts:49-52 の `stringifyAuditJson` は `JSON.stringify` なので CR は 2 文字の `\r` に符号化され、さらに囲みの `"` が付くため line 37 の `escaped.includes('"')` で必ず引用される。reservations ルートが query param（`search` 等）を監査ログ metadata に書く経路（route.ts:73-83）も同じ理由で無害。

\4. **customers エクスポートに notes 列は無い**（route.ts:51-98 に「備考」「メモ」列が存在しない）。管理画面の顧客メモ（customer.ts:119 の updateCustomerNotesSchema）は CSV に出ない。

実際に素通りする列は **reservations の「備考」と event-registrations の「備考」の 2 つのみ**。

\5. 到達条件の補足: 指摘自身も認める通りブラウザの textarea は送信時に CRLF へ正規化するため、通常操作では絶対に発生しない。Server Action への手組み POST が必要で、成果は「管理者が自分で落とした CSV の 1 行が割れる」こと。権限昇格も DB 側のデータ破損も無い。数式インジェクション（OWASP）とは別問題で、そちらは line 31 で守られている。severity は自己申告の low が妥当で、上げる根拠は無い。

---

### F-129

**領収書メールの発行日だけが機械形式 (2026-07-26)。PDF・マイページ・プレビューは和暦表記**

<sub>[対処の記録](2026-08-12-codebase-audit-progress.md) ／ [棄却一覧](2026-08-12-codebase-audit-refuted.md)</sub>

|        |                                             |
| ------ | ------------------------------------------- |
| 深刻度 | 低                                          |
| 箇所   | `src/shared/lib/email/receipt-emails.ts:61` |
| 領域   | メールテンプレート                          |

#### 起きること

formatJstDateString は date-format.ts:182-203 の Intl.DateTimeFormat("en-CA", …) ベースで、JSDoc も「JST カレンダー日付の machine 形式 "YYYY-MM-DD"」と明記する集計・cron 用ヘルパー。これを顧客向け本文にそのまま流しているため、2026-07-26 発行の領収書通知メールは「発行日: 2026-07-26」と表示される。同じ Receipt の PDF は render-receipt-pdf.tsx:83-86 の formatIssuedAt が ISO を分解して「2026年7月26日」に直し、マイページ一覧 (receipt-list.tsx:75) も formatSerializedDate で「2026年7月26日」。他の全メールは formatDateWithWeekday（「2026年7月26日(日)」）を使う。さらに receiptIssuedFixture が issuedAt: "2026年7月26日" を持つため、管理画面のテンプレプレビューとテスト送信では和暦表記に見え、運用者が本番の表示を検証できない。receipt-resend も同経路（receipt-emails.ts:125）で同じ症状。

#### 直し方

formatDateWithWeekday（他メールと同じ SSoT）か PDF と同じ formatIssuedAt 相当を使う。合わせて receipt-issued.fixture.ts / receipt-resend.fixture.ts の issuedAt を実際に出力される文字列に置き換え、プレビューが本番と一致するようにする。

#### 該当箇所

```
issuedAt: formatJstDateString(input.issuedAt),
```

#### 到達経路

src/shared/domain/receipts/notify-issued.ts:34 notifyReceiptIssuedForReservation → :38-56 prisma.receipt.findUnique で issuedAt: Date を取得 → :58/:62/:68 の 3 guard（not\_found / wrong\_binding / no\_recipient）をすべて通過 → :71-80 sendReceiptIssuedEmail(input) → src/shared/domain/email/lib-dispatch.ts:122-127 requireSendContext() が非 null なら sendReceiptIssuedEmailLib(input, sendContext) → src/shared/lib/email/receipt-emails.ts:61 issuedAt: formatJstDateString(input.issuedAt) → src/shared/lib/date-format.ts:200-203 JST\_MACHINE\_DATE\_FORMATTER(en-CA) が "2026-07-26" を返す → src/shared/emails/receipt-issued.tsx:68 「発行日: 2026-07-26」として顧客に配信（同一 Receipt の PDF は src/shared/pdf/render-receipt-pdf.tsx:83-87 → src/shared/pdf/receipt-document.tsx:243 が「発行日: 2026年7月26日」、マイページは src/app/(public)/mypage/receipts/\_components/receipt-list.tsx:74-75 → src/shared/lib/serialize.ts:290-303 が「2026年7月26日」）。再送経路は src/app/.../receipts resend action → src/shared/lib/email/receipt-emails.ts:125 → src/shared/emails/receipt-resend.tsx:76 で同一症状。

#### 既存の検査

無し。\_\_tests\_\_/unit/emails/receipt-issued.test.tsx に issuedAt / 日付の assertion は 0 件。registry render gate は例外が出ないことしか見ない。fixture が和暦なのでプレビュー目視でも露見しない。

#### 反証官による訂正

事実関係は全項目が実測と一致するが、用語と深刻度に補正が要る。(1) 「和暦」は誤り。PDF / マイページ / fixture が使うのは西暦＋日本語単位の「2026年7月26日」で、和暦なら「令和8年7月26日」。指摘文中の 3 箇所すべてで表現が不正確。(2) 「顧客向け表示に machine 形式は他に無い」という含意は成り立たない。src/app/(public)/mypage/reservations/\[id\]/\_components/customer-series-info.tsx:37,58 は会員向けマイページで formatJstDateString の出力（"2026-05-30"）をそのまま dd に出しており、machine 形式の顧客露出は既に存在する（ただし領収書ドメイン内は PDF・一覧・プレビューが揃って和風表記なので、領収書メールだけが浮いているという中核の主張は有効）。(3) 深刻度 medium は過大。日付値そのものは正しく、"2026-07-26" は ISO 準拠で誤読の余地が無い（MM/DD と DD/MM の取り違えのような曖昧性は無い）。税務上の原本である PDF の表記は正しく、影響は通知メール本文の体裁の不統一に限られる。修正は 1 行（formatDateWithWeekday または PDF と同じ「YYYY年M月D日」への差し替え、加えて fixture 2 件を本番出力と一致させる）で、機能・データ・法的有効性のいずれにも波及しない。よって low が妥当。(4) 「既存カバレッジ無し」の申告は正確で、registry render gate（\_\_tests\_\_/unit/emails/email-template-registry-render.test.ts）が例外の有無しか見ない点、fixture が和風表記のためプレビュー目視で露見しない点も確認済み。

---

### F-130

**下付き・上付き文字が sanitize allowlist に無く、公開ページで書式が消える**

<sub>[対処の記録](2026-08-12-codebase-audit-progress.md) ／ [棄却一覧](2026-08-12-codebase-audit-refuted.md)</sub>

|        |                                                        |
| ------ | ------------------------------------------------------ |
| 深刻度 | 低                                                     |
| 箇所   | `src/shared/lib/html/sanitize-content-html-core.ts:10` |
| 領域   | エディタ内部                                           |

#### 起きること

記事本文で「H2O」の `2` を選択し、フローティングツールバーの「下付き」ボタン（QuickFormatSection.tsx:82-92）を押して保存する。編集画面では下付きのまま表示され contentJson にも `format` として残るので admin は成功したと思うが、`deriveLexicalContentHtmlFromJson` が出す HTML は Lexical の TextNode.createDOM 由来で `<sub><span …>2</span></sub>`（lexical/src/nodes/LexicalTextNode.ts:109-123, 572-581）になり、この配列に `sub` / `sup` が無いため sanitize-html が `disallowedTagsMode: "discard"` でタグだけ剥がす。公開ページは「H2O」とベタ表示になり、再編集しても編集画面では正しく見えるので原因に辿り着けない。太字・斜体は createDOM が内側に `<strong>` / `<em>` を作るので生き残る（exportDOM が足す `<b>` / `<i>` だけが剥がれる）ため、落ちるのは下付き・上付きだけ。

#### 直し方

`LEXICAL_ALLOWED_TAGS` に `"sub", "sup"` を足す（どちらも sanitize-html の既定 allowlist に含まれる安全側のタグ）。書式として提供しないと決めるなら QuickFormatSection から両ボタンを外す — どちらかに寄せて「エディタで押せるが公開されない」状態を無くす。

#### 該当箇所

```
const LEXICAL_ALLOWED_TAGS = [
```

#### 到達経路

src/app/(admin)/admin/(dashboard)/\_shared/components/editor/lexical/plugins/floating-toolbar/QuickFormatSection.tsx:87 (onFormat("subscript")) → src/app/(admin)/admin/(dashboard)/\_shared/components/editor/lexical/plugins/FloatingTextFormatToolbarPlugin.tsx:213 (dispatchCommand(FORMAT\_TEXT\_COMMAND, "subscript")) → TextNode.\_\_format |= IS\_SUBSCRIPT (node\_modules/lexical/src/LexicalConstants.ts:41 = 1\<\<5) → 保存: src/app/(admin)/admin/(dashboard)/\_shared/actions/post/mutations.ts:160 (contentHtml: deriveLexicalContentHtmlFromJson(parsed.data.contentJson)) → src/app/(admin)/admin/(dashboard)/\_shared/components/editor/lexical/preview/derive-lexical-content-html-core.ts:20 → src/app/(admin)/admin/(dashboard)/\_shared/components/editor/lexical/preview/render-editor-state-json-to-html-core.ts:32 ($generateHtmlFromNodes) → node\_modules/lexical/src/nodes/LexicalTextNode.ts:669 exportDOM → :570 createDOM → :116-118 getElementOuterTag が 'sub' を返し \<sub style="white-space:pre-wrap"\>\<span\>2\</span\>\</sub\> を生成 → src/shared/lib/html/lexical-content-html-pipeline.ts:8 finalizeLexicalExportedHtml → src/shared/lib/html/sanitize-content-html-core.ts:74 (allowedTags = LEXICAL\_ALLOWED\_TAGS、:10-53 に "sub"/"sup" 無し) → :113 disallowedTagsMode:"discard" → node\_modules/sanitize-html/index.js:278-287 が sub を nonTextTags 外として「タグだけ破棄・テキスト保持」 → 誤った結果: DB の contentHtml が \<span\>2\</span\> になり、src/app/(public)/blog/\_components/post-detail-page-content.tsx:90-93 が描画する公開ページで「H2O」が下付き無しのベタ表示になる（contentJson には format:32 が残るため再編集時の編集画面では正しく見え、原因が admin から不可視）

#### 既存の検査

`__tests__/unit/lib/html-sanitize.test.ts` に sub / sup / mark への言及は 1 件も無い。`icon-export-sanitize.test.ts` は curated icon SVG のみ。

#### 反証官による訂正

欠陥自体は実測で確認済み（refuted=false）だが、深刻度 medium は過大。低く補正する理由: (a) データ損失が無い — contentJson は format:32 を保持したまま保存されるので、allowlist に sub/sup を足せば次回保存で復元される。破壊されているのは派生列 contentHtml だけ。(b) セキュリティ影響ゼロ — 剥がれるのは無害なセマンティックタグで、sanitize が緩む方向ではなく厳しすぎる方向の誤り。(c) 影響範囲が狭い — レンタルスペース予約サイトの blog/news/terms 本文で下付き・上付きが要る場面（化学式・注釈番号）は稀。実測で影響を受けるのは subscript / superscript の 2 書式のみ。事実誤認の訂正 2 点: (1) 報告の「既存カバレッジの申告」が mark に言及しているが、**このアプリのハイライトは \<mark\> を通らない**。HighlightPlugin は Lexical の TextFormatType 'highlight' ではなく $patchStyleText による background-color のインライン style で実装されており（MarkdownTransformers.ts:186-198 の JSDoc が明記、既定の HIGHLIGHT transformer を「常に false で実質無効」として除外している）、span\[style\] は allowedAttributes で許可済みなので公開ページでも残る。format bit 128 を直接立てた実測では確かに \<mark\> が剥がれるが、その状態に UI から到達する経路が無い。よって allowlist 修正で必要なのは sub / sup の 2 タグだけで、mark を足す必要は無い。(2) 報告は exportDOM 出力を `<sub><span …>2</span></sub>` としているが、正確には whiteSpace:pre-wrap の style は外側の \<sub\> に付く（LexicalTextNode.ts:675 が element.style.whiteSpace を設定、この時点の element は createDOM が返した \<sub\>）。そのため sanitize 後に残る span は style を失い、実測出力は他の text node の `<span style="white-space:pre-wrap">` と異なり素の `<span>2</span>` になる。結論は変わらない。なお lexical 行番号は createDOM が 570-591（報告は 572-581）で、getElementOuterTag 109-123 は正確。

---

### F-131

**R2 一括削除が 1000 件で分割されず、保持期限 purge が一度に 1000 件超の添付を消そうとすると全件が R2 に永久に残る**

<sub>[対処の記録](2026-08-12-codebase-audit-progress.md) ／ [棄却一覧](2026-08-12-codebase-audit-refuted.md)</sub>

|        |                                 |
| ------ | ------------------------------- |
| 深刻度 | 低                              |
| 箇所   | `src/shared/lib/r2/delete.ts:8` |
| 領域   | 問い合わせ                      |

#### 起きること

data-retention cron の purgeExpiredInquiries が、cutoff（既定 inquiryMonths=36、json-validators.ts:312）を超えた全 Inquiry の添付 r2Key をまとめて集め（data-retention/commands.ts:223-226、件数の上限なし）、DB を deleteMany した後に deleteObjectsFromBucket へ一括で渡す（同 236-239）。36 ヶ月分のコホートで添付が 1001 件以上あると S3/R2 の DeleteObjects は 1 リクエスト 1000 キーの上限を超えて MalformedXML(400) を返し、リクエスト全体が失敗する。deleteObjectsFromBucket は例外を catch して logError し `{success:false}` を返すだけ（delete.ts:124-135）、呼び出し側も logError するだけで再試行しない（data-retention/commands.ts:240-259）。DB 側の inquiry\_attachments 行は既に消えているので r2Key を再取得する手段が無く、PII を含む添付が private bucket に恒久的に残る。この cron の「保持期限を過ぎたら消す」という契約が静かに破れ、count だけは正常値が返るため監視でも成功に見える。同じ関数は anonymizeInquiryCommand / anonymizeCustomerCommand の連鎖経路（anonymize-commands.ts:122）からも呼ばれる。

#### 直し方

deleteObjectsFromBucket（および deleteFiles）で keys を 1000 件ずつ chunk して逐次 DeleteObjects を送り、chunk 単位の失敗を集約して返す。あわせて purgeExpiredInquiries では R2 削除に失敗した r2Key を再クリーンアップ可能な形（専用テーブルか構造化ログ）に残し、DB 行を消した後に鍵を失わないようにする。

#### 該当箇所

```
* 画像アップロードのみで 1000 件を超える同時削除は発生しないため chunking しない。
```

#### 到達経路

src/app/api/cron/data-retention/route.ts:38 GET → route.ts:53 runDataRetentionPurge → src/shared/domain/data-retention/commands.ts:374 purgeExpiredInquiries(now, config.inquiryMonths) → commands.ts:217 months\<=0 の early return を通過 → commands.ts:223-226 prisma.inquiryAttachment.findMany({ where:{ inquiry: purgeWhere }, select:{ r2Key:true } })（take/cursor 無し・件数上限なし） → commands.ts:228-231 tx.inquiry.deleteMany（onDelete: Cascade で inquiry\_attachments 行が消滅、prisma/schema.prisma:1308） → commands.ts:236-239 deleteObjectsFromBucket(bucket, attachments.map(a=\>a.r2Key)) → src/shared/lib/r2/delete.ts:111 空配列ガードを通過 → delete.ts:114-121 DeleteObjectsCommand に 1000 超の Key を 1 リクエストで投入（chunking 無し / client.ts:67-74 の S3Client にも分割 middleware 無し）→ S3/R2 が MalformedXML(400) → delete.ts:124-135 catch して {success:false} を返すのみ → commands.ts:240-249 logError（ErrorSeverity.HIGH）するだけで再試行せず → private bucket の添付 object が全件 orphan として残り、DB 行は消えているため自動再クリーンアップ経路が無い

#### 既存の検査

delete.ts:7-8 の JSDoc が「画像アップロードのみ」を前提に chunking しないと宣言しているが、その前提は inquiry 添付の private bucket 経路が追加された時点で崩れている。\_\_tests\_\_/unit/architecture/r2-upload-clean-break.test.ts は upload 側の境界のみを見ており、削除の件数上限は見ていない。data-retention の unit / integration テストにも 1000 件超のケースは無い。

#### 反証官による訂正

コードの事実（chunking 無し・呼び出し側が無上限）は正しいが、以下 4 点が不正確で、medium は過大。

\1. **「count だけは正常値が返るため監視でも成功に見える」は誤り。** commands.ts:240-249 と 250-259 の両方が `logError` を `ErrorSeverity.HIGH` かつ `context.count` 付きで出す。HTTP レスポンスの count が DB 削除件数なのは事実だが、エラーログ側には HIGH で必ず記録されるので「監視でも成功に見える」は成立しない。無言の破綻ではない。

\2. **「永久に残る / r2Key を再取得する手段が無い」は過大。** 添付は専用 bucket `R2_INQUIRIES_BUCKET_NAME`（client.ts:118-126、公開 bucket と分離）にのみ置かれ、key は `inquiries/<inquiryId>/...`（keys.ts STORAGE\_PREFIXES.INQUIRIES + folder=inquiryId、attachment-commands.ts:169-173）。bucket 用途が単一なので、運用上は ListObjects で列挙して残存 inquiry\_attachments 行と突合すれば回収できる。自動回復経路が無いのは事実だが「恒久的に不可逆」ではない。

\3. **anonymize 系の連鎖経路を同格に並べているのは誤り。** anonymize-commands.ts:94-97 は `where:{ inquiryId }` の**単一 inquiry 分**しか集めず、customer-lifecycle-commands.ts:259 も 1 顧客分の集約にすぎない。ここで 1000 件に達するには単一 inquiry / 単一顧客に 1000 件超の添付が要り、purge cohort とは桁が違う。リスクを水増ししている。

\4. **場所の指し方が弱い。** delete.ts:8 の「画像アップロードのみ」という前提が private bucket 追加で陳腐化しているのは事実だが、当の `deleteObjectsFromBucket` は自身の JSDoc（delete.ts:104）で「最大 1000 件」と上限を明示している。したがって欠陥の所在は delete.ts ではなく、**明示済み契約を無上限で踏み越えている呼び出し側 data-retention/commands.ts:236-239**。

深刻度を low とする根拠: 添付の作成経路は現状 admin 側の 1 ファイルずつの Server Action のみ（`uploadInquiryAttachmentCommand` の呼び出しは src/app/(admin)/.../\_shared/actions/inquiry.ts:245 の 1 箇所だけで、public/mypage 側は表示専用の inquiry-attachment-list.tsx しか無く customer からの upload は未配線）。既定 inquiryMonths=36（json-validators.ts:312）の日次 cron では 1 日分ずつしか cohort に入らないため、1000 超は「初回の一括 purge」か「管理者が inquiryMonths を大幅に下げた（basic.ts:208-212 は min(0) のみで上限なし）」場合に限られる。影響も public 露出ではなく private bucket 内の保持期限超過であり、HIGH ログで検知可能。

---

### F-132

**page-hero の images 重複チェックが field 側に付いていて path が二重になり、エラーが誰にも届かない**

<sub>[対処の記録](2026-08-12-codebase-audit-progress.md) ／ [棄却一覧](2026-08-12-codebase-audit-refuted.md)</sub>

|        |                                                              |
| ------ | ------------------------------------------------------------ |
| 深刻度 | 低                                                           |
| 箇所   | `src/shared/lib/sections/definitions/page-hero/schema.ts:53` |
| 領域   | エディタ内部                                                 |

#### 起きること

page-hero（editorial-split）の「ヒーロー画像」に同じ画像 URL を 2 件登録して「保存」を押す。refine は `field.array(...)` の戻り値（= `images` プロパティのスキーマ）に付いているため、$ZodCustom が積む issue.path は params の `["images"]`（zod/v4/core/schemas.js:2231）で、そこに object parser が property key `images` を prefix するので最終 path は `["images","images"]` になる。conform 側の field 名は `images` なので一致せず、エラーは描画されないまま `submission.status !== "success"` で保存が中断する（= 保存ボタンが無反応）。同じ「重複メディア禁止」でも gallery/schema.ts:56-61 と hero/schema.ts:82-90 は object 側に refine を付けているので path は `["media"]` / `["backgroundMedia"]` になり正しく表示される — page-hero だけが例外。

#### 直し方

`path: ["images"]` を削除する（field に付いた refine の issue は既に `images` へ prefix される）。または gallery / hero と揃えて refine を `z.object({...})` 側へ移し、`path: ["images"]` を残す。

#### 該当箇所

```
path: ["images"],
```

#### 到達経路

src/app/(admin)/admin/(dashboard)/pages/\[slug\]/edit/\_components/SectionEditPanel.tsx:114 (AutoSectionForm 描画)
→ src/app/(admin)/admin/(dashboard)/pages/\[slug\]/\_sections/\_components/auto-section-form.tsx:91 onValidate
→ auto-section-form.tsx:95 activeSchema.safeParse(payload)（activeSchema = pageHeroConfigSchema）
→ src/shared/lib/sections/definitions/page-hero/schema.ts:51-54 field.array(...).refine(..., { path: \["images"\] })
→ node\_modules/zod/v4/core/schemas.js:2231 handleRefineResult が issue.path = \["images"\] を積む
→ node\_modules/zod/v4/core/schemas.js:721 handlePropertyResult → node\_modules/zod/v4/core/util.js:546-553 prefixIssues が "images" を unshift → path = \["images","images"\]
→ src/app/(admin)/admin/(dashboard)/pages/\[slug\]/\_sections/\_components/auto-section-form/helpers.ts:53 join(".") → error キー "images.images"
→ auto-section-form.tsx:269 fields\["images"\].errors?.\[0\] === undefined → 同 507-515 の error 段落が描画されない（分岐が false）
→ auto-section-form.tsx:108 `if (!submission || submission.status !== "success") return;` → onSave 未呼び出し
→ 誤った結果: 「保存」を押しても何も起こらず、原因表示も無い（重複禁止メッセージ "同じ画像を複数登録することはできません" はどこにも出ない）

#### 既存の検査

`__tests__/unit/shared/lib/sections/page-hero.test.ts` / `page-hero-media-schema.test.ts` は safeParse の成否は見ているが issue.path を assert していない。

#### 反証官による訂正

深刻度を medium → low に補正。理由: (1) データ破損は起きず、保存は fail-closed 方向に止まる（不正 config が DB に入るわけではない）。壊れているのはフィードバックだけ。(2) 発火条件が「page-hero の editorial-split で同じ画像 URL を 2 件登録する」という管理者側の異常操作に限られ、通常運用では踏まない。(3) 影響は 1 セクション 1 フィールドに閉じている。ただし「保存ボタンが無反応で理由も出ない」は管理 CMS として実害のある行き止まりなので、none/false ではなく low。

事実誤認・不正確な点の訂正:

\1. 報告の「gallery/hero は object 側に refine を付けているので正しい」という対比は結論としては正しいが、規則の説明として不正確。真の規則は「refine の `path` は refine を付けたスキーマからの相対パスで、親 object が property key を prefix する」。実際、同リポジトリの `src/shared/lib/sections/definitions/_shared/buttons.ts:68-70` は \*\*field 側（配列スキーマ側）に refine を付けているが `path` を省略しており\*\*、結果 path は正しく `["buttons"]` になる。つまり「field 側に付けたこと」が欠陥なのではなく「field 側に付けた上で `path` を重ねて指定したこと」が欠陥。したがって最小修正は schema.ts:53 の `path: ["images"],` の 1 行削除であり、報告の書き方が示唆するような「refine を object 側へ移す」構造変更は不要（object 側へ移すなら `path: ["images"]` は逆に必要になる）。

\2. 報告は既存カバレッジとして `page-hero-media-schema.test.ts` を挙げているが、このファイルは `__tests__/unit/shared/lib/sections/` ではなく `__tests__/unit/domain/sections/page-hero-media-schema.test.ts` にある。重複チェックを触っているのは `__tests__/unit/shared/lib/sections/page-hero.test.ts:70-82` のみ。「issue.path を assert していない」という指摘自体は正しい（同 79-81 行で message を join して toContain するだけ）。

\3. 報告の「$ZodCustom が積む issue.path は params の \["images"\]（zod/v4/core/schemas.js:2231）」は本バージョン（zod 4.4.3）で正確。該当行は `path: [...(inst._zod.def.path ?? [])]`。

なお本リポジトリの方針（新しい gate は実際に起きた欠陥に対してだけ足す）に照らすと、修正時に page-hero.test.ts の既存テストへ `expect(result.error.issues[0].path).toEqual(["images"])` を 1 行足すのが妥当で、refine path 形状を検査する新規 architecture gate を起こす必要は無い。

---

### F-133

**振込先フォールバックが業務層だけを見るため、payment ON × Stripe credentials 欠損で支払手段がゼロになる**

<sub>[対処の記録](2026-08-12-codebase-audit-progress.md) ／ [棄却一覧](2026-08-12-codebase-audit-refuted.md)</sub>

|        |                                                       |
| ------ | ----------------------------------------------------- |
| 深刻度 | 低                                                    |
| 箇所   | `src/shared/lib/settings/transfer-account-gate.ts:14` |
| 領域   | feature フラグ                                        |

#### 起きること

payment/availability.ts:15-37 は決済ゲートを「業務層 = isFeatureEnabled('payment')」と「技術層 = Stripe credentials」の2層に分離し、UI は必ず両方を見る isOnlinePaymentAvailable() を使う契約になっている。ところが振込先の表示判定 shouldShowTransferAccounts は paymentFeatureEnabled（業務層）だけを見て、true なら無条件で false を返す。状態: featureModules.payment = true だが stripeSecretKey / stripeWebhookSecret が未設定（Stripe 連携の設定途中、あるいは鍵ローテーションで暗号文を消した直後）。このとき /mypage/reservations/\[id\] では isOnlinePaymentAvailable()（同ファイル165行）が false になり決済ボタンが消え、同じページの178行で取った paymentFeatureEnabled=true が resolveTransferAccountsForCustomerDisplay に渡って振込先も非表示になる。結果、UNPAID の予約詳細画面に支払手段が1つも出ない。同じ穴がメールにもあり、email-render-context.ts:99-106 の resolveTransferEmailFields は isFeatureEnabled('payment') が true なら transferAccounts: \[\] / transferGuidance: null を返すので、予約確認メール・イベント申込メールにも振込先が載らない。顧客は入金方法が分からず、運用者側は「payment は ON なのだから Checkout で払えるはず」と見えるため気づけない。/reservation/status（147-150行）と /events/registrations/status（123行）も同じ経路。

#### 直し方

shouldShowTransferAccounts の入力を paymentFeatureEnabled から「オンライン決済が実際に使えるか（= isOnlinePaymentAvailable() の結果）」に置き換える。呼び出し3経路（reservation/status, mypage/reservations/\[id\], events/registrations/status）と email-render-context.ts:99 の resolveTransferEmailFields も同じ値に揃える。payment/availability.ts の JSDoc が「UI 側の判定は isOnlinePaymentAvailable() を使う」と既に宣言しているので、SSoT はそちらに寄せるのが自然。

#### 該当箇所

```
if (input.paymentFeatureEnabled) {
```

#### 到達経路

前提状態: SettingsFeatures.featureModules.payment = true（src/shared/lib/features/registry.ts:232 buildInitialFeatureModules の既定 / prisma/seed.ts:360 resolveSeedFeatureModules）かつ SettingsStripe.stripeWebhookSecret = null かつ active な TransferAccount が 1 件以上 かつ 当該予約の paymentStatus = UNPAID。

\[1\] src/app/(public)/mypage/reservations/\[id\]/page.tsx:165 — Promise.all 内で isOnlinePaymentAvailable() を呼ぶ
\[2\] src/shared/domain/payment/availability.ts:104 — isFeatureEnabled("payment") は true なので通過 → 109 行 loadStripeCredentials()
\[3\] src/shared/domain/payment/availability.ts:57-63 — webhookCiphertext が undefined → DomainError throw
\[4\] src/shared/domain/payment/availability.ts:111-113 — catch → return false（paymentEnabled = false）
\[5\] src/app/(public)/mypage/reservations/\[id\]/page.tsx:178 — 別途 isFeatureEnabled("payment") を呼ぶ
\[6\] src/shared/domain/features/check.ts:56-61 → true（paymentFeatureEnabled = true）
\[7\] src/app/(public)/mypage/reservations/\[id\]/page.tsx:179 — resolveTransferAccountsForCustomerDisplay({ paymentFeatureEnabled: true, paymentStatus: "UNPAID" })
\[8\] src/shared/domain/settings/transfer-account-queries.ts:132 — activeCount = 1（0 件ではない）
\[9\] src/shared/domain/settings/transfer-account-queries.ts:134 → src/shared/lib/settings/transfer-account-gate.ts:14 — if (input.paymentFeatureEnabled) return false
\[10\] src/shared/domain/settings/transfer-account-queries.ts:140 — return null

誤った結果（同一画面で 2 つ同時）:
\- src/app/(public)/mypage/reservations/\[id\]/page.tsx:246 → \_components/reservation-detail.tsx:280 の `{transferDisplay ? ... : null}` が false → 振込先セクション非描画
\- \_components/reservation-detail.tsx:352 の `paymentEnabled && isActive && (UNPAID|FAILED) && totalPrice > 0` が paymentEnabled=false で false → Checkout ボタン非描画

メール経路（同じ機構、別入口）:
src/shared/domain/settings/queries/email-render-context.ts:99 resolveTransferEmailFields → 100 行 isFeatureEnabled("payment") = true → 101-106 行で transferAccounts: \[\] / transferGuidance: null を返す → src/shared/lib/email/reservation-emails.ts:174 shouldShowTransferAccounts が activeAccountCount = 0 でも paymentFeatureEnabled = true で先に false（transfer-account-gate.ts:14）→ 予約確認メールに振込先が載らない。

#### 既存の検査

\_\_tests\_\_/unit/lib/settings/transfer-account-gate.test.ts は payment ON/OFF × paymentStatus × activeAccountCount の5ケースのみで、credentials 欠損状態を入力として持たない（そもそも関数がその入力を受け取らない）。\_\_tests\_\_/unit/architecture/ に決済2層の使い分けを見る gate は無い。

#### 反証官による訂正

機構自体は実在するが、記述に 5 点の事実誤認があり、深刻度 high は成立しない。

\1. 「UI は必ず両方を見る isOnlinePaymentAvailable() を使う契約になっている」は誤り。リポジトリ全体で isOnlinePaymentAvailable() の呼び出しは 2 箇所しかない — src/app/(public)/spaces/\[slug\]/page.tsx:122 と src/app/(public)/mypage/reservations/\[id\]/page.tsx:165。イベント面は src/app/(public)/mypage/events/page.tsx:40 と src/app/(public)/mypage/events/\[id\]/page.tsx:95 がどちらも isFeatureEnabled("payment") 単独で決済 CTA を出しており、「契約」は実装されていない。

\2. その結果、指摘が名指しした 4 経路のうち「支払手段がゼロ」が実際に起きるのは mypage/reservations/\[id\] の 1 経路だけ。mypage/events/\[id\] では paymentEnabled = isFeatureEnabled("payment") = true のまま \_components/event-registration-detail.tsx:224 の Checkout CTA が描画され続けるので「ゼロ」にはならない（押すと assertOnlinePaymentAvailable が throw する、向きの逆な別の不整合になる）。

\3. src/app/(public)/reservation/status/page.tsx:147 と src/app/(public)/events/registrations/status/page.tsx:123 には元々 Checkout ボタンが存在しない（両ページとも isOnlinePaymentAvailable を import すらしていない）。この 2 経路では credentials が完全に設定済みでも payment ON である限り振込先は隠れるので、「支払手段ゼロ」は transfer-account-gate.ts:4-8 が SSoT として明文化した既存の設計判断（Checkout 主導線のため非表示）の帰結であり、credentials 欠損に因果を帰属させるのは誤り。

\4. 「運用者側は気づけない」は誤り。src/app/(admin)/admin/(dashboard)/\_components/IntegrationHealthAlert.tsx:20-24 が /admin/settings で「Stripe（決済）未設定」を /admin/settings/billing?tab=payment へのリンク付きで表示する。その判定 src/shared/domain/settings/api-key-queries.ts:418-424（secret key の DB-or-env AND stripeWebhookSecret）は loadStripeCredentials（src/shared/domain/payment/availability.ts:54-58）と同一条件なので、この状態は必ず admin に可視化される。

\5. 「2 層契約の違反」という枠付けも不正確。availability.ts:32-37 が isOnlinePaymentAvailable() を義務づけているのは「決済ボタンを出すか」と「決済に関する説明文」の 2 つで、振込先表示は transfer-account-gate.ts:4-8 が業務層基準として別個に SSoT 宣言している。明文契約の違反ではなく、2 つの SSoT の隙間（product 判断の未決事項）。

発現条件は payment ON × credentials 欠損 × active 振込口座 1 件以上 × paymentStatus ∈ {UNPAID, FAILED} の 4 条件同時成立で、しかもその状態では決済機能全体が壊れている（src/app/(public)/spaces/\[slug\] は src/shared/lib/reservation/payment-display-copy.ts:8-10 により「事前決済不要」と表示する）。予約詳細には問い合わせ導線も残る。correctness の欠陥ではなく設定不全時の UX ギャップなので low が妥当。

なお副次的に、本調査で src/shared/lib/reservation/payment-display-copy.ts:8-10 が同じ状態で「事前決済不要」という積極的に誤った copy を /spaces/\[slug\] に出すことを確認した（指摘は言及していない）。範囲外なので報告のみ。

---
