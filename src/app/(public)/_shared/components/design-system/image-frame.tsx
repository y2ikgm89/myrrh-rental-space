/**
 * ImageFrame — next/image の type-safe ラッパー
 *
 * Next.js 公式: <Image> は `width + height` または `fill` の **どちらか必須**。
 * このコンポーネントの props は discriminated union でその排他制約を型レベルで強制する。
 *
 * Variants:
 *   - fill mode（推奨・レスポンシブ）:   `<ImageFrame fill aspect="wide" sizes="..." />`
 *   - explicit dimensions（intrinsic）:    `<ImageFrame width={400} height={300} sizes="..." />`
 *
 * `aspect` は fill mode 専用（CSS aspect-ratio で container をサイズ → image が fill で追従）。
 *
 * @see https://nextjs.org/docs/app/api-reference/components/image
 */

import Image from "next/image";
import { cn } from "@/shared/lib/cn";

type AspectRatio =
  | "video"
  | "square"
  | "portrait"
  | "wide"
  | "landscape"
  | "photo";

const aspectClasses = {
  video: "aspect-video",
  square: "aspect-square",
  portrait: "aspect-[3/4]",
  wide: "aspect-[2/1]",
  landscape: "aspect-[4/3]",
  photo: "aspect-[3/2]",
} as const satisfies Record<AspectRatio, string>;

interface ImageFrameBaseProps {
  readonly src: string;
  readonly alt: string;
  readonly sizes: string;
  readonly priority?: boolean;
  readonly className?: string;
  readonly rounded?: boolean;
}

interface FillProps extends ImageFrameBaseProps {
  readonly fill: true;
  readonly aspect?: AspectRatio;
  readonly width?: never;
  readonly height?: never;
}

interface DimensionProps extends ImageFrameBaseProps {
  readonly fill?: never;
  readonly aspect?: never;
  readonly width: number;
  readonly height: number;
}

type ImageFrameProps = FillProps | DimensionProps;

export function ImageFrame(props: ImageFrameProps) {
  const {
    src,
    alt,
    sizes,
    priority = false,
    className,
    rounded = false,
  } = props;

  return (
    <div
      className={cn(
        "group relative overflow-hidden bg-surface",
        rounded && "rounded-lg",
        props.fill && props.aspect && aspectClasses[props.aspect],
        className,
      )}
    >
      {props.fill ? (
        <Image
          src={src}
          alt={alt}
          fill
          sizes={sizes}
          priority={priority}
          className="h-full w-full object-cover transition-opacity duration-400 group-hover:opacity-85"
        />
      ) : (
        <Image
          src={src}
          alt={alt}
          width={props.width}
          height={props.height}
          sizes={sizes}
          priority={priority}
          className="h-full w-full object-cover transition-opacity duration-400 group-hover:opacity-85"
        />
      )}
    </div>
  );
}
