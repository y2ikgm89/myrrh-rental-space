"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Badge,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  PublishSwitch,
} from "@/admin/components/ui";
import { updateSpacePublish } from "@/admin/actions/space";
import type { SpaceWithStats } from "@/admin/lib/validations/space";
import { formatCurrency } from "@/shared/lib/pricing/format";
import { spaceDescriptionListSnippet } from "@/shared/lib/space-description-list-snippet";
import { SpaceActionCell } from "./SpaceActionCell";

type SpaceTableDesktopProps = {
  spaces: SpaceWithStats[];
};

/**
 * スペース一覧テーブル（md 以上）。行クリックで詳細、名前リンクで編集。インタラクティブセルは行ナビを阻害しない。
 */
export function SpaceTableDesktop({ spaces }: SpaceTableDesktopProps) {
  const router = useRouter();

  return (
    <div className="hidden overflow-hidden rounded-lg border bg-card md:block">
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>スペース名</TableHead>
              <TableHead className="hidden lg:table-cell">所在地</TableHead>
              <TableHead className="hidden xl:table-cell">カテゴリ</TableHead>
              <TableHead className="hidden text-right lg:table-cell">
                定員
              </TableHead>
              <TableHead className="hidden text-right lg:table-cell">
                時間料金
              </TableHead>
              <TableHead className="text-center">公開状態</TableHead>
              <TableHead className="hidden text-right xl:table-cell">
                予約数
              </TableHead>
              <TableHead className="text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {spaces.map((space) => (
              <TableRow
                key={space.id}
                className="cursor-pointer"
                onClick={() => {
                  router.push(`/admin/spaces/${space.id}`);
                }}
              >
                <TableCell>
                  <div className="flex items-center gap-3">
                    {space.mainImageUrl && (
                      <Image
                        src={space.mainImageUrl}
                        alt=""
                        width={40}
                        height={40}
                        className="rounded object-cover"
                        style={{ width: 40, height: 40 }}
                      />
                    )}
                    <div className="min-w-0">
                      <Link
                        href={`/admin/spaces/${space.id}/edit`}
                        className="font-medium text-foreground hover:underline"
                        onClick={(e) => e.stopPropagation()}
                        onKeyDown={(e) => e.stopPropagation()}
                      >
                        {space.name}
                      </Link>
                      <div className="text-sm text-muted-foreground line-clamp-1">
                        {spaceDescriptionListSnippet(space.description)}
                      </div>
                    </div>
                  </div>
                </TableCell>
                <TableCell className="hidden lg:table-cell">
                  <div className="text-sm">{space.displayAddress}</div>
                </TableCell>
                <TableCell className="hidden xl:table-cell">
                  {space.category ? (
                    <Badge variant="outline">{space.category.name}</Badge>
                  ) : (
                    <span className="text-sm text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell className="hidden text-right lg:table-cell">
                  <Badge variant="secondary">{space.capacity}名</Badge>
                </TableCell>
                <TableCell className="hidden text-right lg:table-cell">
                  {formatCurrency(space.hourlyPrice)}
                </TableCell>
                <TableCell
                  className="text-center"
                  onClick={(e) => e.stopPropagation()}
                  onKeyDown={(e) => e.stopPropagation()}
                >
                  <PublishSwitch
                    id={space.id}
                    isPublished={space.isPublished}
                    onToggle={updateSpacePublish}
                  />
                </TableCell>
                <TableCell className="hidden text-right xl:table-cell">
                  <Badge variant="secondary">
                    {space._count.reservations}件
                  </Badge>
                </TableCell>
                <TableCell
                  className="text-right"
                  onClick={(e) => e.stopPropagation()}
                  onKeyDown={(e) => e.stopPropagation()}
                >
                  <SpaceActionCell spaceId={space.id} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
