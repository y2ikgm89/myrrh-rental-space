"use client";

/**
 * 予約設定セクション
 *
 * 予約時間単位、最小/最大予約時間、キャンセル/変更期限の設定
 */

import type { Serialized } from "@/shared/lib/serialize";
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
import { reservationFormSchema } from "@/admin/actions/settings/schemas/form-schemas-booking-tax-terms";
import type { SettingsData } from "@/shared/domain/settings/types";

interface ReservationSectionProps {
  settings: Serialized<SettingsData>;
}

const DEADLINE_OPTIONS = [
  { value: "1", label: "1時間前" },
  { value: "3", label: "3時間前" },
  { value: "6", label: "6時間前" },
  { value: "12", label: "12時間前" },
  { value: "24", label: "24時間前" },
  { value: "48", label: "48時間前" },
  { value: "72", label: "72時間前" },
];

export function ReservationSection({ settings }: ReservationSectionProps) {
  const { form, isPending, onSubmit } = useFormAction(
    reservationFormSchema,
    (data) =>
      updateReservationSettings({
        defaultTimeSlot: data.defaultTimeSlot,
        minReservationDuration: data.minReservationDuration,
        maxReservationDuration: data.maxReservationDuration,
        cancellationDeadlineHours: data.cancellationDeadlineHours,
        modificationDeadlineHours: data.modificationDeadlineHours,
      }),
    {
      defaultValues: {
        defaultTimeSlot: settings.defaultTimeSlot,
        minReservationDuration: settings.minReservationDuration,
        maxReservationDuration: settings.maxReservationDuration,
        cancellationDeadlineHours: settings.cancellationDeadlineHours,
        modificationDeadlineHours: settings.modificationDeadlineHours,
      },
      refresh: true,
      successMessage: "予約設定を保存しました",
    },
  );

  return (
    <Form {...form}>
      <form onSubmit={onSubmit}>
        <Card>
          <CardHeader>
            <CardTitle>予約設定</CardTitle>
            <CardDescription>
              予約に関する基本設定を行います。規約の必須設定は利用規約管理で行えます
            </CardDescription>
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

            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="cancellationDeadlineHours"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      キャンセル期限（予約開始の何時間前まで）
                    </FormLabel>
                    <Select
                      value={String(field.value)}
                      onValueChange={(v) => field.onChange(Number(v))}
                      disabled={isPending}
                    >
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {DEADLINE_OPTIONS.map((opt) => (
                          <SelectItem key={opt.value} value={opt.value}>
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="modificationDeadlineHours"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>変更期限（予約開始の何時間前まで）</FormLabel>
                    <Select
                      value={String(field.value)}
                      onValueChange={(v) => field.onChange(Number(v))}
                      disabled={isPending}
                    >
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {DEADLINE_OPTIONS.map((opt) => (
                          <SelectItem key={opt.value} value={opt.value}>
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="flex justify-end pt-2">
              <SubmitButton
                isPending={isPending}
                label="予約設定を保存"
                disabled={!form.formState.isDirty}
              />
            </div>
          </CardContent>
        </Card>
      </form>
    </Form>
  );
}
