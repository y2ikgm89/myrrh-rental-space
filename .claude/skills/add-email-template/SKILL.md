---
name: add-email-template
description: メールテンプレート (email template) を新規追加・変更するときに使う。react-email component + fixture ペアの作成、EMAIL_TEMPLATE_REGISTRY (registry) への登録、sender ラッパー (sendEmail wrapper) の実装、idempotencyKey 設計、bun run email:dev でのプレビュー確認、unit テストまでの一連の手順。Resend 経由の顧客向け通知・管理者通知メールを追加するとき、または既存テンプレの props / fixture / registry を触るときに参照する。
---

# メールテンプレート追加手順

送信基盤 (`sendEmail` の retry / suppression / disabled semantics、from/replyTo 注入、
API キー解決) の常設規約は rules の `integrations.md` を参照。この skill は追加手順のみ。

追加は **4 点セット**: ① component (.tsx) + ② fixture (.fixture.ts) + ③ registry 登録
(data.ts と index.ts の 2 ファイル) + ④ sender ラッパー。①〜③ が揃うと管理画面の
テンプレプレビュー / テスト送信 UI に自動で載る (追加 UI 作業は不要)。

## Step 1: component を作成 — `src/shared/emails/<key>.tsx`

既存の最小例 `src/shared/emails/welcome.tsx` の `WelcomeEmail` を Read して同型に作る。

- ファイル名 = テンプレの kebab-case key。component は named export の関数
  (例: `ReservationConfirmationEmail`)
- props 型は必ず `footer: EmailFooterData` を含める
  (`src/shared/emails/_shared/footer-data.ts` の `EmailFooterData`)。
  registry の `defineEntry` が `{ footer: EmailFooterData }` を含む props を要求する
- レイアウトは `src/shared/emails/_shared/EmailLayout.tsx` の `EmailLayout` で包み、
  `preview` (受信箱プレビュー文) と `footer` を渡す
- スタイルは `src/shared/emails/_shared/styles.ts` の共有定数
  (`heading` / `text` / `buttonPrimary` / `buttonSection` / `urlFallbackText` 等) を使う
- UI 部品は `@react-email/components` (`Text` / `Button` / `Section` / `Hr` 等)
- 末尾に以下 2 行を必ず付ける (react-email preview CLI が使う):
  - `XxxEmail.PreviewProps = xxxFixture;`
  - `export default XxxEmail;`

## Step 2: fixture を作成 — `src/shared/emails/<key>.fixture.ts`

既存例 `src/shared/emails/welcome.fixture.ts` の `welcomeFixture` と同型に:

- `footer` には `src/shared/emails/_shared/demo-footer.ts` の `DEMO_FOOTER` を使う。
  実フッター取得 (`getEmailFooterData`) は server-only + DB 依存のため fixture /
  preview CLI から呼べない (demo-footer.ts の docblock 参照)
- `satisfies Parameters<typeof XxxEmail>[0]` で props 型に固定する
- component 側は fixture を値 import (PreviewProps 用)、fixture 側は component を
  `import type` のみ (型参照のみで循環を回避) — welcome ペアの形をそのまま踏襲
- 1 component を複数バリエーションで登録する場合は 1 fixture ファイルに複数 export
  (例: `admin-notification.fixture.ts` の
  `adminNotificationReservationFixture` / `adminNotificationInquiryFixture`)

## Step 3: registry へ登録 (2 ファイル)

### 3a. `src/shared/emails/_registry/data.ts` (client/server 共用 — server-only 禁止)

1. `TEMPLATE_KEYS` (as const tuple) に key を追加。`TemplateKey` 型はここから派生する
2. `EMAIL_TEMPLATE_INDEX` に `{ key, label, description, category }` を追加。
   `category` は `TemplateCategory`
   (`"reservation" | "event" | "inquiry" | "account" | "system"`) から選ぶ。
   `label` は管理画面の表示名かつテスト送信 subject (`[TEST] <label>`) になる

網羅性は compile error で強制される:

- INDEX 側: data.ts 末尾の `_IndexCheck` 型 (Missing/Extra key が `never` でないと
  代入エラー) — key だけ足して INDEX を忘れると type-check が落ちる

### 3b. `src/shared/emails/_registry/index.ts` (server-only な完全 registry)

1. component と fixture を import
2. `EMAIL_TEMPLATE_REGISTRY` に `"<key>": defineEntry("<key>", XxxEmail, xxxFixture)`
   を追加

registry は `as const satisfies Readonly<Record<TemplateKey, RegistryTemplateEntry>>`
なので、`TEMPLATE_KEYS` に key を足して entry を忘れると **compile error** になる。
逆方向 (entry だけ足して key 忘れ) も excess property で落ちる。この satisfies が
「登録漏れゼロ」の仕組みの本体。

補足:

- `defineEntry` が `renderPreview` (プレビュー用 ReactElement 生成) と `sendTest`
  (テスト送信、subject `[TEST]` 強制・専用 idempotency namespace) を自動で組み立てる。
  第 4 引数 `mergeRuntime` は `__infra_check` 専用なので通常は渡さない
- data.ts / index.ts の docblock にエントリ総数 (「全 18 エントリ」等) が書かれている。
  追加したら総数コメントも更新する
