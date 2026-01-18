/**
 * SettingsCard
 *
 * 設定カテゴリカードコンポーネント
 * カード一覧ページで使用
 */

import Link from 'next/link'
import type { LucideIcon } from 'lucide-react'
import { ChevronRight } from 'lucide-react'
import { Card, CardHeader, CardTitle, CardDescription } from '@/admin/components/ui/card'

export interface SettingsCardProps {
  title: string
  description: string
  href: string
  icon: LucideIcon
  items?: string[]
}

export function SettingsCard({ title, description, href, icon: Icon, items }: SettingsCardProps) {
  return (
    <Link href={href} className="block group">
      <Card className="h-full transition-colors hover:bg-muted/50">
        <CardHeader>
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Icon className="h-5 w-5" />
              </div>
              <div>
                <CardTitle className="text-lg">{title}</CardTitle>
                <CardDescription className="mt-1">{description}</CardDescription>
              </div>
            </div>
            <ChevronRight className="h-5 w-5 text-muted-foreground transition-transform group-hover:translate-x-1" />
          </div>
          {items && items.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-2">
              {items.map((item) => (
                <span
                  key={item}
                  className="inline-flex items-center rounded-md bg-muted px-2 py-1 text-xs text-muted-foreground"
                >
                  {item}
                </span>
              ))}
            </div>
          )}
        </CardHeader>
      </Card>
    </Link>
  )
}
