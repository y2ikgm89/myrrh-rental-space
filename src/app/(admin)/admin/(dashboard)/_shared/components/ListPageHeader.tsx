import Link from "next/link";
import { Plus } from "lucide-react";
import { Button } from "@/admin/components/ui/button";

type ListPageHeaderProps = {
  title: string;
  description: string;
  createHref?: string;
  createLabel?: string;
  actions?: React.ReactNode;
};

export function ListPageHeader({
  title,
  description,
  createHref,
  createLabel = "新規作成",
  actions,
}: ListPageHeaderProps) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          {title}
        </h1>
        <p className="text-sm text-muted-foreground sm:text-base">
          {description}
        </p>
      </div>
      {actions ??
        (createHref && (
          <Button asChild className="min-h-10 sm:min-h-9">
            <Link href={createHref}>
              <Plus className="mr-2 h-4 w-4" />
              {createLabel}
            </Link>
          </Button>
        ))}
    </div>
  );
}
