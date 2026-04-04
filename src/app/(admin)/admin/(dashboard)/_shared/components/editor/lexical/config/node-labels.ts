/**
 * Node Labels
 *
 * @description ノードの選択肢ラベル定数を集約
 * Plugin と InspectorPanel の両方からインポートして使用
 */

import type { CalloutType } from "../nodes/CalloutNode";
import type {
  ButtonVariant,
  ButtonSize,
  ButtonAlignment,
} from "../nodes/ButtonNode";
import type { CaptionBoxStyle } from "../nodes/CaptionBoxNode";
import type { CollapsibleStyle } from "../nodes/CollapsibleContainerNode";
import type { PullQuoteStyle } from "../nodes/PullQuoteNode";
import type {
  StepsStyle,
  StepsShape,
  StepsFill,
} from "../nodes/StepsContainerNode";
import type {
  TabsStyle,
  TabsSize,
  TabsFixedWidth,
} from "../nodes/TabsContainerNode";

// =============================================================================
// CaptionBox
// =============================================================================

export const CAPTION_BOX_STYLE_LABELS: Record<CaptionBoxStyle, string> = {
  filled: "塗り",
  compact: "コンパクト",
  band: "ラベル",
  inner: "枠内",
  plain: "シンプル",
};

// =============================================================================
// Callout
// =============================================================================

export const CALLOUT_TYPE_LABELS: Record<CalloutType, string> = {
  info: "情報",
  warning: "注意",
  error: "エラー",
  success: "成功",
};

// =============================================================================
// Collapsible
// =============================================================================

export const COLLAPSIBLE_STYLE_LABELS: Record<CollapsibleStyle, string> = {
  default: "デフォルト",
  minimal: "ミニマル",
  card: "カード",
  filled: "塗りつぶし",
};

// =============================================================================
// Button
// =============================================================================

export const BUTTON_VARIANT_LABELS: Record<ButtonVariant, string> = {
  primary: "プライマリ",
  secondary: "セカンダリ",
  outline: "アウトライン",
};

export const BUTTON_SIZE_LABELS: Record<ButtonSize, string> = {
  sm: "小",
  md: "中",
  lg: "大",
};

export const BUTTON_ALIGNMENT_LABELS: Record<ButtonAlignment, string> = {
  left: "左",
  center: "中央",
  right: "右",
};

// =============================================================================
// PullQuote
// =============================================================================

export const PULL_QUOTE_STYLE_LABELS: Record<PullQuoteStyle, string> = {
  classic: "クラシック",
  modern: "モダン",
  minimal: "ミニマル",
};

// =============================================================================
// Steps
// =============================================================================

export const STEPS_STYLE_LABELS: Record<StepsStyle, string> = {
  numbered: "番号",
  big: "ビッグ",
  small: "スモール",
  icon: "アイコン",
  timeline: "タイムライン",
};

export const STEPS_SHAPE_LABELS: Record<StepsShape, string> = {
  circle: "丸",
  square: "四角",
};

export const STEPS_FILL_LABELS: Record<StepsFill, string> = {
  filled: "塗り",
  outline: "線のみ",
};

// =============================================================================
// Tabs
// =============================================================================

export const TABS_STYLE_LABELS: Record<TabsStyle, string> = {
  underline: "下線",
  pills: "ピル",
  boxed: "ボックス",
  minimal: "ミニマル",
};

export const TABS_SIZE_LABELS: Record<TabsSize, string> = {
  auto: "テキストにあわせる",
  fixed: "固定幅",
  fill: "端まで並べる",
  uniform: "均等幅で端まで並べる",
};

export const TABS_FIXED_WIDTH_LABELS: Record<TabsFixedWidth, string> = {
  "80": "80px（コンパクト）",
  "120": "120px（標準）",
  "160": "160px（ワイド）",
  "200": "200px（エクストラワイド）",
};
