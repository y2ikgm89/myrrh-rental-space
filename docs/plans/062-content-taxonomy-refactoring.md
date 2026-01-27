# 062: コンテンツタクソノミー構造リファクタリング

> **ステータス**: 完了
> **作成日**: 2026-01-21
> **完了日**: 2026-01-21
> **関連**: docs/requirements/blog.md

---

## 背景・調査結果

### 主要CMSのベストプラクティス

| CMS | カテゴリー | タグ | 対象コンテンツ | ソース |
|-----|-----------|-----|--------------|--------|
| **WordPress** | 階層あり（親子） | フラット | 投稿（Posts）のみ。固定ページには適用しない | [WordPress.com Support](https://wordpress.com/support/posts/categories-vs-tags/) |
| **Ghost** | なし | タグのみ（Primary Tag優先） | 記事のみ | [Ghost Developer Docs](https://ghost.org/docs/themes/routing/) |
| **Strapi** | 自由設計 | 自由設計 | コンテンツタイプごとに定義 | [Strapi Docs](https://docs.strapi.io/cms/features/content-type-builder) |
| **Contentstack** | 階層型タクソノミー | メタデータ | コンテンツタイプごとに定義 | [Contentstack Blog](https://www.contentstack.com/blog/product-updates/taxonomy-establish-scalable-content-best-practices-with-control-and-ease) |

### 業界標準のパターン

**[Kontent.ai](https://kontent.ai/blog/from-chaos-to-clarity-best-practices-for-content-taxonomy/)** によるベストプラクティス:
- カテゴリー: 事前に情報アーキテクト/コンテンツストラテジストが設計（Taxonomy）
- タグ: 著者が自由に追加可能（Folksonomy）
- 両者を混同しない

**[WPBeginner](https://www.wpbeginner.com/beginners-guide/categories-vs-tags-seo-best-practices-which-one-is-better/)** によるSEOベストプラクティス:
- 1投稿あたり15個以上のカテゴリー・タグは避ける
- カテゴリーとタグで同じ名前を使わない
- 3投稿未満のタグは削除を検討

---

## 実装内容

### 採用した方針: ブログページの4タブ構造

サイドバーの階層化ではなく、ブログページ内での4タブ統合を採用。

**理由**:
- サイドバーは全てフラット構造で統一されている
- ブログだけ階層化すると一貫性が崩れる
- タブ統合により、カテゴリー・タグがブログの一部であることが明確になる
- **ネストされたタブを避ける**: 「カテゴリー・タグ」タブ内にさらにタブがある構造はUX上の問題があるため、4タブに分割

### 変更内容

#### 1. ブログページのタブ構造化

```
/admin/blog ページ:
┌──────────────────────────────────────────────────┐
│ ブログ管理                           [新規作成]  │
├──────────────────────────────────────────────────┤
│ [記事一覧] [カテゴリー] [タグ] [コメント]        │
├──────────────────────────────────────────────────┤
│                                                  │
│  （選択したタブの内容）                          │
│                                                  │
└──────────────────────────────────────────────────┘
```

- `/admin/blog?tab=posts` - 記事一覧（デフォルト）
- `/admin/blog?tab=categories` - カテゴリー管理
- `/admin/blog?tab=tags` - タグ管理
- `/admin/blog?tab=comments` - コメント管理

#### 2. サイドバーの変更

```
変更前:
├── ブログ           → /admin/blog
├── カテゴリ・タグ    → /admin/blog/taxonomy  ← 削除

変更後:
├── ブログ           → /admin/blog
```

#### 3. リダイレクト設定（next.config.ts）

| 旧パス | 新パス |
|--------|--------|
| `/admin/blog/taxonomy` | `/admin/blog?tab=categories` |
| `/admin/blog/categories` | `/admin/blog?tab=categories` |
| `/admin/blog/tags` | `/admin/blog?tab=tags` |
| `/admin/blog/comments` | `/admin/blog?tab=comments` |

#### 4. 削除したファイル

- `/admin/blog/categories/` ディレクトリ
- `/admin/blog/tags/` ディレクトリ

#### 5. リダイレクト化したファイル

- `/admin/blog/taxonomy/page.tsx` → リダイレクト処理
- `/admin/blog/comments/page.tsx` → リダイレクト処理

---

## 変更ファイル一覧

| ファイル | 変更内容 |
|---------|---------|
| `src/app/(admin)/admin/(dashboard)/blog/page.tsx` | 4タブ構造に変更 |
| `src/app/(admin)/admin/(dashboard)/_components/sidebar-items.tsx` | カテゴリ・タグ削除 |
| `src/app/(admin)/admin/(dashboard)/blog/taxonomy/_components/CategoryManager.tsx` | 新規作成（カテゴリー管理） |
| `src/app/(admin)/admin/(dashboard)/blog/taxonomy/_components/TagManager.tsx` | 新規作成（タグ管理） |
| `src/app/(admin)/admin/(dashboard)/blog/taxonomy/page.tsx` | リダイレクト処理 |
| `src/app/(admin)/admin/(dashboard)/blog/comments/page.tsx` | リダイレクト処理 |
| `next.config.ts` | リダイレクト設定追加 |
| `e2e/admin/blog.spec.ts` | 4タブ構造に合わせてテスト更新 |

---

## 参考ソース

- [WordPress.com Support - Categories vs Tags](https://wordpress.com/support/posts/categories-vs-tags/)
- [WPBeginner - Categories vs Tags SEO Best Practices](https://www.wpbeginner.com/beginners-guide/categories-vs-tags-seo-best-practices-which-one-is-better/)
- [Ghost Developer Docs - Routing](https://ghost.org/docs/themes/routing/)
- [Ghost SEO - Tags Usage](https://ghostseo.org/ghost-tags-seo/)
- [Strapi Docs - Content-type Builder](https://docs.strapi.io/cms/features/content-type-builder)
- [Strapi Blog - Content Modeling](https://strapi.io/blog/content-modeling)
- [Contentstack - Taxonomy](https://www.contentstack.com/blog/product-updates/taxonomy-establish-scalable-content-best-practices-with-control-and-ease)
- [Kontent.ai - Content Taxonomy Best Practices](https://kontent.ai/blog/from-chaos-to-clarity-best-practices-for-content-taxonomy/)
- [Webiny - Content Modeling Best Practices](https://www.webiny.com/docs/headless-cms/basics/content-modeling-best-practices)
- [Digital Flask - Building Custom Category and Tag System in Next.js](https://www.digitalflask.com/blog/building-custom-category-and-tag-system-in-nextjs-blogs)
