-- FAQ 項目から SEO/OGP メタデータ列を削除する。
--
-- FAQ は /faq 一覧ページのアコーディオンとして集約表示され、
-- 項目単位の個別ページは存在しない。そのため項目ごとの
-- metaDescription / metaKeywords / ogpTitle / ogpDescription / ogpImageUrl は
-- 一切参照されておらず、完全に廃止する。リッチコンテンツが必要なトピックは
-- 投稿管理 (Post) で Lexical エディタを使って記述する方針に統一した。
--
-- 後方互換性なし（破壊的変更）。

ALTER TABLE "faq_items" DROP COLUMN "metaDescription";
ALTER TABLE "faq_items" DROP COLUMN "metaKeywords";
ALTER TABLE "faq_items" DROP COLUMN "ogpTitle";
ALTER TABLE "faq_items" DROP COLUMN "ogpDescription";
ALTER TABLE "faq_items" DROP COLUMN "ogpImageUrl";
