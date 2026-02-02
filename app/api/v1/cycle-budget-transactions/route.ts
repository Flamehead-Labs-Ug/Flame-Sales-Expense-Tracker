import type { NextRequest } from 'next/server'

import { GET as baseGET, POST as basePOST } from '@/app/api/cycle-budget-transactions/route'

export async function GET(request: NextRequest) {
  return baseGET(request)
}

export async function POST(request: NextRequest) {
  return basePOST(request)
}
