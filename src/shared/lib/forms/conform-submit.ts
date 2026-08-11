import { startTransition } from "react";
// `FormEvent` は @types/react では deprecated（`SubmitEvent` へ誘導される）だが、
// ここは conform の `useForm({ onSubmit })` に渡すハンドラで、conform 側の型が
// `(event: React.FormEvent<HTMLFormElement>, context) => void` を要求する。
// ハンドラ引数は反変なので `SubmitEvent` に狭めると代入できなくなる。
// conform が型を更新するまでは合わせる。
import type { FormEvent } from "react";

/**
 * conform の `useForm({ onSubmit })` に渡して、hydration 後の submit を
 * React の form action 経路から自前の `startTransition` に切り替える。
 *
 * ## なぜ必要か
 *
 * React 19 は `action` prop に渡した関数が resolve した時点でフォームを
 * 自動リセットする（公式 Server Functions:「React handles the submission and
 * automatically resets the form upon success」）。`useActionState` の action は
 * throw せず `SubmissionResult` を返すため、**サーバーが form-level エラーを
 * 返した応答もリセット対象**になる。
 *
 * リセットで input が空になると conform は空の FormData で再検証し、その
 * field errors が **サーバーの form-level エラーを上書きして消す**。実測
 * (CI run 30695870083 の trace): VIEWER の顧客作成でサーバーが
 * `customerのcreate権限がありません` を返し `aria-describedby` まで付いた
 * +76ms 後の状態から、+236ms で拒否メッセージが消え、空欄由来の
 * `Invalid input: expected string, received undefined` だけが残っていた。
 * 公開側では「このタイムスロットは満員です」等の DomainError が同じ経路で
 * 消え、**利用者は理由が分からないまま入力内容も全て失う**。
 *
 * ## なぜ二重送信にならないか
 *
 * conform の `onSubmit` は「client 検証を通過 **かつ** intent submission では
 * ない」ときだけ呼ばれる公式の拡張点（`createFormContext` が
 * `formData.has(INTENT)` で除外する）。react-dom の form action listener は
 * `nativeEvent.defaultPrevented` を先に見て `startHostTransition(…, null,
 * formData)`（action = null）で抜けるため、ここで `preventDefault()` した
 * submit を React が重ねて実行することはない。conform の onSubmit が React の
 * listener より先に走ることは、client 検証で落ちた submit が Server Action に
 * 到達しない既存挙動が示している。
 *
 * ## `action` prop は外さないこと
 *
 * `getFormProps` が返すのは id / onSubmit / noValidate / aria 属性だけで
 * **`method` を含まない**。`action` を外すと SSR された form は action も
 * method も持たず、hydration 前に submit した利用者はネイティブ **GET** で
 * 現在の URL に飛ばされ、入力内容が **クエリ文字列に載って履歴とアクセスログに
 * 残る**（氏名・メールアドレス・電話番号・住所を扱うフォームでは PII 漏洩）。
 * `action` を残せば React が SSR 時に action / `method="POST"` /
 * `$ACTION_ID` hidden を出力するので、hydration 前は POST fallback が働く。
 *
 * @example
 * ```tsx
 * const [lastResult, action] = useActionState(submitReservation, undefined);
 * const [form, fields] = useForm({
 *   lastResult,
 *   onSubmit: dispatchWithoutFormReset(action),
 *   // ...
 * });
 * return <form {...getFormProps(form)} action={action}>...</form>;
 * ```
 *
 * @see https://react.dev/reference/rsc/server-functions
 * @see https://conform.guide/integration/nextjs
 */
export function dispatchWithoutFormReset(
  action: (formData: FormData) => void,
): (
  event: FormEvent<HTMLFormElement>,
  context: { readonly formData: FormData },
) => void {
  return (event, { formData }) => {
    event.preventDefault();
    startTransition(() => {
      action(formData);
    });
  };
}
