/**
 * ナビゲーション設定ページ（リダイレクト）
 *
 * サイト設定ページのナビゲーションタブにリダイレクト
 */

import { redirect } from 'next/navigation'

export default function NavigationSettingsPage(): never {
  redirect('/admin/settings/site?tab=navigation')
}
