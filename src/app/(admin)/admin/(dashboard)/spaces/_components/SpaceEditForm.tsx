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
      {/* TODO: フォームフィールドは Task 2 以降で実装 */}
      <div className="text-muted-foreground">実装中...</div>

      {/* メディアピッカーダイアログ */}
      <mainImagePicker.MediaPicker />
      <additionalImagesPicker.MediaPicker />
    </form>
  );
}
