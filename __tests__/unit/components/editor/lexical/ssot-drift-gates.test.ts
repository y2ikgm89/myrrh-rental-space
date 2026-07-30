/**
 * Lexical SSoT drift gates
 *
 * @description audit で確定した構造的欠陥（node を追加しても
 * insert-items / inspector-registry / MarkdownTransformers /
 * sanitizer allowlist の4経路が機械的に同期されない）を機械強制する。
 * このファイルが赤くなったら、対応する SSoT（allowlist・登録配列）を
 * 更新するか、node 側に不足している配線を追加すること。
 *
 * 実装上の注意: 各 Klass の `.name`（JS のクラス名リフレクション）は
 * ビルド時の minify で書き換わりうるため信頼できない（実測で確認済み）。
 * そのため、判定対象の集合は必ず nodes/*.{ts,tsx} のソーステキストを
 * 直接読んで得る（scanNodeFileClassNames）。Lexical 内部の型識別子である
 * `getType()` の実際の文字列値（`this.config("xxx", ...)` の第1引数）は
 * ソースへの直書きリテラルなので、CUSTOM_NODE_GET_TYPE に手動転記した値を
 * 使う（同じく `.name` には依存しない）。
 *
 * Gate A: nodes/*.{ts,tsx} の class が EDITOR_NODES に登録されているか
 * Gate B: nodes/*.{ts,tsx} の class が inspector-registry でカバーされているか
 * Gate C: nodes/*.{ts,tsx} の class が MarkdownTransformers / markdown-loss-detection でカバーされているか
 * Gate D: nodes/*.{ts,tsx} の class が insert-items（挿入経路）でカバーされているか
 * Gate E: 代表的な node の exportDOM 出力タグが sanitizer allowlist を生き残るか
 *   （critical bug の直接の再発防止 — enrich 後・sanitize 後のタグ集合を比較する）
 */

import { describe, test, expect } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createHeadlessEditor } from "@lexical/headless";
import {
  $getRoot,
  $createParagraphNode,
  $createTextNode,
  type Klass,
  type LexicalNode,
  type LexicalNodeReplacement,
} from "lexical";
import { $createTableRowNode, TableCellHeaderStates } from "@lexical/table";
import {
  EDITOR_NODES,
  HEADLESS_EDITOR_NODES,
} from "@/admin/components/editor/lexical/config/nodes";
import { editorTheme } from "@/admin/components/editor/lexical/theme";
import { renderEditorStateJsonToHtmlCore } from "@/admin/components/editor/lexical/preview/render-editor-state-json-to-html-core";
import { finalizeLexicalExportedHtml } from "@/shared/lib/html/lexical-content-html-pipeline";

import { INSPECTABLE_NODE_TYPES_FROM_REGISTRY } from "@/admin/components/editor/lexical/config/inspector-registry";
import { REGISTRY_DIALOG_IDS } from "@/admin/components/editor/lexical/config/dialog-registry";
import { EDITOR_TRANSFORMERS } from "@/admin/components/editor/lexical/MarkdownTransformers";

// 挿入経路の実体（4ファイル分）を dialogId / id 抽出のために読む
import { STRUCTURE_INSERT_ITEMS } from "@/admin/components/editor/lexical/config/insert-items/structure";
import { EMBED_INSERT_ITEMS } from "@/admin/components/editor/lexical/config/insert-items/embed";
import { LAYOUT_INSERT_ITEMS } from "@/admin/components/editor/lexical/config/insert-items/layout-items";
import { MEDIA_INSERT_ITEMS } from "@/admin/components/editor/lexical/config/insert-items/media";

