import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import {
  Image,
  FileText,
  Mail,
  HelpCircle,
  LayoutGrid,
  Newspaper,
  MousePointerClick,
  Images,
  Quote,
  MapPin,
  Code,
  Layers,
  Lightbulb,
  LayoutList,
  Star,
  Instagram,
  FileEdit,
  Sparkles,
  Zap,
  GalleryVerticalEnd,
} from "lucide-react";

const ICON_MAP: Record<string, LucideIcon> = {
  Image,
  FileText,
  Mail,
  HelpCircle,
  LayoutGrid,
  Newspaper,
  FileEdit,
  MousePointerClick,
  Images,
  Quote,
  MapPin,
  Code,
  Layers,
  Lightbulb,
  LayoutList,
  Star,
  Instagram,
  Sparkles,
  Zap,
  GalleryVerticalEnd,
};

/**
 * セクションアイコンを ReactNode として返す
 *
 * LucideIcon コンポーネントをレンダリング中に変数として保持すると
 * react-hooks/static-components エラーになるため、このヘルパーで
 * ReactNode を直接返す。
 */
export function renderSectionIcon(
  iconName: string,
  className?: string,
): ReactNode {
  const Icon = ICON_MAP[iconName] ?? FileText;
  return <Icon className={className} />;
}
