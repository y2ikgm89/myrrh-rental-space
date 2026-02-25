# 利用規約管理 UX 全面見直し — 設計ドキュメント

> 作成: 2026-02-21

## 背景・目的

現在の利用規約管理は、新規作成（InlineEditor）とバージョン管理（DetailView + VersionForm）の
2系統が混在しており、UX が一貫していない。さらに：

1. バージョン編集ページで `LexicalEditor` が既存コンテンツを正しく表示しないバグ
2. `new/page.tsx` に `await connection()` が2回（Gotcha 違反）
3. バージョン詳細リンクが `<Link>` でなく `<a>` タグ（フルリロード）
4. `TermsInlineEditor` の edit モードは `currentVersionId`（公開バージョン）しか更新できない設計
5. プレビューで開く `/terms/[slug]` ルートが存在しない

**方針:** InlineEditor に全統一（破壊的変更）。バージョン管理・公開フローも
InlineEditor のサイドパネル内に統合する。

## 修正対象の問題一覧

| #   | 問題                                               | 解決策                                   |
| --- | -------------------------------------------------- | ---------------------------------------- |
| 1   | バージョン編集でコンテンツが表示されない           | TermsVersionForm 廃止・InlineEditor 統合 |
| 2   | `connection()` 2回呼び出し                         | new/page.tsx を修正                      |
| 3   | `<a>` タグ（フルリロード）                         | TermsDetailView 廃止により解消           |
| 4   | DRAFT バージョン以外を InlineEditor で編集できない | edit mode でバージョン選択機能を実装     |
| 5   | `/terms/[slug]` ルートが存在しない                 | 公開ページを新設                         |

## URL 設計

```
# 維持（変更なし）
/admin/terms                     → 利用規約一覧

# 改善のみ（connection() バグ修正）
/admin/terms/new                 → InlineEditor (create mode)

# 新設（完全実装）
/admin/terms/[id]/edit           → InlineEditor (edit mode)

# リダイレクト（廃止）
/admin/terms/[id]                → /admin/terms/[id]/edit にリダイレクト

# 廃止（全削除）
/admin/terms/[id]/versions/new
/admin/terms/[id]/versions/[versionId]
/admin/terms/[id]/versions/[versionId]/edit

# 公開ページ（新設）
/terms/[slug]                    → 個別規約ページ（最新公開バージョンを表示）
```

## 廃止するファイル（完全削除）

| ファイル                                        | 代替                             |
| ----------------------------------------------- | -------------------------------- |
| `terms/[id]/page.tsx`                           | `terms/[id]/edit` にリダイレクト |
| `terms/[id]/versions/new/page.tsx`              | InlineEditor 内に統合            |
| `terms/[id]/versions/[versionId]/page.tsx`      | 廃止（プレビューは公開ページ）   |
| `terms/[id]/versions/[versionId]/edit/page.tsx` | 廃止（InlineEditor に統合）      |
| `_components/TermsDetailView.tsx`               | 廃止                             |
| `_components/TermsVersionForm.tsx`              | 廃止                             |

## コンポーネント設計

### TermsInlineEditor — edit mode 完全実装

```typescript
// 現在
interface TermsInlineEditorProps {
  terms?: TermsData; // currentVersionId しか管理できない
  businessInfo?: BusinessInfo;
  mode?: "create" | "edit";
}

// 変更後
interface TermsData {
  id: string;
  title: string;
  slug: string;
  type: TermsType;
  isActive: boolean;
  versions: TermsVersionSummary[]; // 全バージョンの一覧（追加）
  currentVersionId?: string;
  // currentVersionContentJson/Html は削除（バージョン選択で動的に取得）
}

interface TermsVersionSummary {
  id: string;
  version: number;
  status: TermsStatus; // DRAFT | PUBLISHED | ARCHIVED
  isCurrentVersion: boolean;
  publishedAt: Date | null;
  createdAt: Date;
}
```

### サイドパネル構成（edit mode）

```
SidePanel（width="default": 420px）
│
├── セクション: バージョン管理
│   ├── 選択中バージョンのバッジ（"v3 下書き" 等）
│   ├── ドロップダウン: バージョン選択（全バージョン一覧）
│   ├── [新しいバージョンを作成] ボタン
│   └── バージョン別アクション（選択バージョンの status に応じて）
│       ├── DRAFT: [公開する] [削除]
│       ├── PUBLISHED & isCurrentVersion: （変更不可インジケーター）
│       └── PUBLISHED & !isCurrentVersion: [現在に設定] [アーカイブ]
│
└── セクション: 基本情報
    ├── タイトル（Input）
    ├── スラッグ（Input + URLプレビュー）
    └── 規約タイプ（表示のみ・変更不可）
```

### EditorHeader（edit mode）

```
EditorHeader
├── title: terms.title
├── slug: "terms/{terms.slug}"
├── isDirty: 基本情報 OR コンテンツの未保存変更
├── onSave: 変更を保存（基本情報 + バージョンコンテンツ）
├── onPreview: window.open('/terms/{slug}', '_blank')
└── extraActions:
    └── DRAFT 以外のバージョン選択中: 「読み取り専用」バッジ
```

### LexicalEditor の制約への対応

`LexicalEditor` は初期化後に props 変更を無視する（非制御設計）。
バージョン切り替え時は `editorKey` をインクリメントして re-mount する。

## 状態管理設計

