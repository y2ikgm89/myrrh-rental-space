/**
 * Icon Curation SSoT — レンタルスペース管理システム向け Tabler Icons 厳選リスト
 *
 * 業界標準（Sanity / Storyblok / Notion / Linear）の icon picker と同様、
 * Tabler の 5,800+ アイコン全件を晒さず、サイト用途に合うものを 100 個に絞る。
 *
 * - client-safe（`server-only` なし）— admin Client Component から import 可
 * - icon component 自体は持たない（識別子文字列のみ）。実描画は admin chunk の
 *   `icon-component-map.tsx` で静的 import + Map で解決する
 * - 公開側 dynamic-tabler-icon.tsx は curation list 非依存（`Reflect.get`）
 *
 * カテゴリ追加・アイコン追加時は本ファイルのみ更新する。
 */

export interface IconMetadata {
  /** Tabler の export 識別子（例: "IconClock"） */
  readonly name: string;
  /** UI に表示する日本語ラベル */
  readonly label: string;
  /** 検索用キーワード（部分一致） */
  readonly keywords: readonly string[];
}

export interface IconCategory {
  readonly id: string;
  readonly label: string;
  readonly icons: readonly IconMetadata[];
}

export const ICON_CATEGORIES: readonly IconCategory[] = [
  {
    id: "time",
    label: "時間・スケジュール",
    icons: [
      {
        name: "IconClock",
        label: "時計",
        keywords: ["clock", "time", "時計", "時間"],
      },
      {
        name: "IconCalendar",
        label: "カレンダー",
        keywords: ["calendar", "カレンダー", "予定"],
      },
      {
        name: "IconCalendarEvent",
        label: "イベント",
        keywords: ["event", "calendar", "イベント"],
      },
      {
        name: "IconCalendarTime",
        label: "日時",
        keywords: ["datetime", "日時", "予約"],
      },
      {
        name: "IconCalendarMonth",
        label: "月間",
        keywords: ["month", "月間", "カレンダー"],
      },
      { name: "IconCalendarWeek", label: "週間", keywords: ["week", "週間"] },
      {
        name: "IconCalendarPlus",
        label: "予定追加",
        keywords: ["add", "plus", "追加", "新規"],
      },
      {
        name: "IconHourglass",
        label: "砂時計",
        keywords: ["hourglass", "砂時計", "経過"],
      },
      {
        name: "IconAlarm",
        label: "アラーム",
        keywords: ["alarm", "アラーム", "通知"],
      },
      {
        name: "IconHistory",
        label: "履歴",
        keywords: ["history", "履歴", "過去"],
      },
    ],
  },
  {
    id: "place",
    label: "場所・地理",
    icons: [
      {
        name: "IconMapPin",
        label: "ピン",
        keywords: ["map", "pin", "location", "地図", "場所"],
      },
      { name: "IconMap", label: "地図", keywords: ["map", "地図"] },
      { name: "IconMap2", label: "地図 (代替)", keywords: ["map", "地図"] },
      {
        name: "IconLocation",
        label: "位置情報",
        keywords: ["location", "位置", "GPS"],
      },
      {
        name: "IconCompass",
        label: "コンパス",
        keywords: ["compass", "コンパス", "方角"],
      },
      {
        name: "IconRoute",
        label: "ルート",
        keywords: ["route", "ルート", "経路"],
      },
      {
        name: "IconNavigation",
        label: "ナビゲーション",
        keywords: ["navigation", "ナビ"],
      },
      {
        name: "IconWorld",
        label: "世界",
        keywords: ["world", "globe", "世界", "地球"],
      },
      { name: "IconFlag", label: "旗", keywords: ["flag", "旗", "目印"] },
      { name: "IconPin", label: "ピン留め", keywords: ["pin", "ピン", "固定"] },
    ],
  },
  {
    id: "amenity",
    label: "設備・アメニティ",
    icons: [
      {
        name: "IconWifi",
        label: "Wi-Fi",
        keywords: ["wifi", "internet", "wi-fi", "ネット"],
      },
      {
        name: "IconAirConditioning",
        label: "エアコン",
        keywords: ["air", "ac", "エアコン", "空調"],
      },
      {
        name: "IconArmchair",
        label: "椅子・家具",
        keywords: ["chair", "furniture", "椅子", "家具"],
      },
      {
        name: "IconCoffee",
        label: "コーヒー",
        keywords: ["coffee", "drink", "コーヒー", "飲料"],
      },
      {
        name: "IconFridge",
        label: "冷蔵庫",
        keywords: ["fridge", "refrigerator", "冷蔵庫"],
      },
      {
        name: "IconBath",
        label: "浴室",
        keywords: ["bath", "shower", "浴室", "風呂"],
      },
      {
        name: "IconToiletPaper",
        label: "トイレ",
        keywords: ["toilet", "restroom", "トイレ"],
      },
      {
        name: "IconParking",
        label: "駐車場",
        keywords: ["parking", "car", "駐車場"],
      },
      {
        name: "IconChargingPile",
        label: "充電",
        keywords: ["charge", "ev", "充電"],
      },
      { name: "IconKey", label: "鍵", keywords: ["key", "鍵", "アクセス"] },
      { name: "IconLock", label: "ロック", keywords: ["lock", "鍵", "ロック"] },
      {
        name: "IconShield",
        label: "シールド",
        keywords: ["shield", "security", "セキュリティ"],
      },
      {
        name: "IconShieldCheck",
        label: "安全確認済み",
        keywords: ["safe", "verified", "安全"],
      },
      {
        name: "IconAccessible",
        label: "バリアフリー",
        keywords: ["accessible", "wheelchair", "バリアフリー"],
      },
      {
        name: "IconSmokingNo",
        label: "禁煙",
        keywords: ["smoking", "no smoking", "禁煙"],
      },
    ],
  },
  {
    id: "transport",
    label: "アクセス・移動",
    icons: [
      { name: "IconCar", label: "車", keywords: ["car", "車", "自動車"] },
      { name: "IconBus", label: "バス", keywords: ["bus", "バス"] },
      {
        name: "IconBike",
        label: "自転車",
        keywords: ["bike", "bicycle", "自転車"],
      },
      { name: "IconTrain", label: "電車", keywords: ["train", "電車", "鉄道"] },
      { name: "IconWalk", label: "徒歩", keywords: ["walk", "徒歩", "歩く"] },
      {
        name: "IconPlane",
        label: "飛行機",
        keywords: ["plane", "airplane", "飛行機"],
      },
      {
        name: "IconScooter",
        label: "スクーター",
        keywords: ["scooter", "スクーター", "バイク"],
      },
      { name: "IconTruck", label: "トラック", keywords: ["truck", "トラック"] },
      { name: "IconShip", label: "船", keywords: ["ship", "boat", "船"] },
      {
        name: "IconShoe",
        label: "靴",
        keywords: ["shoe", "walk", "靴"],
      },
    ],
  },
  {
    id: "rating",
    label: "評価・お気に入り",
    icons: [
      {
        name: "IconStar",
        label: "星",
        keywords: ["star", "rating", "星", "評価"],
      },
      {
        name: "IconStarFilled",
        label: "星 (塗)",
        keywords: ["star", "filled", "星", "選択"],
      },
      {
        name: "IconHeart",
        label: "ハート",
        keywords: ["heart", "love", "ハート", "お気に入り"],
      },
      {
        name: "IconHeartFilled",
        label: "ハート (塗)",
        keywords: ["heart", "filled", "ハート"],
      },
      {
        name: "IconBookmark",
        label: "ブックマーク",
        keywords: ["bookmark", "ブックマーク", "保存"],
      },
      {
        name: "IconThumbUp",
        label: "いいね",
        keywords: ["like", "thumbs up", "いいね"],
      },
      {
        name: "IconAward",
        label: "賞",
        keywords: ["award", "medal", "賞", "受賞"],
      },
      {
        name: "IconTrophy",
        label: "トロフィー",
        keywords: ["trophy", "トロフィー", "優勝"],
      },
      {
        name: "IconCheck",
        label: "チェック",
        keywords: ["check", "ok", "チェック", "確認"],
      },
      {
        name: "IconCircleCheck",
        label: "確認済み",
        keywords: ["check", "verified", "確認", "完了"],
      },
    ],
  },
  {
    id: "contact",
    label: "連絡・通知",
    icons: [
      { name: "IconPhone", label: "電話", keywords: ["phone", "tel", "電話"] },
      {
        name: "IconMail",
        label: "メール",
        keywords: ["mail", "email", "メール"],
      },
      {
        name: "IconMessage",
        label: "メッセージ",
        keywords: ["message", "chat", "メッセージ"],
      },
      {
        name: "IconMessages",
        label: "チャット",
        keywords: ["chat", "messages", "チャット", "会話"],
      },
      {
        name: "IconBrandLine",
        label: "LINE",
        keywords: ["line", "ライン", "sns"],
      },
      {
        name: "IconHeadset",
        label: "サポート",
        keywords: ["support", "headset", "サポート", "ヘルプ"],
      },
      {
        name: "IconAt",
        label: "アットマーク",
        keywords: ["at", "email", "@", "メール"],
      },
      { name: "IconSend", label: "送信", keywords: ["send", "送信"] },
      {
        name: "IconSpeakerphone",
        label: "お知らせ",
        keywords: ["megaphone", "announcement", "お知らせ"],
      },
      {
        name: "IconBell",
        label: "通知",
        keywords: ["bell", "notification", "通知"],
      },
    ],
  },
  {
    id: "people",
    label: "人・グループ",
    icons: [
      {
        name: "IconUsers",
        label: "複数人",
        keywords: ["users", "people", "複数", "人"],
      },
      {
        name: "IconUser",
        label: "1人",
        keywords: ["user", "person", "ユーザー", "人"],
      },
      {
        name: "IconUserCheck",
        label: "メンバー確認",
        keywords: ["user", "member", "メンバー"],
      },
      {
        name: "IconUsersGroup",
        label: "グループ",
        keywords: ["group", "team", "グループ", "チーム"],
      },
      {
        name: "IconCake",
        label: "ケーキ",
        keywords: ["cake", "birthday", "ケーキ", "誕生日"],
      },
      {
        name: "IconSparkles",
        label: "キラキラ",
        keywords: ["sparkles", "promo", "new", "キラキラ", "新着", "プロモ"],
      },
      {
        name: "IconGift",
        label: "ギフト",
        keywords: ["gift", "present", "ギフト", "プレゼント"],
      },
      {
        name: "IconConfetti",
        label: "お祝い",
        keywords: ["confetti", "celebration", "お祝い"],
      },
      {
        name: "IconMicrophone",
        label: "マイク",
        keywords: ["mic", "microphone", "マイク"],
      },
      {
        name: "IconPresentation",
        label: "プレゼン",
        keywords: ["presentation", "slide", "プレゼン"],
      },
      {
        name: "IconCalendarHeart",
        label: "記念日",
        keywords: ["anniversary", "記念日"],
      },
    ],
  },
  {
    id: "facility",
    label: "施設・空間",
    icons: [
      {
        name: "IconHome",
        label: "ホーム",
        keywords: ["home", "house", "ホーム", "家"],
      },
      { name: "IconBuilding", label: "建物", keywords: ["building", "建物"] },
      {
        name: "IconBuildingStore",
        label: "店舗",
        keywords: ["store", "shop", "店舗"],
      },
      {
        name: "IconBuildingSkyscraper",
        label: "オフィス",
        keywords: ["office", "skyscraper", "オフィス"],
      },
      {
        name: "IconBuildingCommunity",
        label: "コミュニティ",
        keywords: ["community", "コミュニティ"],
      },
      {
        name: "IconBuildingWarehouse",
        label: "倉庫",
        keywords: ["warehouse", "倉庫"],
      },
      {
        name: "IconBuildingChurch",
        label: "礼拝所",
        keywords: ["church", "礼拝", "宗教"],
      },
      {
        name: "IconBuildings",
        label: "街",
        keywords: ["buildings", "city", "街"],
      },
      { name: "IconDoor", label: "ドア", keywords: ["door", "ドア", "入口"] },
      { name: "IconStairs", label: "階段", keywords: ["stairs", "階段"] },
    ],
  },
  {
    id: "general",
    label: "一般 UI",
    icons: [
      {
        name: "IconBulb",
        label: "電球",
        keywords: ["bulb", "idea", "電球", "アイデア"],
      },
      {
        name: "IconInfoCircle",
        label: "情報",
        keywords: ["info", "information", "情報"],
      },
      { name: "IconHelpCircle", label: "ヘルプ", keywords: ["help", "ヘルプ"] },
      {
        name: "IconQuestionMark",
        label: "質問",
        keywords: ["question", "質問", "FAQ"],
      },
      {
        name: "IconAlertCircle",
        label: "警告",
        keywords: ["alert", "warning", "警告"],
      },
      {
        name: "IconAlertTriangle",
        label: "注意",
        keywords: ["alert", "danger", "注意"],
      },
      {
        name: "IconLink",
        label: "リンク",
        keywords: ["link", "url", "リンク"],
      },
      {
        name: "IconExternalLink",
        label: "外部リンク",
        keywords: ["external", "link", "リンク"],
      },
      {
        name: "IconArrowRight",
        label: "矢印 (右)",
        keywords: ["arrow", "right", "矢印"],
      },
      {
        name: "IconChevronRight",
        label: "山型 (右)",
        keywords: ["chevron", "right", "矢印"],
      },
      { name: "IconPlus", label: "プラス", keywords: ["plus", "add", "追加"] },
      {
        name: "IconMinus",
        label: "マイナス",
        keywords: ["minus", "remove", "削除"],
      },
      { name: "IconX", label: "閉じる", keywords: ["close", "x", "閉じる"] },
      { name: "IconSearch", label: "検索", keywords: ["search", "検索"] },
      { name: "IconSettings", label: "設定", keywords: ["settings", "設定"] },
      {
        name: "IconCamera",
        label: "カメラ",
        keywords: ["camera", "カメラ", "撮影"],
      },
    ],
  },
];

/** 全キュレーションアイコンの flat list（検索・存在チェック用） */
export const ALL_CURATED_ICONS: readonly IconMetadata[] =
  ICON_CATEGORIES.flatMap((c) => c.icons);

/** name → metadata 検索 */
export function findIconMetadata(name: string): IconMetadata | undefined {
  return ALL_CURATED_ICONS.find((i) => i.name === name);
}

/** 検索クエリで keywords / label / name を部分一致でフィルタ */
export function searchIcons(query: string): readonly IconMetadata[] {
  const q = query.trim().toLowerCase();
  if (q === "") return ALL_CURATED_ICONS;
  return ALL_CURATED_ICONS.filter((icon) => {
    if (icon.name.toLowerCase().includes(q)) return true;
    if (icon.label.toLowerCase().includes(q)) return true;
    return icon.keywords.some((k) => k.toLowerCase().includes(q));
  });
}
