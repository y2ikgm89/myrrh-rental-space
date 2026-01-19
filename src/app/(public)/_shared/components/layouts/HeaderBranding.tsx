'use client'

/**
 * ヘッダーブランディングコンポーネント
 *
 * ロゴ/テキスト表示の切り替えとエラー時のフォールバックを処理
 */

import { useState } from 'react'
import Image from 'next/image'

interface HeaderBrandingProps {
  siteName: string
  logoUrl: string | null
  useLogo: boolean
}

export function HeaderBranding({ siteName, logoUrl, useLogo }: HeaderBrandingProps) {
  const [logoError, setLogoError] = useState(false)

  // テキスト表示の条件: ロゴ無効 or ロゴURL無し or ロゴ読込失敗
  if (!useLogo || !logoUrl || logoError) {
    return <span className="text-xl font-bold text-gray-900">{siteName}</span>
  }

  // ロゴ表示
  return (
    <Image
      src={logoUrl}
      alt={siteName}
      width={140}
      height={40}
      className="h-10 w-auto object-contain"
      onError={() => setLogoError(true)}
      priority
    />
  )
}
