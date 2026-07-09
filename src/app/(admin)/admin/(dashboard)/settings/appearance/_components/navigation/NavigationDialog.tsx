"use client";

import { useActionState, useEffect, useState } from "react";
import { toast } from "sonner";
import { getFormProps, getInputProps, useForm } from "@conform-to/react";
import { parseWithZod } from "@conform-to/zod/v4";
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
  SubmitButton,
} from "@/admin/components/ui";
import { PortableTextInlineEditor } from "@/admin/components/portable-text/inline-editor/PortableTextInlineEditor";
import { PortableTextSpans } from "@/shared/components/portable-text/PortableTextSpans";
import {
  createNavigationItemAction,
  updateNavigationItemAction,
  createSocialLinkAction,
  updateSocialLinkAction,
} from "@/admin/actions/navigation";
import type { NavigationType } from "@/shared/lib/validations/enums/prisma-types";
import { isValidSocialPlatform } from "@/shared/lib/validations/enums/guards";
import type { PortableTextSpan } from "@/shared/lib/portable-text";
import type { Serialized } from "@/shared/lib/serialize";
import { navFormSchema, socialFormSchema } from "./nav-form-schema";
import type {
  NavigationItemData,
  SocialLinkData,
  SocialFormDefaults,
} from "./types";
import { platformLabels, platformIcons } from "./types";

// =============================================================================
// NavigationFormDialog
// =============================================================================

type NavigationFormDialogProps = {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly editingItem: NavigationItemData | null;
  readonly defaultType: NavigationType;
  readonly parentOptions: NavigationItemData[];
  readonly onSuccess: () => Promise<void>;
};

