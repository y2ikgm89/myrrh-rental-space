import Link from "next/link";
import { IconArrowRight } from "@tabler/icons-react";
import { Badge } from "@/admin/components/ui";
import { toAppRoute } from "@/shared/lib/typed-routes";
import { formatDateTimeShort } from "@/shared/lib/date-format";

/**
 * 領収書訂正 chain の可視化 (Server Component)。
 *
 * revision の up-chain (元→現在の親方向) と down-chain (現在→子方向) を横並び / 折返しの
 * breadcrumb 状に表示する。現在 (current) は強調表示。past revision は「旧」、future
 * revision (== 既に再発行済で orphan 化された当該 receipt が親) は「新」バッジ付き。
 *
 * chain 要素 click で該当領収書詳細ページに遷移する。
 */
type ChainEntry = {
  id: string;
  serialNo: string;
  revision: number;
  issuedAt: Date | string;
};

type ReceiptRevisionChainProps = {
  readonly current: {
    id: string;
    serialNo: string;
    revision: number;
    issuedAt: Date | string;
    isOrphaned: boolean;
  };
  readonly upChain: readonly ChainEntry[];
  readonly downChain: readonly ChainEntry[];
};

function ChainNode({
  entry,
  variant,
}: {
  readonly entry: ChainEntry;
  readonly variant: "past" | "current" | "future";
}) {
  const label =
    variant === "past" ? "旧" : variant === "future" ? "新" : "現在";
  const badgeVariant =
    variant === "current"
      ? "success"
      : variant === "future"
        ? "warning"
        : "outline";
  const body = (
    <div className="flex flex-col gap-1 rounded-md border bg-card px-3 py-2 text-sm shadow-sm hover:bg-accent hover:text-accent-foreground">
      <div className="flex items-center gap-2">
        <Badge variant={badgeVariant}>{label}</Badge>
        <span className="font-mono">{entry.serialNo}</span>
      </div>
      <div className="text-xs text-muted-foreground">
        rev.{entry.revision} · {formatDateTimeShort(entry.issuedAt)}
      </div>
    </div>
  );

  if (variant === "current") {
    return <div aria-current="true">{body}</div>;
  }
  return (
    <Link
      href={toAppRoute(`/admin/receipts/${entry.serialNo}`)}
      aria-label={`領収書 ${entry.serialNo} (rev.${entry.revision}) を開く`}
    >
      {body}
    </Link>
  );
}

export function ReceiptRevisionChain({
  current,
  upChain,
  downChain,
}: ReceiptRevisionChainProps) {
  if (upChain.length === 0 && downChain.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        訂正 (再発行) 履歴はありません。
      </p>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {upChain.map((entry) => (
        <div key={entry.id} className="flex items-center gap-2">
          <ChainNode entry={entry} variant="past" />
          <IconArrowRight
            className="h-4 w-4 shrink-0 text-muted-foreground"
            aria-hidden
          />
        </div>
      ))}
      <ChainNode
        entry={{
          id: current.id,
          serialNo: current.serialNo,
          revision: current.revision,
          issuedAt: current.issuedAt,
        }}
        variant={current.isOrphaned ? "past" : "current"}
      />
      {downChain.map((entry) => (
        <div key={entry.id} className="flex items-center gap-2">
          <IconArrowRight
            className="h-4 w-4 shrink-0 text-muted-foreground"
            aria-hidden
          />
          <ChainNode entry={entry} variant="future" />
        </div>
      ))}
    </div>
  );
}
