import { z } from "zod";
import { DomainError } from "@/shared/domain/domain-error";
import {
  getPageBuilderEmbedValidationMessage,
  normalizePageBuilderEmbedUrl,
  pageBuilderButtonUrlSchema,
  pageBuilderEmbedProviderSchema,
} from "./urls";

export const pageBuilderBreakpointSchema = z.enum([
  "desktop",
  "tablet",
  "mobile",
]);

export type PageBuilderBreakpoint = z.infer<typeof pageBuilderBreakpointSchema>;

const sizeModeSchema = z.union([
  z.number().int().min(1).max(4000),
  z.enum(["hug", "fill"]),
]);

const colorTokenSchema = z.enum([
  "background",
  "foreground",
  "muted",
  "muted-foreground",
  "card",
  "border",
  "primary",
  "primary-foreground",
  "accent",
]);

const alignmentSchema = z.enum(["start", "center", "end", "stretch"]);
const justifySchema = z.enum(["start", "center", "end", "space-between"]);

export const pageBuilderLayoutBoxSchema = z.object({
  x: z.number().int().min(-4000).max(4000),
  y: z.number().int().min(-4000).max(4000),
  width: sizeModeSchema,
  height: sizeModeSchema,
  rotate: z.number().min(-360).max(360).default(0),
  zIndex: z.number().int().min(0).max(999).default(0),
});

export const pageBuilderLayoutOverrideSchema = z.object({
  x: z.number().int().min(-4000).max(4000).optional(),
  y: z.number().int().min(-4000).max(4000).optional(),
  width: sizeModeSchema.optional(),
  height: sizeModeSchema.optional(),
  rotate: z.number().min(-360).max(360).optional(),
  zIndex: z.number().int().min(0).max(999).optional(),
});

export const pageBuilderResponsiveLayoutSchema = z.object({
  base: pageBuilderLayoutBoxSchema,
  overrides: z
    .object({
      tablet: pageBuilderLayoutOverrideSchema.optional(),
      mobile: pageBuilderLayoutOverrideSchema.optional(),
    })
    .default({}),
});

export const pageBuilderResponsiveVisibilitySchema = z.object({
  base: z.boolean().default(false),
  overrides: z
    .object({
      tablet: z.boolean().optional(),
      mobile: z.boolean().optional(),
    })
    .default({}),
});

export const pageBuilderNodeStyleSchema = z.object({
  backgroundToken: colorTokenSchema.optional(),
  textToken: colorTokenSchema.optional(),
  borderToken: colorTokenSchema.optional(),
  opacity: z.number().min(0).max(1).optional(),
  padding: z.number().int().min(0).max(240).optional(),
  gap: z.number().int().min(0).max(160).optional(),
  borderWidth: z.number().int().min(0).max(12).optional(),
  borderRadius: z.number().int().min(0).max(200).optional(),
  fontSize: z.number().int().min(10).max(160).optional(),
  fontWeight: z.enum(["400", "500", "600", "700"]).optional(),
  textAlign: z.enum(["left", "center", "right"]).optional(),
  direction: z.enum(["row", "column"]).optional(),
  alignItems: alignmentSchema.optional(),
  justifyContent: justifySchema.optional(),
  gridMinColumnWidth: z.number().int().min(120).max(640).optional(),
});

const textNodeContentSchema = z.object({
  text: z.string().min(1).max(5000),
  tag: z.enum(["p", "h1", "h2", "h3"]).default("p"),
});

const imageNodeContentSchema = z.object({
  mediaId: z.string().min(1).nullable().default(null),
  alt: z.string().max(300).default(""),
  objectFit: z.enum(["cover", "contain"]).default("cover"),
});

const buttonNodeContentSchema = z.object({
  label: z.string().min(1).max(100),
  url: pageBuilderButtonUrlSchema,
  variant: z.enum(["primary", "secondary", "ghost"]).default("primary"),
});

const embedNodeContentSchema = z
  .object({
    provider: pageBuilderEmbedProviderSchema,
    url: z
      .string()
      .trim()
      .min(1, { error: "埋め込みURLは必須です" })
      .max(4000, { error: "埋め込みURLは4000文字以内です" }),
  })
  .superRefine(({ provider, url }, context) => {
    if (normalizePageBuilderEmbedUrl(provider, url) !== null) {
      return;
    }

    context.addIssue({
      code: "custom",
      path: ["url"],
      message: getPageBuilderEmbedValidationMessage(provider),
    });
  })
  .transform(({ provider, url }) => ({
    provider,
    url: normalizePageBuilderEmbedUrl(provider, url) ?? url,
  }));

const formNodeContentSchema = z.object({
  kind: z.enum(["contact"]),
  title: z.string().max(100).optional(),
  description: z.string().max(300).optional(),
});