// ノード factory（Gate E の代表ドキュメント構築用）
import { $createYouTubeNode } from "@/admin/components/editor/lexical/nodes/YouTubeNode";
import { $createVimeoNode } from "@/admin/components/editor/lexical/nodes/VimeoNode";
import { $createXNode } from "@/admin/components/editor/lexical/nodes/XNode";
import { $createInstagramNode } from "@/admin/components/editor/lexical/nodes/InstagramNode";
import { $createMapEmbedNode } from "@/admin/components/editor/lexical/nodes/MapEmbedNode";
import { $createFigmaNode } from "@/admin/components/editor/lexical/nodes/FigmaNode";
import { $createSpotifyNode } from "@/admin/components/editor/lexical/nodes/SpotifyNode";
import { $createAudioNode } from "@/admin/components/editor/lexical/nodes/AudioNode";
import { $createRubyNode } from "@/admin/components/editor/lexical/nodes/RubyNode";
import { $createTooltipNode } from "@/admin/components/editor/lexical/nodes/TooltipNode";
import { $createImageNode } from "@/admin/components/editor/lexical/nodes/ImageNode";
import {
  $createGalleryContainerNode,
  $createGalleryItemNode,
} from "@/admin/components/editor/lexical/nodes/GalleryNode";
import { $createPullQuoteNode } from "@/admin/components/editor/lexical/nodes/PullQuoteNode";
import { $createPullQuoteTextNode } from "@/admin/components/editor/lexical/nodes/PullQuoteTextNode";
import { $createPullQuoteCitationNode } from "@/admin/components/editor/lexical/nodes/PullQuoteCitationNode";
import { $createPageBreakNode } from "@/admin/components/editor/lexical/nodes/PageBreakNode";
import { $createTabsContainerNode } from "@/admin/components/editor/lexical/nodes/TabsContainerNode";
import { $createTabListNode } from "@/admin/components/editor/lexical/nodes/TabListNode";
import { $createTabTitleNode } from "@/admin/components/editor/lexical/nodes/TabTitleNode";
import { $createTabPanelNode } from "@/admin/components/editor/lexical/nodes/TabPanelNode";
import { $createCollapsibleContainerNode } from "@/admin/components/editor/lexical/nodes/CollapsibleContainerNode";
import { $createCollapsibleItemNode } from "@/admin/components/editor/lexical/nodes/CollapsibleItemNode";
import { $createCollapsibleTitleNode } from "@/admin/components/editor/lexical/nodes/CollapsibleTitleNode";
import { $createCollapsibleContentNode } from "@/admin/components/editor/lexical/nodes/CollapsibleContentNode";
import { $createCustomTableNode } from "@/admin/components/editor/lexical/nodes/CustomTableNode";
import { $createCustomTableCellNode } from "@/admin/components/editor/lexical/nodes/CustomTableCellNode";
import { $createHorizontalRuleNode } from "@lexical/extension";

// =============================================================================
// 共通: nodes/*.{ts,tsx} のソーステキストから class 名を確定する（Gate A〜D 共通の SSoT）
// =============================================================================

/**
 * node 定義ファイルではあるが、単独の Klass として EDITOR_NODES に載る対象ではないファイル。
 * - index.ts: barrel
 * - decorator-registry.ts / register-decorator-components.client.ts: 登録インフラ
 * - *.decorator.client.tsx: client-only な React component（class ではない）
 */
const NODE_DIR_NON_NODE_FILES = new Set([
  "index.ts",
  "decorator-registry.ts",
  "register-decorator-components.client.ts",
]);

const NODES_DIR = join(
  process.cwd(),
  "src/app/(admin)/admin/(dashboard)/_shared/components/editor/lexical/nodes",
);

function scanNodeFileClassNames(): Map<string, string[]> {
  const result = new Map<string, string[]>();
  for (const filename of readdirSync(NODES_DIR)) {
    if (NODE_DIR_NON_NODE_FILES.has(filename)) continue;
    if (filename.endsWith(".decorator.client.tsx")) continue;
    if (!/\.(ts|tsx)$/.test(filename)) continue;
    if (!/Node\.(ts|tsx)$/.test(filename)) continue;

    const content = readFileSync(join(NODES_DIR, filename), "utf-8");
    const classNames: string[] = [];
    const classRegex = /^export class (\w+Node)\b/gm;
    let match: RegExpExecArray | null;
    while ((match = classRegex.exec(content)) !== null) {
      const name = match[1];
      if (name) classNames.push(name);
    }
    if (classNames.length > 0) result.set(filename, classNames);
  }
  return result;
}

/** class 名 → ファイル名。全 Gate 共通で使う「登録されているべきクラス一覧」。 */
function allCustomNodeClassNames(): Map<string, string> {
  const byFile = scanNodeFileClassNames();
  const byClass = new Map<string, string>();
  for (const [filename, classNames] of byFile) {
    for (const className of classNames) byClass.set(className, filename);
  }
  return byClass;
}

