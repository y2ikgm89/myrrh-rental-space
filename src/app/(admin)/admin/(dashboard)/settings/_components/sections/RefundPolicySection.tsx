"use client";

/**
 * 返金ポリシー設定セクション (task #9 PR#5 admin settings UI)
 *
 * `Settings.refundPolicy` の tier ベース返金率を編集する。
 * `DiscountSection` と同型の conform 配列 (form.insert / form.remove) パターン。
 *
 * ## UI 構造
 * - Enable Switch: OFF なら policy null (全額返金の後方互換動作)
 * - Tier リスト: hoursBefore + refundRate ペア (追加/削除)
 * - defaultRefundRate: 全 tier 外れ時の返金率
 * - プリセット button: 「7日前100% / 3日前50% / それ以降0%」を一括挿入
 */

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { IconPlus, IconTrash } from "@tabler/icons-react";
import {
  getFormProps,
  getInputProps,
  useForm,
  useInputControl,
} from "@conform-to/react";
import { parseWithZod } from "@conform-to/zod/v4";
import { toast } from "sonner";
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Label,
  SubmitButton,
  Switch,
} from "@/admin/components/ui";
import { updateRefundPolicySettings } from "@/admin/actions/settings";
import { refundPolicyFormSchema } from "@/admin/actions/settings/schemas/refund-policy";
import type { RefundPolicy } from "@/shared/domain/refund/policy";

interface RefundPolicySectionProps {
  settings: RefundPolicy | null;
}

const DEFAULT_TIER = { hoursBefore: 168, refundRate: 100 };
const PRESET_TIERS: ReadonlyArray<{ hoursBefore: number; refundRate: number }> =
  [
    { hoursBefore: 168, refundRate: 100 },
    { hoursBefore: 72, refundRate: 50 },
  ];

