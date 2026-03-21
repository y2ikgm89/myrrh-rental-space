"use client";

/**
 * 統一サイドパネル
 *
 * ContentTypeConfig.sidePanel のタブ・セクションを `render(ctx)` で描画する。
 * ctx は RHF（register / control / …）とコンテンツ種別固有の extraProps をマージしたもの。
 */

import { useLayoutEffect, useMemo, useState } from "react";
import { tv } from "tailwind-variants";
import type { FieldValues } from "react-hook-form";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/admin/components/ui";
import { SidePanelShell } from "./SidePanelShell";
import type {
  SidePanelRenderContext,
  UnifiedSidePanelProps,
} from "./content-types/types";

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

function buildRenderContext<TForm extends FieldValues, TExtra extends Record<string, unknown>>(
  base: {
    register: UnifiedSidePanelProps<TForm, TExtra>["register"];
    control: UnifiedSidePanelProps<TForm, TExtra>["control"];
    errors: UnifiedSidePanelProps<TForm, TExtra>["errors"];
    setValue: UnifiedSidePanelProps<TForm, TExtra>["setValue"];
    getValues: UnifiedSidePanelProps<TForm, TExtra>["getValues"];
    disabled: UnifiedSidePanelProps<TForm, TExtra>["disabled"];
  },
  extraProps: TExtra,
): SidePanelRenderContext<TForm, TExtra> {
  const { disabled, ...rest } = base;
  return disabled === undefined
    ? { ...rest, ...extraProps }
    : { ...rest, ...extraProps, disabled };
}

export function UnifiedSidePanel<
  TForm extends FieldValues,
  TExtra extends Record<string, unknown> = Record<string, never>,
>({
  isOpen,
  onClose,
  config,
  register,
  control,
  errors,
  setValue,
  getValues,
  disabled,
  extraProps,
}: UnifiedSidePanelProps<TForm, TExtra>) {
  const tabCount = isValidTabCount(config.tabs.length)
    ? config.tabs.length
    : undefined;
  const classes = styles({ tabCount });

  const defaultTab = config.tabs[0]?.id ?? "basic";
  const tabIds = useMemo(() => config.tabs.map((t) => t.id), [config.tabs]);
  const validTabIds = useMemo(() => new Set(tabIds), [tabIds]);

  const [activeTab, setActiveTab] = useState(defaultTab);

  /* eslint-disable react-hooks/set-state-in-effect -- localStorage は SSR 後のみ復元 */
  /* eslint-disable @eslint-react/set-state-in-effect -- 上記 */
  useLayoutEffect(() => {
    if (!config.tabStorageKey) return;
    const stored = window.localStorage.getItem(config.tabStorageKey);
    if (stored && validTabIds.has(stored)) {
      setActiveTab(stored);
    }
  }, [config.tabStorageKey, validTabIds]);
  /* eslint-enable @eslint-react/set-state-in-effect */
  /* eslint-enable react-hooks/set-state-in-effect */

  const handleTabChange = (value: string) => {
    setActiveTab(value);
    if (config.tabStorageKey && validTabIds.has(value)) {
      window.localStorage.setItem(config.tabStorageKey, value);
    }
  };

  const sectionContext = buildRenderContext(
    { register, control, errors, setValue, getValues, disabled },
    extraProps,
  );

  return (
    <SidePanelShell
      isOpen={isOpen}
      onClose={onClose}
      title={config.title}
      width={config.width}
      {...(config.description !== undefined
        ? { description: config.description }
        : {})}
    >
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
    </SidePanelShell>
  );
}
