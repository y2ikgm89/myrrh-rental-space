-- FAQ 回答をリッチテキスト（Lexical JSON + HTML キャッシュ + プレーン派生）から
-- 単一のプレーンテキスト列に統合する。
--
-- 既存の `answer` 列（もとは answerHtml の @map）には HTML が入っているため、
-- HTML タグ剥離 + 主要エンティティデコード + 空白正規化を行い、
-- その後 answerJson / answerPlainText を破棄する。後方互換性なし。

-- 1. 既存 HTML を平文へ変換
UPDATE "faq_items"
SET "answer" = trim(
  regexp_replace(
    replace(
      replace(
        replace(
          replace(
            replace(
              replace(
                regexp_replace("answer", '<[^>]*>', '', 'g'),
                '&nbsp;', ' '
              ),
              '&amp;', '&'
            ),
            '&lt;', '<'
          ),
          '&gt;', '>'
        ),
        '&quot;', '"'
      ),
      '&#39;', ''''
    ),
    '\s+', ' ', 'g'
  )
);

-- 2. 不要列を削除
ALTER TABLE "faq_items" DROP COLUMN "answerJson";
ALTER TABLE "faq_items" DROP COLUMN "answerPlainText";
