/**
 * Headless Lexical ノード登録（server / RSC / CLI）。
 *
 * @lexical/react 非依存。規約の HTML↔JSON 派生パイプライン用。
 * HorizontalRule は Lexical 公式 `@lexical/extension`（React 不要）。
 *
 * DecoratorNode で @lexical/react を module 評価時に import するノード
 * （Image / InlineImage / PageBreak / Audio / File / Figma / Spotify / Button）は
 * headless では除外。規約テンプレートおよび通常編集で使うノードを網羅する。
 */

import { HeadingNode, QuoteNode } from "@lexical/rich-text";
import { ListItemNode, ListNode } from "@lexical/list";
import { LinkNode, AutoLinkNode } from "@lexical/link";
import { CodeNode, CodeHighlightNode } from "@lexical/code";
import { MarkNode } from "@lexical/mark";
import { TableNode, TableCellNode, TableRowNode } from "@lexical/table";
import { HorizontalRuleNode } from "@lexical/extension";
import type { Klass, LexicalNode, LexicalNodeReplacement } from "lexical";
import {
  CustomHeadingNode,
  $createCustomHeadingNode,
} from "../nodes/CustomHeadingNode";
import {
  CustomTableNode,
  $createCustomTableNode,
} from "../nodes/CustomTableNode";
import {
  CustomTableCellNode,
  $createCustomTableCellNode,
} from "../nodes/CustomTableCellNode";
import { YouTubeNode } from "../nodes/YouTubeNode";
import { VimeoNode } from "../nodes/VimeoNode";
import { XNode } from "../nodes/XNode";
import { InstagramNode } from "../nodes/InstagramNode";
import { LayoutContainerNode } from "../nodes/LayoutContainerNode";
import { LayoutItemNode } from "../nodes/LayoutItemNode";
import { CalloutNode } from "../nodes/CalloutNode";
import { CollapsibleContainerNode } from "../nodes/CollapsibleContainerNode";
import { CollapsibleItemNode } from "../nodes/CollapsibleItemNode";
import { CollapsibleTitleNode } from "../nodes/CollapsibleTitleNode";
import { CollapsibleContentNode } from "../nodes/CollapsibleContentNode";
import { PullQuoteNode } from "../nodes/PullQuoteNode";
import { PullQuoteTextNode } from "../nodes/PullQuoteTextNode";
import { PullQuoteCitationNode } from "../nodes/PullQuoteCitationNode";
import { BookmarkNode } from "../nodes/BookmarkNode";
import { InternalLinkCardNode } from "../nodes/InternalLinkCardNode";
import { StepsContainerNode } from "../nodes/StepsContainerNode";
import { StepItemNode } from "../nodes/StepItemNode";
import { StepTitleNode } from "../nodes/StepTitleNode";
import { StepContentNode } from "../nodes/StepContentNode";
import { TabsContainerNode } from "../nodes/TabsContainerNode";
import { TabListNode } from "../nodes/TabListNode";
import { TabTitleNode } from "../nodes/TabTitleNode";
import { TabPanelNode } from "../nodes/TabPanelNode";
import { MapEmbedNode } from "../nodes/MapEmbedNode";
import { RubyNode } from "../nodes/RubyNode";
import { TooltipNode } from "../nodes/TooltipNode";
import { GalleryContainerNode, GalleryItemNode } from "../nodes/GalleryNode";
import { TimelineContainerNode, TimelineItemNode } from "../nodes/TimelineNode";
import {
  PricingTableContainerNode,
  PricingPlanNode,
  PricingFeatureNode,
} from "../nodes/PricingTableNode";
import {
  TestimonialContainerNode,
  TestimonialItemNode,
} from "../nodes/TestimonialNode";
import {
  FeatureIconListContainerNode,
  FeatureIconItemNode,
} from "../nodes/FeatureIconListNode";
import { InlineIconNode } from "../nodes/InlineIconNode";
import { CoverNode } from "../nodes/CoverNode";
import { CaptionBoxNode } from "../nodes/CaptionBoxNode";
import { CaptionBoxTitleNode } from "../nodes/CaptionBoxNode";
import { CaptionBoxContentNode } from "../nodes/CaptionBoxNode";
import { GroupNode } from "../nodes/GroupNode";

export const HEADLESS_EDITOR_NODES: ReadonlyArray<
  Klass<LexicalNode> | LexicalNodeReplacement
> = [
  CustomHeadingNode,
  {
    replace: HeadingNode,
    with: (node: HeadingNode) => $createCustomHeadingNode(node.getTag()),
    withKlass: CustomHeadingNode,
  },
  QuoteNode,
  ListNode,
  ListItemNode,
  LinkNode,
  AutoLinkNode,
  CodeNode,
  CodeHighlightNode,
  CustomTableNode,
  {
    replace: TableNode,
    with: () => $createCustomTableNode(),
    withKlass: CustomTableNode,
  },
  TableRowNode,
  CustomTableCellNode,
  {
    replace: TableCellNode,
    with: (node: TableCellNode) =>
      $createCustomTableCellNode(
        node.getHeaderStyles(),
        node.getColSpan(),
        node.getWidth() ?? undefined,
      ),
    withKlass: CustomTableCellNode,
  },
  HorizontalRuleNode,
  MarkNode,
  YouTubeNode,
  VimeoNode,
  XNode,
  InstagramNode,
  LayoutContainerNode,
  LayoutItemNode,
  CalloutNode,
  CollapsibleContainerNode,
  CollapsibleItemNode,
  CollapsibleTitleNode,
  CollapsibleContentNode,
  PullQuoteNode,
  PullQuoteTextNode,
  PullQuoteCitationNode,
  BookmarkNode,
  InternalLinkCardNode,
  StepsContainerNode,
  StepItemNode,
  StepTitleNode,
  StepContentNode,
  TabsContainerNode,
  TabListNode,
  TabTitleNode,
  TabPanelNode,
  MapEmbedNode,
  RubyNode,
  TooltipNode,
  GalleryContainerNode,
  GalleryItemNode,
  TimelineContainerNode,
  TimelineItemNode,
  PricingTableContainerNode,
  PricingPlanNode,
  PricingFeatureNode,
  TestimonialContainerNode,
  TestimonialItemNode,
  FeatureIconListContainerNode,
  FeatureIconItemNode,
  InlineIconNode,
  CoverNode,
  CaptionBoxNode,
  CaptionBoxTitleNode,
  CaptionBoxContentNode,
  GroupNode,
];
