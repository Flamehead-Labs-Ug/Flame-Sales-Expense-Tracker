'use client'

import { useParams } from 'next/navigation'
import { SaleDetailsView } from '@/components/sale-details-view'

export default function SaleDetailsPage() {
  const params = useParams()
  const id = Array.isArray(params?.id) ? params.id[0] : (params?.id as string)

  return <SaleDetailsView saleId={id} backHref="/sales" />
}
