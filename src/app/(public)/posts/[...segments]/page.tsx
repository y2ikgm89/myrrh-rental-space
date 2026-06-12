import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";

interface PageProps {
  params: Promise<{ segments: string[] }>;
}

export default async function PostDetailPage({ params }: PageProps) {
  await connection();

  const { segments } = await params;
  const lastSegment = segments[segments.length - 1];

  if (!lastSegment) notFound();

  redirect(`/blog/${lastSegment}`);
}
