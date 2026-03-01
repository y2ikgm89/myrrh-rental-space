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
import { TableRowNode } from "@lexical/table";
import { CustomTableNode } from "../nodes/CustomTableNode";
import { CustomTableCellNode } from "../nodes/CustomTableCellNode";
import { HorizontalRuleNode } from "@lexical/react/LexicalHorizontalRuleNode";
import type { Klass, LexicalNode } from "lexical";

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
import { TableOfContentsNode } from "../nodes/TableOfContentsNode";
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

/**
 * エディタに登録する全ノード一覧
 */
export const EDITOR_NODES: ReadonlyArray<Klass<LexicalNode>> = [
  // 公式ノード
  HeadingNode,
  QuoteNode,
  ListNode,
  ListItemNode,
  LinkNode,
  AutoLinkNode,
  CodeNode,
  CodeHighlightNode,
  CustomTableNode,
  TableRowNode,
  CustomTableCellNode,
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
  TableOfContentsNode,
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
];
