'use client'

import dynamic from 'next/dynamic'
import { Card, CardContent, CardHeader, CardTitle } from '@/public/components/ui'
import type { ReactElement } from 'react'

/**
 * 検索ウィジェットのフォールバックUI
 */
function SearchWidgetFallback(): ReactElement {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">検索</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="relative">
          <div className="h-10 bg-muted rounded-md animate-pulse" />
        </div>
      </CardContent>
    </Card>
  )
}

/**
 * SearchWidget を動的インポート（SSR無効）
 *
 * useQueryStates (useSearchParams) を使用するため、
 * 静的生成時にはスキップされ、クライアントサイドでのみ実行される
 *
 * Client Componentでnext/dynamicのssr: falseを使用
 * Next.js 16 PPR対応
 */
const SearchWidget = dynamic(
  () => import('./SearchWidget').then((mod) => mod.SearchWidget),
  {
    ssr: false,
    loading: () => <SearchWidgetFallback />,
  }
)

interface SearchWidgetWrapperProps {
  postPrefix: string
}

/**
 * SearchWidget のクライアントサイド専用ラッパー
 *
 * Client Component内でnext/dynamicを使用することで、
 * ssr: falseオプションが正常に動作する（Server Componentでは使用不可）
 */
export function SearchWidgetWrapper({ postPrefix }: SearchWidgetWrapperProps): ReactElement {
  return <SearchWidget postPrefix={postPrefix} />
}
