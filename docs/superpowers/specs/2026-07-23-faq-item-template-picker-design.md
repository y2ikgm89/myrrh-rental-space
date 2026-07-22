# FAQ雛形（例文）選択機能 設計

## 背景・目的

FAQ管理画面（`/admin/faq`）で質問を新規追加する際、毎回ゼロから文章を考えるのが手間だという声があった
（「いちいち作るのがめんどくさい」）。よくある質問の雛形（例文）を選ぶだけで質問・回答欄に自動入力され、
そこから微調整して保存できるようにする。

## 制約・成功基準

- 単一事業者（単一テナント）運用のサイトであり、FAQ項目の新規追加は高頻度ではない
  （実測: シードデータで3カテゴリ14項目、`FAQ_STALE_DAYS=180`＝半年更新前提の設計）
- 既存の `FaqItemDialog` の作成/編集フロー・`createFaqItem` / `updateFaqItem` Server Action・
  権限チェック・監査ログ・キャッシュ無効化には手を入れない
- 新規 Prisma モデル・migration・cache tag 配線を必要としない実装であること
  （後述「検討した代替案」参照）

## 検討した代替案とその評価

調査の結果、以下3案を比較した。

1. **静的テンプレートのみ（採用）**: TypeScript定数で例文セットを用意し、作成ダイアログに選択UIを追加。
   質問・回答欄をプリフィルするだけで、保存フローは既存のまま。DB変更なし。
2. **静的テンプレート + ユーザー保存テンプレート（案C）**: 上記に加え、`BlockTemplate`
   （Lexicalエディタの「よく使うブロックをテンプレート保存→呼び出す」機能）と同型の新規Prismaモデル
   （`FaqTemplate`）・migration・domain層・thin admin action・cache tag配線・保存/呼び出しUIを追加。
   調査の結果、precedentの `BlockTemplate` 自体が「queries/action/plugin本体のテストなし」
   「cache tagがNext.js Data Cacheに実接続されずinvalidation-onlyの中途半端配線」という軽整備状態であり、
   これをFAQ（14項目・半年数回更新という運用規模）向けに複製するのは投資対効果が薄いと判断し見送った。
3. **既存項目の複製ボタンのみ**: 新規モデル不要で実装コストは最小だが、複製元となる既存項目がない
   場面（新カテゴリの初回投入時など）で効果がない。「例文が手元にある」価値が得られないため見送った。

**採用: 案1**。理由は「めんどくさい」の主因（ゼロから文章を考える手間）を、実際の運用規模に見合った
最小コストで解消できるため。案Cの「自分で育てるテンプレート」機能は、実際にその必要性が生じてから
（例: 拠点が増えて類似カテゴリを繰り返し作る運用になった等）追加を検討する。

## 採用設計

### データ（新規ファイル）

`src/app/(admin)/admin/(dashboard)/faq/_components/faq-item-templates.ts`

`layout-templates.ts`（Lexicalカラムレイアウトの雛形定義）と同型の `as const` 配列。DB・migration不要。

```ts
export const FAQ_ITEM_TEMPLATE_GROUPS = [
  "予約・キャンセル",
  "支払い",
  "設備・利用",
  "アクセス・その他",
] as const;

export type FaqItemTemplateGroup = (typeof FAQ_ITEM_TEMPLATE_GROUPS)[number];

export const FAQ_ITEM_TEMPLATES = [
  {
    id: "cancel-policy",
    group: "予約・キャンセル",
    question: "予約はいつまでキャンセルできますか？",
    answer:
      "利用日の◯日前までは無料でキャンセルいただけます。それ以降のキャンセルにはキャンセル料が発生します。詳細は予約確認メールをご確認ください。",
  },
  // ...
] as const;

export type FaqItemTemplate = (typeof FAQ_ITEM_TEMPLATES)[number];
```

