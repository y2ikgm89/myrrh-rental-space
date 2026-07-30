"use client";

import { useState, useTransition, useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  IconEyeOff,
  IconLink,
  IconLinkOff,
  IconMail,
  IconPhone,
  IconUser,
} from "@tabler/icons-react";
import { formatDate } from "@/shared/lib/date-format";
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
import {
  CustomerIdentityBadge,
  InquiryStatusBadge,
} from "@/admin/components/status-badges";
import {
  updateInquiryStatus,
  replyToInquiry,
  updateInquiryCustomer,
} from "@/admin/actions/inquiry";
import { fetchAdminJson } from "@/admin/lib/admin-api-client";
import { customerSearchResultsResponseSchema } from "@/admin/lib/admin-api-response-schemas";
import { isMutationError } from "@/shared/lib/mutation-result";
import { getErrorMessage } from "@/shared/lib/errors";
import { logger } from "@/shared/lib/errors/logger-core";
import type {
  AssignableStaffOption,
  InquiryTagOption,
  InquiryWithCustomer,
} from "@/shared/domain/inquiries/types";
import type { Serialized } from "@/shared/lib/serialize";
import type { InquiryStatus } from "@/shared/lib/validations/enums/prisma-types";
import type { CustomerSearchResult } from "@/shared/domain/customers/types";
import { isValidInquiryStatus } from "@/shared/lib/validations/enums/guards";
import { DetailSection } from "@/admin/components/DetailSection";
import { DetailField } from "@/admin/components/DetailField";
import { InquiryThread } from "./InquiryThread";
import { InquiryAttachments } from "./InquiryAttachments";
import { InquiryAssigneeCard } from "./InquiryAssigneeCard";
import { InquirySlaCard } from "./InquirySlaCard";
import { InquiryTagsCard } from "./InquiryTagsCard";
import { InquiryInternalNotesCard } from "./InquiryInternalNotesCard";
import { InquiryStatusHistoryCard } from "./InquiryStatusHistoryCard";

type InquiryDetailProps = {
  inquiry: Serialized<InquiryWithCustomer>;
  staff: Serialized<AssignableStaffOption>[];
  allTags: Serialized<InquiryTagOption>[];
  currentUserId: string;
  canDeleteOthersNotes: boolean;
};

async function fetchCustomerSearchResults(
  query: string,
): Promise<CustomerSearchResult[]> {
  const params = new URLSearchParams({ q: query });
  return fetchAdminJson(
    `/admin/api/customers/search?${params.toString()}`,
    customerSearchResultsResponseSchema,
  );
}

export function InquiryDetail({
  inquiry,
  staff,
  allTags,
  currentUserId,
  canDeleteOthersNotes,
}: InquiryDetailProps) {
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
  // 短いクエリで state をリセットするのではなく、render 中に derive（visibleSearchResults）して
  // 「You Might Not Need an Effect」に準拠。
  // https://react.dev/learn/you-might-not-need-an-effect#caching-expensive-calculations
  useEffect(() => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    if (!searchQuery || searchQuery.trim().length < 2) {
      return;
    }

    searchTimeoutRef.current = setTimeout(() => {
      void (async () => {
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
      })();
    }, 300);
  }, [searchQuery]);

  // 短いクエリ時は空配列として表示（state のリセットではなく render 中 derive）
  const hasQuery = searchQuery.trim().length >= 2;
  const visibleSearchResults = hasQuery ? searchResults : [];

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

  const isAnonymized = inquiry.anonymizedAt !== null;

  return (
    <div className="space-y-6">
      {isAnonymized ? (
        <div className="flex items-center gap-2 rounded-md border border-dashed border-muted-foreground/40 bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
          <IconEyeOff className="h-4 w-4 shrink-0" />
          <span>
            このお問い合わせは匿名化済みです（
            {formatDate(inquiry.anonymizedAt, true)}
            ）。個人情報は削除されています。
          </span>
        </div>
      ) : null}

      <div className="grid gap-6 md:grid-cols-3">
        {/* メイン情報 */}
        <div className="md:col-span-2 space-y-6">
          {/* 送信者情報 */}
          <DetailSection title="送信者情報">
            <div className="space-y-4">
              <DetailField label="お名前" value={inquiry.name} />
              {inquiry.companyName ? (
                <DetailField
                  label="会社名・団体名"
                  value={inquiry.companyName}
                />
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

          {/* 件名 + 受付日時 + 受付番号 */}
          <DetailSection title="お問い合わせ詳細">
            <div className="space-y-4">
              <DetailField label="件名" value={inquiry.subject} />
              <DetailField label="受付番号" value={inquiry.receiptNumber} />
              <DetailField
                label="受付日時"
                value={formatDate(inquiry.createdAt, true)}
              />
            </div>
          </DetailSection>

          <InquiryThread message={inquiry.message} replies={inquiry.replies} />

          <InquiryAttachments
            inquiryId={inquiry.id}
            attachments={inquiry.attachments}
            isAnonymized={isAnonymized}
          />

          {!isAnonymized && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base font-semibold">
                  {inquiry.replies.length > 0 ? "追加返信を送信" : "回答を送信"}
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
                  {/* Inquiry Overhaul Phase 1: FLAGGED / SPAM 追加 */}
                  <SelectItem value="FLAGGED">要注意</SelectItem>
                  <SelectItem value="SPAM">スパム</SelectItem>
                </SelectContent>
              </Select>
            </CardContent>
          </Card>

          <InquiryAssigneeCard
            inquiryId={inquiry.id}
            assigneeId={inquiry.assigneeId}
            staff={staff}
          />

          <InquirySlaCard
            inquiryId={inquiry.id}
            slaExpiresAt={inquiry.slaExpiresAt}
          />

          <InquiryTagsCard
            inquiryId={inquiry.id}
            tags={inquiry.tags}
            allTags={allTags}
          />

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
                      <CustomerIdentityBadge userId={inquiry.customer.userId} />
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
                  <Input
                    type="search"
                    placeholder="名前、メール、電話番号で検索..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    leadingIcon="IconSearch"
                  />

                  {isSearching && (
                    <div className="text-sm text-muted-foreground">
                      検索中...
                    </div>
                  )}

                  {visibleSearchResults.length > 0 && (
                    <div className="max-h-48 overflow-y-auto rounded-md border">
                      {visibleSearchResults.map((customer) => (
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
                              <CustomerIdentityBadge userId={customer.userId} />
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

                  {hasQuery &&
                    !isSearching &&
                    visibleSearchResults.length === 0 && (
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

          <InquiryInternalNotesCard
            inquiryId={inquiry.id}
            notes={inquiry.internalNotes}
            currentUserId={currentUserId}
            canDeleteOthersNotes={canDeleteOthersNotes}
          />

          <InquiryStatusHistoryCard history={inquiry.statusHistory} />
        </div>
      </div>
    </div>
  );
}
