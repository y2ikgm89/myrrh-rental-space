# コードベース監査 2026-08-12 — 棄却した指摘（62 件）

> 確定 132 件 / 棄却 62 件。確定した指摘は [2026-08-12-codebase-audit-findings.md](2026-08-12-codebase-audit-findings.md)、対処の記録は [2026-08-12-codebase-audit-progress.md](2026-08-12-codebase-audit-progress.md)。未着手の台帳は無い。
> 検出エージェントが挙げたが、独立した反証エージェントが**成立しない**と判定したもの。
> **ここに再着手しないために残している。**同じ仮説を再提出する前に棄却理由を読むこと。

## R-01

**syncMethod=WEBHOOK 運用では、直前同期から 10 秒以内の GCal 変更が黙って捨てられ回収経路が無い**

<sub>[対処の記録](2026-08-12-codebase-audit-progress.md) ／ [指摘全文](2026-08-12-codebase-audit-findings.md)</sub>

- **箇所**: `src/shared/domain/reservations/reservation-calendar-inbound.ts`
- **領域**: 外部連携

### 棄却理由

引用は実在する（src/shared/domain/reservations/reservation-calendar-inbound.ts:72-78、指摘の :75 は条件式そのもの）。throttle が webhook 経路で発火しうること自体も正しい（src/app/api/webhooks/google-calendar/route.ts:191 lock → :198 syncFromCalendar → inbound:76 早期 return → :226 ack 2xx）。しかし**主張された失敗そのもの（「黙って捨てられ」「回収経路が無い」）は 2 点とも成立しない**。

(1)「捨てられる」が誤り。早期 return は inbound:76 で起き、**fetchCalendarChanges(settings.syncToken)（inbound:90）にも saveCalendarSyncToken（inbound:122）にも到達しない**。つまり googleCalendarSyncToken は一切前進しない（calendar-sync.ts:239-245 が唯一の更新経路で、これは :119 の errors.length===0 ガードの内側からしか呼ばれない）。Google の incremental sync は「そのトークン以降の全変更」を返す契約なので、予約 B の変更は Google 側の pending feed に残り、**次に syncFromCalendar が成功した時点で完全な形で配信される**。これは inbound:116-118 のコメントが守っている不変条件そのもの（「一部失敗のままトークンを進めると…永久欠落する」＝トークンを進めないことが欠落を防ぐ）であり、指摘はこの不変条件を逆に読んでいる。失われるのは反映の即時性だけで、変更は deferred であって discarded ではない。

(2)「回収経路が無い」が誤り。`triggerManualSync` が syncFromCalendar を呼ぶ第 3 の呼出元として実在する（src/app/(admin)/admin/(dashboard)/\_shared/actions/settings/google-calendar.ts:307-336 → :319 syncFromCalendar()）。これは admin 設定 UI の手動同期ボタンに配線済みで（src/app/(admin)/admin/(dashboard)/settings/\_components/sections/TwoWaySyncSection.tsx:155-181 handleManualSync → :160 triggerManualSync）、しかも syncMethod を選ぶ Select（同 :249-262、WEBHOOK は :255）と同一セクションに描画されている。(1) によりトークンが温存されているため、この 1 クリックで予約 B の変更は完全に回収される。加えて、watch 対象カレンダーへの後続の任意の変更（アプリ自身が新規予約を outbound で書き込む場合も含む）が次の push 通知を生み、10 秒経過後の sync がまとめて flush する。

結果として残るのは「WEBHOOK 単独運用で、直前同期から 10 秒以内の変更は次のトリガーまで反映が遅れる」という**有界な鮮度遅延**であり、指摘が主張する medium 級の「無言のデータ欠落・回収不能」ではない。到達可能な失敗として記述が成立しないため refuted。

---

## R-02

**繰り上げ当選の確定時に定員再チェックで負けた offer は EXPIRED になるが、次の待機者へ再昇格しない**

<sub>[対処の記録](2026-08-12-codebase-audit-progress.md) ／ [指摘全文](2026-08-12-codebase-audit-findings.md)</sub>

- **箇所**: `src/shared/domain/events/waitlist-register-commands.ts`
- **領域**: イベント（中核）

### 棄却理由

引用行 (waitlist-register-commands.ts:362) は実在し、「EXPIRED 化の直後に offerNextWaitlistEntryCommand を呼ばない」という記述自体はコードと一致する。しかし指摘は (a) 欠陥箇所を誤認し、(b) 影響を事実誤認で誇張しているため、指摘としては成立しない。

(a) 場所の誤認。:362 の分岐は `target.quantity > remaining` で発火し、その本来の（かつ支配的な）トリガは「offer 中に別の CONFIRMED が枠を消費した」= remaining \<= 0 のケースである。この状態で次の待機者を昇格させると、存在しない枠を offer することになり、その待機者も同じ再チェックで EXPIRED に落ち、待機列が連鎖的に破壊される。したがって :362 に promote が無いのは欠陥ではなく、この分岐の主要ケースにおける唯一安全な振る舞いである。指摘が示唆する修正（この行で再昇格する）は、名指しした場所においてはむしろ退行になる。

(b) 真の前提は別箇所の明示的な設計判断。remaining \> 0 のまま :362 に到達する唯一の経路は waitlist-offer-commands.ts:82-90 の quantity を見ない FIFO 選定であり、これは waitlist-register-commands.ts:457-460 に「容量 (capacity) の再チェックはしない設計（1 キャンセル = 1 offer で収支が保たれる前提）」と明記された意図的な製品判断である。しかも補償制御が実装済みで文書化されている: confirmWaitlistOfferCommand の容量再チェック → EXPIRED → fulfill-event-registration-payment.ts:126-133 の refundExpiredWaitlistOfferPaymentCommand による自動返金 → confirm.ts:129-135 の再登録案内。指摘が「損害」として挙げる「A が決済まで済ませて自動返金される」は、まさにこの設計上の想定挙動であって :362 の欠陥の帰結ではない。

(c) 影響の事実誤認。「B は永久に offer されず」「待機列が停止」は誤り（指摘自身が括弧内で自己矛盾している）。A は EXPIRED になって WAITLISTED から外れるため、B は FIFO 先頭のまま残り、次のいずれかで昇格する: registration-cancel-core.ts:207（次のキャンセル）、waitlist-offer-commands.ts:306（同 slot/ticket の別 offer の TTL 切れ）、unpaid-expiry.ts:152（未払い期限切れ）、waitlist-register-commands.ts:462（管理者手動 promote）。実害は「1 枠が一時的に待機列を飛ばして一般申込に流れうる」に留まり、金銭損失・二重予約・データ破損は無い。

(d) 前提条件が狭い。「容量 race 一般」ではなく、FIFO 先頭の quantity が当該 1 件のキャンセルで空いた席数を厳密に上回り、かつ後続に収まる quantity の待機者が居る、という特定のデータ形状を要する。設計が前提とする数量下では :362 は remaining \<= 0 でしか到達せず、その場合は昇格しないのが正しい。

---

## R-03

**管理者の手動 expire が繰上げ FIFO を止め、cron でも復旧できない**

<sub>[対処の記録](2026-08-12-codebase-audit-progress.md) ／ [指摘全文](2026-08-12-codebase-audit-findings.md)</sub>

- **箇所**: `src/shared/domain/events/waitlist-offer-commands.ts`
- **領域**: イベント（決済・繰上げ）

### 棄却理由

引用（waitlist-offer-commands.ts:186 `data: { status: RegistrationStatus.EXPIRED },`）は実在し、「expireWaitlistOfferCommand は offerNextWaitlistEntryCommand を呼ばない」「cron の候補抽出（waitlist-queries.ts:410-425）は EXPIRED を拾わない」というコード事実自体は正しい。しかし high を支えている 2 つの前提がいずれもコード上で成立しない。

(1) 「空席 1 が誰にも売られないまま当日を迎える」は誤り。公開側の在庫は CONFIRMED のみで計算される（slot-queries.ts:84 `where: { status: RegistrationStatus.CONFIRMED }`、同 :90-97 の groupBy も `status: CONFIRMED`）。WAITLISTED\_OFFERED は capacity を一切消費しないため、B が offer を保持していた 24h の間も、admin が手動 expire した後も、その 1 席は公開フォームから常に購入可能なまま。手動 expire は在庫の可用性を何も変えない。registration-cancel-core.ts:35-36 の「実質的に一枠を専有」は業務上の言い回しで、在庫計算に反映されている不変条件ではない。

(2) 「自己回復経路は別の CONFIRMED キャンセルだけ」は誤り。adminExpireWaitlistOfferAction の唯一の呼び出し元は WaitlistQueueTable.tsx:78（confirm ダイアログ付きの単票 admin ボタン）で、grep 上ほかに呼び出し元は無い。その同じテーブルは WAITLISTED 行すべてに「今すぐ繰り上げ」ボタンを描画する（WaitlistQueueTable.tsx:167-175 → adminPromoteWaitlistEntryAction → adminPromoteWaitlistEntryCommand。同 command は capacity 再チェックをしない）。getWaitlistQueue は WAITLIST\_ACTIVE\_STATUSES で C を含むため、expire 直後の router.refresh()（同 :88）で admin は C の行と promote ボタンをその場で見る。つまり「admin が意図して押した操作の後始末を、同じ画面の 1 クリックで完了できる」構図であり、silent stall ではない。

自動経路（cron waitlist-expire / 予約キャンセル / unpaid-expiry）はいずれも promote を呼んでおり壊れていない。残るのは「同じ行の『キャンセル』は promote する（registration-cancel-core.ts:203-213）が『期限切れにする』はしない」という admin UI の非対称性のみで、これは low の任意改善であって high の欠陥ではない。テストで落ちるべき性質のものでもない（振る舞いとしては現状の設計どおり）。

---

## R-04

**ゲストの決済リンクは 7 日有効だが申込自体は 60 分で消え、期限はどこにも表示されない**

<sub>[対処の記録](2026-08-12-codebase-audit-progress.md) ／ [指摘全文](2026-08-12-codebase-audit-findings.md)</sub>

- **箇所**: `src/shared/lib/tokens/event-registration-payment-token.ts`
- **領域**: イベント（決済・繰上げ）

### 棄却理由

引用そのものは実在する（src/shared/lib/tokens/event-registration-payment-token.ts:24 の `EVENT_REGISTRATION_PAYMENT_TOKEN_TTL_MS = 7 * MS_PER_DAY`）。7 日 token / 60 分 fail-safe（src/shared/domain/events/payment-expiry-constants.ts:14）という数値の非対称も事実。しかし「失敗」として主張されたシナリオは、コード上の実挙動と 4 点で食い違い、顧客が黙って取り残される経路が成立しない。

(1) 期限切れ後の再訪で「この申込はキャンセル済み等のため決済できません」が顧客に見えるという主張が誤り。src/app/(public)/events/registrations/checkout/route.ts:74-85 は DomainError を catch し、メッセージは logError に流すだけで、顧客は一律 `/events/registrations/checkout-error` へ 302 される。そのページ src/app/(public)/events/registrations/checkout-error/page.tsx:25-42 は「お支払いを開始できませんでした／リンクの有効期限切れ、既に決済済み、または一時的なエラーの可能性があります」＋問い合わせ先 mailto を明示しており、期限切れという原因と回復導線（問い合わせ）を提示している。

(2) 「期限はどこにも表示されない＝顧客は気づけない」も成立しない。CANCELLED 化と同じ cron 経路が顧客宛キャンセルメールを送る。src/shared/domain/events/unpaid-expiry.ts:185 → registration-cancellation/apply-side-effects.ts:55 → run-side-effects.ts:80 の `runCustomerEmailStep`（steps.ts:81-104）は channel によるゲートを一切持たず、system（cron）でも `sendEventRegistrationCancelled` を必ず呼ぶ。顧客は「イベント申込キャンセルのお知らせ」を受け取る（src/shared/emails/event-registration-cancelled.tsx:34-38）。

(3) cron は夜間 1 回ではなく 15 分毎（terraform/cloud\_scheduler.tf:130-133 `schedule = "*/15 * * * *"`）。したがって「23:00 に落ちて翌朝リンクを踏むまで誰も知らない」という時間構図が成りたたず、申込から 60〜75 分後にキャンセル通知が届く。

(4) payment-banner.ts:71 の引用は誤参照。src/shared/domain/events/payment-banner.ts:66-73 は `payment === "cancelled"`（Stripe の cancel\_url から戻った直後）の分岐で、この時点の申込は checkout claim 済み＝PENDING かつ updatedAt が更新済み（payment-commands.ts:191-198）なので 60 分窓は再起算されており、「既に死んだ導線を案内する」状態ではない。cron でキャンセルされた申込にこのバナーが出る経路は無い。

また token TTL 側は authorization の一次ゲートではない。verify を通っても createEventCheckoutSessionCommand が status/paymentStatus を再判定する（payment-commands.ts:126-143, 191-204）ので、7 日という値は JSDoc 通り「漏洩窓の上限」に過ぎず、これ自体が誤決済や容量二重確保を生む経路は無い。

残るのは「確認メールの決済セクション（event-registration-confirmation.tsx:176-203）に支払期限の一文が無い」という文言の欠落のみで、これは正しさの欠陥ではなくコピー/UX の改善提案。テストや gate が落ちるべき性質のものでもない。

---

## R-05

**ゲスト問い合わせが LINE の未検証 email だけで他人の Customer に付け替わる**

<sub>[対処の記録](2026-08-12-codebase-audit-progress.md) ／ [指摘全文](2026-08-12-codebase-audit-findings.md)</sub>

- **箇所**: `src/shared/domain/customers/link.ts`
- **領域**: 顧客ライフサイクル

### 棄却理由

引用は実在する（`src/shared/domain/customers/link.ts:131`）が、失敗シナリオの**起点 (step 1) が現行コードでは成立しない**。

\*\*決定的な反証: 公開 /contact のゲスト送信は `Inquiry.customerId = null` を作らない。\*\*

\- 公開フォームの Server Action `src/app/(public)/_shared/actions/inquiry.ts:119` は `createInquiryCommand` を呼ぶ唯一の経路。
\- `src/shared/domain/inquiries/commands.ts:470-473`:

```
let resolvedCustomerId = input.customerId ?? null;
if (resolvedCustomerId === null) {
resolvedCustomerId = await resolveOrCreateGuestInquiryCustomer(input);
}
```

未ログイン (`customerId === null`) のとき必ず `resolveOrCreateGuestInquiryCustomer` (commands.ts:409-453) が走り、`emailCanonical` 一致の \*\*未リンク guest Customer (`userId: null`)\*\* を findFirst / create / P2002 fallback のいずれかで解決して `Promise<string>`（非 null）を返す。解決できなければ throw する。
\- その値が `tx.inquiry.create` の `customerId: resolvedCustomerId` (commands.ts:482-494) に入る。**null になる分岐が存在しない。**

したがって victim のゲスト問い合わせは `customerId = <guest Customer id>` を持ち、`backfillGuestInquiriesForCustomer` の `where: { customerId: null }` (link.ts:130) に**一致しない**。attacker が LINE でサインインしても `updateMany` は 0 件で no-op。link.ts:113-114 と ghost-inquiry-linking.test.ts:155-202 が保証する「別 Customer に既紐付けの record は絶対に上書きしない」がそのまま効く。

**設計上の正規経路も逆で、指摘が「無防備」と言う導線は既に trusted provider で守られている。** ゲスト履歴は未リンク guest Customer に載り、会員 Customer への統合は `src/app/(public)/mypage/_shared/actions/customer-merge.ts:53-72` の `hasTrustedEmailProvider` (= `CUSTOMER_TRUSTED_PROVIDERS = ['google']`) + 確認メールトークン (`consumeCustomerMergeTokenCommand`) を要求する。`src/app/(public)/mypage/layout.tsx:118-120` も `showSelfServeMerge` を同じ SSoT で gate している。LINE 単独ではこの統合に到達できない。

**null 行が生まれる残余経路も塞がっている。**
\- `src/` 内の Inquiry 生成は commands.ts:482 の 1 箇所のみ（他は seed.ts）。`customerId: null` を書く箇所は EventRegistration 側のみで Inquiry には無い。
\- Customer の物理削除は `customer-lifecycle-commands.ts:411` の merge のみで、その直前 :375-378 で `tx.inquiry.updateMany` により customerId を target へ付け替えてから delete するので `onDelete: SetNull` で null 化しない。
\- `prisma/migrations/` に `inquiries.customer_id` を null 化するデータ移行は無い（init のみ）。

**時系列でも矛盾する。** guest customer identity の分離は 2026-06-28 (`b26381dfb`)、backfill の追加は 2026-07-21 (PR #1225 / `40aeae9dc`)。つまり backfill は「公開フォームが null を作らなくなった後」に足されている。加えて本番は 2026-08-08 に**空 DB で切替済み**なので、分離前 (2026-06-28 以前) のレガシー null 行も本番には存在しえない。

`__tests__/integration/domain/customers/ghost-inquiry-linking.test.ts:46-57` は `prisma.inquiry.create` で `customerId` を明示的に省いた行を**直接捏造**しており、production フォームが到達できない状態を fixture にしている。指摘が言う「provider を問う assertion が無い」は事実だが、そもそも対象行が生成されないため攻撃に効かない。

---

## R-06

**匿名化しても receipts.recipient\_name に実名が残り、管理画面の「宛名」に出続ける**

<sub>[対処の記録](2026-08-12-codebase-audit-progress.md) ／ [指摘全文](2026-08-12-codebase-audit-findings.md)</sub>

- **箇所**: `src/shared/domain/customers/customer-lifecycle-commands.ts`
- **領域**: 顧客ライフサイクル

### 棄却理由

引用（customer-lifecycle-commands.ts:186 の `await tx.eventRegistration.updateMany({`）は実在し、「anonymize の tx は receipts に触らない」という**事実記述だけは正しい**。しかしそれは欠陥ではなく、schema・JSDoc・product decision の三箇所で明示された**意図した設計**である。

\1) prisma/schema.prisma:1020-1024（Customer.anonymizedAt の doc comment）が直接そう宣言している: 「決済歴 (Receipt 発行済) のある Customer は物理削除できないため … Reservation / Receipt の customerId を残す。**関連の会計証跡は不変**。」— 指摘が「receipts が意図的例外だという記述は docs/ にも無い（grep 済み）」と書いているのは事実誤認で、grep の走査範囲に prisma/schema.prisma が入っていない。

\2) 対象関数自身の JSDoc 20-23 行も同文（「物理削除の代わりに PII を placeholder に置換して anonymizedAt を刻印し、Reservation / Receipt の customerId 参照を残す (**会計証跡・不変性の保全**)」）。

\3) Receipt は repo 全体で append-only の適格請求書証跡として扱われている: schema.prisma:2689-2695（issuerSnapshot 凍結）、src/shared/domain/receipts/queries.ts:102（「消費税法 57条の4 で **7 年間の保管が義務付け**」）、queries.ts:151-152・issue-core.ts:161-162（append-only につき削除に追従しない）。recipientName に長さ制約を付けていない理由まで「会計証跡を黙って切り詰めた PDF は落ちるより悪い」と schema.prisma:2761-2766 に書かれている。

\4) さらに product decision D4（memory: project\_10-issue-fix-product-decisions-2026-07-13、**再 litigate 禁止**）が、国税庁インボイス制度の必須項目として「登録番号 + 適用税率 + 税率ごと消費税額 + **宛名** 必須」を根拠に領収書 scope を確定している。recipient\_name を redact することは、7 年保存義務のある適格請求書から法定必須項目を消す行為であり、指摘が求める「修正」は**現行より悪い**。

\5) data-retention/commands.ts:311-312 も同じ均衡を明記している: 「Customer は他テーブルとの参照が多く、完全削除は attribution 破壊を招く。PII 匿名化で**個情法 22 条の目的を達成しつつ会計参照を保持する**」。個情法・GDPR とも法令上の保存義務は消去請求の例外である（GDPR 17(3)(b) 相当）。

つまり receipts は terms\_agreements と同じカテゴリ（「法的保存義務が redaction より優先する領域」）であり、anonymize-covers-pii.test.ts が Receipt fixture を作らないことは「空振りしている欠陥」ではなく、この決定と整合した状態。仮に Receipt fixture を足せば、正しい解決は redact ではなく terms\_agreements と並べて生存許可リストに載せることになる。

---

## R-07

**stale REVOKE\_PENDING の CONFIRMED 巻き戻しが「再発行待ち」予約を恒久的に stall させる（旧窓のコードが生き、新時刻では入館不能）**

<sub>[対処の記録](2026-08-12-codebase-audit-progress.md) ／ [指摘全文](2026-08-12-codebase-audit-findings.md)</sub>

- **箇所**: `src/shared/domain/smart-lock/revoke-passcode.ts`
- **領域**: スマートロック

### 棄却理由

引用は revoke-passcode.ts:561 に逐語で実在し、巻き戻し（578-588）・cron の実行順（route.ts:48-49 が processPendingSmartLockReissues より前）・countLivePasscodesForReservation\>0 による false（283）も実在する。しかし主張の核心である「巻き戻し後の CONFIRMED 行に deleteKey を再送する経路は存在しない」が事実誤認で成立しない。findRevocableSmartLockPasscodes（414-421）の `endTime < now` は **SmartLockPasscode 行の endTime**（＝予約時刻ではなく passcode 自身のバッファ付き有効期間）を見ている。この列は issue-passcode.ts:227-228 の create 時にのみ書かれ、予約変更時も含めて以後一切 update されない（src 全体で smartLockPasscode の update 系に startTime/endTime を書く箇所は 0 件）。したがって巻き戻された CONFIRMED 行は旧窓の endTime（指摘のシナリオでは 8/20 13:15）を保持しており、その時刻を過ぎた最初の cron で revokeExpiredSmartLockPasscodes → revokeOne が deleteKey を再送する。新 startTime 8/25 の 5 日前に回復するので「新しい passcode は永久に発行されず当日入館できない」は誤り。指摘は「この予約は将来かつ CONFIRMED」と書いており、予約の時刻と passcode 行の時刻を取り違えている。再送経路は他にも 3 系統ある（CONFIRMED を拾う revokeSmartLockPasscodesForReservation: edit-side-effects.ts:172 の再編集、admin.ts:499 / mutations.ts:195,225、assignment-side-effects.ts:94,111）。また「cron は無限に空振り」も誤りで、processPendingSmartLockReissues は startTime: { gt: now }（reissue-passcode.ts:131）で除外し、completePendingSmartLockReissue は開始時刻を過ぎた予約の pending フラグを clear する（reissue-passcode.ts:91-97）。残るのは「巻き戻しから旧窓終了までは再発行がブロックされる」という有界の遅延だけで、しかも実害が出るのは予約を前倒しした場合に限られ、前提として SwitchBot deleteKey が 30 分超にわたり実際に失敗し key が物理的に残っていることを要する。その状態で CONFIRMED 行を残したまま新規発行しないのは @@unique(\[reservationId, deviceId\]) 下ではむしろ正しい。巻き戻しを行わなければ行は REVOKE\_PENDING に留まり、findRevocableSmartLockPasscodes は REVOKE\_PENDING を明示的に除外するため再試行は永久に起きない — つまりこの巻き戻しは stall の原因ではなく再試行を開ける仕組みである。

---

## R-08

**deleteKey webhook の keyName が不一致でも「device 上に REVOKE\_PENDING が 1 件」heuristic に落ち、無関係な鍵の削除で生きた passcode を REVOKED に焼く**

<sub>[対処の記録](2026-08-12-codebase-audit-progress.md) ／ [指摘全文](2026-08-12-codebase-audit-findings.md)</sub>

- **箇所**: `src/shared/domain/smart-lock/webhook-commands.ts`
- **領域**: スマートロック

### 棄却理由

引用（webhook-commands.ts:106 `if (pendingOnDevice.length === 1) {`）は実在し、「keyName 分岐（80-97行）が不一致時に return null せず 99-108 行の単一候補 heuristic へ落ちる」という**構造の記述だけは正しい**。しかし「high 深刻度の欠陥」としての主張は、以下 4 点で成立しない。

