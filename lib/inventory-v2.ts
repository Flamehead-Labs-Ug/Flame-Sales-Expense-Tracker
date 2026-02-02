type QueryFn = (text: string, params?: any[]) => Promise<{ rows: any[] }>

let v2EnabledCache: boolean | null = null
let v2ColumnsCache: { productsHasDefaultVariant: boolean; productsHasInventoryItemId: boolean; variantsHasInventoryVariantId: boolean } | null = null

async function isInventoryV2Enabled(queryFn: QueryFn): Promise<boolean> {
  if (v2EnabledCache !== null) return v2EnabledCache

  const res = await queryFn(
    "SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'inventory_balances' LIMIT 1",
  )
  v2EnabledCache = res.rows.length > 0
  return v2EnabledCache
}

async function getV2ColumnSupport(queryFn: QueryFn): Promise<{
  productsHasDefaultVariant: boolean
  productsHasInventoryItemId: boolean
  variantsHasInventoryVariantId: boolean
}> {
  if (v2ColumnsCache) return v2ColumnsCache

  const cols = await queryFn(
    "SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = 'public' AND ((table_name = 'products' AND column_name IN ('inventory_item_id','inventory_item_variant_id')) OR (table_name = 'product_variants' AND column_name IN ('inventory_item_variant_id'))) ",
  )

  const set = new Set<string>(cols.rows.map((r: any) => `${String(r.table_name)}.${String(r.column_name)}`))

  v2ColumnsCache = {
    productsHasDefaultVariant: set.has('products.inventory_item_variant_id'),
    productsHasInventoryItemId: set.has('products.inventory_item_id'),
    variantsHasInventoryVariantId: set.has('product_variants.inventory_item_variant_id'),
  }

  return v2ColumnsCache
}

export async function resolveFinishedGoodsInventoryVariantId(
  queryFn: QueryFn,
  organizationId: number,
  productId: number | null | undefined,
  productVariantId: number | null | undefined,
): Promise<number | null> {
  if (!productId) return null

  const enabled = await isInventoryV2Enabled(queryFn)
  if (!enabled) return null

  const cols = await getV2ColumnSupport(queryFn)
  if (!cols.productsHasInventoryItemId) return null

  if (productVariantId && cols.variantsHasInventoryVariantId) {
    const { rows } = await queryFn(
      `
      SELECT pv.inventory_item_variant_id
        FROM product_variants pv
        JOIN products p ON p.id = pv.product_id
       WHERE pv.id = $1
         AND p.id = $2
         AND p.organization_id = $3
       LIMIT 1
      `,
      [productVariantId, productId, organizationId],
    )

    const id = rows[0]?.inventory_item_variant_id
    return id ? Number(id) : null
  }

  if (cols.productsHasDefaultVariant) {
    const { rows } = await queryFn(
      'SELECT inventory_item_variant_id FROM products WHERE id = $1 AND organization_id = $2 LIMIT 1',
      [productId, organizationId],
    )
    const id = rows[0]?.inventory_item_variant_id
    return id ? Number(id) : null
  }

  return null
}

