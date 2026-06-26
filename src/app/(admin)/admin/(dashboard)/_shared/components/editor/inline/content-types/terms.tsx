"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
  Checkbox,
  Textarea,
  Label,
} from "@/admin/components/ui";
import { generateSlug } from "@/shared/lib/slug";
import {
  TERMS_TYPE_LABELS,
  TERMS_TYPE_VALUES,
  TERMS_SCOPE_VALUES,
  TERMS_SCOPE_LABELS,
  TERMS_SCOPE_DESCRIPTIONS,
} from "@/shared/lib/validations/terms";
import { TermsScope } from "@/shared/lib/validations/enums/prisma-types";
import type { TermsSettingsFormData } from "@/admin/lib/validations/terms";
import { TitleSlugFields } from "../side-panel";
import {
  type TermsSidePanelExtra,
  type SidePanelDefinition,
  spreadOptionalDisabled,
} from "./types";

/**
 * 利用規約 設定パネル定義。
 *
 * 旧 3 個別 Switch (requiredAtReservation/Inquiry/Signup) を `scopes` 多選択
 * Checkbox group に統合。各 scope は配線先の URL を明示し、編集者が誤配線
 * しないよう説明文も具体化する。
 */
export const termsSettingsPanel: SidePanelDefinition<
  TermsSettingsFormData,
  TermsSidePanelExtra
> = {
  title: "利用規約設定",
  description:
    "タイトル・スラッグ・タイプ・公開フラグ・適用 scope。本文中のブロック設定はエディタ右のパネルです。",
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
                <Label htmlFor="terms-settings-published">公開する</Label>
                <p className="text-xs text-muted-foreground">
                  公開時のみ /terms 配下に表示されます
                </p>
              </div>
              <Switch
                id="terms-settings-published"
                checked={ctx.isPublishedValue}
                onCheckedChange={ctx.onIsPublishedChange}
                {...spreadOptionalDisabled(ctx)}
              />
            </div>
          ),
        },
        {
          title: "フッター表示",
          render: (ctx) => (
            <div className="flex items-center justify-between gap-4">
              <div>
                <Label htmlFor="terms-settings-footer">フッターに表示</Label>
                <p className="text-xs text-muted-foreground">
                  サイトフッターのリンク一覧に表示されます
                </p>
              </div>
              <Switch
                id="terms-settings-footer"
                checked={ctx.showInFooterValue}
                onCheckedChange={ctx.onShowInFooterChange}
                {...spreadOptionalDisabled(ctx)}
              />
            </div>
          ),
        },
      ],
    },
    {
      id: "scopes",
      label: "同意必須にする画面",
      sections: [
        {
          title: "適用画面",
          render: (ctx) => {
            const handleToggle = (scope: TermsScope) => {
              const has = ctx.scopesValue.includes(scope);
              const next = has
                ? ctx.scopesValue.filter((s) => s !== scope)
                : [...ctx.scopesValue, scope];
              ctx.onScopesChange(next);
            };
            return (
              <div className="space-y-4">
                <p className="text-xs text-muted-foreground">
                  チェックを入れた画面のフォームで、この規約への同意チェックが必須になります。
                  どこにも該当しない場合はフッターのみの掲載になります。
                </p>
                <ul className="space-y-3">
                  {TERMS_SCOPE_VALUES.map((scope) => {
                    const inputId = `terms-settings-scope-${scope}`;
                    const descId = `${inputId}-desc`;
                    return (
                      <li key={scope} className="flex items-start gap-3">
                        <Checkbox
                          id={inputId}
                          checked={ctx.scopesValue.includes(scope)}
                          onCheckedChange={() => handleToggle(scope)}
                          aria-describedby={descId}
                          {...spreadOptionalDisabled(ctx)}
                        />
                        <div className="min-w-0 flex-1">
                          <Label htmlFor={inputId} className="font-medium">
                            {TERMS_SCOPE_LABELS[scope]}
                          </Label>
                          <p
                            id={descId}
                            className="text-xs text-muted-foreground"
                          >
                            {TERMS_SCOPE_DESCRIPTIONS[scope]}
                          </p>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          },
        },
        {
          title: "改訂時の周知文 (任意)",
          render: (ctx) => (
            <div className="space-y-2">
              <Label htmlFor="terms-settings-changelog">変更内容のメモ</Label>
              <Textarea
                id="terms-settings-changelog"
                value={ctx.changelogValue}
                onChange={(e) => ctx.onChangelogChange(e.target.value)}
                rows={4}
                placeholder="例: 〇〇条を改定しました。新規同意者には新版が表示されます。"
                {...spreadOptionalDisabled(ctx)}
              />
              <p className="text-xs text-muted-foreground">
                ※ 民法 548 条の 4 周知義務対応の運用メモです
                (任意・公開ページには表示されません)
              </p>
            </div>
          ),
        },
      ],
    },
  ],
};
