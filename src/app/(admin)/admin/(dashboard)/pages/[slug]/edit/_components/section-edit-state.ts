/**
 * section-edit-state — `/admin/pages/[slug]/edit` の URL state SSoT
 *
 * `?section=<sectionId>` で現在編集中のセクションを管理する。
 * `history: "replace"` でブラウザ履歴を汚さず `shallow: true` で
 * RSC を再フェッチせず Client 側のみ state 更新する（master-detail 切替の
 * 体感速度を確保。データは Page Editor 側で取得済み）。
 */

import { parseAsString } from "nuqs";

export const sectionEditQueryParser = parseAsString
  .withDefault("")
  .withOptions({ history: "replace", shallow: true });
