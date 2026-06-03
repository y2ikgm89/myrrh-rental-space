"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
  Label,
} from "@/admin/components/ui";
import { generateSlug } from "@/shared/lib/slug";
import {
  TERMS_TYPE_LABELS,
  TERMS_TYPE_VALUES,
} from "@/shared/lib/validations/terms";
import type { TermsSettingsFormData } from "@/admin/lib/validations/terms";
import { TitleSlugFields } from "../side-panel";
import {
  type TermsSidePanelExtra,
  type SidePanelDefinition,
  spreadOptionalDisabled,
} from "./types";

export const termsSettingsPanel: SidePanelDefinition<
  TermsSettingsFormData,
  TermsSidePanelExtra
> = {
  title: "利用規約設定",
  description:
    "タイトル・スラッグ・タイプ・公開フラグ。本文中のブロック設定はエディタ右のパネルです。",
  tabStorageKey: "myrrh-inline-editor-sidepanel:terms",
  tabs: [
    {
      id: "basic",
      label: "基本",
      sections: [
        {
          title: "基本情報",
          render: (ctx) => {
            const titleValue =
              typeof ctx.fields.title.value === "string"
                ? ctx.fields.title.value
                : "";
            const slugValue =
              typeof ctx.fields.slug.value === "string"
                ? ctx.fields.slug.value
                : "";
            return (
              <div className="space-y-4">
                <TitleSlugFields
                  titleField={ctx.fields.title}
                  slugField={ctx.fields.slug}
                  slugPreviewPath="/terms"
                  slugPreviewValue={slugValue}
                  titlePlaceholder="利用規約のタイトル"
                  slugPlaceholder="terms-of-use"
                  onAutoGenerateSlug={() => {
                    if (titleValue) {
                      ctx.form.update({
                        name: ctx.fields.slug.name,
                        value: generateSlug(titleValue),
                      });
                    }
                  }}
                  {...spreadOptionalDisabled(ctx)}
                />
                <div className="space-y-2">
                  <Label htmlFor="terms-settings-type">タイプ</Label>
                  <Select
                    value={ctx.typeValue}
                    onValueChange={ctx.onTypeChange}
                    {...(ctx.disabled !== undefined
                      ? { disabled: ctx.disabled }
                      : {})}
                  >
                    <SelectTrigger id="terms-settings-type">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TERMS_TYPE_VALUES.map((value) => (
                        <SelectItem key={value} value={value}>
                          {TERMS_TYPE_LABELS[value] ?? value}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            );
          },
        },
      ],
    },
    {
      id: "publish",
      label: "公開設定",
      sections: [
        {
          title: "公開",
          render: (ctx) => (
            <div className="flex items-center justify-between gap-4">
              <div>
                <Label>公開する</Label>
                <p className="text-xs text-muted-foreground">
                  公開時のみ /terms 配下に表示
                </p>
              </div>
              <Switch
                checked={ctx.isPublishedValue}
                onCheckedChange={ctx.onIsPublishedChange}
                {...spreadOptionalDisabled(ctx)}
              />
            </div>
          ),
        },
        {
          title: "同意・表示設定",
          render: (ctx) => (
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <Label>予約時に同意必須</Label>
                  <p className="text-xs text-muted-foreground">
                    予約フォームでチェックを必須化
                  </p>
                </div>
                <Switch
                  checked={ctx.requiredAtReservationValue}
                  onCheckedChange={ctx.onRequiredAtReservationChange}
                  {...spreadOptionalDisabled(ctx)}
                />
              </div>
              <div className="flex items-center justify-between gap-4">
                <div>
                  <Label>問い合わせ時に同意必須</Label>
                  <p className="text-xs text-muted-foreground">
                    お問い合わせフォームでチェックを必須化
                  </p>
                </div>
                <Switch
                  checked={ctx.requiredAtInquiryValue}
                  onCheckedChange={ctx.onRequiredAtInquiryChange}
                  {...spreadOptionalDisabled(ctx)}
                />
              </div>
              <div className="flex items-center justify-between gap-4">
                <div>
                  <Label>新規登録時に同意必須</Label>
                  <p className="text-xs text-muted-foreground">
                    会員登録フォームでチェックを必須化
                  </p>
                </div>
                <Switch
                  checked={ctx.requiredAtSignupValue}
                  onCheckedChange={ctx.onRequiredAtSignupChange}
                  {...spreadOptionalDisabled(ctx)}
                />
              </div>
              <div className="flex items-center justify-between gap-4">
                <div>
                  <Label>フッターに表示</Label>
                  <p className="text-xs text-muted-foreground">
                    サイトフッターのリンクに表示
                  </p>
                </div>
                <Switch
                  checked={ctx.showInFooterValue}
                  onCheckedChange={ctx.onShowInFooterChange}
                  {...spreadOptionalDisabled(ctx)}
                />
              </div>
            </div>
          ),
        },
      ],
    },
  ],
};
