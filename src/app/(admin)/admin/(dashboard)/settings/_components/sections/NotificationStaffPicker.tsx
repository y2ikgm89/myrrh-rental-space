"use client";

/**
 * 通知を受け取るスタッフの複数選択。
 *
 * - 管理ロールのスタッフを名前＋メールで全件表示し、チェックで選択。
 * - 選択状況を「N名選択中」バッジで常時可視化、すべて選択/解除を提供。
 * - ネイティブ checkbox（name="notificationStaffIds"）で送信し、conform が
 *   `z.array(z.string())` に集約する（hidden input 不要・送信契約は不変）。
 */
import { Badge, Button, Checkbox } from "@/admin/components/ui";

type StaffOption = {
  id: string;
  name: string;
  email: string;
};

type NotificationStaffPickerProps = {
  staff: StaffOption[];
  /** 選択中のスタッフ id（制御） */
  value: string[];
  onChange: (next: string[]) => void;
  disabled?: boolean;
};

export function NotificationStaffPicker({
  staff,
  value,
  onChange,
  disabled = false,
}: NotificationStaffPickerProps) {
  if (staff.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        スタッフが登録されていません（スタッフ管理から追加できます）。
      </p>
    );
  }

  const toggle = (id: string, checked: boolean) => {
    onChange(checked ? [...value, id] : value.filter((v) => v !== id));
  };

  const allSelected = staff.every((s) => value.includes(s.id));

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Badge variant="secondary">{value.length}名選択中</Badge>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={disabled}
          onClick={() => onChange(allSelected ? [] : staff.map((s) => s.id))}
        >
          {allSelected ? "すべて解除" : "すべて選択"}
        </Button>
      </div>
      <div className="space-y-2 rounded-lg border p-3">
        {staff.map((s) => (
          <label
            key={s.id}
            className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm"
          >
            <Checkbox
              name="notificationStaffIds"
              value={s.id}
              checked={value.includes(s.id)}
              onCheckedChange={(checked) => toggle(s.id, checked)}
              disabled={disabled}
            />
            <span className="font-medium">{s.name}</span>
            <span className="text-muted-foreground">{s.email}</span>
          </label>
        ))}
      </div>
    </div>
  );
}
