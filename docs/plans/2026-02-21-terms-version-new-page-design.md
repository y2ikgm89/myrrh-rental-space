# 利用規約バージョン作成専用ページ化 — 設計ドキュメント

> 作成: 2026-02-21

## 背景・目的

現在、規約の新バージョン作成はダイアログ (`Dialog`) 内で行われている。
Lexical リッチテキストエディタを含む重いフォームをダイアログに詰め込んでいるため
UX・実装品質ともに問題がある。専用ページに移行し、既存の編集ページと統一する。

## 修正対象の問題

| #   | 問題                                                                | ファイル                             |
| --- | ------------------------------------------------------------------- | ------------------------------------ |
| 1   | 新規作成がダイアログ内（エディタ領域が狭い）                        | `TermsDetailView.tsx`                |
| 2   | 編集ページが `AdminDetailLayout` 未使用（パターン違反）             | `versions/[versionId]/edit/page.tsx` |
| 3   | 編集成功後リダイレクトが空実装（`onSuccess={() => {}}`）            | `versions/[versionId]/edit/page.tsx` |
| 4   | `TermsVersionForm` の `onSuccess`/`onCancel` がダイアログ起源の漏れ | `TermsVersionForm.tsx`               |

## URL 設計

```
/admin/terms/{id}                              # 規約詳細（変更なし）
/admin/terms/{id}/versions/new                 # ← NEW: バージョン作成専用ページ
/admin/terms/{id}/versions/{versionId}         # バージョンプレビュー（変更なし）
/admin/terms/{id}/versions/{versionId}/edit    # バージョン編集（AdminDetailLayout 修正）
```

## コンポーネント設計

### 1. `TermsVersionForm` — Props 再設計（破壊的変更）

```typescript
// Before (ダイアログ起源の設計)
interface TermsVersionFormProps {
  termsId: string;
  termsType: TermsType;
  businessInfo?: BusinessInfo;
  version?: TermsVersionDetail | null;
  onSuccess?: () => void; // ← ダイアログを閉じる用
  onCancel?: () => void; // ← ダイアログを閉じる用
}

// After (ページネイティブな設計)
interface TermsVersionFormProps {
  termsId: string;
  termsType: TermsType;
  businessInfo?: BusinessInfo;
  version?: TermsVersionDetail | null;
  redirectTo: string; // ← 成功後のリダイレクト先（必須）
  editorHeight?: string; // ← エディタ高さ（default: "600px"）
}
```

- `redirectTo` は成功後に `router.push(redirectTo)` で使用
- `onSuccess`/`onCancel` を完全削除（キャンセルは `AdminDetailLayout` の backHref で代替）
- `editorHeight` のデフォルトを `"600px"` に変更（ページ全体で使える高さ）

### 2. 新規作成ページ: `terms/[id]/versions/new/page.tsx`

```
Server Component
├── connection()
├── getTermsById(id) + getSettings()  — Promise.all
├── notFound() if not found
├── AdminDetailLayout
│   ├── backHref: /admin/terms/{id}
│   ├── backLabel: "詳細に戻る"
│   ├── title: "新しいバージョンを作成"
│   └── subtitle: terms.title
└── TermsVersionForm
    ├── termsId, termsType, businessInfo
    └── redirectTo: /admin/terms/{id}
```

### 3. 編集ページ修正: `terms/[id]/versions/{versionId}/edit/page.tsx`

```
Server Component（現状からの変更点のみ）
├── AdminDetailLayout を追加
│   ├── backHref: /admin/terms/{id}/versions/{versionId}
│   ├── backLabel: "詳細に戻る"
│   ├── title: "バージョン {n} を編集"
│   └── subtitle: terms.title
├── 手動ヘッダー（div + Button + Link）を削除
└── TermsVersionForm に redirectTo 追加
    └── redirectTo: /admin/terms/{id}/versions/{versionId}
```

### 4. `TermsDetailView` — ダイアログ削除

```typescript
// 削除するもの
- showNewVersionDialog state
- Dialog (新バージョン作成用)
- TermsVersionForm import（ダイアログ内のみで使用）

// 変更するもの
- Button onClick={() => setShowNewVersionDialog(true)}
  → Button asChild + Link href="/admin/terms/{id}/versions/new"
```

## ナビゲーションフロー

```
規約詳細ページ
  └─[新しいバージョンを作成]→ /admin/terms/{id}/versions/new
                                ├─[キャンセル(backHref)]→ 規約詳細
                                └─[作成成功]→ 規約詳細（バージョン一覧更新）

バージョンプレビューページ
  └─[編集]→ /admin/terms/{id}/versions/{versionId}/edit
              ├─[キャンセル(backHref)]→ バージョンプレビュー
              └─[更新成功]→ バージョンプレビュー（内容確認）
```

## Metadata

| ページ         | title                                                           |
| -------------- | --------------------------------------------------------------- |
| 新規作成       | `新しいバージョンを作成 \| {terms.title} \| Myrrh Rental Space` |
| 編集（修正後） | `バージョン {n} を編集 \| {terms.title} \| Myrrh Rental Space`  |

## 影響範囲

| ファイル                                        | 変更種別                                      |
| ----------------------------------------------- | --------------------------------------------- |
| `terms/_components/TermsVersionForm.tsx`        | 修正（props設計変更）                         |
| `terms/_components/TermsDetailView.tsx`         | 修正（ダイアログ削除・Link化）                |
| `terms/[id]/versions/new/page.tsx`              | 新規作成                                      |
| `terms/[id]/versions/[versionId]/edit/page.tsx` | 修正（AdminDetailLayout適用・redirectTo追加） |

既存の Server Actions（`createTermsVersion`, `updateTermsVersion`）は変更なし。
