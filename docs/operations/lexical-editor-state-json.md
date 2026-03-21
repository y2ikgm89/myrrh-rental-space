# Lexical EditorState JSON（運用）

## 契約

- アプリの正本は **`lexicalJsonSchema`**（`src/shared/lib/validations/lexical.ts`）と一致すること。
- **空の本文**は `root.children: []` のみのオブジェクトではなく、**`EMPTY_LEXICAL_EDITOR_STATE_JSON`**（空段落 1 ブロック）を使う。Lexical の `setEditorState` は root のみの状態を拒否する。
- 管理画面の `LexicalComposer` は **スキーマを満たさない文字列ではマウントしない**（レガシー JSON を自動で EMPTY に置き換えない）。不正データは DB または送信元を修正する。

## レガシー行の一括修正（PostgreSQL）

`root.children` が空配列の JSON が残っている場合、次の値（**`lexical.ts` の `EMPTY_LEXICAL_EDITOR_STATE_JSON` と同一**）へ更新する。

以下は dollar-quoted リテラル例（`$EMPTY$` の内側を `lexical.ts` からコピーして置き換えてもよい）。

```sql
UPDATE posts
SET "contentJson" = $EMPTY$
{"root":{"children":[{"children":[],"direction":null,"format":"","indent":0,"type":"paragraph","version":1,"textFormat":0,"textStyle":""}],"direction":null,"format":"","indent":0,"type":"root","version":1}}
$EMPTY$::jsonb
WHERE "contentJson" IS NOT NULL
  AND jsonb_typeof("contentJson") = 'object'
  AND "contentJson"->'root'->'children' = '[]'::jsonb;
```

同様の条件で、該当カラムを更新する:

| テーブル | カラム |
| -------- | ------ |
| `news` | `contentJson` |
| `news_versions` | `contentJson` |
| `posts` | `contentJson` |
| `post_versions` | `contentJson` |
| `sections` | `contentJson` |
| `faq_items` | `answerJson` |
| `terms_versions` | `contentJson` |

`block_templates.nodeJson` は EditorState 全体とは限らないため、条件を絞るか手動確認する。

**注意**: 本番実行前にバックアップとステージングでの検証を行う。
