/**
 * 最近の予約/お問い合わせスケルトン
 */

import { Card, CardContent, CardHeader } from "@/admin/components/ui/card";
import { Skeleton } from "@/admin/components/ui";

function RecentItemCard() {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div className="space-y-1">
          <Skeleton className="h-6 w-32" variant="text" />
          <Skeleton className="h-4 w-16" variant="text" />
        </div>
        <Skeleton className="h-9 w-20" />
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {Array.from({ length: 5 }, (_, i) => (
            <div key={i} className="flex items-center gap-4">
              <Skeleton className="h-4 w-20" variant="text" />
              <Skeleton className="h-4 w-32" variant="text" />
              <Skeleton className="ml-auto h-5 w-14 rounded-full" />
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

export function RecentItemsSkeleton() {
  return (
    <div className="grid gap-6 md:grid-cols-2">
      <RecentItemCard />
      <RecentItemCard />
    </div>
  );
}
