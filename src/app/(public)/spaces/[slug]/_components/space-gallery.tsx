import Image from "next/image";

interface SpaceGalleryProps {
  readonly mainImage: string;
  readonly images: unknown;
  readonly name: string;
}

export function SpaceGallery({ mainImage, images, name }: SpaceGalleryProps) {
  const imageList: readonly string[] = Array.isArray(images)
    ? images.filter((v): v is string => typeof v === "string")
    : [];

  const allImages = [mainImage, ...imageList];
  const displayImages = allImages.slice(0, 5);

  if (displayImages.length === 0) return null;

  const firstImage = displayImages[0];
  if (!firstImage) return null;

  return (
    <div className="grid gap-2 md:grid-cols-[2fr_1fr] md:grid-rows-2">
      {/* Main image */}
      <div className="relative aspect-[16/10] overflow-hidden rounded-lg md:row-span-2">
        <Image
          src={firstImage}
          alt={name}
          fill
          priority
          sizes="(min-width: 768px) 66vw, 100vw"
          className="object-cover"
        />
      </div>
      {/* Thumbnails */}
      {displayImages.slice(1, 5).map((img, i) => (
        <div
          key={img}
          className="relative hidden aspect-[4/3] overflow-hidden rounded-lg md:block"
        >
          <Image
            src={img}
            alt={`${name} ${String(i + 2)}`}
            fill
            sizes="33vw"
            className="object-cover"
          />
        </div>
      ))}
    </div>
  );
}
