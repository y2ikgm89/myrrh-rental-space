# ゲスト予約/イベント参加からのマイページ登録導線 設計

- 日付: 2026-07-08
- ステータス: 承認待ち(brainstorming完了、writing-plans前)

## 背景

現状、以下の2つの非対称・欠落がある。

1. **ゲスト→会員登録の導線が存在しない**。スペース予約・イベント参加申込とも、完了ページ/確認メールに「会員登録してマイページで管理する」という誘導は一切ない。
2. **マイページ登録済みの人がログアウト状態でゲスト予約/申込した場合、後から気づいて自分のアカウントに反映する手段がない**。`Customer.email`/`emailCanonical`には一意制約が無く、`resolve-customer.ts`/`link.ts`にも明示コメントで「emailは連絡先であり本人性の証明ではない」とあるため、メール一致による自動マージは意図的に行われていない。

この2点を、ゲスト予約者を煩わせず(non-annoying)、かつ既存のセキュリティ境界(email一致だけでは紐付けない)を壊さずに解決する。

## 調査で確定した事実(前提)

- 本番認証は Google/LINE の OAuth のみ。メール+パスワードは開発/E2E限定(`emailAndPassword.enabled: NODE_ENV === "development" || isE2EOptIn`)。**「ログイン」と「サインアップ」は同一の1クリック導線**(`signIn.social()`)であり、Better Auth側で新規/既存を自動判別する。
- `User.email` は `@unique`。一方 `Customer.email`/`emailCanonical` に一意制約は無い(`userId`のみ`@unique`)。
- スペース予約: ゲストでも `resolveOrCreateCustomer`(`src/shared/domain/reservations/resolve-customer.ts`)が必ず(未紐付けの)`Customer`行を解決/作成し、`Reservation.customerId`(NOT NULL)に設定する。
- イベント参加申込: ゲストの場合 `EventRegistration.customerId` は `null` のまま(`Customer`行を作らない)。予約とは非対称。
- `ensureCustomerLinked`(`src/shared/domain/customers/link.ts`)は、ログイン中ユーザーの`userId`で`Customer`を解決し、無ければ新規作成(`isNew: true`)する。**email一致による既存ゲストCustomerへの自動リンクは行わない**(意図的な設計)。
- 予約には署名付き・ステートレスな期限付きトークン基盤が既に存在する(`src/shared/lib/reservation-cancel-token.ts`、`crypto.ts`の purpose-scoped 暗号)。`purpose`をワイヤフォーマットに埋め込み、検証側で明示チェックすることで他用途トークンの流用を防ぐ設計([[project_crypto-token-purpose-cross-use]])。
- Stripe webhook などで「`updateMany` の WHERE 現在値ガードによる排他claim」パターン(`claimReservationAsPaid`等)が既に確立している。
- `AuditLog`はHMAC-SHA256のhash chainで改ざん検知される書き込み操作+セキュリティイベントログ(`AuditAction` enumは固定14種)。`resource`は自由文字列。**顧客自身の操作(例: ゲスト予約キャンセル)も`AuditAction.UPDATE` + `resource: "reservation"`で記録されている**(`cancellation-side-effects.ts:293-297`、`userId`は認証済みactorがいる場合のみ設定)既存precedentがある。**新しい`AuditAction`列挙値の追加(=migration)は不要**、この既存precedentに倣う。
- メールテンプレートは21種登録済み。イベント系は`event-registration-confirmation`/`event-registration-cancelled`/`event-cancelled-notification`/`event-updated-notification`/`event-admin-notification`/`event-reminder`の6種(`event-reminder`はcron `src/app/api/cron/event-reminder/route.ts`から`sendEventReminderEmail`経由で送信、`reservation-reminder`と対称設計)。**訂正**: 当初の調査(brainstorming時点)では「イベントにリマインダーメールは存在しない」としていたが、writing-plans時点でこのメール自体が別PRで新規追加されていたことが判明した(本設計の検討開始後、無関係な作業で追加されたもの)。事実誤認だったため訂正する。イベント参加のリマインダーにも予約リマインダーと対称的にclaim CTAを追加する(下記UI設置箇所c、却下代替案4を参照)。

## 外部検証

