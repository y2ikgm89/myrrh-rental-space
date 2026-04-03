import Image from "next/image";
import { cn } from "@/shared/lib/cn";

type AspectRatio = "video" | "square" | "portrait" | "wide" | "landscape";

const aspectClasses = {
  video: "aspect-video",
  square: "aspect-square",
  portrait: "aspect-[3/4]",
  wide: "aspect-[2/1]",
  landscape: "aspect-[4/3]",
} as const satisfies Record<AspectRatio, string>;

interface ImageFrameProps {
  readonly src: string;
  readonly alt: string;
  readonly width?: number;
  readonly height?: number;
  readonly fill?: boolean;
  readonly aspect?: AspectRatio;
  readonly sizes: string;
  readonly priority?: boolean;
  readonly className?: string;
  readonly rounded?: boolean;
}

export function ImageFrame({
  src,
  alt,
  width,
  height,
  fill,
  aspect,
  sizes,
  priority = false,
  className,
  rounded = true,
}: ImageFrameProps) {
  return (
    <div
      className={cn(
        "group relative overflow-hidden bg-surface",
        rounded && "rounded-lg",
        aspect && aspectClasses[aspect],
        className,
      )}
    >
      {fill ? (
        <Image
          src={src}
          alt={alt}
          fill
          sizes={sizes}
          priority={priority}
          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
        />
      ) : (
        <Image
          src={src}
          alt={alt}
          {...(width !== undefined && { width })}
          {...(height !== undefined && { height })}
          sizes={sizes}
          priority={priority}
          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
        />
      )}
    </div>
  );
}
