/**
 * Table Inspector Panel
 *
 * @description CustomTableNode のプロパティ編集パネル
 * スタイル・カラー・枠線・詳細設定を提供する
 */

"use client";

import { $getState, $setState } from "lexical";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { Input, Label, Switch } from "@/admin/components/ui";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/admin/components/ui/select";
import { InspectorHeader } from "../InspectorHeader";
import { InspectorSection } from "../InspectorSection";
import { TableColorPicker } from "../components/TableColorPicker";
import { useNodeUpdater } from "../hooks/use-node-updater";
import {
  $isCustomTableNode,
  tableStyleState,
  tableHasHeaderState,
  tableHasFooterState,
  tableFixedLayoutState,
  tableBackgroundColorState,
  tableBorderColorState,
  tableBorderWidthState,
  tableHtmlAnchorState,
  tableCssClassState,
  type TableStyle,
  type CustomTableNode,
} from "../../nodes/CustomTableNode";
import type { NodeKey } from "lexical";

// =============================================================================
// Types
// =============================================================================

type TableInspectorPanelProps = {
  nodeKey: NodeKey;
  node: CustomTableNode;
};

// =============================================================================
// Constants
// =============================================================================

const BORDER_WIDTH_OPTIONS = [
  { label: "なし", value: "0" },
  { label: "1px", value: "1" },
  { label: "2px", value: "2" },
  { label: "3px", value: "3" },
];

// =============================================================================
// Component
// =============================================================================

export function TableInspectorPanel({
  nodeKey,
  node,
}: TableInspectorPanelProps) {
  const [editor] = useLexicalComposerContext();
  const updateNode = useNodeUpdater(nodeKey, $isCustomTableNode);

  const {
    tableStyle,
    hasHeader,
    hasFooter,
    fixedLayout,
    backgroundColor,
    borderColor,
    borderWidth,
    htmlAnchor,
    cssClass,
  } = editor.getEditorState().read(() => ({
    tableStyle: $getState(node, tableStyleState),
    hasHeader: $getState(node, tableHasHeaderState),
    hasFooter: $getState(node, tableHasFooterState),
    fixedLayout: $getState(node, tableFixedLayoutState),
    backgroundColor: $getState(node, tableBackgroundColorState),
    borderColor: $getState(node, tableBorderColorState),
    borderWidth: $getState(node, tableBorderWidthState),
    htmlAnchor: $getState(node, tableHtmlAnchorState),
    cssClass: $getState(node, tableCssClassState),
  }));

  return (
    <div>
      <InspectorHeader title="テーブル" />

      <InspectorSection title="スタイル">
        <div className="space-y-3">
          {/* 表示スタイル */}
          <div className="space-y-1.5">
            <Label className="text-xs">表示スタイル</Label>
            <Select
              value={tableStyle}
              onValueChange={(v) =>
                updateNode((n) => {
                  $setState(n, tableStyleState, v as TableStyle);
                })
              }
            >
              <SelectTrigger className="h-8 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="default">デフォルト</SelectItem>
                <SelectItem value="stripes">縞模様</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* ヘッダー行 */}
          <div className="flex items-center justify-between">
            <Label className="text-xs">ヘッダー行</Label>
            <Switch
              checked={hasHeader}
              onCheckedChange={(checked) =>
                updateNode((n) => {
                  $setState(n, tableHasHeaderState, checked);
                })
              }
            />
          </div>

          {/* フッター行 */}
          <div className="flex items-center justify-between">
            <Label className="text-xs">フッター行</Label>
            <Switch
              checked={hasFooter}
              onCheckedChange={(checked) =>
                updateNode((n) => {
                  $setState(n, tableHasFooterState, checked);
                })
              }
            />
          </div>

          {/* セル幅均等 */}
          <div className="flex items-center justify-between">
            <Label className="text-xs">セル幅均等</Label>
            <Switch
              checked={fixedLayout}
              onCheckedChange={(checked) =>
                updateNode((n) => {
                  $setState(n, tableFixedLayoutState, checked);
                })
              }
            />
          </div>
        </div>
      </InspectorSection>

      <InspectorSection title="カラー">
        <div className="space-y-4">
          <TableColorPicker
            label="背景色"
            value={backgroundColor}
            onChange={(v) =>
              updateNode((n) => {
                $setState(n, tableBackgroundColorState, v);
              })
            }
          />
          <TableColorPicker
            label="枠線色"
            value={borderColor}
            onChange={(v) =>
              updateNode((n) => {
                $setState(n, tableBorderColorState, v);
              })
            }
          />

          {/* 枠線幅 */}
          <div className="space-y-1.5">
            <Label className="text-xs">枠線幅</Label>
            <Select
              value={String(borderWidth)}
              onValueChange={(v) =>
                updateNode((n) => {
                  $setState(n, tableBorderWidthState, parseInt(v, 10));
                })
              }
            >
              <SelectTrigger className="h-8 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {BORDER_WIDTH_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </InspectorSection>

      <InspectorSection title="詳細" defaultOpen={false}>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs">HTML アンカー</Label>
            <Input
              value={htmlAnchor}
              onChange={(e) =>
                updateNode((n) => {
                  $setState(n, tableHtmlAnchorState, e.target.value);
                })
              }
              placeholder="my-table"
              className="h-7 font-mono text-xs"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">CSS クラス</Label>
            <Input
              value={cssClass}
              onChange={(e) =>
                updateNode((n) => {
                  $setState(n, tableCssClassState, e.target.value);
                })
              }
              placeholder="custom-class"
              className="h-7 font-mono text-xs"
            />
          </div>
        </div>
      </InspectorSection>
    </div>
  );
}
