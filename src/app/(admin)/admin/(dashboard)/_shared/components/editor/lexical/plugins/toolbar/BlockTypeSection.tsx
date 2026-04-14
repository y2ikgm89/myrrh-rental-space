"use client";

import { IconCheck, IconChevronDown } from "@tabler/icons-react";
import { Button } from "@/admin/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/admin/components/ui/dropdown-menu";
import { entriesOf } from "@/shared/lib/serialize";
import { BLOCK_TYPE_CONFIG, type BlockType } from "./types";

type Props = {
  blockType: BlockType;
  onChange: (type: BlockType) => void;
};

export function BlockTypeSection({ blockType, onChange }: Props) {
  const { label, icon: Icon } = BLOCK_TYPE_CONFIG[blockType];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-8 gap-1 min-w-[100px] justify-between"
        >
          <span className="flex items-center gap-1.5">
            <Icon className="h-4 w-4" />
            <span className="text-xs">{label}</span>
          </span>
          <IconChevronDown className="h-3 w-3" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-[160px]">
        {entriesOf(BLOCK_TYPE_CONFIG).map(
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
              {blockType === type && (
                <IconCheck className="h-4 w-4 text-primary" />
              )}
            </DropdownMenuItem>
          ),
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
