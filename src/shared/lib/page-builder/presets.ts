import {
  createPageBuilderLayoutBox,
  createPageBuilderResponsiveLayout,
} from "./layout";
import type { PageBuilderDocument, PageBuilderNode } from "./schema";
import { createPageBuilderResponsiveVisibility } from "./visibility";

export type PageBuilderPresetType =
  | "hero-intro"
  | "photo-hero"
  | "service-list"
  | "amenity-grid"
  | "usage-steps"
  | "pricing-grid"
  | "access-map"
  | "faq-list"
  | "reservation-cta"
  | "contact-form";

export type PageBuilderPresetOption = {
  value: PageBuilderPresetType;
  label: string;
  description: string;
};

export type PageBuilderPresetNodeIdFactory = (
  type: PageBuilderNode["type"],
  role: string,
) => string;

type PageBuilderPresetTree = {
  rootId: string;
  nodes: PageBuilderNode[];
};

type TextPresetNodeInput = {
  id: string;
  parentId: string;
  name: string;
  text: string;
  tag: Extract<PageBuilderNode, { type: "text" }>["content"]["tag"];
  fontSize: number;
  fontWeight: NonNullable<PageBuilderNode["style"]["fontWeight"]>;
  textToken: NonNullable<PageBuilderNode["style"]["textToken"]>;
};

type EmbedPresetNodeInput = {
  id: string;
  parentId: string;
  name: string;
  provider: Extract<PageBuilderNode, { type: "embed" }>["content"]["provider"];
  url: string;
  height: number;
};

type ImagePresetNodeInput = {
  id: string;
  parentId: string;
  name: string;
  height: number;
  alt: string;
};

export const PAGE_BUILDER_PRESET_OPTIONS = [
  {
    value: "hero-intro",
    label: "Hero Section",
    description: "見出し、本文、CTA を持つ導入セクション",
  },
  {
    value: "photo-hero",
    label: "Photo Hero",
    description: "写真を主役にした導入セクション",
  },
  {
    value: "service-list",
    label: "Service List",
    description: "サービス説明用の縦積みカード",
  },
  {
    value: "amenity-grid",
    label: "Amenity Grid",
    description: "設備・備品をカード一覧で整理",
  },
  {
    value: "usage-steps",
    label: "Usage Steps",
    description: "予約から利用までの流れを3ステップで配置",
  },
  {
    value: "pricing-grid",
    label: "Pricing Grid",
    description: "料金プランを比較しやすいカードで配置",
  },
  {
    value: "access-map",
    label: "Access Map",
    description: "住所、最寄り案内、地図埋め込みを配置",
  },
  {
    value: "faq-list",
    label: "FAQ List",
    description: "よくある質問を短いQ&Aで整理",
  },
  {
    value: "reservation-cta",
    label: "Reservation CTA",
    description: "予約導線を強調する最終CTA",
  },
  {
    value: "contact-form",
    label: "Contact Form",
    description: "問い合わせフォーム付きセクション",
  },
] satisfies ReadonlyArray<PageBuilderPresetOption>;

function canContainPageBuilderChildren(node: PageBuilderNode): boolean {
  return (
    node.type === "root" ||
    node.type === "frame" ||
    node.type === "stack" ||
    node.type === "grid"
  );
}

function createDefaultPresetNodeId(
  type: PageBuilderNode["type"],
  role: string,
): string {
  return `${type}-${role}-${crypto.randomUUID()}`;
}

function createUniquePresetNodeId(
  document: PageBuilderDocument,
  type: PageBuilderNode["type"],
  role: string,
  createId: PageBuilderPresetNodeIdFactory,
): string {
  let candidate = createId(type, role);

  while (document.nodes[candidate]) {
    candidate = createId(type, role);
  }

  return candidate;
}

function createPresetLayout(
  width: PageBuilderNode["layout"]["base"]["width"],
  height: PageBuilderNode["layout"]["base"]["height"],
): PageBuilderNode["layout"] {
  return createPageBuilderResponsiveLayout(
    createPageBuilderLayoutBox({
      width,
      height,
    }),
  );
}

function createPresetTextNode({
  id,
  parentId,
  name,
  text,
  tag,
  fontSize,
  fontWeight,
  textToken,
}: TextPresetNodeInput): Extract<PageBuilderNode, { type: "text" }> {
  return {
    id,
    type: "text",
    parentId,
    children: [],
    locked: false,
    visibility: createPageBuilderResponsiveVisibility(),
    name,
    layoutMode: "stack",
    style: {
      textToken,
      fontSize,
      fontWeight,
      textAlign: "left",
    },
    layout: createPresetLayout("fill", "hug"),
    content: {
      text,
      tag,
    },
  };
}

function createPresetButtonNode(
  id: string,
  parentId: string,
  label: string,
  url: string,
): Extract<PageBuilderNode, { type: "button" }> {
  return {
    id,
    type: "button",
    parentId,
    children: [],
    locked: false,
    visibility: createPageBuilderResponsiveVisibility(),
    name: "Primary CTA",
    layoutMode: "stack",
    style: {},
    layout: createPageBuilderResponsiveLayout(
      createPageBuilderLayoutBox({
        width: 220,
        height: 48,
      }),
      {
        mobile: {
          width: "fill",
        },
      },
    ),
    content: {
      label,
      url,
      variant: "primary",
    },
  };
}

function createPresetEmbedNode({
  id,
  parentId,
  name,
  provider,
  url,
  height,
}: EmbedPresetNodeInput): Extract<PageBuilderNode, { type: "embed" }> {
  return {
    id,
    type: "embed",
    parentId,
    children: [],
    locked: false,
    visibility: createPageBuilderResponsiveVisibility(),
    name,
    layoutMode: "stack",
    style: {
      borderRadius: 20,
    },
    layout: createPresetLayout("fill", height),
    content: {
      provider,
      url,
    },
  };
}

function createPresetImageNode({
  id,
  parentId,
  name,
  height,
  alt,
}: ImagePresetNodeInput): Extract<PageBuilderNode, { type: "image" }> {
  return {
    id,
    type: "image",
    parentId,
    children: [],
    locked: false,
    visibility: createPageBuilderResponsiveVisibility(),
    name,
    layoutMode: "stack",
    style: {
      borderRadius: 24,
    },
    layout: createPageBuilderResponsiveLayout(
      createPageBuilderLayoutBox({
        width: "fill",
        height,
      }),
      {
        mobile: {
          height: Math.max(220, Math.round(height * 0.7)),
        },
      },
    ),
    content: {
      mediaId: null,
      alt,
      objectFit: "cover",
    },
  };
}

