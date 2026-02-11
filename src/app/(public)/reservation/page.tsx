/**
 * Reservation Page — 3-step dummy reservation form
 *
 * SEO: Dynamic metadata via unified pipeline
 */

import type { Metadata } from 'next'
import type { ReactElement } from 'react'
import { BreadcrumbJsonLd } from '@/public/components/seo/JsonLd'
import { generatePageMetadata } from '@/public/lib/page-metadata'
import { ReservationHero } from './_components/ReservationHero'
import { ReservationForm } from './_components/ReservationForm'

export async function generateMetadata(): Promise<Metadata> {
  return generatePageMetadata('reservation')
}

export default function ReservationPage(): ReactElement {
  return (
    <>
      <BreadcrumbJsonLd
        items={[
          { name: 'ホーム', url: '/' },
          { name: 'ご予約', url: '/reservation' },
        ]}
      />
      <ReservationHero />
      <ReservationForm />
    </>
  )
}