export async function postInventoryV2Movement(
  queryFn: QueryFn,
  args: {
    organizationId: number
    projectId: number | null | undefined
    cycleId: number | null | undefined
    productId: number | null | undefined
    productVariantId: number | null | undefined
    quantityDelta: number
    unitCost?: number | null
    transactionType: string
    sourceType?: string | null
    sourceId?: number | null
    notes?: string | null
    createdBy?: number | null
  },
): Promise<void> {
  const enabled = await isInventoryV2Enabled(queryFn)
  if (!enabled) return

  const projectId = args.projectId ?? null
  const cycleId = args.cycleId ?? null
  if (!projectId || !cycleId) return

  const variantId = await resolveFinishedGoodsInventoryVariantId(
    queryFn,
    args.organizationId,
    args.productId ?? null,
    args.productVariantId ?? null,
  )
  if (!variantId) return

  const qtyDelta = Number(args.quantityDelta) || 0
  if (!qtyDelta) return

  const safeUnitCost = args.unitCost == null ? null : (Number(args.unitCost) || null)

  const { rows: itemRows } = await queryFn(
    'SELECT inventory_item_id FROM inventory_item_variants WHERE id = $1 LIMIT 1',
    [variantId],
  )
  const inventoryItemId = itemRows[0]?.inventory_item_id
  if (!inventoryItemId) return

  await queryFn(
    `
    INSERT INTO inventory_item_transactions (
      organization_id,
      project_id,
      cycle_id,
      inventory_item_id,
      inventory_item_variant_id,
      transaction_type,
      quantity_delta,
      unit_cost,
      source_type,
      source_id,
      notes,
      created_by
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
    `,
    [
      args.organizationId,
      projectId,
      cycleId,
      inventoryItemId,
      variantId,
      args.transactionType,
      qtyDelta,
      safeUnitCost,
      args.sourceType ?? null,
      args.sourceId ?? null,
      args.notes ?? null,
      args.createdBy ?? null,
    ],
  )

  const existingBal = await queryFn(
    `
    SELECT quantity_on_hand, avg_unit_cost
      FROM inventory_balances
     WHERE organization_id = $1
       AND project_id = $2
       AND cycle_id = $3
       AND inventory_item_variant_id = $4
     LIMIT 1
    `,
    [args.organizationId, projectId, cycleId, variantId],
  )

  if (!existingBal.rows.length) {
    await queryFn(
      `
      INSERT INTO inventory_balances (
        organization_id,
        project_id,
        cycle_id,
        inventory_item_variant_id,
        quantity_on_hand,
        avg_unit_cost
      ) VALUES ($1,$2,$3,$4,$5,$6)
      ON CONFLICT (organization_id, project_id, cycle_id, inventory_item_variant_id)
      DO UPDATE SET
        quantity_on_hand = inventory_balances.quantity_on_hand + EXCLUDED.quantity_on_hand,
        updated_at = NOW()
      `,
      [
        args.organizationId,
        projectId,
        cycleId,
        variantId,
        qtyDelta,
        safeUnitCost,
      ],
    )
    return
  }

  const prevQty = Number(existingBal.rows[0]?.quantity_on_hand ?? 0) || 0
  const prevAvg = existingBal.rows[0]?.avg_unit_cost == null ? null : (Number(existingBal.rows[0]?.avg_unit_cost) || null)

  let nextAvg: number | null = prevAvg
  if (qtyDelta > 0 && safeUnitCost && prevQty + qtyDelta > 0) {
    const prevTotal = (prevAvg || 0) * prevQty
    const nextTotal = prevTotal + safeUnitCost * qtyDelta
    nextAvg = nextTotal / (prevQty + qtyDelta)
  }

  await queryFn(
    `
    UPDATE inventory_balances
       SET quantity_on_hand = quantity_on_hand + $1,
           avg_unit_cost = COALESCE($2, avg_unit_cost),
           updated_at = NOW()
     WHERE organization_id = $3
       AND project_id = $4
       AND cycle_id = $5
       AND inventory_item_variant_id = $6
    `,
    [qtyDelta, nextAvg, args.organizationId, projectId, cycleId, variantId],
  )
}