function createPresetFrameNode(
  id: string,
  parentId: string,
  name: string,
  children: string[],
  tone: "section" | "card",
): Extract<PageBuilderNode, { type: "frame" }> {
  return {
    id,
    type: "frame",
    parentId,
    children,
    locked: false,
    visibility: createPageBuilderResponsiveVisibility(),
    name,
    layoutMode: "stack",
    style:
      tone === "section"
        ? {
            backgroundToken: "card",
            borderToken: "border",
            borderWidth: 1,
            borderRadius: 28,
            padding: 40,
            gap: 18,
            direction: "column",
          }
        : {
            backgroundToken: "background",
            borderToken: "border",
            borderWidth: 1,
            borderRadius: 20,
            padding: 24,
            gap: 10,
            direction: "column",
          },
    layout: createPresetLayout("fill", "hug"),
    content: {},
  };
}

function createPresetGridNode(
  id: string,
  parentId: string,
  name: string,
  children: string[],
): Extract<PageBuilderNode, { type: "grid" }> {
  return {
    id,
    type: "grid",
    parentId,
    children,
    locked: false,
    visibility: createPageBuilderResponsiveVisibility(),
    name,
    layoutMode: "grid",
    style: {
      gap: 16,
      gridMinColumnWidth: 220,
    },
    layout: createPresetLayout("fill", "hug"),
    content: {},
  };
}

function createHeroIntroPreset(
  document: PageBuilderDocument,
  parentId: string,
  createId: PageBuilderPresetNodeIdFactory,
): PageBuilderPresetTree {
  const frameId = createUniquePresetNodeId(document, "frame", "hero", createId);
  const eyebrowId = createUniquePresetNodeId(
    document,
    "text",
    "hero-eyebrow",
    createId,
  );
  const titleId = createUniquePresetNodeId(
    document,
    "text",
    "hero-title",
    createId,
  );
  const bodyId = createUniquePresetNodeId(
    document,
    "text",
    "hero-body",
    createId,
  );
  const buttonId = createUniquePresetNodeId(
    document,
    "button",
    "hero-cta",
    createId,
  );

  return {
    rootId: frameId,
    nodes: [
      createPresetFrameNode(
        frameId,
        parentId,
        "Hero Section",
        [eyebrowId, titleId, bodyId, buttonId],
        "section",
      ),
      createPresetTextNode({
        id: eyebrowId,
        parentId: frameId,
        name: "Hero Eyebrow",
        text: "Rental Space",
        tag: "p",
        fontSize: 13,
        fontWeight: "700",
        textToken: "primary",
      }),
      createPresetTextNode({
        id: titleId,
        parentId: frameId,
        name: "Hero Title",
        text: "目的に合わせて、心地よく使える空間",
        tag: "h1",
        fontSize: 44,
        fontWeight: "700",
        textToken: "foreground",
      }),
      createPresetTextNode({
        id: bodyId,
        parentId: frameId,
        name: "Hero Lead",
        text: "撮影、イベント、ワークショップまで。予約しやすく、使いやすいレンタルスペースです。",
        tag: "p",
        fontSize: 17,
        fontWeight: "400",
        textToken: "muted-foreground",
      }),
      createPresetButtonNode(
        buttonId,
        frameId,
        "空き状況を確認",
        "/reservation",
      ),
    ],
  };
}

function createPhotoHeroPreset(
  document: PageBuilderDocument,
  parentId: string,
  createId: PageBuilderPresetNodeIdFactory,
): PageBuilderPresetTree {
  const frameId = createUniquePresetNodeId(
    document,
    "frame",
    "photo-hero",
    createId,
  );
  const gridId = createUniquePresetNodeId(
    document,
    "grid",
    "photo-hero-grid",
    createId,
  );
  const copyFrameId = createUniquePresetNodeId(
    document,
    "frame",
    "photo-hero-copy",
    createId,
  );
  const eyebrowId = createUniquePresetNodeId(
    document,
    "text",
    "photo-hero-eyebrow",
    createId,
  );
  const titleId = createUniquePresetNodeId(
    document,
    "text",
    "photo-hero-title",
    createId,
  );
  const bodyId = createUniquePresetNodeId(
    document,
    "text",
    "photo-hero-body",
    createId,
  );
  const buttonId = createUniquePresetNodeId(
    document,
    "button",
    "photo-hero-cta",
    createId,
  );
  const imageId = createUniquePresetNodeId(
    document,
    "image",
    "photo-hero-image",
    createId,
  );

  return {
    rootId: frameId,
    nodes: [
      createPresetFrameNode(
        frameId,
        parentId,
        "Photo Hero Section",
        [gridId],
        "section",
      ),
      createPresetGridNode(gridId, frameId, "Photo Hero Grid", [
        copyFrameId,
        imageId,
      ]),
      createPresetFrameNode(
        copyFrameId,
        gridId,
        "Hero Copy",
        [eyebrowId, titleId, bodyId, buttonId],
        "card",
      ),
      createPresetTextNode({
        id: eyebrowId,
        parentId: copyFrameId,
        name: "Hero Eyebrow",
        text: "Private rental space",
        tag: "p",
        fontSize: 13,
        fontWeight: "700",
        textToken: "primary",
      }),
      createPresetTextNode({
        id: titleId,
        parentId: copyFrameId,
        name: "Hero Title",
        text: "撮影もイベントも、自然体で過ごせる空間",
        tag: "h1",
        fontSize: 40,
        fontWeight: "700",
        textToken: "foreground",
      }),
      createPresetTextNode({
        id: bodyId,
        parentId: copyFrameId,
        name: "Hero Lead",
        text: "自然光、家具、余白のバランスを整えたレンタルスペースです。写真を差し替えて、空間の印象を強く伝えられます。",
        tag: "p",
        fontSize: 16,
        fontWeight: "400",
        textToken: "muted-foreground",
      }),
      createPresetButtonNode(
        buttonId,
        copyFrameId,
        "空き状況を見る",
        "/reservation",
      ),
      createPresetImageNode({
        id: imageId,
        parentId: gridId,
        name: "Hero Image",
        height: 420,
        alt: "レンタルスペースのメイン写真",
      }),
    ],
  };
}

