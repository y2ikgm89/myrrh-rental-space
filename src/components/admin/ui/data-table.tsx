'use client'

import * as React from 'react'
import {
  type ColumnDef,
  type ColumnFiltersState,
  type SortingState,
  type VisibilityState,
  type PaginationState,
  type RowSelectionState,
  type Table as TanstackTable,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table'
import { ChevronDown, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from './table'
import { Button } from './button'
import { Input } from './input'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from './dropdown-menu'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './select'
import { cn } from '@/lib/utils'

// =============================================================================
// Types
// =============================================================================

export interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[]
  data: TData[]
  /** フィルター対象のカラムID */
  filterColumn?: string
  /** フィルタープレースホルダー */
  filterPlaceholder?: string
  /** ページサイズオプション */
  pageSizeOptions?: number[]
  /** 空状態のメッセージ */
  emptyMessage?: string
  /** カラム表示切り替えを有効化 */
  enableColumnVisibility?: boolean
  /** 行選択を有効化 */
  enableRowSelection?: boolean
  /** ツールバーにカスタム要素を追加 */
  toolbarActions?: React.ReactNode
  /** テーブルコンテナのクラス名 */
  className?: string
  /** 初期ソート状態 */
  initialSorting?: SortingState
  /** 初期ページサイズ */
  initialPageSize?: number
}

// =============================================================================
// DataTableToolbar
// =============================================================================

interface DataTableToolbarProps<TData> {
  table: TanstackTable<TData>
  filterColumn?: string
  filterPlaceholder?: string
  enableColumnVisibility?: boolean
  toolbarActions?: React.ReactNode
}

function DataTableToolbar<TData>({
  table,
  filterColumn,
  filterPlaceholder = '検索...',
  enableColumnVisibility = true,
  toolbarActions,
}: DataTableToolbarProps<TData>) {
  const column = filterColumn ? table.getColumn(filterColumn) : undefined

  return (
    <div className="flex items-center justify-between py-4">
      <div className="flex flex-1 items-center gap-2">
        {column && (
          <Input
            placeholder={filterPlaceholder}
            value={(column.getFilterValue() as string) ?? ''}
            onChange={(event) => column.setFilterValue(event.target.value)}
            className="max-w-sm"
          />
        )}
        {toolbarActions}
      </div>
      {enableColumnVisibility && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" className="ml-auto">
              表示列 <ChevronDown className="ml-2 size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {table
              .getAllColumns()
              .filter((col) => col.getCanHide())
              .map((col) => (
                <DropdownMenuCheckboxItem
                  key={col.id}
                  className="capitalize"
                  checked={col.getIsVisible()}
                  onCheckedChange={(value) => col.toggleVisibility(!!value)}
                >
                  {col.id}
                </DropdownMenuCheckboxItem>
              ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  )
}

// =============================================================================
// DataTablePagination
// =============================================================================

interface DataTablePaginationProps<TData> {
  table: TanstackTable<TData>
  pageSizeOptions?: number[]
  enableRowSelection?: boolean
}

function DataTablePagination<TData>({
  table,
  pageSizeOptions = [10, 20, 30, 50, 100],
  enableRowSelection = false,
}: DataTablePaginationProps<TData>) {
  return (
    <div className="flex items-center justify-between px-2 py-4">
      {enableRowSelection ? (
        <div className="flex-1 text-sm text-muted-foreground">
          {table.getFilteredSelectedRowModel().rows.length} /{' '}
          {table.getFilteredRowModel().rows.length} 行を選択
        </div>
      ) : (
        <div className="flex-1 text-sm text-muted-foreground">
          {table.getFilteredRowModel().rows.length} 件
        </div>
      )}
      <div className="flex items-center space-x-6 lg:space-x-8">
        <div className="flex items-center space-x-2">
          <p className="text-sm font-medium">表示件数</p>
          <Select
            value={`${table.getState().pagination.pageSize}`}
            onValueChange={(value) => table.setPageSize(Number(value))}
          >
            <SelectTrigger className="h-8 w-[70px]">
              <SelectValue placeholder={table.getState().pagination.pageSize} />
            </SelectTrigger>
            <SelectContent side="top">
              {pageSizeOptions.map((pageSize) => (
                <SelectItem key={pageSize} value={`${pageSize}`}>
                  {pageSize}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex w-[100px] items-center justify-center text-sm font-medium">
          {table.getState().pagination.pageIndex + 1} / {table.getPageCount()} ページ
        </div>
        <div className="flex items-center space-x-2">
          <Button
            variant="outline"
            className="hidden size-8 p-0 lg:flex"
            onClick={() => table.setPageIndex(0)}
            disabled={!table.getCanPreviousPage()}
          >
            <span className="sr-only">最初のページ</span>
            <ChevronsLeft className="size-4" />
          </Button>
          <Button
            variant="outline"
            className="size-8 p-0"
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
          >
            <span className="sr-only">前のページ</span>
            <ChevronLeft className="size-4" />
          </Button>
          <Button
            variant="outline"
            className="size-8 p-0"
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage()}
          >
            <span className="sr-only">次のページ</span>
            <ChevronRight className="size-4" />
          </Button>
          <Button
            variant="outline"
            className="hidden size-8 p-0 lg:flex"
            onClick={() => table.setPageIndex(table.getPageCount() - 1)}
            disabled={!table.getCanNextPage()}
          >
            <span className="sr-only">最後のページ</span>
            <ChevronsRight className="size-4" />
          </Button>
        </div>
      </div>
    </div>
  )
}

// =============================================================================
// DataTable (Main Component)
// =============================================================================

export function DataTable<TData, TValue>({
  columns,
  data,
  filterColumn,
  filterPlaceholder,
  pageSizeOptions,
  emptyMessage = 'データがありません',
  enableColumnVisibility = true,
  enableRowSelection = false,
  toolbarActions,
  className,
  initialSorting = [],
  initialPageSize = 10,
}: DataTableProps<TData, TValue>) {
  const [sorting, setSorting] = React.useState<SortingState>(initialSorting)
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([])
  const [columnVisibility, setColumnVisibility] = React.useState<VisibilityState>({})
  const [rowSelection, setRowSelection] = React.useState<RowSelectionState>({})
  const [pagination, setPagination] = React.useState<PaginationState>({
    pageIndex: 0,
    pageSize: initialPageSize,
  })

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
    onRowSelectionChange: setRowSelection,
    onPaginationChange: setPagination,
    state: {
      sorting,
      columnFilters,
      columnVisibility,
      rowSelection,
      pagination,
    },
  })

  return (
    <div className={cn('space-y-4', className)}>
      {(filterColumn || enableColumnVisibility || toolbarActions) && (
        <DataTableToolbar
          table={table}
          filterColumn={filterColumn}
          filterPlaceholder={filterPlaceholder}
          enableColumnVisibility={enableColumnVisibility}
          toolbarActions={toolbarActions}
        />
      )}
      <div className="overflow-hidden rounded-lg border bg-white">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id}>
                    {header.isPlaceholder
                      ? null
                      : flexRender(
                          header.column.columnDef.header,
                          header.getContext()
                        )}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  data-state={row.getIsSelected() && 'selected'}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={columns.length} className="h-24 text-center">
                  {emptyMessage}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      <DataTablePagination
        table={table}
        pageSizeOptions={pageSizeOptions}
        enableRowSelection={enableRowSelection}
      />
    </div>
  )
}

// =============================================================================
// DataTableColumnHeader (ソート可能なヘッダー)
// =============================================================================

import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react'
import type { Column } from '@tanstack/react-table'

interface DataTableColumnHeaderProps<TData, TValue>
  extends React.HTMLAttributes<HTMLDivElement> {
  column: Column<TData, TValue>
  title: string
}

export function DataTableColumnHeader<TData, TValue>({
  column,
  title,
  className,
}: DataTableColumnHeaderProps<TData, TValue>) {
  if (!column.getCanSort()) {
    return <div className={cn(className)}>{title}</div>
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      className={cn('-ml-3 h-8 data-[state=open]:bg-accent', className)}
      onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
    >
      <span>{title}</span>
      {column.getIsSorted() === 'desc' ? (
        <ArrowDown className="ml-2 size-4" />
      ) : column.getIsSorted() === 'asc' ? (
        <ArrowUp className="ml-2 size-4" />
      ) : (
        <ArrowUpDown className="ml-2 size-4" />
      )}
    </Button>
  )
}

// =============================================================================
// Re-exports
// =============================================================================

export { type ColumnDef } from '@tanstack/react-table'