function editorNodesRegisteredNameSet(): Set<string> {
  const names = new Set<string>();
  for (const entry of EDITOR_NODES as ReadonlyArray<
    Klass<LexicalNode> | LexicalNodeReplacement
  >) {
    if (typeof entry === "function") {
      names.add(entry.name);
    } else if (
      entry !== null &&
      typeof entry === "object" &&
      "withKlass" in entry
    ) {
      names.add(entry.withKlass.name);
    }
  }
  return names;
}

// =============================================================================
// Gate A: nodes/*.{ts,tsx} の class が EDITOR_NODES に登録されているか
// =============================================================================

describe("Gate A: nodes/*.{ts,tsx} の class 定義が EDITOR_NODES に登録されているか", () => {
  test("全 XxxNode class が EDITOR_NODES（直接 or Node Replacement の withKlass）に含まれる", () => {
    const registered = editorNodesRegisteredNameSet();
    const byClass = allCustomNodeClassNames();

    const missing: string[] = [];
    for (const [className, filename] of byClass) {
      if (!registered.has(className)) {
        missing.push(`${className}（${filename}）`);
      }
    }

    expect(missing).toEqual([]);
  });
});

// =============================================================================
// Gate B: nodes/*.{ts,tsx} の class が inspector-registry でカバーされているか
// =============================================================================

/**
 * inspector panel を持たない意図的な node（理由付き）。
 * 素の rich text として編集される、または純粋な構造用の子ノード（親コンテナの
 * inspector から編集される、もしくは inline テキストとして直接編集される）。
 * 新規 node をここに追加する場合は、なぜ inspector 不要なのかコメントで説明すること
 * （audit の finding #3 の再発防止）。
 */
const INSPECTOR_LESS_ALLOWLIST = new Set([
  // 見出しレベルは toolbar のドロップダウンで変更、本文は inline 編集
  "CustomHeadingNode",
  // 構造用の子ノード（親コンテナの inspector 経由、または inline 編集）
  "LayoutItemNode",
  "CollapsibleItemNode",
  "CollapsibleTitleNode",
  "CollapsibleContentNode",
  "PullQuoteTextNode",
  "PullQuoteCitationNode",
  "StepItemNode",
  "StepTitleNode",
  "StepContentNode",
  "TabListNode",
  "TabPanelNode",
  // tab ラベルは inline 編集、tabIndex/isActive は TabsPlugin が自動管理
  "TabTitleNode",
  "CaptionBoxTitleNode",
  "CaptionBoxContentNode",
]);

/** class 名 → inspector-registry.ts の nodeType 文字列。Gate B の SSoT。 */
const CLASS_NAME_TO_INSPECTOR_NODE_TYPE: Record<string, string> = {
  ButtonNode: "button",
  ImageNode: "image",
  GroupNode: "group",
  CalloutNode: "callout",
  BookmarkNode: "bookmark",
  InternalLinkCardNode: "internalLinkCard",
  SpaceCardNode: "spaceCard",
  InlineIconNode: "inlineIcon",
  PullQuoteNode: "pullQuote",
  RubyNode: "ruby",
  TooltipNode: "tooltip",
  CollapsibleContainerNode: "collapsible",
  StepsContainerNode: "steps",
  TabsContainerNode: "tabs",
  LayoutContainerNode: "layout",
  YouTubeNode: "youtube",
  VimeoNode: "vimeo",
  XNode: "x",
  InstagramNode: "instagram",
  PageBreakNode: "pageBreak",
  MapEmbedNode: "mapEmbed",
  AudioNode: "audio",
  FileNode: "file",
  FigmaNode: "figma",
  SpotifyNode: "spotify",
  GalleryContainerNode: "galleryContainer",
  GalleryItemNode: "galleryItem",
  TimelineContainerNode: "timelineContainer",
  TimelineItemNode: "timelineItem",
  PricingTableContainerNode: "pricingTableContainer",
  PricingPlanNode: "pricingPlan",
  PricingFeatureNode: "pricingFeature",
  InlineImageNode: "inlineImage",
  TestimonialContainerNode: "testimonialContainer",
  TestimonialItemNode: "testimonialItem",
  FeatureIconListContainerNode: "featureIconListContainer",
  FeatureIconItemNode: "featureIconItem",
  CoverNode: "cover",
  CaptionBoxNode: "captionBox",
  CustomTableNode: "table",
  CustomTableCellNode: "tableCell",
};

