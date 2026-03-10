/**
 * ダッシュボード統計カードのスケルトン
 */

import { Card, CardContent, CardHeader } from "@/admin/components/ui/card";

export function StatsCardsSkeleton() {
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      {Array.from({ length: 4 }).map((_, i) => (
        // eslint-disable-next-line @eslint-react/no-array-index-key
        <Card key={i}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <div className="h-4 w-24 animate-pulse rounded bg-muted" />
          </CardHeader>
          <CardContent>
            <div className="h-8 w-20 animate-pulse rounded bg-muted mb-1" />
            <div className="h-3 w-16 animate-pulse rounded bg-muted" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
