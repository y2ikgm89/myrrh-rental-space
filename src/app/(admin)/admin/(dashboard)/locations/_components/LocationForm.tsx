"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useId } from "react";
import { useFieldArray } from "react-hook-form";
import { IconPhotoPlus } from "@tabler/icons-react";
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Checkbox,
  Input,
  Switch,
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
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
  toTranslate3d,
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
import { BUSINESS_ATTRIBUTE_OPTIONS } from "@/shared/lib/business-attributes";
import {
  locationFormSchema,
  defaultLocationFormValues,
  type LocationFormInput,
} from "@/shared/lib/validations/location";
import {
  parseBusinessAttributes,
  parseBusinessHours,
} from "@/shared/lib/json-validators";
import { createLocation, updateLocation } from "@/admin/actions/location";
import type { LocationWithStats } from "@/shared/domain/locations/types";
import { cn } from "@/shared/lib/cn";
import {
  useSingleMediaPicker,
  useMultipleMediaPicker,
} from "@/admin/hooks/use-media-picker";
import { useFormAction } from "@/admin/hooks/useFormAction";
import { getPublishLabel } from "@/shared/lib/validations/enums/helpers";
import { LocationMeoScoreCard } from "./LocationMeoScoreCard";
import { LocationGbpSyncCard } from "./LocationGbpSyncCard";

type GlobalsMeoFlags = {
  businessName: boolean;
  establishedDate: boolean;
  socialLinks: boolean;
};

type LocationFormProps = {
  location?: LocationWithStats;
  mode: "create" | "edit";
  globals?: GlobalsMeoFlags;
  /** GBP 同期機能のグローバル ON/OFF（Settings.googleBusinessProfileEnabled） */
  gbpEnabledGlobally?: boolean;
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
    transform: toTranslate3d(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "flex items-center gap-2 rounded border p-2",
        isDragging && "z-50 shadow-lg ring-2 ring-primary/20",
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
// Sortable Access Line Item
// =============================================================================

type SortableAccessLineItemProps = {
  id: string;
  index: number;
  disabled?: boolean;
  onRemove: (index: number) => void;
};

function SortableAccessLineItem({
  id,
  index,
  disabled,
  onRemove,
}: SortableAccessLineItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id, ...(disabled !== undefined && { disabled }) });

  const style = {
    transform: toTranslate3d(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "flex items-center gap-2 rounded border p-2",
        isDragging && "z-50 shadow-lg ring-2 ring-primary/20",
      )}
    >
      <div {...attributes} {...listeners}>
        <DragHandle />
      </div>
      <FormField
        name={`accessLines.${index}.value`}
        render={({ field }) => (
          <FormItem className="flex-1">
            <FormControl>
              <Input
                {...field}
                placeholder="例: 東京メトロ「表参道駅」A1出口より徒歩5分"
                disabled={disabled}
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => onRemove(index)}
        disabled={disabled}
        aria-label={`経路 ${index + 1} を削除`}
      >
        削除
      </Button>
    </div>
  );
}

// =============================================================================
// Access Lines Field (useFieldArray + dnd-kit)
// =============================================================================

function AccessLinesField({ disabled }: { disabled: boolean }) {
  const dndContextId = useId();
  const { fields, append, remove, move } = useFieldArray<
    LocationFormInput,
    "accessLines"
  >({ name: "accessLines" });

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = fields.findIndex((f) => f.id === String(active.id));
    const newIndex = fields.findIndex((f) => f.id === String(over.id));
    if (oldIndex !== -1 && newIndex !== -1) move(oldIndex, newIndex);
  };

  return (
    <FormItem>
      <FormLabel>アクセス</FormLabel>
      <FormDescription>
        最寄り駅・路線・徒歩分数等を 1 経路ずつ入力します。並べ替え可。
      </FormDescription>
      <div className="space-y-2">
        <DndContext
          id={dndContextId}
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={fields.map((f) => f.id)}
            strategy={verticalListSortingStrategy}
          >
            {fields.map((field, index) => (
              <SortableAccessLineItem
                key={field.id}
                id={field.id}
                index={index}
                disabled={disabled}
                onRemove={remove}
              />
            ))}
          </SortableContext>
        </DndContext>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => append({ value: "" })}
          disabled={disabled || fields.length >= 20}
        >
          + 経路を追加
        </Button>
        {fields.length === 0 && (
          <p className="text-xs text-muted-foreground">
            まだ経路がありません。「+ 経路を追加」で 1 行目を追加してください。
          </p>
        )}
      </div>
    </FormItem>
  );
}

