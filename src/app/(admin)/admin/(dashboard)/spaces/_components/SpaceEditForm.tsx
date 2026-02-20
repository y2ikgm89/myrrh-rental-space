"use client";

import Image from "next/image";
import {
  useState,
  useEffect,
  useTransition,
  useId,
  useEffectEvent,
} from "react";
import { useRouter } from "next/navigation";
import { useForm, useWatch, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { ImagePlus, GripVertical, HelpCircle, X } from "lucide-react";
import dynamic from "next/dynamic";
import {
  Button,
  Input,
  Label,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  TooltipProvider,
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
  type DragEndEvent,
} from "@/admin/components/ui";
import { createSpace, updateSpace } from "@/admin/actions/space";
import { cn } from "@/shared/lib/utils";
import {
  useSingleMediaPicker,
  useMultipleMediaPicker,
} from "@/admin/hooks/use-media-picker";
import { logger } from "@/shared/lib/logger";
import {
  calculateTaxIncludedPrice,
  getTaxRate,
  getTaxRateLabel,
  type TaxSettings,
  DEFAULT_TAX_SETTINGS,
} from "@/shared/lib/pricing";
import {
  getValidTaxRateType,
  getValidDiscountType,
  getValidDurationDiscountOverride,
} from "@/shared/lib/validations/enums";
import type { SpaceWithStats } from "@/admin/lib/validations/space";
import {
  DiscountType,
  DurationDiscountOverride,
  TaxRateType,
} from "@/shared/generated/prisma/enums";
import {
  SEOFields,
  OGPFields,
  UnifiedPublishFields,
} from "@/admin/components/editor/inline/side-panel";

// =============================================================================
// Dynamic import (Lexical SSR 回避)
// =============================================================================
const RichTextEditor = dynamic(
  () =>
    import("@/admin/components/editor").then((mod) => ({
      default: mod.RichTextEditor,
    })),
  {
    ssr: false,
    loading: () => (
      <div className="h-[200px] flex items-center justify-center border rounded-lg bg-muted/50">
        <div className="animate-pulse text-muted-foreground">
          エディタを読み込み中...
        </div>
      </div>
    ),
  },
);

// =============================================================================
// Constants
// =============================================================================
const SELECT_NONE_VALUE = "__none__";

// =============================================================================
// Schema（RHF フォーム用 — imageUrls/facilities は object[] で useFieldArray 対応）
// =============================================================================
const formSchema = z.object({
  slug: z
    .string()
    .min(1, { error: "スラッグを入力してください" })
    .max(100, { error: "スラッグは100文字以内で入力してください" })
    .regex(/^[a-z0-9-]+$/, {
      error: "スラッグは小文字英数字とハイフンのみ使用可能です",
    }),
  name: z
    .string()
    .min(1, { error: "名前を入力してください" })
    .max(100, { error: "名前は100文字以内で入力してください" }),
  description: z
    .string()
    .min(1, { error: "説明を入力してください" })
    .min(10, { error: "説明は10文字以上で入力してください" }),
  address: z.string().min(1, { error: "住所を入力してください" }),
  access: z
    .string()
    .max(500, { error: "アクセス情報は500文字以内で入力してください" })
    .optional(),
  capacity: z
    .number()
    .int({ error: "整数を入力してください" })
    .min(1, { error: "定員は1以上で入力してください" })
    .max(1000, { error: "定員は1000以下で入力してください" }),
  area: z
    .number()
    .positive({ error: "正の数を入力してください" })
    .max(10000, { error: "面積は10000以下で入力してください" })
    .optional()
    .nullable(),
  hourlyPrice: z
    .number()
    .min(0, { error: "時間料金は0以上で入力してください" })
    .max(1000000, { error: "時間料金は1000000以下で入力してください" }),
  dailyPrice: z
    .number()
    .min(0, { error: "日額料金は0以上で入力してください" })
    .max(10000000, { error: "日額料金は10000000以下で入力してください" })
    .optional()
    .nullable(),
  mainImageUrl: z
    .string()
    .min(1, { error: "メイン画像を選択してください" })
    .url({ error: "有効なURLを入力してください" }),
  // useFieldArray 対応: object[]
  imageUrls: z
    .array(
      z.object({
        url: z.string().url({ error: "有効なURLを入力してください" }),
      }),
    )
    .max(10, { error: "画像は最大10枚までです" }),
  facilities: z.array(z.object({ value: z.string().min(1).max(50) })),
  isPublished: z.boolean(),
  termsId: z
    .string()
    .uuid({ error: "利用規約IDが無効です" })
    .optional()
    .nullable(),
  locationId: z
    .string()
    .uuid({ error: "場所IDが無効です" })
    .optional()
    .nullable(),
  categoryId: z
    .string()
    .uuid({ error: "カテゴリーIDが無効です" })
    .optional()
    .nullable(),
  discountType: z.enum(DiscountType),
  discountValue: z
    .number()
    .min(0, { error: "割引値は0以上で入力してください" })
    .max(1000000, { error: "割引値は1000000以下で入力してください" })
    .optional()
    .nullable(),
  durationDiscountOverride: z.enum(DurationDiscountOverride),
  taxRateType: z.enum(TaxRateType),
  metaDescription: z.string().optional(),
  metaKeywords: z.string().optional(),
  ogpTitle: z.string().optional(),
  ogpDescription: z.string().optional(),
  ogpImageUrl: z.string().optional(),
  publishedAt: z.string().optional(),
});

type FormData = z.infer<typeof formSchema>;

// =============================================================================
// Types（page.tsx から受け取る props）
// =============================================================================
type TermsOption = { id: string; title: string; type: string };
type LocationOption = { id: string; name: string; address: string };
type CategoryOption = {
  id: string;
  name: string;
  icon: string | null;
  color: string | null;
};

export type SpaceEditFormProps = {
  space?: SpaceWithStats; // 編集時のみ。新規作成時は undefined
  mode: "create" | "edit";
  availableTerms: TermsOption[];
  availableLocations: LocationOption[];
  availableCategories: CategoryOption[];
  taxSettings: TaxSettings;
};

// =============================================================================
// SortableImageItem（D&D サブコンポーネント）
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
  } = useSortable({ id, disabled });

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        "flex items-center gap-2 rounded border p-2",
        isDragging && "z-50 bg-muted/80 shadow-lg",
      )}
    >
      <div
        {...attributes}
        {...listeners}
        className="cursor-grab active:cursor-grabbing"
      >
        <GripVertical className="h-4 w-4 text-muted-foreground" />
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
        variant="ghost"
        size="sm"
        onClick={() => onRemove(index)}
        disabled={disabled}
        aria-label={`画像${index + 1}を削除`}
      >
        <X className="h-4 w-4" />
      </Button>
    </div>
  );
}

