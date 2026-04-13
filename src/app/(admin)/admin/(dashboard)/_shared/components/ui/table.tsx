import { cn } from "@/shared/lib/cn";

type TableProps = React.HTMLAttributes<HTMLTableElement> & {
  ref?: React.Ref<HTMLTableElement>;
};

function Table({ className, ref, ...props }: TableProps) {
  return (
    <div className="relative w-full overflow-auto">
      <table
        ref={ref}
        className={cn("w-full caption-bottom text-sm", className)}
        {...props}
      />
    </div>
  );
}

type TableSectionProps = React.HTMLAttributes<HTMLTableSectionElement> & {
  ref?: React.Ref<HTMLTableSectionElement>;
};

function TableHeader({ className, ref, ...props }: TableSectionProps) {
  return (
    <thead
      ref={ref}
      className={cn(
        // Swiss Design: クリーンなヘッダー、微細な背景
        "bg-muted/40 [&_tr]:border-b [&_tr]:border-border/80",
        className,
      )}
      {...props}
    />
  );
}

function TableBody({ className, ref, ...props }: TableSectionProps) {
  return (
    <tbody
      ref={ref}
      className={cn("[&_tr:last-child]:border-0", className)}
      {...props}
    />
  );
}

function TableFooter({ className, ref, ...props }: TableSectionProps) {
  return (
    <tfoot
      ref={ref}
      className={cn(
        "border-t bg-muted/50 font-medium [&>tr]:last:border-b-0",
        className,
      )}
      {...props}
    />
  );
}

type TableRowProps = React.HTMLAttributes<HTMLTableRowElement> & {
  ref?: React.Ref<HTMLTableRowElement>;
};

function TableRow({ className, ref, ...props }: TableRowProps) {
  return (
    <tr
      ref={ref}
      className={cn(
        "border-b border-border/60 transition-colors duration-200",
        // Swiss Design: 控えめだが明確なホバー状態
        "hover:bg-accent/50 data-[state=selected]:bg-accent",
        className,
      )}
      {...props}
    />
  );
}

type TableHeadProps = React.ThHTMLAttributes<HTMLTableCellElement> & {
  ref?: React.Ref<HTMLTableCellElement>;
};

function TableHead({ className, ref, ...props }: TableHeadProps) {
  return (
    <th
      ref={ref}
      scope="col"
      className={cn(
        "h-10 whitespace-nowrap px-2 text-left align-middle md:h-11 md:px-4",
        // Swiss Typography: 小さめ、大文字、トラッキング広め
        "text-xs font-semibold uppercase tracking-wider text-muted-foreground",
        "[&:has([role=checkbox])]:pr-0",
        className,
      )}
      {...props}
    />
  );
}

type TableCellProps = React.TdHTMLAttributes<HTMLTableCellElement> & {
  ref?: React.Ref<HTMLTableCellElement>;
};

function TableCell({ className, ref, ...props }: TableCellProps) {
  return (
    <td
      ref={ref}
      className={cn(
        "p-2 align-middle md:p-4 [&:has([role=checkbox])]:pr-0",
        className,
      )}
      {...props}
    />
  );
}

type TableCaptionProps = React.HTMLAttributes<HTMLTableCaptionElement> & {
  ref?: React.Ref<HTMLTableCaptionElement>;
};

function TableCaption({ className, ref, ...props }: TableCaptionProps) {
  return (
    <caption
      ref={ref}
      className={cn("mt-4 text-sm text-muted-foreground", className)}
      {...props}
    />
  );
}

export {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableHead,
  TableRow,
  TableCell,
  TableCaption,
};