- **OWASP Authentication Cheat Sheet**: 登録・ログイン・パスワードリセットいずれも、メールアドレスの既存/非既存で応答を変えない("A link to activate your account has been emailed to the address provided." を両ケースで表示)ことを推奨。→ **UI上で新規/既存アカウントの有無を一切開示しない**方針の裏付け。
- **Baymard Institute**(`baymard.com/blog/post-checkout-ux-best-practices` 等の一連の調査): 購入/申込前のアカウント作成強制はカート離脱要因になるとデータで実証。最適解は「ゲストチェックアウト+購入確認画面(purchase confirmation step)での任意アカウント作成」。調査対象の54%のサイトがこれを確認画面まで待てていないと指摘。→ **完了ページ/確認メールでのCTA配置**、および**イベント参加のCustomer行を申込時点で事前生成せず、claim時に遅延生成する**設計の裏付け。
- **OAuthアカウントリンクのセキュリティ研究**(Ory / Auth0 / Clerk / Curity / SlashID の技術記事): メールアドレス一致のみによるサイレント自動リンクはアカウント乗っ取りリスクがあり非推奨。推奨パターンは「link-on-login」(先に認証、その後にリンク)。Googleは高信頼度のemail検証を提供するIdPとして明記。→ 既存の`accountLinking.trustedProviders: ["google", "line"]`は既にベストプラクティスに沿っており、その上に「特定の1トランザクションだけを紐付ける」claim機構を安全に積み上げられる。
- **Better Auth公式ドキュメント**(Context7 `/better-auth/better-auth` で確認): `signIn.social`の`callbackURL`はサーバー側のOAuth `state`データに保持され、コールバック時に復元される(`stateData.callbackURL`)。任意のクエリパラメータを含むパスを渡せば、それを保ったままリダイレクトバックされることが公式ソースで確認できた。`callbackURL`は`trustedOrigins`検証の対象(同一オリジン内なので問題なし)。`newUserCallbackURL`という新規/既存を分岐できるオプションも存在するが、**本設計ではあえて使わない**(claimロジックを新規/既存で分岐させないことが安全性の核なので、単一の`callbackURL`のみ使用する)。

## ゴール

1. ゲスト予約者・イベント参加申込者に、煩わしくない「マイページに登録・反映」導線を追加する。
2. 既にマイページ登録済みなのにログアウト状態でゲスト予約/申込した人が、後から気づいて自分のアカウントにその1件を反映できるようにする。
3. どちらの導線も、既存アカウントの有無をUI上で一切開示しない(user enumerationを発生させない)。
4. 過去の同一メールの全履歴を一括マージするような広い操作は行わない(既存の管理者専用マージ機構との責務分離を維持する)。

## 非ゴール(スコープ外)

- イベント参加申込のゲスト`customerId: null`運用そのものを、申込時点で必ずCustomer行を作る設計に変更すること(Baymardの知見に基づき却下、下記「却下した代替案」参照)。
- イベントリマインダーメール(`event-reminder`)を新規に作ること。既に別PRで実装済みのため、本設計はこれを新設しない(既存の`sendEventReminderEmail`にCTAを追加するだけ、下記UI設置箇所c参照)。
- 過去に遡って既存のゲストCustomer/EventRegistrationレコードを一括で会員に紐付ける機能(管理者の`mergeCustomerCommand`が既にその役割を担っており、変更しない)。
- パスワードベースのサインアップフォーム追加(本番はOAuth-onlyのまま)。

## アーキテクチャ設計

### 1. Claimトークン(既存パターンの横展開)

`reservation-cancel-token.ts`と同型・同じ`crypto.ts`基盤で新規ファイルを2つ追加する。

- `src/shared/lib/reservation-claim-token.ts`: `purpose = "reservation-claim"`。payload `{ rid: string, exp: number, iat: number }`。`createReservationClaimToken(reservationId, issuedAt?)` / `verifyReservationClaimToken(token, now)`。
- `src/shared/lib/event-registration-claim-token.ts`: `purpose = "event-registration-claim"`。payload `{ eid: string, exp: number, iat: number }`。`createEventRegistrationClaimToken(eventRegistrationId, issuedAt?)` / `verifyEventRegistrationClaimToken(token, now)`。

