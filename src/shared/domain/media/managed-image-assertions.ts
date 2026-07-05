import "server-only";

import { DomainError } from "@/shared/domain/domain-error";
import { serverEnv } from "@/shared/lib/env/server";
import {
  collectDisallowedManagedImageSrcs,
  isAllowedManagedImageSrc,
} from "@/shared/lib/media/next-image-src";
import type { GalleryItem } from "@/shared/lib/validations/gallery";

function getManagedImageConfig() {
  return {
    publicMediaUrl: serverEnv.R2_PUBLIC_URL ?? null,
  };
}

function throwManagedImageError(label: string): never {
  throw new DomainError(
    `${label}は管理画面からアップロードしたメディアを指定してください`,
    "VALIDATION",
  );
}

export function assertAllowedManagedImageUrl(
  label: string,
  url: string | null | undefined,
): void {
  if (!url) return;
  if (isAllowedManagedImageSrc(url, getManagedImageConfig())) return;

  throwManagedImageError(label);
}

export function assertAllowedManagedImageUrls(
  entries: readonly {
    readonly label: string;
    readonly url: string | null | undefined;
  }[],
): void {
  for (const entry of entries) {
    assertAllowedManagedImageUrl(entry.label, entry.url);
  }
}

export function assertAllowedManagedGallery(
  label: string,
  gallery: readonly GalleryItem[],
): void {
  for (const item of gallery) {
    assertAllowedManagedImageUrl(label, item.url);
  }
}

function parseJsonString(value: string): unknown {
  if (value.length === 0) {
    return undefined;
  }

  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}

export function assertAllowedManagedImageSourcesInJson(
  label: string,
  value: unknown,
): void {
  const source = typeof value === "string" ? parseJsonString(value) : value;
  if (source === undefined) return;

  const disallowed = collectDisallowedManagedImageSrcs(
    source,
    getManagedImageConfig(),
  );
  if (disallowed.length > 0) {
    throwManagedImageError(label);
  }
}
