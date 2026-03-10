"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState, useTransition, useEffect } from "react";
import { toast } from "sonner";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Badge,
  Switch,
} from "@/admin/components/ui";
import { DetailSection } from "@/admin/components/DetailSection";
import { DetailField } from "@/admin/components/DetailField";
import { updateSpacePublish } from "@/admin/actions/space";
import { isMutationError } from "@/shared/lib/mutation-result";
import type { SpaceWithStats } from "@/admin/lib/validations/space";
import { formatDateTimeShort, formatCurrency } from "@/shared/lib/utils";

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
      if (e.key === "Escape") setIsModalOpen(false);
      else if (e.key === "ArrowLeft") {
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
              <span className="whitespace-pre-wrap">{space.description}</span>
            }
          />
          <DetailField label="住所" value={space.address} />
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

      {/* 画像モーダル */}
      {isModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-overlay p-4"
          onClick={() => setIsModalOpen(false)}
        >
          {/* 閉じるボタン */}
          <button
            type="button"
            className="absolute top-4 right-4 text-primary-foreground hover:text-primary-foreground/70 transition-colors"
            onClick={() => setIsModalOpen(false)}
          >
            <svg
              className="h-8 w-8"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2}
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M6 18 18 6M6 6l12 12"
              />
            </svg>
          </button>

          {/* 前へボタン */}
          {allImages.length > 1 && (
            <button
              type="button"
              className="absolute left-4 top-1/2 -translate-y-1/2 text-primary-foreground hover:text-primary-foreground/70 transition-colors p-2"
              onClick={(e) => {
                e.stopPropagation();
                handlePrev();
              }}
            >
              <svg
                className="h-8 w-8"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={2}
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M15.75 19.5 8.25 12l7.5-7.5"
                />
              </svg>
            </button>
          )}

          {/* 画像 */}
          {allImages[selectedIndex] && (
            <Image
              src={allImages[selectedIndex]}
              alt={`${space.name} - 画像${selectedIndex + 1}`}
              width={1920}
              height={1080}
              className="max-w-full max-h-[90vh] object-contain rounded-lg"
              onClick={(e) => e.stopPropagation()}
            />
          )}

          {/* 次へボタン */}
          {allImages.length > 1 && (
            <button
              type="button"
              className="absolute right-4 top-1/2 -translate-y-1/2 text-primary-foreground hover:text-primary-foreground/70 transition-colors p-2"
              onClick={(e) => {
                e.stopPropagation();
                handleNext();
              }}
            >
              <svg
                className="h-8 w-8"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={2}
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="m8.25 4.5 7.5 7.5-7.5 7.5"
                />
              </svg>
            </button>
          )}

          {/* カウンター */}
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-primary-foreground text-sm">
            {selectedIndex + 1} / {allImages.length}
          </div>
        </div>
      )}

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
