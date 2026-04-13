import Image from "next/image";
import Link from "next/link";
import { Badge, Button, PublishSwitch } from "@/admin/components/ui";
import { updateSpacePublish } from "@/admin/actions/space";
import type { SpaceWithStats } from "@/admin/lib/validations/space";
import { formatCurrency } from "@/shared/lib/pricing/format";
import { EmptyState } from "@/admin/components/EmptyState";
import { SpaceTableDesktop } from "./space-table-desktop";

// =============================================================================
// Types
// =============================================================================

type SpaceTableProps = {
  spaces: SpaceWithStats[];
};

// =============================================================================
// SpaceTable Component (Server Component)
// =============================================================================

export function SpaceTable({ spaces }: SpaceTableProps) {
  if (spaces.length === 0) {
    return (
      <EmptyState
        message="スペースがありません"
        action={{ label: "新規作成", href: "/admin/spaces/new" }}
      />
    );
  }

  return (
    <>
      <ul className="space-y-3 md:hidden">
        {spaces.map((space) => (
          <li
            key={space.id}
            className="rounded-lg border border-border bg-card p-4 shadow-sm"
          >
            <div className="flex gap-3">
              {space.mainImageUrl ? (
                <Image
                  src={space.mainImageUrl}
                  alt=""
                  width={56}
                  height={56}
                  className="size-14 shrink-0 rounded-md object-cover"
                />
              ) : null}
              <div className="min-w-0 flex-1">
                <Link
                  href={`/admin/spaces/${space.id}/edit`}
                  className="font-medium text-foreground hover:underline"
                >
                  {space.name}
                </Link>
                <p className="mt-1 text-sm text-muted-foreground line-clamp-2">
                  {space.descriptionPlainText}
                </p>
                <dl className="mt-2 grid gap-1 text-xs text-muted-foreground">
                  <div className="flex flex-wrap gap-x-2 gap-y-1">
                    <dt className="sr-only">所在地</dt>
                    <dd className="line-clamp-2">{space.displayAddress}</dd>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <dt className="sr-only">定員</dt>
                    <dd>
                      <Badge variant="secondary">{space.capacity}名</Badge>
                    </dd>
                    <dt className="sr-only">時間料金</dt>
                    <dd>{formatCurrency(space.hourlyPrice)}</dd>
                    {space.category ? (
                      <>
                        <dt className="sr-only">カテゴリ</dt>
                        <dd>
                          <Badge variant="outline">{space.category.name}</Badge>
                        </dd>
                      </>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <dt className="sr-only">予約数</dt>
                    <dd>
                      <Badge variant="secondary">
                        予約 {space._count.reservations}件
                      </Badge>
                    </dd>
                  </div>
                </dl>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <PublishSwitch
                    id={space.id}
                    isPublished={space.isPublished}
                    onToggle={updateSpacePublish}
                  />
                  <Button size="sm" variant="outline" asChild>
                    <Link href={`/admin/spaces/${space.id}`}>詳細</Link>
                  </Button>
                  <Button size="sm" asChild>
                    <Link href={`/admin/spaces/${space.id}/edit`}>編集</Link>
                  </Button>
                </div>
              </div>
            </div>
          </li>
        ))}
      </ul>

      <SpaceTableDesktop spaces={spaces} />
    </>
  );
}
