import { redirect } from 'next/navigation'

/**
 * 場所管理ページ → スペース管理（場所タブ）へリダイレクト
 *
 * 044: スペース管理タブ統合により、場所管理はスペース管理ページに統合されました
 */
export default function LocationsPage() {
  redirect('/admin/spaces?tab=locations')
}