(1) **意図された設計であり、実装の見落としではない。** 設計 SSoT である docs/superpowers/specs/2026-07-24-switchbot-official-clean-redesign.md:242 が相関優先順を 3 段で明記している —「switchbotDeleteCommandId === commandId → なければ buildPasscodeName と context.keyName → なければ device の REVOKE\_PENDING 行が 1 件ならそれ」。実装はこの 3 段そのもの。しかも同じ誤帰属リスクは **keyName が最初から無い場合に全く同一に発生し**、それは \_\_tests\_\_/unit/domain/smart-lock/webhook-commands.test.ts:390『device 上 REVOKE\_PENDING が 1 件だけなら commandId 無しでも相関』として**意図された振る舞いとして固定されている**。つまり指摘が名指しする「keyName 不一致」は load-bearing な条件ではなく、既知・文書化済みの tier-3 heuristic の一事例にすぎない。

(2) **シナリオの起点をコード上で示せない。** シナリオは「SwitchBot アプリからの手動削除が deleteKey / result="success" / keyName 付きの changeReport として届く」ことに全面依存するが、route.ts:84-90 の parseChangeReport は `eventName` が string かつ `result` が success|failed|timeout の**いずれかであることを必須**とし、満たさない payload は route.ts:100 で null → 154 行に到達しない。`result` はクラウド API コマンドの応答通知フィールドであり、アプリ内手動操作がこの形で届くことはコードからも repo 内の資料からも確認できない。前提が外部 API の挙動の推測であり、到達経路が閉じていない。

(3) **「生きた passcode を焼く」には第 2 の障害が別途必要。** revokeOne（revoke-passcode.ts:174-213）は deleteKey API が ok の場合のみ REVOKE\_PENDING にする。誤帰属で REVOKED になっても、予約 A 自身の deleteKey が物理的に成功すれば鍵は消え結果は正しい（後着の自 webhook は REVOKE\_PENDING 行が無く 123 行で false 返却の no-op）。実害が出るのは「予約 A の deleteKey が failed/timeout で返る」という**独立した失敗が重なった場合だけ**で、単一の欠陥ではなく複合レースである。

(4) **主張された被害の中核が事実誤認**（correctionNote 参照）。物理 orphan は device 側で自動失効する。

以上より、指摘が主張する high 深刻度の失敗シナリオは再現経路を最後まで指し示せない。残るのは「keyName が渡され不一致なら tier-3 を抑止すべき（return null）」という設計上の hardening 余地であり、これは low 相当の任意改善。

---

## R-09

**createKey の HTTP 応答喪失（transport 失敗）を確定的失敗として FAILED に倒し、実機に生成された鍵が二度と失効されない**

<sub>[対処の記録](2026-08-12-codebase-audit-progress.md) ／ [指摘全文](2026-08-12-codebase-audit-findings.md)</sub>

- **箇所**: `src/shared/domain/smart-lock/issue-passcode.ts`
- **領域**: スマートロック

### 棄却理由

引用（issue-passcode.ts:253 `if (!createResult.ok) {`）は実在し、transport 失敗が switchbot-client.ts:109-115 の catch で `statusCode: 0` の ok:false になり API 明示拒否と区別されないこと、および FAILED 行を Device List と突合する経路が無いことは事実。しかし指摘が主張する「失敗の結果」が成立しない。

決定的な反証は createKey が \*\*必ず `type: "timeLimit"` + `endTime` 付き\*\*で発行される点（issue-passcode.ts:247-250: `type: "timeLimit"`, `startTime: Math.floor(bufferedStart...)`, `endTime: Math.floor(bufferedEnd.getTime()/1000)`）。SwitchBot の timeLimit passcode は endTime で無効化され、クライアント側の型もそれを表現している（switchbot-client.ts:128 `status: "normal" | "expired"`）。したがって:

(1)「この鍵は予約終了後も永久に生きる」は成立しない。orphan 鍵の有効期限は bufferedEnd（= 予約終了 + buffer）で、正規に発行されていた鍵と同一の窓しか持たない。
(2)「顧客が実際に使っていたコードが利用終了後も開き続ける」は自己矛盾。生き残る新鍵も timeLimit で、その endTime がまさに「利用終了 + buffer」であり、利用終了後に開けることはない。

さらに orphan の 6 桁は誰にも渡らない。ok:false の枝は issue-passcode.ts:275 で null を返し、issueSmartLockPasscodes は line 449 で `{passcodes: [], issuanceFailed: true}` を返すため、顧客メールには代替入室案内が載るだけでコードは載らない。開示クエリ側も CONFIRMED 行しか可視化しない（customer-passcode-queries.ts:203, 216 — PENDING は "pending"、それ以外は "unavailable"）。つまり「実機に残るが誰も知らない、予約窓で自動失効する鍵」であり、不正入室経路は生まれない。

同名 2 本の連鎖はコード上で指せない前提を 2 つ含む。(a) SwitchBot が同一デバイスへ同一 name の createKey を重複受理すること、(b) 返る keyList の順序が古い orphan を先頭に置き `.find()`（switchbot-client.ts:240）がそれを掴むこと。どちらもリポジトリ内に根拠が無く、断定されているだけ。(a) が偽なら 2 回目の createKey も失敗して再び FAILED になり誤 keyId 記録は起きず、(b) が偽なら正しい新鍵を掴む。指摘の被害は 4 つの連言（transport 失効後の実機成功 / 再発行の発生 / 重複 name 受理 / keyList 順序）に依存し、かつ最終的な害は timeLimit で打ち消される。

---

## R-10

**解錠番号の開示予算 3 回/時間を pending 応答も消費するため、UI が案内する「再表示」を押した顧客が扉の前で締め出される**

<sub>[対処の記録](2026-08-12-codebase-audit-progress.md) ／ [指摘全文](2026-08-12-codebase-audit-findings.md)</sub>

- **箇所**: `src/app/(public)/_shared/actions/reveal-reservation-passcodes.ts`
- **領域**: スマートロック

### 棄却理由

指摘の「順序」だけは正しいが、主張された失敗（顧客が扉の前で締め出される / 番号を得る手段が無い / high）は成立しない。

\1) 引用は実在。reveal-reservation-passcodes.ts:179 の passcodeRevealByReservationRateLimiter.check は :188 の getCustomerVisibleSmartLockPasscodesForReservation より前で、pending / outside\_window / unavailable も 1 回分を消費する。rate-limit.ts:399-402 は 3req/1h の固定窓、キーは reservationId、成功時 reset も無し（reset の呼び出しは unit test だけ）。UI の 再表示 も同じ action を叩く（passcode-reveal.tsx:109-122）。ここまでは事実。

\2) しかし「顧客が番号を得る手段はこの action だけ」は、指摘が名指しした trigger（webhook 到着遅れ）においてまさに誤り。webhook 遅延で PENDING が残るのは issueForDevice の 45 秒 Device List poll がタイムアウトした枝（issue-passcode.ts:311-338）で、この枝は null を返し issueSmartLockPasscodes が issuanceFailed: true を返す（:449）。confirmation-side-effects.ts:86-88 がそれを smartLockIssuanceFailed: true として確認メールに載せ、email/types.ts:208-219 の fallback（当日運営までお問い合わせください + 連絡先）が描画される。さらに issue-passcode.ts:333-337 が SMART\_LOCK\_PASSCODE\_FAILED で admin を叩き起こしている。「購入済みの顧客が最大 1 時間スペースに入れない」は成立しない。

3)「扉の前」というタイミングも支えが無い。発行は予約確定時（confirmation-side-effects.ts:59-70）であって開始直前ではない。加えて PENDING の寿命は最大 30 分で、expireStalePendingSmartLockPasscodes（revoke-passcode.ts:475-537、api/cron/smart-lock-cleanup 経由）が FAILED に倒す。FAILED 後は customer-passcode-queries.ts:206-216 が unavailable を返し、passcode-reveal.tsx:32-34 / 105-107 がコンポーネントごと null を返すので 再表示 ボタン自体が消える（それ以上予算を食えない）。

\4) さらに、通常の事前予約ではその post-booking の pending 窓で開示が通っても customer-passcode-queries.ts:230-240 により outside\_window で、失う平文がそもそも無い。予算が尽きても 1 時間の固定窓は来店の何日も前にリセットされる。締め出しが実際に噛むのは「開始 -buffer 〜 終了 +buffer の表示窓」と「3 回押した固定 1 時間」が重なる場合、すなわち開始 1 時間以内の駆け込み予約、または開始直前の予約変更 / admin のデバイス再割当で PENDING が再生成された場合に限られる。指摘はこれを通常導線として提示している。

既存カバレッジの申告（pending 消費を検査したテストが無い / E2E に上限到達導線が無い）は正確で、ここは実際に無検査。だがそれが示すのは「狭い窓の UX の粗さが未検査」であって、high の締め出し欠陥ではない。

---

## R-11

**送信者表示名がRFC 5322のquoteなしでFromヘッダに埋め込まれ、「Co., Ltd.」等で全メール送信が停止する**

<sub>[対処の記録](2026-08-12-codebase-audit-progress.md) ／ [指摘全文](2026-08-12-codebase-audit-findings.md)</sub>

- **箇所**: `src/shared/lib/email/client.ts`
- **領域**: 設定

### 棄却理由

引用行は実在し（src/shared/lib/email/client.ts:69 `return `${name} \<${email}\>`;`）、senderName に文字種検証が無いのも事実。だが指摘が「high / 全メール送信が停止」と断定する決定的な一歩は、このリポジトリのコードでは一切示せない外部 API の挙動である。

コード上で追跡できたのは以下まで:
\- 入力検証: form-schemas-email-notification.ts:28 `senderName: optionalText(100)` → form-schema-helpers.ts の `z.string().trim().max(100).optional()`。文字種制限なし（指摘どおり）。
\- 正規化: commands/organization.ts:73-75 `normalizeNullableString` は `value || null` のみで無害化しない。
\- 永続化: prisma/schema.prisma:1843 `senderName String? @db.Text`（CHECK 制約なし）。
\- 組み立て: client.ts:68-69。`serverEnv.EMAIL_FROM_NAME` は terraform/infra/.github のどこにも設定されていないため、本番で DB 値が実際に到達する。
\- SDK 境界: schemas.ts の `CreateEmailOptionsSchema` は `z.custom<T>(isRecord)` で from を見ない。node\_modules/resend の SDK にも from の検証コードは存在せず、文字列は素通りする。

**ここでコード追跡は終わる。**「Resend が 422 validation\_error を返す」以降は全て外部サービスの挙動で、リポジトリ内にそれを裏付ける証拠（テスト・記録・エラーログ・ドキュメント）は 1 つも無い。判定基準「失敗シナリオを再現する経路をコード上で具体的に指し示せない場合は refuted」に該当する。

さらに、指摘の前提「RFC 5322 非適合 → Resend が拒否」は、この製品の実態と整合しない。本プロダクトの一次ロケールは日本語で、現実の表示名（seed 値やprisma/seed.ts:420 の "Myrrh Rental Space"、実運用なら「株式会社〜」等）は非 ASCII を含みうる。生の非 ASCII display-name も RFC 2047 エンコード無しでは RFC 5322 非適合だが、本番稼働している以上 Resend は display-name を自前で寛容にパースして符号化している。つまり「RFC 5322 適合性」は Resend の受理判定則ではなく、指摘は実際の判定則について何の証拠も出していない。

加えて、失敗が起きたとしてもそれは「管理者が specials を含む文字列を打ち込んだ場合に限る条件付き潜在事象」であり、出荷時の構成に存在する欠陥ではない。

---

## R-12

**Resend 未設定・障害時にメール設定フォーム全体が保存不能になり、通知先スタッフ／宛先の変更ができない**

<sub>[対処の記録](2026-08-12-codebase-audit-progress.md) ／ [指摘全文](2026-08-12-codebase-audit-findings.md)</sub>

- **箇所**: `src/app/(admin)/admin/(dashboard)/_shared/actions/settings/email.ts`
- **領域**: 設定

### 棄却理由

引用は実在し（email.ts:86）、throw 到達自体は原理的に可能だが、指摘の申告した再現手順は当該行に到達せず、影響の主張も成立しない。(1) 「新規デプロイ直後で Resend 未設定」では別の throw に落ちる。本番 seed は senderEmail: null（prisma/seed.ts:416）なので、env EMAIL\_FROM が無ければ resolveSenderEmailAddress が client.ts:47 で throw し email.ts:74-79 の catch が「送信元アドレスが未設定です」を返す。86 行は評価されない。86 行の resend\_unavailable に至るには解決可能な sender が必要で、DB senderEmail の唯一の writer は commands/organization.ts:154（＝この検証を過去に通過済み＝当時 Resend が機能していた）なので、実質 env EMAIL\_FROM 設定済み＋Resend キー未設定という限定状態でしか起きない。(2) 「送信元ドメインと無関係な項目」が止まる、という被害の中核が誤り。emailFormSchema の全項目はメール配信設定であり、resend\_unavailable の状態では isEmailTransportEnabled が false のため sendEmail が {ok:false, reason:"disabled"} を返す（email-render-context.ts:88-92）。通知先を編集できなくても、その状態では誰にも通知メールは届かない。Resend を設定した瞬間にフォームのブロックも解ける。(3) 「管理者には無関係に見える」も誤り。notifications/page.tsx:92 が !emailEnabled のときフォーム直上に EmailDeliveryDisabledBanner を出し /admin/settings/integrations?tab=resend を名指ししている。action 側のメッセージも同じ導線を示し、admin-action.ts:157-162 → isMutationError → conform-action.ts:106 → EmailSection.tsx:426-434 で実際に描画される（無言ではない）。email.ts:60-68 の JSDoc が示す通りこれは意図された fail-closed 設計であり、残るのは resend\_error（キーは有効だが domains.list() が一時的に失敗）時に未変更の sender を再検証して保存が一時的に止まる点だけで、これは一過性・管理者限定・メッセージ自明・リトライで解消する。

---

## R-13

**Google Calendar からの時間変更でクーポンが落ちると、couponId は null にされるのに Coupon.usageCount が戻されず永久に leak する**

<sub>[対処の記録](2026-08-12-codebase-audit-progress.md) ／ [指摘全文](2026-08-12-codebase-audit-findings.md)</sub>

- **箇所**: `src/shared/domain/reservations/calendar-sync-inbound-mutations.ts`
- **領域**: 金額計算・クーポン

### 棄却理由

引用は実在し（calendar-sync-inbound-mutations.ts:311）、経路も到達可能（inbound は PAID/PENDING のみ拒否し UNPAID は通す）。だが「この GCal 経路にだけ decrement が欠けている omission」という finding の中核前提が誤り。同一形状が customer-commands.ts:600-602 に存在し、しかも「usage は作成時に claim 済みのためここでは増減しないが、参照と割引額は pricing SSoT に揃える」という明示コメント付きで**意図された方針として文書化**されている。couponForCalc の endTime 基準判定（customer-commands.ts:517-531）も GCal 側（254-268）と 1 行単位で同一のコピーであり、GCal 経路はこの既存規約を忠実に踏襲しているだけで、抜け落ちた分岐ではない。加えて finding が根拠にする 2 つの類推が両方とも成立しない: (1) lifecycle-commands Finding #4 は「キャンセル（終端遷移）で usage を戻さない」欠陥であり、この repo は cancel 系全経路（cancel-core.ts:155, lifecycle-commands.ts:142/453, pending-expiry.ts:131, series-commands.ts:408、さらに同一ファイル内の cancelReservationFromCalendar:106-111）で decrement している。「編集でクーポン参照が落ちる」は別クラスの事象で、どの編集経路も decrement しない。(2) admin-commands.ts:583-596 は「admin が couponCode を明示的に入れ替えた（couponChanged かつ newCouponId は validateCoupon 由来）」ときにだけ走る旧 decrement + 新 claim の対称処理であり、「参照が落ちたら usage を戻す」という一般則ではない。よって「テスト・型・制約が防いでいないから欠陥」ではなく、現行の意図された振る舞いであり、high は成立しない。

---

## R-14

**領収書の再発行が発行日と連番の年を「今日」に付け替える（ゲスト再送信で常時発火）**

<sub>[対処の記録](2026-08-12-codebase-audit-progress.md) ／ [指摘全文](2026-08-12-codebase-audit-findings.md)</sub>

- **箇所**: `src/shared/domain/receipts/issue.ts`
- **領域**: 領収書・PDF

### 棄却理由

引用行 `const serialNo = await claimNextSerialNo(tx);` は issue.ts:225 に実在し、到達経路（/receipts/reissue-request → resend.ts:157 → reissueReceiptCommand → issuedAt 未指定の tx.receipt.create → schema.prisma の @default(now())）も コード上そのとおりで、事実関係の骨格は正しい。しかし「欠陥」ではなく **設計どおりの仕様**であるため refuted=true と判定する。

(1) reissueReceiptCommand は「元 Receipt の複製」ではなく「訂正版を今この時点で新規発行する」コマンドとして明示的に設計されている。同一関数内で issuerSnapshot を **敢えて再取得**している（issue.ts:226 + resend.ts:29「発行時点 Settings で issuerSnapshot 再取得」）。発行時点の Settings を新しく読むと決めておきながら発行日だけ過去に固定する方が、むしろ内部矛盾になる。schema.prisma の Receipt コメントも「新 serialNo を採番し、元 Receipt の reservationId/eventRegistrationId を NULL 化。元 Receipt は監査証跡として残り、chain (reissuedTo) 経由で辿れる」と同じ意味論を宣言している。

(2) 交付物の位置づけも「今日発行された代替文書」として顧客に明示されている。receipt-resend.tsx:56/64-66 は「領収書を再発行しました」「お申し出により、領収書を**訂正版として**再発行しました。旧領収書（番号: \<previousSerialNo\>）に代わり本領収書をご利用ください」と印字する。PDF が持つのは 発行日（issue date）というラベルであって 取引年月日 ではないので、訂正版の発行日が再発行日であることは意味論上むしろ正しい。

(3) 指摘が harm の根拠にしている「PDF に取引年月日欄が無い」は receipt-document.tsx のテンプレート設計の性質で、初回発行の領収書にも等しく当てはまる。issue.ts:225 の claimNextSerialNo が引き起こしたものではなく、指摘の anchor 行が harm の原因箇所と一致していない。

(4) 暗黙に要求している修正（issuedAt を引き継ぐ）が正しいとは限らず、むしろ悪化しうる。serialNo は年単位シーケンス（serial.ts:81-106、receipt\_sequences の PK が year、highestIssuedNo は serial\_no の `YYYY-` prefix を parse）なので、issuedAt=2026-12-20 のまま `2027-000001` を振ると番号年と発行年の対応が崩れる。逆に 2026 年の番号を 2027 年 1 月に新規発行すれば、締めた会計年度に新しい番号を差し込むことになる。どちらが正かを定める DB 制約・gate・ADR はリポジトリに存在せず（invariants.sql:97-102 の receipts 制約は金額・税率・snapshot・target 排他のみ）、これは会計運用ポリシーの意思決定であってコード欠陥ではない。

以上より、コード上の contract 違反を指し示せていない。判定基準「迷ったら refuted=true」にも該当する。

---

## R-15

**発行事業者が未設定のまま領収書が発行され、発行者名も登録番号も無い適格請求書が永久に凍結される**

<sub>[対処の記録](2026-08-12-codebase-audit-progress.md) ／ [指摘全文](2026-08-12-codebase-audit-findings.md)</sub>

- **箇所**: `src/shared/domain/receipts/issuer-snapshot.ts`
- **領域**: 領収書・PDF

### 棄却理由

引用行は実在し（issuer-snapshot.ts:25）、「fetchIssuerSnapshot は行の不在も NULL も検証しない」という機械的事実だけは正しい。しかし指摘の深刻度を支えている 3 本の柱が、いずれもコード上で反証される。

(1) 「Receipt を後から更新する経路は存在しない／永久に凍結／救済が無い」は誤り。`reissueReceiptCommand`（src/shared/domain/receipts/issue.ts:146-260）が訂正発行の正規経路として存在し、\*\*その 226 行目で `fetchIssuerSnapshot(tx)` を再実行して発行時点の Settings を再取得する\*\*。しかも dead code ではなく完全に配線済みで、admin server action 2 本（reservation/receipt.ts:26 と event-registration-receipt.ts:33）から呼ばれ、UI は ReceiptDetailView.tsx:84-90 / ReservationDetail.tsx:337 / ReissueReceiptDialog / ReceiptReissueDialog として存在する。revision+1・reissuedFromId chain・reissuedReason・AuditLog 付き。指摘自身がこれを認識しながら「finding 1 により日付と番号が書き換わる」として棄却しているが、訂正版の適格請求書が新しい番号と交付日を持つのは訂正インボイスの正しい形であって欠陥ではない。指摘は別 finding への循環参照で救済経路を消している。

(2) 「発行者情報が空でも通ること」は見落としではなく、3 箇所で明文化された製品判断。form-schemas-brand-contact.ts:95-99「事業者情報は全項目が任意（個人事業主は法人番号・インボイス登録番号を持たない等）」、prisma/seed.ts:378-384「DB は全列 nullable（NOT NULL 制約なし）で、admin フォームも空欄保存を公式に許容する」、render-receipt-pdf.tsx:19-22「snapshot に想定 field が欠けている場合は null にフォールバックし、PDF 側で該当行を省略表示する」。指摘が「既存カバレッジが欠損を許す側を意図的に固定している」と述べている通りで、それは gate の欠落ではなく仕様の固定。

(3) 提案されている不変条件（invoiceNumber 未設定なら発行を落とす）は、そのままでは**誤り**。免税事業者・未登録の個人事業主は適格請求書発行事業者登録番号を持たず、印字してはならない。issue-core.ts:179-184 の税率ガードと対称にしろという主張は成立しない — 税率は「取引に必ず存在し推測が証跡を汚す値」だが、登録番号は「正当に存在しないことがある値」で、性質が違う。null を落とす代わりに発行を止めれば、免税事業者の運用が丸ごと壊れる。

(4) narrowIssuerSnapshot は object でない snapshot に対しては DomainError を throw する（render-receipt-pdf.tsx:63-68）。凍結される値は常に object なのでここは通るが、「一切の検証が無い」という描写は不正確。

残る実体は「本番切替直後、管理者が事業者情報を入力し終える前に決済が成立すると、その 1 件の PDF の発行者名欄が空になる（訂正再発行で回復可能）」という運用ウィンドウの話で、コード欠陥ではなく設定完了前の状態。high ではない。

---

## R-16

**ゴミ箱に入れたイベントの領収書 orphan を backfill が永久に見捨て、purge が入金済み申込ごと物理削除する**

<sub>[対処の記録](2026-08-12-codebase-audit-progress.md) ／ [指摘全文](2026-08-12-codebase-audit-findings.md)</sub>

- **箇所**: `src/shared/domain/receipts/backfill.ts`
- **領域**: 領収書・PDF

### 棄却理由

引用行は実在する（backfill.ts:108 の `event: { deletedAt: null },`）が、深刻度を担っている後半（「purge が入金済み申込ごと物理削除する」）は**到達不能なコード**であり、前半（backfill の除外）は指摘が「欠陥」と呼ぶ行を誤って名指ししている上、提案どおり直すと状況が悪化する。