function createServiceCardPresetNodes(
  document: PageBuilderDocument,
  parentId: string,
  createId: PageBuilderPresetNodeIdFactory,
): PageBuilderPresetTree {
  const frameId = createUniquePresetNodeId(
    document,
    "frame",
    "services",
    createId,
  );
  const titleId = createUniquePresetNodeId(
    document,
    "text",
    "services-title",
    createId,
  );
  const leadId = createUniquePresetNodeId(
    document,
    "text",
    "services-lead",
    createId,
  );
  const gridId = createUniquePresetNodeId(
    document,
    "grid",
    "services-grid",
    createId,
  );
  const cardOneId = createUniquePresetNodeId(
    document,
    "frame",
    "service-card",
    createId,
  );
  const cardOneTitleId = createUniquePresetNodeId(
    document,
    "text",
    "service-card-title",
    createId,
  );
  const cardOneBodyId = createUniquePresetNodeId(
    document,
    "text",
    "service-card-body",
    createId,
  );
  const cardTwoId = createUniquePresetNodeId(
    document,
    "frame",
    "service-card",
    createId,
  );
  const cardTwoTitleId = createUniquePresetNodeId(
    document,
    "text",
    "service-card-title",
    createId,
  );
  const cardTwoBodyId = createUniquePresetNodeId(
    document,
    "text",
    "service-card-body",
    createId,
  );
  const cardThreeId = createUniquePresetNodeId(
    document,
    "frame",
    "service-card",
    createId,
  );
  const cardThreeTitleId = createUniquePresetNodeId(
    document,
    "text",
    "service-card-title",
    createId,
  );
  const cardThreeBodyId = createUniquePresetNodeId(
    document,
    "text",
    "service-card-body",
    createId,
  );

  return {
    rootId: frameId,
    nodes: [
      createPresetFrameNode(
        frameId,
        parentId,
        "Service List",
        [titleId, leadId, gridId],
        "section",
      ),
      createPresetTextNode({
        id: titleId,
        parentId: frameId,
        name: "Service Title",
        text: "利用シーン",
        tag: "h2",
        fontSize: 32,
        fontWeight: "700",
        textToken: "foreground",
      }),
      createPresetTextNode({
        id: leadId,
        parentId: frameId,
        name: "Service Lead",
        text: "用途に合わせて、必要な情報を短く整理できます。",
        tag: "p",
        fontSize: 16,
        fontWeight: "400",
        textToken: "muted-foreground",
      }),
      createPresetGridNode(gridId, frameId, "Service Cards Grid", [
        cardOneId,
        cardTwoId,
        cardThreeId,
      ]),
      createPresetFrameNode(
        cardOneId,
        gridId,
        "Service Card",
        [cardOneTitleId, cardOneBodyId],
        "card",
      ),
      createPresetTextNode({
        id: cardOneTitleId,
        parentId: cardOneId,
        name: "Card Title",
        text: "撮影",
        tag: "h3",
        fontSize: 20,
        fontWeight: "700",
        textToken: "foreground",
      }),
      createPresetTextNode({
        id: cardOneBodyId,
        parentId: cardOneId,
        name: "Card Body",
        text: "自然光を活かした写真・動画撮影に対応できます。",
        tag: "p",
        fontSize: 15,
        fontWeight: "400",
        textToken: "muted-foreground",
      }),
      createPresetFrameNode(
        cardTwoId,
        gridId,
        "Service Card",
        [cardTwoTitleId, cardTwoBodyId],
        "card",
      ),
      createPresetTextNode({
        id: cardTwoTitleId,
        parentId: cardTwoId,
        name: "Card Title",
        text: "イベント",
        tag: "h3",
        fontSize: 20,
        fontWeight: "700",
        textToken: "foreground",
      }),
      createPresetTextNode({
        id: cardTwoBodyId,
        parentId: cardTwoId,
        name: "Card Body",
        text: "少人数の交流会、展示、ポップアップにも使えます。",
        tag: "p",
        fontSize: 15,
        fontWeight: "400",
        textToken: "muted-foreground",
      }),
      createPresetFrameNode(
        cardThreeId,
        gridId,
        "Service Card",
        [cardThreeTitleId, cardThreeBodyId],
        "card",
      ),
      createPresetTextNode({
        id: cardThreeTitleId,
        parentId: cardThreeId,
        name: "Card Title",
        text: "ワークショップ",
        tag: "h3",
        fontSize: 20,
        fontWeight: "700",
        textToken: "foreground",
      }),
      createPresetTextNode({
        id: cardThreeBodyId,
        parentId: cardThreeId,
        name: "Card Body",
        text: "テーブルを囲む講座や制作会に向いた構成です。",
        tag: "p",
        fontSize: 15,
        fontWeight: "400",
        textToken: "muted-foreground",
      }),
    ],
  };
}

