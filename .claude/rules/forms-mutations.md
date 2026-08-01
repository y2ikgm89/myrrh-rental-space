---
paths:
  [
    "src/app/(admin)/**",
    "src/app/(public)/**",
    "src/shared/lib/forms/**",
    "src/shared/lib/validations/**",
    "src/shared/lib/mutation-result.ts",
  ]
---

# フォーム（conform + Zod 4）とサーバーミューテーション

## 共通基盤

- Server Action 統合の SSoT は `executeConformMutation(formData, schema, handler)`
  （`src/shared/lib/forms/conform-action.ts`、React 19 `useActionState` 互換）
- conform の Zod 統合 import は必ず `@conform-to/zod/v4` サブパス（bare は禁止）
- mutation の戻り値は `MutationResult<T>`、判別は `isMutationError()`

## 空入力の罠（最頻出バグ）

`parseWithZod` は空入力を **undefined に変換**する。必須 `z.string()` / `z.boolean()` の
ままだと空欄保存・Switch OFF 保存が全弾きになる。

- 任意テキスト → `optionalText(max)`、Switch → `switchBoolean()`（`.default(false)`）、
  永続化前の空→null は `emptyToNull()`（いずれも
  `_shared/actions/settings/schemas/form-schema-helpers.ts`）
- `switchBoolean` を `z.preprocess` に書き換えない（実 boolean true を破壊する）
- この契約は `__tests__/unit/forms/*-empty-optional.test.ts` が
  「実体スキーマ × FormData × parseWithZod」の実測で固定している。
  スキーマをテスト内にインライン再宣言して object 入力で検証しない

## クライアント側の定型

`useForm<z.input<typeof Schema>>`（明示 generic）+ `import type { z }`（value import
しない）+ `constraint: getZodConstraint(schema)` + `onValidate: parseWithZod` +
`shouldValidate: "onBlur"` + `shouldRevalidate: "onInput"`。
成功検出は resetForm の設定で変わる: `resetForm: true` → `lastResult.initialValue === null`、
`resetForm: false` → `lastResult.status === "success"`。

## React 19 の form auto-reset がサーバーのエラーを消す（最重要）

React 19 は `action` prop に渡した関数が resolve した時点でフォームを自動リセットする
（公式 Server Functions:「React handles the submission and automatically resets the form
upon success」）。`useActionState` の action は **throw せず `SubmissionResult` を返す**ため、
**サーバーが form-level エラーを返した応答もリセット対象**になる。

リセットで input が空になると conform は空の FormData で再検証し、その field errors が
**サーバーのメッセージを上書きして消す**。実測（CI run 30695870083 の trace）: VIEWER の
顧客作成でサーバーが `customerのcreate権限がありません` を返し
`aria-describedby="customer-create-error"` まで付いた +76ms 後の状態から、+236ms でその
表示が消え、空欄由来の `Invalid input: expected string, received undefined` だけが残った。
**利用者は理由を知れないまま入力も全て失う。** 公開側では「このタイムスロットは満員です」
等の DomainError が同じ経路で消える。

対策は conform の `onSubmit` から自分で action を呼ぶこと:

```tsx
const [lastResult, action] = useActionState(submitX, undefined);
const [form, fields] = useForm({
  lastResult,
  onSubmit: dispatchWithoutFormReset(action), // src/shared/lib/forms/conform-submit.ts
  // ...
});
return (
  <form {...getFormProps(form)} action={action}>
    …
  </form>
);
```

- conform の `onSubmit` は「client 検証を通過 **かつ** intent submission ではない」ときだけ
  呼ばれる公式の拡張点（`createFormContext` が `formData.has(INTENT)` で除外する）
- react-dom の form action listener は `nativeEvent.defaultPrevented` を先に見て
  `startHostTransition(…, null, formData)`（action = null）で抜けるため、
  **preventDefault 済みの submit で action が二重に走ることはない**
- **`action` prop は外さない。** `getFormProps` が返すのは id / onSubmit / noValidate /
  aria 属性だけで **`method` を含まない**。外すと SSR された form は action も method も
  持たず、hydration 前に submit した利用者は**ネイティブ GET** で現在の URL に飛ばされ、
  氏名・メールアドレス・電話番号が**クエリ文字列に載って履歴とアクセスログに残る**
- ref の capture 等で helper に渡せないときは同じ処理を `onSubmit(event, { formData })` の
  inline で書く（`CreatePageDialog` が実例。ref を触る関数を helper に渡すと
  `react-hooks/refs` が「render 中に ref を読みうる」で落ちる）
- 一括置換で拾えない配線に注意。`action={isInteractive ? formAction : undefined}` の
  条件式は `action={<識別子>}` の grep をすり抜け、公開の問い合わせフォームだけが
  取り残された（#1802）

gate: `__tests__/unit/architecture/conform-form-pattern.test.ts`（**allowlist なし**）。
落とせるのは「conform + Server Action のファイルに guard が **1 つも無い**」場合と
「hook を別名 import して検出不能にした」場合。**1 ファイル内の複数フォームで一部だけ
guard を欠く形は検出できない** — 件数比較を 3 通り（`<form action>` タグ数 / `useForm`
設定数 / `useActionState` 数）試したが、いずれも正当なコード（条件分岐で 2 つの
`<form>` を描画する / client-only の conform 設定が同居する / 複数 Dialog が共通の
Form コンポーネントに action を渡す）を誤検出したため断念した。**そこはレビューで見る。**

