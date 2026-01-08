/**
 * ホームページ
 *
 * レンタルスペースサービスのトップページ
 */

import { Hero, SpaceList, CTA } from '@/components/site/sections'
import type { ReactElement } from 'react'

export default function HomePage(): ReactElement {
  return (
    <>
      <Hero />
      <SpaceList />
      <CTA />
    </>
  )
}
