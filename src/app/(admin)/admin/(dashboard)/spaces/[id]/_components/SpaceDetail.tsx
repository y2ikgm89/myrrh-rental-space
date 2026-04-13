"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState, useTransition, useEffect } from "react";
import { toast } from "sonner";
import { IconChevronLeft, IconChevronRight } from "@tabler/icons-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Badge,
  Switch,
  Button,
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/admin/components/ui";
import { DetailSection } from "@/admin/components/DetailSection";
import { DetailField } from "@/admin/components/DetailField";
import { updateSpacePublish } from "@/admin/actions/space";
import { isMutationError } from "@/shared/lib/mutation-result";
import type { SpaceWithStats } from "@/admin/lib/validations/space";
import { formatDateTimeShort } from "@/shared/lib/date-format";
import { formatCurrency } from "@/shared/lib/pricing/format";
import { SanitizedHtml } from "@/shared/components/SanitizedHtml";

type SpaceDetailProps = {
  space: SpaceWithStats;
};

export function SpaceDetail({ space }: SpaceDetailProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  // 画像モーダル用のstate
  const allImages = [space.mainImageUrl, ...space.imageUrls];
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);

  const openModal = (index: number) => {
    setSelectedIndex(index);
    setIsModalOpen(true);
  };

  const handlePrev = () => {
    setSelectedIndex((prev) => (prev === 0 ? allImages.length - 1 : prev - 1));
  };

  const handleNext = () => {
    setSelectedIndex((prev) => (prev === allImages.length - 1 ? 0 : prev + 1));
  };

  useEffect(() => {
    if (!isModalOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") {
        setSelectedIndex((prev) =>
          prev === 0 ? allImages.length - 1 : prev - 1,
        );
      } else if (e.key === "ArrowRight") {
        setSelectedIndex((prev) =>
          prev === allImages.length - 1 ? 0 : prev + 1,
        );
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isModalOpen, allImages.length]);

  const handlePublishChange = async (checked: boolean) => {
    startTransition(async () => {
      const result = await updateSpacePublish(space.id, checked);
      if (!isMutationError(result)) {
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  };

  return (
    <div className="space-y-6">
      {/* 公開状態 */}
      <Card>
        <CardHeader>
          <CardTitle>公開状態</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4">
            <Switch
              checked={space.isPublished}
              onCheckedChange={handlePublishChange}
              disabled={isPending}
            />
            <div>
              <p className="font-medium">
                {space.isPublished ? "公開中" : "非公開"}
              </p>
              <p className="text-sm text-muted-foreground">
                {space.isPublished
                  ? "このスペースは公開ページに表示されています"
                  : "このスペースは公開ページに表示されていません"}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 基本情報 */}
      <DetailSection title="基本情報">
        <div className="grid gap-4 sm:grid-cols-2">
          <DetailField label="スペース名" value={space.name} />
          <DetailField
            label="予約数"
            value={
              <Badge variant="secondary">{space._count.reservations}件</Badge>
            }
          />
          <DetailField
            className="sm:col-span-2"
            label="説明"
            value={
              <SanitizedHtml
                html={space.descriptionHtml}
                className="prose prose-sm max-w-none"
              />
            }
          />
          <DetailField label="所在地" value={space.displayAddress} />
          {space.category ? (
            <DetailField label="カテゴリ" value={space.category.name} />
          ) : null}
          {space.access && (
            <DetailField label="アクセス" value={space.access} />
          )}
          <DetailField label="定員" value={`${space.capacity}名`} />
          {space.area && <DetailField label="面積" value={`${space.area}m²`} />}
        </div>
      </DetailSection>

      {/* 料金 */}
      <DetailSection title="料金">
        <div className="grid gap-4 sm:grid-cols-2">
          <DetailField
            label="時間料金"
            value={
              <span className="text-xl font-bold">
                {formatCurrency(space.hourlyPrice)}
                <span className="text-sm font-normal text-muted-foreground">
                  /時間
                </span>
              </span>
            }
          />
          {space.dailyPrice && (
            <DetailField
              label="日額料金"
              value={
                <span className="text-xl font-bold">
                  {formatCurrency(space.dailyPrice)}
                  <span className="text-sm font-normal text-muted-foreground">
                    /日
                  </span>
                </span>
              }
            />
          )}
        </div>
      </DetailSection>

      {/* 画像 */}
      <Card>
        <CardHeader>
          <CardTitle>画像</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-3 flex-wrap">
            {/* メイン画像 */}
            <div className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">メイン</span>
              <button
                type="button"
                onClick={() => openModal(0)}
                className="relative w-24 h-24 cursor-pointer hover:opacity-80 transition-opacity"
              >
                <Image
                  src={space.mainImageUrl}
                  alt={space.name}
                  fill
                  className="rounded-lg object-cover ring-2 ring-primary"
                  sizes="96px"
                />
              </button>
            </div>
            {/* 追加画像 */}
            {space.imageUrls.map((url: string, index: number) => (
              <div key={url} className="flex flex-col gap-1">
                <span className="text-xs text-muted-foreground">
                  追加{index + 1}
                </span>
                <button
                  type="button"
                  onClick={() => openModal(index + 1)}
                  className="relative w-24 h-24 cursor-pointer hover:opacity-80 transition-opacity"
                >
                  <Image
                    src={url}
                    alt={`${space.name} ${index + 1}`}
                    fill
                    className="rounded-lg object-cover"
                    sizes="96px"
                  />
                </button>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent
          className="max-h-[95vh] max-w-[min(100vw-2rem,80rem)] gap-0 border-border bg-card p-4 shadow-lg"
          aria-describedby={undefined}
        >
          <DialogTitle className="sr-only">
            {space.name}の画像ギャラリー
          </DialogTitle>
          <div className="relative flex min-h-[40vh] items-center justify-center">
            {allImages.length > 1 ? (
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="absolute left-0 top-1/2 z-10 -translate-y-1/2"
                onClick={handlePrev}
              >
                <IconChevronLeft className="size-5" />
                <span className="sr-only">前の画像</span>
              </Button>
            ) : null}
            {allImages[selectedIndex] ? (
              <Image
                src={allImages[selectedIndex]}
                alt={`${space.name} - 画像${selectedIndex + 1}`}
                width={1920}
                height={1080}
                className="max-h-[85vh] w-auto max-w-full object-contain"
              />
            ) : null}
            {allImages.length > 1 ? (
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="absolute right-0 top-1/2 z-10 -translate-y-1/2"
                onClick={handleNext}
              >
                <IconChevronRight className="size-5" />
                <span className="sr-only">次の画像</span>
              </Button>
            ) : null}
          </div>
          {allImages.length > 1 ? (
            <p className="pt-2 text-center text-sm text-muted-foreground">
              {selectedIndex + 1} / {allImages.length}
            </p>
          ) : null}
        </DialogContent>
      </Dialog>

      {/* 設備 */}
      {space.facilities.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>設備・アメニティ</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {space.facilities.map((facility: string) => (
                <Badge key={facility} variant="secondary">
                  {facility}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* メタ情報 */}
      <DetailSection title="メタ情報">
        <div className="grid gap-4 sm:grid-cols-2">
          <DetailField
            label="作成日時"
            value={formatDateTimeShort(space.createdAt)}
          />
          <DetailField
            label="更新日時"
            value={formatDateTimeShort(space.updatedAt)}
          />
          {space.publishedAt && (
            <DetailField
              label="公開日時"
              value={formatDateTimeShort(space.publishedAt)}
            />
          )}
        </div>
      </DetailSection>
    </div>
  );
}
