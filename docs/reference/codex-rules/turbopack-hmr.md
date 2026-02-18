# Turbopack HMR エラー対処

> **Note**: このコンテンツは `.claude/rules/` から `.claude/skills/turbopack-hmr/SKILL.md`（`user-invocable: false`）に移行済み。
> Next.js 16 + Turbopack 開発時の HMR エラー対処

## 対象エラー

```
[project]/path/to/actions/file:HASH [app-client] (ecmascript) <text/javascript>
was instantiated because it was required from module
[project]/path/to/component.tsx [app-client] (ecmascript),
but the module factory is not available.
It might have been deleted in an HMR update.
```

## 原因

Turbopack の HMR がモジュール境界（`'use server'` ↔ `'use client'`）の再読み込みに失敗する既知の制限。

**発生条件**:
1. Client Component（`'use client'`）が Server Action ファイル（`'use server'`）を import
2. 開発中にその Server Action ファイルまたは依存ファイルを編集
3. HMR がモジュールファクトリを再構築できず、参照が消失

**重要**: import パターン自体は正しい React 19 の標準パターン。コードの修正は不要。

## 対処手順（開発者向け）

### 即時対処

1. **ブラウザをハードリロード**（`Ctrl+Shift+R` / `Cmd+Shift+R`）
2. それでも解消しない場合: **開発サーバーを再起動**（`bun dev`）

### 再発防止（開発時のコツ）

- Server Action ファイル（`actions/*.ts`）を大幅に変更した後はブラウザをリロード
- `.next` キャッシュが肥大化した場合は `rm -rf .next && bun dev` で再起動

## AI エージェント向け指示

このエラーが報告された場合:

1. **コードの修正は不要** — アーキテクチャの問題ではない
2. ユーザーに以下を案内:
   - ブラウザのハードリロード（`Ctrl+Shift+R`）
   - それでも解消しない場合は `bun dev` を再起動
3. `.next` キャッシュの削除を提案（繰り返し発生する場合）

```bash
# キャッシュクリア＋再起動
rm -rf .next && bun dev
```

## 本プロジェクトの既知の発生箇所

| Client Component | Server Action | トリガー |
|-----------------|---------------|---------|
| `comment-panel/CommentPanel.tsx` | `actions/editor-comment.ts` | editor-comment.ts 編集時 |

> Server Action を import する Client Component は他にも多数存在する（`useFormAction` フック経由等）。
> いずれも同様のエラーが発生し得るが、対処は同じ。

## 禁止事項

1. **このエラーを理由にコードのリファクタリングを行わない**
   - `'use server'` → `'use client'` import は正しいパターン
   - 不要な re-export ラッパーやインダイレクションを追加しない

2. **Server Action の inline 化禁止**
   - HMR 回避のためにコンポーネント内に Server Action を埋め込まない
