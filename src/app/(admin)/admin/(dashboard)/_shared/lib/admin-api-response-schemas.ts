import { z } from "zod";
import { LINK_CARD_CONTENT_TYPES } from "@/shared/domain/link-cards/content-types";
import { portableTextSpanSchema } from "@/shared/lib/portable-text/schema";
import {
  CustomerStatus,
  CustomerType,
  EditorCommentStatus,
  NavigationType,
  SocialPlatform,
} from "@/shared/lib/validations/enums/prisma-types";

const uuidSchema = z.uuid();
/** JSON 経由の ISO 日時文字列（Serialized<T> の date フィールド向け） */
const isoDateStringSchema = z.string();
/** domain 型が Date を期待する navigation 等向け */
const jsonDateSchema = z.coerce.date();

export const slugAvailabilityResponseSchema = z.object({
  available: z.boolean(),
  message: z.string().optional(),
});

export const customerSearchResultSchema = z.object({
  id: uuidSchema,
  lastName: z.string(),
  firstName: z.string(),
  companyName: z.string().nullable(),
  customerType: z.enum(CustomerType),
  email: z.string(),
  phoneNumber: z.string().nullable(),
  status: z.enum(CustomerStatus),
  userId: uuidSchema.nullable(),
});

export const customerSearchResultsResponseSchema = z.array(
  customerSearchResultSchema,
);

type NavigationItemResponse = {
  id: string;
  type: (typeof NavigationType)[keyof typeof NavigationType];
  parentId: string | null;
  label: z.infer<typeof portableTextSpanSchema>[];
  url: string;
  isExternal: boolean;
  order: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  children: NavigationItemResponse[];
};

const navigationItemSchema: z.ZodType<NavigationItemResponse> = z.lazy(() =>
  z.object({
    id: uuidSchema,
    type: z.enum(NavigationType),
    parentId: uuidSchema.nullable(),
    label: z.array(portableTextSpanSchema),
    url: z.string(),
    isExternal: z.boolean(),
    order: z.number().int(),
    isActive: z.boolean(),
    createdAt: jsonDateSchema,
    updatedAt: jsonDateSchema,
    children: z.array(navigationItemSchema),
  }),
);

export const navigationItemsResponseSchema = z.array(navigationItemSchema);

export const socialLinkDataSchema = z.object({
  id: uuidSchema,
  platform: z.enum(SocialPlatform),
  url: z.string(),
  order: z.number().int(),
  isActive: z.boolean(),
  showOnDesktop: z.boolean(),
  showOnMobile: z.boolean(),
  createdAt: isoDateStringSchema,
  updatedAt: isoDateStringSchema,
});

export const socialLinksResponseSchema = z.array(socialLinkDataSchema);

export const announcementBarDataSchema = z.object({
  id: uuidSchema,
  message: z.array(portableTextSpanSchema),
  linkUrl: z.string().nullable(),
  linkText: z.string().nullable(),
  bgColor: z.string().nullable(),
  textColor: z.string().nullable(),
  isActive: z.boolean(),
  displayOrder: z.number().int(),
  startAt: isoDateStringSchema.nullable(),
  endAt: isoDateStringSchema.nullable(),
  createdAt: isoDateStringSchema,
  updatedAt: isoDateStringSchema,
});

export const announcementBarsListResponseSchema = z.object({
  items: z.array(announcementBarDataSchema),
  total: z.number().int().nonnegative(),
});

const commentUserSummarySchema = z.object({
  id: uuidSchema,
  name: z.string(),
  image: z.string().nullable(),
});

const editorCommentSchema = z.object({
  id: uuidSchema,
  threadId: uuidSchema,
  content: z.string(),
  isDeleted: z.boolean(),
  deletedAt: jsonDateSchema.nullable(),
  deletedBy: uuidSchema.nullable(),
  createdAt: jsonDateSchema,
  updatedAt: jsonDateSchema,
  createdBy: uuidSchema.nullable(),
  createdByUser: commentUserSummarySchema.optional(),
  // exactOptionalPropertyTypes: omit or null（undefined 値は付けない）
  deletedByUser: commentUserSummarySchema.nullable().optional(),
});

export const editorCommentThreadResponseSchema = z.object({
  id: uuidSchema,
  markId: z.string(),
  contentType: z.string(),
  contentId: uuidSchema,
  quotedText: z.string(),
  status: z.enum(EditorCommentStatus),
  resolvedAt: jsonDateSchema.nullable(),
  resolvedBy: uuidSchema.nullable(),
  createdAt: jsonDateSchema,
  updatedAt: jsonDateSchema,
  createdBy: uuidSchema.nullable(),
  comments: z.array(editorCommentSchema),
  createdByUser: commentUserSummarySchema.optional(),
  resolvedByUser: commentUserSummarySchema.nullable().optional(),
});

export const editorCommentThreadListItemSchema = z.object({
  id: uuidSchema,
  markId: z.string(),
  quotedText: z.string(),
  status: z.enum(EditorCommentStatus),
  commentCount: z.number().int().nonnegative(),
  latestComment: z
    .object({
      content: z.string(),
      createdAt: jsonDateSchema,
      createdByName: z.string(),
    })
    .optional(),
  createdAt: jsonDateSchema,
  createdByName: z.string(),
});

export const editorCommentThreadListResponseSchema = z.array(
  editorCommentThreadListItemSchema,
);

export const unreadCountResponseSchema = z.object({
  unreadCount: z.number().int().nonnegative(),
});

const postCountSchema = z.object({
  posts: z.number().int().nonnegative(),
});

export const postCategoryDataSchema = z.object({
  id: uuidSchema,
  name: z.string(),
  slug: z.string(),
  description: z.string().nullable(),
  order: z.number().int(),
  metaTitle: z.string().nullable(),
  metaDescription: z.string().nullable(),
  ogpImageUrl: z.string().nullable(),
  createdAt: isoDateStringSchema,
  updatedAt: isoDateStringSchema,
  _count: postCountSchema,
});

export const postCategoriesResponseSchema = z.array(postCategoryDataSchema);

export const postTagDataSchema = z.object({
  id: uuidSchema,
  name: z.string(),
  slug: z.string(),
  description: z.string().nullable(),
  metaTitle: z.string().nullable(),
  metaDescription: z.string().nullable(),
  ogpImageUrl: z.string().nullable(),
  createdAt: isoDateStringSchema,
  updatedAt: isoDateStringSchema,
  _count: postCountSchema,
});

export const postTagsResponseSchema = z.array(postTagDataSchema);

export const linkCardSearchItemSchema = z.object({
  contentType: z.enum(LINK_CARD_CONTENT_TYPES),
  contentId: uuidSchema,
  title: z.string(),
  thumbnailUrl: z.string().nullable(),
});

export const linkCardSearchResponseSchema = z.object({
  items: z.array(linkCardSearchItemSchema),
});

const spaceLinkCardSearchItemSchema = z.object({
  contentType: z.literal("space"),
  contentId: uuidSchema,
  title: z.string(),
  thumbnailUrl: z.string().nullable(),
});

export const spaceLinkCardSearchResponseSchema = z.object({
  items: z.array(spaceLinkCardSearchItemSchema),
});

export const ogpPreviewResponseSchema = z.object({
  url: z.string(),
  title: z.string().nullable(),
  description: z.string().nullable(),
  imageUrl: z.string().nullable(),
  faviconUrl: z.string(),
  siteName: z.string().nullable(),
});

export const linkCardContentTypesResponseSchema = z.object({
  contentTypes: z.array(z.enum(LINK_CARD_CONTENT_TYPES)),
});