function createAmenityGridPreset(
  document: PageBuilderDocument,
  parentId: string,
  createId: PageBuilderPresetNodeIdFactory,
): PageBuilderPresetTree {
  const frameId = createUniquePresetNodeId(
    document,
    "frame",
    "amenities",
    createId,
  );
  const titleId = createUniquePresetNodeId(
    document,
    "text",
    "amenities-title",
    createId,
  );
  const leadId = createUniquePresetNodeId(
    document,
    "text",
    "amenities-lead",
    createId,
  );
  const gridId = createUniquePresetNodeId(
    document,
    "grid",
    "amenities-grid",
    createId,
  );
  const cardOneId = createUniquePresetNodeId(
    document,
    "frame",
    "amenity-card",
    createId,
  );
  const cardOneTitleId = createUniquePresetNodeId(
    document,
    "text",
    "amenity-card-title",
    createId,
  );
  const cardOneBodyId = createUniquePresetNodeId(
    document,
    "text",
    "amenity-card-body",
    createId,
  );
  const cardTwoId = createUniquePresetNodeId(
    document,
    "frame",
    "amenity-card",
    createId,
  );
  const cardTwoTitleId = createUniquePresetNodeId(
    document,
    "text",
    "amenity-card-title",
    createId,
  );
  const cardTwoBodyId = createUniquePresetNodeId(
    document,
    "text",
    "amenity-card-body",
    createId,
  );
  const cardThreeId = createUniquePresetNodeId(
    document,
    "frame",
    "amenity-card",
    createId,
  );
  const cardThreeTitleId = createUniquePresetNodeId(
    document,
    "text",
    "amenity-card-title",
    createId,
  );
  const cardThreeBodyId = createUniquePresetNodeId(
    document,
    "text",
    "amenity-card-body",
    createId,
  );
  const cardFourId = createUniquePresetNodeId(
    document,
    "frame",
    "amenity-card",
    createId,
  );
  const cardFourTitleId = createUniquePresetNodeId(
    document,
    "text",
    "amenity-card-title",
    createId,
  );
  const cardFourBodyId = createUniquePresetNodeId(
    document,
    "text",
    "amenity-card-body",
    createId,
  );

  return {
    rootId: frameId,
    nodes: [
      createPresetFrameNode(
        frameId,
        parentId,
        "Amenity Section",
        [titleId, leadId, gridId],
        "section",
      ),
      createPresetTextNode({
        id: titleId,
        parentId: frameId,
        name: "Amenity Title",
        text: "設備・備品",
        tag: "h2",
        fontSize: 32,
        fontWeight: "700",
        textToken: "foreground",
      }),
      createPresetTextNode({
        id: leadId,
        parentId: frameId,
        name: "Amenity Lead",
        text: "利用前に確認したい設備情報を、一覧で分かりやすく整理できます。",
        tag: "p",
        fontSize: 16,
        fontWeight: "400",
        textToken: "muted-foreground",
      }),
      createPresetGridNode(gridId, frameId, "Amenity Grid", [
        cardOneId,
        cardTwoId,
        cardThreeId,
        cardFourId,
      ]),
      createPresetFrameNode(
        cardOneId,
        gridId,
        "Amenity Card",
        [cardOneTitleId, cardOneBodyId],
        "card",
      ),
      createPresetTextNode({
        id: cardOneTitleId,
        parentId: cardOneId,
        name: "Amenity Title",
        text: "Wi-Fi",
        tag: "h3",
        fontSize: 19,
        fontWeight: "700",
        textToken: "foreground",
      }),
      createPresetTextNode({
        id: cardOneBodyId,
        parentId: cardOneId,
        name: "Amenity Detail",
        text: "オンライン配信や作業に使える通信環境を用意しています。",
        tag: "p",
        fontSize: 14,
        fontWeight: "400",
        textToken: "muted-foreground",
      }),
      createPresetFrameNode(
        cardTwoId,
        gridId,
        "Amenity Card",
        [cardTwoTitleId, cardTwoBodyId],
        "card",
      ),
      createPresetTextNode({
        id: cardTwoTitleId,
        parentId: cardTwoId,
        name: "Amenity Title",
        text: "家具・テーブル",
        tag: "h3",
        fontSize: 19,
        fontWeight: "700",
        textToken: "foreground",
      }),
      createPresetTextNode({
        id: cardTwoBodyId,
        parentId: cardTwoId,
        name: "Amenity Detail",
        text: "撮影やワークショップに合わせてレイアウトを調整できます。",
        tag: "p",
        fontSize: 14,
        fontWeight: "400",
        textToken: "muted-foreground",
      }),
      createPresetFrameNode(
        cardThreeId,
        gridId,
        "Amenity Card",
        [cardThreeTitleId, cardThreeBodyId],
        "card",
      ),
      createPresetTextNode({
        id: cardThreeTitleId,
        parentId: cardThreeId,
        name: "Amenity Title",
        text: "撮影備品",
        tag: "h3",
        fontSize: 19,
        fontWeight: "700",
        textToken: "foreground",
      }),
      createPresetTextNode({
        id: cardThreeBodyId,
        parentId: cardThreeId,
        name: "Amenity Detail",
        text: "必要な備品は事前に確認し、持ち込み品と分けて案内できます。",
        tag: "p",
        fontSize: 14,
        fontWeight: "400",
        textToken: "muted-foreground",
      }),
      createPresetFrameNode(
        cardFourId,
        gridId,
        "Amenity Card",
        [cardFourTitleId, cardFourBodyId],
        "card",
      ),
      createPresetTextNode({
        id: cardFourTitleId,
        parentId: cardFourId,
        name: "Amenity Title",
        text: "水回り",
        tag: "h3",
        fontSize: 19,
        fontWeight: "700",
        textToken: "foreground",
      }),
      createPresetTextNode({
        id: cardFourBodyId,
        parentId: cardFourId,
        name: "Amenity Detail",
        text: "洗面・給湯など、利用時に必要な情報を掲載できます。",
        tag: "p",
        fontSize: 14,
        fontWeight: "400",
        textToken: "muted-foreground",
      }),
    ],
  };
}

