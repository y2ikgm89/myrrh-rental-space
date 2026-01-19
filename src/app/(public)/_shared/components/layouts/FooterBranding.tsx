'use client'

/**
 * フッターブランディングコンポーネント
 *
 * ロゴ/テキスト表示の切り替えとエラー時のフォールバックを処理
 */

import { useState } from 'react'
import Image from 'next/image'

interface FooterBrandingProps {
  siteName: string
  logoUrl: string | null
  useLogo: boolean
}

export function FooterBranding({ siteName, logoUrl, useLogo }: FooterBrandingProps) {
  const [logoError, setLogoError] = useState(false)

  // テキスト表示の条件: ロゴ無効 or ロゴURL無し or ロゴ読込失敗
  if (!useLogo || !logoUrl || logoError) {
    return <span className="text-lg font-semibold text-gray-900">{siteName}</span>
  }

  // ロゴ表示
  return (
    <Image
      src={logoUrl}
      alt={siteName}
      width={120}
      height={36}
      className="h-9 w-auto object-contain"
      onError={() => setLogoError(true)}
    />
  )
}
