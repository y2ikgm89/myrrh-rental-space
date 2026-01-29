/**
 * 地図セクション
 *
 * 共通スタイルを使用してデザイン変更に対応
 */

import type { ReactElement } from 'react'
import { MapPin } from 'lucide-react'
import type { MapConfig } from '@/shared/lib/validations/page-section'
import {
  sectionVariants,
  sectionTitleVariants,
} from '@/public/lib/styles/section-variants'

interface MapSectionProps {
  title?: string | null
  config: MapConfig
}

const heightClasses = {
  sm: 'h-64',
  md: 'h-96',
  lg: 'h-[500px]',
} as const

export function MapSection({
  title,
  config,
}: MapSectionProps): ReactElement {
  const { address, latitude, longitude, zoom, height, showAddressBelow } = config

  // Google Maps Embed URL生成
  const hasCoordinates = latitude !== undefined && longitude !== undefined
  const mapUrl = hasCoordinates
    ? `https://www.google.com/maps/embed/v1/view?key=${process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || ''}&center=${latitude},${longitude}&zoom=${zoom}`
    : address
    ? `https://www.google.com/maps/embed/v1/place?key=${process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || ''}&q=${encodeURIComponent(address)}&zoom=${zoom}`
    : null

  const heightClass = heightClasses[height]

  return (
    <section className={sectionVariants()}>
      <div className="container">
        {title && (
          <h2 className={sectionTitleVariants()}>{title}</h2>
        )}

        {mapUrl ? (
          <>
            <div className={`${heightClass} w-full overflow-hidden rounded-lg`}>
              <iframe
                src={mapUrl}
                width="100%"
                height="100%"
                style={{ border: 0 }}
                allowFullScreen
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
                title={title || '地図'}
              />
            </div>
            {showAddressBelow && address && (
              <div className="mt-4 flex items-center justify-center gap-2 text-muted-foreground">
                <MapPin className="h-4 w-4" />
                <span>{address}</span>
              </div>
            )}
          </>
        ) : (
          <div className={`${heightClass} w-full overflow-hidden rounded-lg bg-muted flex items-center justify-center`}>
            <div className="text-center text-muted-foreground">
              <MapPin className="h-12 w-12 mx-auto mb-2" />
              <p>地図を表示するには住所または座標を設定してください</p>
            </div>
          </div>
        )}
      </div>
    </section>
  )
}
