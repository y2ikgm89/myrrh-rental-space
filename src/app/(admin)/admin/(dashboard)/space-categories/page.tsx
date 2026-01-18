import { redirect } from 'next/navigation'

/**
 * カテゴリー管理ページ → スペース管理（カテゴリータブ）へリダイレクト
 *
 * 044: スペース管理タブ統合により、カテゴリー管理はスペース管理ページに統合されました
 */
export default function SpaceCategoriesPage() {
  redirect('/admin/spaces?tab=categories')
}