有効期限は固定で発行から7日(`reservation-cancel-token.ts`の`MAX_CANCEL_TOKEN_LIFETIME_MS`と同じ漏洩窓の考え方を踏襲)。DB保存不要のステートレス設計。cancel tokenと異なり「予約開始時刻」等による可変上限は不要(claimは予約実行・キャンセル期限とは無関係な操作のため、固定7日でシンプルに保つ)。

### 2. `/claim` ランディング兼resolverページ

新規ルート `src/app/(public)/claim/page.tsx`(Server Component、searchParams: `type: "reservation" | "event-registration"`, `id`, `token`)。

1. `type`に応じて対応する`verify*ClaimToken(token, now)`を呼ぶ。無効/期限切れなら「リンクの有効期限が切れました」という汎用エラー表示のみ(それ以上の情報は出さない)。
2. `getCurrentCustomerUser()`でセッション確認。
   - **未ログイン**: 既存の`SocialLoginButtons`相当のOAuthボタン(Google/LINE)を表示し、`callbackURL`に**この`/claim`ページ自身のURL(`type`/`id`/`token`込み)**を渡す。認証完了後、Better Authが同じ`/claim`ページへリダイレクトし直す(=同一ルートが入口と着地点を兼ねる)。
   - **ログイン済み**: そのまま3へ。
3. `ensureCustomerLinked(user)`で自分の`Customer`行を解決(新規なら作成・`isNew`取得、既存ならそのまま取得)。
4. `type`に応じて以下のclaim commandを呼ぶ(いずれも排他`updateMany`、`claimReservationAsPaid`と同じWHERE現在値ガードパターン):
   - `claimEventRegistrationForCustomer(eventRegistrationId, toCustomerId)`(`src/shared/domain/events/claim-commands.ts`新設): `updateMany({ where: { id: eventRegistrationId, customerId: null }, data: { customerId: toCustomerId } })`。`customerId: null`のときだけ成功する一発勝負のガードなので、これで安全に一度きり(idempotent)。
   - `claimReservationForCustomer(reservationId, toCustomerId)`(`src/shared/domain/reservations/claim-commands.ts`新設): 予約は必ずCustomer行を持つため`null`ガードが使えない。**現在の`customerId`を読み、そのCustomerが未紐付け(`userId === null`)であることを確認した上で、読んだ`customerId`そのものをWHEREガードにしてupdateMany**する(compare-and-swap)。
     ```
     const current = await tx.reservation.findUnique({ where: { id }, select: { customerId: true } });
     if (!current) return { claimed: false };
     const currentCustomer = await tx.customer.findUnique({ where: { id: current.customerId }, select: { userId: true } });
     if (currentCustomer?.userId === toUserId) return { claimed: true }; // 自分が既にclaim済み(再クリック)
     if (currentCustomer?.userId != null) return { claimed: false }; // 既に(別の)会員へclaim済み → 横取り拒否
     const result = await tx.reservation.updateMany({
       where: { id, customerId: current.customerId },
       data: { customerId: toCustomerId },
     });
     return { claimed: result.count > 0 };
     ```
     `customerId`が未紐付けゲストCustomerのままである間だけ書き換えを許可し、既に誰か(会員)にclaim済みなら以降のclaim試行は全て静かに失敗する「先着1名のみ成立」の設計にする。これが無いと、確認メールを複数人が保持している場合に後発のclaimが先発のclaimを上書きして奪い取れてしまう(重大なバグのため設計時点で修正)。
5. `fireAndForget`で`createAuditLogRecord`に記録(下記5参照)。
6. 対応するマイページ詳細(`/mypage/reservations/[id]` または `/mypage/events`)へリダイレクトし、フラッシュメッセージで「反映しました」。

**安全性の核**: emailの一致では一切判断しない。「トークン保有(=確認メール/完了ページを見られる立場)」と「その場のOAuth認証(=Google/LINEが保証するidentity)」の両方が揃って初めて、**その1件のreservation/eventRegistrationだけ**を再紐付けする。過去の同一emailの全履歴を対象にした一括マージ(`mergeCustomerCommand`)とは責務が分離されたまま。

### 3. UI設置箇所(3箇所、すべて非ブロッキング・スキップ可能)

