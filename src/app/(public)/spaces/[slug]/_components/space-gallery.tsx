import { ImageGallery } from "@/public/components/ui/image-gallery";
import { parseStringArray } from "@/shared/lib/json-validators";

interface SpaceGalleryProps {
  readonly mainImage: string;
  readonly images: unknown;
  readonly name: string;
}

export function SpaceGallery({ mainImage, images, name }: SpaceGalleryProps) {
  const subImages = parseStringArray(images);
  return <ImageGallery images={[mainImage, ...subImages]} alt={name} />;
}