```typescript
// InlineEditor (edit mode) の主要な state
const [selectedVersionId, setSelectedVersionId] =
  useState<string>(initialVersionId);
const [selectedVersionContent, setSelectedVersionContent] =
  useState<VersionContent>();
const [editorKey, setEditorKey] = useState(0); // re-mount 用
const [isPending, startTransition] = useTransition();
const [hasEditorChanges, setHasEditorChanges] = useState(false);

// RHF で基本情報を管理
const {
  register,
  handleSubmit,
  formState: { isDirty },
} = useForm<FormData>({
  defaultValues: { title: terms.title, slug: terms.slug },
});
```

## バージョン切り替えフロー

```
1. ドロップダウンでバージョン選択
2. 未保存変更あり → confirm ダイアログ（「変更を破棄して切り替えますか？」）
3. getTermsVersionById(newVersionId) で内容取得（Server Action）
4. setSelectedVersionContent(data)
5. setEditorKey(k + 1) で LexicalEditor を re-mount
6. DRAFT 以外のバージョン: エディタを disabled / 読み取り専用表示
7. hasEditorChanges = false にリセット
```

## 新バージョン作成フロー

```
1. [新しいバージョンを作成] クリック
2. 確認ダイアログ（省略：バージョン番号が自動採番されることを表示）
3. createTermsVersion({ termsId, contentJson: currentEditorContent })
4. 成功後: terms.versions を更新し、新バージョンに自動切り替え
5. バージョンドロップダウンに新バージョンが追加される
```

## 保存ロジック

```
handleSave():
├── [基本情報が変更] isDirty=true
│   └── updateTerms(termsId, { title, slug })
├── [コンテンツが変更] hasEditorChanges=true AND 選択バージョンが DRAFT
│   └── updateTermsVersion(selectedVersionId, { contentJson })
├── [PUBLISHED バージョン選択中でコンテンツ変更あり]
│   └── createTermsVersion({ termsId, contentJson }) で新バージョンを作成
│       （ユーザーに確認後）
└── 全成功: toast.success + isDirty/hasEditorChanges をリセット
```

## 新設：公開ページ `/terms/[slug]`

```typescript
// src/app/(public)/terms/[slug]/page.tsx

// データ取得関数（公開用）
async function getPublicTermsBySlug(slug: string)
  → Terms + 最新の PUBLISHED バージョン（isCurrentVersion=true）

// ページ構成
<main>
  <BreadcrumbJsonLd items={[...]}/>
  <article>
    <h1>{terms.title}</h1>
    <time>最終更新: {version.publishedAt}</time>
    <SanitizedHtml html={version.contentHtml} className={PROSE_CLASSES} />
  </article>
</main>
```

## Server Actions の変更

### 新規追加

```typescript
// 公開ページ用（公開規約をスラッグで取得）
export async function getPublicTermsBySlug(
  slug: string,
): Promise<PublicTermsData | null>;

// バージョン一覧付きの規約詳細（edit mode 用）
// getTermsById を拡張（versions に全バージョン summary を含める）
```

### 変更

```typescript
// getTermsById の include を拡張
// versions の select に contentJson/contentHtml を除外した軽量フィールドを追加
// （コンテンツは getTermsVersionById で個別取得）
```

### 廃止なし

既存の Server Actions（createTermsVersion, updateTermsVersion, publishTermsVersion 等）は変更なし。

## TermsData 型の拡張

```typescript
// terms validation に TermsVersionSummary を追加
export interface TermsVersionSummary {
  id: string;
  version: number;
  status: TermsStatus;
  isCurrentVersion: boolean;
  publishedAt: Date | null;
  createdAt: Date;
}

// TermsDetail.versions の型を TermsVersionSummary[] に変更
// （既存の TermsDetail.versions は status/publishedAt/isCurrentVersion を持つ select）
// → 現在の getTermsById の select と一致するため変更不要
```

## 影響範囲

| ファイル                                        | 変更種別                                     |
| ----------------------------------------------- | -------------------------------------------- |
| `terms/new/page.tsx`                            | 修正（connection() バグ修正）                |
| `terms/[id]/page.tsx`                           | リダイレクト実装（削除ではなくリダイレクト） |
| `terms/[id]/edit/page.tsx`                      | **新規作成**（メイン実装）                   |
| `terms/[id]/versions/new/page.tsx`              | **削除**                                     |
| `terms/[id]/versions/[versionId]/page.tsx`      | **削除**                                     |
| `terms/[id]/versions/[versionId]/edit/page.tsx` | **削除**                                     |
| `_components/TermsInlineEditor.tsx`             | **大幅修正**（edit mode 完全実装）           |
| `_components/TermsDetailView.tsx`               | **削除**                                     |
| `_components/TermsVersionForm.tsx`              | **削除**                                     |
| `_shared/actions/terms.ts`                      | 軽微修正（getTermsById の include 確認）     |
| `(public)/terms/[slug]/page.tsx`                | **新規作成**（公開ページ）                   |
| `(public)/_shared/actions/terms.ts`             | **新規作成**（公開用 Server Action）         |

## ナビゲーションフロー（変更後）

```
一覧 /admin/terms
  └─ [新規作成] → /admin/terms/new (InlineEditor create)
       └─ 作成成功 → /admin/terms/{id}/edit

  └─ [編集] → /admin/terms/{id}/edit (InlineEditor edit)
       ├─ サイドパネル: バージョン選択
       ├─ [公開] → publishTermsVersion → 更新
       ├─ [新バージョン作成] → createTermsVersion → 新バージョンに切り替え
       └─ [プレビュー] → /terms/{slug}（新タブ）

公開ページ /terms/{slug}
  └─ 最新公開バージョンの contentHtml を表示
```