文面はレンタルスペース業界で一般的な想定質問とし、事業者固有の条件（金額・料率・具体的な手段名等）は
「◯」等のプレースホルダー表現に留める。選択後に管理者が必ず内容を確認・編集する前提とする
（`faqItemFormSchema` の文字数制限 question≤500字・answer≤5000字に収まる長さで作成する）。

以下の4グループ・計14件を初期セットとする（`id` / `question` / `answer` の実装時の目安）。

**予約・キャンセル**

1. `cancel-policy` — 予約はいつまでキャンセルできますか？ / 利用日の◯日前までは無料でキャンセルいただけます。それ以降のキャンセルにはキャンセル料が発生します。詳細は予約確認メールをご確認ください。
2. `reservation-change` — 予約内容を変更したいのですが可能ですか？ / 利用日の◯日前までであれば、マイページまたはお問い合わせフォームより変更を承ります。当日変更はお問い合わせください。
3. `reservation-confirm-timing` — 予約はいつ確定しますか？ / お申し込み後、内容確認のうえ確定次第、確認メールをお送りします。通常◯営業日以内にご連絡します。
4. `reservation-late-arrival` — 予約時間に遅れそうな場合はどうすればいいですか？ / 事前にお電話またはお問い合わせフォームよりご連絡ください。連絡なく大幅に遅れた場合、利用時間は予約時間どおり終了となります。

**支払い**

5. `payment-methods` — 支払い方法を教えてください / クレジットカード決済に対応しています。詳細はご予約手続き画面でご確認ください。
6. `receipt-issue` — 領収書は発行してもらえますか？ / マイページの予約詳細画面から領収書をダウンロードいただけます。宛名の指定が必要な場合はお問い合わせください。
7. `extension-fee` — 利用時間を延長した場合の追加料金はどうなりますか？ / 延長料金は1時間あたり◯円です。当日空きがある場合のみ延長を承ります。

**設備・利用**

8. `wifi-equipment` — Wi-Fiや設備は利用できますか？ / Wi-Fi・プロジェクター等の設備を無料でご利用いただけます。詳細はスペースごとの設備一覧をご確認ください。
9. `food-drink-policy` — 飲食は可能ですか？ / 飲食可能です。ゴミはお持ち帰りいただくか、備え付けのゴミ箱にお捨てください。
10. `capacity-over` — 予約人数より多い人数で利用できますか？ / 定員を超えるご利用はお断りしております。人数変更がある場合は事前にご連絡ください。
11. `damage-policy` — 設備を破損した場合はどうなりますか？ / 速やかにスタッフまでご連絡ください。故意・過失による破損の場合、修理費用をご請求する場合があります。

**アクセス・その他**

12. `parking-availability` — 駐車場はありますか？ / 敷地内に◯台分の駐車スペースがございます。満車の場合は近隣のコインパーキングをご利用ください。
13. `station-access` — 最寄り駅からのアクセスを教えてください / ◯駅から徒歩◯分です。詳細な道順はアクセスページをご確認ください。
14. `entry-method` — 当日の入館方法を教えてください / 予約確認メールに記載の入館コードをご利用ください。不明な場合はお問い合わせください。

### UIコンポーネント（新規ファイル）

`src/app/(admin)/admin/(dashboard)/faq/_components/FaqItemTemplateSelect.tsx`

`EmailTemplatesSection.tsx` と同じ「グループ化 `Select`」パターン（`SelectGroup` / `SelectLabel` で
グループ見出し、`FAQ_ITEM_TEMPLATE_GROUPS` の順序でグルーピング）。選択された `FaqItemTemplate` を
`onSelect` コールバックで親に渡すだけの提示専用コンポーネント。プレースホルダーは
「雛形から選ぶ（任意）」、選択されていない状態がデフォルト。

```ts
type Props = {
  readonly onSelect: (template: FaqItemTemplate) => void;
  readonly disabled?: boolean;
};
```

### `FaqItemDialog.tsx` の変更（新規作成モードのみ）

- `FormBodyProps` に `mode: "create" | "edit"` を追加。`FaqItemCreateDialog` は `mode="create"`、
  `FaqItemEditDialog` は `mode="edit"` を渡す
