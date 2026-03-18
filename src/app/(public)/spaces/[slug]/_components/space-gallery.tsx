import { ImageGallery } from "@/public/components/ui/image-gallery";

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

  return <ImageGallery images={allImages} alt={name} />;
}
