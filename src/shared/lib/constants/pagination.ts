/**
 * ページネーション設定
 *
 * 各種一覧のデフォルト表示件数を一元管理
 */

export const PAGINATION_DEFAULTS = {
  admin: {
    /** 管理画面デフォルト（10件） */
    default: 10,

    /** コメント一覧（20件） */
    comments: 20,

    /** メディアライブラリ（24件 = 6列 x 4行） */
    media: 24,
  },

  public: {
    /** 公開ページデフォルト（10件） */
    default: 10,
  },
} as const;