- `FaqItemFormBody` 内、`mode === "create"` のときのみ「質問」ラベルの直前に
  `FaqItemTemplateSelect` を表示する
- 現状 `question` / `answer` は `getInputProps` / `getTextareaProps`（`defaultValue` 方式、
  非制御）で束縛されているが、雛形選択時にプログラムから値を書き換えられるよう、既に
  `isPublished` で使っている `useInputControl` パターン（同ファイル内の既存手法）を
  `question` / `answer` にも適用し、制御コンポーネント化する
- `FaqItemTemplateSelect` の `onSelect` ハンドラで
  `questionControl.change(template.question)` / `answerControl.change(template.answer)` を呼ぶ
- 編集ダイアログ（`mode="edit"`）には雛形Selectを表示しない。既存内容を上書きする動機がなく、
  誤操作で既存の回答を消すリスクを避けるため

### データフロー

1. 「質問を追加」ボタン → `FaqItemCreateDialog` が空フォームで開く（現状と同じ）
2. （任意）`FaqItemTemplateSelect` で雛形を選択 → `question` / `answer` 欄が自動入力される
3. 管理者が文面を自由に編集、公開スイッチを設定
4. 送信 → 既存の `createFaqItem` Server Action（無変更）→ 成功で Dialog クローズ・トースト表示・
   `router.refresh()`（現状と同じ）
5. 雛形を選ばなければ、今までどおり空欄から入力する挙動と完全に一致する

**上書き挙動の明記**: 雛形を選び直すと、その時点の質問・回答欄の内容を選択した雛形の内容で
上書きする。確認ダイアログは設けない（社内向け管理画面かつ送信前の下書き段階であり、
Undo は再度手で直せば足りるため）。

### エラーハンドリング

雛形選択はクライアント側の状態更新のみで、ネットワーク呼び出し・Server Action呼び出しを伴わない
ため、新たなエラーケースは発生しない。フォーム送信時のバリデーションエラー表示は既存の
`faqItemFormSchema` / conform のエラー表示ロジックをそのまま使う（雛形由来の文面であっても
文字数超過等があれば通常のバリデーションエラーとして表示される）。

### テスト

- `__tests__/unit/components/admin/faq-item-template-select.test.tsx`（新規）: 既存の
  `__tests__/unit/components/admin/*.test.tsx`（`refund-dialog.test.tsx` 等）と同じ
  testing-library/react パターンで、`FaqItemTemplateSelect` 単体をレンダリングし、
  グループ見出しが `FAQ_ITEM_TEMPLATE_GROUPS` の順で表示されること、項目を選択すると
  `onSelect` が対応する `FaqItemTemplate` で呼ばれることを検証する（Server Action や
  `FaqItemDialog` 全体のモックは不要な範囲に留める）
- Server Action・domain層・DBスキーマは無変更のため、integration test・e2e specの追加は不要
- 検証コマンド: `bun run validate`（type-check + lint）+ 上記 unit テスト + dev server での
  実ブラウザ確認（雛形選択→プリフィル→編集→保存の一連の流れ）

## 非スコープ（今回はやらないこと）

- 自分でよく使うQ&Aを「テンプレートとして保存」する機能（前述の案C・案2部分）。将来必要になれば
  `BlockTemplate` と同型の設計で別途スペックを起こす
- カテゴリごとの雛形絞り込み・フィルタリング（雛形は12〜15件程度に収まる想定のため、フラットな
  グループ化一覧で十分。件数が増え検索性が必要になった時点で `Command`（cmdk）への切り替えを検討する）
- 編集ダイアログへの雛形Select追加
- 新規 Prisma モデル・migration・cache tag・RBAC・feature module 変更（一切不要）

## 影響範囲外であることの確認

`createFaqItem` / `updateFaqItem` Server Action、`faqItemFormSchema`、権限チェック
（`executeAdminMutationResult` 経由）、監査ログ、キャッシュタグ運用は本設計により一切変更しない。
