/**
 * Dialog Manager Hook
 *
 * @description 13個の個別ダイアログ状態を単一フックに統合
 */

"use client";

import { useState } from "react";
import type { DialogId } from "./dialog-types";

export type DialogManager = {
  activeDialog: DialogId | null;
  openDialog: (id: DialogId) => void;
  closeDialog: () => void;
};

export function useDialogManager(): DialogManager {
  const [activeDialog, setActiveDialog] = useState<DialogId | null>(null);

  const openDialog = (id: DialogId) => setActiveDialog(id);
  const closeDialog = () => setActiveDialog(null);

  return {
    activeDialog,
    openDialog,
    closeDialog,
  };
}
