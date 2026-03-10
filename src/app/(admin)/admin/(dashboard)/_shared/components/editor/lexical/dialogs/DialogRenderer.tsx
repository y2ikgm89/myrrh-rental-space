/**
 * Dialog Renderer
 *
 * @description activeDialogに基づいてダイアログプラグインをレンダリングする
 */

"use client";

import type { DialogManager } from "./use-dialog-manager";
import { DIALOG_REGISTRY } from "../config/dialog-registry";

type DialogRendererProps = {
  dialogManager: DialogManager;
};

export function DialogRenderer({ dialogManager }: DialogRendererProps) {
  const { activeDialog, closeDialog } = dialogManager;

  return (
    <>
      {DIALOG_REGISTRY.map(({ dialogId, component: Plugin }) => (
        <Plugin
          key={dialogId}
          isOpen={activeDialog === dialogId}
          onClose={closeDialog}
        />
      ))}
    </>
  );
}