a. **フォーム送信前**(`customer-step.tsx`/`event-registration-form.tsx`、未ログイン時のみ): フォーム最上部に控えめな1行の静的テキスト「ご登録済みの方はログインすると入力が省略されます」+ ログインリンク(`/login?redirect=/reservation` または `/login?redirect=/events/[slug]`、既存の`requireLogin`リダイレクトと同じ仕組みを流用)。**emailの存在チェックは一切行わない、全非ログイン訪問者に同一表示** → enumerationリスクゼロ。フォームの項目・送信ボタン自体は変更しない。

b. **完了ページ**(`/reservation/complete`、イベント申込成功時の置き換え表示、いずれもゲストのみ): 「Google/LINEでこの予約をマイページに追加」という控えめなセカンダリボタン(`/claim?type=...&id=...&token=...`へのリンク。トークンはページレンダリング時にその場で生成、DB保存なし)。プライマリの案内(キャンセル方法等)を邪魔しない位置に配置し、閉じる/無視して問題ない扱いとする。

c. **確認メール(予約: `reservation-confirmation`、イベント: `event-registration-confirmation`)+ リマインダーメール(予約: `reservation-reminder`、イベント: `event-reminder`)**: 同じCTAリンクを本文に追加。ゲスト(予約は`userId`が無い場合、イベントは`customerId`が無い場合)のみ表示、既に会員向け導線がある場合は表示しない。予約・イベントとも確認メール+リマインダーメールの計2テンプレートずつが対象で対称。

### 4. ログアウト見過ごし対策

上記a/b/cすべて、新規/既存アカウントで文言・導線を一切分岐させない。ログアウトしている既存会員が(a)のヒントで気づいて事前にログインすれば通常のログイン中予約になる。気づかず(b)(c)まで進んだ場合も、同じCTAをクリックして`/claim`ページでOAuth認証すると、Better Auth側で「そのGoogle/LINEアカウントは既存Userに紐付いている」と自動解決され(`newUserCallbackURL`は使わず単一の`callbackURL`のみ使用)、`ensureCustomerLinked`は新規作成せず既存`Customer`を返す→その1件がそのまま既存アカウントに反映される。UI側での特別分岐は不要。

### 5. AuditLog記録

新しい`AuditAction`列挙値は追加しない(migration不要)。既存の`cancellation-side-effects.ts`の precedent に倣い、`fireAndForget(createAuditLogRecord({...}))`で以下を記録する。

- 予約claim: `{ userId: <認証済みuser.id>, action: AuditAction.UPDATE, resource: "reservation", resourceId: reservationId, oldValue: { customerId: <claim前> }, newValue: { customerId: toCustomerId }, metadata: { claim: true, wasNewAccount: <ensureCustomerLinkedのisNew> } }`
- イベント参加claim: 同様に`resource: "eventRegistration"`。

`wasNewAccount`により、運用者は「新規登録経由のclaim」と「見過ごしログアウトによる既存アカウントへの再紐付け」を事後に区別・集計できる。

### 6. データモデル

**新規マイグレーションは不要**。イベント参加のゲスト`customerId: null`運用は維持し、claim実行時にのみ`ensureCustomerLinked`で遅延解決する。`Reservation.customerId`/`EventRegistration.customerId`とも既存カラムを`updateMany`で更新するのみ。

claim後、元のゲスト`Customer`行(予約の場合。0件になった不使用行)は削除しない(将来の管理者調査・マージの余地を残す。定期クリーンアップは本設計のスコープ外、YAGNI)。

## 却下した代替案

1. **メールアドレス一致での自動マージ**: `resolve-customer.ts`/`link.ts`の既存設計判断、およびOAuthアカウントリンクのセキュリティ研究(「silent linking by email is risky」)に反するため却下。
2. **予約/イベントフォーム内に会員登録チェックボックス+パスワード設定欄を追加**: 本番はOAuth-onlyでパスワード機構が存在せず、Better Authの設計と不整合。またBaymard調査の「購入/申込前の登録強制はコンバージョンを下げる」という知見にも反するため却下。
3. **イベント参加も予約と同様、申込時点で必ず(未紐付け)Customer行を作成する設計に変更**: 変更範囲がEventRegistrationの既存ゲスト経路全体に広がり、Baymardの「使われるか分からないデータは事後(claim時)に生成する」という原則にも反するため却下。claim時の遅延生成で要件を満たせる。
4. ~~イベント用のリマインダーメールを新設してそこにもCTAを追加~~: **この却下は事実誤認に基づくものだったため撤回**。brainstorming時点では「イベントにリマインダー機構が存在しない」という前提だったが、writing-plans時点の再検証で、無関係な別PRにより`event-reminder`テンプレート(`sendEventReminderEmail`、`src/app/api/cron/event-reminder/route.ts`)が既に実装済みであることが判明した。新設するのではなく既存の`event-reminder`にCTAを追加するだけで済むため、却下する理由が無くなった。予約と対称に対応する(上記UI設置箇所c参照)。

