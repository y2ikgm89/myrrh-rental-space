/**
 * ページコンテンツ共通型定義
 *
 * Page-First Architecture で使用するコンテンツブロックの型
 */

export interface ButtonItem {
  readonly label: string;
  readonly href: string;
  readonly variant: "primary" | "secondary" | "ghost";
}

export interface ImageRef {
  readonly src: string;
  readonly alt: string;
  readonly width: number;
  readonly height: number;
}

export interface FeatureCard {
  readonly icon: string;
  readonly title: string;
  readonly description: string;
}