export function RefundPolicySection({ settings }: RefundPolicySectionProps) {
  const router = useRouter();
  const [lastResult, action, isPending] = useActionState(
    updateRefundPolicySettings,
    undefined,
  );

  const initialEnabled = settings !== null;
  const initialTiers =
    settings && settings.tiers.length > 0
      ? settings.tiers.map((t) => ({
          hoursBefore: t.hoursBefore,
          refundRate: t.refundRate,
        }))
      : [DEFAULT_TIER];
  const initialDefaultRate = settings ? settings.defaultRefundRate : 0;

  const [form, fields] = useForm({
    id: "refund-policy-settings",
    lastResult,
    onValidate({ formData }) {
      return parseWithZod(formData, { schema: refundPolicyFormSchema });
    },
    shouldValidate: "onBlur",
    shouldRevalidate: "onInput",
    defaultValue: {
      refundPolicyEnabled: initialEnabled ? "on" : "",
      refundPolicyTiers: initialTiers.map((tier) => ({
        hoursBefore: String(tier.hoursBefore),
        refundRate: String(tier.refundRate),
      })),
      refundPolicyDefaultRefundRate: String(initialDefaultRate),
    },
  });

  const enabledControl = useInputControl(fields.refundPolicyEnabled);
  const enabled = enabledControl.value === "on";
  const tierFields = fields.refundPolicyTiers.getFieldList();

  useEffect(() => {
    if (lastResult && lastResult.initialValue === null) {
      toast.success("返金ポリシーを更新しました");
      router.refresh();
    }
  }, [lastResult, router]);

  const formErrors = form.errors;
  const tierArrayErrors = fields.refundPolicyTiers.errors;

  // 追加時の hoursBefore デフォルト: 既存の最小値より一段短い区分 (24h ずつ) を提案。
  const minHours = Math.min(
    ...tierFields.flatMap((tf) => {
      const initial = tf.getFieldset().hoursBefore.initialValue;
      if (typeof initial !== "string") return [];
      const parsed = parseInt(initial, 10);
      return Number.isFinite(parsed) ? [parsed] : [];
    }),
    Number.POSITIVE_INFINITY,
  );
  const nextTierHours = Number.isFinite(minHours)
    ? Math.max(0, minHours - 24)
    : 24;

  const applyPreset = () => {
    // 既存 tier を全削除 → プリセットを挿入。form.remove を末尾から適用してから
    // form.insert を順に呼ぶ (conform の index shift 対策)。
    for (let i = tierFields.length - 1; i >= 0; i -= 1) {
      form.remove({ name: fields.refundPolicyTiers.name, index: i });
    }
    for (const preset of PRESET_TIERS) {
      form.insert({
        name: fields.refundPolicyTiers.name,
        defaultValue: {
          hoursBefore: String(preset.hoursBefore),
          refundRate: String(preset.refundRate),
        },
      });
    }
  };

  return (
    <form {...getFormProps(form)} action={action} className="space-y-6">
      <input
        type="hidden"
        name={fields.refundPolicyEnabled.name}
        value={enabledControl.value ?? ""}
      />

      <Card>
        <CardHeader>
          <CardTitle>返金ポリシー</CardTitle>
          <CardDescription>
            予約キャンセル時の自動返金率を予約開始までの残り時間で段階的に設定します
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center justify-between rounded-lg border p-4">
            <div className="space-y-0.5">
              <Label htmlFor={fields.refundPolicyEnabled.id}>
                返金ポリシーを有効にする
              </Label>
              <p className="text-xs text-muted-foreground">
                無効の場合、キャンセル時は残額全額を自動返金します
              </p>
            </div>
            <Switch
              id={fields.refundPolicyEnabled.id}
              checked={enabled}
              onCheckedChange={(checked) =>
                enabledControl.change(checked ? "on" : "")
              }
              disabled={isPending}
            />
          </div>

          {enabled && (
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium">tier 一覧</p>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={applyPreset}
                    disabled={isPending}
                  >
                    推奨プリセット
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      form.insert({
                        name: fields.refundPolicyTiers.name,
                        defaultValue: {
                          hoursBefore: String(nextTierHours),
                          refundRate: "50",
                        },
                      })
                    }
                    disabled={isPending}
                  >
                    <IconPlus className="mr-1 h-4 w-4" aria-hidden="true" />
                    tier を追加
                  </Button>
                </div>
              </div>

              <div className="space-y-3">
                {tierFields.map((tierField, index) => {
                  const tierFieldset = tierField.getFieldset();
                  return (
                    <div
                      key={tierField.key}
                      className="flex items-center gap-3 rounded-lg border p-3"
                    >
                      <div className="flex-1 grid gap-3 sm:grid-cols-2">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <Input
                              {...getInputProps(tierFieldset.hoursBefore, {
                                type: "number",
                              })}
                              min={0}
                              max={8760}
                              step={1}
                              className="w-24"
                              disabled={isPending}
                              aria-label={`tier ${index + 1} 開始まで残り時間`}
                            />
                            <span className="text-sm text-muted-foreground">
                              時間以上前で
                            </span>
                          </div>
                          {tierFieldset.hoursBefore.errors && (
                            <p className="text-xs text-destructive">
                              {tierFieldset.hoursBefore.errors.join(", ")}
                            </p>
                          )}
                        </div>
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <Input
                              {...getInputProps(tierFieldset.refundRate, {
                                type: "number",
                              })}
                              min={0}
                              max={100}
                              step={0.01}
                              className="w-24"
                              disabled={isPending}
                              aria-label={`tier ${index + 1} 返金率`}
                            />
                            <span className="text-sm text-muted-foreground">
                              % 返金
                            </span>
                          </div>
                          {tierFieldset.refundRate.errors && (
                            <p className="text-xs text-destructive">
                              {tierFieldset.refundRate.errors.join(", ")}
                            </p>
                          )}
                        </div>
                      </div>
                      <Button
                        type="button"
                        variant="destructive-ghost"
                        size="sm"
                        onClick={() =>
                          form.remove({
                            name: fields.refundPolicyTiers.name,
                            index,
                          })
                        }
                        disabled={isPending || tierFields.length <= 1}
                        aria-label={`tier ${index + 1} を削除`}
                      >
                        <IconTrash className="h-4 w-4" aria-hidden="true" />
                      </Button>
                    </div>
                  );
                })}
              </div>

              {tierArrayErrors && tierArrayErrors.length > 0 && (
                <p
                  id={fields.refundPolicyTiers.errorId}
                  className="text-sm text-destructive"
                >
                  {tierArrayErrors.join(", ")}
                </p>
              )}

              <p className="text-xs text-muted-foreground">
                残り時間が長いほど優先されます。全 tier 外れの場合は下段の
                「既定返金率」が適用されます。
              </p>

              <div className="space-y-1.5 rounded-lg border p-4">
                <Label htmlFor={fields.refundPolicyDefaultRefundRate.id}>
                  既定返金率
                </Label>
                <div className="flex items-center gap-2">
                  <Input
                    {...getInputProps(fields.refundPolicyDefaultRefundRate, {
                      type: "number",
                    })}
                    min={0}
                    max={100}
                    step={0.01}
                    className="w-24"
                    disabled={isPending}
                  />
                  <span className="text-sm text-muted-foreground">%</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  全 tier に match しないキャンセルに適用する返金率です。0%
                  にすると自動返金を skip
                  し、運用側で「要返金確認」通知に集約します。
                </p>
                {fields.refundPolicyDefaultRefundRate.errors && (
                  <p
                    id={fields.refundPolicyDefaultRefundRate.errorId}
                    className="text-sm text-destructive"
                  >
                    {fields.refundPolicyDefaultRefundRate.errors.join(", ")}
                  </p>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {formErrors && formErrors.length > 0 && (
        <div
          id={form.errorId}
          role="alert"
          className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {formErrors.join(", ")}
        </div>
      )}

      <div className="flex justify-end pt-2">
        <SubmitButton
          isPending={isPending}
          label="返金ポリシーを保存"
          pendingLabel="保存中..."
        />
      </div>
    </form>
  );
}
