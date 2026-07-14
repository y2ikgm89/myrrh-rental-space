/**
 * Cloudflare Turnstile Action 識別子の SSoT（client-safe）
 *
 * Widget の `data-action` とサーバー側 siteverify の `expectedAction` 検証に使う。
 *
 * ## 公式制約
 * - alphanumeric / `_` / `-` のみ
 * - 最大 32 文字
 *
 * Widget と Server Action の両方で参照されるため `server-only` を付けない。
 *
 * @see https://developers.cloudflare.com/turnstile/get-started/client-side-rendering/#configurations
 */

export const TURNSTILE_ACTIONS = {
  inquiry: "inquiry-submit",
  reservation: "reservation-submit",
  event_registration: "event-registration-submit",
  review: "review-submit",
  mypage_profile: "mypage-profile-update",
  mypage_reservation_edit: "mypage-reservation-edit",
  mypage_reservation_cancel: "mypage-reservation-cancel",
  mypage_event_registration_cancel: "mypage-event-registration-cancel",
  guest_reservation_cancel: "guest-reservation-cancel",
  guest_event_registration_cancel: "guest-event-registration-cancel",
  mypage_account_delete: "mypage-account-delete",
  customer_signup_terms: "customer-signup-terms",
  event_waitlist_register: "event-waitlist-register",
  event_waitlist_confirm: "event-waitlist-confirm",
} as const;

export type TurnstileAction =
  (typeof TURNSTILE_ACTIONS)[keyof typeof TURNSTILE_ACTIONS];

/**
 * Cloudflare Turnstile widget 表示モード（公式 3 値）
 *
 * @see https://developers.cloudflare.com/turnstile/get-started/client-side-rendering/widget-configurations/#appearance-modes
 */
export const TURNSTILE_APPEARANCES = [
  "always", // ページロード時から常に表示
  "execute", // チャレンジ開始後のみ表示（programmatic execute 用）
  "interaction-only", // ボット判定で interaction が必要な時のみ表示（最もクリーンな UX）
] as const;

export type TurnstileAppearance = (typeof TURNSTILE_APPEARANCES)[number];

/**
 * Widget 表示モードのデフォルト
 *
 * Cloudflare 公式デフォルトの `"always"` を採用し、Bot 保護の UI を明示する。
 * 「見せないフォーム」は個別に `appearance="interaction-only"` を指定する。
 */
export const DEFAULT_TURNSTILE_APPEARANCE: TurnstileAppearance = "always";
