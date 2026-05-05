"use client";

import {
  useState,
  useEffect,
  useId,
  useEffectEvent,
  useRef,
  useActionState,
  useTransition,
} from "react";
import { useRouter } from "next/navigation";
import {
  useFieldArray,
  useForm,
  type FieldValues,
  type Path,
} from "react-hook-form";
import { standardSchemaResolver } from "@hookform/resolvers/standard-schema";
import { toast } from "sonner";
import {
  Button,
  SubmitButton,
  useSensor,
  useSensors,
  PointerSensor,
  KeyboardSensor,
  sortableKeyboardCoordinates,
  Tabs,
  TabsList,
  TabsTrigger,
  type DragEndEvent,
} from "@/admin/components/ui";
import { submitSpaceFormAction } from "@/admin/actions/space-form-submit";
import { SPACE_FORM_ACTION_INITIAL_STATE } from "@/admin/actions/space-form-submit-types";
import { spaceFormDataToFormData } from "@/admin/lib/space-form-data-codec";
import {
  useSingleMediaPicker,
  useMultipleMediaPicker,
} from "@/admin/hooks/use-media-picker";
import type { TaxSettings } from "@/shared/lib/pricing/types";
import { DEFAULT_TAX_SETTINGS } from "@/shared/lib/pricing/tax";
import { getValidTaxRateType } from "@/shared/lib/validations/enums/helpers";
import { EMPTY_LEXICAL_EDITOR_STATE_JSON } from "@/shared/lib/lexical/description-defaults";
import type { SpaceWithStats } from "@/admin/lib/validations/space";
import {
  DiscountType,
  DurationDiscountOverride,
  TaxRateType,
} from "@/shared/lib/validations/enums/prisma-types";
import { useQueryState, parseAsStringLiteral } from "nuqs";
import {
  spaceEditFormSchema,
  type SpaceEditFormData,
  spaceEditFormDataToSpaceFormPayload,
  SPACE_EDIT_TAB_VALUES,
  SPACE_EDIT_TAB_LABELS,
  getSpaceEditTabErrorCount,
  parseSpaceEditTabValue,
} from "./schema";
import {
  type SpaceEditCategoryOption,
  type SpaceEditLocationOption,
} from "./types";
import { SpaceEditBasicTabPanel } from "./tabs/basic-tab-panel";
import { SpaceEditPricingTabPanel } from "./tabs/pricing-tab-panel";
import { SpaceEditMediaTabPanel } from "./tabs/media-tab-panel";
import { SpaceEditDetailsTabPanel } from "./tabs/details-tab-panel";
import { SpaceEditPublishTabPanel } from "./tabs/publish-tab-panel";

function hasTopLevelField<TInput extends FieldValues>(
  values: TInput,
  field: string,
): field is Path<TInput> {
  return field in values;
}

export type SpaceEditFormProps = {
  space?: SpaceWithStats;
  mode: "create" | "edit";
  availableLocations: SpaceEditLocationOption[];
  availableCategories: SpaceEditCategoryOption[];
  taxSettings: TaxSettings;
  reviewsEnabledGlobal: boolean;
};

