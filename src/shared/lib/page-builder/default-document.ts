import type { PageBuilderDocument } from "./schema";
import {
  createPageBuilderLayoutBox,
  createPageBuilderResponsiveLayout,
} from "./layout";
import { createPageBuilderResponsiveVisibility } from "./visibility";

const DEFAULT_ROOT_ID = "root";
const DEFAULT_FRAME_ID = "frame-main";
const DEFAULT_TITLE_ID = "text-title";
const DEFAULT_BODY_ID = "text-body";
const DEFAULT_BUTTON_ID = "button-primary";

export function createDefaultPageBuilderDocument(
  title: string,
): PageBuilderDocument {
  return {
    schemaVersion: 4,
    rootId: DEFAULT_ROOT_ID,
    nodes: {
      [DEFAULT_ROOT_ID]: {
        id: DEFAULT_ROOT_ID,
        type: "root",
        parentId: null,
        children: [DEFAULT_FRAME_ID],
        locked: false,
        visibility: createPageBuilderResponsiveVisibility(),
        name: "Root",
        layoutMode: "stack",
        style: {
          direction: "column",
          gap: 32,
        },
        layout: createPageBuilderResponsiveLayout(
          createPageBuilderLayoutBox({
            width: "fill",
            height: "hug",
          }),
        ),
        content: {},
      },
      [DEFAULT_FRAME_ID]: {
        id: DEFAULT_FRAME_ID,
        type: "frame",
        parentId: DEFAULT_ROOT_ID,
        children: [DEFAULT_TITLE_ID, DEFAULT_BODY_ID, DEFAULT_BUTTON_ID],
        locked: false,
        visibility: createPageBuilderResponsiveVisibility(),
        name: "Hero Frame",
        layoutMode: "stack",
        style: {
          backgroundToken: "card",
          borderToken: "border",
          borderWidth: 1,
          borderRadius: 24,
          padding: 40,
          gap: 16,
          direction: "column",
        },
        layout: createPageBuilderResponsiveLayout(
          createPageBuilderLayoutBox({
            width: "fill",
            height: "hug",
          }),
        ),
        content: {},
      },
      [DEFAULT_TITLE_ID]: {
        id: DEFAULT_TITLE_ID,
        type: "text",
        parentId: DEFAULT_FRAME_ID,
        children: [],
        locked: false,
        visibility: createPageBuilderResponsiveVisibility(),
        name: "Page Title",
        layoutMode: "stack",
        style: {
          textToken: "foreground",
          fontSize: 40,
          fontWeight: "700",
          textAlign: "left",
        },
        layout: createPageBuilderResponsiveLayout(
          createPageBuilderLayoutBox({
            width: "fill",
            height: "hug",
          }),
        ),
        content: {
          text: title,
          tag: "h1",
        },
      },
      [DEFAULT_BODY_ID]: {
        id: DEFAULT_BODY_ID,
        type: "text",
        parentId: DEFAULT_FRAME_ID,
        children: [],
        locked: false,
        visibility: createPageBuilderResponsiveVisibility(),
        name: "Intro Text",
        layoutMode: "stack",
        style: {
          textToken: "muted-foreground",
          fontSize: 16,
          fontWeight: "400",
          textAlign: "left",
        },
        layout: createPageBuilderResponsiveLayout(
          createPageBuilderLayoutBox({
            width: "fill",
            height: "hug",
          }),
        ),
        content: {
          text: "このページは freeform builder で編集できます。",
          tag: "p",
        },
      },
      [DEFAULT_BUTTON_ID]: {
        id: DEFAULT_BUTTON_ID,
        type: "button",
        parentId: DEFAULT_FRAME_ID,
        children: [],
        locked: false,
        visibility: createPageBuilderResponsiveVisibility(),
        name: "Primary Button",
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
          label: "お問い合わせ",
          url: "/contact",
          variant: "primary",
        },
      },
    },
    breakpoints: {
      desktop: { width: 1280, label: "Desktop" },
      tablet: { width: 768, label: "Tablet" },
      mobile: { width: 390, label: "Mobile" },
    },
    canvas: {
      width: "boxed",
      backgroundToken: "background",
    },
  };
}
