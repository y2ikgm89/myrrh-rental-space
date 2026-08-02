-- 保存済みテキストの前後空白を、実行時スキーマと同じ規則で一度だけ正規化する。
--
-- なぜ必要か
--   #1815 / #1819 で必須テキストに `.trim()` を課したが、それ以前に保存された行は
--   前後に空白を持ったまま残っている。JSON カラムでは実害が出ていた:
--     * `spaces.facilities` は読み取りスキーマと共用のため、空白だけの設備名や
--       trim 後に重複する名前があると、そのスペースの設備が丸ごと読めなくなる
--     * 公開の設備ファセットは trim 済みの名前を出す一方、絞り込みは生の JSONB
--       への containment。実測 `'[{"name":" Wi-Fi "}]' @> '[{"name":"Wi-Fi"}]'` は false
--       なので、ファセットに出るのに絞り込むと消えるスペースができる
--   読み取り側の寛容化ではこれは直らない。ずれているのは保存値そのもののため。
--
-- PR #922 の「migration で自動修復しない」原則との関係
--   あれが禁じたのは**副作用を持つドメイン状態遷移**（重複予約を生 SQL で CANCELLED に
--   して Stripe 返金・GCal 削除・通知・監査ログを迂回する）である。ここでやるのは
--   表示文字列の形式正規化で、迂回されるドメインコマンドは存在しない。
--
-- 空白の定義は JavaScript の String.prototype.trim() に合わせる。
--   Postgres の `btrim()` は **ASCII 空白しか落とさない**（全角空白 U+3000 が残る）。
--   `[[:space:]]` / `\s` は全角は拾うが NBSP (U+00A0) と BOM (U+FEFF) を落とさない。
--   下の文字クラスは JS の WhiteSpace + LineTerminator と一致することを 20 ケースで
--   突き合わせ済み。
--
-- 冪等性: どちらの UPDATE も `IS DISTINCT FROM` で保護してあるので、清浄な行には
-- 触れず、再実行しても何も起きない。DDL を含まないため計画ダウンタイムにもならない。

-- spaces.facilities: name を正規化し、空になった要素を捨て、
-- 正規化後に重複した名前は先に現れた方を残す（name は React key の stable ID）。
WITH canonical AS (
  SELECT s.id,
         COALESCE(
           (SELECT jsonb_agg(elem ORDER BY ord)
            FROM (
              SELECT DISTINCT ON (
                       regexp_replace(e.value ->> 'name',
                         '^[\s\u00A0\u1680\u2000-\u200A\u2028\u2029\u202F\u205F\u3000\uFEFF]+|[\s\u00A0\u1680\u2000-\u200A\u2028\u2029\u202F\u205F\u3000\uFEFF]+$', '', 'g'))
                     jsonb_set(e.value, '{name}',
                       to_jsonb(regexp_replace(e.value ->> 'name',
                         '^[\s\u00A0\u1680\u2000-\u200A\u2028\u2029\u202F\u205F\u3000\uFEFF]+|[\s\u00A0\u1680\u2000-\u200A\u2028\u2029\u202F\u205F\u3000\uFEFF]+$', '', 'g'))) AS elem,
                     e.ordinality AS ord
              FROM jsonb_array_elements(s.facilities) WITH ORDINALITY AS e(value, ordinality)
              WHERE regexp_replace(e.value ->> 'name',
                      '^[\s\u00A0\u1680\u2000-\u200A\u2028\u2029\u202F\u205F\u3000\uFEFF]+|[\s\u00A0\u1680\u2000-\u200A\u2028\u2029\u202F\u205F\u3000\uFEFF]+$', '', 'g') <> ''
              ORDER BY regexp_replace(e.value ->> 'name',
                         '^[\s\u00A0\u1680\u2000-\u200A\u2028\u2029\u202F\u205F\u3000\uFEFF]+|[\s\u00A0\u1680\u2000-\u200A\u2028\u2029\u202F\u205F\u3000\uFEFF]+$', '', 'g'),
                       e.ordinality
            ) AS kept),
           '[]'::jsonb) AS facilities
  FROM "spaces" s
  WHERE jsonb_typeof(s.facilities) = 'array'
)
UPDATE "spaces" s
SET facilities = c.facilities
FROM canonical c
WHERE s.id = c.id
  AND s.facilities IS DISTINCT FROM c.facilities;

-- settings_sidebars.sidebarWidgets: custom widget の title を正規化し、
-- 空になった custom widget を捨てる。builtin widget は title を持たない。
WITH canonical AS (
  SELECT sb.id,
         COALESCE(
           (SELECT jsonb_agg(
                     CASE WHEN e.value ->> 'type' = 'custom'
                          THEN jsonb_set(e.value, '{title}',
                                 to_jsonb(regexp_replace(e.value ->> 'title',
                                   '^[\s\u00A0\u1680\u2000-\u200A\u2028\u2029\u202F\u205F\u3000\uFEFF]+|[\s\u00A0\u1680\u2000-\u200A\u2028\u2029\u202F\u205F\u3000\uFEFF]+$', '', 'g')))
                          ELSE e.value END
                     ORDER BY e.ordinality)
            FROM jsonb_array_elements(sb."sidebarWidgets") WITH ORDINALITY AS e(value, ordinality)
            WHERE e.value ->> 'type' <> 'custom'
               OR regexp_replace(COALESCE(e.value ->> 'title', ''),
                    '^[\s\u00A0\u1680\u2000-\u200A\u2028\u2029\u202F\u205F\u3000\uFEFF]+|[\s\u00A0\u1680\u2000-\u200A\u2028\u2029\u202F\u205F\u3000\uFEFF]+$', '', 'g') <> ''),
           '[]'::jsonb) AS widgets
  FROM "settings_sidebars" sb
  WHERE jsonb_typeof(sb."sidebarWidgets") = 'array'
)
UPDATE "settings_sidebars" sb
SET "sidebarWidgets" = c.widgets
FROM canonical c
WHERE sb.id = c.id
  AND sb."sidebarWidgets" IS DISTINCT FROM c.widgets;