function createUsageStepsPreset(
  document: PageBuilderDocument,
  parentId: string,
  createId: PageBuilderPresetNodeIdFactory,
): PageBuilderPresetTree {
  const frameId = createUniquePresetNodeId(
    document,
    "frame",
    "usage-steps",
    createId,
  );
  const titleId = createUniquePresetNodeId(
    document,
    "text",
    "usage-steps-title",
    createId,
  );
  const leadId = createUniquePresetNodeId(
    document,
    "text",
    "usage-steps-lead",
    createId,
  );
  const gridId = createUniquePresetNodeId(
    document,
    "grid",
    "usage-steps-grid",
    createId,
  );
  const stepOneId = createUniquePresetNodeId(
    document,
    "frame",
    "usage-step",
    createId,
  );
  const stepOneNumberId = createUniquePresetNodeId(
    document,
    "text",
    "usage-step-number",
    createId,
  );
  const stepOneTitleId = createUniquePresetNodeId(
    document,
    "text",
    "usage-step-title",
    createId,
  );
  const stepOneBodyId = createUniquePresetNodeId(
    document,
    "text",
    "usage-step-body",
    createId,
  );
  const stepTwoId = createUniquePresetNodeId(
    document,
    "frame",
    "usage-step",
    createId,
  );
  const stepTwoNumberId = createUniquePresetNodeId(
    document,
    "text",
    "usage-step-number",
    createId,
  );
  const stepTwoTitleId = createUniquePresetNodeId(
    document,
    "text",
    "usage-step-title",
    createId,
  );
  const stepTwoBodyId = createUniquePresetNodeId(
    document,
    "text",
    "usage-step-body",
    createId,
  );
  const stepThreeId = createUniquePresetNodeId(
    document,
    "frame",
    "usage-step",
    createId,
  );
  const stepThreeNumberId = createUniquePresetNodeId(
    document,
    "text",
    "usage-step-number",
    createId,
  );
  const stepThreeTitleId = createUniquePresetNodeId(
    document,
    "text",
    "usage-step-title",
    createId,
  );
  const stepThreeBodyId = createUniquePresetNodeId(
    document,
    "text",
    "usage-step-body",
    createId,
  );

  return {
    rootId: frameId,
    nodes: [
      createPresetFrameNode(
        frameId,
        parentId,
        "Usage Steps Section",
        [titleId, leadId, gridId],
        "section",
      ),
      createPresetTextNode({
        id: titleId,
        parentId: frameId,
        name: "Steps Title",
        text: "ご利用の流れ",
        tag: "h2",
        fontSize: 32,
        fontWeight: "700",
        textToken: "foreground",
      }),
      createPresetTextNode({
        id: leadId,
        parentId: frameId,
        name: "Steps Lead",
        text: "予約から当日の利用まで、必要な手順を簡潔に案内します。",
        tag: "p",
        fontSize: 16,
        fontWeight: "400",
        textToken: "muted-foreground",
      }),
      createPresetGridNode(gridId, frameId, "Usage Steps Grid", [
        stepOneId,
        stepTwoId,
        stepThreeId,
      ]),
      createPresetFrameNode(
        stepOneId,
        gridId,
        "Usage Step",
        [stepOneNumberId, stepOneTitleId, stepOneBodyId],
        "card",
      ),
      createPresetTextNode({
        id: stepOneNumberId,
        parentId: stepOneId,
        name: "Step Number",
        text: "01",
        tag: "p",
        fontSize: 13,
        fontWeight: "700",
        textToken: "primary",
      }),
      createPresetTextNode({
        id: stepOneTitleId,
        parentId: stepOneId,
        name: "Step Title",
        text: "空き状況を確認",
        tag: "h3",
        fontSize: 20,
        fontWeight: "700",
        textToken: "foreground",
      }),
      createPresetTextNode({
        id: stepOneBodyId,
        parentId: stepOneId,
        name: "Step Detail",
        text: "希望日時と利用目的を確認し、予約フォームへ進みます。",
        tag: "p",
        fontSize: 14,
        fontWeight: "400",
        textToken: "muted-foreground",
      }),
      createPresetFrameNode(
        stepTwoId,
        gridId,
        "Usage Step",
        [stepTwoNumberId, stepTwoTitleId, stepTwoBodyId],
        "card",
      ),
      createPresetTextNode({
        id: stepTwoNumberId,
        parentId: stepTwoId,
        name: "Step Number",
        text: "02",
        tag: "p",
        fontSize: 13,
        fontWeight: "700",
        textToken: "primary",
      }),
      createPresetTextNode({
        id: stepTwoTitleId,
        parentId: stepTwoId,
        name: "Step Title",
        text: "内容を送信",
        tag: "h3",
        fontSize: 20,
        fontWeight: "700",
        textToken: "foreground",
      }),
      createPresetTextNode({
        id: stepTwoBodyId,
        parentId: stepTwoId,
        name: "Step Detail",
        text: "人数、用途、必要設備を入力し、予約内容を送信します。",
        tag: "p",
        fontSize: 14,
        fontWeight: "400",
        textToken: "muted-foreground",
      }),
      createPresetFrameNode(
        stepThreeId,
        gridId,
        "Usage Step",
        [stepThreeNumberId, stepThreeTitleId, stepThreeBodyId],
        "card",
      ),
      createPresetTextNode({
        id: stepThreeNumberId,
        parentId: stepThreeId,
        name: "Step Number",
        text: "03",
        tag: "p",
        fontSize: 13,
        fontWeight: "700",
        textToken: "primary",
      }),
      createPresetTextNode({
        id: stepThreeTitleId,
        parentId: stepThreeId,
        name: "Step Title",
        text: "当日利用",
        tag: "h3",
        fontSize: 20,
        fontWeight: "700",
        textToken: "foreground",
      }),
      createPresetTextNode({
        id: stepThreeBodyId,
        parentId: stepThreeId,
        name: "Step Detail",
        text: "案内に沿って入室し、終了時間までに原状回復をお願いします。",
        tag: "p",
        fontSize: 14,
        fontWeight: "400",
        textToken: "muted-foreground",
      }),
    ],
  };
}

