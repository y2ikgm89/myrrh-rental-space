"use client";

import { useState, useTransition, useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  IconLink,
  IconLinkOff,
  IconMail,
  IconPhone,
  IconSearch,
  IconUser,
} from "@tabler/icons-react";
import { formatDate } from "@/shared/lib/utils";
import { toast } from "sonner";
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
} from "@/admin/components/ui";
import { SubmitButton } from "@/admin/components/ui";
import { InquiryStatusBadge } from "@/admin/components/status-badges";
import {
  updateInquiryStatus,
  replyToInquiry,
  updateInquiryCustomer,
} from "@/admin/actions/inquiry";
import { fetchAdminJson } from "@/admin/lib/admin-api-client";
import { isMutationError } from "@/shared/lib/mutation-result";
import { getErrorMessage } from "@/shared/lib/errors";
import { logger } from "@/shared/lib/logger";
import type { InquiryWithCustomer } from "@/shared/domain/inquiries/types";
import type { Serialized } from "@/shared/lib/serialize";
import type { InquiryStatus } from "@generated/prisma/enums";
import type { CustomerSearchResult } from "@/shared/domain/customers/types";
import { isValidInquiryStatus } from "@/shared/lib/validations/enums/guards";
import { DetailSection } from "@/admin/components/DetailSection";
import { DetailField } from "@/admin/components/DetailField";

type InquiryDetailProps = {
  inquiry: Serialized<InquiryWithCustomer>;
};

async function fetchCustomerSearchResults(
  query: string,
): Promise<CustomerSearchResult[]> {
  const params = new URLSearchParams({ q: query });
  return fetchAdminJson(`/admin/api/customers/search?${params.toString()}`);
}

