/**
 * メールテンプレ共通スタイル定数
 *
 * Tailwind / CSS は受信側 MUA が処理しないため、全テンプレでインライン style を使う。
 * 色・余白・コントラストの SSoT。WCAG AA（テキスト 4.5:1 / 大きい文字 3:1）を満たす値のみ採用。
 */

export const FONT_STACK =
  '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Ubuntu, sans-serif';

export const COLOR = {
  bg: "#f6f9fc",
  surface: "#ffffff",
  text: "#1f2937",
  textMuted: "#4b5563",
  textSubtle: "#6b7280",
  border: "#e5e7eb",
  link: "#0b5cd1",
  linkDanger: "#b91c1c",
  primary: "#0b5cd1",
  primaryText: "#ffffff",
  danger: "#b91c1c",
  dangerSurface: "#fef2f2",
  dangerHeading: "#991b1b",
  warningSurface: "#fffbeb",
  warningHeading: "#92400e",
  infoSurface: "#eff6ff",
  infoHeading: "#1d4ed8",
  successSurface: "#ecfdf5",
  successHeading: "#065f46",
  detailSurface: "#f9fafb",
} as const;

export const main = {
  backgroundColor: COLOR.bg,
  fontFamily: FONT_STACK,
};

export const container = {
  backgroundColor: COLOR.surface,
  margin: "0 auto",
  padding: "40px 20px",
  maxWidth: "600px",
};

export const heading = {
  fontSize: "24px",
  fontWeight: "600",
  color: COLOR.text,
  marginBottom: "24px",
};

export const text = {
  fontSize: "16px",
  lineHeight: "26px",
  color: COLOR.textMuted,
};

export const hr = {
  borderColor: COLOR.border,
  margin: "24px 0",
};

export const detailsSection = {
  backgroundColor: COLOR.detailSurface,
  borderRadius: "8px",
  padding: "20px",
  margin: "24px 0",
};

export const detailsHeading = {
  fontSize: "18px",
  fontWeight: "600",
  color: COLOR.text,
  marginBottom: "12px",
};

export const detailItem = {
  fontSize: "14px",
  lineHeight: "24px",
  color: COLOR.textMuted,
  margin: "8px 0",
};

export const messageText = {
  fontSize: "14px",
  lineHeight: "24px",
  color: COLOR.textMuted,
  whiteSpace: "pre-wrap" as const,
};

export const buttonSection = {
  textAlign: "center" as const,
  margin: "32px 0",
};

/**
 * WCAG 2.5.5 AA (Target Size ≥ 44×44px) 準拠: content = fontSize × lineHeight
 * (16 × 1.25 = 20px) + padding-y (14 × 2 = 28px) = 48px。lineHeight は
 * MUA デフォルト (~1.2) 依存を避けるため必ず明示する。
 */
export const buttonPrimary = {
  backgroundColor: COLOR.primary,
  borderRadius: "6px",
  color: COLOR.primaryText,
  fontSize: "16px",
  lineHeight: "20px",
  fontWeight: "600",
  padding: "14px 24px",
  textDecoration: "none",
};

export const buttonDanger = {
  ...buttonPrimary,
  backgroundColor: COLOR.danger,
};

/**
 * 管理者宛メールの副次 CTA。primary と同じ 44px を満たしつつ、
 * ブランド色と区別するため background は text 色 (#1f2937) を使う。
 * 従来 admin-notification.tsx / event-admin-notification.tsx に個別に
 * 定義されていた ADMIN_BUTTON_STYLE (14px + line-height 未指定で 40.8px と 44px 未達)
 * を吸収した SSoT。
 */
export const buttonSecondary = {
  backgroundColor: COLOR.text,
  borderRadius: "6px",
  color: COLOR.primaryText,
  fontSize: "16px",
  lineHeight: "20px",
  fontWeight: "600",
  padding: "14px 24px",
  textDecoration: "none",
};

export const linkStyle = {
  color: COLOR.link,
  textDecoration: "underline",
};

export const linkDangerStyle = {
  color: COLOR.linkDanger,
  textDecoration: "underline",
};

/** WCAG AA: 4.51:1（#6b7280 on #ffffff）。旧 #8898aa（2.96:1）から強化済み。 */
export const urlFallbackText = {
  fontSize: "12px",
  color: COLOR.textSubtle,
  wordBreak: "break-all" as const,
};

/** フッター本体（住所・連絡先・© ライン）。サブテキストとして可読性を確保。 */
export const footerWrap = {
  marginTop: "32px",
  paddingTop: "20px",
  borderTop: `1px solid ${COLOR.border}`,
};

export const footerText = {
  fontSize: "12px",
  lineHeight: "20px",
  color: COLOR.textSubtle,
  margin: "4px 0",
};

export const footerLinks = {
  fontSize: "12px",
  lineHeight: "20px",
  color: COLOR.textSubtle,
  margin: "12px 0 4px 0",
};

export const footerLink = {
  color: COLOR.link,
  textDecoration: "underline",
};

/** セクション variant の背景色／見出し色を一括管理。 */
export type SectionVariant =
  "default" | "info" | "warning" | "danger" | "success";

export const SECTION_VARIANT_STYLES: Record<
  SectionVariant,
  { background: string; heading: string }
> = {
  default: { background: COLOR.detailSurface, heading: COLOR.text },
  info: { background: COLOR.infoSurface, heading: COLOR.infoHeading },
  warning: { background: COLOR.warningSurface, heading: COLOR.warningHeading },
  danger: { background: COLOR.dangerSurface, heading: COLOR.dangerHeading },
  success: { background: COLOR.successSurface, heading: COLOR.successHeading },
};