## エッジケース/エラーハンドリング

- claim tokenが期限切れ/改ざん: `/claim`ページで汎用エラー表示のみ(「リンクの有効期限が切れました」程度に留め、対象の存在有無等の情報は出さない)。
- 二重クリック/二重claim(同一人物): `updateMany`のWHERE現在値ガードで自然にidempotent(2回目は0件更新、UI上は成功として扱う)。
- **確認メールを複数人が保持している場合**: claimは「先着1名のみ成立」(上記compare-and-swapで、既に会員へclaim済みなら以降は静かに失敗)。これは既存の`reservation-cancel-token.ts`のcancel tokenと同じ「トークン(=確認メールへのアクセス)を保有していれば行使できる」というリスクモデルの延長であり、新たに導入するリスクではない(既存のキャンセル機構と同じ許容水準)。
- 予約がキャンセル済み/イベントが終了済みの状態でのclaim: 実害が無い(閲覧用の紐付けのため)ため許可する。特別分岐は設けない。
- claim後に空になった元ゲストCustomer行: 削除しない(前述)。

## 実装フェーズ分割の方針

本設計は新規ファイル(トークン生成/検証×2、claim command×2、`/claim`route)+ 既存ファイル編集(フォーム2箇所、完了ページ、メール送信関数群、`SocialLoginButtons`)で10ファイルを超える見込みのため、CLAUDE.mdのPR粒度方針(1PR=1 logical change、soft limit 300行/10file)に従い、writing-plansで以下のようなフェーズ分割を検討する(最終的な分割はwriting-plans側で確定):

1. 基盤: claimトークン×2 + claim command×2 + `/claim`route + AuditLog配線 + unit/integrationテスト
2. UI導線: フォーム事前ヒント2箇所 + 完了ページCTA + `SocialLoginButtons`の`callbackURL`拡張
3. メール導線: 確認メール2種 + 予約リマインダーメールへのCTA追加 + E2E

## テスト方針

- unit: token生成/検証(purpose不一致・期限切れ・改ざんそれぞれ拒否されること)、claim commandの`updateMany`排他性(同時2リクエストで1回だけ実際に更新されること)。
- integration: OAuth新規ユーザーによるclaim(Customer新規作成込み)、既存ユーザーによるclaim、既にclaim済みの対象への再claim(no-op)。
- E2E: ゲスト予約完了→完了ページのclaim CTAクリック→OAuthモック→マイページ該当予約に反映されることを確認する一連。イベント参加も同様の一連を追加。

## `/claim`ページ未ログイン時のUI(確定)

既存の`src/app/(public)/login/_components/social-login-buttons.tsx`の`SocialLoginButtons`を再利用する。現状`callbackURL: "/mypage"`が固定値のため、`SocialLoginButtonsProps`に任意の`callbackURL?: string`を追加し、`signIn.social({ callbackURL: callbackURL ?? "/mypage", ... })`に変更する(後方互換: 未指定時は従来通り`/mypage`)。

これにより`/claim`ページは追加のOAuth実装を持たず、既存の利用規約同意チェック・Turnstile検証をそのまま引き継ぐ。**claim導線も通常のログイン/サインアップと全く同じ不正対策(bot対策・規約同意)の上で動く**ため、この経路のためだけの追加防御は不要。

なお本文中「1クリック」という表現は、初回(新規登録)時は既存ログインページ同様に規約同意チェック+Turnstileが必要になる点を指す比喩であり、2回目以降(既存アカウント保有者の再claim)も含め、パスワード入力等の追加ステップが無いことを指している。