describe("Gate B: nodes/*.{ts,tsx} の class が inspector-registry でカバーされているか", () => {
  test("INSPECTOR_LESS_ALLOWLIST 以外の全 node が INSPECTABLE_NODE_TYPES_FROM_REGISTRY に対応する nodeType を持つ", () => {
    const byClass = allCustomNodeClassNames();
    const uncovered: string[] = [];

    for (const className of byClass.keys()) {
      if (INSPECTOR_LESS_ALLOWLIST.has(className)) continue;
      const expectedNodeType = CLASS_NAME_TO_INSPECTOR_NODE_TYPE[className];
      if (expectedNodeType === undefined) {
        uncovered.push(
          `${className}（CLASS_NAME_TO_INSPECTOR_NODE_TYPE に未記載。inspector panel を追加するか、不要な理由を INSPECTOR_LESS_ALLOWLIST に書くこと）`,
        );
        continue;
      }
      const isRegistered = INSPECTABLE_NODE_TYPES_FROM_REGISTRY.some(
        (nodeType: string) => nodeType === expectedNodeType,
      );
      if (!isRegistered) {
        uncovered.push(
          `${className}（nodeType "${expectedNodeType}" が INSPECTABLE_NODE_TYPES_FROM_REGISTRY に無い）`,
        );
      }
    }

    expect(uncovered).toEqual([]);
  });
});

// =============================================================================
// Gate C: nodes/*.{ts,tsx} の class が Markdown（transformer or 明示 unrepresentable）でカバーされているか
// =============================================================================

/** CustomHeadingNode は @lexical/markdown 既定 HEADING（$isHeadingNode 経由）でカバーされる。 */
const COVERED_BY_DEFAULT_TRANSFORMERS = new Set(["CustomHeadingNode"]);

/** 構造用の子ノード。コンテナ自体が isUnrepresentableInMarkdown で判定されれば十分。 */
const MARKDOWN_STRUCTURAL_CHILD_ALLOWLIST = new Set([
  "CustomTableCellNode",
  "LayoutItemNode",
  "CollapsibleItemNode",
  "CollapsibleTitleNode",
  "CollapsibleContentNode",
  "PullQuoteTextNode",
  "PullQuoteCitationNode",
  "StepItemNode",
  "StepTitleNode",
  "StepContentNode",
  "TabListNode",
  "TabTitleNode",
  "TabPanelNode",
  "GalleryItemNode",
  "TimelineItemNode",
  "PricingPlanNode",
  "PricingFeatureNode",
  "TestimonialItemNode",
  "FeatureIconItemNode",
  "CaptionBoxTitleNode",
  "CaptionBoxContentNode",
]);

/**
 * MarkdownTransformers.ts の EDITOR_TRANSFORMERS が dependencies に持つカスタム node クラス名を、
 * ソーステキストから直接抽出する（`.name` runtime reflection は minify で信頼できないため）。
 */
function transformerDependencyClassNames(): Set<string> {
  const filePath = join(
    process.cwd(),
    "src/app/(admin)/admin/(dashboard)/_shared/components/editor/lexical/MarkdownTransformers.ts",
  );
  const content = readFileSync(filePath, "utf-8");
  const names = new Set<string>();
  const depRegex = /dependencies:\s*\[([^\]]*)]/g;
  let match: RegExpExecArray | null;
  while ((match = depRegex.exec(content)) !== null) {
    const body = match[1] ?? "";
    for (const rawName of body.split(",")) {
      const name = rawName.trim();
      if (/^\w+Node$/.test(name)) names.add(name);
    }
  }
  return names;
}

/**
 * markdown-loss-detection.ts の isUnrepresentableInMarkdown が判定する node クラス名を、
 * `$isXxxNode` の import からソーステキスト経由で抽出する。
 */
function markdownLossDetectionCoveredClassNames(): Set<string> {
  const filePath = join(
    process.cwd(),
    "src/app/(admin)/admin/(dashboard)/_shared/components/editor/lexical/markdown-loss-detection.ts",
  );
  const content = readFileSync(filePath, "utf-8");
  const names = new Set<string>();
  const importRegex = /\$is(\w+)Node/g;
  let match: RegExpExecArray | null;
  while ((match = importRegex.exec(content)) !== null) {
    const base = match[1];
    if (base) names.add(`${base}Node`);
  }
  return names;
}

