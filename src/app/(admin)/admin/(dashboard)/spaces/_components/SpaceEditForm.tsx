"use client";

import Link from "next/link";
import { useActionState, useEffect, useEffectEvent, useState } from "react";
import { getFormProps, useForm } from "@conform-to/react";
import { parseWithZod } from "@conform-to/zod/v4";
import { parseAsStringLiteral, useQueryState } from "nuqs";
import { IconAlertTriangle } from "@tabler/icons-react";
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
  SubmitButton,
  Tabs,
  TabsList,
  TabsTrigger,
} from "@/admin/components/ui";
import { DraftRecoveryBanner } from "@/admin/components/editor/lexical/parts/DraftRecoveryBanner";
import { useDraftRecovery } from "@/admin/components/editor/lexical/use-draft-recovery";
import { clearDraft } from "@/admin/components/editor/lexical/plugins/AutoSavePlugin";
import { useBeforeUnload } from "@/admin/components/editor/inline/hooks";
import { createSpaceAction, updateSpaceAction } from "@/admin/actions/space";
import { spaceFormSchema } from "@/admin/lib/validations/space";
import type { SpaceWithStats } from "@/admin/lib/validations/space";
import { parseGallery } from "@/shared/lib/validations/gallery";
import type { SpaceRatePlanForResolver } from "@/shared/lib/pricing/rate-plan-resolver";
import {
  DiscountType,
  DurationDiscountOverride,
} from "@/shared/lib/validations/enums/prisma-types";
import { getValidTaxRateType } from "@/shared/lib/validations/enums/helpers";
import type { TaxSettings } from "@/shared/lib/pricing/types";
import { DEFAULT_TAX_SETTINGS } from "@/shared/lib/pricing/tax";
import { toAppRoute } from "@/shared/lib/routes/to-app-route";
import type { BlockedDateData } from "@/shared/domain/blocked-dates/types";
import type { SmartLockDeviceData } from "@/shared/domain/smart-lock/types";
import {
  SPACE_EDIT_TAB_LABELS,
  SPACE_EDIT_TAB_VALUES,
  isSpaceEditTabValue,
  type SpaceEditTabValue,
} from "./space-edit-form/constants";
import {
  fieldHasErrors,
  genKey,
  getInitialDescriptionJson,
  type FacilityItem,
  type SpaceEditCategoryOption,
  type SpaceEditLocationOption,
} from "./space-edit-form/types";
import { SpaceEditBasicTab } from "./space-edit-form/SpaceEditBasicTab";
import { SpaceEditPricingTab } from "./space-edit-form/SpaceEditPricingTab";
import { SpaceEditMediaTab } from "./space-edit-form/SpaceEditMediaTab";
import { SpaceEditDetailsTab } from "./space-edit-form/SpaceEditDetailsTab";
import { SpaceEditPublishTab } from "./space-edit-form/SpaceEditPublishTab";
import { SpaceEditBlockedDatesTab } from "./space-edit-form/SpaceEditBlockedDatesTab";
import { dispatchWithoutFormReset } from "@/shared/lib/forms/conform-submit";

export type { SpaceEditCategoryOption, SpaceEditLocationOption };

export type SpaceEditFormProps = {
  space?: SpaceWithStats;
  mode: "create" | "edit";
  availableLocations: SpaceEditLocationOption[];
  availableCategories: SpaceEditCategoryOption[];
  taxSettings: TaxSettings;
  reviewsFeatureEnabled: boolean;
  initialBlockedDates?: readonly BlockedDateData[];
  availableSmartLockDevices?: readonly SmartLockDeviceData[];
  ratePlans?: SpaceRatePlanForResolver[];
};

