import {
  IconAlignCenter,
  IconAlignJustified,
  IconAlignLeft,
  IconAlignRight,
} from "@tabler/icons-react";
import type { ComponentType } from "react";

export type AlignmentType = "left" | "center" | "right" | "justify";

const ALIGNMENT_TYPES = new Set<string>(["left", "center", "right", "justify"]);

export function isAlignmentType(value: string): value is AlignmentType {
  return ALIGNMENT_TYPES.has(value);
}

type AlignmentOption = {
  type: AlignmentType;
  label: string;
  icon: ComponentType<{ className?: string }>;
};

export const ALIGNMENT_OPTIONS: readonly AlignmentOption[] = [
  { type: "left", label: "左揃え", icon: IconAlignLeft },
  { type: "center", label: "中央揃え", icon: IconAlignCenter },
  { type: "right", label: "右揃え", icon: IconAlignRight },
  { type: "justify", label: "両端揃え", icon: IconAlignJustified },
];
