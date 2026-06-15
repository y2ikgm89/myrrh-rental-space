/**
 * 本日の予約スケルトン
 */

import { Card, CardContent, CardHeader } from "@/admin/components/ui/card";
import { Skeleton } from "@/admin/components/ui";
import { skeletonKeys } from "@/shared/lib/skeleton-keys";

export function TodayReservationsSkeleton() {
  return (
    <Card>
      <CardHeader>
        <Skeleton className="h-6 w-32" variant="text" />
        <Skeleton className="h-4 w-40" variant="text" />
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {skeletonKeys(3, "today-row").map((key) => (
            <div key={key} className="flex items-center gap-4">
              <Skeleton className="h-4 w-24" variant="text" />
              <Skeleton className="h-4 w-32" variant="text" />
              <Skeleton className="h-4 w-20" variant="text" />
              <Skeleton className="h-5 w-16 rounded-full" />
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
