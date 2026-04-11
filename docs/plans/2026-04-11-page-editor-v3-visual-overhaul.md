# ページエディタ v3 — ビジュアル刷新

**日付**: 2026-04-11
**種別**: UI/UX 改善
**ステータス**: 設計中

---

## 背景

v2 で構造改善（タブ廃止、inserter 追加、ヘッダー削除、Accordion 廃止）を実施したが、**視覚的な体験がほぼ変わっていない**。コンポーネントの中身（ToggleGroup/Select/Input）とスタイリング（カラー、スペーシング、フォントサイズ）が旧版と同一のため。

## 問題点

### サイドバー（SectionList / SectionListItem）

1. **アクティブ状態が弱い** — `bg-card` のみ。Gutenberg は左ボーダー青 + 青背景。Storyblok は青アウトライン。現状は白背景と微グレー背景の差が小さすぎる
2. **アイテムの情報密度が低い** — アイコン + テキスト1行のみ。セクションの中身（画像の有無、テキスト抜粋）が見えない
3. **セクション inserter が小さすぎる** — 5px の丸い「+」ボタンは発見しにくい。Squarespace は横幅いっぱいの区切り線 + 中央に目立つ「+」
4. **ヘッダー「セクション」ラベルが浮いている** — uppercase tracking-wide は管理画面の他のヘッダーと不統一
5. **追加ボタンが存在感薄い** — `variant="outline"` の小さなボタン。0件状態のフッターと区別がつかない

### 右パネル（SectionEditor / DesignFields）

6. **コンテンツとデザインの視覚的分離が不十分** — `border-t` の1px線のみ。Card ラッパーやセクションヘッダーで明確に区切るべき
7. **「管理用タイトル」が最上部に来る違和感** — ユーザーが最初に編集したいのはコンテンツ（AutoSectionForm）。タイトルはメタデータ
8. **デザインフィールドの fieldset/legend が目立たない** — `text-xs text-muted-foreground` で視認性が低い
9. **「デザインを保存」ボタンが孤立** — コンテンツの保存（AutoSectionForm 内蔵）と離れており、2つの保存ボタンの関係が不明
10. **DesignFields の ToggleGroup が密集** — 余白/背景/テキスト/レイアウトの4セクションが space-y-6 で並ぶが、視覚的グループ感が弱い

### 全体レイアウト

11. **ページレベルタブ（セクション/ページ設定）がコンテンツと離れている** — `mb-4` の後にマスターディテールが始まるため、タブとコンテンツの関係が弱い
12. **loading スケルトンが旧レイアウト（320px）のまま** — 280px に更新必要

## 改善設計

### A. サイドバーの視覚刷新

**アクティブ状態の強化:**

```
非選択: bg-transparent + text-muted-foreground
選択: bg-primary/5 + border-l-2 border-l-primary + text-foreground font-medium
```

Gutenberg の左ボーダーパターンを採用。`bg-card` ではなく `bg-primary/5` で選択状態を明示。

**セクションプレビュー追加:**
各アイテムにセクションの config から抽出した1行プレビューを表示:

```
1  🖼 ヒーロー
   メインビジュアル・キャッチコピー
2  📄 カスタム
   自由コンテンツ
```

`sectionPreviewText(section)` ヘルパーで config から title/subtitle/description の最初の非空値を抽出。

**inserter の拡大:**

- ホバー時に横幅いっぱいの水平線（`h-px bg-primary/30`）
- 中央の「+」ボタンを `h-6 w-6`（現在 `h-5 w-5`）に拡大
- ホバー遅延 150ms で誤操作防止

### B. 右パネルの視覚刷新

**コンテンツ・デザイン分離の強化:**
Card ラッパーで囲む:

```
Card (コンテンツ)
├── CardHeader: セクションタイプアイコン + タイプ名
├── CardContent: 管理用タイトル + AutoSectionForm
│
Card (デザイン)
├── CardHeader: 「デザイン設定」
├── CardContent: DesignFields
└── CardFooter: 保存ボタン
```

**管理用タイトルの移動:**
AutoSectionForm の下（または折りたたみ内）に移動。メインコンテンツが最初に来るようにする。

**DesignFields のグルーピング強化:**
fieldset ごとに `rounded-lg border border-border/50 p-3` で囲む（ネストカード風）。

### C. 全体レイアウトの微調整

- loading スケルトンを `280px` に更新
- ページレベルタブの `mb-4` → `mb-2`（コンテンツとの距離を縮める）
- 右パネルのパディングを `p-4` に統一

## 対象ファイル

| ファイル                  | 変更内容                                                              |
| ------------------------- | --------------------------------------------------------------------- |
| `SectionListItem.tsx`     | 選択状態を `bg-primary/5 + border-l-2` に変更、プレビューテキスト追加 |
| `SectionList.tsx`         | ヘッダーのスタイル調整                                                |
| `SectionInserter.tsx`     | サイズ拡大、ホバーエリア拡大                                          |
| `SectionEditor.tsx`       | Card ラッパー追加、タイトル位置移動、保存ボタン統合                   |
| `DesignFields.tsx`        | fieldset にボーダー追加、legend のスタイル強化                        |
| `SectionMasterDetail.tsx` | loading スケルトン更新、タブマージン調整                              |
| `SectionEmptyState.tsx`   | 0件時の CTA 強化                                                      |

## 参照

- WordPress Gutenberg: List View の選択状態（青左ボーダー + 青背景）
- Squarespace: セクション間 inserter（全幅線 + 中央ボタン）
- Payload CMS: ブロックごとの Card ラッパー
- Builder.io: Style/Options の明確なパネル分離
