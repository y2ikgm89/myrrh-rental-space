"use client";

/**
 * Feature Module ON/OFF 切替フォーム
 *
 * Sanity / Stripe Capabilities 流の declarative composition pattern。
 * 11 module の boolean を一括 PATCH。`requires` 依存元が OFF の module は
 * Switch を disabled 化し、実行時 OFF として送信する（保存値が true でも UI は OFF 表示）。
 *
 * clean break 移行。11 module の boolean Switch は `useInputControl` + hidden
 * input で "on" / "" sync、`z.boolean()` で `parseWithZod` 自動 coerce。
 */

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import type { FieldMetadata } from "@conform-to/react";
import { getFormProps, getInputProps, useForm } from "@conform-to/react";
import { parseWithZod } from "@conform-to/zod/v4";
import { toast } from "sonner";
import { updateFeatureModulesSettings } from "@/admin/actions/settings";
import { featureModulesSettingsSchema } from "@/admin/actions/settings/schemas/basic";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Checkbox,
  SubmitButton,
  Switch,
} from "@/admin/components/ui";
import { useTypedInputControl } from "@/shared/lib/conform/typed-input-control";
import type { FeatureModule } from "@/shared/lib/features/registry";
import { dispatchWithoutFormReset } from "@/shared/lib/forms/conform-submit";

interface ModuleDef {
  readonly id: FeatureModule;
  readonly label: string;
  readonly description: string;
  readonly requires: readonly FeatureModule[];
  readonly publicRoutes: readonly string[];
}

interface FeatureModulesFormProps {
  readonly initialValues: Record<FeatureModule, boolean>;
  readonly moduleDefs: readonly ModuleDef[];
  readonly featuresUpdatedAt: string | Date;
}

const OPTIMISTIC_CONFLICT_HINT = "他のユーザーにより更新されています";

export function FeatureModulesForm({
  initialValues,
  moduleDefs,
  featuresUpdatedAt,
}: FeatureModulesFormProps) {
  const router = useRouter();
  const initialDataRetentionEnabled = initialValues["data-retention"] === true;
  const [lastResult, action, isPending] = useActionState(
    updateFeatureModulesSettings,
    undefined,
  );

  const [form, fields] = useForm({
    id: "feature-modules-settings",
    lastResult,
    onValidate({ formData }) {
      return parseWithZod(formData, { schema: featureModulesSettingsSchema });
    },
    // React 19 の form auto-reset がサーバーの form-level エラーと入力値を
    // 消すのを防ぐ（理由と `action` prop を残す必要性は helper の JSDoc）。
    onSubmit: dispatchWithoutFormReset(action),
    shouldValidate: "onBlur",
    shouldRevalidate: "onInput",
    defaultValue: {
      ...Object.fromEntries(
        moduleDefs.map((mod): [string, string] => [
          mod.id,
          initialValues[mod.id] ? "on" : "",
        ]),
      ),
      confirmDataRetentionEnable: "",
      expectedUpdatedAt: featuresUpdatedAt,
    },
  });

  useEffect(() => {
    if (lastResult && lastResult.initialValue === null) {
      toast.success("機能モジュールを保存しました");
      router.refresh();
      return;
    }
    if (lastResult?.status === "error") {
      const formLevelErrors = lastResult.error?.[""];
      const conflictMessage = formLevelErrors?.find((message) =>
        message.includes(OPTIMISTIC_CONFLICT_HINT),
      );
      if (conflictMessage) {
        toast.error(conflictMessage);
        router.refresh();
      }
    }
  }, [lastResult, router]);

  const formErrors = form.errors;

  return (
    <form {...getFormProps(form)} action={action} className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>機能モジュール ON/OFF</CardTitle>
          <CardDescription>
            OFF にした機能は公開ページが 404
            になり、公開サイトのナビゲーション・サイトマップ・セクションから除外されます。機能に紐づく
            cron はスキップされますが、決済・予約まわりの一部 cron（例:
            pending-reservation-expire、receipt-backfill）は引き続き実行される場合があります。管理画面のサイドバー・コマンドパレットは残り、「非公開」badge
            と tooltip で公開面 OFF
            を示します（一覧・編集は可、新規作成はページとアクションでブロック）。データベース上の既存データは保持されます。
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <input
            {...getInputProps(fields.expectedUpdatedAt, { type: "hidden" })}
          />
          {moduleDefs.map((mod) => {
            const field = fields[mod.id];
            if (!field) return null;
            const depsMet = mod.requires.every(
              (req) => fields[req]?.value === "on",
            );
            return (
              <ModuleSwitchRow
                key={mod.id}
                mod={mod}
                moduleDefs={moduleDefs}
                field={field}
                isPending={isPending}
                depsMet={depsMet}
              />
            );
          })}
          {fields["data-retention"] && fields.confirmDataRetentionEnable && (
            <DataRetentionEnableConfirmSection
              dataRetentionField={fields["data-retention"]}
              confirmField={fields.confirmDataRetentionEnable}
              initialDataRetentionEnabled={initialDataRetentionEnabled}
              isPending={isPending}
            />
          )}
          {formErrors && formErrors.length > 0 && (
            <div
              id={form.errorId}
              role="alert"
              className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
            >
              {formErrors.join(", ")}
            </div>
          )}
          <div className="flex justify-end pt-2">
            <SubmitButton
              isPending={isPending}
              label="保存"
              pendingLabel="保存中..."
            />
          </div>
        </CardContent>
      </Card>
    </form>
  );
}

