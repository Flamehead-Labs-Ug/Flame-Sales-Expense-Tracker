import { redirect } from 'next/navigation'

export default function ProductDetailsPage() {
  redirect('/inventory?tab=finished')
}