export function InquiryDetail({ inquiry }: InquiryDetailProps) {
  const [isPending, startTransition] = useTransition();
  const [replyText, setReplyText] = useState("");
  const [isReplying, startReplyTransition] = useTransition();
  const [isLinking, startLinkTransition] = useTransition();
  const [showCustomerSearch, setShowCustomerSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<CustomerSearchResult[]>(
    [],
  );
  const [isSearching, setIsSearching] = useState(false);
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const router = useRouter();

  // アンマウント時にタイムアウトをクリーンアップ
  useEffect(() => {
    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, []);

  // 顧客検索（デバウンス付き）
  useEffect(() => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    if (!searchQuery || searchQuery.trim().length < 2) {
      // eslint-disable-next-line @eslint-react/set-state-in-effect
      setSearchResults([]);
      return;
    }

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

  const handleStatusChange = (status: InquiryStatus) => {
    startTransition(async () => {
      const result = await updateInquiryStatus(inquiry.id, status);
      if (isMutationError(result)) {
        toast.error(result.error);
      }
    });
  };

  const handleLinkCustomer = (customerId: string) => {
    startLinkTransition(async () => {
      const result = await updateInquiryCustomer(inquiry.id, customerId);
      if (isMutationError(result)) {
        toast.error(result.error);
      } else {
        toast.success("顧客を紐づけました");
        setShowCustomerSearch(false);
        setSearchQuery("");
        setSearchResults([]);
        router.refresh();
      }
    });
  };

  const handleUnlinkCustomer = () => {
    startLinkTransition(async () => {
      const result = await updateInquiryCustomer(inquiry.id, null);
      if (isMutationError(result)) {
        toast.error(result.error);
      } else {
        toast.success("顧客の紐づけを解除しました");
        router.refresh();
      }
    });
  };

  return (
    <div className="grid gap-6 md:grid-cols-3">
      {/* メイン情報 */}
      <div className="md:col-span-2 space-y-6">
        {/* 受付日時 */}
        <p className="text-sm text-muted-foreground">
          受付日時: {formatDate(inquiry.createdAt, true)}
        </p>

        {/* 件名 */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base font-semibold">件名</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-lg font-medium">{inquiry.subject}</p>
          </CardContent>
        </Card>

        {/* 本文 */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base font-semibold">
              お問い合わせ内容
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="whitespace-pre-wrap">{inquiry.message}</p>
          </CardContent>
        </Card>

        {/* 返信済み表示 */}
        {inquiry.replyMessage ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-base font-semibold">
                回答内容
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <p className="whitespace-pre-wrap">{inquiry.replyMessage}</p>
              <p className="text-xs text-muted-foreground">
                {inquiry.repliedBy?.name ?? "スタッフ"} -{" "}
                {inquiry.repliedAt ? formatDate(inquiry.repliedAt, true) : ""}
              </p>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle className="text-base font-semibold">
                回答を送信
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Textarea
                placeholder="回答内容を入力してください..."
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                rows={6}
                disabled={isReplying}
              />
              <div className="flex justify-end">
                <SubmitButton
                  isPending={isReplying}
                  label="回答を送信"
                  pendingLabel="送信中..."
                  disabled={!replyText.trim()}
                  onClick={() => {
                    startReplyTransition(async () => {
                      const result = await replyToInquiry(
                        inquiry.id,
                        replyText,
                      );
                      if (isMutationError(result)) {
                        toast.error(result.error);
                      } else {
                        toast.success("回答を送信しました");
                        setReplyText("");
                        router.refresh();
                      }
                    });
                  }}
                />
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* サイドバー */}
      <div className="space-y-6">
        {/* ステータス */}
        <Card>
          <CardHeader>
            <CardTitle>ステータス</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">現在:</span>
              <InquiryStatusBadge status={inquiry.status} />
            </div>
            <Select
              value={inquiry.status}
              onValueChange={(value) => {
                if (isValidInquiryStatus(value)) handleStatusChange(value);
              }}
              disabled={isPending}
            >
              <SelectTrigger>
                <SelectValue placeholder="ステータスを変更" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="NEW">新規</SelectItem>
                <SelectItem value="IN_PROGRESS">対応中</SelectItem>
                <SelectItem value="RESOLVED">解決済み</SelectItem>
                <SelectItem value="CLOSED">クローズ</SelectItem>
              </SelectContent>
            </Select>
          </CardContent>
        </Card>

        {/* 送信者情報 */}
        <DetailSection title="送信者情報">
          <div className="space-y-4">
            <DetailField label="お名前" value={inquiry.name} />
            {inquiry.companyName ? (
              <DetailField label="会社名・団体名" value={inquiry.companyName} />
            ) : null}
            <DetailField
              label="メールアドレス"
              value={
                <a
                  href={`mailto:${inquiry.email}`}
                  className="text-primary hover:underline"
                >
                  {inquiry.email}
                </a>
              }
            />
          </div>
        </DetailSection>

        {/* 顧客紐づけ */}
        <Card>
          <CardHeader>
            <CardTitle>顧客紐づけ</CardTitle>
          </CardHeader>
          <CardContent>
            {inquiry.customer ? (
              <div className="space-y-3">
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <IconUser className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <Link
                      href={`/admin/customers/${inquiry.customer.id}`}
                      className="font-medium text-primary hover:underline"
                    >
                      {inquiry.customer.lastName} {inquiry.customer.firstName}
                    </Link>
                  </div>
                  <div className="flex items-center gap-2">
                    <IconMail className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">
                      {inquiry.customer.email}
                    </span>
                  </div>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="w-full"
                  disabled={isLinking}
                  onClick={handleUnlinkCustomer}
                >
                  <IconLinkOff className="mr-1 h-4 w-4" />
                  解除
                </Button>
              </div>
            ) : showCustomerSearch ? (
              <div className="space-y-3">
                <div className="relative">
                  <IconSearch className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    type="search"
                    placeholder="名前、メール、電話番号で検索..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-9"
                  />
                </div>

                {isSearching && (
                  <div className="text-sm text-muted-foreground">検索中...</div>
                )}

                {searchResults.length > 0 && (
                  <div className="max-h-48 overflow-y-auto rounded-md border">
                    {searchResults.map((customer) => (
                      <button
                        key={customer.id}
                        type="button"
                        disabled={isLinking}
                        onClick={() => handleLinkCustomer(customer.id)}
                        className="w-full border-b p-3 text-left transition-colors last:border-b-0 hover:bg-accent"
                      >
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <IconUser className="h-3.5 w-3.5 text-muted-foreground" />
                            <span className="text-sm font-medium">
                              {customer.lastName} {customer.firstName}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 pl-5.5">
                            <IconMail className="h-3 w-3 text-muted-foreground" />
                            <span className="text-xs text-muted-foreground">
                              {customer.email}
                            </span>
                          </div>
                          {customer.phoneNumber && (
                            <div className="flex items-center gap-2 pl-5.5">
                              <IconPhone className="h-3 w-3 text-muted-foreground" />
                              <span className="text-xs text-muted-foreground">
                                {customer.phoneNumber}
                              </span>
                            </div>
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                )}

                {searchQuery.length >= 2 &&
                  !isSearching &&
                  searchResults.length === 0 && (
                    <div className="text-sm text-muted-foreground">
                      該当する顧客が見つかりませんでした
                    </div>
                  )}

                {!searchQuery && (
                  <div className="text-sm text-muted-foreground">
                    2文字以上入力して顧客を検索してください
                  </div>
                )}

                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="w-full"
                  onClick={() => {
                    setShowCustomerSearch(false);
                    setSearchQuery("");
                    setSearchResults([]);
                  }}
                >
                  キャンセル
                </Button>
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">
                  紐づけされていません
                </p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="w-full"
                  onClick={() => setShowCustomerSearch(true)}
                >
                  <IconLink className="mr-1 h-4 w-4" />
                  顧客を検索して紐づけ
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* 外部メールアクション */}
        <Card>
          <CardHeader>
            <CardTitle>外部メール</CardTitle>
          </CardHeader>
          <CardContent>
            <Button asChild variant="outline" className="w-full">
              <Link
                href={`mailto:${inquiry.email}?subject=Re: ${encodeURIComponent(inquiry.subject)}`}
              >
                メールクライアントで返信
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
