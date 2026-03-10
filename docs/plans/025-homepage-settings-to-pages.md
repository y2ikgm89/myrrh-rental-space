# 025: ホームページ設定のページ管理への移動

## 概要

ホームページセクション管理機能を「設定 > ホームページタブ」から「ページ管理」に移動。
情報アーキテクチャの改善・操作性向上・設定画面の簡素化を目的とする。

## 背景

- ホームページは「ページ」の一種として管理されるべき
- ページ編集と同じ場所でホームページも編集したい
- 設定画面はシステム設定に集中させたい

## 実装内容

### アプローチ: Virtual Homepage Entry

ページ一覧に仮想的な「ホームページ」行を追加し、編集画面は既存の`HomepageTab`コンポーネントを100%再利用。

### UI変更

**Before:**

```
設定 > ホームページタブ → セクション管理（DnD）
```

**After:**

```
ページ管理 → ホームページ行（/）→ 編集 → セクション管理（DnD）
```

## 変更ファイル

### 新規作成

- `src/app/(admin)/admin/(dashboard)/pages/homepage/edit/page.tsx`
  - HomepageTabをラップする編集画面

### 変更

- `src/lib/validations/page.ts:77`
  - `SYSTEM_PAGE_SLUGS`に`'homepage'`追加

- `src/app/(admin)/admin/(dashboard)/pages/page.tsx`
  - ページ一覧にホームページ仮想行追加（先頭に表示）
  - 「ホームページ設定」ボタン削除
  - lucide-reactの`Home`アイコン追加

- `src/app/(admin)/admin/(dashboard)/settings/_components/SettingsTabs.tsx`
  - `SETTINGS_TABS`から`'homepage'`削除（10→9タブ）
  - `TAB_CONFIGS`からホームページ設定削除
  - `HomepageTab`インポート・TabsContent削除

- `src/app/(admin)/admin/(dashboard)/settings/_components/tabs/index.ts`
  - `HomepageTab`エクスポート削除（直接参照に変更）

- `src/actions/admin/homepage-settings.ts:61-65`
  - `revalidatePath('/admin/settings')` → `revalidatePath('/admin/pages')`
  - `revalidatePath('/admin/pages/homepage/edit')` 追加

- `src/actions/admin/page.ts:15,262,310`
  - ハードコードされた`SYSTEM_PAGES`配列を`SYSTEM_PAGE_SLUGS`に統一
  - 'homepage'削除保護を自動的に適用

### 変更なし（100%再利用）

- `HomepageTab.tsx` - DnD管理UI
- `SectionEditor.tsx` - セクション設定フォーム
- `homepage-settings.ts` - Server Actions（パス以外）
- Prismaスキーマ

## マイグレーション

不要（DBスキーマ変更なし）

## テスト項目

- [x] `/admin/pages` でホームページ行が先頭に表示される
- [x] ホームページ行の「編集」クリックで `/admin/pages/homepage/edit` に遷移
- [x] セクションのDnD並び替えが動作
- [x] 各セクションタイプの設定編集が動作
- [x] `/admin/settings` にホームページタブが表示されない
- [x] type-check / lint / build 成功

## 備考

- ホームページ行はDBに実レコードを持たない（仮想行）
- 更新日時は「-」表示（セクション単位で更新日時を取得する場合は要拡張）
- `HomepageTab`は`settings/_components/tabs/`に残置（移動は将来検討）
