import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { FreeformPageRenderer } from "@/shared/page-builder/renderer/FreeformPageRenderer";
import { createDefaultPageBuilderDocument } from "@/shared/lib/page-builder/default-document";
import {
  createPageBuilderLayoutBox,
  createPageBuilderResponsiveLayout,
} from "@/shared/lib/page-builder/layout";
import type { PageBuilderNode } from "@/shared/lib/page-builder/schema";
import { createPageBuilderResponsiveVisibility } from "@/shared/lib/page-builder/visibility";

describe("FreeformPageRenderer", () => {
  test("grid node は CSS grid と自動列幅で描画される", () => {
    const document = createDefaultPageBuilderDocument("テスト");

    const gridNode: PageBuilderNode = {
      id: "grid-main",
      type: "grid",
      parentId: "root",
      children: ["text-grid-one", "text-grid-two"],
      locked: false,
      visibility: createPageBuilderResponsiveVisibility(),
      name: "Feature Grid",
      layoutMode: "grid",
      style: {
        gap: 24,
        gridMinColumnWidth: 280,
      },
      layout: createPageBuilderResponsiveLayout(
        createPageBuilderLayoutBox({
          width: "fill",
          height: "hug",
        }),
      ),
      content: {},
    };

    const firstTextNode: PageBuilderNode = {
      id: "text-grid-one",
      type: "text",
      parentId: "grid-main",
      children: [],
      locked: false,
      visibility: createPageBuilderResponsiveVisibility(),
      name: "Feature One",
      layoutMode: "stack",
      style: {
        textToken: "foreground",
      },
      layout: createPageBuilderResponsiveLayout(
        createPageBuilderLayoutBox({
          width: "fill",
          height: "hug",
        }),
      ),
      content: {
        text: "撮影利用",
        tag: "h3",
      },
    };

    const secondTextNode: PageBuilderNode = {
      id: "text-grid-two",
      type: "text",
      parentId: "grid-main",
      children: [],
      locked: false,
      visibility: createPageBuilderResponsiveVisibility(),
      name: "Feature Two",
      layoutMode: "stack",
      style: {
        textToken: "muted-foreground",
      },
      layout: createPageBuilderResponsiveLayout(
        createPageBuilderLayoutBox({
          width: "fill",
          height: "hug",
        }),
      ),
      content: {
        text: "ワークショップ利用",
        tag: "p",
      },
    };

    const rootNode = document.nodes[document.rootId];
    if (!rootNode) {
      throw new Error("root node is missing");
    }

    rootNode.children = ["grid-main"];
    document.nodes["grid-main"] = gridNode;
    document.nodes["text-grid-one"] = firstTextNode;
    document.nodes["text-grid-two"] = secondTextNode;

    const markup = renderToStaticMarkup(
      <FreeformPageRenderer document={document} />,
    );

    expect(markup).toContain("display:grid");
    expect(markup).toContain("grid-template-columns");
    expect(markup).toContain("280px");
    expect(markup).toContain("撮影利用");
    expect(markup).toContain("ワークショップ利用");
  });

  test("image node は fixed wrapper + next/image fill で描画される", () => {
    const document = createDefaultPageBuilderDocument("テスト");

    const imageNode: PageBuilderNode = {
      id: "image-main",
      type: "image",
      parentId: "root",
      children: [],
      locked: false,
      visibility: createPageBuilderResponsiveVisibility(),
      name: "Hero Image",
      layoutMode: "stack",
      style: {
        borderRadius: 16,
      },
      layout: createPageBuilderResponsiveLayout(
        createPageBuilderLayoutBox({
          width: "fill",
          height: 320,
        }),
      ),
      content: {
        mediaId: "media-hero",
        alt: "Hero image",
        objectFit: "cover",
      },
    };

    const rootNode = document.nodes[document.rootId];
    if (!rootNode) {
      throw new Error("root node is missing");
    }

    rootNode.children = ["image-main"];
    document.nodes["image-main"] = imageNode;

    const markup = renderToStaticMarkup(
      <FreeformPageRenderer
        document={document}
        media={{
          "media-hero": {
            id: "media-hero",
            url: "/images/seed/page-about-hero.svg",
            alt: "Hero image fallback",
            filename: "page-about-hero.svg",
            width: 1200,
            height: 720,
          },
        }}
      />,
    );

    expect(markup).toContain('data-page-builder-node-id="image-main"');
    expect(markup).toContain('data-nimg="fill"');
    expect(markup).toContain("object-fit:cover");
    expect(markup).not.toContain('width="1200"');
    expect(markup).not.toContain('height="720"');
  });

  test("builder の選択装飾を shared renderer の node markup に混ぜない", () => {
    const document = createDefaultPageBuilderDocument("テスト");

    const textNode: PageBuilderNode = {
      id: "text-main",
      type: "text",
      parentId: "root",
      children: [],
      locked: false,
      visibility: createPageBuilderResponsiveVisibility(),
      name: "Main Text",
      layoutMode: "stack",
      style: {
        textToken: "foreground",
      },
      layout: createPageBuilderResponsiveLayout(
        createPageBuilderLayoutBox({
          width: "fill",
          height: "hug",
        }),
      ),
      content: {
        text: "選択中のテキスト",
        tag: "p",
      },
    };

    const rootNode = document.nodes[document.rootId];
    if (!rootNode) {
      throw new Error("root node is missing");
    }

    rootNode.children = ["text-main"];
    document.nodes["text-main"] = textNode;

    const markup = renderToStaticMarkup(
      <FreeformPageRenderer
        document={document}
        selectedNodeId="text-main"
        selectedNodeIds={["text-main"]}
        onNodeSelect={() => {}}
      />,
    );

    expect(markup).toContain('data-page-builder-node-id="text-main"');
    expect(markup).not.toContain("ring-");
    expect(markup).not.toContain("hover:ring");
    expect(markup).not.toContain("transition-shadow");
  });

  test("renderer は document 外の viewport padding wrapper を挿入しない", () => {
    const document = createDefaultPageBuilderDocument("テスト");

    const markup = renderToStaticMarkup(
      <FreeformPageRenderer document={document} />,
    );

    expect(markup).not.toContain("min-h-screen");
    expect(markup).not.toContain("w-full px-4 py-10");
    expect(markup).not.toContain("sm:px-6 lg:px-8");
  });
});
