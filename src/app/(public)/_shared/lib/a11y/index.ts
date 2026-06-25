/**
 * アクセシビリティライブラリ
 *
 * WCAG 2.1 AA準拠のためのユーティリティ集
 */

// スキップリンク
export {
  DEFAULT_SKIP_TARGETS,
  SKIP_LINK_CLASSES,
  type SkipLinkTarget,
} from "./skip-link";

// radiogroup 用キーボード制御 (WAI-ARIA APG)
export {
  useRadioGroupKeyboard,
  type RadioItemProps,
  type UseRadioGroupKeyboardOptions,
  type UseRadioGroupKeyboardReturn,
} from "./use-radio-group-keyboard";