export function SpaceEditForm({
  space,
  mode,
  availableLocations,
  availableCategories,
  taxSettings = DEFAULT_TAX_SETTINGS,
  reviewsEnabledGlobal,
}: SpaceEditFormProps) {
  const router = useRouter();
  /** スペース管理ハブの `tab` と衝突しないよう `section` を使用 */
  const [activeSection, setActiveSection] = useQueryState(
    "section",
    parseAsStringLiteral(SPACE_EDIT_TAB_VALUES)
      .withDefault("basic")
      .withOptions({ history: "push", shallow: true }),
  );
  const [newFacility, setNewFacility] = useState("");
  const dndContextId = useId();
  const clientNonceRef = useRef(0);
  const lastHandledActionKeyRef = useRef<string | null>(null);

  const publishedAtDefault = space?.publishedAt ?? undefined;

  const [actionState, formAction, isActionPending] = useActionState(
    submitSpaceFormAction,
    SPACE_FORM_ACTION_INITIAL_STATE,
  );
  const [, startTransition] = useTransition();

  const form = useForm<SpaceEditFormData, unknown, SpaceEditFormData>({
    resolver: standardSchemaResolver(spaceEditFormSchema),
    defaultValues: space
      ? {
          slug: space.slug,
          name: space.name,
          descriptionJson:
            typeof space.descriptionJson === "string"
              ? space.descriptionJson
              : JSON.stringify(
                  space.descriptionJson ??
                    JSON.parse(EMPTY_LEXICAL_EDITOR_STATE_JSON),
                ),
          addressDetail: space.addressDetail ?? "",
          capacity: space.capacity,
          area: space.area ?? undefined,
          hourlyPrice: space.hourlyPrice,
          dailyPrice: space.dailyPrice ?? undefined,
          mainImageUrl: space.mainImageUrl,
          imageUrls: space.imageUrls.map((url) => ({ url })),
          facilities: space.facilities.map((value) => ({ value })),
          isPublished: space.isPublished,
          reviewsEnabled: space.reviewsEnabled,
          locationId: space.locationId,
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
          publishedAt: publishedAtDefault,
        }
      : {
          slug: "",
          name: "",
          descriptionJson: EMPTY_LEXICAL_EDITOR_STATE_JSON,
          addressDetail: "",
          capacity: 10,
          area: undefined,
          hourlyPrice: 0,
          dailyPrice: undefined,
          mainImageUrl: "",
          imageUrls: [],
          facilities: [],
          isPublished: false,
          reviewsEnabled: true,
          locationId: "",
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

  const isPending = isActionPending;

  /**
   * ref の読取はイベントハンドラ内に限定する（react-hooks/refs / React Compiler 準拠）
   */
  const runSpaceFormSubmit = (e?: React.BaseSyntheticEvent) => {
    clientNonceRef.current += 1;
    const nonce = clientNonceRef.current;
    void form.handleSubmit((data) => {
      const payload = spaceEditFormDataToSpaceFormPayload(data);
      const fd = spaceFormDataToFormData(payload, {
        intent: mode === "create" ? "create" : "update",
        ...(mode === "edit" && space !== undefined
          ? { spaceId: space.id }
          : {}),
        clientNonce: nonce,
      });
      startTransition(() => {
        void formAction(fd);
      });
    })(e);
  };

  useEffect(() => {
    if (actionState.status === "idle") return;
    if (actionState.clientNonce !== clientNonceRef.current) return;

    const dedupeKey = `${actionState.status}-${actionState.clientNonce}-${actionState.status === "success" ? (actionState.createdId ?? "updated") : actionState.message}`;
    if (lastHandledActionKeyRef.current === dedupeKey) return;
    lastHandledActionKeyRef.current = dedupeKey;

    if (actionState.status === "error") {
      toast.error(actionState.message);
      if (actionState.fieldErrors) {
        const currentValues = form.getValues();
        for (const [field, errors] of Object.entries(actionState.fieldErrors)) {
          if (
            errors &&
            errors.length > 0 &&
            hasTopLevelField(currentValues, field)
          ) {
            const firstError = errors[0];
            form.setError(field, {
              type: "server",
              ...(firstError !== undefined && { message: firstError }),
            });
          }
        }
      }
      return;
    }

    if (actionState.status === "success") {
      if (actionState.createdId !== undefined) {
        toast.success("スペースを作成しました");
        router.push(`/admin/spaces/${actionState.createdId}`);
      } else {
        toast.success("スペースを保存しました");
        router.refresh();
        form.reset(form.getValues());
      }
    }
  }, [actionState, form, router]);

  const {
    register,
    control,
    setValue,
    getValues,
    formState: { errors, isDirty },
  } = form;

  const {
    fields: imageFields,
    append: appendImage,
    remove: removeImage,
    move: moveImage,
  } = useFieldArray({ control, name: "imageUrls" });

  const {
    fields: facilityFields,
    append: appendFacility,
    remove: removeFacility,
  } = useFieldArray({ control, name: "facilities" });

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

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const triggerSave = useEffectEvent(() => {
    runSpaceFormSubmit();
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

  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (isDirty) e.preventDefault();
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isDirty]);

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
    <form onSubmit={runSpaceFormSubmit}>
      <Tabs
        value={activeSection}
        onValueChange={(v) => {
          const tab = parseSpaceEditTabValue(v);
          if (tab) void setActiveSection(tab);
        }}
        className="space-y-4"
      >
        <TabsList className="h-auto flex-wrap gap-1">
          {SPACE_EDIT_TAB_VALUES.map((tab) => {
            const errorCount = getSpaceEditTabErrorCount(errors, tab);
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

        <SpaceEditBasicTabPanel
          control={control}
          register={register}
          setValue={setValue}
          errors={errors}
          isPending={isPending}
          availableLocations={availableLocations}
        />

        <SpaceEditPricingTabPanel
          control={control}
          register={register}
          setValue={setValue}
          errors={errors}
          isPending={isPending}
          taxSettings={taxSettings}
        />

        <SpaceEditMediaTabPanel
          control={control}
          errors={errors}
          isPending={isPending}
          dndContextId={dndContextId}
          sensors={sensors}
          imageFields={imageFields}
          onImageDragEnd={handleImageDragEnd}
          onRemoveImage={removeImage}
          mainImagePicker={mainImagePicker}
          additionalImagesPicker={additionalImagesPicker}
        />

        <SpaceEditDetailsTabPanel
          control={control}
          setValue={setValue}
          isPending={isPending}
          availableCategories={availableCategories}
          newFacility={newFacility}
          onNewFacilityChange={setNewFacility}
          onAddFacility={addFacility}
          facilityFields={facilityFields}
          onRemoveFacility={removeFacility}
        />

        <SpaceEditPublishTabPanel
          control={control}
          register={register}
          errors={errors}
          setValue={setValue}
          getValues={getValues}
          isPending={isPending}
          reviewsEnabledGlobal={reviewsEnabledGlobal}
        />
      </Tabs>

      <div className="sticky bottom-0 z-10 mt-6 -mx-4 border-t bg-background px-4 py-4 md:-mx-6 md:px-6">
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            {isDirty ? "未保存の変更があります" : ""}
          </p>
          <div className="flex gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={() =>
                router.push(
                  mode === "edit" && space
                    ? `/admin/spaces/${space.id}`
                    : "/admin/spaces",
                )
              }
              disabled={isPending}
            >
              キャンセル
            </Button>
            <SubmitButton
              isPending={isPending}
              label={mode === "create" ? "スペースを作成" : "変更を保存"}
              {...(mode === "edit" && { disabled: !isDirty })}
            />
          </div>
        </div>
      </div>

      {mainImagePicker.mediaPickerDialog}
      {additionalImagesPicker.mediaPickerDialog}
    </form>
  );
}