export function NavigationFormDialog({
  open,
  onOpenChange,
  editingItem,
  defaultType,
  parentOptions,
  onSuccess,
}: NavigationFormDialogProps) {
  const isEdit = editingItem !== null;
  const boundAction = isEdit
    ? updateNavigationItemAction.bind(null, editingItem.id)
    : createNavigationItemAction;

  const [lastResult, action, isPending] = useActionState(
    boundAction,
    undefined,
  );

  // PortableText spans を local state + hidden input で transit (Pattern B)
  const [labelSpans, setLabelSpans] = useState<PortableTextSpan[]>(
    editingItem?.label ?? [],
  );

  const initialType = editingItem?.type ?? defaultType;
  const initialParentId = editingItem?.parentId ?? "none";
  const initialIsExternal = editingItem?.isExternal ?? false;
  const initialIsActive = editingItem?.isActive ?? true;

  const [parentId, setParentId] = useState<string>(initialParentId);
  const [isExternal, setIsExternal] = useState<boolean>(initialIsExternal);
  const [isActive, setIsActive] = useState<boolean>(initialIsActive);

  const [form, fields] = useForm({
    id: isEdit ? `nav-edit-${editingItem.id}` : "nav-create",
    lastResult,
    onValidate({ formData }) {
      return parseWithZod(formData, { schema: navFormSchema });
    },
    shouldValidate: "onBlur",
    shouldRevalidate: "onInput",
    defaultValue: {
      url: editingItem?.url ?? "",
    },
  });

  useEffect(() => {
    if (lastResult && lastResult.initialValue === null) {
      toast.success(
        isEdit
          ? "ナビゲーションを更新しました"
          : "ナビゲーションを作成しました",
      );
      onOpenChange(false);
      void onSuccess();
    }
  }, [lastResult, isEdit, onOpenChange, onSuccess]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form {...getFormProps(form)} action={action}>
          <DialogHeader>
            <DialogTitle>
              {isEdit ? "メニュー編集" : "メニュー追加"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {/* Label (PortableText) */}
            <div className="space-y-2">
              <Label htmlFor="nav-label">ラベル</Label>
              <PortableTextInlineEditor
                id="nav-label"
                value={labelSpans}
                onChange={setLabelSpans}
                disabled={isPending}
                aria-label="メニューラベル"
                aria-describedby={
                  fields.label.errors ? fields.label.errorId : undefined
                }
              />
              <input
                type="hidden"
                name={fields.label.name}
                value={JSON.stringify(labelSpans)}
              />
              <p className="text-xs text-muted-foreground">
                テキストにアイコンを混在できます。アイコンは「アイコン挿入」ボタンから追加してください。
              </p>
              {fields.label.errors && (
                <p
                  id={fields.label.errorId}
                  className="text-sm text-destructive"
                >
                  {fields.label.errors.join(", ")}
                </p>
              )}
            </div>

            {/* URL */}
            <div className="space-y-2">
              <Label htmlFor={fields.url.id}>URL</Label>
              <Input
                {...getInputProps(fields.url, { type: "text" })}
                placeholder="/about"
                disabled={isPending}
              />
              {fields.url.errors && (
                <p id={fields.url.errorId} className="text-sm text-destructive">
                  {fields.url.errors.join(", ")}
                </p>
              )}
            </div>

            {/* Parent */}
            <div className="space-y-2">
              <Label htmlFor="nav-parentId">
                親メニュー（サブメニューの場合）
              </Label>
              <Select
                value={parentId || "none"}
                onValueChange={(value) => setParentId(value)}
                disabled={isPending}
              >
                <SelectTrigger>
                  <SelectValue placeholder="なし（トップレベル）" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">なし（トップレベル）</SelectItem>
                  {parentOptions.map((parent) => (
                    <SelectItem key={parent.id} value={parent.id}>
                      <PortableTextSpans spans={parent.label} />
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <input
                type="hidden"
                name={fields.parentId.name}
                value={parentId}
              />
              <p className="text-xs text-muted-foreground">
                サブメニューにする場合は親メニューを選択してください
              </p>
            </div>

            {/* isExternal */}
            <div className="flex items-center justify-between">
              <Label htmlFor="nav-isExternal">外部リンク</Label>
              <Switch
                id="nav-isExternal"
                checked={isExternal}
                onCheckedChange={setIsExternal}
                disabled={isPending}
              />
              <input
                type="hidden"
                name={fields.isExternal.name}
                value={isExternal ? "on" : ""}
              />
            </div>

            {/* isActive */}
            <div className="flex items-center justify-between">
              <Label htmlFor="nav-isActive">有効</Label>
              <Switch
                id="nav-isActive"
                checked={isActive}
                onCheckedChange={setIsActive}
                disabled={isPending}
              />
              <input
                type="hidden"
                name={fields.isActive.name}
                value={isActive ? "on" : ""}
              />
            </div>

            {/* Hidden: type */}
            <input type="hidden" name={fields.type.name} value={initialType} />
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
            <SubmitButton
              isPending={isPending}
              label={isEdit ? "更新" : "作成"}
              pendingLabel={isEdit ? "更新中..." : "作成中..."}
            />
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// =============================================================================
// SocialLinkFormDialog
// =============================================================================

type SocialLinkFormDialogProps = {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly editingLink: Serialized<SocialLinkData> | null;
  readonly onSuccess: () => Promise<void>;
};

export function SocialLinkFormDialog({
  open,
  onOpenChange,
  editingLink,
  onSuccess,
}: SocialLinkFormDialogProps) {
  const isEdit = editingLink !== null;
  const boundAction = isEdit
    ? updateSocialLinkAction.bind(null, editingLink.id)
    : createSocialLinkAction;

  const [lastResult, action, isPending] = useActionState(
    boundAction,
    undefined,
  );

  const initialPlatform: SocialFormDefaults["platform"] =
    editingLink?.platform ?? "TWITTER";
  const [platform, setPlatform] =
    useState<SocialFormDefaults["platform"]>(initialPlatform);
  const [isActive, setIsActive] = useState<boolean>(
    editingLink?.isActive ?? true,
  );
  const [showOnDesktop, setShowOnDesktop] = useState<boolean>(
    editingLink?.showOnDesktop ?? true,
  );
  const [showOnMobile, setShowOnMobile] = useState<boolean>(
    editingLink?.showOnMobile ?? true,
  );

  const [form, fields] = useForm({
    id: isEdit ? `social-edit-${editingLink.id}` : "social-create",
    lastResult,
    onValidate({ formData }) {
      return parseWithZod(formData, { schema: socialFormSchema });
    },
    shouldValidate: "onBlur",
    shouldRevalidate: "onInput",
    defaultValue: {
      url: editingLink?.url ?? "",
    },
  });

  useEffect(() => {
    if (lastResult && lastResult.initialValue === null) {
      toast.success(
        isEdit ? "SNSリンクを更新しました" : "SNSリンクを作成しました",
      );
      onOpenChange(false);
      void onSuccess();
    }
  }, [lastResult, isEdit, onOpenChange, onSuccess]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form {...getFormProps(form)} action={action}>
          <DialogHeader>
            <DialogTitle>
              {isEdit ? "SNSリンク編集" : "SNSリンク追加"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {/* Platform */}
            <div className="space-y-2">
              <Label htmlFor="social-platform">プラットフォーム</Label>
              <Select
                value={platform}
                onValueChange={(value) => {
                  if (isValidSocialPlatform(value)) {
                    setPlatform(value);
                  }
                }}
                disabled={isPending}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(platformLabels).map(([value, label]) => {
                    if (!isValidSocialPlatform(value)) return null;
                    const PIcon = platformIcons[value];
                    return (
                      <SelectItem key={value} value={value}>
                        <span className="flex items-center gap-2">
                          {PIcon ? (
                            <PIcon className="h-4 w-4 text-muted-foreground" />
                          ) : null}
                          {label}
                        </span>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
              <input
                type="hidden"
                name={fields.platform.name}
                value={platform}
              />
            </div>

            {/* URL */}
            <div className="space-y-2">
              <Label htmlFor={fields.url.id}>URL</Label>
              <Input
                {...getInputProps(fields.url, { type: "url" })}
                placeholder="https://twitter.com/..."
                disabled={isPending}
              />
              {fields.url.errors && (
                <p id={fields.url.errorId} className="text-sm text-destructive">
                  {fields.url.errors.join(", ")}
                </p>
              )}
            </div>

            {/* isActive */}
            <div className="flex items-center justify-between">
              <Label htmlFor="social-isActive">有効</Label>
              <Switch
                id="social-isActive"
                checked={isActive}
                onCheckedChange={setIsActive}
                disabled={isPending}
              />
              <input
                type="hidden"
                name={fields.isActive.name}
                value={isActive ? "on" : ""}
              />
            </div>

            {/* Display Settings */}
            <div className="rounded-lg border p-4 space-y-4">
              <p className="text-sm font-medium">表示設定</p>
              <div className="flex items-center justify-between">
                <Label htmlFor="social-showOnDesktop">デスクトップで表示</Label>
                <Switch
                  id="social-showOnDesktop"
                  checked={showOnDesktop}
                  onCheckedChange={setShowOnDesktop}
                  disabled={isPending}
                />
                <input
                  type="hidden"
                  name={fields.showOnDesktop.name}
                  value={showOnDesktop ? "on" : ""}
                />
              </div>
              <div className="flex items-center justify-between">
                <Label htmlFor="social-showOnMobile">モバイルで表示</Label>
                <Switch
                  id="social-showOnMobile"
                  checked={showOnMobile}
                  onCheckedChange={setShowOnMobile}
                  disabled={isPending}
                />
                <input
                  type="hidden"
                  name={fields.showOnMobile.name}
                  value={showOnMobile ? "on" : ""}
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
            <SubmitButton
              isPending={isPending}
              label={isEdit ? "更新" : "作成"}
              pendingLabel={isEdit ? "更新中..." : "作成中..."}
            />
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
