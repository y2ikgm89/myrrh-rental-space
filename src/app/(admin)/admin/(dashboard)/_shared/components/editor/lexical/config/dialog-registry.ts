/**
 * Dialog Registry
 *
 * @description ダイアログプラグインのレジストリ。DialogRenderer の繰り返しJSXを配列化。
 *
 * 新しいダイアログを追加する場合：
 * 1. REGISTRY_DIALOG_IDS にIDを追加
 * 2. DIALOG_REGISTRY にエントリーを追加
 * 3. dialog-types.ts の DIALOG_IDS / DialogId は自動導出される
 *
 * 注意: BlockTemplatePlugin は独自の props パターン（isSaveOpen/isInsertOpen）を使用するため
 * このレジストリには含まない。LexicalEditor.tsx で直接管理。
 */

import type { ComponentType } from "react";
import {
  ImagePlugin,
  YouTubePlugin,
  VimeoPlugin,
  XPlugin,
  InstagramPlugin,
  LinkDialogPlugin,
  TableInsertPlugin,
  LayoutPlugin,
  CalloutPlugin,
  ButtonPlugin,
  PullQuotePlugin,
  LinkCardPlugin,
  StepsPlugin,
  TabsPlugin,
  MapEmbedPlugin,
  RubyPlugin,
  TooltipPlugin,
  AudioPlugin,
  FilePlugin,
  FigmaPlugin,
  SpotifyPlugin,
  GalleryPlugin,
  TimelinePlugin,
  PricingTablePlugin,
  InlineImagePlugin,
  TestimonialPlugin,
  FeatureIconListPlugin,
  InlineIconPlugin,
  CoverPlugin,
} from "../plugins";

// =============================================================================
// Types
// =============================================================================

export type DialogPluginProps = {
  isOpen: boolean;
  onClose: () => void;
};

/**
 * レジストリのダイアログIDリテラルタプル（型安全性の源泉）
 *
 * DialogId 型はここから導出されるため、ID追加時はここに記載必須。
 */
export const REGISTRY_DIALOG_IDS = [
  "image",
  "youtube",
  "vimeo",
  "x",
  "instagram",
  "link",
  "table",
  "layout",
  "callout",
  "button",
  "pullQuote",
  "linkCard",
  "steps",
  "tabs",
  "mapEmbed",
  "ruby",
  "tooltip",
  "audio",
  "file",
  "figma",
  "spotify",
  "gallery",
  "timeline",
  "pricingTable",
  "inlineImage",
  "testimonial",
  "feature-icon-list",
  "inline-icon",
  "cover",
] as const;

export type RegistryDialogId = (typeof REGISTRY_DIALOG_IDS)[number];

type DialogRegistryEntry = {
  dialogId: RegistryDialogId;
  component: ComponentType<DialogPluginProps>;
};

// =============================================================================
// Registry
// =============================================================================

export const DIALOG_REGISTRY: readonly DialogRegistryEntry[] = [
  { dialogId: "image", component: ImagePlugin },
  { dialogId: "youtube", component: YouTubePlugin },
  { dialogId: "vimeo", component: VimeoPlugin },
  { dialogId: "x", component: XPlugin },
  { dialogId: "instagram", component: InstagramPlugin },
  { dialogId: "link", component: LinkDialogPlugin },
  { dialogId: "table", component: TableInsertPlugin },
  { dialogId: "layout", component: LayoutPlugin },
  { dialogId: "callout", component: CalloutPlugin },
  { dialogId: "button", component: ButtonPlugin },
  { dialogId: "pullQuote", component: PullQuotePlugin },
  { dialogId: "linkCard", component: LinkCardPlugin },
  { dialogId: "steps", component: StepsPlugin },
  { dialogId: "tabs", component: TabsPlugin },
  { dialogId: "mapEmbed", component: MapEmbedPlugin },
  { dialogId: "ruby", component: RubyPlugin },
  { dialogId: "tooltip", component: TooltipPlugin },
  { dialogId: "audio", component: AudioPlugin },
  { dialogId: "file", component: FilePlugin },
  { dialogId: "figma", component: FigmaPlugin },
  { dialogId: "spotify", component: SpotifyPlugin },
  { dialogId: "gallery", component: GalleryPlugin },
  { dialogId: "timeline", component: TimelinePlugin },
  { dialogId: "pricingTable", component: PricingTablePlugin },
  { dialogId: "inlineImage", component: InlineImagePlugin },
  { dialogId: "testimonial", component: TestimonialPlugin },
  { dialogId: "feature-icon-list", component: FeatureIconListPlugin },
  { dialogId: "inline-icon", component: InlineIconPlugin },
  { dialogId: "cover", component: CoverPlugin },
];