export function SpaceEditForm({
  space,
  mode,
  availableLocations,
  availableCategories,
  taxSettings = DEFAULT_TAX_SETTINGS,
  reviewsFeatureEnabled,
  initialBlockedDates = [],
  availableSmartLockDevices = [],
  ratePlans = [],
}: SpaceEditFormProps) {
  const isEdit = mode === "edit";

  const autoSaveKey =
    isEdit && space ? `space-${space.id}-description` : "space-new-description";

  const [activeSection, setActiveSection] = useQueryState(
    "section",
    parseAsStringLiteral(SPACE_EDIT_TAB_VALUES)
      .withDefault("basic")
      .withOptions({ history: "replace", shallow: true }),
  );

  const [name, setName] = useState<string>(space?.name ?? "");
  const [slug, setSlug] = useState<string>(space?.slug ?? "");
  const [descriptionJson, setDescriptionJson] = useState<string>(() =>
    getInitialDescriptionJson(space),
  );

  const [editorResetKey, setEditorResetKey] = useState(0);
  const draftRecovery = useDraftRecovery({
    autoSaveKey,
    initialContentJson: getInitialDescriptionJson(space),
    onRestore: (json) => {
      setDescriptionJson(json);
      setEditorResetKey((prev) => prev + 1);
      void setActiveSection("basic");
    },
  });
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

  const [hourlyPrice, setHourlyPrice] = useState<string>(
    space ? String(space.hourlyPrice) : "0",
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
  const [taxRateType, setTaxRateType] = useState(() =>
    getValidTaxRateType(space?.taxRateType),
  );

  const [mainImageUrl, setMainImageUrl] = useState<string>(
    space?.mainImageUrl ?? "",
  );

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

  // 設備は 1 件につき hidden input 1 つでしか送られないため、DB の値が読めずに
  // 空リストで start すると、価格や説明文だけを直した保存で設備が全部消える。
  // 読めなかった間は保存自体を止める（サイドバー設定の storedWidgetsInvalid と同型）。
  // mount 時に凍結して、保存後の router.refresh() で警告と了承状態がぶれないようにする。
  const [storedFacilitiesInvalid] = useState(
    space?.facilitiesUnreadable ?? false,
  );
  const [facilitiesResetConfirmed, setFacilitiesResetConfirmed] =
    useState(false);
  const saveBlockedByFacilities =
    storedFacilitiesInvalid && !facilitiesResetConfirmed;

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

  const boundAction =
    isEdit && space?.id
      ? updateSpaceAction.bind(null, space.id)
      : createSpaceAction;
  const [lastResult, action, isPending] = useActionState(
    boundAction,
    undefined,
  );

  useEffect(() => {
    if (lastResult?.status === "success") {
      clearDraft(autoSaveKey);
    }
  }, [lastResult, autoSaveKey]);

  const [form, fields] = useForm({
    id: isEdit ? `space-edit-${space?.id ?? ""}` : "space-create",
    lastResult,
    onValidate({ formData }) {
      return parseWithZod(formData, { schema: spaceFormSchema });
    },
    // React 19 の form auto-reset がサーバーの form-level エラーと入力値を
    // 消すのを防ぐ（理由と `action` prop を残す必要性は helper の JSDoc）。
    onSubmit: dispatchWithoutFormReset(action),
    shouldValidate: "onBlur",
    shouldRevalidate: "onInput",
    defaultValue: {
      gallery: parseGallery(space?.gallery),
    },
  });

  const dirtySnapshot = JSON.stringify({
    name,
    slug,
    descriptionJson,
    addressDetail,
    capacity,
    area,
    locationId,
    hourlyPrice,
    discountType,
    discountValue,
    durationDiscountOverride,
    taxRateType,
    mainImageUrl,
    gallery: fields.gallery.value ?? [],
    categoryId,
    facilities,
    isPublished,
    reviewsEnabled,
    metaDescription,
    metaKeywords,
    ogpTitle,
    ogpDescription,
    ogpImageUrl,
  });
  const [initialSnapshot] = useState(dirtySnapshot);
  const isDirty = dirtySnapshot !== initialSnapshot;
  useBeforeUnload({ isDirty });

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

  // 読めなかった設備が失われることを了承して保存を解禁する。設備には既定値が
  // 無いので、サイドバー設定の「デフォルトにリセット」に当たる操作は空リスト化。
  const clearUnreadableFacilities = () => {
    setFacilities([]);
    setFacilitiesResetConfirmed(true);
  };

  const triggerSave = useEffectEvent(() => {
    // Ctrl+S の requestSubmit() は disabled な送信ボタンを迂回してしまう。
    if (saveBlockedByFacilities) return;
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
    "blocked-dates": 0,
  };

  const onTabChange = (value: string) => {
    if (isSpaceEditTabValue(value)) {
      void setActiveSection(value);
    }
  };

  const cancelHref =
    isEdit && space
      ? toAppRoute(`/admin/spaces/${space.id}`)
      : toAppRoute("/admin/spaces");

  return (
    <form {...getFormProps(form)} action={action} className="space-y-6">
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

      {draftRecovery.isAvailable && (
        <DraftRecoveryBanner
          savedAt={draftRecovery.savedAt}
          onRestore={draftRecovery.restore}
          onDismiss={draftRecovery.dismiss}
        />
      )}

      {storedFacilitiesInvalid && (
        <Alert variant="destructive">
          <IconAlertTriangle aria-hidden="true" />
          <AlertTitle>保存されている設備リストが不正です</AlertTitle>
          <AlertDescription>
            <p>
              データベース上の設備リストを読み込めませんでした。誤って上書きしないよう、保存は一時的に無効です。
            </p>
            <p>
              設備リストを空にすると保存できるようになります（保存すると、読み込めなかった設備は失われます）。
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-3"
              onClick={clearUnreadableFacilities}
              disabled={isPending || facilitiesResetConfirmed}
            >
              設備リストを空にする
            </Button>
          </AlertDescription>
        </Alert>
      )}

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

        <SpaceEditBasicTab
          space={space}
          isPending={isPending}
          name={name}
          onNameChange={setName}
          slug={slug}
          onSlugChange={setSlug}
          descriptionJson={descriptionJson}
          onDescriptionJsonChange={setDescriptionJson}
          editorResetKey={editorResetKey}
          autoSaveKey={autoSaveKey}
          locationId={locationId}
          onLocationIdChange={setLocationId}
          addressDetail={addressDetail}
          onAddressDetailChange={setAddressDetail}
          capacity={capacity}
          onCapacityChange={setCapacity}
          area={area}
          onAreaChange={setArea}
          availableLocations={availableLocations}
          fields={{
            name: fields.name,
            slug: fields.slug,
            descriptionJson: fields.descriptionJson,
            locationId: fields.locationId,
            addressDetail: fields.addressDetail,
            capacity: fields.capacity,
            area: fields.area,
          }}
        />

        <SpaceEditPricingTab
          isEdit={isEdit}
          space={space}
          isPending={isPending}
          hourlyPrice={hourlyPrice}
          onHourlyPriceChange={setHourlyPrice}
          discountType={discountType}
          onDiscountTypeChange={setDiscountType}
          discountValue={discountValue}
          onDiscountValueChange={setDiscountValue}
          durationDiscountOverride={durationDiscountOverride}
          onDurationDiscountOverrideChange={setDurationDiscountOverride}
          taxRateType={taxRateType}
          onTaxRateTypeChange={setTaxRateType}
          taxSettings={taxSettings}
          ratePlans={[...ratePlans]}
          fields={{
            hourlyPrice: fields.hourlyPrice,
            discountValue: fields.discountValue,
          }}
        />

        <SpaceEditMediaTab
          isPending={isPending}
          mainImageUrl={mainImageUrl}
          onMainImageUrlChange={setMainImageUrl}
          form={form}
          fields={{
            mainImageUrl: fields.mainImageUrl,
            gallery: fields.gallery,
          }}
        />

        <SpaceEditDetailsTab
          isEdit={isEdit}
          space={space}
          isPending={isPending}
          categoryId={categoryId}
          onCategoryIdChange={setCategoryId}
          facilities={facilities}
          newFacility={newFacility}
          onNewFacilityChange={setNewFacility}
          newFacilityIconName={newFacilityIconName}
          onNewFacilityIconNameChange={setNewFacilityIconName}
          onAddFacility={addFacility}
          onRemoveFacility={removeFacility}
          availableCategories={availableCategories}
          availableSmartLockDevices={availableSmartLockDevices}
          fields={{
            categoryId: fields.categoryId,
            facilities: fields.facilities,
          }}
        />

        <SpaceEditPublishTab
          isPending={isPending}
          reviewsFeatureEnabled={reviewsFeatureEnabled}
          isPublished={isPublished}
          onIsPublishedChange={setIsPublished}
          reviewsEnabled={reviewsEnabled}
          onReviewsEnabledChange={setReviewsEnabled}
          metaDescription={metaDescription}
          onMetaDescriptionChange={setMetaDescription}
          metaKeywords={metaKeywords}
          onMetaKeywordsChange={setMetaKeywords}
          ogpTitle={ogpTitle}
          onOgpTitleChange={setOgpTitle}
          ogpDescription={ogpDescription}
          onOgpDescriptionChange={setOgpDescription}
          ogpImageUrl={ogpImageUrl}
          onOgpImageUrlChange={setOgpImageUrl}
          fields={{
            isPublished: fields.isPublished,
            metaDescription: fields.metaDescription,
            metaKeywords: fields.metaKeywords,
            ogpTitle: fields.ogpTitle,
            ogpDescription: fields.ogpDescription,
            ogpImageUrl: fields.ogpImageUrl,
          }}
        />

        {isEdit && space && (
          <SpaceEditBlockedDatesTab
            spaceId={space.id}
            initialBlockedDates={initialBlockedDates}
          />
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
            disabled={saveBlockedByFacilities}
          />
        </div>
      </div>
    </form>
  );
}
