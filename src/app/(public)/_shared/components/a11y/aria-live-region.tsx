"use client";

/**
 * ARIAライブリージョンコンポーネント
 *
 * スクリーンリーダー向けの動的コンテンツ通知表示
 * 視覚的には非表示だが、スクリーンリーダーには読み上げられる
 */

import { useAriaLiveOptional } from "@/shared/contexts";
import { ARIA_LIVE_REGION_CLASSES } from "@/public/lib/a11y";
import type { ReactElement } from "react";

/**
 * ARIAライブリージョン
 *
 * AriaLiveProviderの内部で使用する
 * announceされたメッセージをスクリーンリーダーに通知
 */
export function AriaLiveRegion(): ReactElement | null {
  const context = useAriaLiveOptional();

  // Provider外で使用された場合は何も表示しない
  if (!context) return null;

  return (
    <>
      {/* Politeリージョン */}
      <div
        aria-live="polite"
        aria-atomic="true"
        role="status"
        className={ARIA_LIVE_REGION_CLASSES}
      >
        {context.politeness === "polite" ? context.message : ""}
      </div>

      {/* Assertiveリージョン */}
      <div
        aria-live="assertive"
        aria-atomic="true"
        role="alert"
        className={ARIA_LIVE_REGION_CLASSES}
      >
        {context.politeness === "assertive" ? context.message : ""}
      </div>
    </>
  );
}
