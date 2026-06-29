/**
 * Toolbar Plugin 共有型定義
 */

import {
  IconAlignCenter,
  IconAlignJustified,
  IconAlignLeft,
  IconAlignRight,
  IconBlockquote,
  IconH1,
  IconH2,
  IconH3,
  IconH4,
  IconList,
  IconListNumbers,
  IconPilcrow,
} from "@tabler/icons-react";
import type { HeadingTagType } from "@lexical/rich-text";
import type { ComponentType } from "react";

export type BlockType =
  "paragraph" | "h1" | "h2" | "h3" | "h4" | "quote" | "ul" | "ol";

const BLOCK_TYPE_VALUES = [
  "paragraph",
  "h1",
  "h2",
  "h3",
  "h4",
  "quote",
  "ul",
  "ol",
] as const;
const BLOCK_TYPES = new Set<string>(BLOCK_TYPE_VALUES);

export function isBlockType(value: unknown): value is BlockType {
  return typeof value === "string" && BLOCK_TYPES.has(value);
}

type BlockTypeConfig = {
  label: string;
  icon: ComponentType<{ className?: string }>;
};

export const BLOCK_TYPE_CONFIG: Record<BlockType, BlockTypeConfig> = {
  paragraph: { label: "本文", icon: IconPilcrow },
  h1: { label: "見出し1", icon: IconH1 },
  h2: { label: "見出し2", icon: IconH2 },
  h3: { label: "見出し3", icon: IconH3 },
  h4: { label: "見出し4", icon: IconH4 },
  quote: { label: "引用", icon: IconBlockquote },
  ul: { label: "箇条書き", icon: IconList },
  ol: { label: "番号付き", icon: IconListNumbers },
};

export type AlignmentType = "left" | "center" | "right" | "justify";

const ALIGNMENT_TYPE_VALUES = ["left", "center", "right", "justify"] as const;
const ALIGNMENT_TYPES = new Set<string>(ALIGNMENT_TYPE_VALUES);

export function isAlignmentType(value: unknown): value is AlignmentType {
  return typeof value === "string" && ALIGNMENT_TYPES.has(value);
}

const HEADING_TAG_VALUES = ["h1", "h2", "h3", "h4", "h5", "h6"] as const;
const HEADING_TAGS = new Set<string>(HEADING_TAG_VALUES);

export function isHeadingTag(value: unknown): value is HeadingTagType {
  return typeof value === "string" && HEADING_TAGS.has(value);
}

type AlignmentConfig = {
  label: string;
  icon: ComponentType<{ className?: string }>;
};

export const ALIGNMENT_CONFIG: Record<AlignmentType, AlignmentConfig> = {
  left: { label: "左揃え", icon: IconAlignLeft },
  center: { label: "中央揃え", icon: IconAlignCenter },
  right: { label: "右揃え", icon: IconAlignRight },
  justify: { label: "両端揃え", icon: IconAlignJustified },
};
