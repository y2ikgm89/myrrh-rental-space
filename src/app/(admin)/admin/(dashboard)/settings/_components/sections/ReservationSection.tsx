"use client";

/**
 * 予約設定セクション
 *
 * 予約時間単位、最小/最大予約時間、キャンセルポリシーの設定
 * キャンセルポリシーは利用規約管理（Terms）から選択
 */

import { useState, useEffect } from "react";
import type { Serialized } from "@/shared/lib/serialize";
import Link from "next/link";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SubmitButton,
} from "@/admin/components/ui";
import { useFormAction } from "@/admin/hooks/useFormAction";
import { updateReservationSettings } from "@/admin/actions/settings";
import { reservationFormSchema } from "@/admin/actions/settings/schemas";
import { fetchAdminJson } from "@/admin/lib/admin-api-client";
import type { SettingsData } from "@/shared/domain/settings/types";
import { ExternalLink, AlertCircle } from "lucide-react";
import { logger } from "@/shared/lib/logger";
import { getErrorMessage } from "@/shared/lib/errors";

interface ReservationSectionProps {
  settings: Serialized<SettingsData>;
}

interface CancellationPolicy {
  id: string;
  title: string;
  updatedAt: string;
}

async function fetchCancellationPolicies(): Promise<CancellationPolicy[]> {
  return fetchAdminJson("/admin/api/settings/cancellation-policies");
}

export function ReservationSection({ settings }: ReservationSectionProps) {
  const [cancellationPolicies, setCancellationPolicies] = useState<
    CancellationPolicy[]
  >([]);
  const [isLoadingPolicies, setIsLoadingPolicies] = useState(true);

  const { form, isPending, onSubmit } = useFormAction(
    reservationFormSchema,
    (data) =>
      updateReservationSettings({
        defaultTimeSlot: data.defaultTimeSlot || null,
        minReservationDuration: data.minReservationDuration || null,
        maxReservationDuration: data.maxReservationDuration || null,
        cancellationTermsId: data.cancellationTermsId || null,
      }),
    {
      defaultValues: {
        defaultTimeSlot: settings.defaultTimeSlot || 60,
        minReservationDuration: settings.minReservationDuration || 60,
        maxReservationDuration: settings.maxReservationDuration || 480,
        cancellationTermsId: settings.cancellationTermsId || "",
      },
      refresh: true,
      successMessage: "予約設定を保存しました",
    },
  );

  // キャンセルポリシー一覧を取得
  useEffect(() => {
    async function fetchPolicies() {
      try {
        const policies = await fetchCancellationPolicies();
        setCancellationPolicies(policies);
      } catch (error) {
        logger.error("Failed to fetch cancellation policies", {
          error: getErrorMessage(error),
        });
      } finally {
        setIsLoadingPolicies(false);
      }
    }
    fetchPolicies();
  }, []);

  return (
    <Form {...form}>
      <form onSubmit={onSubmit}>
        <Card>
          <CardHeader>
            <CardTitle>予約設定</CardTitle>
            <CardDescription>予約に関する基本設定を行います</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-3">
              <FormField
                control={form.control}
                name="defaultTimeSlot"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>予約時間単位（分）</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        onChange={(e) =>
                          field.onChange(e.target.valueAsNumber || 60)
                        }
                        type="number"
                        min={15}
                        max={240}
                        step={15}
                        disabled={isPending}
                      />
                    </FormControl>
                    <p className="text-xs text-muted-foreground">15〜240分</p>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="minReservationDuration"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>最小予約時間（分）</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        onChange={(e) =>
                          field.onChange(e.target.valueAsNumber || 60)
                        }
                        type="number"
                        min={15}
                        max={480}
                        step={15}
                        disabled={isPending}
                      />
                    </FormControl>
                    <p className="text-xs text-muted-foreground">
                      予約可能な最短時間
                    </p>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="maxReservationDuration"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>最大予約時間（分）</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        onChange={(e) =>
                          field.onChange(e.target.valueAsNumber || 480)
                        }
                        type="number"
                        min={60}
                        max={1440}
                        step={30}
                        disabled={isPending}
                      />
                    </FormControl>
                    <p className="text-xs text-muted-foreground">
                      予約可能な最長時間（最大24時間）
                    </p>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="cancellationTermsId"
              render={({ field }) => (
                <FormItem className="space-y-3">
                  <FormLabel>キャンセルポリシー</FormLabel>

                  <Select
                    value={field.value}
                    onValueChange={(v) => field.onChange(v === "none" ? "" : v)}
                    disabled={isPending || isLoadingPolicies}
                  >
                    <FormControl>
                      <SelectTrigger className="w-full max-w-md">
                        <SelectValue
                          placeholder={
                            isLoadingPolicies
                              ? "読み込み中..."
                              : "キャンセルポリシーを選択"
                          }
                        />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="none">
                        <span className="text-muted-foreground">
                          設定しない
                        </span>
                      </SelectItem>
                      {cancellationPolicies.map((policy) => (
                        <SelectItem key={policy.id} value={policy.id}>
                          {policy.title}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  {cancellationPolicies.length === 0 && !isLoadingPolicies && (
                    <div className="flex items-center gap-2 rounded-md border border-warning/20 bg-warning/10 p-3 text-sm text-warning-foreground">
                      <AlertCircle className="h-4 w-4 flex-shrink-0" />
                      <span>
                        キャンセルポリシーが登録されていません。先に利用規約管理で作成してください。
                      </span>
                    </div>
                  )}

                  <p className="text-xs text-muted-foreground">
                    キャンセルポリシーは
                    <Link
                      href="/admin/terms"
                      className="mx-1 inline-flex items-center gap-1 text-primary hover:underline"
                    >
                      利用規約管理
                      <ExternalLink className="h-3 w-3" />
                    </Link>
                    で作成・編集できます。予約フォームや確認メールに表示されます。
                  </p>
                  <FormMessage />
                </FormItem>
              )}
            />

            <SubmitButton
              isPending={isPending}
              label="予約設定を保存"
              disabled={!form.formState.isDirty}
            />
          </CardContent>
        </Card>
      </form>
    </Form>
  );
}