describe("Gate C: nodes/*.{ts,tsx} の class が Markdown export でカバーされているか（transformer or 明示 unrepresentable）", () => {
  test("全 node が transformer dependencies / 既定TRANSFORMERS / markdown-loss-detection / 構造子allowlist のいずれかに属する", () => {
    const byClass = allCustomNodeClassNames();
    const transformerDeps = transformerDependencyClassNames();
    const lossDetectionCovered = markdownLossDetectionCoveredClassNames();

    const uncovered: string[] = [];
    for (const className of byClass.keys()) {
      if (COVERED_BY_DEFAULT_TRANSFORMERS.has(className)) continue;
      if (MARKDOWN_STRUCTURAL_CHILD_ALLOWLIST.has(className)) continue;
      if (transformerDeps.has(className)) continue;
      if (lossDetectionCovered.has(className)) continue;
      uncovered.push(
        `${className}（Markdown transformer を実装するか、markdown-loss-detection.ts の isUnrepresentableInMarkdown に追加すること）`,
      );
    }

    expect(uncovered).toEqual([]);
  });
});

// =============================================================================
// Gate D: nodes/*.{ts,tsx} の class が insert-items（挿入経路）でカバーされているか
// =============================================================================

/**
 * 独自の insert-item を持たない意図的な node（理由付き）。
 * 別の insert-item のダイアログ内サブモード経由で作られる、親コンテナの
 * insert-item によって構造ごと作られる、または insert-menu 以外の UI 経路
 * （floating toolbar・コメントパネル等）で作られる。
 */
const INSERT_LESS_ALLOWLIST = new Set([
  // h1-h6 の insert-item 経由（CustomHeadingNode 自体は insert-item を持たない）
  "CustomHeadingNode",
  // table insert-item / TableActionMenuPlugin の行・列追加操作経由
  "CustomTableCellNode",
  // "layout" insert-item が構造ごと作る
  "LayoutItemNode",
  // "collapsible" insert-item が構造ごと作る
  "CollapsibleItemNode",
  "CollapsibleTitleNode",
  "CollapsibleContentNode",
  // "pullQuote" insert-item が構造ごと作る
  "PullQuoteTextNode",
  "PullQuoteCitationNode",
  // linkCard ダイアログの外部URLタブ、または URL 単独ペースト（PasteUrlPlugin）経由
  "BookmarkNode",
  // "steps" insert-item が構造ごと作る
  "StepItemNode",
  "StepTitleNode",
  "StepContentNode",
  // "tabs" insert-item が構造ごと作る
  "TabListNode",
  "TabTitleNode",
  "TabPanelNode",
  // "gallery" 挿入後、Inspector の「画像を追加」操作で個別追加
  "GalleryItemNode",
  // "timeline" 挿入後、Inspector の「項目を追加」操作で個別追加
  "TimelineItemNode",
  // "pricingTable" 挿入後、PricingTableContainerInspectorPanel の列操作で個別追加
  "PricingPlanNode",
  "PricingFeatureNode",
  // "testimonial" 挿入後、Inspector の「証言を追加」操作で個別追加
  "TestimonialItemNode",
  // "feature-icon-list" 挿入後、Inspector の「項目を追加」操作で個別追加
  "FeatureIconItemNode",
  // "caption-box" insert-item が構造ごと作る
  "CaptionBoxTitleNode",
  "CaptionBoxContentNode",
]);

/** class 名 → insert-items の id（dialog 系は dialogId、transform 系は id 自体）。 */
const CLASS_NAME_TO_INSERT_ITEM_ID: Record<string, string> = {
  ImageNode: "image",
  InlineImageNode: "inline-image",
  AudioNode: "audio",
  FileNode: "file",
  GalleryContainerNode: "gallery",
  CustomTableNode: "table",
  YouTubeNode: "youtube",
  VimeoNode: "vimeo",
  XNode: "x",
  InstagramNode: "instagram",
  MapEmbedNode: "mapEmbed",
  FigmaNode: "figma",
  SpotifyNode: "spotify",
  InternalLinkCardNode: "linkCard",
  SpaceCardNode: "spaceCard",
  LayoutContainerNode: "layout",
  GroupNode: "group",
  CalloutNode: "callout",
  PullQuoteNode: "pullQuote",
  CollapsibleContainerNode: "collapsible",
  CaptionBoxNode: "caption-box",
  StepsContainerNode: "steps",
  TabsContainerNode: "tabs",
  CoverNode: "cover",
  TimelineContainerNode: "timeline",
  PricingTableContainerNode: "pricingTable",
  TestimonialContainerNode: "testimonial",
  FeatureIconListContainerNode: "feature-icon-list",
  ButtonNode: "button",
  InlineIconNode: "inline-icon",
  RubyNode: "ruby",
  TooltipNode: "tooltip",
  PageBreakNode: "pageBreak",
};

