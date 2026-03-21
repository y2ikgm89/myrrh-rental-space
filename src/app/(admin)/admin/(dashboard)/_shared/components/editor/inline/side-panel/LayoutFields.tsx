"use client";

/**
 * レイアウト設定フィールド（インライン Post / News 用）
 *
 * コンテンツ幅の個別設定のみ。ブログ記事・お知らせに `showSidebar` カラムは無いため
 * 当 UI では扱わない。固定ページのサイドバーは `validations/page` とページ編集フォームで永続化する。
 */

import { useWatch } from "react-hook-form";
import {
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/admin/components/ui";
import type { SidePanelSectionProps } from "../types";

/**
 * RHF の Control / Register はジェネリクス不変のため、Post と News を 1 ジェネリクスに束ねると Path が破綻する。
 * 本コンポーネントは `contentWidth` / `contentWidthCustom` のみ参照し、両フォームのスキーマに含める。
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- 上記 RHF 境界（旧 SectionDefinition の component: any と同格）
type LayoutFieldsProps = SidePanelSectionProps<any>;

interface ContentWidthOption {
  value: string;
  label: string;
  description: string;
}

const CONTENT_WIDTH_OPTIONS: readonly ContentWidthOption[] = [
  {
    value: "DEFAULT",
    label: "デフォルト（サイト設定を使用）",
    description: "",
  },
  { value: "XS", label: "極小 (640px)", description: "狭いコンテンツ向け" },
  { value: "SM", label: "小 (768px)", description: "記事コンテンツ推奨" },
  { value: "MD", label: "中 (1024px)", description: "バランスの良い幅" },
  { value: "LG", label: "大 (1280px)", description: "広めのコンテンツ" },
  { value: "CUSTOM", label: "カスタム", description: "任意の幅を指定" },
];

export function LayoutFields({
  register,
  control,
  errors,
  setValue,
  getValues: _getValues,
  disabled,
}: LayoutFieldsProps) {
  void _getValues;
  const contentWidth =
    useWatch({ control, name: "contentWidth" }) || "DEFAULT";

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Label htmlFor="contentWidth">コンテンツ幅</Label>
        <Select
          value={contentWidth}
          onValueChange={(value) => {
            setValue?.("contentWidth", value === "DEFAULT" ? undefined : value);
            if (value !== "CUSTOM") {
              setValue?.("contentWidthCustom", undefined);
            }
          }}
          {...(disabled !== undefined && { disabled })}
        >
          <SelectTrigger id="contentWidth">
            <SelectValue placeholder="デフォルト（サイト設定を使用）" />
          </SelectTrigger>
          <SelectContent>
            {CONTENT_WIDTH_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                <div className="flex flex-col">
                  <span>{option.label}</span>
                  {option.description && (
                    <span className="text-xs text-muted-foreground">
                      {option.description}
                    </span>
                  )}
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          この記事のコンテンツ表示幅を個別に設定できます
        </p>
      </div>

      {contentWidth === "CUSTOM" && (
        <div className="space-y-2">
          <Label htmlFor="contentWidthCustom">カスタム幅 (px)</Label>
          <Input
            id="contentWidthCustom"
            type="number"
            min="320"
            max="1920"
            {...register("contentWidthCustom")}
            placeholder="例: 900"
            disabled={disabled}
          />
          {"contentWidthCustom" in errors && errors["contentWidthCustom"] && (
            <p className="text-sm text-destructive">
              {String(errors["contentWidthCustom"].message ?? "")}
            </p>
          )}
          <p className="text-xs text-muted-foreground">
            320px〜1920pxの範囲で入力してください
          </p>
        </div>
      )}
    </div>
  );
}
