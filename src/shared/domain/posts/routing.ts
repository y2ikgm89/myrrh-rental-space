import { PostPermalinkStructure } from "@generated/prisma/enums";
import {
  generatePostUrl,
  type PermalinkConfig,
  type PostUrlData,
} from "@/shared/lib/url";

const RESERVED_POST_SEGMENTS = new Set([
  "about",
  "contact",
  "faq",
  "news",
  "reservation",
  "spaces",
  "terms",
  "privacy",
  "blog",
  "p",
  "admin",
  "api",
  "_next",
  "category",
  "tag",
  "preview",
]);

export interface PermalinkSettingsLike {
  postUrlPrefixEnabled?: boolean | null;
  postPermalinkStructure?: PostPermalinkStructure | null;
}

export function isReservedPostSegment(segment: string): boolean {
  return RESERVED_POST_SEGMENTS.has(segment.toLowerCase());
}

export function getPostPermalinkConfig(
  settings: PermalinkSettingsLike | undefined,
): PermalinkConfig {
  return {
    structure:
      settings?.postPermalinkStructure ?? PostPermalinkStructure.post_name,
    prefix: "/blog",
  };
}

export function buildPostCanonicalPath(
  post: PostUrlData,
  settings: PermalinkSettingsLike | undefined,
): string {
  return generatePostUrl(post, getPostPermalinkConfig(settings));
}