async function postInventoryV2MovementByVariantIdInternal(
  queryFn: QueryFn,
  args: {
    organizationId: number
    projectId: number
    cycleId: number
    inventoryItemVariantId: number
    quantityDelta: number
    unitCost?: number | null
    transactionType: string
    sourceType?: string | null
    sourceId?: number | null
    notes?: string | null
    createdBy?: number | null
  },
): Promise<void> {
  const enabled = await isInventoryV2Enabled(queryFn)
  if (!enabled) return

  const projectId = Number(args.projectId) || 0
  const cycleId = Number(args.cycleId) || 0
  const variantId = Number(args.inventoryItemVariantId) || 0
  if (!projectId || !cycleId || !variantId) return

  const qtyDelta = Number(args.quantityDelta) || 0
  if (!qtyDelta) return

  const safeUnitCost = args.unitCost == null ? null : (Number(args.unitCost) || null)

  const { rows: itemRows } = await queryFn(
    'SELECT inventory_item_id FROM inventory_item_variants WHERE id = $1 LIMIT 1',
    [variantId],
  )
  const inventoryItemId = itemRows[0]?.inventory_item_id
  if (!inventoryItemId) return

  await queryFn(
    `
    INSERT INTO inventory_item_transactions (
      organization_id,
      project_id,
      cycle_id,
      inventory_item_id,
      inventory_item_variant_id,
      transaction_type,
      quantity_delta,
      unit_cost,
      source_type,
      source_id,
      notes,
      created_by
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
    `,
    [
      args.organizationId,
      projectId,
      cycleId,
      inventoryItemId,
      variantId,
      args.transactionType,
      qtyDelta,
      safeUnitCost,
      args.sourceType ?? null,
      args.sourceId ?? null,
      args.notes ?? null,
      args.createdBy ?? null,
    ],
  )

  const existingBal = await queryFn(
    `
    SELECT quantity_on_hand, avg_unit_cost
      FROM inventory_balances
     WHERE organization_id = $1
       AND project_id = $2
       AND cycle_id = $3
       AND inventory_item_variant_id = $4
     LIMIT 1
    `,
    [args.organizationId, projectId, cycleId, variantId],
  )

  if (!existingBal.rows.length) {
    await queryFn(
      `
      INSERT INTO inventory_balances (
        organization_id,
        project_id,
        cycle_id,
        inventory_item_variant_id,
        quantity_on_hand,
        avg_unit_cost
      ) VALUES ($1,$2,$3,$4,$5,$6)
      ON CONFLICT (organization_id, project_id, cycle_id, inventory_item_variant_id)
      DO UPDATE SET
        quantity_on_hand = inventory_balances.quantity_on_hand + EXCLUDED.quantity_on_hand,
        updated_at = NOW()
      `,
      [
        args.organizationId,
        projectId,
        cycleId,
        variantId,
        qtyDelta,
        safeUnitCost,
      ],
    )
    return
  }

  const prevQty = Number(existingBal.rows[0]?.quantity_on_hand ?? 0) || 0
  const prevAvg = existingBal.rows[0]?.avg_unit_cost == null ? null : (Number(existingBal.rows[0]?.avg_unit_cost) || null)

  let nextAvg: number | null = prevAvg
  if (qtyDelta > 0 && safeUnitCost && prevQty + qtyDelta > 0) {
    const prevTotal = (prevAvg || 0) * prevQty
    const nextTotal = prevTotal + safeUnitCost * qtyDelta
    nextAvg = nextTotal / (prevQty + qtyDelta)
  }

  await queryFn(
    `
    UPDATE inventory_balances
       SET quantity_on_hand = quantity_on_hand + $1,
           avg_unit_cost = COALESCE($2, avg_unit_cost),
           updated_at = NOW()
     WHERE organization_id = $3
       AND project_id = $4
       AND cycle_id = $5
       AND inventory_item_variant_id = $6
    `,
    [qtyDelta, nextAvg, args.organizationId, projectId, cycleId, variantId],
  )
}

export async function postInventoryV2MovementByVariantId(
  queryFn: QueryFn,
  args: {
    organizationId: number
    projectId: number | null | undefined
    cycleId: number | null | undefined
    inventoryItemVariantId: number | null | undefined
    quantityDelta: number
    unitCost?: number | null
    transactionType: string
    sourceType?: string | null
    sourceId?: number | null
    notes?: string | null
    createdBy?: number | null
  },
): Promise<void> {
  const projectId = args.projectId == null ? null : (Number(args.projectId) || null)
  const cycleId = args.cycleId == null ? null : (Number(args.cycleId) || null)
  const variantId = args.inventoryItemVariantId == null ? null : (Number(args.inventoryItemVariantId) || null)
  if (!projectId || !cycleId || !variantId) return

  await postInventoryV2MovementByVariantIdInternal(queryFn, {
    organizationId: args.organizationId,
    projectId,
    cycleId,
    inventoryItemVariantId: variantId,
    quantityDelta: args.quantityDelta,
    unitCost: args.unitCost ?? null,
    transactionType: args.transactionType,
    sourceType: args.sourceType ?? null,
    sourceId: args.sourceId ?? null,
    notes: args.notes ?? null,
    createdBy: args.createdBy ?? null,
  })
}