// =============================================================================
// Main Component
// =============================================================================

const DEFAULT_GLOBALS: GlobalsMeoFlags = {
  businessName: false,
  establishedDate: false,
  socialLinks: false,
};

export function LocationForm({
  location,
  mode,
  globals = DEFAULT_GLOBALS,
  gbpEnabledGlobally = false,
}: LocationFormProps) {
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
            slug: location.slug,
            name: location.name,
            description: location.description ?? "",
            address: location.address,
            postalCode: location.postalCode ?? "",
            prefecture: location.prefecture ?? "",
            city: location.city ?? "",
            streetAddress: location.streetAddress ?? "",
            buildingName: location.buildingName ?? "",
            accessLines: location.accessLines.map((value) => ({ value })),
            parkingInfo: location.parkingInfo ?? "",
            amenities: parseBusinessAttributes(location.amenities) ?? {},
            imageUrl: location.imageUrl,
            // LocationWithStats.imageUrls は string[] のため { url: string }[] へ変換
            imageUrls: location.imageUrls.map((url) => ({ url })),
            businessHours: parseBusinessHours(location.businessHours),
            specialHolidays: location.specialHolidays,
            latitude: location.latitude,
            longitude: location.longitude,
            googleBusinessPlaceId: location.googleBusinessPlaceId ?? "",
            googleReviewUrl: location.googleReviewUrl ?? "",
            priceRange: location.priceRange ?? "",
            paymentAccepted: location.paymentAccepted ?? "",
            phoneNumber: location.phoneNumber ?? "",
            email: location.email ?? "",
            sortOrder: location.sortOrder,
            isPublished: location.isPublished,
            isActive: location.isActive,
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
        <Tabs defaultValue="basic">
          <TabsList>
            <TabsTrigger value="basic">基本情報</TabsTrigger>
            <TabsTrigger value="meo">MEO</TabsTrigger>
          </TabsList>

          {/* 基本情報タブ */}
          <TabsContent
            value="basic"
            forceMount
            className="mt-6 space-y-6 data-[state=inactive]:hidden"
          >
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
                  name="slug"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        スラッグ（URL 識別子）{" "}
                        <span className="text-destructive">*</span>
                      </FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          placeholder="honkan"
                          disabled={isPending}
                        />
                      </FormControl>
                      <FormDescription>
                        公開 URL: <code>/access/{field.value || "slug"}</code>
                        <br />
                        小文字英数字とハイフンのみ。一度公開後の変更は SEO
                        に影響します。
                      </FormDescription>
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
                          value={field.value ?? ""}
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

                {/* 住所詳細（構造化データ用） */}
                <fieldset className="space-y-4 rounded-lg border p-4">
                  <legend className="px-1 text-sm font-medium">
                    住所詳細（構造化データ用）
                  </legend>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <FormField
                      control={form.control}
                      name="postalCode"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>郵便番号</FormLabel>
                          <FormControl>
                            <Input
                              {...field}
                              value={field.value ?? ""}
                              placeholder="150-0001"
                              disabled={isPending}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="prefecture"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>都道府県</FormLabel>
                          <FormControl>
                            <Input
                              {...field}
                              value={field.value ?? ""}
                              placeholder="東京都"
                              disabled={isPending}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <FormField
                      control={form.control}
                      name="city"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>市区町村</FormLabel>
                          <FormControl>
                            <Input
                              {...field}
                              value={field.value ?? ""}
                              placeholder="渋谷区"
                              disabled={isPending}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="streetAddress"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>番地</FormLabel>
                          <FormControl>
                            <Input
                              {...field}
                              value={field.value ?? ""}
                              placeholder="神宮前1-1-1"
                              disabled={isPending}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  <FormField
                    control={form.control}
                    name="buildingName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>建物名・階</FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            value={field.value ?? ""}
                            placeholder="Myrrhビル 3F"
                            disabled={isPending}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <p className="text-xs text-muted-foreground">
                    構造化住所は LocalBusiness JSON-LD
                    で使用されます。上の「住所」は表示用、ここは検索エンジン用です。
                  </p>
                </fieldset>

                <AccessLinesField disabled={isPending} />

                <FormField
                  control={form.control}
                  name="parkingInfo"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>駐車場案内</FormLabel>
                      <FormControl>
                        <Textarea
                          {...field}
                          value={field.value ?? ""}
                          placeholder={`例: 専用駐車場 3台\n近隣コインパーキング: タイムズ神宮前（徒歩1分・24時間）`}
                          rows={3}
                          disabled={isPending}
                        />
                      </FormControl>
                      <FormDescription>
                        この拠点の駐車場情報。拠点ごとに設定できます。
                      </FormDescription>
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
                          onChange={(e) =>
                            field.onChange(e.target.valueAsNumber)
                          }
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
                              <IconPhotoPlus className="h-8 w-8 text-muted-foreground" />
                            </div>
                          )}
                          <div className="flex-1 space-y-2">
                            <Button
                              type="button"
                              variant="outline"
                              onClick={() => mainImagePicker.openPicker()}
                              disabled={isPending}
                            >
                              <IconPhotoPlus className="mr-2 h-4 w-4" />
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
                    <IconPhotoPlus className="mr-2 h-4 w-4" />
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

            {/* 設備・サービス */}
            <Card>
              <CardHeader>
                <CardTitle>設備・サービス</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <FormLabel>この拠点の設備</FormLabel>
                  <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-4">
                    {BUSINESS_ATTRIBUTE_OPTIONS.map((attr) => (
                      <FormField
                        key={attr.key}
                        control={form.control}
                        name={`amenities.${attr.key}`}
                        render={({ field }) => (
                          <FormItem>
                            <div className="flex items-center gap-2">
                              <FormControl>
                                <Checkbox
                                  checked={field.value || false}
                                  onCheckedChange={(checked) =>
                                    field.onChange(checked === true)
                                  }
                                  disabled={isPending}
                                />
                              </FormControl>
                              <FormLabel className="cursor-pointer text-sm font-normal">
                                {attr.label}
                              </FormLabel>
                            </div>
                          </FormItem>
                        )}
                      />
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    拠点ごとに利用可能な設備を選択してください。
                  </p>
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
                          {getPublishLabel(field.value ?? false)}
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
          </TabsContent>

          {/* MEO タブ */}
          <TabsContent
            value="meo"
            forceMount
            className="mt-6 space-y-6 data-[state=inactive]:hidden"
          >
            <LocationMeoScoreCard control={form.control} globals={globals} />

            {location ? (
              <LocationGbpSyncCard
                locationId={location.id}
                googleBusinessPlaceId={location.googleBusinessPlaceId}
                gbpSyncEnabled={location.gbpSyncEnabled}
                gbpSyncedAt={location.gbpSyncedAt}
                gbpSyncError={location.gbpSyncError}
                gbpEnabledGlobally={gbpEnabledGlobally}
              />
            ) : null}

            <Card>
              <CardHeader>
                <CardTitle>MEO（ローカル検索最適化）</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <FormField
                    control={form.control}
                    name="latitude"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>緯度</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            step="any"
                            placeholder="35.6812"
                            disabled={isPending}
                            value={field.value ?? ""}
                            onChange={(e) => {
                              const val = e.target.value;
                              field.onChange(
                                val === "" ? null : parseFloat(val),
                              );
                            }}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="longitude"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>経度</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            step="any"
                            placeholder="139.7671"
                            disabled={isPending}
                            value={field.value ?? ""}
                            onChange={(e) => {
                              const val = e.target.value;
                              field.onChange(
                                val === "" ? null : parseFloat(val),
                              );
                            }}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="phoneNumber"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>電話番号</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          value={field.value ?? ""}
                          placeholder="03-1234-5678"
                          disabled={isPending}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>メールアドレス</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          value={field.value ?? ""}
                          type="email"
                          placeholder="info@example.com"
                          disabled={isPending}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="priceRange"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>価格帯</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          value={field.value ?? ""}
                          placeholder="¥1,000〜¥5,000/時間"
                          disabled={isPending}
                        />
                      </FormControl>
                      <FormDescription>
                        例: ¥1,000〜¥5,000/時間（最大 100 文字）
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="paymentAccepted"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>利用可能な決済方法</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          value={field.value ?? ""}
                          placeholder="現金, クレジットカード, 電子マネー"
                          disabled={isPending}
                        />
                      </FormControl>
                      <FormDescription>
                        現金, クレジットカード, 電子マネー, QRコード決済
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="googleBusinessPlaceId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Google Business Place ID</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          value={field.value ?? ""}
                          placeholder="ChIJ..."
                          disabled={isPending}
                        />
                      </FormControl>
                      <FormDescription>
                        Google Maps Platform で確認できます（ChIJ...）
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="googleReviewUrl"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Google 口コミ URL</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          value={field.value ?? ""}
                          placeholder="https://g.page/r/..."
                          disabled={isPending}
                        />
                      </FormControl>
                      <FormDescription>
                        お客様に口コミ投稿を促すための URL
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

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