/**
 * data-retention OFF→ON 時の確認 UI（FM-RET-01）。
 */
function DataRetentionEnableConfirmSection({
  dataRetentionField,
  confirmField,
  initialDataRetentionEnabled,
  isPending,
}: {
  readonly dataRetentionField: FieldMetadata<unknown>;
  readonly confirmField: FieldMetadata<unknown>;
  readonly initialDataRetentionEnabled: boolean;
  readonly isPending: boolean;
}) {
  const dataRetentionControl = useTypedInputControl(dataRetentionField);
  const confirmControl = useTypedInputControl(confirmField);
  const requiresConfirm =
    !initialDataRetentionEnabled && dataRetentionControl.value === "on";

  if (!requiresConfirm) {
    return null;
  }

  return (
    <div
      role="alert"
      className="space-y-3 rounded-md border border-destructive/40 bg-destructive/5 px-4 py-3"
    >
      <p className="text-sm font-medium text-destructive">
        データ保持ポリシーの自動適用を有効にしようとしています
      </p>
      <p className="text-sm text-muted-foreground">
        次回以降の毎日 cron 実行で、保持月数設定を過ぎた Session / 認証トークン
        / 予約ゲスト情報 / 問い合わせ /
        非アクティブ顧客の個人情報が不可逆的に削除または匿名化される可能性があります。業務ルールと保持月数を確認してから有効化してください。
      </p>
      <label
        htmlFor={confirmField.id}
        className="flex cursor-pointer items-start gap-2 text-sm"
      >
        <Checkbox
          id={confirmField.id}
          checked={confirmControl.value === "on"}
          onCheckedChange={(checked) =>
            confirmControl.change(checked ? "on" : "")
          }
          onBlur={confirmControl.blur}
          disabled={isPending}
        />
        <span>
          上記のリスクを理解し、データ保持ポリシーの自動適用を有効にすることに同意します
        </span>
      </label>
      <input
        type="hidden"
        name={confirmField.name}
        value={confirmControl.value ?? ""}
      />
      {confirmField.errors && confirmField.errors.length > 0 && (
        <p id={confirmField.errorId} className="text-xs text-destructive">
          {confirmField.errors.join(", ")}
        </p>
      )}
    </div>
  );
}

/**
 * 1 module 分の Switch 行 — `useInputControl` で per-module state を持つ。
 * useInputControl は Hook のため map() 内で直接呼べず、sub-component に
 * 切り出して各行で個別に呼ぶ canonical pattern。
 */
function ModuleSwitchRow({
  mod,
  moduleDefs,
  field,
  isPending,
  depsMet,
}: {
  readonly mod: ModuleDef;
  readonly moduleDefs: readonly ModuleDef[];
  readonly field: FieldMetadata<unknown>;
  readonly isPending: boolean;
  readonly depsMet: boolean;
}) {
  const control = useTypedInputControl(field);
  const isOn = control.value === "on";
  const disabledDueToDeps = !depsMet;
  const switchDisabled = isPending || disabledDueToDeps;
  const effectiveOn = depsMet && isOn;
  const submittedValue = depsMet ? (control.value ?? "") : "";

  return (
    <div className="flex items-start justify-between rounded-lg border p-4">
      <div className="space-y-1">
        <label htmlFor={field.id} className="cursor-pointer font-medium">
          {mod.label}
        </label>
        <p className="text-xs text-muted-foreground">{mod.description}</p>
        {mod.publicRoutes.length > 0 && (
          <p className="text-xs text-muted-foreground">
            <span className="font-medium">影響ルート:</span>{" "}
            {mod.publicRoutes.join(", ")}
          </p>
        )}
        {mod.requires.length > 0 && (
          <p className="text-xs text-muted-foreground">
            <span className="font-medium">依存:</span>{" "}
            {mod.requires
              .map((req) => `「${labelFor(moduleDefs, req)}」`)
              .join(" + ")}
            （OFF にすると本機能も自動的に OFF として扱われます）
          </p>
        )}
        {disabledDueToDeps && (
          <p className="text-xs text-muted-foreground">
            依存機能が OFF のため操作できません。保存値が ON のままでも実行時は
            OFF として扱われ、保存時も OFF として送信されます。
          </p>
        )}
        {field.errors && (
          <p id={field.errorId} className="text-xs text-destructive">
            {field.errors.join(", ")}
          </p>
        )}
      </div>
      <Switch
        id={field.id}
        checked={effectiveOn}
        onCheckedChange={(checked) => control.change(checked ? "on" : "")}
        onBlur={control.blur}
        disabled={switchDisabled}
      />
      <input type="hidden" name={field.name} value={submittedValue} />
    </div>
  );
}

function labelFor(defs: readonly ModuleDef[], id: FeatureModule): string {
  return defs.find((d) => d.id === id)?.label ?? id;
}
