import type { IframeHTMLAttributes } from "react";
import { z } from "zod";
import { isAppRoute, type AppRoute } from "@/shared/lib/typed-routes";
import { createSafeUrlSchema } from "@/shared/lib/validations/cta-and-url";
import {
  extractInstagramShortcode,
  instagramPostUrlSchema,
} from "@/shared/lib/validations/instagram";

export const pageBuilderEmbedProviderValues = [
  "youtube",
  "google-maps",
  "instagram",
] as const;

export const pageBuilderEmbedProviderSchema = z.enum(
  pageBuilderEmbedProviderValues,
);

export type PageBuilderEmbedProvider = z.infer<
  typeof pageBuilderEmbedProviderSchema
>;

type PageBuilderEmbedConfig = {
  src: string;
  title: string;
  allow?: string;
  allowFullScreen?: boolean;
  loading: "lazy";
  minHeight: number;
  referrerPolicy?: IframeHTMLAttributes<HTMLIFrameElement>["referrerPolicy"];
  scrolling?: "no";
};

const youtubeIdPattern = /^[A-Za-z0-9_-]{11}$/;

function createRequiredSafeUrlSchema(maxLength: number, fieldLabel: string) {
  return z
    .string()
    .trim()
    .refine((value) => value.length > 0, {
      error: `${fieldLabel}は必須です`,
    })
    .pipe(createSafeUrlSchema(maxLength));
}

function parseAbsoluteUrl(value: string): URL | null {
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function normalizeYouTubeUrl(value: string): string | null {
  const parsed = parseAbsoluteUrl(value);
  if (!parsed) {
    return null;
  }

  const hostname = parsed.hostname.toLowerCase();
  let videoId: string | null = null;

  if (hostname === "youtu.be") {
    const pathSegments = parsed.pathname.split("/").filter(Boolean);
    videoId = pathSegments[0] ?? null;
  } else if (
    hostname === "youtube.com" ||
    hostname === "www.youtube.com" ||
    hostname === "m.youtube.com" ||
    hostname === "youtube-nocookie.com" ||
    hostname === "www.youtube-nocookie.com"
  ) {
    if (parsed.pathname === "/watch") {
      videoId = parsed.searchParams.get("v");
    } else {
      const pathSegments = parsed.pathname.split("/").filter(Boolean);
      if (
        pathSegments[0] === "embed" ||
        pathSegments[0] === "shorts" ||
        pathSegments[0] === "live"
      ) {
        videoId = pathSegments[1] ?? null;
      }
    }
  }

  if (!videoId || !youtubeIdPattern.test(videoId)) {
    return null;
  }

  return `https://www.youtube.com/embed/${videoId}`;
}

function normalizeGoogleMapsEmbedUrl(value: string): string | null {
  const parsed = parseAbsoluteUrl(value);
  if (!parsed) {
    return null;
  }

  const hostname = parsed.hostname.toLowerCase();
  const isGoogleMapsHost =
    hostname === "google.com" ||
    hostname.endsWith(".google.com") ||
    hostname.startsWith("maps.google.");

  if (!isGoogleMapsHost || !parsed.pathname.includes("/maps/embed")) {
    return null;
  }

  parsed.protocol = "https:";
  return parsed.toString();
}

function normalizeInstagramEmbedUrl(value: string): string | null {
  const trimmed = value.trim();
  const parsed = instagramPostUrlSchema.safeParse(trimmed);
  if (!parsed.success) {
    return null;
  }

  const shortcode = extractInstagramShortcode(parsed.data);
  if (!shortcode) {
    return null;
  }

  return `https://www.instagram.com/p/${shortcode}/embed`;
}

export const pageBuilderButtonUrlSchema = createRequiredSafeUrlSchema(
  500,
  "リンクURL",
);

export function resolvePageBuilderHref(value: string): string | null {
  const parsed = pageBuilderButtonUrlSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export function isPageBuilderInternalHref(href: string): href is AppRoute {
  return isAppRoute(href);
}

export function normalizePageBuilderEmbedUrl(
  provider: PageBuilderEmbedProvider,
  value: string,
): string | null {
  if (provider === "youtube") {
    return normalizeYouTubeUrl(value);
  }

  if (provider === "google-maps") {
    return normalizeGoogleMapsEmbedUrl(value);
  }

  return normalizeInstagramEmbedUrl(value);
}

export function getPageBuilderEmbedValidationMessage(
  provider: PageBuilderEmbedProvider,
): string {
  if (provider === "youtube") {
    return "YouTube の watch / share / embed URL を入力してください";
  }

  if (provider === "google-maps") {
    return "Google Maps の「地図を埋め込む」で取得した URL を入力してください";
  }

  return "Instagram 投稿またはリールの URL を入力してください";
}

export function getPageBuilderEmbedInputHint(
  provider: PageBuilderEmbedProvider,
): string {
  if (provider === "youtube") {
    return "watch / share / embed URL を入力すると埋め込み URL に正規化されます。";
  }

  if (provider === "google-maps") {
    return "Google Maps の「共有 > 地図を埋め込む」で取得した URL のみ保存できます。";
  }

  return "Instagram 投稿 / リール URL を入力すると埋め込み URL に正規化されます。";
}

export function resolvePageBuilderEmbedConfig(
  provider: PageBuilderEmbedProvider,
  value: string,
): PageBuilderEmbedConfig | null {
  const src = normalizePageBuilderEmbedUrl(provider, value);
  if (!src) {
    return null;
  }

  if (provider === "youtube") {
    return {
      src,
      title: "YouTube video",
      allow:
        "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share",
      allowFullScreen: true,
      loading: "lazy",
      minHeight: 360,
      referrerPolicy: "strict-origin-when-cross-origin",
    };
  }

  if (provider === "google-maps") {
    return {
      src,
      title: "Google マップ",
      loading: "lazy",
      minHeight: 320,
      referrerPolicy: "no-referrer-when-downgrade",
    };
  }

  return {
    src,
    title: "Instagram post",
    loading: "lazy",
    minHeight: 500,
    scrolling: "no",
  };
}
