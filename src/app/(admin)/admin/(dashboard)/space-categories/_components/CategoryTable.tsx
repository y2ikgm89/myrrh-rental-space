import {
  Badge,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/admin/components/ui'
import { EditCategoryDialog } from './EditCategoryDialog'
import { DeleteCategoryButton } from './DeleteCategoryButton'
import type { SpaceCategoryWithStats } from '@/admin/lib/validations/space-category'

type CategoryTableProps = {
  categories: SpaceCategoryWithStats[]
}

export function CategoryTable({ categories }: CategoryTableProps) {
  if (categories.length === 0) {
    return (
      <div className="rounded-lg border bg-white p-12 text-center">
        <p className="text-muted-foreground">カテゴリーがありません</p>
      </div>
    )
  }

  return (
    <div className="overflow-hidden rounded-lg border bg-white">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-16">並び順</TableHead>
            <TableHead>カテゴリー名</TableHead>
            <TableHead>説明</TableHead>
            <TableHead className="w-24">アイコン</TableHead>
            <TableHead className="w-24">色</TableHead>
            <TableHead className="w-24 text-center">スペース数</TableHead>
            <TableHead className="w-24 text-center">状態</TableHead>
            <TableHead className="w-32 text-right">操作</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {categories.map((category) => (
            <TableRow key={category.id}>
              <TableCell className="text-muted-foreground">
                {category.sortOrder}
              </TableCell>
              <TableCell className="font-medium">{category.name}</TableCell>
              <TableCell>
                <span className="text-sm text-muted-foreground line-clamp-2">
                  {category.description || '-'}
                </span>
              </TableCell>
              <TableCell>
                {category.icon ? (
                  <code className="text-xs bg-muted px-1.5 py-0.5 rounded">
                    {category.icon}
                  </code>
                ) : (
                  <span className="text-muted-foreground">-</span>
                )}
              </TableCell>
              <TableCell>
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
              <TableCell className="text-center">
                <Badge variant="secondary">{category._count.spaces}件</Badge>
              </TableCell>
              <TableCell className="text-center">
                {category.isActive ? (
                  <Badge variant="default">アクティブ</Badge>
                ) : (
                  <Badge variant="secondary">非アクティブ</Badge>
                )}
              </TableCell>
              <TableCell className="text-right">
                <div className="flex items-center justify-end gap-2">
                  <EditCategoryDialog category={category} />
                  <DeleteCategoryButton category={category} />
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