const pageBuilderBaseNodeFields = {
  id: z.string().min(1, { error: "ノードIDは必須です" }),
  parentId: z.string().min(1).nullable(),
  children: z.array(z.string().min(1)).default([]),
  locked: z.boolean().default(false),
  visibility: pageBuilderResponsiveVisibilitySchema.default({
    base: false,
    overrides: {},
  }),
  name: z.string().min(1).max(100),
  layoutMode: z.enum(["absolute", "stack", "grid"]).default("stack"),
  style: pageBuilderNodeStyleSchema.default({}),
};

const pageBuilderBaseNodeSchema = z.object({
  ...pageBuilderBaseNodeFields,
  layout: pageBuilderResponsiveLayoutSchema,
});

const rootNodeSchema = pageBuilderBaseNodeSchema.extend({
  type: z.literal("root"),
  parentId: z.null(),
  content: z.object({}).default({}),
});

const frameNodeSchema = pageBuilderBaseNodeSchema.extend({
  type: z.literal("frame"),
  content: z.object({}).default({}),
});

const stackNodeSchema = pageBuilderBaseNodeSchema.extend({
  type: z.literal("stack"),
  content: z.object({}).default({}),
});

const gridNodeSchema = pageBuilderBaseNodeSchema.extend({
  type: z.literal("grid"),
  layoutMode: z.literal("grid").default("grid"),
  content: z.object({}).default({}),
});

const textNodeSchema = pageBuilderBaseNodeSchema.extend({
  type: z.literal("text"),
  children: z.array(z.string().min(1)).length(0),
  content: textNodeContentSchema,
});

const imageNodeSchema = pageBuilderBaseNodeSchema.extend({
  type: z.literal("image"),
  children: z.array(z.string().min(1)).length(0),
  content: imageNodeContentSchema,
});

const buttonNodeSchema = pageBuilderBaseNodeSchema.extend({
  type: z.literal("button"),
  children: z.array(z.string().min(1)).length(0),
  content: buttonNodeContentSchema,
});

const dividerNodeSchema = pageBuilderBaseNodeSchema.extend({
  type: z.literal("divider"),
  children: z.array(z.string().min(1)).length(0),
  content: z.object({}).default({}),
});

const spacerNodeSchema = pageBuilderBaseNodeSchema.extend({
  type: z.literal("spacer"),
  children: z.array(z.string().min(1)).length(0),
  content: z.object({}).default({}),
});

const embedNodeSchema = pageBuilderBaseNodeSchema.extend({
  type: z.literal("embed"),
  children: z.array(z.string().min(1)).length(0),
  content: embedNodeContentSchema,
});

const formNodeSchema = pageBuilderBaseNodeSchema.extend({
  type: z.literal("form"),
  children: z.array(z.string().min(1)).length(0),
  content: formNodeContentSchema,
});

export const pageBuilderNodeSchema = z.discriminatedUnion("type", [
  rootNodeSchema,
  frameNodeSchema,
  stackNodeSchema,
  gridNodeSchema,
  textNodeSchema,
  imageNodeSchema,
  buttonNodeSchema,
  dividerNodeSchema,
  spacerNodeSchema,
  embedNodeSchema,
  formNodeSchema,
]);

export const pageBuilderDocumentSchema = z.object({
  schemaVersion: z.literal(4),
  rootId: z.string().min(1),
  nodes: z.record(z.string(), pageBuilderNodeSchema),
  breakpoints: z.object({
    desktop: z.object({
      width: z.number().int().min(320).max(2560),
      label: z.literal("Desktop"),
    }),
    tablet: z.object({
      width: z.number().int().min(320).max(1600),
      label: z.literal("Tablet"),
    }),
    mobile: z.object({
      width: z.number().int().min(320).max(768),
      label: z.literal("Mobile"),
    }),
  }),
  canvas: z.object({
    width: z.enum(["full", "boxed"]).default("boxed"),
    backgroundToken: colorTokenSchema.default("background"),
  }),
});

export type PageBuilderLayoutBox = z.infer<typeof pageBuilderLayoutBoxSchema>;
export type PageBuilderLayoutOverride = z.infer<
  typeof pageBuilderLayoutOverrideSchema
>;
export type PageBuilderResponsiveLayout = z.infer<
  typeof pageBuilderResponsiveLayoutSchema
>;
export type PageBuilderResponsiveVisibility = z.infer<
  typeof pageBuilderResponsiveVisibilitySchema
>;
export type PageBuilderNode = z.infer<typeof pageBuilderNodeSchema>;
export type PageBuilderDocument = z.infer<typeof pageBuilderDocumentSchema>;

export function parsePageBuilderDocument(input: unknown): PageBuilderDocument {
  const parsed = pageBuilderDocumentSchema.safeParse(input);
  if (parsed.success) {
    return parsed.data;
  }

  throw new DomainError("ページビルダードキュメントが不正です", "VALIDATION");
}
