"use client";

/**
 * 新規ページ作成ダイアログ
 *
 * - タイトルからスラッグ自動生成
 * - リアルタイムスラッグ検証（debounce 500ms）
 */

import { useState, useTransition, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Plus, Loader2, CheckCircle, XCircle } from "lucide-react";
import { Button } from "@/admin/components/ui";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/admin/components/ui/dialog";
import { Input } from "@/admin/components/ui/input";
import { Label } from "@/admin/components/ui/label";
import { Textarea } from "@/admin/components/ui/textarea";
import { createPage } from "@/admin/actions/page";
import { fetchAdminJson } from "@/admin/lib/admin-api-client";
import { logger } from "@/shared/lib/logger";
import { getErrorMessage } from "@/shared/lib/errors";
import { isMutationError } from "@/shared/lib/mutation-result";

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

type FormData = z.infer<typeof formSchema>;

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

export function CreatePageDialog() {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [isManualSlug, setIsManualSlug] = useState(false);
  const [slugStatus, setSlugStatus] = useState<SlugStatus>("idle");
  const [slugMessage, setSlugMessage] = useState("");
  const slugCheckRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    control,
    setValue,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      slug: "",
      title: "",
      description: "",
    },
  });

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
      startTransition(() => {
        setSlugStatus("idle");
        setSlugMessage("");
      });
      return;
    }

    startTransition(() => {
      setSlugStatus("checking");
    });
    slugCheckRef.current = setTimeout(async () => {
      const result = await fetchSlugAvailability(slug);
      if (result.available) {
        setSlugStatus("available");
        setSlugMessage("");
      } else {
        setSlugStatus("unavailable");
        setSlugMessage(result.message ?? "このスラッグは使用できません");
      }
    }, 500);

    return () => {
      if (slugCheckRef.current) {
        clearTimeout(slugCheckRef.current);
      }
    };
  }, [slug]);

  const onSubmit = (data: FormData) => {
    startTransition(async () => {
      try {
        const result = await createPage({
          slug: data.slug,
          title: data.title,
          description: data.description,
          isPublished: false,
        });

        if (isMutationError(result)) {
          toast.error(result.error || "ページの作成に失敗しました");
          return;
        }

        toast.success("ページを作成しました");
        setIsOpen(false);
        reset();
        router.push(`/admin/pages/${result.slug}/edit`);
      } catch (error) {
        logger.error("ページ作成エラー", {
          error: getErrorMessage(error),
        });
        toast.error("ページの作成中にエラーが発生しました");
      }
    });
  };

  const handleOpenChange = (open: boolean) => {
    setIsOpen(open);
    if (!open) {
      reset();
      setIsManualSlug(false);
      setSlugStatus("idle");
      setSlugMessage("");
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button className="gap-2">
          <Plus className="h-4 w-4" />
          新規ページ
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>新規ページ作成</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
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
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  )}
                  {slugStatus === "available" && (
                    <CheckCircle className="h-4 w-4 text-success" />
                  )}
                  {slugStatus === "unavailable" && (
                    <XCircle className="h-4 w-4 text-destructive" />
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
            <Button
              type="submit"
              disabled={isPending || slugStatus === "unavailable"}
            >
              {isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  作成中...
                </>
              ) : (
                "作成してエディターを開く"
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