function createPricingGridPreset(
  document: PageBuilderDocument,
  parentId: string,
  createId: PageBuilderPresetNodeIdFactory,
): PageBuilderPresetTree {
  const frameId = createUniquePresetNodeId(
    document,
    "frame",
    "pricing",
    createId,
  );
  const titleId = createUniquePresetNodeId(
    document,
    "text",
    "pricing-title",
    createId,
  );
  const leadId = createUniquePresetNodeId(
    document,
    "text",
    "pricing-lead",
    createId,
  );
  const gridId = createUniquePresetNodeId(
    document,
    "grid",
    "pricing-grid",
    createId,
  );
  const cardOneId = createUniquePresetNodeId(
    document,
    "frame",
    "pricing-card",
    createId,
  );
  const cardOneTitleId = createUniquePresetNodeId(
    document,
    "text",
    "pricing-card-title",
    createId,
  );
  const cardOnePriceId = createUniquePresetNodeId(
    document,
    "text",
    "pricing-card-price",
    createId,
  );
  const cardOneBodyId = createUniquePresetNodeId(
    document,
    "text",
    "pricing-card-body",
    createId,
  );
  const cardTwoId = createUniquePresetNodeId(
    document,
    "frame",
    "pricing-card",
    createId,
  );
  const cardTwoTitleId = createUniquePresetNodeId(
    document,
    "text",
    "pricing-card-title",
    createId,
  );
  const cardTwoPriceId = createUniquePresetNodeId(
    document,
    "text",
    "pricing-card-price",
    createId,
  );
  const cardTwoBodyId = createUniquePresetNodeId(
    document,
    "text",
    "pricing-card-body",
    createId,
  );
  const cardThreeId = createUniquePresetNodeId(
    document,
    "frame",
    "pricing-card",
    createId,
  );
  const cardThreeTitleId = createUniquePresetNodeId(
    document,
    "text",
    "pricing-card-title",
    createId,
  );
  const cardThreePriceId = createUniquePresetNodeId(
    document,
    "text",
    "pricing-card-price",
    createId,
  );
  const cardThreeBodyId = createUniquePresetNodeId(
    document,
    "text",
    "pricing-card-body",
    createId,
  );

  return {
    rootId: frameId,
    nodes: [
      createPresetFrameNode(
        frameId,
        parentId,
        "Pricing Section",
        [titleId, leadId, gridId],
        "section",
      ),
      createPresetTextNode({
        id: titleId,
        parentId: frameId,
        name: "Pricing Title",
        text: "料金プラン",
        tag: "h2",
        fontSize: 32,
        fontWeight: "700",
        textToken: "foreground",
      }),
      createPresetTextNode({
        id: leadId,
        parentId: frameId,
        name: "Pricing Lead",
        text: "利用時間や目的に合わせて、分かりやすく料金を比較できます。",
        tag: "p",
        fontSize: 16,
        fontWeight: "400",
        textToken: "muted-foreground",
      }),
      createPresetGridNode(gridId, frameId, "Pricing Cards Grid", [
        cardOneId,
        cardTwoId,
        cardThreeId,
      ]),
      createPresetFrameNode(
        cardOneId,
        gridId,
        "Pricing Card",
        [cardOneTitleId, cardOnePriceId, cardOneBodyId],
        "card",
      ),
      createPresetTextNode({
        id: cardOneTitleId,
        parentId: cardOneId,
        name: "Plan Name",
        text: "ライト利用",
        tag: "h3",
        fontSize: 19,
        fontWeight: "700",
        textToken: "foreground",
      }),
      createPresetTextNode({
        id: cardOnePriceId,
        parentId: cardOneId,
        name: "Plan Price",
        text: "¥3,300 / 時間",
        tag: "p",
        fontSize: 26,
        fontWeight: "700",
        textToken: "primary",
      }),
      createPresetTextNode({
        id: cardOneBodyId,
        parentId: cardOneId,
        name: "Plan Detail",
        text: "少人数の打ち合わせや短時間の撮影に向いた基本プランです。",
        tag: "p",
        fontSize: 14,
        fontWeight: "400",
        textToken: "muted-foreground",
      }),
      createPresetFrameNode(
        cardTwoId,
        gridId,
        "Pricing Card",
        [cardTwoTitleId, cardTwoPriceId, cardTwoBodyId],
        "card",
      ),
      createPresetTextNode({
        id: cardTwoTitleId,
        parentId: cardTwoId,
        name: "Plan Name",
        text: "半日利用",
        tag: "h3",
        fontSize: 19,
        fontWeight: "700",
        textToken: "foreground",
      }),
      createPresetTextNode({
        id: cardTwoPriceId,
        parentId: cardTwoId,
        name: "Plan Price",
        text: "¥16,500 / 5時間",
        tag: "p",
        fontSize: 26,
        fontWeight: "700",
        textToken: "primary",
      }),
      createPresetTextNode({
        id: cardTwoBodyId,
        parentId: cardTwoId,
        name: "Plan Detail",
        text: "ワークショップやイベント準備を含む利用におすすめです。",
        tag: "p",
        fontSize: 14,
        fontWeight: "400",
        textToken: "muted-foreground",
      }),
      createPresetFrameNode(
        cardThreeId,
        gridId,
        "Pricing Card",
        [cardThreeTitleId, cardThreePriceId, cardThreeBodyId],
        "card",
      ),
      createPresetTextNode({
        id: cardThreeTitleId,
        parentId: cardThreeId,
        name: "Plan Name",
        text: "1日貸切",
        tag: "h3",
        fontSize: 19,
        fontWeight: "700",
        textToken: "foreground",
      }),
      createPresetTextNode({
        id: cardThreePriceId,
        parentId: cardThreeId,
        name: "Plan Price",
        text: "¥29,700 / 日",
        tag: "p",
        fontSize: 26,
        fontWeight: "700",
        textToken: "primary",
      }),
      createPresetTextNode({
        id: cardThreeBodyId,
        parentId: cardThreeId,
        name: "Plan Detail",
        text: "展示、ポップアップ、長時間撮影などに使いやすい貸切プランです。",
        tag: "p",
        fontSize: 14,
        fontWeight: "400",
        textToken: "muted-foreground",
      }),
    ],
  };
}

