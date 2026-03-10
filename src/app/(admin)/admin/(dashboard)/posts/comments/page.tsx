import { redirect } from "next/navigation";

export default async function CommentsPage() {
  redirect("/admin/posts?tab=comments");
}