function allInsertItemIds(): Set<string> {
  const ids = new Set<string>();
  for (const item of [
    ...STRUCTURE_INSERT_ITEMS,
    ...EMBED_INSERT_ITEMS,
    ...LAYOUT_INSERT_ITEMS,
    ...MEDIA_INSERT_ITEMS,
  ] as ReadonlyArray<{ id: string }>) {
    ids.add(item.id);
  }
  return ids;
}

describe("Gate D: nodes/*.{ts,tsx} の class が insert-items（挿入経路）でカバーされているか", () => {
  test("INSERT_LESS_ALLOWLIST 以外の全 node が対応表経由で実在する insert-item id を持つ", () => {
    const byClass = allCustomNodeClassNames();
    const insertItemIds = allInsertItemIds();
    const problems: string[] = [];

    for (const className of byClass.keys()) {
      if (INSERT_LESS_ALLOWLIST.has(className)) continue;
      const expectedId = CLASS_NAME_TO_INSERT_ITEM_ID[className];
      if (expectedId === undefined) {
        problems.push(
          `${className}（CLASS_NAME_TO_INSERT_ITEM_ID に未記載、または理由付きで INSERT_LESS_ALLOWLIST に追加すること）`,
        );
        continue;
      }
      if (!insertItemIds.has(expectedId)) {
        problems.push(
          `${className}（insert-item id "${expectedId}" が実際の insert-items ファイル群に存在しない）`,
        );
      }
    }

    expect(problems).toEqual([]);
  });

  test("REGISTRY_DIALOG_IDS の全 dialogId が、いずれかの insert-item から参照されている（孤立ダイアログの検出）", () => {
    const dialogIdsUsedByInsertItems = new Set(
      [
        ...STRUCTURE_INSERT_ITEMS,
        ...EMBED_INSERT_ITEMS,
        ...LAYOUT_INSERT_ITEMS,
        ...MEDIA_INSERT_ITEMS,
      ]
        .map((item) => (item as { dialogId?: string }).dialogId)
        .filter((id): id is string => id !== undefined),
    );

    // link は floating toolbar / Ctrl+K 専用（audit で意図的と確認済み）
    const INTENTIONAL_INSERT_LESS_DIALOG_IDS = new Set(["link"]);

    const orphaned = REGISTRY_DIALOG_IDS.filter(
      (id) =>
        !dialogIdsUsedByInsertItems.has(id) &&
        !INTENTIONAL_INSERT_LESS_DIALOG_IDS.has(id),
    );

    expect(orphaned).toEqual([]);
  });
});

// =============================================================================
// Gate E: 代表的な node の exportDOM 出力タグが sanitizer allowlist を生き残るか
// =============================================================================

/**
 * 「div/span/p 等の基本タグ以外を出力する」代表的な node を1つのドキュメントに集約し、
 * 生の exportDOM 出力（sanitize 前）のタグ集合が sanitize 後も完全に生き残ることを検証する。
 *
 * 新しい node を追加して、これまで使われていなかった HTML タグを exportDOM で
 * 出力するようになった場合、このテストが「そのタグが sanitizer allowlist に
 * 無ければ」失敗する（critical bug の直接の再発防止）。
 *
 * 全 EDITOR_NODES を網羅するものではない（div/span/p のみを出す純粋装飾 node は
 * 元々 allowlist の基本タグに収まるため対象外）。基本タグ以外を出す node を
 * 追加した場合は、ここに代表インスタンスを追加すること。
 */
