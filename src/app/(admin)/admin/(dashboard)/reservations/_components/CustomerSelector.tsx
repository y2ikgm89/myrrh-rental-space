"use client";

import { useState, useEffect, useRef } from "react";
import {
  IconSearch,
  IconUser,
  IconMail,
  IconPhone,
  IconPlus,
  IconX,
} from "@tabler/icons-react";
import { fetchAdminJson } from "@/admin/lib/admin-api-client";
import { Input, Button, Label, Card, CardContent } from "@/admin/components/ui";
import { CustomerIdentityBadge } from "@/admin/components/status-badges";
import type { CustomerSearchResult } from "@/shared/domain/customers/types";
import { logger } from "@/shared/lib/errors/logger-core";
import { getErrorMessage } from "@/shared/lib/errors";

interface CustomerSelectorProps {
  selectedCustomer: { id: string; name: string; email: string } | null;
  onSelectCustomer: (
    customer: { id: string; name: string; email: string } | null,
  ) => void;
  onNewCustomerData: (
    data: {
      lastName: string;
      firstName: string;
      email: string;
      phoneNumber?: string;
    } | null,
  ) => void;
  isNewCustomer: boolean;
  onToggleNewCustomer: (isNew: boolean) => void;
  errors?: Record<string, string[] | undefined> | undefined;
  allowNewCustomer?: boolean;
  /** 顧客未選択エラーを説明する要素の id */
  ariaDescribedBy?: string | undefined;
}

async function fetchCustomerSearchResults(
  query: string,
): Promise<CustomerSearchResult[]> {
  const params = new URLSearchParams({ q: query });
  return fetchAdminJson(`/admin/api/customers/search?${params.toString()}`);
}

