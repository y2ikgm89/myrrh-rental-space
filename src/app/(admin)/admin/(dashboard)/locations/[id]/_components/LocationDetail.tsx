"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
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
import { toggleLocationPublish } from "@/admin/actions/location";
import type { LocationWithStats } from "@/admin/lib/validations/location";
import { formatDateTimeShort } from "@/shared/lib/utils";

type LocationDetailProps = {
  location: LocationWithStats;
};

export function LocationDetail({ location }: LocationDetailProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const handlePublishChange = async (checked: boolean) => {
    startTransition(async () => {
      const result = await toggleLocationPublish(location.id, checked);
      if (result.success) {
        router.refresh();
      } else {
        toast.error(result.error || "エラーが発生しました");
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
              checked={location.isPublished}
              onCheckedChange={handlePublishChange}
              disabled={isPending}
            />
            <div>
              <p className="font-medium">
                {location.isPublished ? "公開中" : "非公開"}
              </p>
              <p className="text-sm text-muted-foreground">
                {location.isPublished
                  ? "この場所は公開ページに表示されています"
                  : "この場所は公開ページに表示されていません"}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 基本情報 */}
      <DetailSection title="基本情報">
        <div className="grid gap-4 sm:grid-cols-2">
          <DetailField label="場所名" value={location.name} />
          <DetailField
            label="スペース数"
            value={
              <Badge variant="secondary">{location._count.spaces}件</Badge>
            }
          />
          {location.description && (
            <DetailField
              label="説明"
              value={
                <span className="whitespace-pre-wrap">
                  {location.description}
                </span>
              }
              className="sm:col-span-2"
            />
          )}
          <DetailField
            label="住所"
            value={location.address}
            className="sm:col-span-2"
          />
          {location.access && (
            <DetailField
              label="アクセス"
              value={
                <span className="whitespace-pre-wrap">{location.access}</span>
              }
              className="sm:col-span-2"
            />
          )}
          <DetailField label="並び順" value={String(location.sortOrder)} />
        </div>
      </DetailSection>

      {/* 画像 */}
      <Card>
        <CardHeader>
          <CardTitle>画像</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div>
              <div className="text-sm text-muted-foreground mb-2">建物画像</div>
              <div className="relative h-64 w-full">
                <Image
                  src={location.imageUrl}
                  alt={location.name}
                  fill
                  className="rounded-lg object-cover"
                  sizes="(max-width: 768px) 100vw, 50vw"
                />
              </div>
            </div>
            {location.imageUrls.length > 0 && (
              <div>
                <div className="text-sm text-muted-foreground mb-2">
                  追加画像（{location.imageUrls.length}枚）
                </div>
                <div className="grid gap-2 grid-cols-2 sm:grid-cols-4">
                  {location.imageUrls.map((url: string, index: number) => (
                    <div key={url} className="relative aspect-square">
                      <Image
                        src={url}
                        alt={`${location.name} ${index + 1}`}
                        fill
                        className="rounded-lg object-cover"
                        sizes="(max-width: 640px) 50vw, 25vw"
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* 営業時間 */}
      {location.businessHours &&
        Object.keys(location.businessHours).length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>営業時間</CardTitle>
            </CardHeader>
            <CardContent>
              <pre className="text-sm whitespace-pre-wrap">
                {JSON.stringify(location.businessHours, null, 2)}
              </pre>
            </CardContent>
          </Card>
        )}

      {/* メタ情報 */}
      <DetailSection title="メタ情報">
        <div className="grid gap-4 sm:grid-cols-2">
          <DetailField
            label="作成日時"
            value={formatDateTimeShort(location.createdAt)}
          />
          <DetailField
            label="更新日時"
            value={formatDateTimeShort(location.updatedAt)}
          />
          <DetailField
            label="状態"
            value={
              <Badge variant={location.isActive ? "secondary" : "destructive"}>
                {location.isActive ? "アクティブ" : "削除済み"}
              </Badge>
            }
          />
        </div>
      </DetailSection>
    </div>
  );
}
