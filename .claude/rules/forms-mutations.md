---
paths:
  - "src/app/**/_actions/**"
  - "src/app/**/actions/**"
  - "src/app/**/_components/**/*.tsx"
  - "src/shared/lib/forms/**"
  - "src/shared/lib/action-helpers.ts"
  - "src/shared/lib/mutation-result.ts"
  - "src/shared/lib/conform/**"
---

# フォームと mutation

## 戻り値の形

```ts
type MutationError = {
  readonly error: string;
  readonly code?: string;
  readonly fieldErrors?: Record<string, string[]>;
};
type MutationResult<T = null> = T | MutationError;
```

`{ success: boolean }` 形式の legacy wrapper は**再導入しない**（Server Action
も route handler も。動的走査のゲートがある）。判定は `isMutationError`、
生成は `createMutationError` / `createValidationMutationError`。

`"use server"` のファイルに **async でない export を置かない**。1 つでもあると
同じファイルの Server Action が全部壊れる（build と単体テストは通り、本番だけ
落ちる）。強制は `__tests__/unit/architecture/use-server-exports.test.ts`。

## 管理画面の mutation

`executeAdminMutationResult`（`src/app/(admin)/admin/(dashboard)/_shared/lib/admin-action.ts`）
で包む。**実行順序が契約**:

1. `checkAdminAuth()` — 認証（DB lookup より前）
2. `resolveResourceId(user)` — 認証後に resourceId を解決
3. `hasPermission()` — RBAC
4. `userHasResourceAccess()` — EDITOR の `userPageAssignment`（opt-in）
5. `execute(user)` — DB mutation（`DomainError` は `MutationError` に自動変換）
6. `await afterSuccess(data)` — cache 無効化などクリティカルな副作用
7. `fireAndForget(logAction)` — 監査ログ（非ブロッキング）

1 を後ろへ動かすと未認証で DB lookup が走る（DoS 経路）。6 と 7 を入れ替えると
監査書き込みの失敗で cache 無効化が skip され、公開ページが stale になる。

## 公開フォームの Server Action

予約・イベント申込は 4 段 guard を**この順**で通す。安い検査を先に置く不変契約で、
`__tests__/unit/architecture/public-mutation-guard-order.test.ts` が
handler 本体を静的解析して固定している。

```
checkActionRateLimit → checkEmailRateLimit → checkBotHeuristics → validateTurnstile
```

順序を変えると Turnstile トークンの消費タイミングがずれ、email の第二防壁も
迂回できるようになる。

## クライアント側（conform + Zod）

テキスト入力を持つフォームは **conform + Zod**。素の `useState` +
`if (!name) toast.error(...)` は Zod schema と検証を二重管理し、field-level の
エラー表示と `aria-invalid` / `aria-describedby` を落とす。allowlist は空。

**React 19 の form auto-reset を止める。** `action` prop に渡した関数が resolve
した時点でフォームが自動リセットされ、サーバーが返した form-level エラーが
空の再検証で上書きされて消える（実測: 権限拒否メッセージが 236ms で消えた）。

```ts
const [form, fields] = useForm({
  onSubmit: dispatchWithoutFormReset(dispatch), // src/shared/lib/forms/conform-submit.ts
  // ...
});
```

ref の capture 等で helper に載せられない場合は `onSubmit(event, { formData })`
を inline で書き、`event.preventDefault()` を必ず添える。
**`action` prop は外さない** — `getFormProps` は `method` を返さないので、
外すと hydration 前の submit がネイティブ GET になり入力内容が URL に載る。

`useForm` / `useActionState` に別名を付けない（ゲートが数えられなくなる）。

## 検証スキーマ

- 必須テキストは `z.string().trim().min(1)`。**順序が本体** —
  `.min(1).trim()` は `"   "` を通して `""` を保存する。ESLint
  `local/require-trimmed-text` が強制。機械生成値（token / id / slug）だけ
  行単位 disable + 理由。
- 書き込みと読み出しで schema を共用しているとき、後から制約を厳しくすると
  既存行が読めなくなる。配列を一括検証していると**コレクション全体が無言で
  消える**。

## 保存できたかの判定

toast や pending 解除で「保存成功」を判定しない（楽観ロック競合で toast が
出ないことがある）。判定はリロード後の永続化状態で行う。
