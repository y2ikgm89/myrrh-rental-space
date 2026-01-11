/**
 * ホームページヒーロー編集画面
 *
 * トップページのヒーローセクションを編集
 */

import { getHomepageHero } from '@/actions/admin/homepage-hero'
import { HomepageHeroForm } from '../_components/HomepageHeroForm'
import type { Metadata } from 'next'
import type { ReactElement } from 'react'

export const metadata: Metadata = {
  title: 'ホームページヒーロー編集',
}

export default async function HomepageHeroPage(): Promise<ReactElement> {
  const hero = await getHomepageHero()

  return <HomepageHeroForm hero={hero} />
}
