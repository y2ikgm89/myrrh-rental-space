"use client";

import { useRouter } from "next/navigation";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/admin/components/ui/command";
import { TooltipProvider } from "@/admin/components/ui";
import { toAppRoute } from "@/shared/lib/routes/to-app-route";
import {
  isAdminNavFeaturePubliclyDisabled,
  isAdminQuickActionFeatureDisabled,
} from "@/shared/lib/features/admin-nav";
import { AdminNavFeatureDisabledIndicator } from "../../../_components/AdminNavFeatureDisabledIndicator";
import { cn } from "@/shared/lib/cn";
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
    enabledFeatures,
  } = useCommandPalette();
  const router = useRouter();

  const navigateTo = (href: string) => {
    setOpen(false);
    router.push(toAppRoute(href));
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
          <TooltipProvider delayDuration={200}>
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
                    {quickActions.map((action) => {
                      const isFeatureDisabled =
                        isAdminQuickActionFeatureDisabled(
                          action.featureModule,
                          enabledFeatures,
                        );
                      return (
                        <CommandItem
                          key={action.id}
                          value={`${action.label} ${action.description ?? ""}`}
                          disabled={isFeatureDisabled}
                          onSelect={() => {
                            if (isFeatureDisabled) return;
                            navigateTo(action.href);
                          }}
                        >
                          <span
                            className={cn(
                              isFeatureDisabled && "text-muted-foreground",
                            )}
                          >
                            {action.label}
                          </span>
                          {action.description !== undefined && (
                            <span className="ml-2 text-xs text-muted-foreground">
                              {action.description}
                            </span>
                          )}
                        </CommandItem>
                      );
                    })}
                  </CommandGroup>
                  <CommandSeparator />
                </>
              )}

              <CommandGroup heading="ナビゲーション">
                {navItems.map((nav) => {
                  const isFeatureDisabled = isAdminNavFeaturePubliclyDisabled(
                    nav.featureModule,
                    enabledFeatures,
                  );
                  return (
                    <CommandItem
                      key={nav.id}
                      value={`${nav.label} ${(nav.keywords ?? []).join(" ")}`}
                      onSelect={() => navigateTo(nav.href)}
                      className={cn(
                        isFeatureDisabled && "text-muted-foreground",
                      )}
                    >
                      <span className="min-w-0 flex-1">{nav.label}</span>
                      {isFeatureDisabled && nav.featureModule !== undefined && (
                        <AdminNavFeatureDisabledIndicator
                          featureModule={nav.featureModule}
                          compact
                        />
                      )}
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </>
          </TooltipProvider>
        )}
      </CommandList>
    </CommandDialog>
  );
}
