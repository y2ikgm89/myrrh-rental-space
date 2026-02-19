import { notFound } from 'next/navigation'
import { connection } from 'next/server'
import { getInquiryById } from '@/admin/actions/inquiry'
import { InquiryDetail } from './_components/InquiryDetail'
import type { Metadata } from 'next'


type Params = Promise<{ id: string }>

type PageProps = {
  params: Params
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  await connection()
  const { id } = await params
  const inquiry = await getInquiryById(id)

  if (!inquiry) {
    return {
      title: 'お問い合わせが見つかりません | Myrrh Rental Space',
    }
  }

  return {
    title: `${inquiry.subject} | お問い合わせ管理 | Myrrh Rental Space`,
  }
}

export default async function InquiryDetailPage({ params }: PageProps) {
  await connection();
  await connection()
  const { id } = await params
  const inquiry = await getInquiryById(id)

  if (!inquiry) {
    notFound()
  }

  return <InquiryDetail inquiry={inquiry} />
}
