/**
 * 共有コンテキスト
 *
 * admin/public両方で使用するコンテキストをexport
 */

export {
  AriaLiveProvider,
  useAriaLive,
  useAriaLiveOptional,
  type AriaLivePoliteness,
} from "./aria-live-context";
