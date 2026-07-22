import { z } from "zod";

import { sectionHeaderFields } from "../_shared/section-header";
import { sectionLayoutSchema } from "../_shared/layout";

/**
 * terms-list は公開中の規約（TermsDocument）を全件表示する。
 * location-list と同様「これが一覧の全体」であり件数上限や
 * 「すべて見る」リンクは意味を持たないため listSectionHeaderFields ではなく
 * sectionHeaderFields（sectionLabel + title のみ）を使う。
 */
export const termsListConfigSchema = z.object({
  ...sectionHeaderFields({ sectionLabelDefault: "Terms" }),
  layout: sectionLayoutSchema,
});

export type TermsListConfig = z.infer<typeof termsListConfigSchema>;
