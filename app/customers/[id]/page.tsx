'use client'

import { useParams } from 'next/navigation'
import { CustomerDetailsView } from '@/components/customer-details-view'

export default function CustomerDetailsPage() {
  const params = useParams()
  const id = Array.isArray(params?.id) ? params.id[0] : (params?.id as string)

  return <CustomerDetailsView customerId={id} backHref="/customers" />
}