【1】permanentlyDeleteEventCommand は src/ から一切呼ばれていない（dead code）。
`grep -rn "permanentlyDelete" src` の結果は faq / posts / pages / terms のみで、Event 用の呼び出しは 0 件。src/app/(admin)/admin/(dashboard)/\_shared/actions/event.ts が import しているのは `deleteEventCommand`（:17, :240）だけで、purge も restore も import していない。events 配下に trash ルートも存在しない（trash UI があるのは faq / posts / terms の 3 つのみ: `find "src/app/(admin)" -iname "*trash*"`）。cron も event の trash cleanup は無い（`src/app/api/cron/` に存在するのは blog-trash-cleanup と faq-trash-cleanup のみ）。`permanentlyDeleteEventCommand` / `restoreEventCommand` への参照は `__tests__/integration/events/trash-restore-purge.test.ts` だけで、e2e/ にも scripts/ にも無い。さらに src/ 全体で Event の物理削除は `commands.ts:737` の `tx.event.deleteMany`（= purge 関数の中身）1 箇所のみ。したがって「管理者がゴミ箱から完全に削除する」という手順にエントリポイントが存在せず、「顧客の申込レコードが DB から消える」という結果は本番で発生しえない。

【2】残る前半も、指摘の行は判断が置かれている場所ではない。
`resolveEventRegistrationIssue`（src/shared/domain/receipts/issue-core.ts:131-132）が発行トランザクション内で**同じ絞り込み** `where: { id: registrationId, event: { deletedAt: null } }` を持ち、外れれば `DomainError("イベント申込が見つかりません", "NOT_FOUND")` を投げる（issue-core.ts:150-151）。`NOT_FOUND` は `"VALIDATION"` ではないので backfill.ts:127 の判定を外れ、else 側（:129-139）で `errorEventRegistrations++` と `logError(DATABASE / MEDIUM)` になる。つまり backfill.ts:108 だけを外しても領収書は 1 通も発行されず、該当行ごとに**毎時 DATABASE エラーログが永久に出続ける**だけになる。:108 は issue 側 guard と意図的に整合させた選定フィルタであり、単独では欠陥ではない。

【3】「恒久的に失う」も過大。論理削除下でも EventRegistration 行（paidAmount / stripePaymentIntentId）は残り、Receipt / Refund は EventRegistration を Restrict で参照しているため物理削除は FK でも止まる。到達可能な破壊経路が無い以上、実害は「管理者が論理削除したイベントの申込について自動発行が再開されない」に留まり、`deletedAt` を戻せば復旧する。

【4】成立条件が複合的で極めて狭い。fulfill-event-registration-payment.ts:152 の `claimEventRegistrationAsPaid` 成功と :176 の `issueReceiptForEventRegistration` の間にだけ落ちる一過性 DB 障害があり、**かつ**次回 cron（terraform/cloud\_scheduler.tf:137 `15 * * * *`）までの最大 60 分以内に管理者がそのイベントを論理削除する、という同時成立が要る。

---

## R-17

**sitemap が /spaces と /events を「一覧ページ非公開」でも emit し続ける（404 を Google に提出）**

<sub>[対処の記録](2026-08-12-codebase-audit-progress.md) ／ [指摘全文](2026-08-12-codebase-audit-findings.md)</sub>

- **箇所**: `src/app/sitemap.ts`
- **領域**: 公開面の露出

### 棄却理由

引用は実在する（src/app/sitemap.ts:168 と :188 が `enabled.has(...)` と `maxUpdatedAt` だけを見て `publishedCollectionPageSlugs` を参照しないのは事実）。しかし主張する失敗シナリオの起点である「管理画面で Page.slug="spaces" / "events" の公開トグルを OFF にする」が**製品コード上のどの経路からも到達不能**であり、`Page{slug:"spaces"|"events"}.isPublished = false` という状態自体が発生しない。

到達不能の根拠は独立した 4 層:

\1. **ドメイン層の early guard（決定打）** — `src/shared/domain/pages/commands.ts:213-222` の `updatePagePublishedCommand` は本体の先頭で `if (isSystemPageSlug(slug)) throw new DomainError("システムページは公開状態を変更できません", "VALIDATION")` を実行し、`prisma.page.update` に到達しない。`isSystemPageSlug` は `src/shared/lib/validations/page.ts:81-83` → `SYSTEM_PAGE_SLUGS`（同 33-67 行）で、"spaces"(39行) と "events"(56行) を**含む**。指摘が「正しい」とする news/blog も同じく含まれる。一括経路 `bulkUpdatePagePublishedCommand`（同 245 行）もシステムページ slug を `filter` で除外する。つまり Server Action を直接叩いても状態は作れない。

\2. **UI 層（トグル自体が存在しない）** — `PageListTable.tsx:149-158` はシステムページ行に読み取り専用の `PageStatusBadge` を描き、`PublishSwitch` を描かない。`PageActions.tsx:104` は `{!isSystemPage && ...}` で「非公開にする」メニュー項目を出さない。`pages/[slug]/edit/page.tsx:80-82` も `{!page.isSystem && <PublishToggle .../>}`。指摘が到達経路の起点に挙げた `PublishToggle.tsx` は、システムページではそもそもレンダーされない。

\3. **書き込み地点の全数確認** — `Page.isPublished` を false にする DML は commands.ts:179（`deletePageCommand`／169 行でシステムページを throw）と commands.ts:286（`bulkDeletePagesCommand`／274 行で filter）のみ。他の Page 書き込み（`ensureSystemPageCommand` 107 行、`createPageIfNotExistsCommand` 82 行、`bootstrapSystemPagesCommand` system-pages-commands.ts:119）はすべて `isPublished: true` で作成し、`updatePageSeoCommand`（commands.ts:302-312）は `isPublished` に触れない。

\4. **カスタムページによる乗っ取りも不可** — "spaces"/"events" は `src/shared/domain/slugs/validation.ts:44-74` の `RESERVED_PATHS` に含まれ（60行/57行）、`createPageCommand` は `ensurePageSlugAvailable` → `checkSlugAvailability` で弾く。加えて bootstrap 済みの行と slug が unique 衝突する。

結果として、`/spaces` の `requireSystemPagePublished("spaces")`（spaces/page.tsx:35）は `isPublicPageUnpublished` が「行が存在し isPublished=false」でのみ true を返す（queries.ts:108）ため、システムページでは**常に false**。公開面は 200 OK・indexable で正常にレンダーされ、sitemap の emit と一致する。Search Console に 404/soft-404 が立つ経路が存在しない。

副次的に、指摘が「正しい実装」として対比した news/blog 側の `publishedCollectionPageSlugs.has(...)` チェック（sitemap.ts:176/184）も、同じ理由で製品経路からは常に true。すなわち存在するのは「DB 直接改変に対する防御の非対称性」という装飾的な差であって、指摘が主張する動作差ではない。

---

## R-18

**非公開 Location の住所・座標・アクセス情報が、公開スペース経由で公開面に出る**

<sub>[対処の記録](2026-08-12-codebase-audit-progress.md) ／ [指摘全文](2026-08-12-codebase-audit-findings.md)</sub>

- **箇所**: `src/shared/domain/spaces/public-queries.ts`
- **領域**: 公開面の露出

### 棄却理由

引用は実在し（public-queries.ts:39 / 72 / 509-519）、記述された挙動そのものも実際に起きる。しかし指摘が前提にしている不変条件「Location.isPublished=false なら住所・座標は公開面に一切出てはならない」がこのコードベースには存在せず、むしろ逆が意図として明文化されている。(1) スペース編集の拠点セレクタは getActiveLocationsForSelect（src/shared/domain/locations/queries.ts:220-233）を使い、その JSDoc が「スペース編集で紐づけ可能な拠点（公開前の建物も含む）」と明記している。つまり未公開拠点へのスペース紐づけは仕様であり、ensureAssignableLocation（src/shared/domain/spaces/commands.ts:141-152）が isPublished を見ないのは漏れではなく設計の一貫。(2) getSpaceBySlug が location の address/latitude/longitude/accessLines/parkingInfo を select して AccessMap を描くことは public-queries.ts:463-475 の JSDoc がレビュー経緯（Codex PR #1041 P2）つきで意図として文書化している。(3) 公開面に出す/出さないを決めているのは Space.isPublished であり、管理者が明示的に「このスペースを公開する」操作をした帰結。予約可能なスペースの詳細ページが所在地と地図を出さないことは機能的に成立しない。(4) Location.isPublished の利用者向け意味は管理 UI（locations/\[id\]/\_components/LocationDetail.tsx:61-63、location-form/LocationBasicTab.tsx:563-565）で「この場所は公開ページに表示されます/されません」＝拠点自体が一覧に載るかであり、住所の秘匿フラグとして定義されていない。(5) 露出データは運営者自身の商用物件住所で、テナント越え・PII・認可バイパスのいずれでもなく public-exposure/medium の枠組みが当たらない。指摘は「存在しない不変条件を立て、それを満たさないコードを見つけた」形になっている。

---

## R-19

**在庫を解放する fail-safe cron が events だけ feature gate されている（pending-reservation-expire は明示的に非 gate）**

<sub>[対処の記録](2026-08-12-codebase-audit-progress.md) ／ [指摘全文](2026-08-12-codebase-audit-findings.md)</sub>

- **箇所**: `src/app/api/cron/unpaid-event-registration-expire/route.ts`
- **領域**: feature フラグ

### 棄却理由

引用は実在する（route.ts:35、waitlist-expire route.ts:54、pending-reservation-expire JSDoc 28-29 行も原文どおり）。しかし主張する失敗シナリオが到達不能で、さらに「gate を外すべき」という結論が逆に害を生む。

【1】害(a)「座席を握り続ける」は到達不能。events OFF の間、座席を消費できる経路が 1 つも開いていない。公開面は `requireFeatureEnabled("events")` が 16 箇所（/events、/events/\[slug\] の event-detail-feature-gate.tsx:16、/events/registrations/checkout route.ts:31、/events/waitlist/checkout route.ts:72 等）で 404 になる。**管理画面も同様に閉じている** — walk-in 登録 `src/app/(admin)/admin/(dashboard)/_shared/actions/event-registration.ts:320` と代行登録 :382 がどちらも `assertAdminFeatureCreateAllowed("events")` を呼び、DomainError("FORBIDDEN") を投げる。DB の `event_registrations_capacity_check` CONSTRAINT TRIGGER (invariants.sql:655) も event\_registrations への INSERT/UPDATE でしか発火せず、まさにその gate 済み経路のことである。つまり解放されない座席が阻害する相手が存在しない。指摘者自身が認めるとおり `staleRegistrationCandidateWhere` (unpaid-expiry.ts:36-59) のカットオフには下限が無く（`lt: cutoff` のみ）、ON に戻した瞬間に全件追いつく。

【2】害(b) は gate が**防いでいる**害であって、gate が**起こしている**害ではない。gate を外すと `expireStaleUnpaidEventRegistrationsCommand` は unpaid-expiry.ts:152 で `offerNextWaitlistEntryCommand` を呼び、:185 の `applyEventRegistrationCancellationSideEffects({promoted})` が steps.ts:245-268 経由で「繰り上げ当選しました、決済してください」メールを送る。そのリンク先 `/events/waitlist/checkout` は route.ts:72 の `requireFeatureEnabled("events")` で 404。waitlist-expire も同型（route.ts:145 `sendEventWaitlistOffered` + paymentContext）。結果、繰り上げ当選者は 24h TTL を死んだリンクを見ながら消費し、次の FIFO も同じ死んだ offer を受け取る。現状の「OFF 中は昇格させない → ON 復帰後に生きたリンクで昇格」は、gate を外した場合より厳密に安全。

【3】これは見落としではなく明示的な設計判断で、SSoT に記録済み。registry.ts:97-102 が events の cronPaths に両 cron を明示列挙し、registry.ts:85-87 が reservation 側の除外理由をコメントで宣言している。registry.test.ts:176-190 の双方向 drift gate と cron-unpaid-event-registration-expire.test.ts:113 がこの挙動を固定する。指摘は「gate が製品意図を判定しない」と言うが、それは gate の欠陥ではない — 判断は registry のコメントという人目に触れる場所に置かれている（CLAUDE.md の「免除の入口を増やさない」方針と整合）。

【4】前提の運用モードが架空。「events OFF でも admin のチェックイン等は動き続ける」は指摘者の創作で、実際の OFF 契約は管理側の作成系も閉じる。また「定員に達した 1 イベントの申込を止めたい」目的にサイト全体の module toggle を使うのは道具の誤用で、per-event の capacity / ticket 機構が正しい経路。

---

## R-20

**scripts/e2e/ensure-admin-user.ts だけ DATABASE\_URL を TEST\_DATABASE\_URL に固定せず、ローカルでは開発 DB を書き換える**

<sub>[対処の記録](2026-08-12-codebase-audit-progress.md) ／ [指摘全文](2026-08-12-codebase-audit-findings.md)</sub>

- **箇所**: `scripts/e2e/ensure-admin-user.ts`
- **領域**: scripts 安全装置

### 棄却理由

引用（scripts/e2e/ensure-admin-user.ts:30 の `await withScript("ensure-admin-user", async (prisma) => {`）は実在し、DATABASE\_URL を固定していないのも事実。しかし主張する失敗シナリオの両方の帰結が成立しない。

(a) 「dev DB のパスワード認証行を削除し、ローカル管理者のパスワードログインが消える」は不成立。superadmin@example.com を作るのは prisma/seed.ts:302 `seedAdmin` → `createOrUpdateStaffUser`（prisma/seed.ts:147）で、この関数は **staff に credential account を一切作らない**（新規作成ブランチ prisma/seed.ts:182-192 に `accounts` が無い）うえ、既存ユーザー更新ブランチ prisma/seed.ts:163-167 で `accounts: { deleteMany: { providerId: "credential" } }` を**自分で実行している**。管理画面は IAP 前提（prisma/seed.ts:319 "Admin access is protected by Google Cloud IAP."）でパスワードログインが存在しない。つまり ensure-admin-user.ts:49 の `account.deleteMany({ userId, providerId: "credential" })` が dev DB で消せる行は最初から無く、dev seed が毎回やっていることと同一。e2e-viewer@example.com は dev DB に存在しないので同様に 0 行。残る副作用は User 行 1 件の挿入と name の "スーパー管理者"→"Test Super Admin" 書き換えだけで、失われるものは無い。

(b) 「chromium-admin-viewer が identity 不在で落ちる」は、Playwright test process の DATABASE\_URL が E2E DB を指していない構成のときだけ起きるが、その構成では \*\*e2e/helpers/e2e-prisma.ts:21 が全く同じ無防備な `process.env["DATABASE_URL"]` 読み**をしており（TEST\_DATABASE\_URL 解決なし）、これを使う 7 つの helper（customer-merge-fixture / event-registration-fixture / inquiry-fixture / recurring-create-fixture / refund-policy-bulk-cancel-fixture / reservation-series-db / reservation-series-fixture）が同じ誤った DB に書き込む（あるいは未設定で e2e-prisma.ts:24 が throw する）。すなわちこれは「このファイル固有の欠陥」ではなく、ローカル広域 E2E を回すときに DATABASE\_URL を E2E DB へ export しなければならないという**環境構成要件\*\*そのもので、要件を満たせば ensure-admin-user.ts も正しい DB に当たる（e2e-prisma.ts:6 の docstring 「DATABASE\_URL は webServer と同じ env から解決する」がこの設計意図を明示している）。

CI では .github/workflows/ci.yml:71 の DATABASE\_URL と :77 の TEST\_DATABASE\_URL がどちらも postgresql://postgres:postgres@localhost:5432/test\_db で同値のため発現しないという記述は正しい。ユニット/インテグレーション/gate を偽陽性にする経路も、本番に届く経路も無い。

---

## R-21

**管理画面の手動 GCal 同期だけが calendar-sync advisory lock (728349) を取らずに syncFromCalendar を呼ぶ**

<sub>[対処の記録](2026-08-12-codebase-audit-progress.md) ／ [指摘全文](2026-08-12-codebase-audit-findings.md)</sub>

- **箇所**: `src/app/(admin)/admin/(dashboard)/_shared/actions/settings/google-calendar.ts`
- **領域**: 並行制御

### 棄却理由

引用は実在する（google-calendar.ts:319 `const result = await syncFromCalendar();`）。「3 つの入口のうち admin Server Action だけが 728349 を取らない」という**観察自体は事実**で、grep でも syncFromCalendar の呼出は cron/route.ts:221・webhooks/route.ts:198・google-calendar.ts:319 の 3 箇所、lock を取るのは前 2 者だけ、gate も無い。しかし**主張された失敗シナリオはコード上に存在しない経路を前提にしており、到達不能**。

(1) 決定的: 時間変更が成功した経路 (reservation-calendar-inbound.ts:244-366) が発火する副作用は \*\*applyReservationEditSideEffects **だけ**で、その中身 (edit-side-effects.ts:129-228) は SmartLock パスコードの revoke / 再発行のみ\*\*。顧客向け「予約時間変更のお知らせ」も GCal patch も一切呼ばない。`sendReservationUpdatedEmail` の呼出元は admin/reservation/admin.ts:531・mypage/reservation.ts:344・status/edit/update.ts:275 の 3 つだけでこの経路に無く、`updateCalendarEvent` / `syncReservationToCalendar` は outbound 側 (reservation-calendar-outbound.ts) にしか無く inbound からは呼ばれない。inbound で送るメールは `sendCalendarSyncRejectionEmail` のみで、これは**拒否時**(payment status / overlap / pricing 失敗) にしか発火しない。よって「顧客に 2 通届く」「GCal へ 2 回 patch が飛ぶ」「次回 cron で 3 通目」はすべて**実在しない副作用の捏造**。

(2) 「syncToken 上書きで再配信 → 3 通目」も成立しない。A/B とも同じ T0 から fetch するため返る変更集合は同一で、再配信されても 2 回目は reservation.startTime が既に新値 → inbound.ts:190-195 の startChanged/endChanged が両方 false → `{action:"skipped"}` で終わる（そもそも通知が無い）。

(3) 残る実害は「icsSequence が +1 でなく +2」(calendar-sync-inbound-mutations.ts:314) と「SmartLock の revoke→再発行が 2 回走る」だけ。icsSequence は RFC 5545 上単調増加であれば足り連番である必要が無く、しかもこの経路は .ics を再送しない。再発行結果 (`IssueSmartLockPasscodesResult`) は inbound.ts:356 で**戻り値を捨てている**ため顧客にも届かない。DB 最終状態は 1 回適用時と同一（同じ startTime/endTime/価格を書くだけ）。

(4) さらに、指摘が暗黙に前提する「lock を足せば防げる」も成立しない。locks.ts:12-31 が明示的に文書化している通り、`pg_try_advisory_lock` は**セッション（接続）レベル**で pg.Pool 上を漂う。PostgreSQL のセッション advisory lock は同一セッション内で再入可能なので、admin action の取得クエリが cron が取得したのと同じ pooled connection にルーティングされれば true が返り、排他は成立しない。加えて同ファイルは `_MAX_INSTANCES: "1"` により本来の目的（複数インスタンス排他）自体が現状発生しないこと、正しい移行先は advisory lock ではなく **DB 行ベースの lease ロック**であることまで、設計判断として既に記録している。

指摘の見出し（lock 非対称）は正しい観察だが、severity high を支える具体的失敗はすべて存在しない副作用に依拠しており、判定基準「失敗シナリオを再現する経路をコード上で具体的に指し示せない場合は refuted」に該当する。

---

## R-22

**partial unique な slug を findUnique で引いており、ESLint の seed probe gate が findFirst しか見ないため素通りする**

<sub>[対処の記録](2026-08-12-codebase-audit-progress.md) ／ [指摘全文](2026-08-12-codebase-audit-findings.md)</sub>

- **箇所**: `prisma/seed.ts`
- **領域**: seed

### 棄却理由

The finding's mechanics are half-right, but the one step that turns it into a defect is unconfirmable, and two of its supporting claims are factually wrong.

DECISIVE GAP (external-library behavior, unresolvable). The entire defect rests on `prisma.space.findUnique({ where: { slug } })` emitting SQL WITHOUT the index predicate `is_active = true`. If Prisma injects the predicate, the correct active row is returned and there is no bug at all. This repo runs Prisma 7.9.1 with `previewFeatures = ["partialIndexes"]` (prisma/schema.prisma:11) — i.e. Prisma is explicitly aware the index is partial, and the predicate is present in the runtime datamodel (`inlineSchema` in generated/prisma/internal/class.ts:25). SQL generation happens in `node_modules/prisma/build/prisma_schema_build_bg.wasm` / the query compiler; I found ZERO JS-side partial-index handling in `node_modules/@prisma/client/runtime/*.js` (grep for `partialIndex*` returns nothing), so the behavior is not readable. Per protocol, a claim resting on unverifiable library behavior does not pass. The in-repo comments asserting "findUnique 不可" (src/shared/domain/slugs/queries.ts:28, :60) express the team's convention, not a proven engine behavior — and they are NOT type-level truths, since `PostWhereUniqueInput` (generated/prisma/models/Post.ts:388-390,417) exposes `slug` exactly as Space does.

FALSE CLAIM. "src/ 側の findUnique は全て id 引きで、slug 引きの findUnique は prisma/seed.ts にしか無い" is wrong. `src/shared/domain/slugs/queries.ts:45-47` calls `prisma.news.findUnique({ where: { slug: normalizedSlug } })` and :56-58 calls `prisma.page.findUnique({ where: { slug: normalizedSlug } })`. Both are slug-keyed findUnique in src/. (They happen to be sound because News.slug and Page.slug are unconditional `@unique` — schema.prisma:1366, :1526 — but the stated survey is incorrect, which is what the "only seed.ts" framing was resting on.)

WEAK SOURCING. The finding verified the WhereUniqueInput shape on `generated/prisma/models/Event.ts:444-446` and inferred Space "同型" rather than reading Space. The inference happens to hold, but the cited evidence does not support the cited location.

REACHABILITY IS FAR NARROWER THAN PRESENTED. The premise "developer deletes coworking-space from admin" is largely blocked: `deleteSpaceCommand` (src/shared/domain/spaces/commands.ts:312-329) throws `"有効な予約があるため削除できません"` if ANY reservation is PENDING/CONFIRMED (ACTIVE\_RESERVATION\_STATUSES, src/shared/lib/validations/enums/helpers.ts:82-85) and `"占有中のイベントがあるため削除できません"` for active events. `coworking-space` is the shared default space seeded with dev reservations, so a developer must first clear every active reservation on it, then soft-delete, then re-seed WITHOUT a reset. CLAUDE.md documents that bare `bun run db:seed` fails the APP\_SURFACE guard and that the normal rebuild path is `bun run setup` / `bun run db:reset` — and `db:reset` (package.json:28) runs `migrate reset --force`, which wipes the stale row and destroys the premise.

BLAST RADIUS IS DEV-ONLY. `seedPublicReviewE2EFixture` is called solely from `seedDev()` (prisma/seed.ts:6220); `seedProduction()` (:6239) never reaches it. The finding's own stated harm is "an E2E spec fails" — a self-revealing failure in a developer's local DB, not data loss, not a production or security issue.

GATE-COVERAGE FRAMING CONFLICTS WITH REPO POLICY. The real content here is "the ESLint gate inspects findFirst but not findUnique" — a speculative coverage gap, not an observed defect. CLAUDE.md is explicit: 「新しい gate を足すのは、実際に起きた欠陥に対してだけ。『将来こう間違えるかもしれない』で増やさない。」 On a 3rd audit pass over an already-green codebase, this reads as a squeezed-out finding.

---

## R-23

**updatePostSettings が認証前に DB を読み、executeAdminMutationResult の実行順序契約を破っている**

<sub>[対処の記録](2026-08-12-codebase-audit-progress.md) ／ [指摘全文](2026-08-12-codebase-audit-findings.md)</sub>

- **箇所**: `src/app/(admin)/admin/(dashboard)/_shared/actions/post/mutations.ts`
- **領域**: admin Server Action

### 棄却理由

