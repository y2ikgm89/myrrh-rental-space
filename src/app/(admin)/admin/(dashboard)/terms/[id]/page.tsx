import { redirect } from "next/navigation";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function TermsDetailPage({ params }: PageProps) {
  const { id } = await params;
  redirect(`/admin/terms/${id}/edit`);
}

