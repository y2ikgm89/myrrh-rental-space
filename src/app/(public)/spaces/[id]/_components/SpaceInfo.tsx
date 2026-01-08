/**
 * スペース情報コンポーネント
 *
 * @description スペースの詳細情報を表示
 */

import { tv } from 'tailwind-variants'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/site/ui'
import type { ReactElement } from 'react'

const styles = tv({
  slots: {
    section: 'space-y-6',
    title: 'text-3xl font-bold tracking-tight text-foreground',
    description: 'mt-4 text-muted-foreground leading-relaxed whitespace-pre-wrap',
    infoGrid: 'grid gap-4 sm:grid-cols-2',
    infoItem: 'flex items-start gap-3',
    infoIcon: 'mt-1 h-5 w-5 text-primary flex-shrink-0',
    infoLabel: 'text-sm font-medium text-muted-foreground',
    infoValue: 'text-foreground',
    facilitiesList: 'flex flex-wrap gap-2',
    facilityTag:
      'inline-flex items-center rounded-full bg-secondary px-3 py-1 text-sm font-medium text-secondary-foreground',
  },
})()

interface SpaceInfoProps {
  name: string
  description: string
  address: string
  access: string | null
  capacity: number
  area: number | null
  facilities: string[]
}

export function SpaceInfo({
  name,
  description,
  address,
  access,
  capacity,
  area,
  facilities,
}: SpaceInfoProps): ReactElement {
  return (
    <div className={styles.section()}>
      {/* タイトルと説明 */}
      <div>
        <h1 className={styles.title()}>{name}</h1>
        <p className={styles.description()}>{description}</p>
      </div>

      {/* 基本情報 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">基本情報</CardTitle>
        </CardHeader>
        <CardContent>
          <div className={styles.infoGrid()}>
            {/* 住所 */}
            <div className={styles.infoItem()}>
              <svg
                className={styles.infoIcon()}
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={1.5}
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"
                />
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1 1 15 0Z"
                />
              </svg>
              <div>
                <p className={styles.infoLabel()}>所在地</p>
                <p className={styles.infoValue()}>{address}</p>
              </div>
            </div>

            {/* 定員 */}
            <div className={styles.infoItem()}>
              <svg
                className={styles.infoIcon()}
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={1.5}
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z"
                />
              </svg>
              <div>
                <p className={styles.infoLabel()}>定員</p>
                <p className={styles.infoValue()}>{capacity}名</p>
              </div>
            </div>

            {/* 面積 */}
            {area && (
              <div className={styles.infoItem()}>
                <svg
                  className={styles.infoIcon()}
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={1.5}
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15"
                  />
                </svg>
                <div>
                  <p className={styles.infoLabel()}>面積</p>
                  <p className={styles.infoValue()}>{area}m²</p>
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* アクセス */}
      {access && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">アクセス</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground leading-relaxed whitespace-pre-wrap">
              {access}
            </p>
          </CardContent>
        </Card>
      )}

      {/* 設備・備品 */}
      {facilities.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">設備・備品</CardTitle>
          </CardHeader>
          <CardContent>
            <div className={styles.facilitiesList()}>
              {facilities.map((facility, index) => (
                <span key={index} className={styles.facilityTag()}>
                  {facility}
                </span>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
