import Image from "next/image";
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
import { updateLocationPublished } from "@/admin/actions/location";
import type { LocationWithStats } from "@/shared/domain/locations/types";
import { EmptyState } from "@/admin/components/EmptyState";
import { LocationActionCell } from "./LocationActionCell";

// =============================================================================
// GbpSyncBadge — 拠点ごとの GBP 同期ステータス表示
// =============================================================================

function GbpSyncBadge({
  hasPlaceId,
  enabled,
  syncedAt,
  error,
}: {
  hasPlaceId: boolean;
  enabled: boolean;
  syncedAt: string | null;
  error: string | null;
}) {
  if (!hasPlaceId) return <Badge variant="secondary">Place ID 未設定</Badge>;
  if (!enabled) return <Badge variant="secondary">同期 OFF</Badge>;
  if (error)
    return (
      <Badge variant="destructive" title={error}>
        エラー
      </Badge>
    );
  if (syncedAt) return <Badge variant="success">同期済</Badge>;
  return <Badge variant="outline">未同期</Badge>;
}

// =============================================================================
// Types
// =============================================================================

type LocationTableProps = {
  locations: LocationWithStats[];
};

// =============================================================================
// LocationTable Component (Server Component)
// =============================================================================

export function LocationTable({ locations }: LocationTableProps) {
  if (locations.length === 0) {
    return (
      <EmptyState
        message="場所がありません"
        action={{ label: "新規作成", href: "/admin/locations/new" }}
      />
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border bg-card">
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>場所名</TableHead>
              <TableHead className="hidden lg:table-cell">住所</TableHead>
              <TableHead className="hidden text-right md:table-cell">
                スペース数
              </TableHead>
              <TableHead className="hidden text-center md:table-cell">
                GBP 同期
              </TableHead>
              <TableHead className="text-center">公開状態</TableHead>
              <TableHead className="text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {locations.map((location) => (
              <TableRow key={location.id}>
                <TableCell>
                  <div className="flex items-center gap-3">
                    {location.imageUrl && (
                      <Image
                        src={location.imageUrl}
                        alt={location.name}
                        width={40}
                        height={40}
                        className="rounded object-cover"
                        style={{ width: 40, height: 40 }}
                      />
                    )}
                    <div>
                      <div className="font-medium">{location.name}</div>
                      {location.description && (
                        <div className="text-sm text-muted-foreground line-clamp-1">
                          {location.description.slice(0, 50)}
                          {location.description.length > 50 && "..."}
                        </div>
                      )}
                    </div>
                  </div>
                </TableCell>
                <TableCell className="hidden lg:table-cell">
                  <div className="text-sm">{location.address}</div>
                </TableCell>
                <TableCell className="hidden text-right md:table-cell">
                  <Badge variant="secondary">{location._count.spaces}件</Badge>
                </TableCell>
                <TableCell className="hidden text-center md:table-cell">
                  <GbpSyncBadge
                    hasPlaceId={!!location.googleBusinessPlaceId}
                    enabled={location.gbpSyncEnabled}
                    syncedAt={location.gbpSyncedAt}
                    error={location.gbpSyncError}
                  />
                </TableCell>
                <TableCell className="text-center">
                  <PublishSwitch
                    id={location.id}
                    isPublished={location.isPublished}
                    onToggle={updateLocationPublished}
                    resourceLabel={`${location.name} の公開状態`}
                  />
                </TableCell>
                <TableCell className="text-right">
                  <LocationActionCell locationId={location.id} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
