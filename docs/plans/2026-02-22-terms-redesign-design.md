# 利用規約管理 リデザイン — 設計ドキュメント

**日付**: 2026-02-22
**方針**: アプローチ A — DB クリーンアップ + UX 改善
**破壊的変更**: あり（Prisma migration, Server Actions 削除, コンポーネント削除）
**ステータス**: 完了

---

## 背景・課題

現行実装は以下の問題を抱えている：

1. **Terms モデルに使われていないフィールドが 6 本存在する**
   `isSiteWide`, `metaDescription`, `metaKeywords`, `ogpTitle`, `ogpDescription`, `ogpImageUrl`
   公開 `/terms` ページは Page master（セクション管理）で制御されており、これらを参照している箇所は実質ない。

2. **管理画面の「メタ情報」タブが意味をなしていない**
   上記 SEO フィールドを管理する `TermsSeoForm` が存在するが、公開ページ SEO は別系統で管理されており効果がない。

3. **DRAFT を複数本作れる制約がない**
   同一 Terms に対して DRAFT が何本でも作れるため、どれが正しい下書きか分からなくなる。

4. **同意記録（TermsAgreement）を管理画面から参照できない**
   DB には保存されているが、閲覧 UI がない。法的証跡として価値があるのに見えない。

---

## 確定要件

| 要件                           | 方針                             |
| ------------------------------ | -------------------------------- |
| 予約時の同意記録               | ✅ 維持（TermsAgreement は重要） |
| スペースごとの規約             | ✅ 維持（Space.termsId）         |
| DRAFT → PUBLISHED ワークフロー | ✅ 維持                          |
| アーカイブ閲覧                 | ✅ 維持                          |

---

## 変更内容

### 1. DB スキーマ変更（Prisma migration 必要）

**Terms モデルから削除するフィールド：**

```prisma
// 削除
isSiteWide      Boolean   @default(false)
metaDescription String?
metaKeywords    String?
ogpTitle        String?
ogpDescription  String?
ogpImageUrl     String?
```

マイグレーション名: `remove_terms_site_wide_and_seo_fields`

---

### 2. 削除するコード

**ファイル削除：**

- `src/app/(admin)/admin/(dashboard)/terms/_components/TermsSeoForm.tsx`

**Server Actions から削除する関数：**

- `getSiteWideTermsSeo()`
- `updateSiteWideTermsSeo()`
- Zod スキーマ `updateTermsSeoSchema`
- 型 `SiteWideTermsSeo`

**ページ変更：**

- `terms/page.tsx` — 「メタ情報」タブを削除し、単一タブ（規約一覧）に変更

---

### 3. DRAFT 1本制約

**`createTermsVersion` アクションに追加するバリデーション：**

同一 Terms に `status = DRAFT` のバージョンが既に存在する場合はエラーを返す。

```
エラーメッセージ: 「下書きが既に存在します。先に公開または削除してください。」
```

**`TermsInlineEditor` の変更：**

- `localVersions` に DRAFT が存在する場合、「新しいバージョンを作成」ボタンを無効化
- ボタンに tooltip: 「下書きを先に公開または削除してください」

---

### 4. TermsAgreement 閲覧ページ（新規）

**場所：** 編集ページ（`/admin/terms/[id]/edit`）に「同意記録」タブを追加

**タブ構成（編集ページ）：**

```
[編集]  [同意記録]
```

**同意記録タブの表示項目：**

| 列         | 内容                                             |
| ---------- | ------------------------------------------------ |
| 日時       | `agreedAt`（JST）                                |
| バージョン | `v{version}`                                     |
| 名前       | `guestName` または `user.name`                   |
| メール     | `guestEmail` または `user.email`                 |
| 予約       | 予約 ID（`/admin/reservations/[id]` へのリンク） |
| IPアドレス | 末尾をマスク表示（例: `192.168.1.***`）          |

- ページネーション（20件/ページ）
- 読み取り専用（操作ボタンなし）

**新規 Server Action：**

```typescript
getTermsAgreements(termsId: string, page: number): Promise<{
  agreements: TermsAgreementItem[]
  total: number
}>
```

**新規ページ：**

- 既存の `/admin/terms/[id]/edit` をタブ付きレイアウトに変更
- タブ: 「編集」「同意記録」

---

### 5. TermsInlineEditor サイドパネル整理

**現在：**

- バージョン管理セクションに状態バッジ + セレクト + アクションボタン + 「新しいバージョンを作成」ボタンが並列

**変更後：**

- 状態バッジを大きく（`text-sm` → `text-base`、`w-full` で横幅いっぱい）
- ボタン配置を状態ごとに整理：
  - DRAFT 時: 「公開する」（primary）「この下書きを削除」（destructive）
  - PUBLISHED（現行）時: 「新しいバージョンを作成」（DRAFT 既存なら無効）
  - PUBLISHED（旧版）時: 「アーカイブ」（outline）
  - ARCHIVED 時: ボタンなし（「アーカイブ済み（参照のみ）」テキスト）

---

## 影響範囲

| ファイル                                             | 変更種別                          |
| ---------------------------------------------------- | --------------------------------- |
| `prisma/schema.prisma`                               | フィールド削除                    |
| `prisma/migrations/`                                 | 新規 migration 追加               |
| `src/app/(admin)/.../actions/terms.ts`               | 関数削除・createTermsVersion 変更 |
| `src/shared/lib/validations/terms.ts`                | スキーマ削除・型削除              |
| `terms/page.tsx`                                     | メタ情報タブ削除                  |
| `terms/_components/TermsSeoForm.tsx`                 | ファイル削除                      |
| `terms/_components/TermsInlineEditor.tsx`            | サイドパネル整理・DRAFT 制約      |
| `terms/[id]/edit/page.tsx`                           | タブ付きレイアウトに変更          |
| `terms/[id]/edit/_components/TermsAgreementsTab.tsx` | 新規作成                          |

---

## 非変更事項

- `TermsVersion` の DRAFT/PUBLISHED/ARCHIVED 状態遷移
- `TermsAgreement` モデル（DB 構造は維持）
- `Space.termsId` による規約の紐付け
- `Settings.cancellationTermsId`
- 公開ページ（`/terms/[slug]`）
- キャッシュ戦略（`updateTag(CACHE_TAGS.TERMS)` + Cloudflare パージ）
