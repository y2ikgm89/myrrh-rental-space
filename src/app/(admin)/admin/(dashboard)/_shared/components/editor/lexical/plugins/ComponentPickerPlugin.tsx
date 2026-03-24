/**
 * Component Picker Plugin
 *
 * @description スラッシュコマンドでコンポーネントを挿入するプラグイン
 *
 * "/" を入力するとメニューが表示され、ブロックタイプやメディアを選択できる
 * カテゴリー別にグループ化されたメニュー表示
 *
 * 挿入処理は Lexical 推奨どおり、トリガー文字削除と `applyInsertItemInUpdate` を
 * 同一の `editor.update` にまとめる（ネストした update を避ける）。
 */

"use client";

import { useState, type ReactElement } from "react";
import { createPortal } from "react-dom";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import {
  LexicalTypeaheadMenuPlugin,
  MenuOption,
  useBasicTypeaheadTriggerMatch,
} from "@lexical/react/LexicalTypeaheadMenuPlugin";
import { TextNode } from "lexical";
import {
  getPickerInsertItems,
  applyInsertItemInUpdate,
  CATEGORY_LABELS,
  CATEGORY_ORDER,
  type InsertCategory,
  type InsertItem,
} from "../config/insert-items";
import type { DialogId } from "../dialogs/dialog-types";

// =============================================================================
// Types
// =============================================================================

type ComponentPickerPluginProps = {
  openDialog?: (id: DialogId) => void;
};

// =============================================================================
// Query matching (picker filter)
// =============================================================================

function pickerOptionMatchesQuery(
  title: string,
  keywords: readonly string[],
  lowerQuery: string,
): boolean {
  if (lowerQuery === "") {
    return true;
  }
  const t = title.toLowerCase();
  if (t.includes(lowerQuery)) {
    return true;
  }
  return keywords.some((keyword) => keyword.toLowerCase().includes(lowerQuery));
}

// =============================================================================
// Menu Option Class
// =============================================================================

class ComponentPickerOption extends MenuOption {
  override title: string;
  override icon: ReactElement;
  keywords: string[];
  category: InsertCategory;
  readonly insertItem: InsertItem;

  constructor(
    insertItem: InsertItem,
    options: {
      icon: ReactElement;
      keywords?: string[];
      category: InsertCategory;
    },
  ) {
    super(insertItem.label);
    this.insertItem = insertItem;
    this.title = insertItem.label;
    this.icon = options.icon;
    this.keywords = options.keywords ?? [];
    this.category = options.category;
  }
}

// =============================================================================
// Menu Item Component
// =============================================================================

function ComponentPickerMenuItem({
  index,
  isSelected,
  onClick,
  onMouseEnter,
  option,
}: {
  index: number;
  isSelected: boolean;
  onClick: () => void;
  onMouseEnter: () => void;
  option: ComponentPickerOption;
}) {
  return (
    <div
      tabIndex={-1}
      role="option"
      aria-selected={isSelected}
      id={`typeahead-item-${index}`}
      onMouseEnter={onMouseEnter}
      onClick={onClick}
      className={`flex items-center gap-2 px-3 py-2 cursor-pointer ${
        isSelected ? "bg-accent text-accent-foreground" : "hover:bg-muted"
      }`}
    >
      <span className="flex h-5 w-5 items-center justify-center text-muted-foreground">
        {option.icon}
      </span>
      <span className="text-sm">{option.title}</span>
    </div>
  );
}

// =============================================================================
// Category Header Component
// =============================================================================

function CategoryHeader({ id, label }: { id: string; label: string }) {
  return (
    <div
      id={id}
      role="presentation"
      className="px-3 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide select-none"
    >
      {label}
    </div>
  );
}

// =============================================================================
// Component
// =============================================================================

export function ComponentPickerPlugin({
  openDialog,
}: ComponentPickerPluginProps) {
  const [editor] = useLexicalComposerContext();
  const [queryString, setQueryString] = useState<string | null>(null);

  const checkForTriggerMatch = useBasicTypeaheadTriggerMatch("/", {
    minLength: 0,
  });

  const configItems = getPickerInsertItems(!!openDialog);
  const allOptions = configItems.map(
    (item) =>
      new ComponentPickerOption(item, {
        icon: <item.icon className="h-4 w-4" />,
        keywords: [...item.keywords],
        category: item.category,
      }),
  );

  const lowerQuery =
    queryString === null || queryString === "" ? "" : queryString.toLowerCase();

  const options =
    lowerQuery === ""
      ? allOptions
      : allOptions.filter((option) =>
          pickerOptionMatchesQuery(option.title, option.keywords, lowerQuery),
        );

  const groupedOptions = (() => {
    const groups: {
      category: InsertCategory;
      options: ComponentPickerOption[];
    }[] = [];

    for (const category of CATEGORY_ORDER) {
      const categoryOptions = options.filter(
        (opt) => opt.category === category,
      );
      if (categoryOptions.length > 0) {
        groups.push({ category, options: categoryOptions });
      }
    }

    return groups;
  })();

  const onSelectOption = (
    selectedOption: ComponentPickerOption,
    nodeToRemove: TextNode | null,
    closeMenu: () => void,
    _matchingString: string,
  ) => {
    editor.update(() => {
      if (nodeToRemove) {
        nodeToRemove.remove();
      }
      applyInsertItemInUpdate(selectedOption.insertItem, editor, openDialog);
      closeMenu();
    });
  };

  const flatOptions = groupedOptions.flatMap((group) => group.options);

  return (
    <LexicalTypeaheadMenuPlugin<ComponentPickerOption>
      onQueryChange={setQueryString}
      onSelectOption={onSelectOption}
      triggerFn={checkForTriggerMatch}
      options={flatOptions}
      preselectFirstItem
      menuRenderFn={(
        anchorElementRef,
        { selectedIndex, selectOptionAndCleanUp, setHighlightedIndex },
      ) =>
        anchorElementRef.current && flatOptions.length > 0
          ? createPortal(
              <div className="fixed z-50 min-w-[220px] max-h-[320px] overflow-y-auto rounded-md border bg-popover shadow-md">
                <div
                  className="py-1"
                  role="listbox"
                  aria-label="ブロックを挿入"
                >
                  {groupedOptions.map((group) => {
                    const showHeader = lowerQuery === "";
                    const headingId = `slash-picker-cat-${group.category}`;
                    return (
                      <div
                        key={group.category}
                        role="group"
                        aria-labelledby={showHeader ? headingId : undefined}
                      >
                        {showHeader && (
                          <CategoryHeader
                            id={headingId}
                            label={CATEGORY_LABELS[group.category]}
                          />
                        )}
                        {group.options.map((option) => {
                          const globalIndex = flatOptions.indexOf(option);
                          return (
                            <ComponentPickerMenuItem
                              key={option.key}
                              index={globalIndex}
                              isSelected={selectedIndex === globalIndex}
                              onClick={() => {
                                setHighlightedIndex(globalIndex);
                                selectOptionAndCleanUp(option);
                              }}
                              onMouseEnter={() => {
                                setHighlightedIndex(globalIndex);
                              }}
                              option={option}
                            />
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
              </div>,
              anchorElementRef.current,
            )
          : null
      }
    />
  );
}
