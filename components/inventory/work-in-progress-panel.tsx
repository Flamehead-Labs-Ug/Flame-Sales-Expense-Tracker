'use client'

import { InventoryItemsPanel } from '@/components/inventory/inventory-items-panel'

export function WorkInProgressPanel() {
  return <InventoryItemsPanel lockedTypeCode="WORK_IN_PROGRESS" />
}
