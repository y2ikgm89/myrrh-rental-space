/**
 * ホームページ
 *
 * レンタルスペースサービスのトップページ
 */

import { Hero, SpaceList, CTA } from '@/components/site/sections'

export default function HomePage() {
  return (
    <>
      <Hero />
      <SpaceList />
      <CTA />
    </>
  )
}
