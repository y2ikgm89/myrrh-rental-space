import { afterEach, describe, expect, mock, test } from "bun:test";
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { PageData } from "@/shared/domain/pages/types";

Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", {
  value: true,
  configurable: true,
});

function Passthrough({
  children,
  ...props
}: {
  children?: ReactNode;
  [key: string]: unknown;
}) {
  return <div {...props}>{children}</div>;
}

// `@/admin/components/ui` barrel の全 export を stub する。
// `mock.module` は registered に対して **完全モック**として上書きするため、
// 一部だけ含めると後続テスト / 連鎖 import で
// `Export named 'X' not found` が発生する（→ `bun-patterns.md` §mock.module の
// グローバルスコープ干渉）。
const PassEl = ({
  children,
  ...props
}: {
  children?: ReactNode;
  [key: string]: unknown;
}) => <div {...props}>{children}</div>;
const NoopFn = () => undefined;
const StubVariants = () => "";

mock.module("@/admin/components/ui", () => ({
  // 実際に test 内で意味を持たせる stub（Table 系 / Badge）
  Badge: ({ children }: { children?: ReactNode }) => <span>{children}</span>,
  badgeVariants: StubVariants,
  Table: ({ children }: { children?: ReactNode }) => <table>{children}</table>,
  TableHeader: PassEl,
  TableBody: ({ children }: { children?: ReactNode }) => (
    <tbody>{children}</tbody>
  ),
  TableFooter: PassEl,
  TableHead: PassEl,
  TableRow: ({ children, ...props }: { children?: ReactNode }) => (
    <tr {...props}>{children}</tr>
  ),
  TableCell: ({ children, ...props }: { children?: ReactNode }) => (
    <td {...props}>{children}</td>
  ),
  TableCaption: PassEl,
  // 以下は使用しないが barrel を完全モックするため stub を提供
  Button: PassEl,
  buttonVariants: StubVariants,
  Input: PassEl,
  Card: PassEl,
  CardHeader: PassEl,
  CardFooter: PassEl,
  CardTitle: PassEl,
  CardDescription: PassEl,
  CardContent: PassEl,
  Select: PassEl,
  SelectGroup: PassEl,
  SelectValue: PassEl,
  SelectTrigger: PassEl,
  SelectContent: PassEl,
  SelectLabel: PassEl,
  SelectItem: PassEl,
  SelectSeparator: PassEl,
  Dialog: PassEl,
  DialogPortal: PassEl,
  DialogOverlay: PassEl,
  DialogClose: PassEl,
  DialogTrigger: PassEl,
  DialogContent: PassEl,
  DialogHeader: PassEl,
  DialogFooter: PassEl,
  DialogTitle: PassEl,
  DialogDescription: PassEl,
  AlertDialog: PassEl,
  AlertDialogPortal: PassEl,
  AlertDialogOverlay: PassEl,
  AlertDialogTrigger: PassEl,
  AlertDialogContent: PassEl,
  AlertDialogHeader: PassEl,
  AlertDialogFooter: PassEl,
  AlertDialogTitle: PassEl,
  AlertDialogDescription: PassEl,
  AlertDialogAction: PassEl,
  AlertDialogCancel: PassEl,
  Textarea: PassEl,
  Label: PassEl,
  Switch: PassEl,
  PublishSwitch: PassEl,
  DropdownMenu: PassEl,
  DropdownMenuTrigger: PassEl,
  DropdownMenuContent: PassEl,
  DropdownMenuItem: PassEl,
  DropdownMenuCheckboxItem: PassEl,
  DropdownMenuRadioItem: PassEl,
  DropdownMenuLabel: PassEl,
  DropdownMenuSeparator: PassEl,
  DropdownMenuShortcut: PassEl,
  DropdownMenuGroup: PassEl,
  DropdownMenuPortal: PassEl,
  DropdownMenuSub: PassEl,
  DropdownMenuSubTrigger: PassEl,
  DropdownMenuSubContent: PassEl,
  DropdownMenuRadioGroup: PassEl,
  Tabs: PassEl,
  TabsList: PassEl,
  TabsTrigger: PassEl,
  TabsContent: PassEl,
  // Test side queries `input[aria-label="..."]` to drive checkbox events,
  // so render a real <input type="checkbox"> rather than a Passthrough <div>.
  Checkbox: ({
    "aria-label": ariaLabel,
    onChange,
    checked,
    ...props
  }: {
    "aria-label"?: string;
    onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
    checked?: boolean;
    [key: string]: unknown;
  }) => (
    <input
      type="checkbox"
      aria-label={ariaLabel}
      onChange={onChange}
      checked={checked}
      {...props}
    />
  ),
  // Sortable (Drag & Drop)
  DragHandle: PassEl,
  SortableItemWrapper: PassEl,
  SortableTableRow: PassEl,
  SortableList: PassEl,
  DndContext: PassEl,
  closestCenter: NoopFn,
  useSensor: NoopFn,
  useSensors: NoopFn,
  PointerSensor: class {},
  KeyboardSensor: class {},
  DragOverlay: PassEl,
  SortableContext: PassEl,
  sortableKeyboardCoordinates: NoopFn,
  useSortable: () => ({
    attributes: {},
    listeners: {},
    setNodeRef: NoopFn,
    transform: null,
    transition: undefined,
    isDragging: false,
  }),
  verticalListSortingStrategy: NoopFn,
  arrayMove: <T,>(arr: T[]) => arr,
  toTranslate3d: () => "",
  Pagination: () => <nav aria-label="pagination" />,
  Toaster: PassEl,
  Tooltip: PassEl,
  TooltipTrigger: PassEl,
  TooltipContent: PassEl,
  TooltipProvider: PassEl,
  Collapsible: PassEl,
  CollapsibleTrigger: PassEl,
  CollapsibleContent: PassEl,
  RadioGroup: PassEl,
  RadioGroupItem: PassEl,
  Separator: PassEl,
  SelectionBox: PassEl,
  Breadcrumb: PassEl,
  SubmitButton: PassEl,
  CharCount: PassEl,
  useFormField: () => ({
    id: "",
    name: "",
    formItemId: "",
    formDescriptionId: "",
    formMessageId: "",
  }),
  Form: PassEl,
  FormItem: PassEl,
  FormLabel: PassEl,
  FormField: PassEl,
  FormControl: PassEl,
  FormDescription: PassEl,
  FormMessage: PassEl,
  ToggleGroup: PassEl,
  ToggleGroupItem: PassEl,
  Accordion: PassEl,
  AccordionItem: PassEl,
  AccordionTrigger: PassEl,
  AccordionContent: PassEl,
  Command: PassEl,
  CommandDialog: PassEl,
  CommandInput: PassEl,
  CommandList: PassEl,
  CommandEmpty: PassEl,
  CommandGroup: PassEl,
  CommandItem: PassEl,
  CommandShortcut: PassEl,
  CommandSeparator: PassEl,
}));

