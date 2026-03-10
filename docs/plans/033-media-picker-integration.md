# 033: メディアピッカー統合

## 概要

画像設定UIの改善。URL直接入力からメディアライブラリダイアログへの移行。

## 問題

- 画像URLを手動入力するUIは使いにくい
- Lexicalエディタ内のMediaLibraryPluginが存在するが、フォームでは使用できない
- 各フォームで画像選択方法が統一されていない

## 解決策

クリーンアーキテクチャで新しいメディアピッカーシステムを構築:

- **3タブ構成**: ライブラリ選択 + URL入力 + アップロード
- **単一/複数選択**: 用途に応じて切り替え可能
- **React Hook Form統合**: setValue/watchパターンで既存フォームと統合
- **Lexical非依存**: 汎用コンポーネントとして独立

## アーキテクチャ

```
src/
├── types/
│   └── media-picker.ts           # 型定義
├── hooks/
│   ├── use-media-picker.tsx      # 公開API（useSingleMediaPicker, useMultipleMediaPicker）
│   ├── use-media-selection.ts    # 選択状態管理
│   ├── use-media-library.ts      # ライブラリ取得
│   └── use-media-upload.ts       # アップロード処理
└── components/admin/media-picker/
    ├── MediaPickerDialog.tsx     # メインダイアログ
    ├── tabs/
    │   ├── LibraryTab.tsx        # ライブラリタブ
    │   ├── UrlTab.tsx            # URL入力タブ
    │   └── UploadTab.tsx         # アップロードタブ
    └── components/
        ├── MediaItem.tsx         # グリッドアイテム
        ├── MediaGrid.tsx         # グリッド/リスト表示
        ├── SearchBar.tsx         # 検索バー
        ├── ViewToggle.tsx        # 表示切替
        ├── DropZone.tsx          # D&Dゾーン
        └── FilePreview.tsx       # プレビュー
```

## 使用例

```tsx
// 単一選択
const picker = useSingleMediaPicker({
  defaultUsage: "SPACE",
  onSelect: (media) => {
    if (media.length > 0) {
      setValue("mainImageUrl", media[0].url);
    }
  },
});

return (
  <>
    <Button onClick={() => picker.openPicker()}>画像を選択</Button>
    <picker.MediaPicker />
  </>
);

// 複数選択
const multiPicker = useMultipleMediaPicker({
  defaultUsage: "SPACE",
  maxSelections: 10,
  onSelect: (media) => {
    setImageUrls(media.map((m) => m.url));
  },
});
```

## 統合対象

| 対象          | ファイル                                       | 用途                          |
| ------------- | ---------------------------------------------- | ----------------------------- |
| SpaceForm     | `spaces/_components/SpaceForm.tsx`             | メイン画像 + 追加画像(max 10) |
| ImageFields   | `inline/side-panel/ImageFields.tsx`            | サムネイル + OGP画像          |
| PageSeoForm   | `pages/[slug]/seo/_components/PageSeoForm.tsx` | OGP画像                       |
| SectionEditor | `settings/_components/tabs/SectionEditor.tsx`  | Hero背景画像                  |
| CardPlugin    | `editor/lexical/plugins/CardPlugin.tsx`        | カード画像                    |

## 新規ファイル

- `src/types/media-picker.ts`
- `src/hooks/use-media-picker.tsx`
- `src/hooks/use-media-selection.ts`
- `src/hooks/use-media-library.ts`
- `src/hooks/use-media-upload.ts`
- `src/components/admin/media-picker/MediaPickerDialog.tsx`
- `src/components/admin/media-picker/index.ts`
- `src/components/admin/media-picker/tabs/LibraryTab.tsx`
- `src/components/admin/media-picker/tabs/UrlTab.tsx`
- `src/components/admin/media-picker/tabs/UploadTab.tsx`
- `src/components/admin/media-picker/tabs/index.ts`
- `src/components/admin/media-picker/components/MediaItem.tsx`
- `src/components/admin/media-picker/components/MediaGrid.tsx`
- `src/components/admin/media-picker/components/SearchBar.tsx`
- `src/components/admin/media-picker/components/ViewToggle.tsx`
- `src/components/admin/media-picker/components/DropZone.tsx`
- `src/components/admin/media-picker/components/FilePreview.tsx`
- `src/components/admin/media-picker/components/index.ts`

## 変更ファイル

- `src/app/(admin)/admin/(dashboard)/spaces/_components/SpaceForm.tsx`
- `src/components/admin/editor/inline/side-panel/ImageFields.tsx`
- `src/components/admin/editor/inline/BlogSidePanel.tsx`
- `src/app/(admin)/admin/(dashboard)/pages/[slug]/seo/_components/PageSeoForm.tsx`
- `src/app/(admin)/admin/(dashboard)/settings/_components/tabs/SectionEditor.tsx`
- `src/components/admin/editor/lexical/plugins/CardPlugin.tsx`

## マイグレーション

不要

## 検証結果

- type-check: 成功
- lint: 警告4件（React Compiler互換性警告、既知の問題）
- build: 成功
