/**
 * Hero 背景スクリム + テキスト可読性防御の共有 SSoT（client-safe pure module）
 *
 * `scrimTone` から「スクリム色」「文字色 + 縁取り + 多層影（3 層防御）」を派生する。
 * テキストを画像に重ねる hero（StandardHeroSection / MediaHero）が共有する。
 * a11y: hero title の blessed pattern（semi-transparent scrim + paint-order:stroke
 * + 多層 text-shadow）に準拠（frontend/accessibility/images-text.md）。
 */

import type { ReactElement } from "react";
import { cn } from "@/shared/lib/cn";
import type { ScrimTone } from "@/shared/lib/sections/definitions/_shared/scrim";

export function HeroScrim({
  enabled = true,
  tone,
  opacity,
}: {
  readonly enabled?: boolean;
  readonly tone: ScrimTone;
  readonly opacity: number; // 0–100
}): ReactElement | null {
  if (!enabled || opacity <= 0) return null;
  return (
    <div
      aria-hidden="true"
      className={cn(
        "absolute inset-0",
        tone === "dark" ? "bg-foreground" : "bg-background",
      )}
      style={{ opacity: opacity / 100 }}
    />
  );
}

export interface HeroTextClasses {
  /** content wrapper の文字色 */
  readonly base: string;
  readonly title: string;
  readonly subtitle: string;
  readonly label: string;
}

const DARK: HeroTextClasses = {
  base: "text-background",
  label: cn(
    "text-background",
    "[paint-order:stroke_fill]",
    "[-webkit-text-stroke:0.4px_rgb(0_0_0/0.4)]",
    "[text-shadow:0_1px_3px_rgb(0_0_0/0.55)]",
  ),
  title: cn(
    "text-background",
    "[paint-order:stroke_fill]",
    "[-webkit-text-stroke:0.5px_rgb(0_0_0/0.45)]",
    "[text-shadow:0_1px_2px_rgb(0_0_0/0.6),0_2px_12px_rgb(0_0_0/0.5)]",
  ),
  subtitle: cn(
    "text-background/90",
    "[paint-order:stroke_fill]",
    "[-webkit-text-stroke:0.3px_rgb(0_0_0/0.35)]",
    "[text-shadow:0_1px_2px_rgb(0_0_0/0.55)]",
  ),
};

const LIGHT: HeroTextClasses = {
  base: "text-foreground",
  label: cn(
    "text-foreground",
    "[paint-order:stroke_fill]",
    "[-webkit-text-stroke:0.4px_rgb(255_255_255/0.5)]",
    "[text-shadow:0_1px_3px_rgb(255_255_255/0.6)]",
  ),
  title: cn(
    "text-foreground",
    "[paint-order:stroke_fill]",
    "[-webkit-text-stroke:0.5px_rgb(255_255_255/0.55)]",
    "[text-shadow:0_1px_2px_rgb(255_255_255/0.7),0_2px_12px_rgb(255_255_255/0.5)]",
  ),
  subtitle: cn(
    "text-foreground/90",
    "[paint-order:stroke_fill]",
    "[-webkit-text-stroke:0.3px_rgb(255_255_255/0.45)]",
    "[text-shadow:0_1px_2px_rgb(255_255_255/0.6)]",
  ),
};

export function getHeroTextClasses(tone: ScrimTone): HeroTextClasses {
  return tone === "dark" ? DARK : LIGHT;
}
