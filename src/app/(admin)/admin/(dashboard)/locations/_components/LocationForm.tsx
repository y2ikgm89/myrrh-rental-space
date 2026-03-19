"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useId } from "react";
import { useFieldArray } from "react-hook-form";
import { ImagePlus } from "lucide-react";
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  Switch,
  Textarea,
  DndContext,
  closestCenter,
  useSensor,
  useSensors,
  PointerSensor,
  KeyboardSensor,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
  CSS,
  Form,
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormDescription,
  FormMessage,
  SubmitButton,
  type DragEndEvent,
} from "@/admin/components/ui";
import {
  locationFormSchema,
  defaultLocationFormValues,
  type LocationFormInput,
} from "@/shared/lib/validations/location";
import { createLocation, updateLocation } from "@/admin/actions/location";
import type { LocationWithStats } from "@/shared/domain/locations/types";
import { cn } from "@/shared/lib/cn";
import {
  useSingleMediaPicker,
  useMultipleMediaPicker,
} from "@/admin/hooks/use-media-picker";
import { useFormAction } from "@/admin/hooks/useFormAction";

type LocationFormProps = {
  location?: LocationWithStats;
  mode: "create" | "edit";
};

// =============================================================================
// Drag Handle
// =============================================================================

function DragHandle({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "flex h-8 w-8 cursor-grab items-center justify-center rounded text-muted-foreground transition-colors",
        "hover:bg-muted hover:text-foreground",
        "active:cursor-grabbing",
        className,
      )}
      aria-label="ドラッグして並び替え"
    >
      <svg
        className="h-4 w-4"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        viewBox="0 0 24 24"
      >
        <path
          d="M4 8h16M4 16h16"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}

// =============================================================================
// Sortable Image Item
// =============================================================================

type SortableImageItemProps = {
  id: string;
  url: string;
  index: number;
  onRemove: (index: number) => void;
  disabled?: boolean;
};

function SortableImageItem({
  id,
  url,
  index,
  onRemove,
  disabled,
}: SortableImageItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id, ...(disabled !== undefined && { disabled }) });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "flex items-center gap-2 rounded border p-2",
        isDragging && "z-50 bg-muted/80 shadow-lg",
      )}
    >
      <div {...attributes} {...listeners}>
        <DragHandle />
      </div>
      <Image
        src={url}
        alt={`画像${index + 1}`}
        width={40}
        height={40}
        className="rounded object-cover"
        style={{ width: 40, height: 40 }}
      />
      <span className="flex-1 truncate text-sm">{url}</span>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => onRemove(index)}
        disabled={disabled}
      >
        削除
      </Button>
    </div>
  );
}

// =============================================================================
// Main Component
// =============================================================================

