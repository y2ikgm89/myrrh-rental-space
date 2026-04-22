"use client";

/**
 * 記事設定ダイアログ
 *
 * Lexical エディタの本文編集とは独立した「記事設定」を Radix Dialog で表示する。
 * フォーム状態は呼び出し元（usePostEditor / useNewsEditor）の独立した RHF
 * インスタンスで管理し、ダイアログ内の保存/キャンセルでのみ更新・破棄する。
 *
 * 公式準拠:
 * - Radix UI Dialog（フォーカストラップ・Escape クローズ・aria-* 自動付与）
 * - shadcn/ui Dialog プリミティブ（DialogHeader / DialogFooter）
 * - tailwind-variants によるタブグリッド計算
 */

import { useLayoutEffect, useState } from "react";
import { tv } from "tailwind-variants";
import type { FieldValues } from "react-hook-form";
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/admin/components/ui";
import type {
  SidePanelDefinition,
  SidePanelInjectedProps,
  SidePanelRenderContext,
} from "./content-types/types";

// =============================================================================
// Tab count style variant
// =============================================================================

type TabCount = 2 | 3 | 4 | 5;
const VALID_TAB_COUNTS = new Set<number>([2, 3, 4, 5]);
function isValidTabCount(n: number): n is TabCount {
  return VALID_TAB_COUNTS.has(n);
}

const styles = tv({
  slots: {
    tabsList: "grid w-full",
    tabContent: "mt-4",
    sectionWrapper: "space-y-4",
  },
  variants: {
    tabCount: {
      2: { tabsList: "grid-cols-2" },
      3: { tabsList: "grid-cols-3" },
      4: { tabsList: "grid-cols-4" },
      5: { tabsList: "grid-cols-5" },
    },
  },
  defaultVariants: {
    tabCount: 3,
  },
});

// =============================================================================
// Render context helper
// =============================================================================

function buildRenderContext<
  TForm extends FieldValues,
  TExtra extends Record<string, unknown>,
>(
  injected: SidePanelInjectedProps<TForm>,
  extraProps: TExtra,
): SidePanelRenderContext<TForm, TExtra> {
  const { disabled, ...rest } = injected;
  return disabled === undefined
    ? { ...rest, ...extraProps }
    : { ...rest, ...extraProps, disabled };
}

// =============================================================================
// Component
// =============================================================================

export type SettingsDialogProps<
  TForm extends FieldValues,
  TExtra extends Record<string, unknown> = Record<string, never>,
> = {
  /** ダイアログ開閉状態 */
  open: boolean;
  /** 開閉状態の変更（Esc・オーバーレイクリック時にも呼ばれる） */
  onOpenChange: (open: boolean) => void;
  /** 設定タブ・セクション定義 */
  config: SidePanelDefinition<TForm, TExtra>;
  /** RHF 注入プロパティ（settingsForm から） */
  injected: SidePanelInjectedProps<TForm>;
  /** コンテンツ種別固有の追加データ */
  extraProps: TExtra;
  /** 保存ボタンクリック */
  onSave: () => void;
  /** キャンセルボタンクリック（フォーム reset を呼ぶ） */
  onCancel: () => void;
  /** 保存中フラグ */
  isPending: boolean;
  /** 未保存変更があるか（保存ボタン disabled 制御） */
  isDirty: boolean;
};

export function SettingsDialog<
  TForm extends FieldValues,
  TExtra extends Record<string, unknown> = Record<string, never>,
>({
  open,
  onOpenChange,
  config,
  injected,
  extraProps,
  onSave,
  onCancel,
  isPending,
  isDirty,
}: SettingsDialogProps<TForm, TExtra>) {
  const tabCount = isValidTabCount(config.tabs.length)
    ? config.tabs.length
    : undefined;
  const classes = styles({ tabCount });

  const defaultTab = config.tabs[0]?.id ?? "basic";
  const [activeTab, setActiveTab] = useState(defaultTab);

  // localStorage からタブ選択を復元（クライアントのみ）
  /* eslint-disable react-hooks/set-state-in-effect -- localStorage は SSR 後のみ復元 */
  /* eslint-disable @eslint-react/set-state-in-effect -- 上記 */
  useLayoutEffect(() => {
    if (!config.tabStorageKey) return;
    const stored = window.localStorage.getItem(config.tabStorageKey);
    const ids = new Set(config.tabs.map((t) => t.id));
    if (stored && ids.has(stored)) {
      setActiveTab(stored);
    }
  }, [config.tabStorageKey, config.tabs]);
  /* eslint-enable @eslint-react/set-state-in-effect */
  /* eslint-enable react-hooks/set-state-in-effect */

  const handleTabChange = (value: string) => {
    const validTabIds = new Set(config.tabs.map((t) => t.id));
    setActiveTab(value);
    if (config.tabStorageKey && validTabIds.has(value)) {
      window.localStorage.setItem(config.tabStorageKey, value);
    }
  };

  const handleOpenChange = (next: boolean) => {
    if (!next) {
      onCancel();
    }
    onOpenChange(next);
  };

  const sectionContext = buildRenderContext(injected, extraProps);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-2xl max-h-[var(--modal-max-height)] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{config.title}</DialogTitle>
          {config.description ? (
            <DialogDescription>{config.description}</DialogDescription>
          ) : null}
        </DialogHeader>

        <Tabs
          value={activeTab}
          onValueChange={handleTabChange}
          className="w-full"
        >
          <TabsList className={classes.tabsList()}>
            {config.tabs.map((tab) => (
              <TabsTrigger key={tab.id} value={tab.id}>
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>

          {config.tabs.map((tab) => (
            <TabsContent
              key={tab.id}
              value={tab.id}
              className={classes.tabContent()}
            >
              <div className={classes.sectionWrapper()}>
                {tab.sections.map((section, index) => (
                  // eslint-disable-next-line @eslint-react/no-array-index-key
                  <Card key={`${tab.id}-${index}`}>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm">{section.title}</CardTitle>
                    </CardHeader>
                    <CardContent>{section.render(sectionContext)}</CardContent>
                  </Card>
                ))}
              </div>
            </TabsContent>
          ))}
        </Tabs>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={onCancel}
            disabled={isPending}
          >
            キャンセル
          </Button>
          <Button
            type="button"
            onClick={onSave}
            disabled={isPending || !isDirty}
          >
            {isPending ? "保存中..." : "保存"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
