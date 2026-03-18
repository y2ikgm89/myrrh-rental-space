"use client";

import Image from "next/image";

type AspectRatio = "video" | "square" | "portrait" | "wide";

const aspectClasses = {
  video: "aspect-video",
  square: "aspect-square",
  portrait: "aspect-[3/4]",
  wide: "aspect-[2/1]",
} as const satisfies Record<AspectRatio, string>;

interface ImageFrameProps {
  readonly src: string;
  readonly alt: string;
  readonly width: number;
  readonly height: number;
  readonly aspect?: AspectRatio;
  readonly sizes: string;
  readonly priority?: boolean;
  readonly className?: string;
}

export function ImageFrame({
  src,
  alt,
  width,
  height,
  aspect,
  sizes,
  priority = false,
  className = "",
}: ImageFrameProps) {
  return (
    <div
      className={`relative overflow-hidden rounded-lg bg-surface ${aspect ? aspectClasses[aspect] : ""} ${className}`.trim()}
    >
      <Image
        src={src}
        alt={alt}
        width={width}
        height={height}
        sizes={sizes}
        priority={priority}
        className="h-full w-full object-cover"
      />
    </div>
  );
}