export function LocationForm({ location, mode }: LocationFormProps) {
  const router = useRouter();
  // DndContext の id は SSR hydration mismatch 防止に必要
  const dndContextId = useId();

  const { form, isPending, onSubmit } = useFormAction(
    locationFormSchema,
    (data: LocationFormInput) => {
      if (mode === "create") return createLocation(data);
      if (!location) throw new Error("location is required for edit mode");
      return updateLocation(location.id, data);
    },
    {
      defaultValues: location
        ? {
            name: location.name,
            description: location.description ?? "",
            address: location.address,
            access: location.access ?? "",
            imageUrl: location.imageUrl,
            // LocationWithStats.imageUrls は string[] のため { url: string }[] へ変換
            imageUrls: location.imageUrls.map((url) => ({ url })),
            businessHours: location.businessHours,
            sortOrder: location.sortOrder,
            isPublished: location.isPublished,
          }
        : defaultLocationFormValues,
      onSuccess: (data) => {
        if (mode === "create") {
          router.push(`/admin/locations/${data.id}`);
        } else {
          router.push("/admin/spaces?tab=locations");
        }
      },
    },
  );

  // useFieldArray で imageUrls を管理
  // fields[].id は RHF が生成する安定した一意 ID — dnd-kit の SortableContext items に使用する
  const { fields, append, remove, move } = useFieldArray({
    control: form.control,
    name: "imageUrls",
  });

  // D&D Sensors
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const handleImageDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    // fields[].id（RHF 安定 ID）で oldIndex / newIndex を特定
    const oldIndex = fields.findIndex((f) => f.id === String(active.id));
    const newIndex = fields.findIndex((f) => f.id === String(over.id));

    if (oldIndex !== -1 && newIndex !== -1) {
      // useFieldArray の move() で並び替え（arrayMove 不要）
      move(oldIndex, newIndex);
    }
  };

  // Media pickers
  const mainImagePicker = useSingleMediaPicker({
    defaultUsage: "SPACE",
    onSelect: (media) => {
      const selected = media[0];
      if (selected) {
        form.setValue("imageUrl", selected.url, { shouldValidate: true });
      }
    },
  });

  const additionalImagesPicker = useMultipleMediaPicker({
    defaultUsage: "SPACE",
    // fields.length はリアクティブ（useFieldArray が管理）
    maxSelections: 10 - fields.length,
    onSelect: (media) => {
      if (media.length > 0) {
        const remaining = 10 - fields.length;
        append(media.slice(0, remaining).map((m) => ({ url: m.url })));
      }
    },
  });

  return (
    <Form {...form}>
      <form onSubmit={onSubmit} className="space-y-6">
        {/* 基本情報 */}
        <Card>
          <CardHeader>
            <CardTitle>基本情報</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    場所名 <span className="text-destructive">*</span>
                  </FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      placeholder="例: Myrrhビル"
                      disabled={isPending}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>説明</FormLabel>
                  <FormControl>
                    <Textarea
                      {...field}
                      placeholder="建物・施設の説明を入力..."
                      rows={4}
                      disabled={isPending}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="address"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    住所 <span className="text-destructive">*</span>
                  </FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      placeholder="例: 東京都渋谷区..."
                      disabled={isPending}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="access"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>アクセス</FormLabel>
                  <FormControl>
                    <Textarea
                      {...field}
                      placeholder={`例: 渋谷駅から徒歩5分\n地下鉄A出口すぐ`}
                      rows={3}
                      disabled={isPending}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="sortOrder"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>並び順</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      {...field}
                      onChange={(e) => field.onChange(e.target.valueAsNumber)}
                      placeholder="0"
                      disabled={isPending}
                    />
                  </FormControl>
                  <FormDescription>
                    数値が小さいほど先頭に表示されます
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </CardContent>
        </Card>

        {/* 画像設定 */}
        <Card>
          <CardHeader>
            <CardTitle>画像設定</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* メイン画像 */}
            <FormField
              control={form.control}
              name="imageUrl"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    建物画像 <span className="text-destructive">*</span>
                  </FormLabel>
                  <FormControl>
                    <div className="flex items-start gap-4">
                      {field.value ? (
                        <div className="relative h-24 w-24 overflow-hidden rounded-lg border">
                          <Image
                            src={field.value}
                            alt="建物画像"
                            fill
                            sizes="96px"
                            className="object-cover"
                          />
                        </div>
                      ) : (
                        <div className="flex h-24 w-24 items-center justify-center rounded-lg border border-dashed bg-muted">
                          <ImagePlus className="h-8 w-8 text-muted-foreground" />
                        </div>
                      )}
                      <div className="flex-1 space-y-2">
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => mainImagePicker.openPicker()}
                          disabled={isPending}
                        >
                          <ImagePlus className="mr-2 h-4 w-4" />
                          画像を選択
                        </Button>
                        {field.value && (
                          <p className="truncate text-sm text-muted-foreground">
                            {field.value}
                          </p>
                        )}
                      </div>
                    </div>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* 追加画像（useFieldArray で管理） */}
            <div className="space-y-2">
              <p className="text-sm font-medium leading-none">
                追加画像（最大10枚）
              </p>
              <Button
                type="button"
                variant="outline"
                onClick={() => additionalImagesPicker.openPicker()}
                disabled={isPending || fields.length >= 10}
              >
                <ImagePlus className="mr-2 h-4 w-4" />
                画像を追加
              </Button>
              {fields.length > 0 && (
                <>
                  <p className="text-sm text-muted-foreground">
                    {fields.length} / 10 枚選択中 ・
                    ドラッグ&ドロップで順序を変更できます
                  </p>
                  <DndContext
                    id={dndContextId}
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    onDragEnd={handleImageDragEnd}
                  >
                    <SortableContext
                      // fields[].id（RHF 安定 ID）を使用 — URL ではなく RHF 管理 ID
                      items={fields.map((f) => f.id)}
                      strategy={verticalListSortingStrategy}
                    >
                      <div className="mt-2 space-y-2">
                        {fields.map((field, index) => (
                          <SortableImageItem
                            key={field.id}
                            id={field.id}
                            url={field.url}
                            index={index}
                            onRemove={remove}
                            disabled={isPending}
                          />
                        ))}
                      </div>
                    </SortableContext>
                  </DndContext>
                </>
              )}
            </div>
          </CardContent>
        </Card>

        {/* 公開設定 */}
        <Card>
          <CardHeader>
            <CardTitle>公開設定</CardTitle>
          </CardHeader>
          <CardContent>
            <FormField
              control={form.control}
              name="isPublished"
              render={({ field }) => (
                <FormItem className="flex flex-row items-center gap-4">
                  <FormControl>
                    <Switch
                      checked={field.value ?? false}
                      onCheckedChange={field.onChange}
                      disabled={isPending}
                    />
                  </FormControl>
                  <div>
                    <FormLabel className="text-base font-medium">
                      {field.value ? "公開中" : "非公開"}
                    </FormLabel>
                    <FormDescription>
                      {field.value
                        ? "この場所は公開ページに表示されます"
                        : "この場所は公開ページに表示されません"}
                    </FormDescription>
                  </div>
                </FormItem>
              )}
            />
          </CardContent>
        </Card>

        {/* ボタン */}
        <div className="flex justify-end gap-4">
          <Button
            type="button"
            variant="outline"
            onClick={() => router.back()}
            disabled={isPending}
          >
            キャンセル
          </Button>
          <SubmitButton
            isPending={isPending}
            label={mode === "create" ? "作成" : "更新"}
            pendingLabel={mode === "create" ? "作成中..." : "更新中..."}
            {...(mode === "edit" && { disabled: !form.formState.isDirty })}
          />
        </div>

        {/* メディアピッカーダイアログ */}
        {mainImagePicker.mediaPickerDialog}
        {additionalImagesPicker.mediaPickerDialog}
      </form>
    </Form>
  );
}
