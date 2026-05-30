/**
 * Media insert items — 画像・音声・ファイル・ギャラリー・テーブル
 *
 * プロジェクトが直接ホストするメディア（外部サービス埋め込みは embed.ts）。
 */

import {
  IconFloatLeft,
  IconLayoutGrid,
  IconPaperclip,
  IconPhoto,
  IconTable,
  IconVolume,
} from "@tabler/icons-react";
import type { InsertItem } from "./types";

export const MEDIA_INSERT_ITEMS: readonly InsertItem[] = [
  {
    id: "image",
    type: "dialog",
    label: "画像",
    icon: IconPhoto,
    keywords: ["image", "photo", "picture", "gazou", "img"],
    category: "media",
    showInToolbar: true,
    showInPicker: true,
    dialogId: "image",
  },
  {
    id: "inline-image",
    type: "dialog",
    label: "インライン画像",
    icon: IconFloatLeft,
    keywords: [
      "inline",
      "image",
      "float",
      "インライン",
      "画像",
      "フロート",
      "wrap",
    ],
    category: "media",
    showInToolbar: false,
    showInPicker: true,
    dialogId: "inlineImage",
  },
  {
    id: "audio",
    type: "dialog",
    label: "音声プレイヤー",
    icon: IconVolume,
    keywords: ["audio", "音声", "sound", "music", "音楽", "podcast"],
    category: "media",
    showInToolbar: false,
    showInPicker: true,
    dialogId: "audio",
  },
  {
    id: "file",
    type: "dialog",
    label: "ファイル添付",
    icon: IconPaperclip,
    keywords: [
      "file",
      "ファイル",
      "download",
      "ダウンロード",
      "attach",
      "添付",
    ],
    category: "media",
    showInToolbar: false,
    showInPicker: true,
    dialogId: "file",
  },
  {
    id: "gallery",
    type: "dialog",
    label: "画像ギャラリー",
    icon: IconLayoutGrid,
    keywords: ["gallery", "ギャラリー", "images", "画像", "photos", "写真"],
    category: "media",
    showInToolbar: false,
    showInPicker: true,
    dialogId: "gallery",
  },
  {
    id: "table",
    type: "dialog",
    label: "テーブル",
    icon: IconTable,
    keywords: ["table", "grid", "hyou", "excel"],
    category: "layout",
    showInToolbar: true,
    showInPicker: true,
    dialogId: "table",
  },
];
