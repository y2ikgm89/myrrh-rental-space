"use client";

/**
 * 規約設定ダイアログ
 *
 * create モード: TermsSettingsFields のみ
 * edit モード: バージョン / 設定 / 同意 の 3 タブ
 *
 * Radix 公式パターン: <DialogContent> 直下を <form onSubmit={handleSubmit}> でラップ
 */

import type { Control, FieldErrors, UseFormRegister } from "react-hook-form";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  SubmitButton,
} from "@/admin/components/ui";
import type { TermsAgreementItem } from "@/shared/lib/validations/terms";
import type { TermsVersionDetail } from "@/shared/lib/validations/terms";
import type { Serialized } from "@/shared/lib/serialize";
import type { TermsVersionSummary } from "./terms-helpers";
import { TermsAgreementsTab } from "./TermsAgreementsTab";
import { TermsVersionTab } from "./TermsVersionTab";
import { TermsSettingsFields } from "./TermsSettingsTab";
import type { TermsFormData } from "./terms-helpers";

// =============================================================================
// Types
// =============================================================================

interface TermsSettingsDialogBaseProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  register: UseFormRegister<TermsFormData>;
  control: Control<TermsFormData>;
  errors: FieldErrors<TermsFormData>;
  isPending: boolean;
  isFormDirty: boolean;
  onSubmit: (e?: React.BaseSyntheticEvent) => void;
}

interface TermsSettingsDialogCreateProps extends TermsSettingsDialogBaseProps {
  mode: "create";
}

interface TermsSettingsDialogEditProps extends TermsSettingsDialogBaseProps {
  mode: "edit";
  termsId: string;
  initialAgreements: TermsAgreementItem[];
  initialTotal: number;
  localVersions: TermsVersionSummary[];
  selectedVersionId: string;
  selectedVersionContent: Serialized<TermsVersionDetail> | null;
  hasDraftVersion: boolean;
  isLoadingVersion: boolean;
  onVersionSwitch: (id: string) => void;
  onCreateNewVersion: () => void;
  onPublishVersion: () => void;
  onArchiveVersion: () => void;
  onDeleteVersion: () => void;
}

type TermsSettingsDialogProps =
  | TermsSettingsDialogCreateProps
  | TermsSettingsDialogEditProps;

// =============================================================================
// Component
// =============================================================================

export function TermsSettingsDialog(props: TermsSettingsDialogProps) {
  const {
    open,
    onOpenChange,
    register,
    control,
    errors,
    isPending,
    isFormDirty,
    onSubmit,
  } = props;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[var(--modal-max-height)] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>規約設定</DialogTitle>
          <DialogDescription>
            タイトル・スラッグ・バージョン・同意記録などを管理します。
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-4">
          {props.mode === "edit" ? (
            <Tabs defaultValue="settings" className="w-full">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="version">バージョン</TabsTrigger>
                <TabsTrigger value="settings">設定</TabsTrigger>
                <TabsTrigger value="agreements">
                  同意
                  {props.initialTotal > 0 && (
                    <span className="ml-1 rounded-full bg-muted px-1.5 py-0.5 text-xs tabular-nums">
                      {props.initialTotal}
                    </span>
                  )}
                </TabsTrigger>
              </TabsList>

              <TermsVersionTab
                localVersions={props.localVersions}
                selectedVersionId={props.selectedVersionId}
                selectedVersionContent={props.selectedVersionContent}
                hasDraftVersion={props.hasDraftVersion}
                isPending={isPending}
                isLoadingVersion={props.isLoadingVersion}
                onVersionSwitch={props.onVersionSwitch}
                onCreateNewVersion={props.onCreateNewVersion}
                onPublishVersion={props.onPublishVersion}
                onArchiveVersion={props.onArchiveVersion}
                onDeleteVersion={props.onDeleteVersion}
              />

              <TabsContent value="settings" className="mt-4 space-y-4">
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm">規約情報</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <TermsSettingsFields
                      isPending={isPending}
                      control={control}
                      register={register}
                      errors={errors}
                    />
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="agreements" className="mt-4">
                <TermsAgreementsTab
                  termsId={props.termsId}
                  initialAgreements={props.initialAgreements}
                  initialTotal={props.initialTotal}
                />
              </TabsContent>
            </Tabs>
          ) : (
            <TermsSettingsFields
              isPending={isPending}
              control={control}
              register={register}
              errors={errors}
            />
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isPending}
            >
              閉じる
            </Button>
            <SubmitButton
              isPending={isPending}
              label="保存"
              pendingLabel="保存中..."
              disabled={!isFormDirty}
            />
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
