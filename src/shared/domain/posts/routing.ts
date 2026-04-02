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
  "posts",
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

export interface ResolvedPostRoute {
  readonly slug: string;
  readonly structure: PostPermalinkStructure;
  readonly segments: readonly string[];
  readonly pathname: string;
}

export function isReservedPostSegment(segment: string): boolean {
  return RESERVED_POST_SEGMENTS.has(segment.toLowerCase());
}

export function getPostPermalinkConfig(
  settings: PermalinkSettingsLike | undefined,
): PermalinkConfig {
  const postPermalinkStructure =
    settings?.postPermalinkStructure ?? PostPermalinkStructure.post_name;
  const postUrlPrefixEnabled = settings?.postUrlPrefixEnabled ?? true;

  return {
    structure: postPermalinkStructure,
    prefix: postUrlPrefixEnabled ? "/posts" : "",
  };
}

export function buildPostCanonicalPath(
  post: PostUrlData,
  settings: PermalinkSettingsLike | undefined,
): string {
  return generatePostUrl(post, getPostPermalinkConfig(settings));
}

export function resolvePostDetailRoute(
  segments: readonly string[],
): ResolvedPostRoute | null {
  if (segments.length === 1) {
    const slug = segments[0];
    if (!slug || isReservedPostSegment(slug)) return null;

    return {
      slug,
      structure: PostPermalinkStructure.post_name,
      segments,
      pathname: `/${slug}`,
    };
  }

  if (segments.length === 2) {
    const [category, slug] = segments;
    if (!category || !slug || isReservedPostSegment(category)) return null;

    return {
      slug,
      structure: PostPermalinkStructure.category_name,
      segments,
      pathname: `/${category}/${slug}`,
    };
  }

  if (segments.length === 3) {
    const [year, month, slug] = segments;
    if (!year || !month || !slug) return null;

    const parsedYear = Number.parseInt(year, 10);
    const parsedMonth = Number.parseInt(month, 10);
    const isValidYear =
      /^\d{4}$/.test(year) && parsedYear >= 2000 && parsedYear <= 2100;
    const isValidMonth =
      /^\d{1,2}$/.test(month) && parsedMonth >= 1 && parsedMonth <= 12;

    if (!isValidYear || !isValidMonth) return null;

    return {
      slug,
      structure: PostPermalinkStructure.date_name,
      segments,
      pathname: `/${year}/${month}/${slug}`,
    };
  }

  return null;
}
