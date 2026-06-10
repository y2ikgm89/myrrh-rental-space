"use client";

/**
 * 新規ページ作成ダイアログ
 *
 * - タイトルからスラッグ自動生成
 * - リアルタイムスラッグ検証（debounce 500ms）
 *
 * clean break 移行。Dialog open state は本 component 内で `useState` 管理
 * (Variant A、PR #64 SpaceCategory pattern と同型)、controlled 親 prop も
 * オプショナル対応。success 検知 → close + navigate は render 中 sync
 * (`previousLastResult` 比較)、副作用 (`toast` / `router.push`) は useEffect。
 */

import {
  useActionState,
  useEffect,
  useEffectEvent,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import {
  getFormProps,
  getInputProps,
  useForm,
  useInputControl,
} from "@conform-to/react";
import { parseWithZod } from "@conform-to/zod/v4";
import { toast } from "sonner";
import {
  IconCircleCheck,
  IconCircleX,
  IconLoader2,
  IconPlus,
} from "@tabler/icons-react";
import { Button, SubmitButton } from "@/admin/components/ui";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/admin/components/ui/dialog";
import { Input } from "@/admin/components/ui/input";
import { Label } from "@/admin/components/ui/label";
import { createPage } from "@/admin/actions/page";
import { fetchAdminJson } from "@/admin/lib/admin-api-client";
import { generateSlug } from "@/shared/lib/slug";
import { createPageSchema } from "@/shared/lib/validations/page";
import { SLUG_REGEX } from "@/shared/lib/validations/params";

type SlugStatus = "idle" | "checking" | "available" | "unavailable";

type SlugAvailabilityResult = {
  available: boolean;
  message?: string;
};

async function fetchSlugAvailability(
  slug: string,
): Promise<SlugAvailabilityResult> {
  const params = new URLSearchParams({ slug });
  return fetchAdminJson(
    `/admin/api/pages/slug-availability?${params.toString()}`,
  );
}

type CreatePageDialogProps = {
  /**
   * 親が open 状態を管理する controlled モード。
   * 省略時は内部で state を持ち、`<DialogTrigger>` の「新規ページ」ボタンを自動表示する
   * （従来の stand-alone 利用互換）。
   */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /**
   * トリガー（「新規ページ」ボタン）を表示するか。
   * controlled モード時は通常 false を渡し、外部から open 制御する。
   */
  showTrigger?: boolean;
};

export function CreatePageDialog({
  open: controlledOpen,
  onOpenChange: controlledOnOpenChange,
  showTrigger,
}: CreatePageDialogProps = {}) {
  const router = useRouter();
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const isControlled = controlledOpen !== undefined;
  const isOpen = isControlled ? controlledOpen : uncontrolledOpen;
  const setIsOpen = (open: boolean) => {
    if (!isControlled) setUncontrolledOpen(open);
    controlledOnOpenChange?.(open);
  };
  const shouldShowTrigger = showTrigger ?? !isControlled;

  const [isManualSlug, setIsManualSlug] = useState(false);
  const [slugStatus, setSlugStatus] = useState<SlugStatus>("idle");
  const [slugMessage, setSlugMessage] = useState("");
  const slugCheckRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // 送信時の slug を capture して、success 後の router.push に使う
  // (form.reset 後 fields.slug.value が "" にクリアされるため)
  const submittedSlugRef = useRef<string>("");

  const [lastResult, formAction, isPending] = useActionState(
    createPage,
    undefined,
  );

  const [form, fields] = useForm({
    id: "create-page-form",
    lastResult,
    onValidate({ formData }) {
      return parseWithZod(formData, { schema: createPageSchema });
    },
    shouldValidate: "onBlur",
    shouldRevalidate: "onInput",
    defaultValue: {
      slug: "",
      title: "",
    },
  });

  const titleControl = useInputControl(fields.title);
  const slugControl = useInputControl(fields.slug);

  const title = titleControl.value ?? "";
  const slug = slugControl.value ?? "";

  // 送信前に slug を ref に capture（resetForm で消える前に保存）
  const wrappedFormAction = (formData: FormData) => {
    const slugValue = formData.get("slug");
    if (typeof slugValue === "string") {
      submittedSlugRef.current = slugValue;
    }
    return formAction(formData);
  };

  const isSuccess = lastResult?.initialValue === null;

  // render 中 sync: success 検知 → Dialog close
  const [previousLastResult, setPreviousLastResult] = useState(lastResult);
  if (lastResult !== previousLastResult) {
    setPreviousLastResult(lastResult);
    if (isSuccess) {
      setIsOpen(false);
    }
  }

  // 副作用: success → toast + navigate
  useEffect(() => {
    if (isSuccess && submittedSlugRef.current) {
      toast.success("ページを作成しました");
      router.push(`/admin/pages/${submittedSlugRef.current}`);
    }
  }, [isSuccess, router]);

  // タイトル変更時にスラッグ自動生成 (useEffectEvent で slugControl 参照を deps 除外)
  const syncSlugFromTitle = useEffectEvent(() => {
    if (!isManualSlug && title) {
      const generated = generateSlug(title, "page", 100);
      if (generated && generated !== slug) {
        slugControl.change(generated);
      }
    }
  });

  useEffect(() => {
    syncSlugFromTitle();
  }, [title, isManualSlug]);

  // スラッグ変更時にリアルタイム検証（debounce 500ms）
  useEffect(() => {
    if (slugCheckRef.current) {
      clearTimeout(slugCheckRef.current);
    }

    if (!slug || !SLUG_REGEX.test(slug)) {
      slugCheckRef.current = setTimeout(() => {
        setSlugStatus("idle");
        setSlugMessage("");
      }, 0);
      return () => {
        if (slugCheckRef.current) clearTimeout(slugCheckRef.current);
      };
    }

    slugCheckRef.current = setTimeout(() => {
      setSlugStatus("checking");
      void fetchSlugAvailability(slug).then((result) => {
        if (result.available) {
          setSlugStatus("available");
          setSlugMessage("");
        } else {
          setSlugStatus("unavailable");
          setSlugMessage(result.message ?? "このスラッグは使用できません");
        }
      });
    }, 500);

    return () => {
      if (slugCheckRef.current) {
        clearTimeout(slugCheckRef.current);
      }
    };
  }, [slug]);

  const handleOpenChange = (open: boolean) => {
    setIsOpen(open);
    if (!open) {
      setIsManualSlug(false);
      setSlugStatus("idle");
      setSlugMessage("");
    }
  };

  const formErrors = form.errors;

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      {shouldShowTrigger && (
        <DialogTrigger asChild>
          <Button className="gap-2">
            <IconPlus className="h-4 w-4" />
            新規ページ
          </Button>
        </DialogTrigger>
      )}
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>新規ページ作成</DialogTitle>
          <DialogDescription>
            タイトルと URL
            スラッグを設定し、固定テンプレートの本文を作成します。
          </DialogDescription>
        </DialogHeader>

        <form
          {...getFormProps(form)}
          action={wrappedFormAction}
          className="space-y-4"
        >
          <div className="space-y-2">
            <Label htmlFor={fields.title.id}>
              タイトル <span className="text-destructive">*</span>
            </Label>
            <Input
              {...getInputProps(fields.title, { type: "text" })}
              placeholder="ページタイトル"
              disabled={isPending}
            />
            {fields.title.errors && (
              <p id={fields.title.errorId} className="text-sm text-destructive">
                {fields.title.errors.join(", ")}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor={fields.slug.id}>
              スラッグ <span className="text-destructive">*</span>
            </Label>
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">/</span>
              <div className="relative flex-1">
                <Input
                  {...getInputProps(fields.slug, { type: "text" })}
                  placeholder="about-us"
                  disabled={isPending}
                  className="pr-8"
                  onChange={(e) => {
                    setIsManualSlug(true);
                    slugControl.change(e.target.value);
                  }}
                />
                {/* スラッグ検証ステータス */}
                <div className="absolute right-2 top-1/2 -translate-y-1/2">
                  {slugStatus === "checking" && (
                    <IconLoader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  )}
                  {slugStatus === "available" && (
                    <IconCircleCheck className="h-4 w-4 text-success" />
                  )}
                  {slugStatus === "unavailable" && (
                    <IconCircleX className="h-4 w-4 text-destructive" />
                  )}
                </div>
              </div>
            </div>
            {fields.slug.errors && (
              <p id={fields.slug.errorId} className="text-sm text-destructive">
                {fields.slug.errors.join(", ")}
              </p>
            )}
            {slugStatus === "unavailable" && slugMessage && (
              <p className="text-sm text-destructive">{slugMessage}</p>
            )}
            <p className="text-xs text-muted-foreground">
              URLに使用されます（例: example.com/about-us）
              {!isManualSlug && title && " — タイトルから自動生成"}
            </p>
          </div>

          {formErrors && formErrors.length > 0 && (
            <div
              id={form.errorId}
              role="alert"
              className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              {formErrors.join(", ")}
            </div>
          )}

          <div className="flex justify-end gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOpenChange(false)}
              disabled={isPending}
            >
              キャンセル
            </Button>
            <SubmitButton
              isPending={isPending}
              disabled={slugStatus === "unavailable"}
              label="作成して編集を開く"
              pendingLabel="作成中..."
            />
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