mock.module("@/admin/components/EmptyState", () => ({
  EmptyState: ({ message }: { message: string }) => <div>{message}</div>,
}));

// PageListTable は `@/admin/components/table` から CheckboxCell を import する。
// テスト側で `<input>` を querySelector で取得するため、real input を返す stub にする。
// 親が <TableRow>=<tr> なので <td> ラップは省略（React DOM nesting 警告回避）。
mock.module("@/admin/components/table", () => ({
  CheckboxCell: ({
    "aria-label": ariaLabel,
    onChange,
    checked,
    ...props
  }: {
    "aria-label"?: string;
    onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
    checked?: boolean;
    [key: string]: unknown;
  }) => (
    <input
      type="checkbox"
      aria-label={ariaLabel}
      onChange={onChange}
      checked={checked}
      {...props}
    />
  ),
}));

mock.module("@/admin/components/status-badges", () => ({
  PageStatusBadge: ({ isPublished }: { isPublished: boolean }) => (
    <span>{isPublished ? "公開" : "下書き"}</span>
  ),
}));

mock.module("@/admin/components/ui/Pagination", () => ({
  Pagination: () => <nav aria-label="pagination" />,
}));

mock.module("@/shared/lib/date-format", () => ({
  formatDateTimeShort: () => "2026/01/01",
}));

mock.module(
  "@/app/(admin)/admin/(dashboard)/pages/_components/PageActions",
  () => ({
    PageActions: () => <button type="button">操作</button>,
  }),
);

mock.module(
  "@/app/(admin)/admin/(dashboard)/pages/_components/BulkActions",
  () => ({
    BulkActions: ({ selectedSlugs }: { selectedSlugs: string[] }) =>
      selectedSlugs.length > 0 ? (
        <div data-testid="bulk-actions">{selectedSlugs.length}件選択中</div>
      ) : null,
  }),
);

mock.module(
  "@/app/(admin)/admin/(dashboard)/pages/_components/CreatePageDialog",
  () => ({
    CreatePageDialog: () => <div />,
  }),
);

mock.module(
  "@/app/(admin)/admin/(dashboard)/pages/_components/PageTableHeader",
  () => ({
    PageTableHeader: () => (
      <thead>
        <tr>
          <th>選択</th>
          <th>タイトル</th>
        </tr>
      </thead>
    ),
  }),
);

const { PageListTable } =
  await import("@/app/(admin)/admin/(dashboard)/pages/_components/PageListTable");

function makePage(slug: string, title: string): PageData {
  return {
    id: `page-${slug}`,
    slug,
    title,
    description: null,
    metaDescription: null,
    metaKeywords: null,
    ogpTitle: null,
    ogpDescription: null,
    ogpImageUrl: null,
    isPublished: false,
    publishedAt: null,
    isActive: true,
    isSystemPage: false,
    showSidebar: null,
    sectionCount: 0,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
  };
}

describe("PageListTable", () => {
  let root: Root | undefined;
  let container: HTMLDivElement | undefined;

  afterEach(() => {
    if (root) {
      act(() => {
        root?.unmount();
      });
    }
    container?.remove();
    root = undefined;
    container = undefined;
  });

  test("ページ一覧の差し替え後は非表示ページの選択を一括操作に渡さない", async () => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(
        <PageListTable
          pages={[makePage("alpha", "Alpha"), makePage("beta", "Beta")]}
          total={2}
          currentPage={1}
          perPage={10}
        />,
      );
    });

    const checkbox = container.querySelector<HTMLInputElement>(
      'input[aria-label="Alpha を選択"]',
    );
    expect(checkbox).not.toBeNull();

    await act(async () => {
      checkbox?.dispatchEvent(
        new window.MouseEvent("click", { bubbles: true, cancelable: true }),
      );
    });

    expect(
      container.querySelector("[data-testid='bulk-actions']")?.textContent,
    ).toBe("1件選択中");

    await act(async () => {
      root?.render(
        <PageListTable
          pages={[makePage("gamma", "Gamma")]}
          total={1}
          currentPage={1}
          perPage={10}
        />,
      );
    });

    expect(container.querySelector("[data-testid='bulk-actions']")).toBeNull();
  });
});
