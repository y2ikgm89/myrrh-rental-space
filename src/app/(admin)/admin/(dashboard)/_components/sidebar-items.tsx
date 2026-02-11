/**
 * サイドバーナビゲーション項目定義
 */

import {
  Home,
  Calendar,
  Building2,
  Mail,
  Newspaper,
  FileEdit,
  FileText,
  HelpCircle,
  ScrollText,
  Users,
  Shield,
  ClipboardList,
  Settings,
  Image as ImageIcon,
  Ticket,
} from 'lucide-react'
import type { SidebarItem } from '@/admin/types/admin-layout'

export const SIDEBAR_ITEMS: SidebarItem[] = [
  { label: 'ダッシュボード', href: '/admin', icon: <Home className="h-5 w-5" /> },
  { label: '予約管理', href: '/admin/reservations', icon: <Calendar className="h-5 w-5" /> },
  { label: 'クーポン', href: '/admin/coupons', icon: <Ticket className="h-5 w-5" /> },
  { label: 'スペース管理', href: '/admin/spaces', icon: <Building2 className="h-5 w-5" /> },
  { label: 'お知らせ', href: '/admin/news', icon: <Newspaper className="h-5 w-5" /> },
  { label: '投稿', href: '/admin/posts', icon: <FileEdit className="h-5 w-5" /> },
  { label: 'メディア', href: '/admin/media', icon: <ImageIcon className="h-5 w-5" /> },
  { label: 'ページ管理', href: '/admin/pages', icon: <FileText className="h-5 w-5" /> },
  { label: 'FAQ', href: '/admin/faq', icon: <HelpCircle className="h-5 w-5" /> },
  { label: '利用規約', href: '/admin/terms', icon: <ScrollText className="h-5 w-5" /> },
  { label: '顧客管理', href: '/admin/customers', icon: <Users className="h-5 w-5" /> },
  { label: 'お問い合わせ', href: '/admin/inquiries', icon: <Mail className="h-5 w-5" /> },
  { label: 'スタッフ管理', href: '/admin/staff', icon: <Shield className="h-5 w-5" /> },
  { label: '監査ログ', href: '/admin/audit-logs', icon: <ClipboardList className="h-5 w-5" /> },
  { label: '設定', href: '/admin/settings', icon: <Settings className="h-5 w-5" /> },
]