引用と契約文は実在し、DB 読取が checkAdminAuth より前に走るのも事実。しかし主張された害がすべて成立しない。(1) DoS: admin の認証は IAP であり、session.ts:59-95 の resolveAdminEmail は IAP ヘッダ不在なら DB に一切触れず null を返す。加えて admin service は IAP 配下 (src/proxy.ts:543-545) なので未認証リクエストはそもそも action に到達しない。残る行為者は IAP 通過済みかつ post:read を持つ staff で、PK indexed の findFirst 1 回 (select: {status} のみ) は、記事一覧を引ける人物にとって DoS レバーにならない。cache も絡まない (getPostStatus に "use cache"/cacheTag は無く、引用中の cache-layer poisoning には経路が無い)。(2) RBAC 影響ゼロ: admin-permissions.ts:33-280 で post:update と post:publish は SUPER\_ADMIN(:71,73) と ADMIN(:180,182) に常に同時付与され、EDITOR(:250-257)/VIEWER(:258-277) はどちらも持たない。よって statusChanging ? "publish" : "update" は認可結果を一切変えず、TOCTOU は権限昇格を起こしえない。(3) 監査ラベル: :88 と :99 の間のミリ秒窓で ADMIN+ 2 名が同一記事を操作した場合のみ 1 行のラベルがずれるだけで、相手側の status 変更は別途監査される。(4) 「この 1 箇所だけ」は誤り: reservation/series.ts:52 が payloads.ts:94-100 の prisma.settingsReservation.findUniqueOrThrow を wrapper 前に呼び、conform-action.ts:91-103 の executeConformMutation は自前の認証を持たないため、検証すら通る前のより早い pre-auth read になっている。(5) 見落としではなく意図: post-commands.ts:262 の JSDoc が「設定更新の RBAC 判定用」と明記し、\_\_tests\_\_/integration/actions/admin/post.action-shape.test.ts:224-289 が両分岐を固定している。失敗シナリオを再現する経路をコード上で指せないため refuted。

---

## R-24

**ページ編集画面が認可より前に DB 書き込みを行う（VIEWER / 未割当 EDITOR が CMS を変更できる）**

<sub>[対処の記録](2026-08-12-codebase-audit-progress.md) ／ [指摘全文](2026-08-12-codebase-audit-findings.md)</sub>

- **箇所**: `src/app/(admin)/admin/(dashboard)/pages/[slug]/edit/page.tsx`
- **領域**: admin 読み取り境界

### 棄却理由

指摘の「順序」だけは実在する（page.tsx:57 の ensureSystemPageCommand は :60 の getPageForEdit より前）。しかし権限昇格という主張の前提が 2 つとも成立しない。(1) VIEWER は認可失敗しない。ROLE\_PERMISSIONS.VIEWER は "page:read" を含み(src/shared/lib/admin-permissions.ts:268)、requireAdminResourcePermission は非 editor ロールを isEditorRole 判定で素通しする(\_shared/queries/\_helpers.ts:83-85)。つまり getPageForEdit は成功し編集画面は正常に描画される。指摘が言う「line 60 の notFound」は VIEWER 経路では一切起きず、越えられた権限境界が存在しない。(2) 同一の書き込みは既に無認証で常時走っている。src/instrumentation.ts:23-27 が起動時に bootstrapSystemPages() を呼び、bootstrapSystemPagesCommand(system-pages-commands.ts:92-134) が SYSTEM\_PAGES 全 9 件に対して同じ page.create と ensurePageSectionsCommand→tx.section.createMany を実行する。Cloud Run は scale-to-zero なので cold start ごとに HTTP アクターなしで発火する。VIEWER の GET はシステムが自分自身に対して既に行っている以上の能力を何も与えない。加えて page.create 分岐は実質到達不能で、システムページは削除も非公開化もできず(commands.ts:169-171/187-189/213-222/245-251)、起動 bootstrap が行の存在を保証する。書き込む値は全て定数で、slug は isSystemPageSlug(page.tsx:56)により 9 個のハードコード値に限定されるため攻撃者制御データは DB に届かない。定常状態では system-pages-commands.ts:44-46 がトランザクションを開く前に return する no-op。

---

## R-25

**admin 一覧の perPage に上限がなく、event:manage / terms:update で守っている PII 一括出力ゲートと EXPORT 監査証跡を読み取り側から迂回できる**

<sub>[対処の記録](2026-08-12-codebase-audit-progress.md) ／ [指摘全文](2026-08-12-codebase-audit-findings.md)</sub>

- **箇所**: `src/shared/lib/pagination.ts`
- **領域**: admin 読み取り境界

### 棄却理由

引用は実在し（src/shared/lib/pagination.ts:34 は逐語一致）、機構的な到達経路も本物である。nuqs の parseAsInteger は node\_modules/nuqs/dist/server.js:317-323 で `parseInt(v)` を返すだけで上限が無いことを一次資料で確定させた。paginate は下限 1 にしか clamp せず、?perPage=100000 は実際に take: 100000 に到達する。src/ 全体に perPage の上限 clamp は存在せず（Math.min による clamp は dashboard/queries.ts:94 と instagram/index.ts:195 のみ）、architecture gate も専用テストも無い。ここまでは指摘の通り。

しかし「深刻度 high」を支えている**セキュリティ上の帰結が 2 点とも成立しない**。

(1) RBAC 迂回は起きていない。VIEWER は admin-permissions.ts:276 で event:read を持ち、既定の perPage=20 のまま ?page=N を送るだけで全参加者の氏名・メール・電話番号を読める（events/\[id\]/page.tsx:91-99 がまさにその 3 列を描画している）。export route の event:manage ゲートは「event:read 保持者からデータを秘匿する」ものではなく、CSV / Excel という**成果物**を制限するもので、指摘自身が引用した admin-permissions.ts のコメント「参加者 CSV / Excel の一括出力（PII）」がそう明言している。perPage=100000 で得られるのは、その role が既に閲覧を認可されている同一レコードを HTML で一度に描いたものに過ぎず、追加の情報開示はゼロ。terms 側も同型で、terms:read だけで既定 perPage=50 の一覧が guestEmail と ipAddress を描画している（agreements/page.tsx:128-143）。

(2) 監査証跡の迂回も起きていない。getEventRegistrations / getAdminAgreements と \_shared/queries の両ラッパーに createAuditLogRecord は 1 件も無い（grep 済み・0 件）。admin 一覧の読み取りは perPage の値に関わらず**そもそも監査されていない**ので、perPage=100000 が「本来残るはずの証跡」を回避しているわけではない。perPage=20 の読み取りが残す証跡（＝無し）と完全に同じ。AuditAction.EXPORT が記録するのは CSV export という別のアクションで、それは今も event:manage / terms:update 無しには実行できない。

残るのは「認証済みの管理ユーザーが自分で大きな結果セットをサーバーに materialize させられる」という堅牢性の穴だけで、PII 露出でも認可の穴でも監査の穴でもない。OOM 経路という主張も実測の裏付けが無い推測。paginate に上限を足すのは安価な defense-in-depth として妥当だが（dashboard/queries.ts:94 に既存パターンあり）、指摘が名乗っている「権限ゲートと監査証跡の両方が読み取り側から抜ける」は事実誤認。

---

## R-26

**GCal 由来の時間変更成功時に顧客通知が一通も送られず、旧パスコードだけが無効化される**

<sub>[対処の記録](2026-08-12-codebase-audit-progress.md) ／ [指摘全文](2026-08-12-codebase-audit-findings.md)</sub>

- **箇所**: `src/shared/domain/reservations/reservation-calendar-inbound.ts`
- **領域**: 予約（未読分）

### 棄却理由

引用自体は実在する（reservation-calendar-inbound.ts:356 が applyReservationEditSideEffects の戻り値を捨て、:366 で return {action:"updated"} する）。しかし申告された失敗シナリオの中核前提が事実と異なるため、記述どおりの障害は再現しない。(1) パスコード平文はメールに一切載らない。src/shared/lib/email/types.ts:212 が「平文パスコードはメールに載せない（予約詳細ハブで開示）」と明記し、src/shared/emails/ 配下の全テンプレート（reservation-confirmation.tsx / reservation-updated.tsx）を grep しても含まれるのは smartLockIssuanceFailed による fallback 案内文だけで、コードそのものは無い。confirmation-side-effects.ts:85-90 自身も result.passcodes を捨てて flag のみ渡している。顧客は customer-passcode-queries.ts:104-284 の getCustomerVisibleSmartLockPasscodesForReservation 経由で、閲覧時に DB から復号して受け取る（reveal:true 時のみ、行に焼き込まれた \[startTime,endTime\] 窓内）。よって「確認メールで受け取った手元のパスコード」は存在せず、再発行後にハブを見れば新コードが出る。(2)「この経路だけが契約を破っている」も誤り。passcodes を実際にメールへ渡している呼出側は 1 つも無い（admin.ts:523-525 / mypage reservation.ts:328-337 / status/edit update.ts:259-268 / confirmation-side-effects.ts:85-90 はいずれも issuanceFailed しか読まない）。edit-side-effects.ts:115-119 の JSDoc が古いだけで、GCal 経路が単独で契約違反しているわけではない。(3)「issuanceFailed=true でも無音で放置」も誤り。edit-side-effects.ts:183 が markSmartLockReissuePending を呼び Reservation.smartLockReissuePendingAt を立て、smart-lock-cleanup cron が processPendingSmartLockReissues（reissue-passcode.ts:124-170）で再試行する。加えて issue-passcode.ts:41-59 の notifyPasscodeFailure が SMART\_LOCK\_PASSCODE\_FAILED の in-app 通知を出す。ハブ側も CONFIRMED 行が無ければ pending / unavailable を返し、古いコードを提示し続けることはない。残るのは「GCal 由来の時間変更で顧客向け更新メールが送られない」という、申告よりはるかに小さく性質の異なる通知設計上の非対称のみ。

---

## R-27

**crypto purpose 衝突 gate は手書きリストどうしの比較で、src に新設された purpose を一切見ない（docstring の「機械的に検出する」は成立していない）**

<sub>[対処の記録](2026-08-12-codebase-audit-progress.md) ／ [指摘全文](2026-08-12-codebase-audit-findings.md)</sub>

- **箇所**: `__tests__/unit/architecture/crypto-purpose-registry.test.ts`
- **領域**: gate 本体

### 棄却理由

引用は実在する（crypto-purpose-registry.test.ts:23）し、「リストは手書きで src/\*\* を走査しない」という観察それ自体も事実。しかし指摘は 3 点で崩れる。

(1) **再現経路が存在しない。** 失敗シナリオは「src/shared/lib/tokens/foo-token.ts をコピーして作り PURPOSE を直し忘れる」という、まだ存在しないファイルを前提にする。src 側の purpose リテラルを独立に全列挙した結果 — PASSCODE\_CRYPTO\_PURPOSE="switchbot-guest-passcode"(smart-lock/issue-passcode.ts:62)、DEFAULT\_PURPOSE="generic"(crypto.ts:45)、各 token file の const PURPOSE 12 件、purposeFor() 由来 2 件、"instagram" — は OTHER\_DOMAIN\_PURPOSES と SETTINGS\_CRYPTO\_PURPOSES に完全一致し、今日の偽陰性は 0 件。指摘者自身が「今日は偽陰性ではなく将来の死角」と認めている。コード上で経路を指せない以上、判定基準により refuted。

(2) **docstring が主張していないことを主張したと読んでいる。** 指摘見出しは「docstring の『機械的に検出する』は成立していない」だが、同 docstring の 4-8 行は他ドメイン purpose を「列挙し」「単一ソース化していない」と明記している。「本テストが重複を機械的に検出する」は Set サイズ比較による**重複判定**が機械的だという記述で、実際そのとおり。列挙が機械的だとはどこにも書いていない。`.claude/rules/architecture-gates.md` の「検査できないことを検査できるように書かない。粗いなら粗いと docstring に書く」に、この gate はむしろ準拠している。

(3) **申告された被害機序が実装と食い違う。** 「purpose 一致を明示検証していない decrypt 経路で受理されうる」と書くが、そんな経路は存在しない。crypto.ts:128-130 の `interface DecryptOptions { expectedPurpose: string }` は optional でも既定値付きでもない**必須**フィールドで、type-check が緑である以上すべての呼び出し元が渡している。crypto.ts:151-155 は鍵解決前・GCM 検証前に不一致を throw する。指摘はこの機序の根拠として gate docstring 12 行の散文を引いているが、それは expectedPurpose 必須化以前を describe した古い文であり、根拠がコードではなくコメントになっている。

---

## R-28

**runbook gate が migrate Job の secret version を literal `2` で写経しており、Terraform 側が bump しても落ちない（正しく直すと逆に赤くなる）**

<sub>[対処の記録](2026-08-12-codebase-audit-progress.md) ／ [指摘全文](2026-08-12-codebase-audit-findings.md)</sub>

- **箇所**: `__tests__/unit/architecture/gcp-production-runbook.test.ts`
- **領域**: gate（本番インフラ）

### 棄却理由

引用は実在する（\_\_tests\_\_/unit/architecture/gcp-production-runbook.test.ts:289 に `expect(runbook).toContain("--set-secrets=DIRECT_URL=DIRECT_URL:2")`）。事実関係の骨格（doc:743/767/1429/1573 が literal 写経、runbook↔Terraform を突き合わせる gate は不在）も正しい。だが「失敗シナリオ」が現行コード上で到達可能でなく、かつ主張の中核（gate が stale を固定する）が逆立ちしている。

(1) 今日この瞬間、4 箇所は全部一致している。terraform/cloud\_run\_migrate\_job.tf:90 `version = "2"` / scripts/gcp-production-audit-model.ts:213 `{ name: "DIRECT_URL", version: "2" }` / docs/gcp-production-setup.md:743,767 `DIRECT_URL:2` / gate:289。runtime 側も terraform/variables.tf:151 の v3 と doc:771 `DATABASE_URL:3` で一致。**不整合は 1 件も存在しない。** 指摘が要求するのは「将来 Terraform を 2→3 にする人間の編集」であって、現行コードに欠陥の経路は無い（判定基準「経路をコード上で具体的に指し示せない場合は refuted」に該当）。

(2) 主張された終端状態（migrate Job が旧 DB を指したまま `No pending migrations to apply.` で exit 0）は、**既存の実行時 gate が検出する**。scripts/audit-gcp-production-iap.ts:756-772 が実 Job の記述を読み、scripts/gcp-production-audit-model.ts:942 `if (actualRef.version !== expectedRef.version)` で version 不一致を `Cloud Run migrate Job env is canonical` の失敗として返す。期待値 REQUIRED\_CLOUD\_RUN\_MIGRATE\_JOB\_SECRET\_ENV\_REFS は terraform-sync gate によって Terraform と機械照合されているので、Terraform が 3、実 Job が 2 の状態は必ず赤になる。runbook 自身がこの audit を「live posture を証明する gate」と宣言している（同 test:378-386 が pin）。

(3) さらに Terraform が Job の env を所有している。terraform/cloud\_run\_migrate\_job.tf:98-104 の `ignore_changes` は `containers[0].image` のみで、env は入っていない。stale な bootstrap コマンドで作った Job は次の `terraform apply` で :3 へ収束する。runbook:725-732 も「bootstrap は一度きり、以後は Terraform import を推奨」「DIRECT\_URL secret binding は terraform/cloud\_run\_migrate\_job.tf の所有」と明記している。到達には (a) 将来の bump、(b) doc 更新忘れ、(c) bootstrap create パスの使用、(d) terraform apply を打たない、(e) 本番 audit を打たない、の 5 条件同時成立が要る。(d)(e) はそれぞれ単独で十分な既存防御。