- 管理画面側 (`src/app/(admin)/admin/(dashboard)/_shared/actions/settings/` の
  `template-preview.ts` / `template-test-send.ts`) は `z.enum(TEMPLATE_KEYS)` +
  `getTemplate` で registry を直接参照するため変更不要

## Step 4: sender ラッパーを作成 — `src/shared/lib/email/`

配置: 既存のドメイン別ファイル (`reservation-emails.ts` / `event-emails.ts` /
`contact-emails.ts` / `inquiry-emails.ts` / `review-emails.ts` / `welcome-emails.ts` /
`reminder-emails.ts` / `system-emails.ts`) に追加するか、
新ドメインなら `<domain>-emails.ts` を新設する。最小例は
`src/shared/lib/email/welcome-emails.ts` の `sendWelcomeEmail`。

型:

- 入力データ型は `src/shared/lib/email/types.ts` に `XxxEmailData` として定義し、
  戻り値は同ファイルの `EmailResult`
- ファイル冒頭に `import "server-only";` 必須

実装パターン:

1. `const footer = await getEmailFooterData();`
   (`@/shared/emails/_shared/footer-data`) — 実運用は必ず実フッター
2. `sendEmail({ payload, idempotencyKey, operation, context })`
   (`src/shared/lib/email/send.ts` の `sendEmail`) を return する
   - `payload.react: XxxEmail({ ...props, footer })` で component を直接呼ぶ
   - `payload.from` は**書けない** (`EmailPayload = Omit<CreateEmailOptions, "from">`
     で型レベル排除。from/replyTo は自動注入 — semantics は rules `integrations.md`)。
     `replyTo` も DB 設定を上書きする意図がない限り指定しない
   - `operation` はエラーログ用の関数名、`context` にはエンティティ ID 等を入れる

idempotencyKey の設計 (`<event-type>/<entity-id>` 形式):

- エンティティ ID があるもの: `contact-confirm/${data.inquiryId}` のように ID を直接使う
- メールアドレス・URL・token 等の可変文字列が key に入る場合は
  `hashForKey` (`src/shared/lib/email/send.ts`、sha256 先頭 32 文字) で短縮する。
  例: `welcome/${hashForKey(data.customerEmail)}`
- 省略は「各実行が一意で重複送信があり得ない」場合のみ
  (`system-emails.ts` の `sendWebhookRenewalNotification` が唯一の前例。理由コメント必須)

管理者通知系の gating (顧客向け取引メールには付けない):

- `getEmailDeliverySettings()` の通知トグル (例: `notifyNewInquiry`) と
  `getNotificationEmailAddresses()`
  (いずれも `@/shared/domain/settings/queries/notification`) を先にチェックし、
  OFF / 宛先 0 件なら `{ ok: false, reason: "disabled" }` を早期 return する。
  実例: `src/shared/lib/email/contact-emails.ts` の `sendContactAdminNotification`
- 呼び出し側での `"disabled"` (警告) と `"error"` (失敗) の区別は rules
  `integrations.md` 参照

## Step 5: プレビュー確認

```
bun run email:dev
```

react-email の dev server が `src/shared/emails` 対象・port 3030 で起動し、
`PreviewProps` + default export を持つ component が一覧に出る。文言・レイアウト崩れ・
フッター表示を目視確認する。管理画面 (設定 > メールのテンプレート一覧) でも
プレビュー / `[TEST]` 送信で確認できる (registry 登録済みなら自動表示)。

## Step 6: テスト

既存テストの所在 (同型で追加する):

- component render テスト: `__tests__/unit/emails/`
  (例: `test-email.test.tsx` — component を直接呼び `isValidElement` +
  `JSON.stringify(el)` への props 文言含有で検証。DB 不要)
- sender gating テスト: `__tests__/unit/shared/lib/email/`
  (例: `contact-emails-gating.test.ts` — 通知トグル OFF で `disabled` になること等)。
  mock パターン (`mock.module` → 動的 import) は rules の `testing-unit.md` を参照

実行 (runner 経由必須 — rules `testing-unit.md`):

```
bun scripts/run-tests.ts __tests__/unit/emails __tests__/unit/shared/lib/email
bun run type-check   # registry の satisfies / INDEX 網羅チェックはここで落ちる
bun run validate     # 完了報告前
```

## チェックリスト

- [ ] `src/shared/emails/<key>.tsx` — props に `footer: EmailFooterData`、
      `EmailLayout` 使用、`PreviewProps` + default export あり
- [ ] `src/shared/emails/<key>.fixture.ts` — `DEMO_FOOTER` 使用、
      `satisfies Parameters<typeof XxxEmail>[0]`、component は `import type`
- [ ] `_registry/data.ts` — `TEMPLATE_KEYS` と `EMAIL_TEMPLATE_INDEX` の両方に追加
      (`server-only` を付けない)
- [ ] `_registry/index.ts` — `defineEntry` で登録、docblock のエントリ総数を更新
- [ ] sender ラッパー — `"server-only"`、`from` 指定なし、
      idempotencyKey は `<event-type>/<entity-id>` (可変部は `hashForKey`)
- [ ] 管理者通知なら通知トグル + `getNotificationEmailAddresses()` で gating
- [ ] `bun run email:dev` で目視確認
- [ ] render / gating テスト追加 → runner 経由で緑、`bun run type-check` /
      `bun run validate` 緑
