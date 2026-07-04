"use client";

/**
 * 記事設定ダイアログ
 *
 * Lexical エディタの本文編集とは独立した「記事設定」を Radix Dialog で表示する。
 * conform `FieldMetadata` + `FormMetadata` ベースの settingsForm から `injected`
 * (`fields` / `form` / `disabled`) を受け取り、各セクションへ render context を
 * 合成して渡す。
 */

import { useState, useSyncExternalStore, type FormEvent } from "react";
import { getFormProps } from "@conform-to/react";
import { tv } from "tailwind-variants";
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
// Persisted active tab (useSyncExternalStore — localStorage 外部ストア同期)
// =============================================================================

/**
 * tab 切替 setter からの即時 re-render を促す in-process イベント。
 * `storage` イベントは別タブ更新でしか発火しないため、同一タブの setItem
 * から `useSyncExternalStore` の購読者へ通知するために CustomEvent を併用する。
 */
const TAB_CHANGE_EVENT = "myrrh-inline-editor-sidepanel:tab-change";

function subscribeToStorage(callback: () => void): () => void {
  window.addEventListener("storage", callback);
  window.addEventListener(TAB_CHANGE_EVENT, callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener(TAB_CHANGE_EVENT, callback);
  };
}

/** `storageKey` が無いとき用の no-op subscriber（モジュールスコープで参照安定）。 */
function noopSubscribe(): () => void {
  return () => {};
}

/**
 * localStorage から永続化されたタブ ID を購読する。
 * `useSyncExternalStore` は SSR で `getServerSnapshot` の戻り値を採用するため
 * hydration mismatch なく `defaultTab` を初期値として描画できる。
 * client mount 後に localStorage の値へ commit される。
 */
function usePersistedActiveTab(
  storageKey: string | undefined,
  defaultTab: string,
  validIds: ReadonlySet<string>,
): string {
  const subscribe = storageKey ? subscribeToStorage : noopSubscribe;

  const getSnapshot = (): string => {
    if (!storageKey) return defaultTab;
    const stored = window.localStorage.getItem(storageKey);
    if (stored && validIds.has(stored)) return stored;
    return defaultTab;
  };

  const getServerSnapshot = (): string => defaultTab;

  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

// =============================================================================
// Render context helper
// =============================================================================

function buildRenderContext<
  TForm extends Record<string, unknown>,
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
  TForm extends Record<string, unknown>,
  TExtra extends Record<string, unknown> = Record<string, never>,
> = {
  /** ダイアログ開閉状態 */
  open: boolean;
  /** 開閉状態の変更（Esc・オーバーレイクリック時にも呼ばれる） */
  onOpenChange: (open: boolean) => void;
  /** 設定タブ・セクション定義 */
  config: SidePanelDefinition<TForm, TExtra>;
  /** conform 注入プロパティ（settingsForm から） */
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
  TForm extends Record<string, unknown>,
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
  const validTabIds = new Set(config.tabs.map((t) => t.id));

  // localStorage に永続化されたタブを useSyncExternalStore で購読する。
  // tabStorageKey が無い場合は外部ストア無しで defaultTab を返す。
  // tabStorageKey が有る場合はユーザー override の transient state は持たず、
  // 切替時に localStorage へ書込んで CustomEvent で再 snapshot を促す
  // （React Compiler 公式推奨パターン、SSR-safe）。
  const persistedTab = usePersistedActiveTab(
    config.tabStorageKey,
    defaultTab,
    validTabIds,
  );
  // tabStorageKey が無い場合のフォールバック transient state。永続化が有る場合は
  // 常に persistedTab を採用するため、この state は活線にならない。
  const [transientTab, setTransientTab] = useState(defaultTab);
  const activeTab = config.tabStorageKey ? persistedTab : transientTab;

  const handleTabChange = (value: string) => {
    if (config.tabStorageKey && validTabIds.has(value)) {
      window.localStorage.setItem(config.tabStorageKey, value);
      window.dispatchEvent(new CustomEvent(TAB_CHANGE_EVENT));
    } else {
      setTransientTab(value);
    }
  };

  const handleOpenChange = (next: boolean) => {
    if (!next) {
      onCancel();
    }
    onOpenChange(next);
  };

  const sectionContext = buildRenderContext(injected, extraProps);

  const submitSettings = () => {
    if (!isPending && isDirty) {
      onSave();
    }
  };

  // Conform 公式パターンに合わせて実 <form> を置く。ただし server action submit
  // ではなく親 hook の imperative save を呼ぶため、native navigation は必ず止める。
  const handleFormSubmit = (event: FormEvent<HTMLFormElement>) => {
    injected.form.onSubmit(event);
    const preventedByConform = event.defaultPrevented;
    event.preventDefault();
    const isConformIntent = new FormData(event.currentTarget).has("__intent__");
    if (preventedByConform || isConformIntent) {
      return;
    }
    submitSettings();
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-2xl max-h-[var(--modal-max-height)] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{config.title}</DialogTitle>
          {config.description ? (
            <DialogDescription>{config.description}</DialogDescription>
          ) : null}
        </DialogHeader>

        <form
          {...getFormProps(injected.form)}
          onSubmit={handleFormSubmit}
          hidden
        />

        <div data-settings-form-container={injected.form.id}>
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
                forceMount
                className={classes.tabContent()}
              >
                <div className={classes.sectionWrapper()}>
                  {tab.sections.map((section, index) => (
                    // eslint-disable-next-line @eslint-react/no-array-index-key
                    <Card key={`${tab.id}-${index}`}>
                      <CardHeader className="pb-3">
                        <CardTitle className="text-sm">
                          {section.title}
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        {section.render(sectionContext)}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </TabsContent>
            ))}
          </Tabs>
        </div>

        <DialogFooter className="mt-4">
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
            onClick={submitSettings}
            disabled={isPending || !isDirty}
          >
            {isPending ? "保存中..." : "保存"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