(4) gate 指摘としての中核主張が誤り。`toContain(":2")` は「doc を :3 に直すと赤くなる」＝**正しい修正の瞬間に大声で鳴るピン**であって、stale を固定する仕掛けではない。静かに古びるのは gate が無い場合であり、gate があることで doc の変更が同一 PR 内の明示的な 1 行編集を強制される。実際 commit b63b7ea90 (#2078) は doc・model・gate を 1 コミットで同時に直しており、この運用が成立した実績がある。

---

## R-29

**build-time と runtime の NEXT\_SERVER\_ACTIONS\_ENCRYPTION\_KEY version 一致を主張する gate が `"\d+"` としか照合しておらず、鍵ローテーションで両者が食い違っても緑**

<sub>[対処の記録](2026-08-12-codebase-audit-progress.md) ／ [指摘全文](2026-08-12-codebase-audit-findings.md)</sub>

- **箇所**: `__tests__/unit/architecture-boundaries.test.ts`
- **領域**: gate（本番インフラ）

### 棄却理由

引用は実在する（\_\_tests\_\_/unit/architecture-boundaries.test.ts:1210 に regex がそのままある）し、「この gate は build-time literal と runtime map を突き合わせていない」という観察自体は正しい。しかし主張された失敗経路が Next 16.3.0 の実装で成立しない。

(1) 一次資料で確定: node\_modules/next/dist/server/app-render/encryption-utils.js の getActionEncryptionKey() は `const rawKey = process.env.NEXT_SERVER_ACTIONS_ENCRYPTION_KEY || serverActionsManifest.encryptionKey;` で、**runtime env が image 焼き込みの manifest key より優先**される。bound args の暗号化（render 時）も復号（action 実行時）も同じこの関数を runtime で通るので、image=v1 / runtime=v2 でも両側 v2 になり一致する。「デプロイ直後から予約フォーム・問い合わせ・admin の Server Action が全滅」は成立しない。

(2) 唯一壊れうるのは build 時 prerender で暗号化された payload を runtime で復号する場合だが、この repo にその面は無い。`.bind(null, …)` は 34 箇所すべて src/app/(admin)/ 配下（認証必須・DB 依存で dynamic）で、src/app/(public) には 0 件。さらに src/\*\*/\*.tsx に行単位の `"use server"` は 0 件で、server component 側で作られる closure（暗号化対象）が公開ページに存在しない。

(3) action ID の salt (node\_modules/next/dist/build/webpack-config.js:426/452/1964 `serverReferenceHashSalt: encryptionKey`) は build 時に client/server 両 bundle へ同じ値が入るだけで、runtime env で再計算されない。よって version 不一致で action ID が食い違うこともない。DefinePlugin による NEXT\_SERVER\_ACTIONS\_ENCRYPTION\_KEY の inline は webpack-config.js:1750 の `edgeEnvironments`（Edge runtime 限定）だけで、Cloud Run の Node runtime には効かない。

(4) 「cloudbuild / workflow の 1 は誰も見ない」は事実誤認。docs/gcp-production-setup.md:891-896 が rotation 手順として variables.tf の cloud\_run\_secret\_versions と .github/workflows/deploy-production.yml の \_NEXT\_SERVER\_ACTIONS\_ENCRYPTION\_KEY\_SECRET\_VERSION の**両方**を名指しし、docs/gcp-production-setup.md:713-720 の rebuild+redeploy 契約は \_\_tests\_\_/unit/architecture/gcp-production-runbook.test.ts:274-281 が機械強制している。

(5) 現時点で drift は存在しない。cloudbuild.yaml:92 / .github/workflows/deploy-production.yml:361 / terraform/variables.tf:157 / scripts/gcp-production-audit-model.ts:194 はすべて "1" で一致。指摘が要求するのは「将来 operator が片方だけ bump したら」という仮定であり、.claude/rules/architecture-gates.md の「将来こう間違えるかもしれない では足さない」に正面から当たる。

失敗シナリオを再現するコード上の経路を指し示せないため refuted=true。

---

## R-30

**リハーサルは WHERE 無し DELETE を止めるのに WHERE 無し UPDATE は run に分類し、gate がその分類を固定している**

<sub>[対処の記録](2026-08-12-codebase-audit-progress.md) ／ [指摘全文](2026-08-12-codebase-audit-findings.md)</sub>

- **箇所**: `__tests__/unit/architecture/migration-preconditions.test.ts`
- **領域**: gate（DB）

### 棄却理由

引用は実在する（`__tests__/unit/architecture/migration-preconditions.test.ts:162` に `'UPDATE "t" SET "x" = 1',`）。機械的な事実関係も 4 点すべて正しい: (a) `scripts/migration-preconditions.ts:320-335` の `irreversibleDataLoss` に UPDATE 分岐は無い、(b) `.squawk.toml` の有効 rule は DDL のみで DML を見ない、(c) `.github/workflows/deploy-production.yml:318` の正規表現は `ALTER TABLE … / ALTER TYPE … / DROP TABLE / DROP TYPE` だけで UPDATE に一致しない、(d) よって WHERE 無し UPDATE は `planStep`（同 :342-350）で `run` になり本番 migrate が実行する。ここまでは指摘のとおり。

それでも指摘は成立しない。理由は「その分岐を足すことが正しい不変条件ではない」から。

**1. WHERE 無し UPDATE は破壊のプリミティブではなく、migration で最も一般的な正当 DML そのもの。** 列追加時の backfill は定義上 WHERE を持たない:

```
ALTER TABLE "t" ADD COLUMN "x" text;
UPDATE "t" SET "x" = \<expr\>; -- 全行が対象。WHERE を書く余地が無い
ALTER TABLE "t" ALTER COLUMN "x" SET NOT NULL;
```

`irreversibleDataLoss` は docstring（同 :282「**免除の入口を持たない**」・:306「**免除は無い**」）のとおり免除経路を意図的に持たない。ここに UPDATE 分岐を足すと、この backfill は**回避手段ゼロで永久に書けなくなる**。DELETE には対応する正当形が無いから動詞だけで判定できるのであって、UPDATE にはある。この非対称性が、4 形に UPDATE が入っていない理由。

**2. 破壊的 UPDATE と benign な backfill の区別には SET 句と「同一 migration 内で作った列か」の追跡が要り、それは削除済み分類器そのもの。** `scripts/migration-preconditions.ts:299-303` が名指しで範囲外と宣言している（「消える対象が何かは読まないし…同一 migration 内で作った表の追跡もしない——それが『収束しない』と結論した写経の中身だった」）。同 :35-50 に、その写経が 2 巡のレビューで 21 件（素通り 9・誤検知 12）を出して廃止された経緯がある。指摘が求める修正はその復活を意味する。

**3. 実測された穴ではなく仮定の typo。** 指摘の失敗シナリオは自ら「レビューで WHERE 句が落ちた」と仮定している。既存 4 形は `scripts/migration-preconditions.ts:296-297` と `__tests__/integration/prisma/migration-preconditions-rehearsal.test.ts:398-447` で「実測で確認した穴」と記録されている。`.claude/rules/architecture-gates.md` は gate 追加の条件を「実際に main や本番へ漏れた欠陥」か「同じ指摘がレビューで 2 回以上出た」に限定し、「将来こう間違えるかもしれない」を明示的に禁じている。UPDATE にその実測は無い。

**4. 別層が二重に守っている。** `.claude/skills/new-migration/SKILL.md:96` が「migration の中でデータ修復を走らせる（副作用の迂回路になるため禁止）」を規約として置き、`scripts/migration-preconditions.ts:306-307` も同じことを書いている。`UPDATE "customers" SET "phone_number" = NULL;` は migration に書いた時点で規約違反であり、人のレビューが関門。squawk の破壊的 DDL が `-- squawk-ignore-file` を人目に晒す形で通すのと同じ設計。

**5. fixture が固定している不変条件は「意図した正しい振る舞い」。** 指摘は line 162 の fixture が欠陥を固定していると読むが、`UPDATE → run` は backfill を通すために必要な仕様。しかも同じ文字列は `migration-preconditions.test.ts:127` の「普通の DDL / DML は run になる」でも既に固定されている。line 162 は重複配置であって、誤った固定ではない。

---

## R-31

**interactive $transaction の Promise.all gate が src/shared/lib を走査せず、配置 gate も $transaction を検出できない**

<sub>[対処の記録](2026-08-12-codebase-audit-progress.md) ／ [指摘全文](2026-08-12-codebase-audit-findings.md)</sub>

- **箇所**: `__tests__/unit/architecture/prisma-interactive-tx-no-promise-all.test.ts`
- **領域**: gate（DB）

### 棄却理由

引用は実在する（prisma-interactive-tx-no-promise-all.test.ts:18 の `const SCAN_ROOTS = [`、19-20 行が domain と db の 2 ルート）。正規表現に関する機械的主張も、私が独立に走らせて再現した：`/\bprisma\.\w+\.\w+/u` は `prisma.$transaction(async (tx) => …)` だけを含むソースに対して `exec` が `null` を返す（`$` は `\w` に含まれない）ため、prisma-import-boundary.test.ts:249-250 の placement gate は `importsPrisma && containsPrismaModelCall` の AND 条件で false になる。eslint.config.mjs にも src/shared/lib から `@/shared/db/prisma` を禁じる no-restricted-imports は無い（publicDbRestrictedImports は `src/app/(public)/**` 限定、eslint.config.mjs:307-321）。

しかし**指摘は「今あるコードの欠陥」を一つも指していない**。失敗シナリオ全体が、指摘者自身が本文で認めているとおり（「現在 src/shared 配下で domain/db 以外に prisma を import しているファイルは 0 件なので、いま壊れているわけではない」）、まだ書かれていないファイルを前提にしている。私が src/ 全体を実測したところ:

\1. `$transaction` を含むファイルは 68 件。うち 66 件は src/shared/domain 配下＝SCAN\_ROOTS 内。
\2. SCAN\_ROOTS 外の 2 件（src/app/api/cron/waitlist-expire/route.ts、src/shared/lib/prisma-errors.ts）は、いずれも**コメント／JSDoc 内の文字列のみ**で呼び出し箇所は 0（route.ts:62,162 の日本語コメント、prisma-errors.ts:109,147 の JSDoc）。
\3. tx を受け取る helper が SCAN\_ROOTS 外に漏れていないかも確認した。`TransactionClient|PrismaTransaction|tx:` にヒットする 19 ファイルのうち SCAN\_ROOTS 外は src/shared/lib/reservation/types.ts の 1 件だけで、これは `PrismaTransactionClient` interface を宣言する純粋な型ファイル（prisma import も Promise.all も $transaction も無し）。

つまり \*\*gate の走査範囲は現時点で実在する `$transaction` 呼び出し箇所の 100% を覆っている**。指摘が言う「範囲外」は、src-boundaries.md:21-22 の配置規約（prisma を import してよいのは shared/db と shared/domain のみ）を新規に破らないと到達できない領域で、シナリオ成立には「配置規約違反」と「interactive tx 内 Promise.all」の**2 つの新規違反を同時に犯す\*\*必要がある。コード上に指し示せる経路が無く、reproPath を file:line で構成できない。

加えて、これは `.claude/rules/architecture-gates.md` が明示的に禁じている追加動機そのもの ——「足してよいのは実際に main や本番へ漏れた欠陥があるときだけ。『将来こう間違えるかもしれない』では足さない。1 本増やすコストは以後すべての変更が通り抜ける関門が 1 つ増えること」。4 回目の監査で絞り出された、規約が明文で却下している型の指摘と判断する。

---

## R-32

**共有スペースへの予約作成 gate が slug の文字列リテラルしか見ず、同ファイルが強制する `spaceFixtures.*` 参照形だと必ず素通りする**

<sub>[対処の記録](2026-08-12-codebase-audit-progress.md) ／ [指摘全文](2026-08-12-codebase-audit-findings.md)</sub>

- **箇所**: `__tests__/unit/architecture/e2e-fixture-space-ownership.test.ts`
- **領域**: gate（seed / E2E fixture）

### 棄却理由

The finding's load-bearing claim — "同ファイルが強制する spaceFixtures.\* 参照形だと必ず素通りする" — is factually false. The "slug を直書きしない" test at \_\_tests\_\_/unit/architecture/e2e-fixture-space-ownership.test.ts:168-184 scans only FIXTURE\_OWNED\_SLUGS (line 46-48), derived from FIXTURE\_OWNED\_KEYS (line 38-44), which contains exactly the 5 exclusive fixture slugs and deliberately excludes publicReservableSpaceSlug; line 155-166 asserts the two sets are disjoint. A fixture that writes the literal "coworking-space" therefore passes line 168 and is caught by line 196. The two tests do not conflict, and nothing in the repo mandates the constant form for the shared space. Furthermore the gate does reproduce the shape of the defect that actually leaked: `git show ef68e80fc~1:e2e/helpers/refund-policy-bulk-cancel-fixture.ts` line 153 is `where: { slug: "coworking-space" },` — a bare literal, precisely what line 196 matches. The secondary claim about e2e/helpers/reservation-series-fixture.ts:270 is also wrong on mechanism: createReservationSeriesFixture (line 250) runs purgeReservationSeriesFixture(spec.spaceSlug) at line 255 first, which does client.reservation.deleteMany({ where: { spaceId } }) at line 241, so a second run on the same slug cannot hit reservations\_no\_active\_time\_overlap\_excl at all — the asserted "retries: 2 で 3 attempt すべてが同じエラー" cannot occur on that path. Finally, no violating code exists: none of the 7 helpers or 14 scripts in listFixtureSources() references coworking-space in any form (every reservation-creating fixture resolves to spaceFixtures.guestReservationSpaceSlug or another owned slug), and the only callers of createReservationSeriesFixture pass owned slugs. What remains after removing the false premise is that a literal-substring gate would not see a hypothetical constant-reference form that no code uses and no rule requires — a documented limitation class per .claude/rules/architecture-gates.md ("静的な grep / 正規表現は…粗いなら粗いと docstring に書く"), not a reachable defect.

---

## R-33

**expect.poll gate の helper 追跡が `function` 宣言限定 — arrow const helper だと gate が対象の欠陥を素通りする**

<sub>[対処の記録](2026-08-12-codebase-audit-progress.md) ／ [指摘全文](2026-08-12-codebase-audit-findings.md)</sub>

- **箇所**: `__tests__/unit/architecture/e2e-poll-predicate-retries.test.ts`
- **領域**: gate（seed / E2E fixture）

### 棄却理由

引用は実在する（`__tests__/unit/architecture/e2e-poll-predicate-retries.test.ts:117`）が、失敗シナリオの**因果が誤り**で、かつ現時点で実例がゼロ。

【1】指摘の repro を gate ロジックそのままで実行して反証した。gate の `extractPollPredicates` / `extractFunctionBody` / `navigatingHelperNames` / `navigationCallInPredicate` を逐語コピーし、指摘が書いたとおりの書き換え（`await expect.poll(attempt, { timeout: APPLY_FEATURE_MODULES_TIMEOUT_MS }).toBe(true)`）を 2 形態で流した結果:
\- A. arrow const 版 `const attempt = async (): Promise<boolean> => {...}` → 現行 gate: `[]`（見逃す）。\*\*arrow 対応に広げた版でも `[]`（やはり見逃す）\*\*
\- B. \*\*`async function attempt(): Promise<boolean> {...}` と function 宣言で書いても現行 gate: `[]`（同じく見逃す）\*\*
つまり見逃しの原因は arrow か function かではない。原因は `attempt` → `openFeatureSettings` → `page.goto` という **2 段の間接**で、`attempt` の本体には `.goto(` が直接現れないため、宣言形式に関係なく `navigatingHelperNames` は `attempt` を拾わない。指摘が提案する「arrow const も拾えるようにする」修正では、指摘自身が挙げた欠陥は 1 ミリも塞がらない。

【2】その 2 段の限界は gate の docstring line 108-113 が「粗さ（承知のうえ）」として**明示的に宣言済み**:「同一ファイル・1 段だけ辿る。別ファイルから import した helper や、helper がさらに別の helper を呼ぶ 2 段以上は追わない」。さらに line 113 は取りこぼし時の対処まで先に決めてある（「正規表現を広げずに AST へ移すこと」）。指摘は宣言済みの制約を未知の欠陥として再提示している。

【3】現行コーパスに実例がゼロ。`e2e/**` の arrow const helper（`installHermeticNetwork` / `preparePageForVisualSnapshot` / `dynamicMaskLocators` / `attempt` / `capture` / `describe`）を全件確認したが、本体に `.goto(` / `.reload(` / `.goBack(` / `.goForward(` を直接持つものは 1 つも無い。`e2e/authenticated/admin/axe-admin-feature-disabled.spec.ts:225-228` は現に自前 `for (;;)` ループのままで、`expect.poll` は使っていない。指摘の実害は「誰かが将来こう書き換えたら」という仮定にのみ依存する dead scenario。

【4】その仮定の書き換えは、当該ファイルの JSDoc line 152-159 が「`expect.poll` は使わない」と理由（CI run 31566511073）付きで散文で禁じており、`applyFeatureModules` を poll 化するには**この JSDoc を消す**必要がある。gate を回避する意図的な行為であって、うっかり踏む形ではない。

【5】リポジトリの規約と正面から衝突する。`.claude/rules/architecture-gates.md`「まず『足すべきか』を判定する」は「実際に main や本番へ漏れた欠陥がある」か「同じ指摘がレビューで 2 回以上出た」以外での gate 追加・拡張を禁じ、CLAUDE.md も「新しい gate を足すのは、実際に起きた欠陥に対してだけ」と定める。本指摘は「将来こう間違えるかもしれない」そのもの。

---

## R-34

**feature module 所有分割 gate の marker が同一ファイル内の goto 限定 — helper を別ファイルへ切り出すと所有宣言の強制が外れる**

<sub>[対処の記録](2026-08-12-codebase-audit-progress.md) ／ [指摘全文](2026-08-12-codebase-audit-findings.md)</sub>

- **箇所**: `__tests__/unit/architecture/e2e-feature-module-ownership.test.ts`
- **領域**: gate（seed / E2E fixture）

### 棄却理由

引用は line 76 に実在し、marker が同一ファイル限定であること自体も事実（listSpecFiles は \*.spec.ts のみ収集: line 99-105、識別子解決は同一 source 内のみ: line 80-88）。しかし失敗シナリオは現存しないファイル（e2e/helpers/feature-settings.ts と 3 本目の spec）を前提としており、コード上に再現経路が無い。さらに決定的なのは、指摘が「自然な手当て」として挙げる helper の共通化（既存 2 本から helper へ「移す」）を実行すると、既存 spec の inline const+goto が消えて mutating.length が 2→1 または 0 になり、line 209 の expect(mutating.length).toBeGreaterThan(1) が赤で落ちること。これは line 208 のコメント「marker が腐ると 0 件になり」がまさに想定している空振り検出であり、指摘が主張する「既存 2 本が残っていれば検出できない」という条件は、指摘自身の前提（共通化＝移す）と矛盾する。すり抜けるのは「共有 helper を新設しながら既存 2 本の重複は敢えて残す」という、共通化とは呼べない不自然な書き方に限られる。現状の母集合は e2e/public/feature-module-off-gate.spec.ts:128,548 と e2e/authenticated/admin/axe-admin-feature-disabled.spec.ts:62,139 の 2 本のみで、両方が const 経由分岐にマッチし OWNED\_FEATURE\_MODULES を宣言済み。settings.spec.ts:49 / rbac-viewer-write-blocked.spec.ts:59 は a\[href\] の assert だけで、docstring line 68-71 が意図的に除外理由を説明している。e2e/fixtures/test-data.ts:40-61 に adminFeatureSettings 相当の entry は無く、urls.\* 経由の現行すり抜けも存在しない。加えて .claude/rules/architecture-gates.md は「将来こう間違えるかもしれない」での gate 強化を明示的に禁じており、docstring line 65-74 は marker が拾う 2 形を正確に申告していて過大主張もしていない。

---

## R-35

**animate-pulse gate が `cn()` 合成を一切見ない（src の className の主流形が母集合外）**

<sub>[対処の記録](2026-08-12-codebase-audit-progress.md) ／ [指摘全文](2026-08-12-codebase-audit-findings.md)</sub>

- **箇所**: `__tests__/unit/architecture/no-animated-opacity-on-text.test.ts`
- **領域**: gate（UI / CSP）

### 棄却理由

引用は \_\_tests\_\_/unit/architecture/no-animated-opacity-on-text.test.ts:41 に逐語で実在し、正規表現の機械的挙動についての主張も正しい。className={cn("animate-pulse", "text-muted-foreground")} は実際に一致しない（className= の後 \\{? が { を食うと次に " が要るが c、\\{? を零幅にすると " が要るが {。両 alternative とも失敗）。src/\*\*/\*.tsx に className={cn( が 480 箇所あることも確認した。それでも指摘は反証される。理由は3つ。

(1) 失敗経路がコード上に存在しない。src 内の animate-pulse 全 27 箇所を追ったが、すべて非テキスト矩形（bg-surface / bg-muted / rounded-\*）か、子孫が矩形のみの祖先ラッパー（settings/system/page.tsx:63-74 で実確認：中身は bg-muted の div のみでテキストなし）で、後者は docstring 32-34 行が意図的に対象外と宣言した形そのもの。cn() 経由で animate-pulse と前景色を同居させた行は 1 行も無く、過去にも無い。指摘の再現コードは執筆者が新規に書いた仮定形であり、entry → 関数 → 分岐 → 誤結果 を実コードで指せない。

(2) gate は元の欠陥の形を再現している。gate 追加コミット 1bf629bde（#1749）が直した実欠陥は2箇所で、どちらも単一文字列リテラル + text-muted-foreground だった：LoadingState.tsx の \<div className="animate-pulse text-sm text-muted-foreground"\> と LazyLexicalEditor.tsx の \<div className="animate-pulse text-muted-foreground"\>。正規表現と fixture(83-95) はこの2形を正しく捕捉する。.claude/rules/architecture-gates.md および feedback\_gate-must-reproduce-the-original-defect-shape.md が定める基準（合成形だけでなく元の欠陥の形を入れる）を、この gate は満たしている。

(3) 指摘が含意する修正は、repo 規約が明示的に禁じている方向。cn() 対応と token 列挙の追加は正規表現の 2 度目・3 度目の拡張であり、.claude/rules/architecture-gates.md「正規表現を 2 回広げたら手法が合っていない合図。3 回目に広げず AST へ移す」に正面から反する。gate は空振りもしていない（99 行に走査規模下限 \>100、80-96 行に落ちる形/落ちない形の両 fixture）。

外部ライブラリ依存の主張は無く、node\_modules 参照は不要だった。ESLint・他 gate にこの不変条件を守るものは無い（リポジトリ全体を grep して該当なし）が、それは gate の欠陥ではなく、この gate が唯一の決定的検査であることを意味するだけ。

---

## R-36

**半透明オーバーレイの AA gate が「位置指定と背景が同じ 1 リテラル」でないと見ない**

<sub>[対処の記録](2026-08-12-codebase-audit-progress.md) ／ [指摘全文](2026-08-12-codebase-audit-findings.md)</sub>

- **箇所**: `__tests__/unit/architecture/admin-overlay-surface-contrast.test.ts`
- **領域**: gate（UI / CSP）

### 棄却理由

The quoted regex at \_\_tests\_\_/unit/architecture/admin-overlay-surface-contrast.test.ts:87 is real, and the mechanical claim is real: I reimplemented collectPositionedTranslucentSurfaces() faithfully over all 728 files under src/app/(admin)/\*\*/\*.tsx and reproduced the gate's population exactly (2 surfaces: CodeBlockPlugin.tsx:94 and CheckInClient.tsx:223), confirming that positioning and the translucent background must share one double-quoted literal. But this is a documented scope boundary, not a defect, and the failure scenario is unreachable in the current tree.

(1) The gate declares this exact rule in its own docstring, lines 52-62: "判定は 1 つの class 文字列リテラル単位で行う。同じリテラルに位置指定 (fixed / sticky / absolute) と半透明背景の両方があるものだけを見る", followed by an explicit in-scope / out-of-scope enumeration. .claude/rules/architecture-gates.md prescribes precisely this handling for a coarse method: "検査できないことを検査できるように書かない。粗いなら粗いと docstring に書くほうが、読む人を誤らせない。" The gate is not overclaiming; it names its own limit.

(2) No instance of the claimed evasion exists. Partitioning every double-quoted literal in admin: 2 literals carry BOTH positioning and bg-(background|card)/NN (exactly the gate's population), 89 carry positioning only, 8 carry a translucent surface only. All 8 of the latter are outside any positioned context — 7 are hover:bg-background/50 inside tab-trigger cn() blocks that contain no positioning utility anywhere (tabs.tsx:72, EventTabs.tsx:48, FaqReviewFilterTabs.tsx:39, NewsManagementTabs.tsx:56, PostsManagementTabs.tsx:55, ReservationTabs.tsx:59, SpaceManagementTabs.tsx:66), and the 8th is DesignPreview.tsx:77, a switch-case return of a decorative style sample. There is no cn() call anywhere in admin that splits positioning into one literal and a translucent surface into another. The finding itself is phrased conditionally ("新しい浮遊ツールバーを ... と書くと"), i.e. a hypothetical future authoring style — which the repo's own rule bans as a gate-expansion rationale: "「将来こう間違えるかもしれない」では足さない。"

(3) The evidence offered for the split being a repo idiom is factually wrong. tabs.tsx:63-74 (TabsTrigger) contains no fixed/sticky/absolute at all; it is a flow-positioned \<button\>. It demonstrates multi-literal cn() authoring, but not the positioning/background co-occurrence split that would be needed to evade this gate. No file in admin demonstrates that split.

(4) The invariant is double-covered where it actually broke. The real accident site (EditorHeader, now src/app/(admin)/admin/(dashboard)/\_shared/components/editor/inline/EditorHeader.tsx:52, "fixed top-0 left-0 right-0 border-b bg-background") is hard-guarded by admin-editor-header-contrast.test.ts:223-240, whose OPAQUE\_HEADER\_GUARDS table asserts expect(headerClass).toBeDefined() so an extraction miss hard-fails rather than silently passing, and which also covers EditorLoading. The E2E axe layer (axe-admin-pages, lexical-toolbar-roving-tabindex) did in fact detect the original violation — the docstring's stated problem is that detection was nondeterministic, not absent — so a hypothetical future regression is still caught, just not deterministically.

(5) The vacuity-check criticism is a restatement of what a lower bound is. Line 165's expect(surfaces.length).toBeGreaterThan(0) is exactly the "走査規模の下限" the repo rule requires; objecting that a new zero-count file could be added without tripping it is objecting to lower-bound assertions in general, not to this gate.

---

## R-37

**script CLI 入口 gate が `import.meta.main` の存在だけを見るので、2 つ目の module-scope exit を素通りさせる**

<sub>[対処の記録](2026-08-12-codebase-audit-progress.md) ／ [指摘全文](2026-08-12-codebase-audit-findings.md)</sub>

- **箇所**: `__tests__/unit/architecture/script-cli-entry-guard.test.ts`
- **領域**: gate（UI / CSP）

### 棄却理由

引用（`__tests__/unit/architecture/script-cli-entry-guard.test.ts:63` の `if (!source.includes("import.meta.main")) {`）は実在し、「gate はファイル内のどこかに `process.exit(` とどこかに `import.meta.main` があるかしか見ていない」という技術的記述も正しい。しかしこれは**現行コードに再現経路が存在しない、将来の回帰に対する仮定の指摘**であり、指摘者自身が「後から 1 行足しても」と書いている通り、存在しないコードを発明しないと失敗が起きない。

(1) 母集合の実測: `__tests__/**` から相対 import されている script は 18 本（test-db-url / migration-preconditions / assert-destructive-db-target / gcp-production-audit-model / lhci-env / ensure-typescript-toolchain / build-baseline-migration / db-census / lint-format / lint-migrations / migrate-test-db / prettier / test-runner-concurrency / setup-local / test-db-runner-env / test-runner-bunfig / type-check / validate）。`process.exit(` を持つ 10 本すべてで、exit 行は `if (import.meta.main) {` の**後ろ**にある（migration-preconditions.ts:887-888 / assert-destructive-db-target.ts:93,102 / build-baseline-migration.ts:243-244 / db-census.ts:467-468 / lint-format.ts:106,112 / lint-migrations.ts:196-197 / migrate-test-db.ts:86-87 / prettier.ts:69,75,78 / setup-local.ts:221,231 / type-check.ts:106,112 / validate.ts:72,79）。gate が守る不変条件は現在**実際に成立している**。false negative を突く行は 1 行も存在しない。

(2) 補助的主張 2 点はいずれも空振り。`.test.tsx` から `scripts/` を import しているファイルは 0 件（grep 空）。非相対（alias）での script import も 0 件で、tsconfig.json:37-43 の `paths` は `@/* → ./src/*` 等のみ、`scripts/` に到達できる alias が存在しない。したがって「母集合外に漏れる script」は現存せず、作れもしない。

(3) この repo の方針が明示的に否定する形の指摘。`.claude/rules/architecture-gates.md`「まず『足すべきか』を判定する」は gate 強化の条件を「実際に main や本番へ漏れた欠陥」「同じ指摘が 2 回以上」に限り、「『将来こう間違えるかもしれない』では足さない」と書いている。さらに同ファイル「手法の限界を認める」は、静的 grep で表現できない不変条件については**粗いまま docstring に書く**ことを許容している。

(4) 元欠陥（#1843）地点には gate とは別の二重防御がある。scripts/assert-destructive-db-target.ts:84-92 に、なぜこのブロックを module scope に裸で置いてはいけないかを 9 行のコメントで残してある（人目に触れる場所に理由が残る形）。

---

## R-38

**turnstile.test.ts が secret 未設定時の fail-open だけを固定し、本番 fail-closed 分岐を 1 件も検証していない**

<sub>[対処の記録](2026-08-12-codebase-audit-progress.md) ／ [指摘全文](2026-08-12-codebase-audit-findings.md)</sub>

- **箇所**: `__tests__/unit/lib/turnstile.test.ts`
- **領域**: テストの空振り（lib）

### 棄却理由

引用は実在する（\_\_tests\_\_/unit/lib/turnstile.test.ts:55、NODE\_ENV を "production" にするテストはこのファイルに 1 件も無い）。しかし失敗シナリオが到達不能で、指摘の核である「本番 secret が外れると全公開フォームで bot 検証が無言で無効化される」は成立しない。

\1) 公開フォームが実際に通るのは lib ではなく domain の validateTurnstile（全 20 箇所以上の Server Action が src/shared/domain/settings/turnstile.ts の validateTurnstile を import。lib の verifyTurnstileToken を直接呼ぶ src ファイルは 0 件）。validateTurnstile は自前の production fail-closed を src/shared/domain/settings/turnstile.ts:101-109 に持つ。
\2) TURNSTILE\_SECRET\_KEY と DB secret が両方外れた状態では、resolveTurnstileVerifyContext (同 :59-62) が enabled = Boolean(siteKey && (secretKeyMasked || env secret)) を false にするため、validateTurnstile は :102 の NODE\_ENV === "production" 分岐でエラーを返して**その時点で終了**し、lib:96 には到達しない（:118 の verifyTurnstileTokenLib 呼び出しより前の早期 return）。つまり lib:97 の条件式を消す・反転しても、指摘が書いた「公開フォームが success:true になる」状態は作れない。
\3) しかもその domain 側の production fail-closed は既にテストがある: \_\_tests\_\_/unit/domain/settings/validate-turnstile.test.ts:106-120「production では Turnstile 無効設定でも token 未検証を成功扱いにしない」（NODE\_ENV="production" を実際に設定し、lib が呼ばれないことまで assert）。指摘は同ファイルを「lib を mock しているので分岐に到達しない」とだけ書き、同じ不変条件が 1 層上で検証済みである事実を落としている。
\4) lib:96-106 が実際に発火しうるのは「DB に secretKeyMasked があり（enabled=true）、env secret が無く、getDecryptedTurnstileSecretKey が復号失敗で null を返す」という狭い組み合わせのみ（api-key-queries.ts:141-156 の safeDecryptToString 失敗）。指摘の到達経路はこの条件を特定しておらず、記述どおりの経路（secret 未設定 → lib:96）はコード上たどれない。

「lib の production 分岐に mutation 耐性が無い」という観測自体は事実だが、それは 1 層上でテスト済みの不変条件に対する二重防御であり、指摘が主張するセキュリティ影響は再現できない。判定基準「失敗シナリオを再現する経路をコード上で具体的に指し示せない場合は refuted」に該当する。

---

## R-39

**「全セクションタイプにデフォルト設定が存在」テストは getDefaultConfig が常に object を返すため必ず通る**

<sub>[対処の記録](2026-08-12-codebase-audit-progress.md) ／ [指摘全文](2026-08-12-codebase-audit-findings.md)</sub>

- **箇所**: `__tests__/unit/lib/validations/section.test.ts`
- **領域**: テストの空振り（lib）

### 棄却理由

引用は実在する（\_\_tests\_\_/unit/lib/validations/section.test.ts:1138 の `expect(getDefaultConfig(type)).toBeDefined();`）。「返り値型が Record\<string, unknown\> なので toBeDefined() は必ず真」という**局所的な観察は正しい**。しかし指摘の帰結——「この assertion が no-op なので registry と SectionType の drift が検知されない」——は誤りで、主張された 2 つの drift はどちらも別の緑のテストが**ハードに落とす**。

(a) SectionType に値を足して definitions への登録を忘れる:
\_\_tests\_\_/unit/architecture/section-registry-clean-break.test.ts:35-39 が
`expect(Object.keys(sectionDefinitions).toSorted()).toEqual(Object.values(SectionType).toSorted())`
で完全一致を要求する。24 対 23 で即赤。さらに同ファイル 41-52 が
section-renderer.tsx に `case SectionType.<KEY>:` の実在も要求するので、二重に落ちる。

(b) 既存 configSchema に既定値なしの必須フィールドを足す:
\_\_tests\_\_/integration/actions/admin/homepage-settings.test.ts:298-310 が
全 SectionType を回して `validateSectionConfig(type, {}).success === true` を要求する
（registry.ts:253 の `def.configSchema.safeParse(config)` を通る）。必須フィールド追加で
safeParse({}) が失敗した瞬間に赤。コメント 299-305 が「例外は無い」を明記し、
page-hero を除外していた頃に実際の本番欠陥（管理画面が custom 既定値に化け renderer が throw）
が出たことまで書いてある。加えて個別 schema 側にも同契約のテストがある
（\_\_tests\_\_/unit/domain/sections/hero-schema.test.ts:16、hero-parallax-schema.test.ts:6、
value-props-schema.test.ts:30-32、section.test.ts:131/179/219/261/617/732/792/915）。

したがって「そのテストが守っているつもりの振る舞いを実際に壊す」経路が存在しない。
実装を変異させても、この行が緑のまま通る一方で必ず他が赤になる。
残るのは「toBeDefined() より toEqual/Object.keys(...).length の方が読み手に強く見える」
という**書き方の好み**であって、判定基準が指摘として認めていないもの。
なお本テストの直後 1142-1153 が HERO/CTA の具体値を、
\_\_tests\_\_/unit/domain/sections/registry.test.ts:222-251 が hero/cta の具体形と
未登録 type の `{}` 返却（241-244、これが唯一この関数固有の実質的な振る舞い）を
それぞれ検査しており、describe ブロック全体が空振りしているわけでもない。

---

## R-40

**async-utils の settleAllWithLogging / withTimeout は本番から 1 件も呼ばれておらず、テストだけが生かしている**

<sub>[対処の記録](2026-08-12-codebase-audit-progress.md) ／ [指摘全文](2026-08-12-codebase-audit-findings.md)</sub>

- **箇所**: `src/shared/lib/async-utils.ts`
- **領域**: テストの空振り（app）

### 棄却理由

失敗ではなく状態の記述であり、要求された「エントリポイント → 関数 → 分岐 → 誤った結果」を構成できない。(1) 事実の核だけは真: `git grep -n "async-utils" -- 'src/*'` は全件 `import { fireAndForget } from "@/shared/lib/async-utils";` のみを返し、namespace import も他の named import も 0 件。`git log -S "settleAllWithLogging" -- src` は導入コミット c1cac58b0 の 1 件だけで、呼び出し元が消えた退行ですらなく最初から未配線。(2) しかし誤った結果を出す経路が存在しない。ユーザー影響・型・DB・実行時のいずれにも異常は無い。(3) gate は破れていない。module-reachability.test.ts は冒頭 docstring 2-3 行目で「到達不能な**モジュール**」と粒度を自己申告しており、.claude/rules/src-boundaries.md も module 粒度で同じことを書いている。指摘はリポジトリが採用していない export 粒度の不変条件を新たに主張しているだけで、.claude/rules/architecture-gates.md は「実際に漏れた欠陥」か「同じ指摘が 2 回以上」でなければ gate を足すなと明記している（4 回目の監査で初出＝どちらも不成立）。(4) テストも空振りではない。\_\_tests\_\_/unit/shared/lib/async-utils.test.ts:69- は timeout / reject / settle の実挙動を assert しており、実装を変異させれば落ちる。任務基準 5 の「壊せないなら refuted」に該当する。

---

## R-41

**data-portable-key を検証すると称するテストの assertion が恒真式（spanCount \>= 0）**

<sub>[対処の記録](2026-08-12-codebase-audit-progress.md) ／ [指摘全文](2026-08-12-codebase-audit-findings.md)</sub>

- **箇所**: `e2e/authenticated/admin/portable-text-editor.spec.ts`
- **領域**: E2E spec

### 棄却理由

引用は実在する（e2e/authenticated/admin/portable-text-editor.spec.ts:93 = `expect(spanCount).toBeGreaterThanOrEqual(0);`）。`Locator.count()` が非負なので恒真、という literal な観察も正しい。しかし指摘が主張する**失敗シナリオは到達不能**であり、守るべき不変条件は**別のテストが直接固定している**ため refuted。

【1】失敗シナリオが原理的に到達不能。指摘は「serialize-spans.ts が span へ data-portable-key を付けなくなると locator が 0 件になるが 0\>=0 で緑のまま」と述べるが、実装を読むとこの locator は**そもそも常に 0 件**である。
(a) src/app/(admin)/admin/(dashboard)/\_shared/components/portable-text/inline-editor/serialize-spans.ts:70-71 — `if (span._type === "span") root.appendChild(doc.createTextNode(span.text));`。\*\*通常の text span は `<span>` 要素にならずテキストノードになる。\*\* `data-portable-key` が付くのは 73-75 行の `else` 分岐、すなわち `iconInline` chip だけ。
(b) 対象ページ `/admin/pages/home/edit` の page-hero title に iconInline は入らない。`createInlineIcon` の seed 呼び出しは prisma/seed.ts:4350 の 1 箇所のみで、Announcement Bar の `message` フィールド専用（`seedAnnouncementBar`）。
したがって baseline が既に 0 件であり、「N 件 → 0 件に退行したのを恒真式が隠す」という筋書きは成立しない。実装をどう変異させてもこのテストの結果（緑）は動かない。

【2】既存カバレッジの申告が事実誤認。指摘は「DOM 属性の実出力を見る gate は他に無い」「unit は auto-section-form.test.tsx に委ねている」と述べるが、\_\_tests\_\_/unit/components/serialize-spans.test.ts が存在し、まさにその DOM 出力を assert している。
\- :125-141「iconInline span は span 要素 + 全 data-attribute で描画される」→ :136 `expect(el.getAttribute(KEY_DATA_ATTR)).toBe(span._key);`
\- :143-164 round-trip → :159 `expect(restored[1]?._key).toBe(original[1]?._key ?? "");`（DOM 属性経由で \_key が保持されることを固定）
serialize-spans.ts:75 の `el.setAttribute(KEY_DATA_ATTR, span._key)` を削除すればこの 2 本は落ちる。指摘が挙げた「key 生成の削除」も createInlineIcon 側の変異で :136 が落ちる。つまり不変条件は保護済み。

【3】属性名変更は defect ではない。リポジトリ全体で literal `data-portable-key` を持つのは serialize-spans.ts:24 の定数宣言 1 箇所と同ファイル JSDoc、そしてこの spec だけ（grep 済み）。apply 側も serialize 側も同じ `KEY_DATA_ATTR` を参照する純内部の往復詳細で、公開レンダラーにも DB にも露出していない。名前を変えても壊れるものが無い＝守るべき契約が無い。

【4】副次的な指摘（84 行で type した文字を assert していない）も、同ファイル 41-54 行の 2 本目が `inlineEditor.getByText("E2E テスト span 入力")` で入力反映をまさに assert している。重複であってギャップではない。

【5】gate/lint の二重防御確認: eslint.config.mjs:504-505 の `e2e-playwright-discouraged` ブロックは恒真 assertion を対象にしていない。他 e2e の `toBeGreaterThanOrEqual(0)` を洗ったところ、architecture gate 群のものは全て `indexOf()` の -1 判定で有意（例: deploy-production-workflow.test.ts、e2e/mobile/admin-mobile.dialog.spec.ts:47-48 は boundingBox の負値を弾く）。恒真なのは本件と mypage-profile-flow.spec.ts:132（Turnstile、best-effort と明記）の 2 件のみで、体系的な欠陥パターンではない。

以上より、実装側に壊せる振る舞いが無く（【1】）、壊せる不変条件は別テストが押さえている（【2】【3】）。残るのは「4 本目のテストが何も検証していない」という記述の正しさだけだが、当のテスト自身が 86-92 行のコメントで「入力直後に key が付くわけではない」「0 でも fail させない」と明示しており、偽の安心を与える偽装 gate ではなく自己申告済みの no-op。削除する価値はあるが欠陥ではない。

---

## R-42

**Turnstile widget のマウントを検証すると称するテストの assertion が恒真式（count \>= 0）**

<sub>[対処の記録](2026-08-12-codebase-audit-progress.md) ／ [指摘全文](2026-08-12-codebase-audit-findings.md)</sub>

- **箇所**: `e2e/authenticated/customer/mypage-profile-flow.spec.ts`
- **領域**: E2E spec

### 棄却理由

引用は実在する（e2e/authenticated/customer/mypage-profile-flow.spec.ts:132 に `expect(count).toBeGreaterThanOrEqual(0);`）。assertion が恒真であることも事実。しかし**申告された失敗シナリオは 2 つとも、毎 push の required check が既に赤にする**ため、指摘の実害部分は成立しない。

(1) 「CSP の frame-src/script-src から challenges.cloudflare.com が落ちる」場合:
`.github/branch-protection.json` の required contexts に含まれる "Smoke E2E (critical path)" が `.github/workflows/ci.yml:422` で `bunx playwright test --project=chromium-smoke` を毎 push 実行する。その母集合（playwright.config.ts:123 `testMatch: /e2e\/smoke\/.*\.smoke\.spec\.ts/`）に入る `e2e/smoke/reservation-submit.smoke.spec.ts:258` が `acquireTurnstileToken` を呼び、`e2e/helpers/turnstile.ts:172` で `expect(turnstileTokenInput(page)).not.toHaveValue("", { timeout: 15_000 })` を**厳格に**待つ。challenge iframe が来なければ 2 回のページ作り直し後に `e2e/helpers/turnstile.ts:177-183` が throw する。

(2) 「getTurnstileSiteKey() が空を返す等で TurnstileWidget が描画されない」場合:
`src/shared/components/turnstile-widget.tsx:83` の `if (!siteKey) return null;` で widget ごと消えるため、`responseFieldName: TURNSTILE_TOKEN_FIELD_NAME` の hidden input（同 :112-113）自体が生成されない。`turnstileTokenInput` の locator が 0 件になり、(1) と同じ assertion が落ちる。site key は playwright.config.ts:28/335 で全 project 共通の E2E テストキー（`1x00000000000000000000AA`）として注入されるので、/mypage/settings 固有の設定分岐は存在しない。

つまり申告された 2 シナリオはどちらも**グローバル設定の破壊**であって /mypage/settings 固有ではなく、required gate が先に落ちる。

さらに既存カバレッジの申告自体が不正確: `acquireTurnstileToken` の利用は申告の 2 本ではなく 3 本で、`e2e/public/turnstile-token-recovery.spec.ts:107` が漏れている。しかもそのうち `reservation-submit.smoke` は「flake risk なので送信まで踏まない」側ではなく、**required gate として実トークン取得まで踏み抜いている**。「公開 surface の Turnstile マウントを見張る E2E はこの 1 本しか無い」は誤り。

残余として「profile-form.tsx からのみ `<TurnstileWidget>` を削除する」経路は既存 gate を素通りする（`__tests__/unit/architecture/turnstile-token-field-single-owner.test.ts:35` の `MIN_WIDGET_CONSUMERS = 15` に対し実際の consumer は 18 なので、1 つ消しても 17 で緑）。ただしこれは申告された失敗シナリオではなく、設定回帰ではなく意図的な行削除であり、`src/app/(public)/mypage/_shared/actions/profile.ts:74-80` の `validateTurnstile` が server 側で必ず reject するため無言の破壊にもならない。判定基準「申告シナリオを再現する経路をコード上で具体的に指し示せない場合は refuted」に従い refuted。

---

## R-43

**terms 再同意の成否判定に使う toHaveURL(/\\/mypage/) が現在地にも一致して常に成立する**

<sub>[対処の記録](2026-08-12-codebase-audit-progress.md) ／ [指摘全文](2026-08-12-codebase-audit-findings.md)</sub>

- **箇所**: `e2e/authenticated/customer/inquiry-reply.spec.ts`
- **領域**: E2E spec

### 棄却理由

引用そのものは実在する（e2e/authenticated/customer/inquiry-reply.spec.ts:57 に `await expect(page).toHaveURL(/\/mypage/u, { timeout: 10000 });`）。「正規表現 `/\/mypage/u` が遷移前の `/mypage/terms/reagree` にも一致する」という文字列レベルの観察も正しい。しかし指摘の中核である**失敗シナリオが実装上到達しない**ため refuted。

(1) 主張された連鎖が allowlist で切れている。`/mypage/inquiries` は再同意 gate の allowlist に入っている（src/app/(public)/mypage/\_lib/reagree-allowlist.ts:18 の `REAGREE_ALLOWLIST_PREFIXES`）。`MypageAuthGate` は src/app/(public)/mypage/layout.tsx:97-107 で `if (!isReagreeAllowlisted(pathname))` を通ってからしか pending を引かないので、**同意 submit が失敗していても 60 行の goto は reagree に差し戻されない**。したがって「67 行の detailLink が terms gate 未消化のせいで落ちる」は起こり得ない。指摘が名指しした「別 subsystem の失敗として報告される」経路自体が存在しない。

(2) その条件付きブロックは seed 済みの E2E run では実行されない。`seedDevCustomerTermsAgreements()`（prisma/seed.ts:3768-3825）が公開済み LOGIN\_SIGNUP 規約すべてについて `sha256(contentHtml)` と一致する `TermsAgreement` を作るため、`getReagreeRequiredTermsForCustomer` の hash 比較（src/shared/domain/terms/queries.ts:301-306）は空配列を返す。すると reagree ページは src/app/(public)/mypage/terms/reagree/page.tsx:58-60 で `/mypage` へ redirect し、「すべてに同意する」ボタンは描画されない → 47 行の `isVisible().catch(() => false)` が false になりブロック全体が skip される。E2E 側で pending を作れる spec も無い: e2e/ 配下に termsDocument / termsAgreement / TermsScope への書き込みは 0 件で、唯一の規約 mutation である content-preview.spec.ts:111-147 の `/admin/terms/new` は create mode の既定が `isPublished: false` / `scopes: []`（use-terms-editor.ts:116-124）のまま保存するので、`isPublished: true` かつ `scopes has LOGIN_SIGNUP` を要求する pending 判定に一切影響しない。

(3) 仮にブロックが走っても、この行は成功時も失敗時も同じ判定になる no-op であり、テストが守るべき振る舞い（返信スレッドへの投稿）は 89-95 行の `postedReply` assertion が保持している。カバレッジの穴は生じない。falsely-green にもならない（失敗すれば必ずどこかで落ちる）。なお、万一走って同意が通らなかった場合の実際の落ちる場所は 67 行ではなく 92 行で、原因は返信 action 側の `assertLoginSignupReagreed`（src/app/(public)/mypage/\_shared/actions/inquiry.ts:56 → consent-gate.ts:65-75 が FORBIDDEN を throw）。指摘は落ちる行も原因サブシステムも取り違えている。

以上より、残るのは「到達しない防御的ブロック内の冗長な assertion」という書き方の好みであり、実装上再現できる欠陥ではない。

---

## R-44

**「マイページ系ルートに noindex」を主張するテストが /login しか開いていない**

<sub>[対処の記録](2026-08-12-codebase-audit-progress.md) ／ [指摘全文](2026-08-12-codebase-audit-findings.md)</sub>

- **箇所**: `e2e/public/mypage.spec.ts`
- **領域**: E2E spec

### 棄却理由

引用は実在する（e2e/public/mypage.spec.ts:51）が、失敗シナリオが到達不能。(1) クローラに対する実効的な制御は robots.txt で、src/app/robots.ts:27 が `/mypage/` を disallow しており、\_\_tests\_\_/unit/app/robots.test.ts:33 の `expect(disallow).toContain("/mypage/")` が削除を落とす。指摘の「既存カバレッジ」申告はこのファイルを完全に見落としている。(2) `/mypage/**` は全て src/app/(public)/mypage/layout.tsx:142 → MypageAuthGate(:66-72) → requireMypageSession(src/shared/lib/customer-auth/gates.ts:30) の配下で、セッションを持たないクローラ／リンクプレビューbotは mypage の HTML を一度も受け取らない。返るのは /login へのリダイレクトで、その noindex は src/app/(public)/login/page.tsx:21 にあり、まさにこのテストが固定している対象。リダイレクト自体も同 spec の :19-45 の 4 本が守っている。よって「共有された /mypage/reservations/\<uuid\> が noindex 無しで配信される」という結果はコード上に経路が存在しない。(3) robots.txt が /mypage/ を disallow している以上、準拠クローラはそもそも取得せず layout.tsx:55 の meta を読まない。line 55 を消しても index 可能になる観測経路は無い（純粋な defense-in-depth）。テスト自体も空振りではなく、未認証 /mypage の実際の着地点である /login の noindex を固定している。残るのはテスト名がやることより広い、という命名上の齟齬だけで、壊せる振る舞いを伴う欠陥ではない。

---

## R-45

**割引ルール配列が「長時間割引 OFF」で保存するたび \[\] に消される（RefundPolicy では同型の罠を明示的に潰しているのに Discount では潰していない）**

<sub>[対処の記録](2026-08-12-codebase-audit-progress.md) ／ [指摘全文](2026-08-12-codebase-audit-findings.md)</sub>

- **箇所**: `src/app/(admin)/admin/(dashboard)/settings/_components/sections/DiscountSection.tsx`
- **領域**: admin 設定フォーム

### 棄却理由

引用（DiscountSection.tsx:184 `{durationDiscountEnabled && (`）は実在し、`[]` が書かれる機械的経路も成立する（conform coercion.mjs:223-233 で undefined→\[\]、discountFormSchema に .min(1) 無し、commerce.ts:58-63 が Json 列を上書き）。しかし指摘を「欠陥」たらしめる 2 本の支柱がどちらも事実に反する。

(1) 「RefundPolicy では同型の罠を明示的に潰している」は誤り。RefundPolicySection.tsx:212 は `{enabled && (` で完全に同じ条件レンダーを使い、refund-policy.ts:53-58 は OFF のとき `policy = null` を渡して commerce.ts:123-126 が `Prisma.DbNull` を書く。tiers も defaultRefundRate も**丸ごと破棄される**。schemas/refund-policy.ts のコメントが潰しているのは「OFF submit が validation で落ちて null 保存経路が UI から到達不能になる」ことだけで、配列の保存ではない（コメント自身が「OFF 時は server action が payload を捨てる」と明言）。つまり「Switch 配下のセクションは OFF 保存で payload を捨てる」がこのリポジトリの既存かつ documented なパターンで、Discount はそれと一致している。非対称は存在しない。

(2) 「既存カバレッジに durationDiscountRules 欠落ケースが無い」も誤り。\_\_tests\_\_/unit/forms/settings-form-empty-optional.test.ts:551 の `test("割引: 全 Switch OFF + 空ルールでも success")` は、`durationDiscountEnabled: ""` / `discountCombinationMode` / `showOriginalPrice: ""` / `expectedUpdatedAt` の 4 キーのみ、すなわち **durationDiscountRules キーを 1 つも含まない FormData** を discountFormSchema に流して success を固定している。指摘が「カバーが無い」と言った payload そのものである。加えて \_\_tests\_\_/unit/domain/settings/commands.test.ts:682 が `durationDiscountEnabled: false` + `durationDiscountRules: []` を正常系として固定している。挙動は見落としではなく意図的に pin 済み。

さらに prisma/schema.prisma:1855 は `durationDiscountRules Json @default("[]")` で `[]` が canonical な「ルール無し」値であり、docs/ にも「無効時にルールを保持する」要件は存在しない。残るのは DiscountSection.tsx:171 の文言が破棄を予告していないという copy の粗さだけで、high 相当の欠陥ではない。

---

## R-46

**保存後に expectedUpdatedAt が再同期されない欠陥は TaxSection 固有ではなく、楽観ロック付き conform フォーム 13 本すべてに存在する（2 回連続保存は必ず CONFLICT、CONFLICT ハンドラの router.refresh() も効かない）**

<sub>[対処の記録](2026-08-12-codebase-audit-progress.md) ／ [指摘全文](2026-08-12-codebase-audit-findings.md)</sub>

- **箇所**: `src/app/(admin)/admin/(dashboard)/settings/features/_components/FeatureModulesForm.tsx`
- **領域**: admin 設定フォーム

### 棄却理由

引用は実在する（FeatureModulesForm.tsx:83 `expectedUpdatedAt: featuresUpdatedAt,`）。conform 側の主張も node\_modules で確認でき、正しい: hooks.mjs:35 で context は useState で 1 度だけ生成、form.mjs:484-494 の onUpdate は formId 変化か lastResult 変化でしか meta を作り直さず、成功 reply（conform-action.ts:113 `submission.reply({resetForm:true})` → initialValue null）は form.mjs:452-453 → 438-441 reset() → 7-11 createFormMeta(latestOptions, true) で initialValue を defaultValue から作り直す。CAS も実在する（features.ts:79-87 の `updateMany({where:{id:"singleton", updatedAt: expectedUpdatedAt}})`、0 行で CONFLICT）。

しかし因果連鎖の中心の 1 環が事実誤認で、そこで話が切れる。「props が更新されるのは useEffect の router.refresh() だけで、それは layout effect の reset() より後」という前提が、この action には当てはまらない。

(1) updateFeatureModulesSettings は afterSuccess で invalidateSiteWideCache を呼ぶ（other.ts:306-320）。site-wide.ts:71 はタグごとに `updateTag(tag)`。
(2) next/dist/server/web/spec-extension/revalidate.js:54-68 の updateTag は profile 無しで revalidate() を呼び、同ファイル 213-215 の `if (!profile)` 分岐で `store.pathWasRevalidated = ActionDidRevalidateStaticAndDynamic` を立てる。
(3) その結果 action-handler.js:963 / :990 の `skipPageRendering` が false になり、**Server Action の応答自体に現在ページを再レンダーした flight data が同梱される**。features ページは `connection()` 済みの完全 dynamic で、getSettings → admin-queries.ts:183 は `use cache` を通さず Prisma を直に読むため、この再レンダーは**書き込み後の新しい features.updatedAt** を載せる。
(4) client 側 server-action-reducer.js:218-239 で revalidationKind ≠ ActionDidNotRevalidate、flightData も定義済みなので 266-273 の bail-out に入らず、297 で FreshnessPolicy.RefreshAll、303-325 で seeded navigation により新しいツリーが適用される。しかも `resolve(actionResult)`（263 行 = useActionState が待っている promise の解決）は新 state を返す前に走り、router 側の state 反映は app-router-instance.js:96 `action.resolve(nextState)`。両者は同一 microtask drain 内で、かつ両方 transition lane（dispatchWithoutFormReset の startTransition と app-call-server の startTransition）なので、React の transition レンダーが走る時点では **lastResult の更新と新しい featuresUpdatedAt prop が同じ 1 コミットに入る**。
(5) よって form.mjs:489 の `Object.assign(latestOptions, options)` が **新しい** defaultValue を入れた直後に 493 report → 453 reset が走り、createFormMeta は新しい expectedUpdatedAt で initialValue を作る。hidden input は再シードされ、2 回目の保存は CAS に一致する。

「2 回連続保存は必ず CONFLICT」という断定は、指摘された場所では成立しない。

E2E の引用も誤用。feature-module-off-gate.spec.ts の retry は各 attempt の先頭で openFeatureSettings(page) を呼び直しており、同一 mount のフォームで 2 回続けて保存する経路が無い。retry が要るのは、同 spec が singleton 行を axe-admin-feature-disabled.spec.ts と共有していて並行に書き換わるからで（spec 内コメントが明記）、client 側 staleness の証拠にはならない。

---

## R-47

**トラッキング方式を切り替えると、非表示になった側の計測 ID（GA4 測定 ID / GTM コンテナ ID）が黙って NULL 化される**

<sub>[対処の記録](2026-08-12-codebase-audit-progress.md) ／ [指摘全文](2026-08-12-codebase-audit-findings.md)</sub>

- **箇所**: `src/app/(admin)/admin/(dashboard)/settings/_components/sections/SeoSection.tsx`
- **領域**: admin 設定フォーム

### 棄却理由

引用は実在する（SeoSection.tsx:330 は `{analyticsType === AnalyticsType.GA4 && (` で一致）。機構の記述も概ね正確で、conform の submit は `getFormData(form, submitter)` = `new FormData(form, submitter)`（node\_modules/@conform-to/dom/dist/formdata.js:56、form.js:365 から呼ばれる）で DOM から作るため、unmount された input は FormData に載らない。したがって analyticsType="none" 保存時は googleAnalyticsId / googleTagManagerId が欠落し、analyticsFormSchema の `.optional()`（form-schemas-seo-analytics.ts:70-71）を素通りし、basic.ts:194-195 の `emptyToNull(undefined)` が null を返し、site-chrome.ts:177-181 の全列置換 upsert が NULL で上書きする。ここまでは事実として確認した。

しかし「これが欠陥である」という主張は成立しない。理由は 3 点。

(1) 同一パターンの兄弟実装で、この clear は**意図的に手書きされている**。LayoutSection.tsx は「hidden input の selector（:204-214）＋ mode 専用フィールドの条件レンダー（:278, :355）」という完全に同じ形で、対応する domain command `updateLayoutSettings`（site-chrome.ts:114-151）は `containerWidth !== "CUSTOM"` のとき `containerWidthCustom = null` を**明示的に代入している**。つまり「mode selector ＋ mode 専用フィールド」では「非適用フィールドは null 化する」がこのリポジトリで採用済みの意味論で、SeoSection の Analytics はその意味論と一致している。指摘は layout の CUSTOM 分岐を「同型のテスト済みケース」として引き合いに出しているが、あのテストは欠陥を防ぐためではなく、この clear 意味論を**固定するため**に存在する。カバレッジギャップの論法が逆向きになっている。

(2) `AnalyticsSettingsInput`（site-chrome.ts:43-49）は 5 フィールドすべてが `string | null` の全置換 command であり、部分更新の契約を持たない。「片方を保持する」は仕様変更であって、既存契約の違反ではない。

(3) 公開側の結果が誤らない。analytics-provider.tsx:96-98 は `config.analyticsType === GA4 && config.googleAnalyticsId` / `=== GTM && config.googleTagManagerId` と **type と ID の両方**で gate しているため、ID を保持しても NULL 化しても公開ページの出力は同一（トラッキングは走らない）。どちらの挙動も正しさに影響しない。無効状態が残る・不正な状態に落ちる経路も無い（GA4 に戻すと superRefine が必須エラーを出すだけで、再入力すれば元に戻る）。

加えて、失われるのは GA4 管理画面から数十秒で再取得できる公開識別子であって利用者データではなく、切替時に入力欄が画面から消える視覚的合図もある。gaPropertyId / microsoftClarityId は常時レンダーなので巻き添えにならず、ダッシュボード統計も壊れない。CLAUDE.md の「直すのは正しさか要件に効くものだけ」に照らして、これは製品判断の領域で、correctness の欠陥ではない。

---

## R-48

**ブロックテンプレートが常に空で保存される（node.exportJSON() は children を返さない）**

<sub>[対処の記録](2026-08-12-codebase-audit-progress.md) ／ [指摘全文](2026-08-12-codebase-audit-findings.md)</sub>

- **箇所**: `src/app/(admin)/admin/(dashboard)/_shared/components/editor/lexical/plugins/BlockTemplatePlugin.tsx`
- **領域**: Lexical プラグイン

### 棄却理由

引用は実在し、Lexical 側の事実関係も正しい（lexical 0.49.0 の ElementNode.exportJSON は children: \[\] を literal で返し、再帰は module-private な $exportNodeToJSON にしかない）。しかし**指摘された失敗シナリオは到達不能**。SaveTemplateDialog が渡す serializedNodes は JS の配列で、zod（action:27 の z.array(z.unknown()) 分岐）も clonePrismaInputJson（JSON.parse(JSON.stringify()) で配列のまま）も形を変えない。その配列が書き込まれる block\_templates.node\_json には CHECK (jsonb\_typeof(node\_json) = 'object') が張られており（prisma/baseline/invariants.sql:42 および init migration:2605、以後の migration に DROP なし）、INSERT は Postgres の check violation で必ず失敗する。この例外は DomainError ではないので executeAdminMutationResult は catch せず再 throw する（admin-action.ts:154-163）。つまり「成功トーストが出る」「DB に children:\[\] の nodeJson が入る」「後日それを挿入して内容が失われる」のいずれも起きない。保存は毎回失敗し、DB には 1 行も入らない。DB 制約が指摘された結果を先に遮断しているため refuted。

---

## R-49

**領収書発行の非 VALIDATION 例外が確認メールとスマートロック解錠パスコードを恒久的に握りつぶす**

<sub>[対処の記録](2026-08-12-codebase-audit-progress.md) ／ [指摘全文](2026-08-12-codebase-audit-findings.md)</sub>

- **箇所**: `src/shared/domain/payment/stripe-webhook/fulfill-reservation-payment.ts`
- **領域**: 決済 webhook テスト

### 棄却理由

引用の `throw error;` は fulfill-reservation-payment.ts:82 に実在し、「claim 消費後に issueReceipt が非 VALIDATION で throw → 500 → Stripe 再送 → claim が null → line 38 早期 return」という機械的な連鎖自体は成立する（route.ts の catch は 500 を返し、dedup は already\_processed 以外で handler を再入させる）。しかし指摘の本体である「確認メールとスマートロック一時パスコードが**恒久的に**発行されず、顧客が入金済みなのに入室できない」は、二重の guard / 再実行経路によって否定される。

(1) **CONFIRMED 予約では被害が原理的に発生しない。** 公開ストアフロントの予約は作成時点で `status: ReservationStatus.CONFIRMED`（src/shared/domain/reservations/public-commands.ts:255）で作られ、パスコードと確認メールは予約作成時に `applyConfirmationSideEffects` で既に発行済み（src/app/(public)/\_shared/actions/reservation.ts:201）。webhook 側は fulfill-reservation-payment.ts:45-46 で `skipConfirmationEmail = true` となり line 104 で return するため、issueReceipt が throw しようがしまいが line 120 には到達しない。つまり本番の主要導線では issueReceipt の throw は確認メール／パスコードに何の影響も与えない。

(2) **PENDING 予約では admin 確認が再実行経路になる。** line 120 に到達しうるのは `status === PENDING`（＝まだ「確認待ち」で admin 確認前）のケースだけ。この予約は CONFIRMED に昇格しない限り確定しないが、PENDING→CONFIRMED の遷移は 4 箇所すべてで `applyConfirmationSideEffects` を再度 fireAndForget する:
\- mutations.ts:93-95 の `status === CONFIRMED && previousStatus !== CONFIRMED` ガード配下 → mutations.ts:119
\- admin.ts:362-363 の `statusFlipToConfirmed` 配下 → admin.ts:415
\- bulk.ts:110（bulkConfirm）
\- mutations.ts:360-362（restore で CONFIRMED に戻す経路）
よって「永久に発行されない」は成立しない。CONFIRMED→PENDING に格下げした場合はそもそも passcode を明示的に revoke する設計（mutations.ts:192-200）で、再確認時に再発行される契約になっている。

(3) **「issueSmartLockPasscodes の呼び出し元は applyConfirmationSideEffects のみ」は事実誤認。** 直接の呼び出し元は 4 つある: confirmation-side-effects.ts:65 / edit-side-effects.ts:206 / assignment-side-effects.ts:141（`issuePasscodesAfterSpaceBound` は `smartLockPasscodes: { none: {} }` の将来 CONFIRMED 予約を明示的に拾う未発行 backfill）/ reissue-passcode.ts:107（smart-lock-cleanup cron 経由）。

(4) **発火条件の見積もりも誤り。** 「毎時走る receipt-backfill との lock 競合で普通に起きる」とあるが、採番ロックは `pg_advisory_xact_lock`（serial.ts:23）で**ブロッキング**ロックであり、競合しても待つだけで throw しない。競合そのものは非 VALIDATION 例外の発生源にならない。残るのは P2024/P2028 等の一過性 DB 障害だけで、「普通に起きる」を支える根拠はコード上に無い。

残る実体は「PENDING 予約について、webhook 契機の確認メール／パスコード発行がその 1 回だけ skip され、admin 確認まで遅延する」という狭い挙動であり、恒久的損失でも入室不能でもない。厳格基準（迷ったら refuted / 恒久被害の経路を指し示せない）に照らして refuted。

---

## R-50

**PAID claim が payment\_intent 欠落/展開形を null として書き込み、返金導線ごと消す**

<sub>[対処の記録](2026-08-12-codebase-audit-progress.md) ／ [指摘全文](2026-08-12-codebase-audit-findings.md)</sub>

- **箇所**: `src/shared/domain/payment/stripe-webhook/fulfill-reservation-payment.ts`
- **領域**: 決済 webhook テスト

### 棄却理由

引用は実在する（fulfill-reservation-payment.ts:30-31）が、失敗シナリオの前提 2 つがどちらも成立しない。

(1) 「展開形（expanded object）」は本経路に到達しない。fulfill に渡る session は src/app/api/webhooks/stripe/route.ts:137 `client.webhooks.constructEventAsync(...)` で検証した event の `event.data.object` を dispatch.ts:24 / :28 がそのまま渡したもので、`checkout.sessions.retrieve(..., {expand:["payment_intent"]})` の戻り値が fulfill に流れる経路は存在しない（fulfillReservationPaymentAtomically の呼び出しは checkout-session-completed.ts:68 と checkout-session-async-payment-succeeded.ts:63 の 2 箇所のみで、いずれも webhook payload そのもの）。Stripe webhook payload は既定 expansion なので `payment_intent` は string か null しか取らない。expanded object を扱う必要があるのは自分で expand して retrieve する resolveCheckoutSessionPaymentIntent 側（checkout-helpers.ts:95-102）だけで、helper 未使用は非対称ではなく入力形の違い。

(2) 「PAID なのに payment\_intent が null」も、本アプリの構成では Stripe が生成しない状態。checkout session は 3 箇所すべて `mode: "payment"`（reservations/payment-commands.ts:285, events/payment-commands.ts:241, :515）で、node\_modules/stripe/cjs/resources/Checkout/Sessions.d.ts:212-215 の定義どおり `payment_intent` が null になるのは setup / subscription モード。さらに到達には二重の gate を通る必要がある: handleCheckoutSessionCompleted は `session.payment_status === "paid"` の枝でのみ fulfill し（checkout-session-completed.ts:46）、その前に checkoutSessionAmountMatchesExpected（checkout-helpers.ts:308-334）が `amount_total === 期待額` を要求、期待額は totalPriceWithTax \> 0 のときしか返らない（payment-queries.ts:182-189）。つまり PI を持たない現実的な session（amount 0 / no\_payment\_required / setup）は fulfill 前に fail-closed で弾かれる。

(3) 「savePaymentIntentId が保存した pi\_\* を null で上書き」も同様。上書きには「completed(unpaid) では payment\_intent が string だったのに、同一 session の async\_payment\_succeeded では消えている」ことが必要で、payment\_intent は session の属性であり後から null に戻らない。

(4) null は「焼き付く事故」ではなく明示的にモデル化された状態。claimReservationAsPaid の引数型は `stripePaymentIntentId: string | null`（payment-queries.ts:85-87）で、claim miss 時の handlePaidClaimMissWithOrphanRefund には `missingPaymentIntent` 通知（「PaymentIntent ID が不明なため自動返金できません（要確認）」payment-queries.ts:131-137）が用意されている。

コード上で再現経路を指し示せないため refuted。

---

## R-51

**PAID claim が stripePaymentIntentId を null で焼き、以後この申込は返金導線から完全に外れる**

<sub>[対処の記録](2026-08-12-codebase-audit-progress.md) ／ [指摘全文](2026-08-12-codebase-audit-findings.md)</sub>

- **箇所**: `src/shared/domain/payment/stripe-webhook/fulfill-event-registration-payment.ts`
- **領域**: webhook ルーティング・Resend

### 棄却理由

引用は実在する（fulfill-event-registration-payment.ts:73-74）が、`paymentIntentId === null` に到達できない。(1) この関数の呼び出し元は 2 箇所だけ（Grep で確認: checkout-session-completed.ts:108, checkout-session-async-payment-succeeded.ts:88）。どちらも直前に `checkoutSessionAmountMatchesExpected`（checkout-helpers.ts:301-356）を通し、false なら return する（checkout-session-completed.ts:97-106 / async:77-86）。この関数は `session.amount_total == null || expectedAppAmount == null` で false を返し（:308-327）、通過するのは `session.amount_total === toStripeUnitAmount(expectedAppAmount)` のときだけ（:332）。`getEventRegistrationCheckoutExpectedAmount`（events/payment-queries.ts:172-191）は `paidAmount > 0` か `ticket.price * quantity > 0` のときしか非 null を返さないため、fulfill に到達した時点で **amount\_total \> 0 が保証されている**。(2) Checkout Session は全て `mode: "payment"` で作られる（events/payment-commands.ts:241, :515）。Stripe の型定義そのもの（node\_modules/stripe/esm/resources/Checkout/Sessions.d.ts:213-215）が `payment_intent` を「The ID of the PaymentIntent for Checkout Sessions in `payment` mode」と定義しており、webhook payload は expand されないので文字列で届く。mode=payment かつ amount\_total\>0 のセッションに PaymentIntent が存在しないケースは無い（null になるのは setup/subscription mode か amount\_total=0 で、どちらも上のガードで排除済み）。よって null 分岐は防御的な到達不能コードで、DB に null が焼かれる経路をコード上で指し示せない。

---

## R-52

**saveEventRegistrationPaymentIntentId に session 一致ガードが無く、docstring が主張する reservation との「同型」が成立していない**

<sub>[対処の記録](2026-08-12-codebase-audit-progress.md) ／ [指摘全文](2026-08-12-codebase-audit-findings.md)</sub>

- **箇所**: `src/shared/domain/events/payment-queries.ts`
- **領域**: webhook ルーティング・Resend

### 棄却理由

引用は実在する（src/shared/domain/events/payment-queries.ts:212-215）。session ガードが無いという「形の非対称」自体は事実で、reservation 側 :290-291 との差分も指摘どおり。しかし**主張された失敗（誤った PI が使われる）に到達する経路がコード上で塞がっている**ため棄却する。

(1) 主張された harm 経路が実在しない。指摘は「cron unpaid-expiry.ts:186 → applyEventRegistrationCancellationSideEffects → run-side-effects.ts:56 が拾う PI が取り違えたものになる」と言うが、run-side-effects.ts:53-56 は `wasPaid = paymentStatus ∈ {PAID, PARTIALLY_REFUNDED}` かつ `requiresRefund = wasPaid && stripePaymentIntentId !== null` である。一方 cron の候補集合 unpaid-expiry.ts:39-41 / 65-67 は `paymentStatus ∈ {UNPAID, PENDING, FAILED}` に限定され、cron は status のみ CANCELLED にして paymentStatus を触らない（:140-145）。したがってこの経路では `wasPaid` は構造的に false で、runRefundStep は skip される。指摘の failure シナリオの終端は成立しない。

(2) stale 値は PAID 到達時に必ず上書きされる。claimEventRegistrationAsPaid は buildPaidClaimUpdateData（payment-status-guards.ts:62-66）で `stripePaymentIntentId` を webhook payload 由来の値（fulfill-event-registration-payment.ts:73-74 の `session.payment_intent`）で**無条件に置換**する（null でも置換）。DB の stale 値を読み返す経路は無い。events/payment-queries.ts:198-204 の docstring の記述はこの点で正しい。

(3) 金を動かす consumer は全て PAID を要求する。返金は payment-commands.ts:888-900 が `PAID / PARTIALLY_REFUNDED` 以外を弾く。waitlist の自動返金は DB ではなく `resolveCheckoutSessionPaymentIntent(session)`（fulfill-event-registration-payment.ts:40-43）から PI を取る。DB の PI を fallback に使うのは payment-claim-orchestration.ts:79-80 だけで、そこは `current.status === CANCELLED` かつ webhook 側 PI が非 string のときに限られ、しかも 2 つの PI は同一 registration・同一顧客のもので、死んだ PI への refund は Stripe 側でエラーになる（誤送金にならない）。

(4) 「WHERE が PENDING のみで reservation の \[UNPAID, PENDING\] より狭い」は、この指摘の文脈では**弱いのではなく強い**。stale 上書き懸念に対して PAID/FAILED/REFUNDED を守っているのは PENDING 限定の側で、reservation の方が入口が広い。指摘は狭さを追加の欠陥として数えているが、方向が逆。

(5) 到達条件自体も多重に狭い。async 分岐に入るのは konbini / customer\_balance のみ（card は必ず payment\_status="paid"）。さらに event.id dedup（route.ts:160-166、stripe-events/dedup.ts:36-59）があるため、session A の completed が**初回配送で失敗**していないと再配送で handler に入らない。加えて再決済で FAILED→PENDING に戻す createEventCheckoutSessionCommand:191-198 の直後 60 分以内に stale retry が着弾する必要がある（UNPAID\_EVENT\_REGISTRATION\_EXPIRY\_MINUTES=60 の cron が PENDING 行を CANCELLED に掃くため、それを過ぎると status≠CONFIRMED で再 checkout 自体できない）。この全条件を満たしても、残る影響は「PENDING 期間中 admin に表示される PI が同一申込の古い PI になる」だけで、PAID 時に自己修復する。

テスト側の申告（routing test:1026-1029 が 2 引数で固定）は事実だが、それは欠陥の帰結ではなく現契約の写しであり、独立した欠陥ではない。

---

## R-53

**Cloud Scheduler 監査は job の state を取得していない — paused な cron job が全て緑で通る**

<sub>[対処の記録](2026-08-12-codebase-audit-progress.md) ／ [指摘全文](2026-08-12-codebase-audit-findings.md)</sub>

- **箇所**: `scripts/audit-gcp-production-iap.ts`
- **領域**: 本番インフラ gate

### 棄却理由

引用は実在する（scripts/audit-gcp-production-iap.ts:1494 の projection は `json(name,httpTarget.uri,httpTarget.headers,httpTarget.oidcToken)`）、readCloudSchedulerOidcJobErrors（scripts/gcp-production-audit-model.ts:1330-1405）も state を一切読まない。ここまでは事実。しかしこれは「誤った結果を出す欠陥」ではなく「存在しない検査」の指摘であり、失敗シナリオを起こすコード経路がリポジトリ内に無い。(1) check の契約は auth 設定のみ。表示名は "Cloud Scheduler cron jobs use Google OIDC tokens only"、docs/gcp-production-setup.md:1410-1412 が契約を明文化している（oidcToken.serviceAccountEmail / audience / 旧 Authorization ヘッダ不在）。paused な job に対して PASS を出しても、この check は嘘を言っていない。liveness を主張している箇所は docs にも script にも無い。(2) トリガがコード外。`grep -rn "paused|PAUSED"` を \*.ts/\*.tf/\*.yml/\*.md 全体（node\_modules/.terraform 除く）に掛けると .remember の無関係な 1 行以外ゼロ。paused 状態は terraform config にも script にも存在せず、発生には「operator が gcloud で手動 pause する」か「PR レビューを通して `paused = true` を明示追加する」しかない。前者はコード経路ではなく、後者は意図的な承認済み変更。(3) 「schedule / timeZone / attempt\_deadline も同様」は誤り。terraform/cloud\_scheduler.tf:241-270 の resource block はこの 3 つを config に明示設定している（schedule = each.value.schedule / time\_zone = "Asia/Tokyo" / attempt\_deadline = "300s"）ため、手動変更は terraform plan に diff として出る。.github/workflows/terraform-drift.yml が毎晩 `terraform plan -detailed-exitcode -lock=false` を回し、exit 2 で自己解消型 Issue を開く（同ファイル:107-135, 199-295）。この 3 フィールドについては二重防御が実在する。(4) 影響の誇張。pending-reservation-expire は src/app/api/cron/pending-reservation-expire/route.ts の JSDoc が明記するとおり、Stripe `checkout.session.expired` webhook →`claimReservationAsFailed` が届かない場合の**最終セーフティネット**。「枠が永久に予約不能」には webhook 経路の失敗と cron 停止の 2 重障害が要る。(5) 指摘の本体は「PAUSED な見本が無いので変異検査で検出できない」＝存在しない gate の要求であり、CLAUDE.md の「新しい gate を足すのは実際に起きた欠陥に対してだけ」に真っ向から反する。cron が pause されて障害になった記録はリポジトリにもメモリにも無い（記録があるのは課金停止による 7 時間の 503 で、それは uptime.yml で対処済）。加えて、pause を terraform drift が拾うか否かは Google provider の `paused` schema が Optional+Computed かどうかに依存するが、provider は linux バイナリのみでソースが手元に無く確定できない（判定基準 5 により、この点に依拠する主張はどちら向きでも採用しない）。

---

## R-54

**Cloud Run の max\_instance\_count が監査対象外 — MAX\_INSTANCES\_HINT との一致は誰も検査していない**

<sub>[対処の記録](2026-08-12-codebase-audit-progress.md) ／ [指摘全文](2026-08-12-codebase-audit-findings.md)</sub>

- **箇所**: `scripts/gcp-production-audit-model.ts`
- **領域**: 本番インフラ gate

### 棄却理由

引用は実在する（scripts/gcp-production-audit-model.ts:280）。カバレッジに関する事実申告も概ね正しい：`grep -rn "max_instance_count|maxScale" __tests__/ scripts/` は 0 件で、scripts/audit-gcp-production-iap.ts も autoscaling.knative.dev/maxScale を一度も読まない。だが指摘は**現在のコードにある欠陥ではなく、将来の人為的編集に対する gate の不在**であり、以下の理由で棄却する。

(1) **現状は整合している。** terraform/cloud\_run\_public.tf:50 と cloud\_run\_admin.tf:51 の `max_instance_count = 1`、terraform/variables.tf:84-88 の `max_instances_hint` default `"1"` は一致している。誤った結果を生む経路が**今のコードには存在しない**。失敗シナリオは「cloud\_run\_public.tf:50 を = 4 に上げる」という仮想の編集から始まっており、判定基準「失敗シナリオを再現する経路をコード上で具体的に指し示せない場合は refuted=true」に該当する。

(2) **申告された到達経路が production failure に接続しない。** \_\_tests\_\_/unit/architecture/gcp-production-audit.test.ts:759-789 は `readCloudRunRuntimeEnvErrors` に fixture の `spec.template.spec.containers[0].env` と手書きの `expectedEnv`（APP\_SURFACE / BETTER\_AUTH\_URL の 2 key のみ）を渡す純関数テストで、実インフラも AUDIT\_PUBLIC\_CLOUD\_RUN\_PLAIN\_ENV\_KEYS も参照していない。この `toEqual([])` は「maxScale を検査して問題なしと判定した」ではなく、そもそも maxScale を主張していない関数の見本入力にすぎない。エントリポイントではない。

(3) **scripts/audit-gcp-production-iap.ts は gate ではない。** package.json:45 の `gcp:audit-production-iap` から手動起動する ops スクリプトで、`.github/` 配下に一切参照が無い（参照は docs/gcp-production-setup.md・docs/admin-access.md・docs/runbooks/gcp-dead-resource-cleanup.md のみ）。gcloud 認証を要する本番向け手動監査であり、引用した JSDoc 自身が "Subset of runtime plain env verified live" と範囲を明示している。明示された subset に含まれていないことを「誰も検査していない欠陥」と呼ぶのは筋が通らない。

(4) **key レベルの同期は既に gate 済み。** MAX\_INSTANCES\_HINT / RATE\_LIMIT\_BACKEND は model:246-261 の TERRAFORM\_CLOUD\_RUN\_COMMON\_ENV\_KEYS に含まれ、\_\_tests\_\_/unit/architecture/gcp-production-audit.test.ts:1855-1863 が extractTerraformHclMapKeys で locals\_cloud\_run.tf:25-39 の実キー集合と突き合わせている。未検査なのは「スケーリングのリテラル値 対 hint の値」だけで、「MAX\_INSTANCES\_HINT が丸ごと検査対象外」ではない。

(5) **本リポジトリの明文化された方針に真っ向から反する。** CLAUDE.md「新しい gate を足すのは、実際に起きた欠陥に対してだけ。『将来こう間違えるかもしれない』で増やさない」、.claude/rules/architecture-gates.md「足してよいのは、実際に main や本番へ漏れた欠陥がある / 同じ指摘がレビューで 2 回以上出た のどちらかのときだけ」。この指摘は実発生の欠陥を 1 件も示していない。

なお終端の被害主張も過大。max=4 でも DATABASE\_POOL\_MAX は per-instance の上限であって即時確保ではなく、96 conn は「同時に 4 インスタンスが各 2 サービス分のプールを飽和させたとき」の理論上限で、「接続枯渇による本番停止に至る」は確定事象ではない。

---

## R-55

**Cloud Run 監査は spec.template（願望）だけを読み、実際にトラフィックを受けている revision を見ていない**

<sub>[対処の記録](2026-08-12-codebase-audit-progress.md) ／ [指摘全文](2026-08-12-codebase-audit-findings.md)</sub>

- **箇所**: `scripts/gcp-production-audit-model.ts`
- **領域**: 本番インフラ gate

### 棄却理由

引用は実在する（scripts/gcp-production-audit-model.ts:810 の `["spec","template","spec","containers"]`）。「audit は status.traffic / status.latestReadyRevisionName を一切読まない」という**事実部分も正しい**（scripts/ 配下を grep して traffic / latestReadyRevision のヒットはゼロ。audit-gcp-production-iap.ts:615-636 は `--format=json` 全体を取るが、model 側の reader が template しか辿らない）。しかし**失敗シナリオが到達不能**なため棄却する。

(1) 引き金がリポジトリに存在しない。指摘自身が「terraform/cloud\_run\_public.tf:123-126 を REVISION 固定に**変えたら**」という将来の編集を前提にしている。現状は cloud\_run\_public.tf:123-126 / cloud\_run\_admin.tf:121-122 とも `TRAFFIC_TARGET_ALLOCATION_TYPE_LATEST` / `percent = 100`。もう一方の引き金である手動 `gcloud run services update-traffic --to-revisions=` は docs/ 全体を grep してもヒット 0 件で、どの runbook にも書かれていない。docs/gcp-production-setup.md:533-535 が示すこのリポジトリの唯一のロールバック手段は Secret Manager version pin（terraform/variables.tf `cloud_run_secret_versions`）の巻き戻し＝**template 側の変更**であり、まさに audit が読んでいる場所に現れる。

(2) 二重防御がある。cloud\_run\_public.tf:128-135 の `ignore_changes` は `template[0].containers[0].image` と `template[0].revision` だけで、`traffic` block は含まれない。かつ .github/workflows/deploy-production.yml:56（terraform-apply）→ :204-206（deploy は `needs: terraform-apply`）で、本番 deploy のたびに terraform apply が走り traffic を LATEST 100% に戻す（plan は artifact 化＋job summary に出力）。手動 traffic pin は次回 deploy で消える drift でしかない。

(3) 現実的な「template ≠ 実配信 revision」の分岐は既存 check が赤にする。traffic=LATEST 下で両者がずれる唯一の自然な経路は「新 revision が Ready にならず旧 ready revision が配信を続ける」ケースだが、これは model:1286-1307 `readCloudRunRevisionHealthErrors` が Ready≠True の revision を全件検出し、audit:895-916 の `public Cloud Run revisions are healthy` が赤になる。さらに cloudbuild.yaml:528-540 の deploy step は `gcloud run services update --image`（revision が ready になるまで待って非ゼロ終了する）なので deploy job 自体も落ちる。

(4) 監査対象は CI gate ではない。`gcp:audit-production-iap` は package.json:45 の手動 script で、.github/workflows/ のどこからも呼ばれていない（grep 済）。前提にある unit 824 / integration 157 の緑とは無関係で、「テストが隠している」構造ではなく「operator 用ツールの死角」にすぎない。

---

## R-56

**IAP アクセス検査が resource-level policy しか読まず、project-level の roles/iap.httpsResourceAccessor を永久に見逃す**

<sub>[対処の記録](2026-08-12-codebase-audit-progress.md) ／ [指摘全文](2026-08-12-codebase-audit-findings.md)</sub>

- **箇所**: `scripts/audit-gcp-production-iap.ts`
- **領域**: 本番 IAP 監査スクリプト

### 棄却理由

引用と静的な事実関係は正確だが、「line 1014 固有の high 深刻度の欠陥」という主張は成立しない。(1) これは 1014 固有の欠陥ではなく、resource-level getIamPolicy を使う監査手法そのものの性質で、同一スクリプト内の 8 箇所（scripts/audit-gcp-production-iap.ts:834/968/1025/1121/1178/1221/1284/1364）全部に等しく当てはまる。たとえば 968 が backing する "admin Cloud Run is not public"（1025 直前, 1124-1129 行目付近の addCheck）も、project-level の `roles/run.invoker` → `allUsers` を継承で見逃す。指摘はその中の 1 role を恣意的に切り出しているだけで、しかも IAP を完全に迂回する run.invoker の方がむしろ深刻。(2) 前提条件は「project IAM に setIamPolicy できる principal が、docs に一度も出てこないコマンドを叩く」こと。docs/gcp-production-setup.md:1170-1179 の正規手順は `gcloud iap web add-iam-policy-binding --resource-type=cloud-run` で resource-level、docs:1193 と 1203-1206 の運用ルール（`user:*` 直付け禁止・移行時の `user:*` 除去）が想定する失敗形は resource policy 上にあり、それは 1014 が現に検出する。すなわち「文書化された失敗モードを gate が見逃す」は誤り。(3) docs:1540-1577 の "audited production target posture" は 12 項目の列挙で、その中に「project-level に arbitrary member の iap.httpsResourceAccessor が無いこと」は入っていない。docs:1576-1577 の「gate for proving the live posture」は "this target"（= その列挙）を指すので、gate が破っている約束は存在しない。(4) 侵入面の実害は指摘自身が認める通り fail-closed で止まる（src/shared/domain/admin-auth/google-role-sync.ts:255 `if (matchedRoles.length !== 1) return null;` → dashboard role 無し）。IAP 外周に到達しても権限は得られない。(5) project IAM に setIamPolicy 権限を持つ攻撃者は、そもそも roles/owner / roles/editor / roles/secretmanager.admin なども付与できる（いずれも監査対象外）ので、この 1 role の検出有無は脅威モデルを変えない。境界は project IAM 書込権限側にある。(6) CLAUDE.md の明文規約「新しい gate を足すのは、実際に起きた欠陥に対してだけ。将来こう間違えるかもしれない、で増やさない」に真正面から反する、実発生ゼロの仮定に対する gate 追加要求である。

---

## R-57

**charge.refunded の手組み fixture が、pin した Stripe API では送られてこない `refunds.data` を持っている（Refund 行書込経路が本番で丸ごと死ぬ）**

<sub>[対処の記録](2026-08-12-codebase-audit-progress.md) ／ [指摘全文](2026-08-12-codebase-audit-findings.md)</sub>

- **箇所**: `__tests__/unit/api/stripe-webhook.test.ts`
- **領域**: 決済テストの共有 mock

### 棄却理由

引用は実在する（\_\_tests\_\_/unit/api/stripe-webhook.test.ts:497-499）が、指摘の 3 つの柱がいずれも成立しない。

【1】load-bearing な前提「pin した API では refunds が送られてこない」が確定できない。指摘が根拠に挙げた node\_modules/stripe/CHANGELOG.md:2543 は **stripe-node 10.6.0 (2022-08-26)** のエントリで、同じ行に「This is a bug fix. These fields were all actually optional and not guaranteed to be returned by the Stripe API, however the type annotations did not correctly reflect this.」と書いてある。つまり **TypeScript の型注釈の修正**であって「API version で Charge.refunds が既定で返らなくなった記録」ではない。しかも 2022-11-15 より前の版で、指摘が主張する API 挙動変更とは別物。もう一方の根拠 node\_modules/stripe/esm/resources/Charges.d.ts:194 `refunds?: ApiList<Refund> | null;` が示すのは「SDK 型が optional」までで、apiVersion "2026-07-29.dahlia"（node\_modules/stripe/cjs/apiVersion.d.ts と src/shared/lib/stripe.ts:96 で一致）における webhook payload の既定 expand 挙動は node\_modules から一切確定できない。任務 5 の「確定できないなら refuted」に該当する。

【2】mock 指摘としての主張（任務 4）が自壊している。src/shared/domain/payment/stripe-webhook/charge-refunded.ts:51 は `charge.refunds?.data[0]` と optional chaining で、`refunds: undefined`（本番の想定形）と `refunds: { data: [] }`（fixture の形）は \*\*どちらも `latestRefundData === undefined` の同一分岐に収束\*\*する。よって fixture の形の差が実装の振る舞いを隠すことは原理的にない。さらに「refunds 不在」時の振る舞いは stripe-webhook.test.ts:1133 が `latestRefund: null` を渡すことを assertion で固定済み。「実装をこう変えても全部緑のまま」という具体的な変異を提示できない。二重の守りもある: 型が `refunds?: ... | null` なので `charge.refunds.data[0]`（non-optional）に書き換えれば type-check が落ちる。

【3】blast radius が事実誤認。「Refund 行書込経路が本番で丸ごと死ぬ」は誤り。app 起点の返金 7 経路（src/shared/domain/reservations/payment-commands.ts:776, 994, 1144 / src/shared/domain/events/payment-commands.ts:974, 1198, 1361, 1519）はいずれも自分の tx 内で `createRefundRecordIdempotent`（src/shared/domain/payment/stripe-refund-orchestration.ts:267）を呼んで Refund 行を同期的に書いており、webhook は書込の唯一の経路ではない。charge-refunded.ts:56-58 の「webhook 先着 race で attribution が mislabel されるのを防ぐ」というコメント自体が、app 経路が通常先に行を書く前提を明示している。したがって失敗シナリオ (b)(c) の「返金残額が 0 円と判断され全額再返金を提示」「RefundedByType 復元が到達不能」は、app 起点の返金では起こらない。

---

## R-58

**email-mock-hygiene gate の allowlist 3 件がすべて走査範囲外で到達不能、かつ走査外に実際の違反ファイルがある**

<sub>[対処の記録](2026-08-12-codebase-audit-progress.md) ／ [指摘全文](2026-08-12-codebase-audit-findings.md)</sub>

- **箇所**: `__tests__/unit/architecture/email-mock-hygiene.test.ts`
- **領域**: 決済テストの共有 mock

### 棄却理由

The two factual sub-claims check out, but the failure scenario built on them does not. Verified true: the quote exists at email-mock-hygiene.test.ts:16; the 3 ALLOWED\_PARTIAL\_EMAIL\_DIRS (16-18) sit under no testRoots entry (6-12), so isAllowedPartialEmailMock's startsWith prefix test (37-41) is an unreachable branch; and \_\_tests\_\_/unit/receipts/resend-action.test.ts:89 does trip usesPartialEmailMock while living outside every root, with no second gate covering it. What refutes the finding is its stated harm. It claims the gate was placed to prevent "add an export to lib-dispatch and this one file dies with Export named 'X' not found", and that the gate is blind to that file. But the shared helper the gate mandates, \_\_tests\_\_/support/email-lib-dispatch-mock.ts:12-42, returns a hardcoded 28-name object literal with no spread of the real module. Add export #29 to src/shared/domain/email/lib-dispatch.ts and all 41 helper-using files break the exact same way, because their mock namespace lacks the name too. The gate cannot prevent that failure class for any file, in scope or out; it only centralises the stub list so the fix is one file instead of N. So "this file alone would fall" is false and compliance would not have prevented the described breakage. Two supporting points. First, the residual harm is a loud single red test file, never a false green, so there is no correctness or production exposure. Second, the scope hole is empirically self-limiting: every predicate-tripping file outside testRoots is either in a directory the author explicitly deemed exempt (22 files in unit/shared/lib/email, 1 in unit/emails) or is the single resend-action.test.ts. Widening the sweep to all of \_\_tests\_\_/unit would activate the allowlist as designed and surface exactly one offender whose remediation changes no behaviour. Git history closes it: the narrow testRoots and the allowlist were added together in commit a677544, so the allowlist is day-one defensive redundancy, not a live exemption stranded by a later narrowing. The gate also satisfies this repo's own vacuity rule in .claude/rules/architecture-gates.md, with a scale floor at line 88 and a mutating fixture at 61-84. No reproducible defect path exists.

---

## R-59

**共有 email mock が 22 個の export に同一 mock インスタンスを割り当てている（呼出回数が全 export で合算される）**

<sub>[対処の記録](2026-08-12-codebase-audit-progress.md) ／ [指摘全文](2026-08-12-codebase-audit-findings.md)</sub>

- **箇所**: `__tests__/support/email-lib-dispatch-mock.ts`
- **領域**: 決済テストの共有 mock

### 棄却理由

引用は実在する（`__tests__/support/email-lib-dispatch-mock.ts:9` の `const okAsync = mock(async () => OK_EMAIL_RESULT);`）し、「1 個の mock インスタンスが複数キーに入っている」という観察自体も事実。しかし失敗シナリオが到達不能であり、指摘は「将来こう書いたら踏む」という仮定の危険性にとどまる。

(1) 共有インスタンスへの参照経路が存在しない。`okAsync` / `noopAsync` は `createEmailLibDispatchMockModule` 内部のローカル変数で、外へ出る唯一の口は返り値オブジェクト。ところが全 30 ファイルは `installEmailLibDispatchMock()`（同 45-51 行）しか呼んでおらず、これは返り値を `mock.module` に渡して捨てる。`createEmailLibDispatchMockModule(` の呼出は repo 全体で 0 件（唯一の grep ヒット `__tests__/unit/architecture/email-mock-hygiene.test.ts:75` は gate の fixture 内の**文字列リテラル**であって呼出ではない）。`import("@/shared/domain/email/lib-dispatch")` / `from "@/shared/domain/email/lib-dispatch"` を書いているテストも 0 件。つまり失敗シナリオの前提「mock module を再 import して `expect(mod.sendReservationCancelledEmail)` と書く」を成立させる経路が、現状のコードベースに 1 本も無い。

(2) 観測対象の export は必ず専用 spy で override されている。決済区画の全ファイルを実際に確認した: `admin-reservation-payment.test.ts:73`（`sendReservationRefundEmail` → `mockSendReservationRefundEmail`）、`payment-queries.test.ts:160`（同左）、`stripe-webhook.test.ts:334-338`、`stripe-webhook-orphan-refund.test.ts:257`、`stripe-webhook-event-dedup.test.ts:218`、`stripe-webhook-event-registration-routing.test.ts:266`、`cancellation-with-refund-policy.test.ts:146`。いずれも 1 キー = 1 spy で、同一 spy を複数キーに割り当てているものは無い。assertion も `mockReset()`（例: `cancellation-side-effects.test.ts:255-256`）もテスト側ローカルの spy を指しており、共有インスタンスには触れない。共有側は「観測しない export」専用で、これは helper の docstring「domain lib-dispatch の named export をすべて提供する stub（部分 mock 禁止）」が意図している役割そのもの（`.claude/rules/testing.md` の「完全置換なので named export を全列挙する」に対応）。

(3) 任務 4 の判定基準（「実装をこう変えても全部緑のままになる」ことを確認できなければ refuted）を満たさない。この指摘は「production の振る舞い X が検証されないまま緑になる」とは主張していないし、実際そういう X を指し示せない。非 override の export は定義上どのテストも assertion を置いていない export であり、共有によって失われている検証は存在しない。

(4) 傍証として挙げられた `stripe-webhook.test.ts:340-353` の `noopReservationEmailAsync` も同様に無害。grep の結果、この識別子は定義 1 行と 7 キーへの代入のみで出現し、assertion は 0 件。`sendReservationConfirmationEmail` だけが別 mock (`mockSendReservationConfirmationEmail`, 344-345 行) に分離されており、観測したい 1 本は共有から外してある。

(5) 指摘自身が「現状 override していない export に assertion を置いているテストは見当たらないため未発火」と未発火を認めている。これは CLAUDE.md / `.claude/rules/architecture-gates.md` が明示的に対象外としている「将来こう間違えるかもしれない」型の予防的指摘に該当する。

---

## R-60

**\_\_tests\_\_/mocks/ が errors-server 以外どこからも import されておらず、`$transaction` がコールバックを実行しない prisma stub が残っている**

<sub>[対処の記録](2026-08-12-codebase-audit-progress.md) ／ [指摘全文](2026-08-12-codebase-audit-findings.md)</sub>

- **箇所**: `__tests__/mocks/prisma.ts`
- **領域**: 決済テストの共有 mock

### 棄却理由

引用は実在する（\_\_tests\_\_/mocks/prisma.ts:166 `$transaction: mock(() => Promise.resolve([])),`）。「errors-server.ts 以外は repo 内のどこからも import されていない」という事実も再現できた（Grep の結果、mocks/\* を import しているのは errors-server のみ。他所に出てくる `mockPrisma` は \_\_tests\_\_/unit/domain/pages/system-pages-commands.test.ts:33 と \_\_tests\_\_/unit/domain/reservations/public-booking-gates.test.ts:205 のローカル定義で、mocks/prisma.ts 由来ではない）。しかし「失敗シナリオ」は現行コード上に到達経路が存在しない。(1) createMockPrismaClient() を呼ぶテストが 1 本も無いので、いま緑になっている vacuous なテストは 0 件。指摘は「将来こう書いたら」という仮定であって欠陥ではない。(2) その仮定の書き方自体が型検査で落ちる。`$transaction` の型は MockFunction = `ReturnType<typeof mock<() => Promise<unknown>>>`（prisma.ts:13,96）で、node\_modules/bun-types/test.d.ts:2016-2018 の `Mock<T>` は `(...args: Parameters<T>): ReturnType<T>` なので引数 0 個。`mockPrisma.$transaction(async (tx) => ...)` は TS2554（Expected 0 arguments, but got 1）になる。tsconfig.test.json は `__tests__/**/*.ts` を include し、scripts/type-check.ts:41-57 の tsc:test がこれを走らせるので、コールバック形式で呼ぶコードはそもそも型検査を通らない。(3) シナリオが名指しする書き込み自体も型に存在しない。MockPrismaClient(prisma.ts:86-98) に `refund` も `payment` も無く、MockReservation(prisma.ts:15-23) に `updateMany` も無い。`tx.refund.create` / `reservation.updateMany` を createMockPrismaClient() 相手に書くことはできない。(4) 決済まわりの実装は `$transaction` を使っていない。src/shared/domain/payment/stripe-refund-orchestration.ts に `$transaction` の出現は 0 件で、tx を引数で受け取る設計。既存の \_\_tests\_\_/unit/domain/payment/stripe-refund-orchestration.test.ts:47-51 も手書きの `tx = { $executeRaw, $executeRawUnsafe, refund: { create } }` を渡しており、testing.md:49 の誘導に従っても実際に辿り着く既存ヘルパーはこの形。(5) prisma.ts:101-102 の JSDoc が「デフォルト実装はシンプルな固定値を返す。各テストで mockResolvedValueOnce / mockImplementationOnce を使って上書きする」と明記しており、`$transaction` だけでなく `space.findUnique: null` `reservation.create: {id:"test-reservation-id"}` など全 stub が同じ前提。`$transaction` を単独の罠として切り出すのは一貫していない。

---

## R-61

**設定フォームの expectedUpdatedAt が保存後に更新されず、2 回目以降の保存が必ず偽 CONFLICT になる**

<sub>[対処の記録](2026-08-12-codebase-audit-progress.md) ／ [指摘全文](2026-08-12-codebase-audit-findings.md)</sub>

- **箇所**: `src/app/(admin)/admin/(dashboard)/settings/_components/sections/TaxSection.tsx:120`
- **領域**: 設定の楽観ロック

### 棄却理由

第4次で反証。conform の onUpdate は毎レンダー Object.assign(latestOptions, options) で defaultValue を最新 props に更新し（node\_modules/@conform-to/dom/dist/form.mjs:485-487）、成功時の initialValue === null は report() → reset() → createFormMeta(latestOptions, true) を通って initialValue を現在の defaultValue から作り直す（同 :438-440 と :6-10）。updateTaxSettings は afterSuccess で invalidateSiteWideCache を呼ぶため updateTag が pathWasRevalidated を立て、Server Action の応答に更新後の commerceUpdatedAt を載せた flight data が同梱される。よって hidden input は再シードされ、2 回目の保存も CAS に一致する。「conform は id が変わらないと defaultValue を再同期しない」という第3次の前提が誤りだった。

---

## R-62

**F-94 は R-03 の再掲である。管理画面の手動「期限切れ」が次の WAITLISTED を繰り上げないのは、WAITLISTED_OFFERED 専用の意図的分離であり、独立欠陥ではない**

<sub>[対処の記録](2026-08-12-codebase-audit-progress.md) ／ [R-03](#r-03)</sub>

- **箇所**: `src/app/(admin)/admin/(dashboard)/_shared/actions/event-waitlist.ts`
- **領域**: イベント（決済・繰上げ）

### 棄却理由

フェーズ 5 着手時に現行コードで再確認した。確定台帳から外した F-94 が名指しする経路は [R-03](#r-03) と同じ `adminExpireWaitlistOfferAction` → `expireWaitlistOfferCommand` である。findings.md の F-94 本文は品質 Wave で外し、本項だけを正とする。

(1) 「WAITLISTED を手動 expire する別欠陥」ではない。WaitlistQueueTable の「期限切れにする」は `WAITLISTED_OFFERED` だけに出る。WAITLISTED 行にあるのは「今すぐ繰り上げ」である。

(2) 在庫は CONFIRMED だけを数える。OFFERED / EXPIRED は席を押さえていない。失われるのはその 1 回分の FIFO 送りだけで、待機列そのものは止まらない。同じ画面に手動 promote がある。

(3) JSDoc が cron 経路（`expireAndPromoteWaitlistForEventCommand`）と admin 手動 expire を意図的に分けている。容量超過の override promote を expire したあと自動再 promote すると、その override を取り消せなくなる。

指摘自身の反証官も「製品意図の確認が先で、実装欠陥として無条件に直す対象ではない」と書いていた。同じ仮説を低に下げて台帳に残すのは再掲なので、確定から外してここに移す。実装しない。

---
