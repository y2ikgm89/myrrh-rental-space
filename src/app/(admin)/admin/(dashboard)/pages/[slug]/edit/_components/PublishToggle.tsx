"use client";

/**
 * ページ公開/非公開トグルボタン
 */

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { Button } from "@/admin/components/ui";
import { Badge } from "@/admin/components/ui/badge";
import { togglePagePublished } from "@/admin/actions/page";
import { isMutationError } from "@/shared/lib/mutation-result";

interface PublishToggleProps {
  slug: string;
  isPublished: boolean;
}

export function PublishToggle({ slug, isPublished }: PublishToggleProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const handleToggle = () => {
    startTransition(async () => {
      const result = await togglePagePublished(slug);
      if (isMutationError(result)) {
        toast.error(result.error);
        return;
      }

      toast.success(
        result.isPublished
          ? "ページを公開しました"
          : "ページを非公開にしました",
      );
      router.refresh();
    });
  };

  return (
    <div className="flex items-center gap-2">
      <Badge variant={isPublished ? "success" : "secondary"}>
        {isPublished ? "公開中" : "非公開"}
      </Badge>
      <Button
        variant="outline"
        size="sm"
        onClick={handleToggle}
        disabled={isPending}
      >
        {isPending ? (
          <Loader2 className="h-4 w-4 animate-spin mr-1" />
        ) : isPublished ? (
          <EyeOff className="h-4 w-4 mr-1" />
        ) : (
          <Eye className="h-4 w-4 mr-1" />
        )}
        {isPublished ? "非公開にする" : "公開する"}
      </Button>
    </div>
  );
}