## サーバーの拒否を捨てない

`executeConformMutation` を通す action の結果を `const [_state, formAction] = useActionState(…)`
で捨てると、**サーバーが返した拒否理由を画面に出す手段が無くなる**。実例: 繰返し予約の
3 択キャンセルは権限拒否・ドメインエラー・楽観ロック競合のすべてが**無言**で、操作者には
「押したのに何も起きない」としか見えなかった（#1803 で修正）。

入力が hidden だけのフォームでも `useForm` に載せ、`form.allErrors` をまとめて描画する。
form-level と field-level を分ける意味があるのは、利用者が個々の欄を直せるときだけ。

## 手書きフォームを増やさない

`useState` + `if (!name) toast.error(…)` は Zod schema と検証を二重管理し、field-level
エラー表示と `aria-invalid` / `aria-describedby` を落とす。**テキスト入力を持つフォームは
conform を使う**（`<input>` は `type` 省略時 HTML 既定で `text` なので、これも対象）。

既存の逸脱 5 件は上記 gate の allowlist に「なぜ移行できないか」付きで固定してある。
**allowlist は減る方向にしか動かさない** — 移行が済んだ entry を消し忘れると、後から
conform を外したときに残骸が黙って免除する（gate 側で検出するようにしてある）。

conform 化が不要なのは「client validation する入力が無い」ケースだけ:
`redirect` しか返さない OAuth 開始フォーム、hidden token だけを POST する Server
Component（`receipts/[serialNo]/download`。JS 無効時の動作と token を URL に残さない
設計が意図的なので client component 化しない）、select / toggle しか持たないダイアログ。

## admin mutation

- 標準ラッパーは `executeAdminMutationResult`（`@/admin/lib/admin-action`）。
  実行順序 checkAdminAuth → resolveResourceId → hasPermission → userHasResourceAccess →
  execute → afterSuccess → logAction は**不変契約**（順序変更はセキュリティ/キャッシュの
  silent regression）
- execute 内で throw した `DomainError` は自動で MutationError に変換される
- legacy wrapper（`createSuccess(` / `type ActionResult` / `executeAdminMutation(`）の
  再導入はテストで即 fail
- admin action ファイルは Prisma を直 import しない（thin action、テスト強制）。
  ファイルを移動・改名したら `architecture-boundaries.test.ts` の
  THIN_ADMIN_ACTION_FILES 配列も更新する（不在 path は hard-fail）

## 公開フォーム action

handler 冒頭で `checkActionRateLimit(formSubmitRateLimiter)` →
`validateTurnstile({ token, expectedAction: TURNSTILE_ACTIONS.* })` の順に実行する。
Turnstile token は一度の検証で消費されるため、結果を受けたら widget を張り直す
（`ref.current?.reset()`）。**トークン欄はアプリ側で持たない** — `TurnstileWidget` が
Cloudflare 公式の `response-field-name` で `turnstileToken` の hidden input を
自前で描画・更新する。`<form>` 送信ではなく引数でトークンを渡す画面（ダイアログ内の
キャンセル・ログイン等）だけ `onVerify` を使う。

**`useInputControl(fields.turnstileToken)` を復活させてはいけない。** conform 管理下の
フィールドに書き戻すと 2 つの実害が出る:

1. reject 応答後に `change("")` すると `shouldRevalidate: "onInput"` の再バリデーションが
   走り、**サーバーが返した form-level エラーを client 検証結果で上書きして消す**。
   「このタイムスロットは満員です」がユーザーに一度も表示されなくなる
2. `useInputControl` の戻り値は毎レンダー新しいオブジェクトなので effect の依存に
   入れると無限ループになる（PR #1758）

予約(reservation)・イベント申込(event-registration)は専用のIP単位リミッター
（`reservationSubmitRateLimiter` / `eventRegistrationSubmitRateLimiter`、
`formSubmitRateLimiter` からは分離済み）を使い、上記2つの間に
`checkEmailRateLimit(<domain>ByEmailRateLimiter, data.email)` →
`checkBotHeuristics({ honeypot, formRenderedAt })` を追加で挟む
（`checkActionRateLimit` → `checkEmailRateLimit` → `checkBotHeuristics` →
`validateTurnstile`）。DB/外部API呼び出しを伴わない最安チェックを先に置く順序。
`checkEmailRateLimit` は同一人物が複数IPから同じメールで大量作成するケースを防ぐ
顧客単位の第二防壁（`cancelByReservationRateLimiter` と同型の設計）。
honeypot フィールドは Zod スキーマ上では検証エラーにしない（`website` のような
実在しない項目名を装い、botに何が原因か開示しないため）。フォーム側は視覚的に
隠した hidden input（`aria-hidden` + `tabIndex={-1}` + 画面外配置）と、フォーム
初回マウント時刻を埋め込む hidden input の2つを追加する。全公開フォームへの
一般化はしていない（対象は予約・イベント申込のみ、他フォームへの適用は個別に検討する）。

## スキーマ配置

設定系は `_shared/actions/settings/schemas/`、リソース系はコンポーネント隣接の
`*-form-schema.ts` か `src/shared/lib/validations/`。Zod 4 のメッセージは
`{ error: "..." }` 形式、日付は `z.iso.date()` / `z.iso.datetime()`。
