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

// モーション設定
export {
  REDUCED_MOTION_CSS,
  prefersReducedMotion,
  getAnimationDuration,
} from "./motion-utils";

// ARIAライブリージョン
export {
  ARIA_LIVE_PRESETS,
  ARIA_LIVE_REGION_CLASSES,
  type AriaLivePoliteness,
  type AriaLiveRole,
  type AriaLiveAnnouncement,
} from "./aria-live";
