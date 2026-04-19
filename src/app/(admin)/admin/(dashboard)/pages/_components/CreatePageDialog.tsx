"use client";

/**
 * 新規ページ作成ダイアログ
 *
 * - タイトルからスラッグ自動生成
 * - リアルタイムスラッグ検証（debounce 500ms）
 */

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useWatch } from "react-hook-form";
import { z } from "zod";
import {
  IconPlus,
  IconLoader2,
  IconCircleCheck,
  IconCircleX,
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
import { Textarea } from "@/admin/components/ui/textarea";
import { createPage } from "@/admin/actions/page";
import { fetchAdminJson } from "@/admin/lib/admin-api-client";
import { useFormAction } from "@/admin/hooks/useFormAction";

const formSchema = z.object({
  slug: z
    .string()
    .min(1, { error: "スラッグは必須です" })
    .max(100, { error: "スラッグは100文字以内です" })
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
      error: "半角英数字とハイフンのみ使用可能",
    }),
  title: z
    .string()
    .min(1, { error: "タイトルは必須です" })
    .max(200, { error: "タイトルは200文字以内です" }),
  description: z
    .string()
    .max(500, { error: "説明は500文字以内です" })
    .optional(),
});

/**
 * タイトルからスラッグを自動生成
 * 英数字のみ抽出してkebab-caseに変換
 */
function generateSlugFromTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "") // 英数字・スペース・ハイフン以外を除去
    .trim()
    .replace(/\s+/g, "-") // スペース → ハイフン
    .replace(/-+/g, "-") // 連続ハイフン → 単一
    .replace(/^-|-$/g, ""); // 先頭・末尾のハイフン除去
}

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

  const { form, isPending, onSubmit } = useFormAction(
    formSchema,
    (data) =>
      createPage({
        slug: data.slug,
        title: data.title,
        description: data.description,
        isPublished: false,
      }),
    {
      defaultValues: {
        slug: "",
        title: "",
        description: "",
      },
      successMessage: "ページを作成しました",
      errorMessage: "ページの作成に失敗しました",
      disableToast: false,
      onSuccess: (result) => {
        setIsOpen(false);
        form.reset();
        router.push(`/admin/pages/${result.slug}/edit`);
      },
    },
  );

  const {
    register,
    control,
    setValue,
    formState: { errors },
  } = form;

  const title = useWatch({ control, name: "title" });
  const slug = useWatch({ control, name: "slug" });

  // タイトル変更時にスラッグ自動生成
  useEffect(() => {
    if (!isManualSlug && title) {
      const generated = generateSlugFromTitle(title);
      if (generated) {
        setValue("slug", generated, { shouldValidate: true });
      }
    }
  }, [title, isManualSlug, setValue]);

  // スラッグ変更時にリアルタイム検証（debounce 500ms）
  useEffect(() => {
    if (slugCheckRef.current) {
      clearTimeout(slugCheckRef.current);
    }

    if (!slug || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
      // 無効なスラッグの場合は即座にリセット（0ms タイマーで同期 setState を回避）
      slugCheckRef.current = setTimeout(() => {
        setSlugStatus("idle");
        setSlugMessage("");
      }, 0);
      return () => {
        if (slugCheckRef.current) clearTimeout(slugCheckRef.current);
      };
    }

    // checking 状態を即座に設定し、500ms debounce で実際の検証を実行
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
      form.reset();
      setIsManualSlug(false);
      setSlugStatus("idle");
      setSlugMessage("");
    }
  };

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
            タイトルと URL スラッグを設定し、エディターで本文を作成します。
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="title">
              タイトル <span className="text-destructive">*</span>
            </Label>
            <Input
              id="title"
              placeholder="ページタイトル"
              {...register("title")}
              disabled={isPending}
            />
            {errors.title && (
              <p className="text-sm text-destructive">{errors.title.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="slug">
              スラッグ <span className="text-destructive">*</span>
            </Label>
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">/</span>
              <div className="relative flex-1">
                <Input
                  id="slug"
                  placeholder="about-us"
                  {...register("slug", {
                    onChange: () => setIsManualSlug(true),
                  })}
                  disabled={isPending}
                  className="pr-8"
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
            {errors.slug && (
              <p className="text-sm text-destructive">{errors.slug.message}</p>
            )}
            {slugStatus === "unavailable" && slugMessage && (
              <p className="text-sm text-destructive">{slugMessage}</p>
            )}
            <p className="text-xs text-muted-foreground">
              URLに使用されます（例: example.com/about-us）
              {!isManualSlug && title && " — タイトルから自動生成"}
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">説明（オプション）</Label>
            <Textarea
              id="description"
              placeholder="ページの説明"
              {...register("description")}
              disabled={isPending}
              rows={2}
            />
            {errors.description && (
              <p className="text-sm text-destructive">
                {errors.description.message}
              </p>
            )}
          </div>

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
              label="作成してエディターを開く"
              pendingLabel="作成中..."
            />
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
