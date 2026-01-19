'use client'

/**
 * ブログ用サイドパネル
 *
 * ブログ記事の編集設定パネル
 * 基本情報、カテゴリ・タグ、画像、SEO、OGP、公開設定のタブ
 */

import { tv } from 'tailwind-variants'
import type { UseFormRegister, Control, FieldErrors, UseFormSetValue, UseFormGetValues } from 'react-hook-form'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/admin/components/ui'
import {
  BasicInfoFields,
  CategoryTagFields,
  ImageFields,
  SEOFields,
  OGPFields,
  PublishFields,
} from './side-panel'
import { SidePanelShell } from './SidePanelShell'
import type { BlogEditorFormData, BlogCategoryOption, PageEditorFormData } from './types'

const styles = tv({
  slots: {
    tabsList: 'grid w-full grid-cols-3',
    tabContent: 'mt-4',
  },
})

type BlogSidePanelProps = {
  isOpen: boolean
  onClose: () => void
  register: UseFormRegister<BlogEditorFormData>
  control: Control<BlogEditorFormData>
  errors: FieldErrors<BlogEditorFormData>
  setValue: UseFormSetValue<BlogEditorFormData>
  getValues: UseFormGetValues<BlogEditorFormData>
  categories: BlogCategoryOption[]
  disabled?: boolean
}

export function BlogSidePanel({
  isOpen,
  onClose,
  register,
  control,
  errors,
  setValue,
  getValues,
  categories,
  disabled,
}: BlogSidePanelProps) {
  const classes = styles()

  // Type adapters for Page-based components
  const pageRegister = register as unknown as UseFormRegister<PageEditorFormData>
  const pageControl = control as unknown as Control<PageEditorFormData>
  const pageErrors = errors as unknown as FieldErrors<PageEditorFormData>
  const pageSetValue = setValue as unknown as UseFormSetValue<PageEditorFormData>

  return (
    <SidePanelShell isOpen={isOpen} onClose={onClose} title="記事設定" width="default">
      <Tabs defaultValue="basic" className="w-full">
        <TabsList className={classes.tabsList()}>
          <TabsTrigger value="basic">基本</TabsTrigger>
          <TabsTrigger value="category">分類</TabsTrigger>
          <TabsTrigger value="publish">公開</TabsTrigger>
        </TabsList>

        <TabsContent value="basic" className={classes.tabContent()}>
          <div className="space-y-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">基本情報</CardTitle>
              </CardHeader>
              <CardContent>
                <BasicInfoFields
                  register={register}
                  getValues={getValues}
                  setValue={setValue}
                  errors={errors}
                  disabled={disabled}
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">画像</CardTitle>
              </CardHeader>
              <CardContent>
                <ImageFields
                  errors={errors}
                  setValue={setValue}
                  thumbnailUrl={getValues('thumbnailUrl')}
                  ogpImageUrl={getValues('ogpImageUrl')}
                  disabled={disabled}
                />
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="category" className={classes.tabContent()}>
          <div className="space-y-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">カテゴリ・タグ</CardTitle>
              </CardHeader>
              <CardContent>
                <CategoryTagFields
                  register={register}
                  control={control}
                  setValue={setValue}
                  errors={errors}
                  categories={categories}
                  disabled={disabled}
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">SEO設定</CardTitle>
              </CardHeader>
              <CardContent>
                <SEOFields
                  register={pageRegister}
                  control={pageControl}
                  errors={pageErrors}
                  disabled={disabled}
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">OGP設定</CardTitle>
              </CardHeader>
              <CardContent>
                <OGPFields
                  register={pageRegister}
                  control={pageControl}
                  errors={pageErrors}
                  disabled={disabled}
                />
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="publish" className={classes.tabContent()}>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">公開設定</CardTitle>
            </CardHeader>
            <CardContent>
              <PublishFields
                register={pageRegister}
                control={pageControl}
                errors={pageErrors}
                setValue={pageSetValue}
                disabled={disabled}
              />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </SidePanelShell>
  )
}
