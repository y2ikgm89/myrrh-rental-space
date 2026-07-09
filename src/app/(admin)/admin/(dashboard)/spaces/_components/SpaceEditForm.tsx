"use client";

import Image from "next/image";
import Link from "next/link";
import { useActionState, useEffect, useEffectEvent, useState } from "react";
import { getFormProps, useForm, type FieldMetadata } from "@conform-to/react";
import { parseWithZod } from "@conform-to/zod/v4";
import { IconHelpCircle, IconPhotoPlus, IconX } from "@tabler/icons-react";
import { parseAsStringLiteral, useQueryState } from "nuqs";
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SubmitButton,
  Switch,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Textarea,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/admin/components/ui";
import { LazyLexicalEditor } from "@/admin/components/editor/lexical/LazyLexicalEditor";
import { IconPickerField } from "@/admin/components/icon-picker/IconPickerField";
import { CuratedIcon } from "@/shared/components/icon-curation/CuratedIcon";
import { useSingleMediaPicker } from "@/admin/hooks/use-media-picker";
import { GalleryField } from "@/admin/components/gallery-field/GalleryField";
import { createSpaceAction, updateSpaceAction } from "@/admin/actions/space";
import { spaceFormSchema } from "@/admin/lib/validations/space";
import type { SpaceWithStats } from "@/admin/lib/validations/space";
import {
  DiscountType,
  DurationDiscountOverride,
  TaxRateType,
} from "@/shared/lib/validations/enums/prisma-types";
import {
  getValidDiscountType,
  getValidDurationDiscountOverride,
  getValidTaxRateType,
} from "@/shared/lib/validations/enums/helpers";
import { EMPTY_LEXICAL_EDITOR_STATE_JSON } from "@/shared/lib/lexical/description-defaults";
import {
  calculateTaxIncludedPrice,
  getTaxRate,
} from "@/shared/lib/pricing/tax";
import { formatCurrency, getTaxRateLabel } from "@/shared/lib/pricing/format";
import type { TaxSettings } from "@/shared/lib/pricing/types";
import { DEFAULT_TAX_SETTINGS } from "@/shared/lib/pricing/tax";
import { toAppRoute } from "@/shared/lib/routes/to-app-route";
import type { BlockedDateData } from "@/shared/domain/blocked-dates/types";
import { BlockedDatesField } from "@/admin/components/BlockedDatesField";
import {
  createSpaceBlockedDate,
  deleteSpaceBlockedDate,
} from "@/admin/actions/space-blocked-dates";

const SPACE_EDIT_TAB_VALUES = [
  "basic",
  "pricing",
  "media",
  "details",
  "publish",
  "blocked-dates",
] as const satisfies readonly [string, ...string[]];

type SpaceEditTabValue = (typeof SPACE_EDIT_TAB_VALUES)[number];

const SPACE_EDIT_TAB_VALUE_SET: ReadonlySet<string> = new Set(
  SPACE_EDIT_TAB_VALUES,
);

function isSpaceEditTabValue(value: string): value is SpaceEditTabValue {
  return SPACE_EDIT_TAB_VALUE_SET.has(value);
}

const SPACE_EDIT_TAB_LABELS: Record<SpaceEditTabValue, string> = {
  basic: "基本情報",
  pricing: "料金設定",
  media: "メディア",
  details: "詳細設定",
  publish: "公開・SEO",
  "blocked-dates": "臨時休業",
};

const SELECT_NONE_VALUE = "__none__";

export type SpaceEditLocationOption = {
  id: string;
  name: string;
  address: string;
};

export type SpaceEditCategoryOption = {
  id: string;
  name: string;
  icon: string | null;
  color: string | null;
};

export type SpaceEditFormProps = {
  space?: SpaceWithStats;
  mode: "create" | "edit";
  availableLocations: SpaceEditLocationOption[];
  availableCategories: SpaceEditCategoryOption[];
  taxSettings: TaxSettings;
  reviewsFeatureEnabled: boolean;
  initialBlockedDates?: readonly BlockedDateData[];
};

type FacilityItem = { key: string; name: string; iconName: string };

function genKey(): string {
  return crypto.randomUUID();
}

function getInitialDescriptionJson(space: SpaceWithStats | undefined): string {
  if (!space) return EMPTY_LEXICAL_EDITOR_STATE_JSON;
  return typeof space.descriptionJson === "string"
    ? space.descriptionJson
    : JSON.stringify(
        space.descriptionJson ?? JSON.parse(EMPTY_LEXICAL_EDITOR_STATE_JSON),
      );
}

type ConformFieldErrors = FieldMetadata<unknown>["errors"];

function fieldHasErrors(errors: ConformFieldErrors): boolean {
  return Array.isArray(errors) && errors.length > 0;
}

