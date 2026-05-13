/**
 * ダッシュボード統計カードのスケルトン
 */

import { Card, CardContent, CardHeader } from "@/admin/components/ui/card";
import { Skeleton } from "@/admin/components/ui";

export function StatsCardsSkeleton() {
  return (
    <div className="grid gap-4 @md/main:grid-cols-2 @3xl/main:grid-cols-4">
      {Array.from({ length: 4 }, (_, i) => (
        <Card key={i}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <Skeleton className="h-4 w-24" variant="text" />
            <Skeleton className="h-5 w-5" />
          </CardHeader>
          <CardContent>
            <Skeleton className="mb-1 h-8 w-20" variant="text" />
            <Skeleton className="h-3 w-16" variant="text" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
