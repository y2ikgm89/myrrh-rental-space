/**
 * お知らせバー管理ページ（リダイレクト）
 *
 * サイト設定ページのお知らせバータブにリダイレクト
 */

import { redirect } from 'next/navigation'

export default function AnnouncementBarPage(): never {
  redirect('/admin/settings/site?tab=announcement-bar')
}