export function SpaceEditForm({
  space,
  mode,
  availableLocations,
  availableCategories,
  taxSettings = DEFAULT_TAX_SETTINGS,
  reviewsFeatureEnabled,
  initialBlockedDates = [],
}: SpaceEditFormProps) {
  const isEdit = mode === "edit";

  /** スペース管理ハブの `tab` と衝突しないよう `section` を使用 */
  const [activeSection, setActiveSection] = useQueryState(
    "section",
    parseAsStringLiteral(SPACE_EDIT_TAB_VALUES)
      .withDefault("basic")
      .withOptions({ history: "replace", shallow: true }),
  );

  // 基本情報
  const [name, setName] = useState<string>(space?.name ?? "");
  const [slug, setSlug] = useState<string>(space?.slug ?? "");
  const [descriptionJson, setDescriptionJson] = useState<string>(() =>
    getInitialDescriptionJson(space),
  );
  const [addressDetail, setAddressDetail] = useState<string>(
    space?.addressDetail ?? "",
  );
  const [capacity, setCapacity] = useState<string>(
    space ? String(space.capacity) : "10",
  );
  const [area, setArea] = useState<string>(
    space?.area != null ? String(space.area) : "",
  );
  const [locationId, setLocationId] = useState<string>(space?.locationId ?? "");

  // 料金
  const [hourlyPrice, setHourlyPrice] = useState<string>(
    space ? String(space.hourlyPrice) : "0",
  );
  const [dailyPrice, setDailyPrice] = useState<string>(
    space?.dailyPrice != null ? String(space.dailyPrice) : "",
  );
  const [discountType, setDiscountType] = useState<DiscountType>(
    space?.discountType ?? DiscountType.none,
  );
  const [discountValue, setDiscountValue] = useState<string>(
    space?.discountValue != null ? String(space.discountValue) : "",
  );
  const [durationDiscountOverride, setDurationDiscountOverride] =
    useState<DurationDiscountOverride>(
      space?.durationDiscountOverride ?? DurationDiscountOverride.inherit,
    );
  const [taxRateType, setTaxRateType] = useState<TaxRateType>(() =>
    getValidTaxRateType(space?.taxRateType),
  );

  // メディア
  const [mainImageUrl, setMainImageUrl] = useState<string>(
    space?.mainImageUrl ?? "",
  );

  // 詳細設定
  const [categoryId, setCategoryId] = useState<string>(space?.categoryId ?? "");
  const [facilities, setFacilities] = useState<FacilityItem[]>(() =>
    (space?.facilities ?? []).map((f) => ({
      key: genKey(),
      name: f.name,
      iconName: f.iconName,
    })),
  );
  const [newFacility, setNewFacility] = useState<string>("");
  const [newFacilityIconName, setNewFacilityIconName] = useState<string>("");

  // 公開設定 + SEO/OGP
  const [isPublished, setIsPublished] = useState<boolean>(
    space?.isPublished ?? false,
  );
  const [reviewsEnabled, setReviewsEnabled] = useState<boolean>(
    space?.reviewsEnabled ?? false,
  );
  const [metaDescription, setMetaDescription] = useState<string>(
    space?.metaDescription ?? "",
  );
  const [metaKeywords, setMetaKeywords] = useState<string>(
    space?.metaKeywords ?? "",
  );
  const [ogpTitle, setOgpTitle] = useState<string>(space?.ogpTitle ?? "");
  const [ogpDescription, setOgpDescription] = useState<string>(
    space?.ogpDescription ?? "",
  );
  const [ogpImageUrl, setOgpImageUrl] = useState<string>(
    space?.ogpImageUrl ?? "",
  );

  // Server Action は `(prev, formData) => SubmissionResult` signature。
  // edit mode では id を `bind` で部分適用。
  const boundAction =
    isEdit && space?.id
      ? updateSpaceAction.bind(null, space.id)
      : createSpaceAction;
  const [lastResult, action, isPending] = useActionState(
    boundAction,
    undefined,
  );

  const [form, fields] = useForm({
    id: isEdit ? `space-edit-${space?.id ?? ""}` : "space-create",
    lastResult,
    onValidate({ formData }) {
      return parseWithZod(formData, { schema: spaceFormSchema });
    },
    shouldValidate: "onBlur",
    shouldRevalidate: "onInput",
  });

  // 設備配列
  const addFacility = () => {
    const trimmed = newFacility.trim();
    if (trimmed === "") return;
    if (facilities.some((f) => f.name === trimmed)) return;
    setFacilities((prev) => [
      ...prev,
      { key: genKey(), name: trimmed, iconName: newFacilityIconName },
    ]);
    setNewFacility("");
    setNewFacilityIconName("");
  };

  const removeFacility = (key: string) => {
    setFacilities((prev) => prev.filter((f) => f.key !== key));
  };

  const mainImagePicker = useSingleMediaPicker({
    accept: "image",
    defaultUsage: "SPACE",
    showUrlTab: false,
    onSelect: (media) => {
      const selected = media[0];
      if (selected) setMainImageUrl(selected.url);
    },
  });
  const ogpImagePicker = useSingleMediaPicker({
    accept: "image",
    defaultUsage: "SPACE",
    showUrlTab: false,
    onSelect: (media) => {
      const selected = media[0];
      if (selected) setOgpImageUrl(selected.url);
    },
  });

  // Ctrl+S keyboard shortcut: form 経由で submit を trigger
  const triggerSave = useEffectEvent(() => {
    const formEl = document.getElementById(form.id);
    if (formEl instanceof HTMLFormElement) {
      formEl.requestSubmit();
    }
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

  // タブごとのエラー数（バッジ表示用）
  const tabErrorCount: Record<SpaceEditTabValue, number> = {
    basic: [
      fields.name,
      fields.slug,
      fields.descriptionJson,
      fields.locationId,
      fields.addressDetail,
      fields.capacity,
      fields.area,
    ].filter((f) => fieldHasErrors(f.errors)).length,
    pricing: [
      fields.hourlyPrice,
      fields.dailyPrice,
      fields.discountType,
      fields.discountValue,
      fields.durationDiscountOverride,
      fields.taxRateType,
    ].filter((f) => fieldHasErrors(f.errors)).length,
    media: [fields.mainImageUrl, fields.gallery].filter((f) =>
      fieldHasErrors(f.errors),
    ).length,
    details: [fields.categoryId, fields.facilities].filter((f) =>
      fieldHasErrors(f.errors),
    ).length,
    publish: [
      fields.isPublished,
      fields.reviewsEnabled,
      fields.metaDescription,
      fields.metaKeywords,
      fields.ogpTitle,
      fields.ogpDescription,
      fields.ogpImageUrl,
    ].filter((f) => fieldHasErrors(f.errors)).length,
    // 臨時休業は独立 CRUD（このフォームの送信対象外）のため常に 0
    "blocked-dates": 0,
  };

  const onTabChange = (value: string) => {
    if (isSpaceEditTabValue(value)) {
      void setActiveSection(value);
    }
  };

  // 料金プレビュー計算
  const hourlyPriceNum = Number(hourlyPrice) || 0;
  const dailyPriceNum = dailyPrice === "" ? null : Number(dailyPrice);
  const discountValueNum = discountValue === "" ? null : Number(discountValue);

  const calculateDiscountedPrice = (price: number): number => {
    if (!price || discountType === DiscountType.none || !discountValueNum)
      return price;
    if (discountType === DiscountType.percentage)
      return Math.max(0, Math.round(price * (1 - discountValueNum / 100)));
    if (discountType === DiscountType.fixed)
      return Math.max(0, price - discountValueNum);
    return price;
  };
  const discountedHourlyPrice = calculateDiscountedPrice(hourlyPriceNum);
  const discountedDailyPrice =
    dailyPriceNum !== null ? calculateDiscountedPrice(dailyPriceNum) : null;
  const hasDiscount =
    discountType !== DiscountType.none &&
    discountValueNum !== null &&
    discountValueNum > 0;
  const currentTaxRate = getTaxRate(taxRateType, taxSettings);
  const taxIncludedHourlyPrice = calculateTaxIncludedPrice(
    hourlyPriceNum,
    currentTaxRate,
  );
  const taxIncludedDailyPrice =
    dailyPriceNum !== null
      ? calculateTaxIncludedPrice(dailyPriceNum, currentTaxRate)
      : null;
  const discountedTaxIncludedHourlyPrice = calculateTaxIncludedPrice(
    discountedHourlyPrice,
    currentTaxRate,
  );
  const discountedTaxIncludedDailyPrice =
    discountedDailyPrice !== null
      ? calculateTaxIncludedPrice(discountedDailyPrice, currentTaxRate)
      : null;

  const cancelHref =
    isEdit && space
      ? toAppRoute(`/admin/spaces/${space.id}`)
      : toAppRoute("/admin/spaces");

  return (
    <form {...getFormProps(form)} action={action} className="space-y-6">
      {/* hidden inputs (controlled state → FormData) */}
      <input type="hidden" name={fields.name.name} value={name} />
      <input type="hidden" name={fields.slug.name} value={slug} />
      <input
        type="hidden"
        name={fields.descriptionJson.name}
        value={descriptionJson}
      />
      <input
        type="hidden"
        name={fields.addressDetail.name}
        value={addressDetail}
      />
      <input type="hidden" name={fields.capacity.name} value={capacity} />
      <input type="hidden" name={fields.area.name} value={area} />
      <input type="hidden" name={fields.locationId.name} value={locationId} />
      <input type="hidden" name={fields.hourlyPrice.name} value={hourlyPrice} />
      <input type="hidden" name={fields.dailyPrice.name} value={dailyPrice} />
      <input
        type="hidden"
        name={fields.discountType.name}
        value={discountType}
      />
      <input
        type="hidden"
        name={fields.discountValue.name}
        value={discountValue}
      />
      <input
        type="hidden"
        name={fields.durationDiscountOverride.name}
        value={durationDiscountOverride}
      />
      <input type="hidden" name={fields.taxRateType.name} value={taxRateType} />
      <input
        type="hidden"
        name={fields.mainImageUrl.name}
        value={mainImageUrl}
      />
      <input type="hidden" name={fields.categoryId.name} value={categoryId} />
      {facilities.map((item) => (
        <input
          key={item.key}
          type="hidden"
          name={fields.facilities.name}
          value={JSON.stringify({ name: item.name, iconName: item.iconName })}
        />
      ))}
      <input
        type="hidden"
        name={fields.isPublished.name}
        value={isPublished ? "on" : ""}
      />
      <input
        type="hidden"
        name={fields.reviewsEnabled.name}
        value={reviewsEnabled ? "on" : ""}
      />
      <input
        type="hidden"
        name={fields.metaDescription.name}
        value={metaDescription}
      />
      <input
        type="hidden"
        name={fields.metaKeywords.name}
        value={metaKeywords}
      />
      <input type="hidden" name={fields.ogpTitle.name} value={ogpTitle} />
      <input
        type="hidden"
        name={fields.ogpDescription.name}
        value={ogpDescription}
      />
      <input type="hidden" name={fields.ogpImageUrl.name} value={ogpImageUrl} />

      {form.errors && form.errors.length > 0 && (
        <div
          className="rounded-md border border-destructive bg-destructive/10 p-3 text-sm text-destructive"
          role="alert"
        >
          {form.errors.join(", ")}
        </div>
      )}

      <Tabs
        value={activeSection}
        onValueChange={onTabChange}
        className="space-y-4"
      >
        <TabsList className="h-auto flex-wrap gap-1">
          {SPACE_EDIT_TAB_VALUES.filter(
            (tab) => tab !== "blocked-dates" || isEdit,
          ).map((tab) => {
            const errorCount = tabErrorCount[tab];
            return (
              <TabsTrigger
                key={tab}
                value={tab}
                className="flex items-center gap-1.5"
              >
                {SPACE_EDIT_TAB_LABELS[tab]}
                {errorCount > 0 && (
                  <span className="flex h-4 w-4 items-center justify-center rounded-full bg-destructive text-xs font-medium text-destructive-foreground">
                    {errorCount}
                  </span>
                )}
              </TabsTrigger>
            );
          })}
        </TabsList>

        {/* ============ 基本情報 ============ */}
        <TabsContent
          value="basic"
          forceMount
          className="data-[state=inactive]:hidden"
        >
          <Card>
            <CardHeader>
              <CardTitle>基本情報</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="space-name">スペース名 *</Label>
                <Input
                  id="space-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="例: 会議室A"
                  disabled={isPending}
                />
                {fieldHasErrors(fields.name.errors) && (
                  <p className="text-sm text-destructive">
                    {fields.name.errors?.join(", ")}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="space-slug">スラッグ *</Label>
                <Input
                  id="space-slug"
                  value={slug}
                  onChange={(e) => setSlug(e.target.value)}
                  placeholder="例: meeting-room-a"
                  disabled={isPending}
                />
                <p className="text-xs text-muted-foreground">
                  URLに使用されます（小文字英数字とハイフンのみ）
                </p>
                {fieldHasErrors(fields.slug.errors) && (
                  <p className="text-sm text-destructive">
                    {fields.slug.errors?.join(", ")}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="space-description">説明 *</Label>
                <div className="overflow-hidden rounded-lg border border-border">
                  <LazyLexicalEditor
                    contentJson={descriptionJson}
                    onChange={setDescriptionJson}
                    height="560px"
                    placeholder="スペースの説明を入力..."
                  />
                </div>
                {fieldHasErrors(fields.descriptionJson.errors) && (
                  <p className="text-sm text-destructive">
                    {fields.descriptionJson.errors?.join(", ")}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="space-locationId">拠点（建物）*</Label>
                {availableLocations.length === 0 ? (
                  <p className="text-sm text-destructive">
                    拠点が登録されていません。スペース管理の「場所」タブから先に拠点を作成してください。
                  </p>
                ) : (
                  <Select
                    {...(locationId !== "" ? { value: locationId } : {})}
                    onValueChange={setLocationId}
                    disabled={isPending}
                  >
                    <SelectTrigger id="space-locationId">
                      <SelectValue placeholder="拠点を選択" />
                    </SelectTrigger>
                    <SelectContent>
                      {availableLocations.map((loc) => (
                        <SelectItem key={loc.id} value={loc.id}>
                          {loc.name}（{loc.address}）
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                {fieldHasErrors(fields.locationId.errors) && (
                  <p className="text-sm text-destructive">
                    {fields.locationId.errors?.join(", ")}
                  </p>
                )}
                <p className="text-xs text-muted-foreground">
                  建物の住所は拠点マスタが正本です。号室やフロアは下の「所在地補足」に入力します。
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="space-addressDetail">
                  所在地補足（号室・フロア等）
                </Label>
                <Input
                  id="space-addressDetail"
                  value={addressDetail}
                  onChange={(e) => setAddressDetail(e.target.value)}
                  placeholder="例: 3F 会議室A（任意）"
                  disabled={isPending}
                />
                {fieldHasErrors(fields.addressDetail.errors) && (
                  <p className="text-sm text-destructive">
                    {fields.addressDetail.errors?.join(", ")}
                  </p>
                )}
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="space-capacity">定員（人数）*</Label>
                  <Input
                    id="space-capacity"
                    type="number"
                    value={capacity}
                    onChange={(e) => setCapacity(e.target.value)}
                    placeholder="10"
                    disabled={isPending}
                  />
                  {fieldHasErrors(fields.capacity.errors) && (
                    <p className="text-sm text-destructive">
                      {fields.capacity.errors?.join(", ")}
                    </p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="space-area">面積（m²）</Label>
                  <Input
                    id="space-area"
                    type="number"
                    step="0.01"
                    value={area}
                    onChange={(e) => setArea(e.target.value)}
                    placeholder="50"
                    disabled={isPending}
                  />
                  {fieldHasErrors(fields.area.errors) && (
                    <p className="text-sm text-destructive">
                      {fields.area.errors?.join(", ")}
                    </p>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ============ 料金設定 ============ */}
        <TabsContent
          value="pricing"
          forceMount
          className="data-[state=inactive]:hidden"
        >
          <Card>
            <CardHeader>
              <CardTitle>料金設定</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="space-hourlyPrice">
                    時間料金（円/時間）*
                  </Label>
                  <Input
                    id="space-hourlyPrice"
                    type="number"
                    value={hourlyPrice}
                    onChange={(e) => setHourlyPrice(e.target.value)}
                    placeholder="5000"
                    disabled={isPending}
                  />
                  {fieldHasErrors(fields.hourlyPrice.errors) && (
                    <p className="text-sm text-destructive">
                      {fields.hourlyPrice.errors?.join(", ")}
                    </p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="space-dailyPrice">日額料金（円/日）</Label>
                  <Input
                    id="space-dailyPrice"
                    type="number"
                    value={dailyPrice}
                    onChange={(e) => setDailyPrice(e.target.value)}
                    placeholder="30000"
                    disabled={isPending}
                  />
                  {fieldHasErrors(fields.dailyPrice.errors) && (
                    <p className="text-sm text-destructive">
                      {fields.dailyPrice.errors?.join(", ")}
                    </p>
                  )}
                </div>
              </div>

              <div className="space-y-4 border-t pt-4">
                <h4 className="text-sm font-medium text-muted-foreground">
                  割引設定
                </h4>

                <div className="space-y-2">
                  <Label
                    htmlFor="space-discountType"
                    className="text-sm font-medium"
                  >
                    固定割引
                  </Label>
                  <div className="flex flex-wrap items-center gap-3">
                    <Select
                      value={discountType}
                      onValueChange={(value) =>
                        setDiscountType(
                          getValidDiscountType(value, DiscountType.none),
                        )
                      }
                      disabled={isPending}
                    >
                      <SelectTrigger id="space-discountType" className="w-40">
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
                          value={discountValue}
                          onChange={(e) => setDiscountValue(e.target.value)}
                          placeholder="10"
                          min={0}
                          max={100}
                          className="w-20"
                          disabled={isPending}
                          aria-label="割引率"
                        />
                        <span className="text-sm text-muted-foreground">%</span>
                      </div>
                    )}
                    {discountType === DiscountType.fixed && (
                      <div className="flex items-center gap-2">
                        <Input
                          type="number"
                          value={discountValue}
                          onChange={(e) => setDiscountValue(e.target.value)}
                          placeholder="500"
                          min={0}
                          className="w-24"
                          disabled={isPending}
                          aria-label="割引額"
                        />
                        <span className="text-sm text-muted-foreground">
                          円
                        </span>
                      </div>
                    )}
                  </div>
                  {fieldHasErrors(fields.discountValue.errors) && (
                    <p className="text-sm text-destructive">
                      {fields.discountValue.errors?.join(", ")}
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Label
                      htmlFor="space-durationDiscountOverride"
                      className="text-sm font-medium"
                    >
                      長時間割引
                    </Label>
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <IconHelpCircle
                            aria-hidden="true"
                            className="h-4 w-4 cursor-help text-muted-foreground"
                          />
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
                    onValueChange={(value) =>
                      setDurationDiscountOverride(
                        getValidDurationDiscountOverride(
                          value,
                          DurationDiscountOverride.inherit,
                        ),
                      )
                    }
                    disabled={isPending}
                  >
                    <SelectTrigger id="space-durationDiscountOverride">
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

              <div className="space-y-2 border-t pt-4">
                <h4 className="text-sm font-medium text-muted-foreground">
                  税率設定
                </h4>
                <Select
                  value={taxRateType}
                  onValueChange={(value) =>
                    setTaxRateType(getValidTaxRateType(value))
                  }
                  disabled={isPending}
                >
                  <SelectTrigger aria-label="税率タイプ">
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

              {hourlyPriceNum > 0 && (
                <div className="border-t pt-4">
                  <h4 className="mb-3 text-sm font-medium text-muted-foreground">
                    料金プレビュー
                    <span className="ml-2 font-normal">
                      （{getTaxRateLabel(taxRateType, currentTaxRate)}）
                    </span>
                  </h4>
                  <div className="space-y-3 rounded-lg bg-muted/50 p-4">
                    <div className="flex items-center justify-between">
                      <span className="text-sm">時間料金</span>
                      <div className="space-y-0.5 text-right">
                        {hasDiscount && (
                          <div className="text-xs text-muted-foreground line-through">
                            {formatCurrency(hourlyPriceNum)}（税抜）
                          </div>
                        )}
                        <div className="text-sm">
                          {formatCurrency(
                            hasDiscount
                              ? discountedHourlyPrice
                              : hourlyPriceNum,
                          )}
                          （税抜）
                        </div>
                        <div className="text-sm font-semibold text-primary">
                          {formatCurrency(
                            hasDiscount
                              ? discountedTaxIncludedHourlyPrice
                              : taxIncludedHourlyPrice,
                          )}
                          （税込）
                        </div>
                      </div>
                    </div>
                    {dailyPriceNum !== null && (
                      <div className="flex items-center justify-between border-t border-border/50 pt-2">
                        <span className="text-sm">日額料金</span>
                        <div className="space-y-0.5 text-right">
                          {hasDiscount && discountedDailyPrice !== null && (
                            <div className="text-xs text-muted-foreground line-through">
                              {formatCurrency(dailyPriceNum)}（税抜）
                            </div>
                          )}
                          <div className="text-sm">
                            {formatCurrency(
                              hasDiscount && discountedDailyPrice !== null
                                ? discountedDailyPrice
                                : dailyPriceNum,
                            )}
                            （税抜）
                          </div>
                          <div className="text-sm font-semibold text-primary">
                            {formatCurrency(
                              discountedTaxIncludedDailyPrice ??
                                taxIncludedDailyPrice ??
                                0,
                            )}
                            （税込）
                          </div>
                        </div>
                      </div>
                    )}
                    {hasDiscount && (
                      <p className="border-t border-border/50 pt-2 text-xs text-muted-foreground">
                        割引:{" "}
                        {discountType === DiscountType.percentage
                          ? `${discountValueNum ?? 0}% OFF`
                          : `${formatCurrency(discountValueNum ?? 0)}引`}
                      </p>
                    )}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ============ メディア ============ */}
        <TabsContent
          value="media"
          forceMount
          className="data-[state=inactive]:hidden"
        >
          <Card>
            <CardHeader>
              <CardTitle>画像設定</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label>メイン画像 *</Label>
                <div className="flex items-start gap-4">
                  {mainImageUrl ? (
                    <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-lg border">
                      <Image
                        src={mainImageUrl}
                        alt="メイン画像"
                        fill
                        sizes="96px"
                        className="object-cover"
                      />
                    </div>
                  ) : (
                    <div className="flex h-24 w-24 shrink-0 items-center justify-center rounded-lg border border-dashed bg-muted">
                      <IconPhotoPlus
                        aria-hidden="true"
                        className="h-8 w-8 text-muted-foreground"
                      />
                    </div>
                  )}
                  <div className="flex-1 space-y-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => mainImagePicker.openPicker()}
                      disabled={isPending}
                    >
                      <IconPhotoPlus
                        aria-hidden="true"
                        className="mr-2 h-4 w-4"
                      />
                      画像を選択
                    </Button>
                    {mainImageUrl && (
                      <p className="truncate text-xs text-muted-foreground">
                        {mainImageUrl}
                      </p>
                    )}
                  </div>
                </div>
                {fieldHasErrors(fields.mainImageUrl.errors) && (
                  <p className="text-sm text-destructive">
                    {fields.mainImageUrl.errors?.join(", ")}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label>追加画像（最大20枚）</Label>
                <p className="text-xs text-muted-foreground">
                  並び順をドラッグで変更できます。最初の数枚は一覧カードのカルーセルに表示されます。
                </p>
                <GalleryField
                  field={fields.gallery}
                  form={form}
                  defaultUsage="SPACE"
                  max={20}
                  showUrlTab={false}
                  disabled={isPending}
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ============ 詳細設定 ============ */}
        <TabsContent
          value="details"
          forceMount
          className="data-[state=inactive]:hidden"
        >
          <div className="space-y-6">
            {availableCategories.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>カテゴリー</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="space-categoryId">カテゴリー（用途）</Label>
                    <Select
                      value={categoryId === "" ? SELECT_NONE_VALUE : categoryId}
                      onValueChange={(value) =>
                        setCategoryId(value === SELECT_NONE_VALUE ? "" : value)
                      }
                      disabled={isPending}
                    >
                      <SelectTrigger id="space-categoryId">
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
                    {fieldHasErrors(fields.categoryId.errors) && (
                      <p className="text-sm text-destructive">
                        {fields.categoryId.errors?.join(", ")}
                      </p>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}

            <Card>
              <CardHeader>
                <CardTitle>設備・アメニティ</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto] sm:items-end">
                  <div className="space-y-1.5">
                    <Label htmlFor="space-new-facility-name">設備名</Label>
                    <Input
                      id="space-new-facility-name"
                      value={newFacility}
                      onChange={(e) => setNewFacility(e.target.value)}
                      placeholder="例: WiFi、プロジェクター"
                      disabled={isPending}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          addFacility();
                        }
                      }}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>アイコン (任意)</Label>
                    <IconPickerField
                      value={newFacilityIconName}
                      onChange={setNewFacilityIconName}
                      disabled={isPending}
                    />
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={addFacility}
                    disabled={isPending}
                  >
                    追加
                  </Button>
                </div>
                {facilities.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {facilities.map((item) => (
                      <span
                        key={item.key}
                        className="inline-flex items-center gap-1.5 rounded-full bg-secondary px-3 py-1 text-sm"
                      >
                        {item.iconName ? (
                          <CuratedIcon
                            name={item.iconName}
                            className="h-3.5 w-3.5"
                          />
                        ) : null}
                        {item.name}
                        <button
                          type="button"
                          onClick={() => removeFacility(item.key)}
                          disabled={isPending}
                          className="ml-1 text-muted-foreground hover:text-foreground"
                          aria-label={`${item.name}を削除`}
                        >
                          <IconX className="h-3 w-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
                {fieldHasErrors(fields.facilities.errors) && (
                  <p className="text-sm text-destructive">
                    {fields.facilities.errors?.join(", ")}
                  </p>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ============ 公開・SEO ============ */}
        <TabsContent
          value="publish"
          forceMount
          className="data-[state=inactive]:hidden"
        >
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>公開設定</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-start gap-3">
                  <Switch
                    id="space-isPublished"
                    checked={isPublished}
                    onCheckedChange={setIsPublished}
                    disabled={isPending}
                  />
                  <div className="space-y-1">
                    <label
                      htmlFor="space-isPublished"
                      className="text-sm font-medium leading-none"
                    >
                      公開する
                    </label>
                    <p className="text-sm text-muted-foreground">
                      {isPublished
                        ? "このスペースは公開ページに表示されます"
                        : "オフにすると非公開になります"}
                    </p>
                  </div>
                </div>
                {fieldHasErrors(fields.isPublished.errors) && (
                  <p className="mt-2 text-sm text-destructive">
                    {fields.isPublished.errors?.join(", ")}
                  </p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>レビュー設定</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {!reviewsFeatureEnabled && (
                  <div className="rounded-lg border border-warning/50 bg-warning/5 p-3 text-sm text-muted-foreground">
                    レビュー機能はサイト全体で無効化されています。この設定は{" "}
                    <Link
                      href="/admin/settings/features"
                      className="underline hover:text-foreground"
                    >
                      機能モジュール設定
                    </Link>{" "}
                    で変更できます。個別の ON/OFF は Global ON 時のみ有効です。
                  </div>
                )}
                <div className="flex items-start gap-3">
                  <Switch
                    id="space-reviewsEnabled"
                    checked={reviewsEnabled}
                    onCheckedChange={setReviewsEnabled}
                    disabled={isPending || !reviewsFeatureEnabled}
                  />
                  <div className="space-y-1">
                    <label
                      htmlFor="space-reviewsEnabled"
                      className="text-sm font-medium leading-none"
                    >
                      レビュー機能を有効化
                    </label>
                    <p className="text-sm text-muted-foreground">
                      オフにすると公開ページでレビューが非表示になり、顧客は新規投稿できなくなります。既存のレビューは削除されません。
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>SEO・OGP 設定</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="space-metaDescription">
                      メタディスクリプション
                    </Label>
                    <Textarea
                      id="space-metaDescription"
                      value={metaDescription}
                      onChange={(e) => setMetaDescription(e.target.value)}
                      placeholder="検索結果に表示される説明文（160文字以内推奨）"
                      rows={3}
                      disabled={isPending}
                    />
                    {fieldHasErrors(fields.metaDescription.errors) && (
                      <p className="text-sm text-destructive">
                        {fields.metaDescription.errors?.join(", ")}
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground">
                      検索エンジンの結果ページに表示される説明文です
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="space-metaKeywords">メタキーワード</Label>
                    <Input
                      id="space-metaKeywords"
                      value={metaKeywords}
                      onChange={(e) => setMetaKeywords(e.target.value)}
                      placeholder="キーワード1, キーワード2, キーワード3"
                      disabled={isPending}
                    />
                    {fieldHasErrors(fields.metaKeywords.errors) && (
                      <p className="text-sm text-destructive">
                        {fields.metaKeywords.errors?.join(", ")}
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground">
                      カンマ区切りでキーワードを入力
                    </p>
                  </div>
                </div>

                <div className="space-y-4 border-t pt-4">
                  <div className="space-y-2">
                    <Label htmlFor="space-ogpTitle">OGPタイトル</Label>
                    <Input
                      id="space-ogpTitle"
                      value={ogpTitle}
                      onChange={(e) => setOgpTitle(e.target.value)}
                      placeholder="SNSシェア時のタイトル（100文字以内推奨）"
                      disabled={isPending}
                    />
                    {fieldHasErrors(fields.ogpTitle.errors) && (
                      <p className="text-sm text-destructive">
                        {fields.ogpTitle.errors?.join(", ")}
                      </p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="space-ogpDescription">OGP説明文</Label>
                    <Textarea
                      id="space-ogpDescription"
                      value={ogpDescription}
                      onChange={(e) => setOgpDescription(e.target.value)}
                      placeholder="SNSシェア時の説明文（200文字以内推奨）"
                      rows={3}
                      disabled={isPending}
                    />
                    {fieldHasErrors(fields.ogpDescription.errors) && (
                      <p className="text-sm text-destructive">
                        {fields.ogpDescription.errors?.join(", ")}
                      </p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label>OGP画像</Label>
                    <div className="flex items-start gap-3">
                      {ogpImageUrl ? (
                        <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-lg border">
                          <Image
                            src={ogpImageUrl}
                            alt="OGP画像"
                            fill
                            sizes="64px"
                            className="object-cover"
                          />
                        </div>
                      ) : (
                        <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg border border-dashed bg-muted">
                          <IconPhotoPlus
                            aria-hidden="true"
                            className="h-5 w-5 text-muted-foreground"
                          />
                        </div>
                      )}
                      <div className="flex-1 space-y-1">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => ogpImagePicker.openPicker()}
                          disabled={isPending}
                        >
                          <IconPhotoPlus
                            aria-hidden="true"
                            className="mr-1 h-3 w-3"
                          />
                          選択
                        </Button>
                        {ogpImageUrl && (
                          <p className="truncate text-xs text-muted-foreground">
                            {ogpImageUrl}
                          </p>
                        )}
                      </div>
                    </div>
                    {fieldHasErrors(fields.ogpImageUrl.errors) && (
                      <p className="text-sm text-destructive">
                        {fields.ogpImageUrl.errors?.join(", ")}
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground">
                      推奨サイズ: 1200x630px
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ============ 臨時休業（edit のみ・独立 CRUD） ============ */}
        {isEdit && space && (
          <TabsContent
            value="blocked-dates"
            forceMount
            className="data-[state=inactive]:hidden"
          >
            <Card>
              <CardHeader>
                <CardTitle>臨時休業 / 急な休み</CardTitle>
              </CardHeader>
              <CardContent>
                <BlockedDatesField
                  entityId={space.id}
                  initialBlockedDates={initialBlockedDates}
                  createAction={createSpaceBlockedDate}
                  deleteAction={deleteSpaceBlockedDate}
                  description="設備故障・点検などで特定の日付を予約不可にします（営業時間の定休日とは別管理）。"
                />
              </CardContent>
            </Card>
          </TabsContent>
        )}
      </Tabs>

      <div className="sticky bottom-0 z-10 mt-6 -mx-4 border-t bg-background px-4 py-4 md:-mx-6 md:px-6">
        <div className="flex items-center justify-end gap-3">
          <Button variant="outline" asChild disabled={isPending}>
            <Link href={cancelHref}>キャンセル</Link>
          </Button>
          <SubmitButton
            isPending={isPending}
            label={isEdit ? "変更を保存" : "スペースを作成"}
            pendingLabel={isEdit ? "保存中..." : "作成中..."}
          />
        </div>
      </div>

      {mainImagePicker.mediaPickerDialog}
      {ogpImagePicker.mediaPickerDialog}
    </form>
  );
}
