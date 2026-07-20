/**
 * Pricing Table Container Inspector Panel
 *
 * @description PricingTableContainerNode のプロパティ編集パネル。
 * 個別プラン（{@link PricingPlanNode}）・機能項目（{@link PricingFeatureNode}）は
 * 既存の InspectorPanel で編集できるが、プラン列そのものの増減は挿入時
 * （`plugins/PricingTablePlugin.tsx`）にしか行えなかった。本パネルは
 * コンテナレベルでプラン列を追加・削除する手段を提供する。
 *
 * 列追加時は既存プランの機能行数（最大値）に合わせて空の
 * {@link PricingFeatureNode} を補い、行揃えを崩さない。
 */

"use client";

import { $createParagraphNode, $getState } from "lexical";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { IconMinus, IconPlus } from "@tabler/icons-react";
import {
  $isPricingTableContainerNode,
  $isPricingPlanNode,
  $createPricingPlanNode,
  $createPricingFeatureNode,
  type PricingTableContainerNode,
  planNameState,
} from "../../nodes/PricingTableNode";
import { InspectorHeader } from "../InspectorHeader";
import { InspectorSection } from "../InspectorSection";
import { useNodeUpdater } from "../hooks/use-node-updater";
import { Button } from "@/admin/components/ui/button";

// =============================================================================
// Constants
// =============================================================================

const MIN_PLAN_COLUMNS = 1;
const MAX_PLAN_COLUMNS = 4;

// =============================================================================
// Types
// =============================================================================

type PricingTableContainerInspectorPanelProps = {
  nodeKey: string;
  node: PricingTableContainerNode;
};

// =============================================================================
// Component
// =============================================================================

export function PricingTableContainerInspectorPanel({
  nodeKey,
  node,
}: PricingTableContainerInspectorPanelProps) {
  const [editor] = useLexicalComposerContext();
  const updateNode = useNodeUpdater(nodeKey, $isPricingTableContainerNode);

  const { columnCount, planNames } = editor.read(() => {
    const children = node.getChildren();
    return {
      columnCount: children.length,
      planNames: children
        .filter($isPricingPlanNode)
        .map((plan) => $getState(plan, planNameState) || "（無題）"),
    };
  });

  const handleAddPlan = () => {
    updateNode((n) => {
      const planChildren = n.getChildren().filter($isPricingPlanNode);
      if (planChildren.length >= MAX_PLAN_COLUMNS) return;

      const maxFeatureCount = planChildren.reduce(
        (max, plan) => Math.max(max, plan.getChildrenSize()),
        0,
      );

      const newPlan = $createPricingPlanNode({
        name: "新しいプラン",
        price: "",
        period: "月",
      });

      for (let i = 0; i < maxFeatureCount; i++) {
        const feature = $createPricingFeatureNode({ included: true });
        feature.append($createParagraphNode());
        newPlan.append(feature);
      }

      n.append(newPlan);
    });
  };

  const handleRemoveLastPlan = () => {
    updateNode((n) => {
      const planChildren = n.getChildren().filter($isPricingPlanNode);
      if (planChildren.length <= MIN_PLAN_COLUMNS) return;
      const lastPlan = planChildren[planChildren.length - 1];
      lastPlan?.remove();
    });
  };

  return (
    <div>
      <InspectorHeader title="料金比較表" />

      <InspectorSection title="プラン列">
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">
            現在 {columnCount} 列
            {planNames.length > 0 && `（${planNames.join(" / ")}）`}
          </p>

          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="flex-1"
              onClick={handleAddPlan}
              disabled={columnCount >= MAX_PLAN_COLUMNS}
            >
              <IconPlus className="mr-1.5 h-4 w-4" aria-hidden />
              列を追加
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="flex-1"
              onClick={handleRemoveLastPlan}
              disabled={columnCount <= MIN_PLAN_COLUMNS}
            >
              <IconMinus className="mr-1.5 h-4 w-4" aria-hidden />
              最後の列を削除
            </Button>
          </div>

          <p className="text-xs text-muted-foreground">
            最小 {MIN_PLAN_COLUMNS} 列 / 最大 {MAX_PLAN_COLUMNS} 列。
            各プランの内容は本文中のプラン列を選択して編集してください。
          </p>
        </div>
      </InspectorSection>
    </div>
  );
}
