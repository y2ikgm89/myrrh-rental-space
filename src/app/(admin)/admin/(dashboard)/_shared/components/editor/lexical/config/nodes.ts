/**
 * Lexical Editor ノード登録配列
 *
 * @description LexicalComposerのinitialConfigに渡すノード一覧
 */

import { HeadingNode, QuoteNode } from "@lexical/rich-text";
import { ListItemNode, ListNode } from "@lexical/list";
import { LinkNode, AutoLinkNode } from "@lexical/link";
import { CodeNode, CodeHighlightNode } from "@lexical/code";
import { MarkNode } from "@lexical/mark";
import { TableNode, TableCellNode, TableRowNode } from "@lexical/table";
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
import { HorizontalRuleNode } from "@lexical/react/LexicalHorizontalRuleNode";
import type { Klass, LexicalNode, LexicalNodeReplacement } from "lexical";

import { ImageNode } from "../nodes/ImageNode";
import { YouTubeNode } from "../nodes/YouTubeNode";
import { VimeoNode } from "../nodes/VimeoNode";
import { XNode } from "../nodes/XNode";
import { InstagramNode } from "../nodes/InstagramNode";
import { LayoutContainerNode } from "../nodes/LayoutContainerNode";
import { LayoutItemNode } from "../nodes/LayoutItemNode";
import { PageBreakNode } from "../nodes/PageBreakNode";
import { CalloutNode } from "../nodes/CalloutNode";
import { CollapsibleContainerNode } from "../nodes/CollapsibleContainerNode";
import { CollapsibleItemNode } from "../nodes/CollapsibleItemNode";
import { CollapsibleTitleNode } from "../nodes/CollapsibleTitleNode";
import { CollapsibleContentNode } from "../nodes/CollapsibleContentNode";
import { ButtonNode } from "../nodes/ButtonNode";
import { PullQuoteNode } from "../nodes/PullQuoteNode";
import { PullQuoteTextNode } from "../nodes/PullQuoteTextNode";
import { PullQuoteCitationNode } from "../nodes/PullQuoteCitationNode";
import { BookmarkNode } from "../nodes/BookmarkNode";
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
import { AudioNode } from "../nodes/AudioNode";
import { FileNode } from "../nodes/FileNode";
import { FigmaNode } from "../nodes/FigmaNode";
import { SpotifyNode } from "../nodes/SpotifyNode";
import { GalleryContainerNode, GalleryItemNode } from "../nodes/GalleryNode";
import { TimelineContainerNode, TimelineItemNode } from "../nodes/TimelineNode";
import {
  PricingTableContainerNode,
  PricingPlanNode,
  PricingFeatureNode,
} from "../nodes/PricingTableNode";
import { InlineImageNode } from "../nodes/InlineImageNode";
import {
  TestimonialContainerNode,
  TestimonialItemNode,
} from "../nodes/TestimonialNode";
import {
  FeatureIconListContainerNode,
  FeatureIconItemNode,
} from "../nodes/FeatureIconListNode";
import { CoverNode } from "../nodes/CoverNode";
import { CaptionBoxNode } from "../nodes/CaptionBoxNode";
import { CaptionBoxTitleNode } from "../nodes/CaptionBoxNode";
import { CaptionBoxContentNode } from "../nodes/CaptionBoxNode";
import { GroupNode } from "../nodes/GroupNode";

/**
 * エディタに登録する全ノード一覧
 */
export const EDITOR_NODES: ReadonlyArray<
  Klass<LexicalNode> | LexicalNodeReplacement
> = [
  // 公式ノード
  // Heading: Node Replacement パターン（公式ベストプラクティス）
  // withKlass により editor._nodes.get("heading") = CustomHeadingNode となり
  // $isHeadingNode(customHeadingNode) が instanceof チェックで true を返す
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
  // テーブル: Node Replacement パターン（公式ベストプラクティス）
  // withKlass により editor._nodes.get("table") = CustomTableNode となり
  // TablePlugin.hasNodes([TableNode]) および $isTableNode() が正常動作する
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
  // カスタムノード
  ImageNode,
  YouTubeNode,
  VimeoNode,
  XNode,
  InstagramNode,
  LayoutContainerNode,
  LayoutItemNode,
  PageBreakNode,
  CalloutNode,
  CollapsibleContainerNode,
  CollapsibleItemNode,
  CollapsibleTitleNode,
  CollapsibleContentNode,
  ButtonNode,
  PullQuoteNode,
  PullQuoteTextNode,
  PullQuoteCitationNode,
  BookmarkNode,
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
  AudioNode,
  FileNode,
  FigmaNode,
  SpotifyNode,
  GalleryContainerNode,
  GalleryItemNode,
  TimelineContainerNode,
  TimelineItemNode,
  PricingTableContainerNode,
  PricingPlanNode,
  PricingFeatureNode,
  InlineImageNode,
  TestimonialContainerNode,
  TestimonialItemNode,
  FeatureIconListContainerNode,
  FeatureIconItemNode,
  CoverNode,
  CaptionBoxNode,
  CaptionBoxTitleNode,
  CaptionBoxContentNode,
  GroupNode,
];
