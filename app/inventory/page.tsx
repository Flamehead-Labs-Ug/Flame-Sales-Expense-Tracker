'use client'

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { useSearchParams } from 'next/navigation'

import { AuthGuard } from '@/components/auth-guard'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useFilter } from '@/lib/context/filter-context'

import { InventoryItemsPanel } from '@/components/inventory/inventory-items-panel'
import { RawMaterialsPanel } from '@/components/inventory/raw-materials-panel'
import { WorkInProgressPanel } from '@/components/inventory/work-in-progress-panel'
import { FinishedGoodsPanel } from '@/components/inventory/finished-goods-panel'
import { InventoryLogPanel } from '@/components/inventory/inventory-log-panel'
import { OpeningStockPanel } from '@/components/inventory/opening-stock-panel'
import { ProductionOrdersPanel } from '@/components/inventory/production-orders-panel'

export default function InventoryPage() {
  const { selectedProject, selectedCycle } = useFilter()
  const [activeTab, setActiveTab] = useState('items')
  const searchParams = useSearchParams()

  useEffect(() => {
    const tab = searchParams.get('tab')
    if (!tab) return
    if (tab === 'items' || tab === 'raw' || tab === 'wip' || tab === 'finished' || tab === 'opening' || tab === 'production' || tab === 'log') {
      setActiveTab(tab)
    }
  }, [searchParams])

  useEffect(() => {
    if (!selectedProject) {
      toast.message('Select a project to manage inventory.')
      return
    }
    if (!selectedCycle) {
      toast.message('Select a cycle to view balances and post opening stock.')
    }
  }, [selectedProject, selectedCycle])

  return (
    <AuthGuard>
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-3xl font-bold">Inventory</h1>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="w-full justify-start">
            <TabsTrigger value="items">Items</TabsTrigger>
            <TabsTrigger value="raw">Raw Materials</TabsTrigger>
            <TabsTrigger value="wip">WIP</TabsTrigger>
            <TabsTrigger value="finished">Products / Finished Goods</TabsTrigger>
            <TabsTrigger value="opening">Opening Stock</TabsTrigger>
            <TabsTrigger value="production">Production Orders</TabsTrigger>
            <TabsTrigger value="log">Inventory Log</TabsTrigger>
          </TabsList>

          <TabsContent value="items">
            <InventoryItemsPanel />
          </TabsContent>

          <TabsContent value="raw">
            <RawMaterialsPanel />
          </TabsContent>

          <TabsContent value="wip">
            <WorkInProgressPanel />
          </TabsContent>

          <TabsContent value="finished">
            <FinishedGoodsPanel />
          </TabsContent>

          <TabsContent value="opening">
            <OpeningStockPanel />
          </TabsContent>

          <TabsContent value="production">
            <ProductionOrdersPanel />
          </TabsContent>

          <TabsContent value="log">
            <InventoryLogPanel />
          </TabsContent>
        </Tabs>
      </div>
    </AuthGuard>
  )
}