export function CustomerSelector({
  selectedCustomer,
  onSelectCustomer,
  onNewCustomerData,
  isNewCustomer,
  onToggleNewCustomer,
  errors,
  allowNewCustomer = true,
  ariaDescribedBy,
}: CustomerSelectorProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<CustomerSearchResult[]>(
    [],
  );
  const [isSearching, setIsSearching] = useState(false);
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 新規顧客入力フォームの状態
  const [newCustomerForm, setNewCustomerForm] = useState({
    lastName: "",
    firstName: "",
    email: "",
    phoneNumber: "",
  });

  // アンマウント時にタイムアウトをクリーンアップ
  useEffect(() => {
    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, []);

  // 検索処理（デバウンス付き）
  // 短いクエリ時は state をリセットせず render 中に derive（visibleSearchResults）する。
  // 「You Might Not Need an Effect」準拠。
  useEffect(() => {
    // 既存のタイムアウトをクリア
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    // 検索クエリが2文字未満の場合は検索しない
    if (!searchQuery || searchQuery.trim().length < 2) {
      return;
    }

    // デバウンス処理（300ms）
    searchTimeoutRef.current = setTimeout(async () => {
      setIsSearching(true);
      try {
        const results = await fetchCustomerSearchResults(searchQuery);
        setSearchResults(results);
      } catch (error) {
        logger.error("顧客検索エラー", {
          error: getErrorMessage(error),
        });
        setSearchResults([]);
      } finally {
        setIsSearching(false);
      }
    }, 300);
  }, [searchQuery]);

  // 短いクエリ時は空配列として表示（render 中 derive）
  const hasQuery = searchQuery.trim().length >= 2;
  const visibleSearchResults = hasQuery ? searchResults : [];

  // 新規顧客フォームの変更を親に伝える
  useEffect(() => {
    if (isNewCustomer) {
      onNewCustomerData(newCustomerForm);
    }
  }, [newCustomerForm, isNewCustomer, onNewCustomerData]);

  // 顧客を選択
  const handleSelectCustomer = (customer: CustomerSearchResult) => {
    onSelectCustomer({
      id: customer.id,
      name: `${customer.lastName} ${customer.firstName}`,
      email: customer.email,
    });
    setSearchQuery("");
    setSearchResults([]);
  };

  // 選択を解除
  const handleClearSelection = () => {
    onSelectCustomer(null);
    setSearchQuery("");
    setSearchResults([]);
  };

  // 新規顧客入力モードに切り替え
  const handleToggleNewCustomer = () => {
    const newValue = !isNewCustomer;
    onToggleNewCustomer(newValue);
    if (newValue) {
      // 新規顧客モードに切り替えるときは既存顧客の選択をクリア
      onSelectCustomer(null);
      onNewCustomerData(newCustomerForm);
    } else {
      // 既存顧客モードに切り替えるときは新規顧客データをクリア
      onNewCustomerData(null);
    }
  };

  // 新規顧客フォームの入力処理
  const handleNewCustomerInputChange = (
    field: keyof typeof newCustomerForm,
    value: string,
  ) => {
    setNewCustomerForm((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  // 選択済み顧客の表示
  if (selectedCustomer && !isNewCustomer) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <Label>選択中の顧客</Label>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleClearSelection}
          >
            <IconX className="mr-1 h-4 w-4" />
            変更
          </Button>
        </div>
        <Card>
          <CardContent className="pt-6">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <IconUser className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium">{selectedCustomer.name}</span>
              </div>
              <div className="flex items-center gap-2">
                <IconMail className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">
                  {selectedCustomer.email}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* モード切り替えボタン（allowNewCustomer=true の場合のみ表示） */}
      <div className="flex items-center justify-between">
        <Label>顧客情報</Label>
        {allowNewCustomer && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleToggleNewCustomer}
          >
            {isNewCustomer ? (
              <>
                <IconSearch className="mr-1 h-4 w-4" />
                既存顧客を検索
              </>
            ) : (
              <>
                <IconPlus className="mr-1 h-4 w-4" />
                新規顧客として入力
              </>
            )}
          </Button>
        )}
      </div>

      {/* 既存顧客検索モード */}
      {(!allowNewCustomer || !isNewCustomer) && (
        <div className="space-y-3">
          <Input
            type="search"
            placeholder="名前、メール、電話番号で検索..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            leadingIcon="IconSearch"
            aria-describedby={ariaDescribedBy}
          />

          {/* 検索中インジケーター */}
          {isSearching && (
            <div className="text-sm text-muted-foreground">検索中...</div>
          )}

          {/* 検索結果リスト */}
          {visibleSearchResults.length > 0 && (
            <Card>
              <CardContent className="p-0">
                <div className="max-h-64 overflow-y-auto">
                  {visibleSearchResults.map((customer) => (
                    <button
                      key={customer.id}
                      type="button"
                      onClick={() => handleSelectCustomer(customer)}
                      className="w-full border-b p-4 text-left transition-colors last:border-b-0 hover:bg-accent"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">
                            {customer.lastName} {customer.firstName}
                          </span>
                          <CustomerIdentityBadge userId={customer.userId} />
                        </div>
                        <div className="flex flex-col gap-1 text-sm text-muted-foreground">
                          <div className="flex items-center gap-2">
                            <IconMail className="h-3 w-3" />
                            {customer.email}
                          </div>
                          {customer.phoneNumber && (
                            <div className="flex items-center gap-2">
                              <IconPhone className="h-3 w-3" />
                              {customer.phoneNumber}
                            </div>
                          )}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* 検索結果なし */}
          {hasQuery && !isSearching && visibleSearchResults.length === 0 && (
            <div className="text-sm text-muted-foreground">
              該当する顧客が見つかりませんでした
            </div>
          )}

          {/* ヒント */}
          {!searchQuery && (
            <div className="text-sm text-muted-foreground">
              2文字以上入力して顧客を検索してください
            </div>
          )}
        </div>
      )}

      {/* 新規顧客入力モード（allowNewCustomer=true の場合のみ） */}
      {allowNewCustomer && isNewCustomer && (
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            {/* 姓 */}
            <div className="space-y-2">
              <Label htmlFor="new-customer-lastName">
                姓 <span className="text-destructive">*</span>
              </Label>
              <Input
                id="new-customer-lastName"
                type="text"
                placeholder="山田"
                value={newCustomerForm.lastName}
                onChange={(e) =>
                  handleNewCustomerInputChange("lastName", e.target.value)
                }
              />
              {errors?.["lastName"] && (
                <p className="text-sm text-destructive">
                  {errors["lastName"]?.[0]}
                </p>
              )}
            </div>

            {/* 名 */}
            <div className="space-y-2">
              <Label htmlFor="new-customer-firstName">
                名 <span className="text-destructive">*</span>
              </Label>
              <Input
                id="new-customer-firstName"
                type="text"
                placeholder="太郎"
                value={newCustomerForm.firstName}
                onChange={(e) =>
                  handleNewCustomerInputChange("firstName", e.target.value)
                }
              />
              {errors?.["firstName"] && (
                <p className="text-sm text-destructive">
                  {errors["firstName"]?.[0]}
                </p>
              )}
            </div>
          </div>

          {/* メールアドレス */}
          <div className="space-y-2">
            <Label htmlFor="new-customer-email">
              メールアドレス <span className="text-destructive">*</span>
            </Label>
            <Input
              id="new-customer-email"
              type="email"
              placeholder="example@example.com"
              value={newCustomerForm.email}
              onChange={(e) =>
                handleNewCustomerInputChange("email", e.target.value)
              }
            />
            {errors?.["email"] && (
              <p className="text-sm text-destructive">{errors["email"]?.[0]}</p>
            )}
          </div>

          {/* 電話番号 */}
          <div className="space-y-2">
            <Label htmlFor="new-customer-phoneNumber">電話番号</Label>
            <Input
              id="new-customer-phoneNumber"
              type="tel"
              placeholder="090-1234-5678"
              value={newCustomerForm.phoneNumber}
              onChange={(e) =>
                handleNewCustomerInputChange("phoneNumber", e.target.value)
              }
            />
            {errors?.["phoneNumber"] && (
              <p className="text-sm text-destructive">
                {errors["phoneNumber"]?.[0]}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