// =============================================================================
// SpaceEditForm（メインコンポーネント）
// =============================================================================
export function SpaceEditForm({
  space,
  mode,
  availableTerms,
  availableLocations,
  availableCategories,
  taxSettings = DEFAULT_TAX_SETTINGS,
}: SpaceEditFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [newFacility, setNewFacility] = useState("");
  const dndContextId = useId();

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: space
      ? {
          slug: space.slug,
          name: space.name,
          description: space.description,
          address: space.address,
          access: space.access ?? "",
          capacity: space.capacity,
          area: space.area ?? undefined,
          hourlyPrice: space.hourlyPrice,
          dailyPrice: space.dailyPrice ?? undefined,
          mainImageUrl: space.mainImageUrl,
          // string[] → { url: string }[]
          imageUrls: space.imageUrls.map((url) => ({ url })),
          // string[] → { value: string }[]
          facilities: space.facilities.map((value) => ({ value })),
          isPublished: space.isPublished,
          termsId: space.termsId ?? undefined,
          locationId: space.locationId ?? undefined,
          categoryId: space.categoryId ?? undefined,
          discountType: space.discountType ?? DiscountType.none,
          discountValue: space.discountValue ?? undefined,
          durationDiscountOverride:
            space.durationDiscountOverride ?? DurationDiscountOverride.inherit,
          taxRateType: getValidTaxRateType(space.taxRateType),
          metaDescription: space.metaDescription ?? "",
          metaKeywords: space.metaKeywords ?? "",
          ogpTitle: space.ogpTitle ?? "",
          ogpDescription: space.ogpDescription ?? "",
          ogpImageUrl: space.ogpImageUrl ?? "",
          publishedAt: space.publishedAt
            ? new Date(space.publishedAt).toISOString()
            : undefined,
        }
      : {
          slug: "",
          name: "",
          description: "",
          address: "",
          access: "",
          capacity: 10,
          area: undefined,
          hourlyPrice: 0,
          dailyPrice: undefined,
          mainImageUrl: "",
          imageUrls: [],
          facilities: [],
          isPublished: false,
          termsId: undefined,
          locationId: undefined,
          categoryId: undefined,
          discountType: DiscountType.none,
          discountValue: undefined,
          durationDiscountOverride: DurationDiscountOverride.inherit,
          taxRateType: TaxRateType.standard,
          metaDescription: "",
          metaKeywords: "",
          ogpTitle: "",
          ogpDescription: "",
          ogpImageUrl: "",
        },
  });

  const {
    register,
    handleSubmit,
    control,
    setValue,
    getValues,
    formState: { errors, isDirty },
  } = form;

  // useFieldArray: imageUrls（D&D ソート対応）
  const {
    fields: imageFields,
    append: appendImage,
    remove: removeImage,
    move: moveImage,
  } = useFieldArray({ control, name: "imageUrls" });

  // useFieldArray: facilities（追加・削除のみ）
  const {
    fields: facilityFields,
    append: appendFacility,
    remove: removeFacility,
  } = useFieldArray({ control, name: "facilities" });

  // useWatch（リアクティブな値参照）
  const name = useWatch({ control, name: "name" });
  const isPublished = useWatch({ control, name: "isPublished" });
  const termsId = useWatch({ control, name: "termsId" });
  const locationId = useWatch({ control, name: "locationId" });
  const categoryId = useWatch({ control, name: "categoryId" });
  const mainImageUrl = useWatch({ control, name: "mainImageUrl" });
  const description = useWatch({ control, name: "description" });
  const discountType = useWatch({ control, name: "discountType" });
  const discountValue = useWatch({ control, name: "discountValue" });
  const durationDiscountOverride = useWatch({
    control,
    name: "durationDiscountOverride",
  });
  const taxRateType = useWatch({ control, name: "taxRateType" });
  const hourlyPrice = useWatch({ control, name: "hourlyPrice" });
  const dailyPrice = useWatch({ control, name: "dailyPrice" });

  // 料金計算
  const calculateDiscountedPrice = (price: number): number => {
    if (!price || discountType === DiscountType.none || !discountValue)
      return price;
    if (discountType === DiscountType.percentage)
      return Math.round(price * (1 - discountValue / 100));
    if (discountType === DiscountType.fixed)
      return Math.max(0, price - discountValue);
    return price;
  };
  const discountedHourlyPrice = calculateDiscountedPrice(hourlyPrice || 0);
  const discountedDailyPrice = dailyPrice
    ? calculateDiscountedPrice(dailyPrice)
    : null;
  const hasDiscount =
    discountType !== DiscountType.none && discountValue && discountValue > 0;
  const currentTaxRate = getTaxRate(taxRateType, taxSettings);
  const taxIncludedHourlyPrice = calculateTaxIncludedPrice(
    hourlyPrice || 0,
    currentTaxRate,
  );
  const taxIncludedDailyPrice = dailyPrice
    ? calculateTaxIncludedPrice(dailyPrice, currentTaxRate)
    : null;
  const discountedTaxIncludedHourlyPrice = calculateTaxIncludedPrice(
    discountedHourlyPrice,
    currentTaxRate,
  );
  const discountedTaxIncludedDailyPrice =
    discountedDailyPrice !== null
      ? calculateTaxIncludedPrice(discountedDailyPrice, currentTaxRate)
      : null;

  // メディアピッカー
  const mainImagePicker = useSingleMediaPicker({
    defaultUsage: "SPACE",
    onSelect: (media) => {
      const selected = media[0];
      if (selected)
        setValue("mainImageUrl", selected.url, { shouldDirty: true });
    },
  });
  const additionalImagesPicker = useMultipleMediaPicker({
    defaultUsage: "SPACE",
    maxSelections: 10 - imageFields.length,
    onSelect: (media) => {
      media.forEach((m) => appendImage({ url: m.url }));
    },
  });

  // D&D Sensors
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  // フォーム送信（useEffectEvent で onSubmit を deps から除外）
  const onSubmit = (data: FormData) => {
    startTransition(async () => {
      try {
        const payload = {
          slug: data.slug,
          name: data.name,
          description: data.description,
          address: data.address,
          capacity: data.capacity,
          hourlyPrice: data.hourlyPrice,
          mainImageUrl: data.mainImageUrl,
          // { url: string }[] → string[]
          imageUrls: data.imageUrls.map((f) => f.url),
          // { value: string }[] → string[]
          facilities: data.facilities.map((f) => f.value),
          isPublished: data.isPublished ?? false,
          access: data.access || undefined,
          area: data.area || undefined,
          dailyPrice: data.dailyPrice != null ? data.dailyPrice : undefined,
          termsId: data.termsId || undefined,
          locationId: data.locationId || undefined,
          categoryId: data.categoryId || undefined,
          discountType: data.discountType ?? DiscountType.none,
          discountValue:
            data.discountType !== DiscountType.none
              ? (data.discountValue ?? null)
              : null,
          durationDiscountOverride:
            data.durationDiscountOverride ?? DurationDiscountOverride.inherit,
          taxRateType: data.taxRateType ?? TaxRateType.standard,
          metaDescription: data.metaDescription || null,
          metaKeywords: data.metaKeywords || null,
          ogpTitle: data.ogpTitle || null,
          ogpDescription: data.ogpDescription || null,
          ogpImageUrl: data.ogpImageUrl || null,
        };

        if (mode === "create") {
          const result = await createSpace(payload);
          if (result.success) {
            toast.success("スペースを作成しました");
            router.push(`/admin/spaces/${result.data.id}`);
          } else {
            toast.error(result.error);
          }
        } else if (space) {
          const result = await updateSpace(space.id, payload);
          if (result.success) {
            form.reset(data);
            router.refresh();
            toast.success("スペースを保存しました");
          } else {
            toast.error(result.error);
          }
        }
      } catch (error) {
        logger.error("保存中にエラーが発生しました", {
          error: error instanceof Error ? error.message : String(error),
        });
        toast.error("保存中にエラーが発生しました");
      }
    });
  };

  // Ctrl+S 保存（useEffectEvent で handleSubmit を deps から除外）
  const triggerSave = useEffectEvent(() => {
    void handleSubmit(onSubmit)();
  });
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        triggerSave();
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);

  // ブラウザ離脱警告
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (isDirty) e.preventDefault();
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isDirty]);

  // D&D ドラッグ終了（fields[].id ベース + move()）
  const handleImageDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = imageFields.findIndex((f) => f.id === String(active.id));
    const newIndex = imageFields.findIndex((f) => f.id === String(over.id));
    if (oldIndex !== -1 && newIndex !== -1) moveImage(oldIndex, newIndex);
  };

  const addFacility = () => {
    const trimmed = newFacility.trim();
    const alreadyExists = facilityFields.some((f) => f.value === trimmed);
    if (trimmed && !alreadyExists) {
      appendFacility({ value: trimmed });
      setNewFacility("");
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      {/* ── 2カラムグリッド ── */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* ══ 左カラム: 基本情報 ══ */}
        <Card>
          <CardHeader>
            <CardTitle>基本情報</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* スペース名 */}
            <div className="space-y-2">
              <Label htmlFor="name">スペース名 *</Label>
              <Input
                id="name"
                {...register("name")}
                placeholder="例: 会議室A"
                disabled={isPending}
              />
              {errors.name && (
                <p className="text-sm text-destructive">
                  {errors.name.message}
                </p>
              )}
            </div>

            {/* スラッグ */}
            <div className="space-y-2">
              <Label htmlFor="slug">スラッグ *</Label>
              <Input
                id="slug"
                {...register("slug")}
                placeholder="例: meeting-room-a"
                disabled={isPending}
              />
              <p className="text-xs text-muted-foreground">
                URLに使用されます（小文字英数字とハイフンのみ）
              </p>
              {errors.slug && (
                <p className="text-sm text-destructive">
                  {errors.slug.message}
                </p>
              )}
            </div>

            {/* 説明 (Lexical RichTextEditor) */}
            <div className="space-y-2">
              <Label id="description-label">説明 *</Label>
              {/* NOTE: RichTextEditor uses contenteditable (Lexical) — htmlFor is not applicable */}
              <RichTextEditor
                contentHtml={description || ""}
                onChange={(json) =>
                  setValue("description", json, { shouldDirty: true })
                }
                placeholder="スペースの説明を入力..."
                height="200px"
                disabled={isPending}
              />
              {errors.description && (
                <p className="text-sm text-destructive">
                  {errors.description.message}
                </p>
              )}
            </div>

            {/* 住所・アクセス */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="address">住所 *</Label>
                <Input
                  id="address"
                  {...register("address")}
                  placeholder="例: 東京都渋谷区..."
                  disabled={isPending}
                />
                {errors.address && (
                  <p className="text-sm text-destructive">
                    {errors.address.message}
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="access">アクセス</Label>
                <Input
                  id="access"
                  {...register("access")}
                  placeholder="例: 渋谷駅から徒歩5分"
                  disabled={isPending}
                />
              </div>
            </div>

            {/* 定員・面積 */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="capacity">定員（人数）*</Label>
                <Input
                  id="capacity"
                  type="number"
                  {...register("capacity", { valueAsNumber: true })}
                  placeholder="10"
                  disabled={isPending}
                />
                {errors.capacity && (
                  <p className="text-sm text-destructive">
                    {errors.capacity.message}
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="area">面積（m²）</Label>
                <Input
                  id="area"
                  type="number"
                  step="0.01"
                  {...register("area", {
                    setValueAs: (v: string) => (v === "" ? null : Number(v)),
                  })}
                  placeholder="50"
                  disabled={isPending}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* ══ 右カラム: 設定カード群 ══ */}
        <div className="space-y-6">
          {/* ── 料金設定 ── */}
          <Card>
            <CardHeader>
              <CardTitle>料金設定</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* 基本料金 */}
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="hourlyPrice">時間料金（円/時間）*</Label>
                  <Input
                    id="hourlyPrice"
                    type="number"
                    {...register("hourlyPrice", { valueAsNumber: true })}
                    placeholder="5000"
                    disabled={isPending}
                  />
                  {errors.hourlyPrice && (
                    <p className="text-sm text-destructive">
                      {errors.hourlyPrice.message}
                    </p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="dailyPrice">日額料金（円/日）</Label>
                  <Input
                    id="dailyPrice"
                    type="number"
                    {...register("dailyPrice", {
                      setValueAs: (v: string) => (v === "" ? null : Number(v)),
                    })}
                    placeholder="30000"
                    disabled={isPending}
                  />
                </div>
              </div>

              {/* 割引設定 */}
              <div className="space-y-4 pt-4 border-t">
                <h4 className="text-sm font-medium text-muted-foreground">
                  割引設定
                </h4>

                {/* 固定割引 */}
                <div className="space-y-2">
                  <Label htmlFor="discountType" className="text-sm font-medium">
                    固定割引
                  </Label>
                  <div className="flex flex-wrap items-center gap-3">
                    <Select
                      value={discountType}
                      onValueChange={(value) => {
                        const validated = getValidDiscountType(
                          value,
                          DiscountType.none,
                        );
                        setValue("discountType", validated, {
                          shouldDirty: true,
                        });
                      }}
                      disabled={isPending}
                    >
                      <SelectTrigger id="discountType" className="w-40">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={DiscountType.none}>なし</SelectItem>
                        <SelectItem value={DiscountType.percentage}>
                          パーセント割引
                        </SelectItem>
                        <SelectItem value={DiscountType.fixed}>
                          定額割引
                        </SelectItem>
                      </SelectContent>
                    </Select>
                    {discountType === DiscountType.percentage && (
                      <div className="flex items-center gap-2">
                        <Input
                          type="number"
                          {...register("discountValue", {
                            setValueAs: (v: string) =>
                              v === "" ? null : Number(v),
                          })}
                          placeholder="10"
                          className="w-20"
                          disabled={isPending}
                        />
                        <span className="text-sm text-muted-foreground">%</span>
                      </div>
                    )}
                    {discountType === DiscountType.fixed && (
                      <div className="flex items-center gap-2">
                        <Input
                          type="number"
                          {...register("discountValue", {
                            setValueAs: (v: string) =>
                              v === "" ? null : Number(v),
                          })}
                          placeholder="500"
                          className="w-24"
                          disabled={isPending}
                        />
                        <span className="text-sm text-muted-foreground">
                          円
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                {/* 長時間割引 */}
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Label
                      htmlFor="durationDiscountOverride"
                      className="text-sm font-medium"
                    >
                      長時間割引
                    </Label>
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <HelpCircle className="h-4 w-4 text-muted-foreground cursor-help" />
                        </TooltipTrigger>
                        <TooltipContent className="max-w-xs">
                          <p>
                            グローバル設定の長時間割引をスペース単位で上書きできます。
                          </p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                  <Select
                    value={durationDiscountOverride}
                    onValueChange={(value) => {
                      const validated = getValidDurationDiscountOverride(
                        value,
                        DurationDiscountOverride.inherit,
                      );
                      setValue("durationDiscountOverride", validated, {
                        shouldDirty: true,
                      });
                    }}
                    disabled={isPending}
                  >
                    <SelectTrigger id="durationDiscountOverride">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={DurationDiscountOverride.inherit}>
                        グローバル設定に従う
                      </SelectItem>
                      <SelectItem value={DurationDiscountOverride.enabled}>
                        このスペースは常に有効
                      </SelectItem>
                      <SelectItem value={DurationDiscountOverride.disabled}>
                        このスペースは無効
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* 税率設定 */}
              <div className="space-y-2 pt-4 border-t">
                <h4 className="text-sm font-medium text-muted-foreground">
                  税率設定
                </h4>
                <Select
                  value={taxRateType}
                  onValueChange={(value) => {
                    const validated = getValidTaxRateType(value);
                    setValue("taxRateType", validated, { shouldDirty: true });
                  }}
                  disabled={isPending}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={TaxRateType.standard}>
                      標準税率（{taxSettings.standardRate}%）
                    </SelectItem>
                    <SelectItem value={TaxRateType.reduced}>
                      軽減税率（{taxSettings.reducedRate}%）
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* 料金プレビュー */}
              {hourlyPrice > 0 && (
                <div className="pt-4 border-t">
                  <h4 className="text-sm font-medium text-muted-foreground mb-3">
                    料金プレビュー
                    <span className="font-normal ml-2">
                      （{getTaxRateLabel(taxRateType, currentTaxRate)}）
                    </span>
                  </h4>
                  <div className="rounded-lg bg-muted/50 p-4 space-y-3">
                    {/* 時間料金 */}
                    <div className="flex items-center justify-between">
                      <span className="text-sm">時間料金</span>
                      <div className="text-right space-y-0.5">
                        {hasDiscount && (
                          <div className="text-xs text-muted-foreground line-through">
                            ¥{hourlyPrice.toLocaleString()}（税抜）
                          </div>
                        )}
                        <div className="text-sm">
                          ¥
                          {(hasDiscount
                            ? discountedHourlyPrice
                            : hourlyPrice
                          ).toLocaleString()}
                          （税抜）
                        </div>
                        <div className="text-sm font-semibold text-primary">
                          ¥
                          {(hasDiscount
                            ? discountedTaxIncludedHourlyPrice
                            : taxIncludedHourlyPrice
                          ).toLocaleString()}
                          （税込）
                        </div>
                      </div>
                    </div>
                    {/* 日額料金 */}
                    {dailyPrice && (
                      <div className="flex items-center justify-between pt-2 border-t border-border/50">
                        <span className="text-sm">日額料金</span>
                        <div className="text-right space-y-0.5">
                          {hasDiscount && discountedDailyPrice !== null && (
                            <div className="text-xs text-muted-foreground line-through">
                              ¥{dailyPrice.toLocaleString()}（税抜）
                            </div>
                          )}
                          <div className="text-sm">
                            ¥
                            {(hasDiscount && discountedDailyPrice !== null
                              ? discountedDailyPrice
                              : dailyPrice
                            ).toLocaleString()}
                            （税抜）
                          </div>
                          <div className="text-sm font-semibold text-primary">
                            ¥
                            {(
                              discountedTaxIncludedDailyPrice ??
                              taxIncludedDailyPrice ??
                              0
                            ).toLocaleString()}
                            （税込）
                          </div>
                        </div>
                      </div>
                    )}
                    {hasDiscount && (
                      <p className="text-xs text-muted-foreground pt-2 border-t border-border/50">
                        割引:{" "}
                        {discountType === DiscountType.percentage
                          ? `${discountValue}% OFF`
                          : `¥${discountValue?.toLocaleString()}引`}
                      </p>
                    )}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* ── 場所・カテゴリー ── */}
          {(availableLocations.length > 0 ||
            availableCategories.length > 0) && (
            <Card>
              <CardHeader>
                <CardTitle>場所・カテゴリー</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {availableLocations.length > 0 && (
                  <div className="space-y-2">
                    <Label htmlFor="locationId">場所（建物・施設）</Label>
                    <Select
                      value={locationId ?? SELECT_NONE_VALUE}
                      onValueChange={(value) =>
                        setValue(
                          "locationId",
                          value === SELECT_NONE_VALUE ? undefined : value,
                          { shouldDirty: true },
                        )
                      }
                      disabled={isPending}
                    >
                      <SelectTrigger id="locationId">
                        <SelectValue placeholder="場所を選択（任意）" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={SELECT_NONE_VALUE}>なし</SelectItem>
                        {availableLocations.map((loc) => (
                          <SelectItem key={loc.id} value={loc.id}>
                            {loc.name}（{loc.address}）
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                {availableCategories.length > 0 && (
                  <div className="space-y-2">
                    <Label htmlFor="categoryId">カテゴリー（用途）</Label>
                    <Select
                      value={categoryId ?? SELECT_NONE_VALUE}
                      onValueChange={(value) =>
                        setValue(
                          "categoryId",
                          value === SELECT_NONE_VALUE ? undefined : value,
                          { shouldDirty: true },
                        )
                      }
                      disabled={isPending}
                    >
                      <SelectTrigger id="categoryId">
                        <SelectValue placeholder="カテゴリーを選択（任意）" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={SELECT_NONE_VALUE}>なし</SelectItem>
                        {availableCategories.map((cat) => (
                          <SelectItem key={cat.id} value={cat.id}>
                            {cat.icon && (
                              <span className="mr-1">{cat.icon}</span>
                            )}
                            {cat.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* ── 公開設定 ── */}
          <Card>
            <CardHeader>
              <CardTitle>公開設定</CardTitle>
            </CardHeader>
            <CardContent>
              <UnifiedPublishFields
                register={register}
                control={control}
                errors={errors}
                setValue={setValue}
                getValues={getValues}
                disabled={isPending}
                controlType="isPublished"
                fields={{ publishedAt: "publishedAt" }}
                isPublishedValue={isPublished}
                onIsPublishedChange={(value: boolean) =>
                  setValue("isPublished", value, { shouldDirty: true })
                }
              />
            </CardContent>
          </Card>

          {/* ── 利用規約 ── */}
          {availableTerms.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>利用規約</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <Label htmlFor="termsId">適用する利用規約</Label>
                <Select
                  value={termsId ?? SELECT_NONE_VALUE}
                  onValueChange={(value) =>
                    setValue(
                      "termsId",
                      value === SELECT_NONE_VALUE ? undefined : value,
                      { shouldDirty: true },
                    )
                  }
                  disabled={isPending}
                >
                  <SelectTrigger id="termsId">
                    <SelectValue placeholder="規約を選択（任意）" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={SELECT_NONE_VALUE}>
                      なし（規約同意不要）
                    </SelectItem>
                    {availableTerms.map((term) => (
                      <SelectItem key={term.id} value={term.id}>
                        {term.title}（{term.type}）
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-sm text-muted-foreground">
                  規約を設定すると、予約時に顧客が同意する必要があります
                </p>
              </CardContent>
            </Card>
          )}
        </div>
        {/* ── 右カラム end ── */}
      </div>
      {/* ── 2カラムグリッド end ── */}

      {/* TODO: 画像・設備・SEO (Task 3) */}
      {/* TODO: ボタン (Task 3) */}

      {/* メディアピッカーダイアログ */}
      <mainImagePicker.MediaPicker />
      <additionalImagesPicker.MediaPicker />
    </form>
  );
}
