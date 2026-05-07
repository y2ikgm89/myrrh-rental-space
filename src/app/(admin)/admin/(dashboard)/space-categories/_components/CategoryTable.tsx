import {
  Badge,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/admin/components/ui";
import { EmptyState } from "@/admin/components/EmptyState";
import { CuratedIcon } from "@/shared/components/icon-curation/CuratedIcon";
import { CategoryActionCell } from "./CategoryActionCell";
import type { SpaceCategoryWithStats } from "@/shared/lib/validations/space-category";

type CategoryTableProps = {
  categories: SpaceCategoryWithStats[];
};

export function CategoryTable({ categories }: CategoryTableProps) {
  if (categories.length === 0) {
    return <EmptyState message="カテゴリーがありません" />;
  }

  return (
    <div className="overflow-hidden rounded-lg border bg-card">
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="hidden w-16 md:table-cell">
                並び順
              </TableHead>
              <TableHead>カテゴリー名</TableHead>
              <TableHead className="hidden lg:table-cell">説明</TableHead>
              <TableHead className="hidden w-24 lg:table-cell">
                アイコン
              </TableHead>
              <TableHead className="hidden w-24 lg:table-cell">色</TableHead>
              <TableHead className="hidden w-24 text-center md:table-cell">
                スペース数
              </TableHead>
              <TableHead className="w-28 text-center">状態</TableHead>
              <TableHead className="w-32 text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {categories.map((category) => (
              <TableRow key={category.id}>
                <TableCell className="hidden text-muted-foreground md:table-cell">
                  {category.sortOrder}
                </TableCell>
                <TableCell className="font-medium">{category.name}</TableCell>
                <TableCell className="hidden lg:table-cell">
                  <span className="text-sm text-muted-foreground line-clamp-2">
                    {category.description || "-"}
                  </span>
                </TableCell>
                <TableCell className="hidden lg:table-cell">
                  {category.icon ? (
                    <span className="inline-flex items-center gap-2">
                      <CuratedIcon
                        name={category.icon}
                        className="h-4 w-4 text-foreground"
                      />
                      <code className="text-xs text-muted-foreground">
                        {category.icon}
                      </code>
                    </span>
                  ) : (
                    <span className="text-muted-foreground">-</span>
                  )}
                </TableCell>
                <TableCell className="hidden lg:table-cell">
                  {category.color ? (
                    <div className="flex items-center gap-2">
                      <div
                        className="h-6 w-6 rounded border"
                        style={{ backgroundColor: category.color }}
                      />
                      <code className="text-xs text-muted-foreground">
                        {category.color}
                      </code>
                    </div>
                  ) : (
                    <span className="text-muted-foreground">-</span>
                  )}
                </TableCell>
                <TableCell className="hidden text-center md:table-cell">
                  <Badge variant="secondary">{category._count.spaces}件</Badge>
                </TableCell>
                <TableCell className="text-center whitespace-nowrap">
                  {category.isActive ? (
                    <Badge variant="default">アクティブ</Badge>
                  ) : (
                    <Badge variant="secondary">非アクティブ</Badge>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  <CategoryActionCell category={category} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
