/** PasscodeReveal UI 向けの非秘匿状態（平文なし）。 */

export type PasscodeRevealState =
  | { readonly status: "unavailable" }
  | { readonly status: "pending" }
  | { readonly status: "outside_window" }
  | { readonly status: "visible" };