function buildTagDiverseDocument(): void {
  const root = $getRoot();
  root.clear();

  root.append($createYouTubeNode({ videoId: "dQw4w9WgXcQ" }));
  root.append($createVimeoNode({ videoId: "76979871" }));
  root.append($createXNode({ tweetId: "123456789012345" }));
  root.append($createInstagramNode({ postId: "ABC123abc_-" }));
  root.append(
    $createMapEmbedNode("https://www.google.com/maps/embed?pb=1", "案内図"),
  );
  root.append(
    $createFigmaNode({
      embedUrl: "https://www.figma.com/embed?embed_host=share&url=x",
    }),
  );
  root.append(
    $createSpotifyNode({
      embedUrl: "https://open.spotify.com/embed/track/xyz",
      contentType: "track",
    }),
  );
  root.append($createAudioNode({ url: "https://cdn.example.com/a.mp3" }));

  const para = $createParagraphNode();
  para.append($createRubyNode("漢字", "かんじ"));
  para.append($createTooltipNode("用語", "説明文"));
  root.append(para);

  root.append(
    $createImageNode({
      src: "https://cdn.example.com/x.png",
      alt: "説明",
      caption: "キャプション",
    }),
  );

  const gallery = $createGalleryContainerNode();
  gallery.append(
    $createGalleryItemNode({
      src: "https://cdn.example.com/g1.png",
      alt: "g1",
      caption: "画像1",
    }),
  );
  root.append(gallery);

  const pullQuote = $createPullQuoteNode();
  const pqText = $createPullQuoteTextNode();
  pqText.append($createParagraphNode().append($createTextNode("引用文")));
  const pqCitation = $createPullQuoteCitationNode();
  pqCitation.append($createParagraphNode().append($createTextNode("出典")));
  pullQuote.append(pqText, pqCitation);
  root.append(pullQuote);

  root.append($createPageBreakNode());

  const tabs = $createTabsContainerNode();
  const tabList = $createTabListNode();
  tabList.append($createTabTitleNode(0, true));
  const tabPanel = $createTabPanelNode(0, true);
  tabPanel.append($createParagraphNode().append($createTextNode("タブ内容")));
  tabs.append(tabList, tabPanel);
  root.append(tabs);

  const collapsible = $createCollapsibleContainerNode();
  const item = $createCollapsibleItemNode(true);
  const title = $createCollapsibleTitleNode();
  title.append($createParagraphNode().append($createTextNode("質問")));
  const content = $createCollapsibleContentNode();
  content.append($createParagraphNode().append($createTextNode("回答")));
  item.append(title, content);
  collapsible.append(item);
  root.append(collapsible);

  const table = $createCustomTableNode();
  const headerRow = $createTableRowNode();
  const headerCell = $createCustomTableCellNode(TableCellHeaderStates.ROW);
  headerCell.append($createParagraphNode().append($createTextNode("見出し")));
  headerRow.append(headerCell);
  const dataRow = $createTableRowNode();
  const dataCell = $createCustomTableCellNode();
  dataCell.append($createParagraphNode().append($createTextNode("データ")));
  dataRow.append(dataCell);
  table.append(headerRow, dataRow);
  root.append(table);

  root.append($createHorizontalRuleNode());
}

function extractTagNames(html: string): Set<string> {
  const tags = new Set<string>();
  const regex = /<([a-zA-Z][a-zA-Z0-9-]*)\b/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(html)) !== null) {
    const tag = match[1];
    if (tag) tags.add(tag.toLowerCase());
  }
  return tags;
}

describe("Gate E: sanitizer allowlist が exportDOM 出力タグを取りこぼさない", () => {
  test("代表ドキュメントの exportDOM 出力タグ集合が sanitize 後も完全に生き残る", () => {
    const editor = createHeadlessEditor({
      namespace: "ssot-drift-gate-tag-coverage",
      theme: editorTheme,
      nodes: [...HEADLESS_EDITOR_NODES],
      onError: (error) => {
        throw error;
      },
    });

    editor.update(buildTagDiverseDocument, { discrete: true });

    const json = JSON.stringify(editor.getEditorState().toJSON());
    const rawHtml = renderEditorStateJsonToHtmlCore(json);
    const sanitizedHtml = finalizeLexicalExportedHtml(rawHtml);

    const rawTags = extractTagNames(rawHtml);
    const sanitizedTags = extractTagNames(sanitizedHtml);

    const dropped = [...rawTags].filter((tag) => !sanitizedTags.has(tag));

    expect(dropped).toEqual([]);
  });
});
