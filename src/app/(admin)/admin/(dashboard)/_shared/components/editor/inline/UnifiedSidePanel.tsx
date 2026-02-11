'use client'

/**
 * 統一サイドパネル
 *
 * ContentTypeConfigに基づいて動的にタブとセクションを描画
 * 全コンテンツタイプで共通のUI構造を提供
 */

import { tv } from 'tailwind-variants'
import type { FieldValues } from 'react-hook-form'
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
import { SidePanelShell } from './SidePanelShell'
import type { UnifiedSidePanelProps } from './content-types/types'

type TabCount = 2 | 3 | 4 | 5
const VALID_TAB_COUNTS = new Set<number>([2, 3, 4, 5])
function isValidTabCount(n: number): n is TabCount {
  return VALID_TAB_COUNTS.has(n)
}

const styles = tv({
  slots: {
    tabsList: 'grid w-full',
    tabContent: 'mt-4',
    sectionWrapper: 'space-y-4',
  },
  variants: {
    tabCount: {
      2: { tabsList: 'grid-cols-2' },
      3: { tabsList: 'grid-cols-3' },
      4: { tabsList: 'grid-cols-4' },
      5: { tabsList: 'grid-cols-5' },
    },
  },
  defaultVariants: {
    tabCount: 3,
  },
})

export function UnifiedSidePanel<T extends FieldValues>({
  isOpen,
  onClose,
  config,
  register,
  control,
  errors,
  setValue,
  getValues,
  disabled,
  extraProps = {},
}: UnifiedSidePanelProps<T>) {
  const tabCount = isValidTabCount(config.tabs.length) ? config.tabs.length : undefined
  const classes = styles({ tabCount })

  // 最初のタブをデフォルト値として使用
  const defaultTab = config.tabs[0]?.id ?? 'basic'

  return (
    <SidePanelShell
      isOpen={isOpen}
      onClose={onClose}
      title={config.title}
      width={config.width}
    >
      <Tabs defaultValue={defaultTab} className="w-full">
        <TabsList className={classes.tabsList()}>
          {config.tabs.map((tab) => (
            <TabsTrigger key={tab.id} value={tab.id}>
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>

        {config.tabs.map((tab) => (
          <TabsContent key={tab.id} value={tab.id} className={classes.tabContent()}>
            <div className={classes.sectionWrapper()}>
              {tab.sections.map((section, index) => {
                const SectionComponent = section.component

                return (
                  <Card key={`${tab.id}-${index}`}>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm">{section.title}</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <SectionComponent
                        register={register}
                        control={control}
                        errors={errors}
                        setValue={setValue}
                        getValues={getValues}
                        disabled={disabled}
                        {...(section.props ?? {})}
                        {...extraProps}
                      />
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          </TabsContent>
        ))}
      </Tabs>
    </SidePanelShell>
  )
}
