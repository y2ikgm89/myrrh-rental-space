"use client";

import { IconCheck, IconChevronDown } from "@tabler/icons-react";
import type { ElementFormatType } from "lexical";
import { Button } from "@/admin/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/admin/components/ui/dropdown-menu";
import { entriesOf } from "@/shared/lib/serialize";
import { ALIGNMENT_CONFIG, type AlignmentType } from "./types";

type Props = {
  elementFormat: AlignmentType;
  onChange: (format: ElementFormatType) => void;
};

export function AlignmentSection({ elementFormat, onChange }: Props) {
  const { label, icon: Icon } = ALIGNMENT_CONFIG[elementFormat];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-8 gap-1 min-w-[90px] justify-between"
        >
          <span className="flex items-center gap-1.5">
            <Icon className="h-4 w-4" />
            <span className="text-xs">{label}</span>
          </span>
          <IconChevronDown className="h-3 w-3" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-[140px]">
        {entriesOf(ALIGNMENT_CONFIG).map(
          ([type, { label: itemLabel, icon: ItemIcon }]) => (
            <DropdownMenuItem
              key={type}
              onClick={() => onChange(type)}
              className="flex items-center justify-between gap-2"
            >
              <span className="flex items-center gap-2">
                <ItemIcon className="h-4 w-4" />
                <span>{itemLabel}</span>
              </span>
              {elementFormat === type && (
                <IconCheck className="h-4 w-4 text-primary" />
              )}
            </DropdownMenuItem>
          ),
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
