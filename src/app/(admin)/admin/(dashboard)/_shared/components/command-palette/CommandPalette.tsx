"use client";

import { useRouter } from "next/navigation";
import type { Route } from "next";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/admin/components/ui/command";
import { useCommandPalette } from "./CommandPaletteProvider";

export function CommandPalette() {
  const {
    open,
    setOpen,
    navItems,
    quickActions,
    recents,
    query,
    setQuery,
    results,
    isSearching,
  } = useCommandPalette();
  const router = useRouter();

  const navigateTo = (href: string) => {
    setOpen(false);
    router.push(href as Route<string>);
  };

  return (
    <CommandDialog
      open={open}
      onOpenChange={setOpen}
      title="コマンドパレット"
      description="管理画面全域の検索・ナビゲーションを行います"
    >
      <CommandInput
        placeholder="コマンドや検索キーワードを入力..."
        value={query}
        onValueChange={setQuery}
      />
      <CommandList>
        <CommandEmpty>
          {isSearching
            ? "検索中..."
            : query.length >= 2
              ? "該当する項目がありません"
              : "コマンドを選択するか、2 文字以上で検索"}
        </CommandEmpty>

        {query.length >= 2 &&
          results.map((group) => (
            <CommandGroup key={group.resource} heading={group.resource}>
              {group.items.map((item) => (
                <CommandItem
                  key={item.id}
                  value={`${item.label} ${item.description ?? ""}`}
                  onSelect={() => navigateTo(item.href)}
                >
                  <span>{item.label}</span>
                  {item.description !== undefined && (
                    <span className="ml-2 text-xs text-muted-foreground">
                      {item.description}
                    </span>
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
          ))}

        {query.length < 2 && (
          <>
            {recents.length > 0 && (
              <>
                <CommandGroup heading="最近の操作">
                  {recents.map((item) => (
                    <CommandItem
                      key={item.id}
                      value={`${item.label} ${item.resource}`}
                      onSelect={() => navigateTo(item.href)}
                    >
                      {item.label}
                    </CommandItem>
                  ))}
                </CommandGroup>
                <CommandSeparator />
              </>
            )}

            {quickActions.length > 0 && (
              <>
                <CommandGroup heading="クイックアクション">
                  {quickActions.map((action) => (
                    <CommandItem
                      key={action.id}
                      value={`${action.label} ${action.description ?? ""}`}
                      onSelect={() => navigateTo(action.href)}
                    >
                      {action.label}
                    </CommandItem>
                  ))}
                </CommandGroup>
                <CommandSeparator />
              </>
            )}

            <CommandGroup heading="ナビゲーション">
              {navItems.map((nav) => (
                <CommandItem
                  key={nav.id}
                  value={`${nav.label} ${(nav.keywords ?? []).join(" ")}`}
                  onSelect={() => navigateTo(nav.href)}
                >
                  {nav.label}
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}
      </CommandList>
    </CommandDialog>
  );
}
