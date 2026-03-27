export type BadgeVariant = "default" | "success" | "warning" | "info";

export const INQUIRY_STATUS_CONFIG: Record<
  string,
  { label: string; variant: BadgeVariant }
> = {
  NEW: { label: "新規", variant: "info" },
  IN_PROGRESS: { label: "対応中", variant: "warning" },
  RESOLVED: { label: "解決済み", variant: "success" },
  CLOSED: { label: "クローズ", variant: "default" },
};
