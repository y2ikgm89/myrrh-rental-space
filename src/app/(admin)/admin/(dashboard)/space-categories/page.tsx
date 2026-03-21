import { redirect } from "next/navigation";

/**
 * 旧 URL `/admin/space-categories` をスペース管理のカテゴリータブへ誘導する。
 */
export default function SpaceCategoriesRedirectPage() {
  redirect("/admin/spaces?tab=categories");
}
