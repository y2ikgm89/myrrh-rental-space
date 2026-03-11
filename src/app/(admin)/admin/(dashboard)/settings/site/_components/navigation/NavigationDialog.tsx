"use client";

import type { UseFormReturn } from "react-hook-form";
import {
  Button,
  Input,
  Label,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
} from "@/admin/components/ui";
import { isValidSocialPlatform } from "@/shared/lib/validations/enums";
import type { Serialized } from "@/shared/lib/serialize";
import type {
  NavFormData,
  SocialFormData,
  NavigationItemData,
  SocialLinkData,
} from "./types";
import { platformLabels } from "./types";

// =============================================================================
// Navigation Dialog Component
// =============================================================================

type NavigationDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  form: UseFormReturn<NavFormData>;
  editingItem: NavigationItemData | null;
  isPending: boolean;
  navIsExternal: boolean;
  navIsActive: boolean;
  navParentId: string | null;
  parentOptions: NavigationItemData[];
  onSubmit: (data: NavFormData) => void;
};

export function NavigationDialog({
  open,
  onOpenChange,
  form,
  editingItem,
  isPending,
  navIsExternal,
  navIsActive,
  navParentId,
  parentOptions,
  onSubmit,
}: NavigationDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={form.handleSubmit(onSubmit)}>
          <DialogHeader>
            <DialogTitle>
              {editingItem ? "メニュー編集" : "メニュー追加"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="nav-label">ラベル</Label>
              <Input
                id="nav-label"
                {...form.register("label")}
                placeholder="メニューラベル"
                disabled={isPending}
              />
              {form.formState.errors.label && (
                <p className="text-sm text-destructive">
                  {form.formState.errors.label.message}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="nav-url">URL</Label>
              <Input
                id="nav-url"
                {...form.register("url")}
                placeholder="/about"
                disabled={isPending}
              />
              {form.formState.errors.url && (
                <p className="text-sm text-destructive">
                  {form.formState.errors.url.message}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="nav-parentId">
                親メニュー（サブメニューの場合）
              </Label>
              <Select
                value={navParentId || "none"}
                onValueChange={(value) =>
                  form.setValue("parentId", value === "none" ? null : value)
                }
                disabled={isPending}
              >
                <SelectTrigger>
                  <SelectValue placeholder="なし（トップレベル）" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">なし（トップレベル）</SelectItem>
                  {parentOptions.map((parent) => (
                    <SelectItem key={parent.id} value={parent.id}>
                      {parent.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                サブメニューにする場合は親メニューを選択してください
              </p>
            </div>

            <div className="flex items-center justify-between">
              <Label htmlFor="nav-isExternal">外部リンク</Label>
              <Switch
                id="nav-isExternal"
                checked={navIsExternal}
                onCheckedChange={(checked) =>
                  form.setValue("isExternal", checked)
                }
                disabled={isPending}
              />
            </div>

            <div className="flex items-center justify-between">
              <Label htmlFor="nav-isActive">有効</Label>
              <Switch
                id="nav-isActive"
                checked={navIsActive}
                onCheckedChange={(checked) =>
                  form.setValue("isActive", checked)
                }
                disabled={isPending}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isPending}
            >
              キャンセル
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending && editingItem
                ? "更新中..."
                : isPending
                  ? "作成中..."
                  : editingItem
                    ? "更新"
                    : "作成"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// =============================================================================
// Social Link Dialog Component
// =============================================================================

type SocialLinkDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  form: UseFormReturn<SocialFormData>;
  editingLink: Serialized<SocialLinkData> | null;
  isPending: boolean;
  socialPlatform: SocialFormData["platform"];
  socialIsActive: boolean;
  socialShowOnDesktop: boolean;
  socialShowOnMobile: boolean;
  onSubmit: (data: SocialFormData) => void;
};

export function SocialLinkDialog({
  open,
  onOpenChange,
  form,
  editingLink,
  isPending,
  socialPlatform,
  socialIsActive,
  socialShowOnDesktop,
  socialShowOnMobile,
  onSubmit,
}: SocialLinkDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={form.handleSubmit(onSubmit)}>
          <DialogHeader>
            <DialogTitle>
              {editingLink ? "SNSリンク編集" : "SNSリンク追加"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="social-platform">プラットフォーム</Label>
              <Select
                value={socialPlatform}
                onValueChange={(value) => {
                  if (isValidSocialPlatform(value)) {
                    form.setValue("platform", value);
                  }
                }}
                disabled={isPending}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(platformLabels).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="social-url">URL</Label>
              <Input
                id="social-url"
                {...form.register("url")}
                placeholder="https://twitter.com/..."
                disabled={isPending}
              />
              {form.formState.errors.url && (
                <p className="text-sm text-destructive">
                  {form.formState.errors.url.message}
                </p>
              )}
            </div>

            <div className="flex items-center justify-between">
              <Label htmlFor="social-isActive">有効</Label>
              <Switch
                id="social-isActive"
                checked={socialIsActive}
                onCheckedChange={(checked) =>
                  form.setValue("isActive", checked)
                }
                disabled={isPending}
              />
            </div>

            <div className="rounded-lg border p-4 space-y-4">
              <p className="text-sm font-medium">表示設定</p>
              <div className="flex items-center justify-between">
                <Label htmlFor="social-showOnDesktop">デスクトップで表示</Label>
                <Switch
                  id="social-showOnDesktop"
                  checked={socialShowOnDesktop}
                  onCheckedChange={(checked) =>
                    form.setValue("showOnDesktop", checked)
                  }
                  disabled={isPending}
                />
              </div>
              <div className="flex items-center justify-between">
                <Label htmlFor="social-showOnMobile">モバイルで表示</Label>
                <Switch
                  id="social-showOnMobile"
                  checked={socialShowOnMobile}
                  onCheckedChange={(checked) =>
                    form.setValue("showOnMobile", checked)
                  }
                  disabled={isPending}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isPending}
            >
              キャンセル
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending && editingLink
                ? "更新中..."
                : isPending
                  ? "作成中..."
                  : editingLink
                    ? "更新"
                    : "作成"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