function createAccessMapPreset(
  document: PageBuilderDocument,
  parentId: string,
  createId: PageBuilderPresetNodeIdFactory,
): PageBuilderPresetTree {
  const frameId = createUniquePresetNodeId(
    document,
    "frame",
    "access",
    createId,
  );
  const titleId = createUniquePresetNodeId(
    document,
    "text",
    "access-title",
    createId,
  );
  const leadId = createUniquePresetNodeId(
    document,
    "text",
    "access-lead",
    createId,
  );
  const gridId = createUniquePresetNodeId(
    document,
    "grid",
    "access-grid",
    createId,
  );
  const infoFrameId = createUniquePresetNodeId(
    document,
    "frame",
    "access-info",
    createId,
  );
  const addressTitleId = createUniquePresetNodeId(
    document,
    "text",
    "access-address-title",
    createId,
  );
  const addressBodyId = createUniquePresetNodeId(
    document,
    "text",
    "access-address-body",
    createId,
  );
  const transitTitleId = createUniquePresetNodeId(
    document,
    "text",
    "access-transit-title",
    createId,
  );
  const transitBodyId = createUniquePresetNodeId(
    document,
    "text",
    "access-transit-body",
    createId,
  );
  const buttonId = createUniquePresetNodeId(
    document,
    "button",
    "access-cta",
    createId,
  );
  const mapId = createUniquePresetNodeId(
    document,
    "embed",
    "access-map",
    createId,
  );

  return {
    rootId: frameId,
    nodes: [
      createPresetFrameNode(
        frameId,
        parentId,
        "Access Section",
        [titleId, leadId, gridId],
        "section",
      ),
      createPresetTextNode({
        id: titleId,
        parentId: frameId,
        name: "Access Title",
        text: "アクセス",
        tag: "h2",
        fontSize: 32,
        fontWeight: "700",
        textToken: "foreground",
      }),
      createPresetTextNode({
        id: leadId,
        parentId: frameId,
        name: "Access Lead",
        text: "初めての方にも迷わず来ていただけるよう、住所と最寄り案内を整理します。",
        tag: "p",
        fontSize: 16,
        fontWeight: "400",
        textToken: "muted-foreground",
      }),
      createPresetGridNode(gridId, frameId, "Access Grid", [
        infoFrameId,
        mapId,
      ]),
      createPresetFrameNode(
        infoFrameId,
        gridId,
        "Access Info",
        [
          addressTitleId,
          addressBodyId,
          transitTitleId,
          transitBodyId,
          buttonId,
        ],
        "card",
      ),
      createPresetTextNode({
        id: addressTitleId,
        parentId: infoFrameId,
        name: "Address Label",
        text: "所在地",
        tag: "h3",
        fontSize: 18,
        fontWeight: "700",
        textToken: "foreground",
      }),
      createPresetTextNode({
        id: addressBodyId,
        parentId: infoFrameId,
        name: "Address Text",
        text: "〒000-0000 東京都〇〇区〇〇 1-2-3",
        tag: "p",
        fontSize: 15,
        fontWeight: "400",
        textToken: "muted-foreground",
      }),
      createPresetTextNode({
        id: transitTitleId,
        parentId: infoFrameId,
        name: "Transit Label",
        text: "最寄り",
        tag: "h3",
        fontSize: 18,
        fontWeight: "700",
        textToken: "foreground",
      }),
      createPresetTextNode({
        id: transitBodyId,
        parentId: infoFrameId,
        name: "Transit Text",
        text: "〇〇駅から徒歩5分。近隣コインパーキングも利用できます。",
        tag: "p",
        fontSize: 15,
        fontWeight: "400",
        textToken: "muted-foreground",
      }),
      createPresetButtonNode(
        buttonId,
        infoFrameId,
        "アクセス詳細を見る",
        "/access",
      ),
      createPresetEmbedNode({
        id: mapId,
        parentId: gridId,
        name: "Google Map",
        provider: "google-maps",
        url: "https://www.google.com/maps/embed",
        height: 360,
      }),
    ],
  };
}

function createFaqListPreset(
  document: PageBuilderDocument,
  parentId: string,
  createId: PageBuilderPresetNodeIdFactory,
): PageBuilderPresetTree {
  const frameId = createUniquePresetNodeId(document, "frame", "faq", createId);
  const titleId = createUniquePresetNodeId(
    document,
    "text",
    "faq-title",
    createId,
  );
  const leadId = createUniquePresetNodeId(
    document,
    "text",
    "faq-lead",
    createId,
  );
  const itemOneId = createUniquePresetNodeId(
    document,
    "frame",
    "faq-item",
    createId,
  );
  const itemOneQuestionId = createUniquePresetNodeId(
    document,
    "text",
    "faq-question",
    createId,
  );
  const itemOneAnswerId = createUniquePresetNodeId(
    document,
    "text",
    "faq-answer",
    createId,
  );
  const itemTwoId = createUniquePresetNodeId(
    document,
    "frame",
    "faq-item",
    createId,
  );
  const itemTwoQuestionId = createUniquePresetNodeId(
    document,
    "text",
    "faq-question",
    createId,
  );
  const itemTwoAnswerId = createUniquePresetNodeId(
    document,
    "text",
    "faq-answer",
    createId,
  );
  const itemThreeId = createUniquePresetNodeId(
    document,
    "frame",
    "faq-item",
    createId,
  );
  const itemThreeQuestionId = createUniquePresetNodeId(
    document,
    "text",
    "faq-question",
    createId,
  );
  const itemThreeAnswerId = createUniquePresetNodeId(
    document,
    "text",
    "faq-answer",
    createId,
  );

  return {
    rootId: frameId,
    nodes: [
      createPresetFrameNode(
        frameId,
        parentId,
        "FAQ Section",
        [titleId, leadId, itemOneId, itemTwoId, itemThreeId],
        "section",
      ),
      createPresetTextNode({
        id: titleId,
        parentId: frameId,
        name: "FAQ Title",
        text: "よくある質問",
        tag: "h2",
        fontSize: 32,
        fontWeight: "700",
        textToken: "foreground",
      }),
      createPresetTextNode({
        id: leadId,
        parentId: frameId,
        name: "FAQ Lead",
        text: "予約前に確認されやすい内容を、短く分かりやすく掲載します。",
        tag: "p",
        fontSize: 16,
        fontWeight: "400",
        textToken: "muted-foreground",
      }),
      createPresetFrameNode(
        itemOneId,
        frameId,
        "FAQ Item",
        [itemOneQuestionId, itemOneAnswerId],
        "card",
      ),
      createPresetTextNode({
        id: itemOneQuestionId,
        parentId: itemOneId,
        name: "Question",
        text: "Q. 何日前まで予約できますか？",
        tag: "h3",
        fontSize: 18,
        fontWeight: "700",
        textToken: "foreground",
      }),
      createPresetTextNode({
        id: itemOneAnswerId,
        parentId: itemOneId,
        name: "Answer",
        text: "空きがあれば当日予約も可能です。利用内容によって確認が必要な場合があります。",
        tag: "p",
        fontSize: 15,
        fontWeight: "400",
        textToken: "muted-foreground",
      }),
      createPresetFrameNode(
        itemTwoId,
        frameId,
        "FAQ Item",
        [itemTwoQuestionId, itemTwoAnswerId],
        "card",
      ),
      createPresetTextNode({
        id: itemTwoQuestionId,
        parentId: itemTwoId,
        name: "Question",
        text: "Q. 飲食物の持ち込みはできますか？",
        tag: "h3",
        fontSize: 18,
        fontWeight: "700",
        textToken: "foreground",
      }),
      createPresetTextNode({
        id: itemTwoAnswerId,
        parentId: itemTwoId,
        name: "Answer",
        text: "軽食や飲み物は持ち込み可能です。においの強い調理は事前にご相談ください。",
        tag: "p",
        fontSize: 15,
        fontWeight: "400",
        textToken: "muted-foreground",
      }),
      createPresetFrameNode(
        itemThreeId,
        frameId,
        "FAQ Item",
        [itemThreeQuestionId, itemThreeAnswerId],
        "card",
      ),
      createPresetTextNode({
        id: itemThreeQuestionId,
        parentId: itemThreeId,
        name: "Question",
        text: "Q. 下見はできますか？",
        tag: "h3",
        fontSize: 18,
        fontWeight: "700",
        textToken: "foreground",
      }),
      createPresetTextNode({
        id: itemThreeAnswerId,
        parentId: itemThreeId,
        name: "Answer",
        text: "事前予約制で内覧を受け付けています。希望日時をお問い合わせください。",
        tag: "p",
        fontSize: 15,
        fontWeight: "400",
        textToken: "muted-foreground",
      }),
    ],
  };
}

