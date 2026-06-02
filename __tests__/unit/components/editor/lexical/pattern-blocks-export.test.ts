/**
 * Pattern Blocks Export Tests
 *
 * @description Timeline / PricingTable / Testimonial の exportDOM が
 * メタデータ（年・価格・著者・評価等）を可視 DOM として出力することを検証する。
 * これらは NodeState で保持する表示値を createDOM/exportDOM で注入する設計のため、
 * exportDOM の注入漏れ（= 公開ページで不可視になる回帰）を防ぐ。
 */

import { describe, test, expect } from "bun:test";
import { createHeadlessEditor } from "@lexical/headless";
import { $generateHtmlFromNodes } from "@lexical/html";
import { $getRoot, $createParagraphNode, $createTextNode } from "lexical";
import {
  TimelineContainerNode,
  TimelineItemNode,
  $createTimelineContainerNode,
  $createTimelineItemNode,
} from "../../../../../src/app/(admin)/admin/(dashboard)/_shared/components/editor/lexical/nodes/TimelineNode";
import {
  PricingTableContainerNode,
  PricingPlanNode,
  PricingFeatureNode,
  $createPricingTableContainerNode,
  $createPricingPlanNode,
  $createPricingFeatureNode,
} from "../../../../../src/app/(admin)/admin/(dashboard)/_shared/components/editor/lexical/nodes/PricingTableNode";
import {
  TestimonialContainerNode,
  TestimonialItemNode,
  $createTestimonialContainerNode,
  $createTestimonialItemNode,
} from "../../../../../src/app/(admin)/admin/(dashboard)/_shared/components/editor/lexical/nodes/TestimonialNode";

function createEditor() {
  return createHeadlessEditor({
    namespace: "test",
    nodes: [
      TimelineContainerNode,
      TimelineItemNode,
      PricingTableContainerNode,
      PricingPlanNode,
      PricingFeatureNode,
      TestimonialContainerNode,
      TestimonialItemNode,
    ],
    onError: (error) => {
      throw error;
    },
  });
}

async function exportHtml(build: () => void): Promise<string> {
  const editor = createEditor();
  await editor.update(() => {
    build();
  });
  let html = "";
  editor.read(() => {
    html = $generateHtmlFromNodes(editor);
  });
  return html;
}

describe("Timeline exportDOM", () => {
  test("year / label が可視テキストとして出力される", async () => {
    const html = await exportHtml(() => {
      const container = $createTimelineContainerNode("vertical");
      container.append(
        $createTimelineItemNode({ year: "2024", label: "創業" }),
      );
      $getRoot().append(container);
    });
    expect(html).toContain("data-tl-year");
    expect(html).toContain("2024");
    expect(html).toContain("data-tl-label");
    expect(html).toContain("創業");
  });
});

describe("PricingTable exportDOM", () => {
  test("プラン名 / 価格 / 期間が可視テキストとして出力される", async () => {
    const html = await exportHtml(() => {
      const container = $createPricingTableContainerNode();
      const plan = $createPricingPlanNode({
        name: "スタンダード",
        price: "¥1,000",
        period: "月",
      });
      const feature = $createPricingFeatureNode({ included: true });
      const para = $createParagraphNode();
      para.append($createTextNode("基本機能"));
      feature.append(para);
      plan.append(feature);
      container.append(plan);
      $getRoot().append(container);
    });
    expect(html).toContain("data-pricing-name");
    expect(html).toContain("スタンダード");
    expect(html).toContain("data-pricing-price");
    expect(html).toContain("¥1,000");
    expect(html).toContain("data-pricing-period");
  });
});

describe("Testimonial exportDOM", () => {
  test("評価の星 / 著者名が可視 DOM として出力される", async () => {
    const html = await exportHtml(() => {
      const container = $createTestimonialContainerNode({ layout: "grid" });
      const item = $createTestimonialItemNode({
        authorName: "山田太郎",
        authorTitle: "代表",
        rating: 4,
      });
      const para = $createParagraphNode();
      para.append($createTextNode("素晴らしいサービスでした。"));
      item.append(para);
      container.append(item);
      $getRoot().append(container);
    });
    expect(html).toContain("data-testimonial-rating");
    expect(html).toContain('data-star="filled"');
    expect(html).toContain('data-star="empty"');
    expect(html).toContain("data-testimonial-author-name");
    expect(html).toContain("山田太郎");
  });
});
