'use client'

/**
 * サイドパネル
 *
 * SEO、OGP、公開設定などのメタデータ編集パネル
 * スライド式で開閉
 */

import { X } from 'lucide-react'
import { tv } from 'tailwind-variants'
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/admin/components/ui'
import { SEOFields, OGPFields, PublishFields, LayoutFields } from './side-panel'
import type { SidePanelProps } from './types'

const styles = tv({
  slots: {
    overlay: [
      'fixed inset-0 z-40 bg-black/20 transition-opacity duration-300',
      'lg:hidden',
    ],
    panel: [
      'fixed right-0 top-0 z-50 h-full w-full sm:w-96 bg-background border-l shadow-xl',
      'transform transition-transform duration-300 ease-in-out',
    ],
    header: 'flex items-center justify-between p-4 border-b',
    title: 'text-lg font-semibold',
    content: 'flex-1 overflow-y-auto p-4',
    tabsList: 'grid w-full grid-cols-4',
    tabContent: 'mt-4',
  },
  variants: {
    isOpen: {
      true: {
        overlay: 'opacity-100',
        panel: 'translate-x-0',
      },
      false: {
        overlay: 'opacity-0 pointer-events-none',
        panel: 'translate-x-full',
      },
    },
  },
})

export function SidePanel({
  isOpen,
  onClose,
  register,
  control,
  errors,
  setValue,
  disabled,
}: SidePanelProps) {
  const classes = styles({ isOpen })

  return (
    <>
      {/* オーバーレイ（モバイル用） */}
      <div className={classes.overlay()} onClick={onClose} aria-hidden="true" />

      {/* パネル */}
      <aside className={classes.panel()} aria-label="設定パネル">
        <div className={classes.header()}>
          <h2 className={classes.title()}>設定</h2>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onClose}
            className="h-8 w-8 p-0"
          >
            <X className="h-4 w-4" />
            <span className="sr-only">閉じる</span>
          </Button>
        </div>

        <div className={classes.content()}>
          <Tabs defaultValue="publish" className="w-full">
            <TabsList className={classes.tabsList()}>
              <TabsTrigger value="publish">公開</TabsTrigger>
              <TabsTrigger value="layout">幅</TabsTrigger>
              <TabsTrigger value="seo">SEO</TabsTrigger>
              <TabsTrigger value="ogp">OGP</TabsTrigger>
            </TabsList>

            <TabsContent value="publish" className={classes.tabContent()}>
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm">公開設定</CardTitle>
                </CardHeader>
                <CardContent>
                  <PublishFields
                    register={register}
                    control={control}
                    errors={errors}
                    setValue={setValue}
                    disabled={disabled}
                  />
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="layout" className={classes.tabContent()}>
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm">レイアウト設定</CardTitle>
                </CardHeader>
                <CardContent>
                  <LayoutFields
                    register={register}
                    control={control}
                    errors={errors}
                    setValue={setValue}
                    disabled={disabled}
                  />
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="seo" className={classes.tabContent()}>
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm">SEO設定</CardTitle>
                </CardHeader>
                <CardContent>
                  <SEOFields
                    register={register}
                    control={control}
                    errors={errors}
                    disabled={disabled}
                  />
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="ogp" className={classes.tabContent()}>
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm">OGP設定</CardTitle>
                </CardHeader>
                <CardContent>
                  <OGPFields
                    register={register}
                    control={control}
                    errors={errors}
                    disabled={disabled}
                  />
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </aside>
    </>
  )
}
