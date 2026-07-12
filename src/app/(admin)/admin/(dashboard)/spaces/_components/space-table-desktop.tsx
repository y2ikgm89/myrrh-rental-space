"use client";

import Image from "next/image";
import Link from "next/link";
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
import {
  CheckboxCell,
  ClickableTableRow,
  stopRowClick,
} from "@/admin/components/table";
import { updateSpacePublished } from "@/admin/actions/space";
import type { SpaceWithStats } from "@/admin/lib/validations/space";
import { formatCurrency } from "@/shared/lib/pricing/format";
import { SpaceActionCell } from "./SpaceActionCell";

type SpaceTableDesktopProps = {
  spaces: SpaceWithStats[];
  selectedIds: string[];
  allSelected: boolean;
  onToggleAll: () => void;
  onToggleOne: (id: string) => void;
};

/**
 * スペース一覧テーブル（md 以上）。行クリックで詳細、名前リンクで編集。インタラクティブセルは行ナビを阻害しない。
 */
export function SpaceTableDesktop({
  spaces,
  selectedIds,
  allSelected,
  onToggleAll,
  onToggleOne,
}: SpaceTableDesktopProps) {
  return (
    <div className="hidden overflow-hidden rounded-lg border bg-card md:block">
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>
                <CheckboxCell
                  checked={allSelected}
                  onChange={onToggleAll}
                  aria-label="全てのスペースを選択"
                />
              </TableHead>
              <TableHead>スペース名</TableHead>
              <TableHead className="hidden xl:table-cell">カテゴリ</TableHead>
              <TableHead className="hidden lg:table-cell">所在地</TableHead>
              <TableHead className="hidden text-right lg:table-cell">
                定員
              </TableHead>
              <TableHead className="hidden text-right lg:table-cell">
                時間料金
              </TableHead>
              <TableHead className="hidden text-right xl:table-cell">
                予約数
              </TableHead>
              <TableHead>公開状態</TableHead>
              <TableHead className="text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {spaces.map((space) => (
              <ClickableTableRow
                key={space.id}
                href={`/admin/spaces/${space.id}`}
                aria-label={`${space.name} の詳細`}
              >
                <TableCell onClick={stopRowClick}>
                  <CheckboxCell
                    checked={selectedIds.includes(space.id)}
                    onChange={() => onToggleOne(space.id)}
                    aria-label={`${space.name} を選択`}
                  />
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-3">
                    {space.mainImageUrl && (
                      <Image
                        src={space.mainImageUrl}
                        alt=""
                        width={40}
                        height={40}
                        className="size-10 rounded object-cover"
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
                        {space.descriptionPlainText}
                      </div>
                    </div>
                  </div>
                </TableCell>
                <TableCell className="hidden xl:table-cell">
                  {space.category ? (
                    <Badge variant="outline">{space.category.name}</Badge>
                  ) : (
                    <span className="text-sm text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell className="hidden lg:table-cell">
                  <div className="text-sm">{space.displayAddress}</div>
                </TableCell>
                <TableCell className="hidden text-right lg:table-cell">
                  <Badge variant="secondary">{space.capacity}名</Badge>
                </TableCell>
                <TableCell className="hidden text-right lg:table-cell">
                  {formatCurrency(space.hourlyPrice)}
                </TableCell>
                <TableCell className="hidden text-right xl:table-cell">
                  <Badge variant="secondary">
                    {space._count.reservations}件
                  </Badge>
                </TableCell>
                <TableCell
                  onClick={(e) => e.stopPropagation()}
                  onKeyDown={(e) => e.stopPropagation()}
                >
                  <PublishSwitch
                    id={space.id}
                    isPublished={space.isPublished}
                    onToggle={updateSpacePublished}
                    resourceLabel={`${space.name} の公開状態`}
                  />
                </TableCell>
                <TableCell
                  className="text-right"
                  onClick={(e) => e.stopPropagation()}
                  onKeyDown={(e) => e.stopPropagation()}
                >
                  <SpaceActionCell spaceId={space.id} />
                </TableCell>
              </ClickableTableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