function createReservationCtaPreset(
  document: PageBuilderDocument,
  parentId: string,
  createId: PageBuilderPresetNodeIdFactory,
): PageBuilderPresetTree {
  const frameId = createUniquePresetNodeId(
    document,
    "frame",
    "reservation",
    createId,
  );
  const eyebrowId = createUniquePresetNodeId(
    document,
    "text",
    "reservation-eyebrow",
    createId,
  );
  const titleId = createUniquePresetNodeId(
    document,
    "text",
    "reservation-title",
    createId,
  );
  const leadId = createUniquePresetNodeId(
    document,
    "text",
    "reservation-lead",
    createId,
  );
  const buttonId = createUniquePresetNodeId(
    document,
    "button",
    "reservation-cta",
    createId,
  );

  return {
    rootId: frameId,
    nodes: [
      createPresetFrameNode(
        frameId,
        parentId,
        "Reservation CTA",
        [eyebrowId, titleId, leadId, buttonId],
        "section",
      ),
      createPresetTextNode({
        id: eyebrowId,
        parentId: frameId,
        name: "CTA Eyebrow",
        text: "Ready to book",
        tag: "p",
        fontSize: 13,
        fontWeight: "700",
        textToken: "primary",
      }),
      createPresetTextNode({
        id: titleId,
        parentId: frameId,
        name: "CTA Title",
        text: "希望日時が決まったら、空き状況を確認できます",
        tag: "h2",
        fontSize: 34,
        fontWeight: "700",
        textToken: "foreground",
      }),
      createPresetTextNode({
        id: leadId,
        parentId: frameId,
        name: "CTA Lead",
        text: "利用目的や人数が未定でも、まずは候補日から確認できます。",
        tag: "p",
        fontSize: 16,
        fontWeight: "400",
        textToken: "muted-foreground",
      }),
      createPresetButtonNode(
        buttonId,
        frameId,
        "空き状況を確認する",
        "/reservation",
      ),
    ],
  };
}

function createContactFormPreset(
  document: PageBuilderDocument,
  parentId: string,
  createId: PageBuilderPresetNodeIdFactory,
): PageBuilderPresetTree {
  const frameId = createUniquePresetNodeId(
    document,
    "frame",
    "contact",
    createId,
  );
  const titleId = createUniquePresetNodeId(
    document,
    "text",
    "contact-title",
    createId,
  );
  const leadId = createUniquePresetNodeId(
    document,
    "text",
    "contact-lead",
    createId,
  );
  const formId = createUniquePresetNodeId(
    document,
    "form",
    "contact-form",
    createId,
  );

  return {
    rootId: frameId,
    nodes: [
      createPresetFrameNode(
        frameId,
        parentId,
        "Contact Section",
        [titleId, leadId, formId],
        "section",
      ),
      createPresetTextNode({
        id: titleId,
        parentId: frameId,
        name: "Contact Title",
        text: "お問い合わせ",
        tag: "h2",
        fontSize: 32,
        fontWeight: "700",
        textToken: "foreground",
      }),
      createPresetTextNode({
        id: leadId,
        parentId: frameId,
        name: "Contact Lead",
        text: "利用目的や希望日時が決まっていない段階でも、お気軽にご相談ください。",
        tag: "p",
        fontSize: 16,
        fontWeight: "400",
        textToken: "muted-foreground",
      }),
      {
        id: formId,
        type: "form",
        parentId: frameId,
        children: [],
        locked: false,
        visibility: createPageBuilderResponsiveVisibility(),
        name: "Contact Form",
        layoutMode: "stack",
        style: {},
        layout: createPresetLayout("fill", "hug"),
        content: {
          kind: "contact",
          title: "問い合わせ内容",
          description: "内容を確認し、担当者よりご連絡します。",
        },
      },
    ],
  };
}

function createPresetTree(
  document: PageBuilderDocument,
  type: PageBuilderPresetType,
  parentId: string,
  createId: PageBuilderPresetNodeIdFactory,
): PageBuilderPresetTree {
  if (type === "hero-intro") {
    return createHeroIntroPreset(document, parentId, createId);
  }

  if (type === "photo-hero") {
    return createPhotoHeroPreset(document, parentId, createId);
  }

  if (type === "service-list") {
    return createServiceCardPresetNodes(document, parentId, createId);
  }

  if (type === "amenity-grid") {
    return createAmenityGridPreset(document, parentId, createId);
  }

  if (type === "usage-steps") {
    return createUsageStepsPreset(document, parentId, createId);
  }

  if (type === "pricing-grid") {
    return createPricingGridPreset(document, parentId, createId);
  }

  if (type === "access-map") {
    return createAccessMapPreset(document, parentId, createId);
  }

  if (type === "faq-list") {
    return createFaqListPreset(document, parentId, createId);
  }

  if (type === "reservation-cta") {
    return createReservationCtaPreset(document, parentId, createId);
  }

  return createContactFormPreset(document, parentId, createId);
}

export function insertPageBuilderPreset(
  document: PageBuilderDocument,
  type: PageBuilderPresetType,
  parentId: string,
  createId: PageBuilderPresetNodeIdFactory = createDefaultPresetNodeId,
): string | null {
  const parent = document.nodes[parentId];
  if (!parent || !canContainPageBuilderChildren(parent)) {
    return null;
  }

  const preset = createPresetTree(document, type, parentId, createId);

  for (const node of preset.nodes) {
    document.nodes[node.id] = node;
  }

  parent.children.push(preset.rootId);
  return preset.rootId;
}
