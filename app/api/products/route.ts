import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/database'
import { getApiOrSessionUser } from '@/lib/api-auth-keys'

/**
 * @swagger
 * /api/products:
 *   get:
 *     operationId: listProducts
 *     tags:
 *       - Products
 *     summary: List products with their variants
 *     security:
 *       - stackSession: []
 *     responses:
 *       200:
 *         description: Products fetched successfully.
 *   post:
 *     operationId: createProduct
 *     tags:
 *       - Products
 *     summary: Create a new product with variants
 *     security:
 *       - stackSession: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               product_name:
 *                 type: string
 *               description:
 *                 type: string
 *                 nullable: true
 *               reorder_level:
 *                 type: integer
 *                 nullable: true
 *               category:
 *                 type: string
 *                 nullable: true
 *               project_id:
 *                 type: integer
 *                 nullable: true
 *               cycle_id:
 *                 type: integer
 *                 nullable: true
 *               project_category_id:
 *                 type: integer
 *                 nullable: true
 *               status:
 *                 type: string
 *                 nullable: true
 *               attributes:
 *                 type: array
 *                 items:
 *                   type: object
 *               variants:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     label:
 *                       type: string
 *                       nullable: true
 *                     unit_cost:
 *                       type: number
 *                       nullable: true
 *                     selling_price:
 *                       type: number
 *                       nullable: true
 *                     quantity_in_stock:
 *                       type: integer
 *                       nullable: true
 *                     unit_of_measurement:
 *                       type: string
 *                       nullable: true
 *                     images:
 *                       type: array
 *                       items:
 *                         type: string
 *                     attributes:
 *                       type: array
 *                       items:
 *                         type: object
 *             required:
 *               - product_name
 *     responses:
 *       200:
 *         description: Product created successfully.
 *   put:
 *     operationId: updateProduct
 *     tags:
 *       - Products
 *     summary: Update an existing product and its variants
 *     security:
 *       - stackSession: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               id:
 *                 type: integer
 *               product_name:
 *                 type: string
 *               description:
 *                 type: string
 *                 nullable: true
 *               reorder_level:
 *                 type: integer
 *                 nullable: true
 *               category:
 *                 type: string
 *                 nullable: true
 *               project_id:
 *                 type: integer
 *                 nullable: true
 *               cycle_id:
 *                 type: integer
 *                 nullable: true
 *               project_category_id:
 *                 type: integer
 *                 nullable: true
 *               status:
 *                 type: string
 *                 nullable: true
 *               attributes:
 *                 type: array
 *                 items:
 *                   type: object
 *               variants:
 *                 type: array
 *                 items:
 *                   type: object
 *             required:
 *               - id
 *               - product_name
 *     responses:
 *       200:
 *         description: Product updated successfully.
 *   delete:
 *     operationId: deleteProduct
 *     tags:
 *       - Products
 *     summary: Delete a product
 *     security:
 *       - stackSession: []
 *     parameters:
 *       - in: query
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Product deleted successfully.
 */

export async function GET(request: NextRequest) {
  try {
    const user = await getApiOrSessionUser(request);

    if (!user?.organizationId) {
      return NextResponse.json({ status: 'error', message: 'API key required' }, { status: 401 });
    }
    const { organizationId } = user;

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    const projectId = searchParams.get('project_id');
    const cycleId = searchParams.get('cycle_id');

    if (await isInventoryV2ProductsCutoverReady()) {
      return await handleV2ProductsGET(request, user)
    }

    const result = user.role === 'admin'
      ? await db.query(
          `
          SELECT *
            FROM products
           WHERE organization_id = $1
             AND ($2::int IS NULL OR id = $2::int)
             AND ($3::int IS NULL OR project_id = $3::int)
             AND ($4::int IS NULL OR cycle_id = $4::int)
           ORDER BY product_name
          `,
          [
            organizationId,
            id ? parseInt(id, 10) : null,
            projectId ? parseInt(projectId, 10) : null,
            cycleId ? parseInt(cycleId, 10) : null,
          ]
        )
      : await db.query(
          `
          SELECT *
            FROM products
           WHERE organization_id = $1
             AND ($3::int IS NULL OR id = $3::int)
             AND ($4::int IS NULL OR project_id = $4::int)
             AND ($5::int IS NULL OR cycle_id = $5::int)
             AND project_id IS NOT NULL
             AND project_id IN (
               SELECT pa.project_id
                 FROM project_assignments pa
                WHERE pa.user_id = $2
               UNION
               SELECT pa.project_id
                 FROM project_assignments pa
                 JOIN team_members tm ON tm.team_id = pa.team_id
                WHERE tm.user_id = $2
             )
           ORDER BY product_name
          `,
          [
            organizationId,
            user.id,
            id ? parseInt(id, 10) : null,
            projectId ? parseInt(projectId, 10) : null,
            cycleId ? parseInt(cycleId, 10) : null,
          ]
        );

    const productRows = result.rows;
    const productIds = productRows.map((row) => row.id);

    // Load variants for all products in one go
    let variantsByProductId: Record<number, any[]> = {};

    if (productIds.length > 0) {
      const variantsResult = await db.query(
        'SELECT * FROM product_variants WHERE product_id = ANY($1::int[]) ORDER BY id',
        [productIds]
      );

      variantsByProductId = variantsResult.rows.reduce<Record<number, any[]>>((acc, row: any) => {
        let images: any = row.images;
        if (typeof images === 'string') {
          try {
            images = JSON.parse(images);
          } catch {
            images = images ? [images] : [];
          }
        }
        if (!Array.isArray(images)) {
          images = [];
        }

        let attributes: any = row.attributes;
        if (typeof attributes === 'string') {
          try {
            attributes = JSON.parse(attributes);
          } catch {
            attributes = [];
          }
        }
        if (!Array.isArray(attributes)) {
          attributes = [];
        }

        const variant = { ...row, images, attributes };
        const list = acc[row.product_id] || [];
        list.push(variant);
        acc[row.product_id] = list;
        return acc;
      }, {});
    }

    // Normalize images and attributes columns on products and attach variants array
    const products = productRows.map((row) => {
      let images: any = row.images;
      if (typeof images === 'string') {
        try {
          images = JSON.parse(images);
        } catch {
          images = images ? [images] : [];
        }
      }
      if (!Array.isArray(images)) {
        images = [];
      }

      let attributes: any = (row as any).attributes;
      if (typeof attributes === 'string') {
        try {
          attributes = JSON.parse(attributes);
        } catch {
          attributes = [];
        }
      }
      if (!Array.isArray(attributes)) {
        attributes = [];
      }

      const variants = variantsByProductId[row.id] || [];

      return { ...row, images, attributes, variants };
    });

    return NextResponse.json({
      status: 'success',
      products,
    });
  } catch (error) {
    return NextResponse.json(
      {
        status: 'error',
        message: 'Failed to fetch products',
      },
      { status: 500 }
    );
  }
}

function generateSKU(productName: string, variantValue?: string): string {
  const prefix = productName.substring(0, 3).toUpperCase().replace(/[^A-Z]/g, 'X');
  const variant = variantValue ? variantValue.substring(0, 2).toUpperCase().replace(/[^A-Z0-9]/g, 'X') : 'XX';
  const timestamp = Date.now().toString().slice(-6);
  return `${prefix}-${variant}-${timestamp}`;
}

async function isInventoryV2ProductsCutoverReady(): Promise<boolean> {
  const res = await db.query(
    "SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'inventory_items' AND column_name = 'project_id' LIMIT 1",
  )
  return res.rows.length > 0
}

function toInt(value: any): number | null {
  const n = typeof value === 'number' ? value : parseInt(String(value || ''), 10)
  return Number.isFinite(n) && n > 0 ? n : null
}

function toNum(value: any): number | null {
  if (value == null || value === '') return null
  const n = typeof value === 'number' ? value : parseFloat(String(value || ''))
  return Number.isFinite(n) ? n : null
}

async function assertProjectAccessV2(queryFn: (t: string, p?: any[]) => Promise<{ rows: any[] }>, user: any, projectId: number) {
  if (user.role === 'admin') return

  const access = await queryFn(
    `
    SELECT 1
      FROM project_assignments pa
     WHERE pa.project_id = $1 AND pa.user_id = $2
    UNION
    SELECT 1
      FROM project_assignments pa
      JOIN team_members tm ON tm.team_id = pa.team_id
     WHERE pa.project_id = $1 AND tm.user_id = $2
     LIMIT 1
    `,
    [projectId, user.id],
  )

  if (!access.rows.length) {
    throw new Error('Forbidden')
  }
}

function normalizeJsonArray(value: any): any[] {
  if (Array.isArray(value)) return value
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value)
      return Array.isArray(parsed) ? parsed : []
    } catch {
      return []
    }
  }
  return []
}

async function fetchV2Products(args: {
  user: any
  id?: number | null
  projectId?: number | null
  cycleId?: number | null
}) {
  const { user, id, projectId, cycleId } = args

  const params: any[] = [user.organizationId]
  let i = 1

  let query = `
    SELECT
      ii.id,
      ii.name AS product_name,
      ii.description,
      ii.sku,
      COALESCE(ii.reorder_level, 0) AS reorder_level,
      ii.category,
      ii.project_id,
      ii.project_category_id,
      CASE WHEN ii.is_active THEN 'enabled' ELSE 'disabled' END AS status,
      ii.images,
      ii.attributes
    FROM inventory_items ii
    JOIN inventory_item_types it ON it.id = ii.inventory_item_type_id
    WHERE ii.organization_id = $1
      AND it.code = 'FINISHED_GOODS'
      AND ii.is_active = true
  `

  if (id) {
    i += 1
    query += ` AND ii.id = $${i}`
    params.push(id)
  }

  if (projectId) {
    i += 1
    query += ` AND ii.project_id = $${i}`
    params.push(projectId)
  }

  if (user.role !== 'admin') {
    query += ' AND ii.project_id IS NOT NULL'
    i += 1
    query += ` AND ii.project_id IN (
      SELECT pa.project_id FROM project_assignments pa WHERE pa.user_id = $${i}
      UNION
      SELECT pa.project_id FROM project_assignments pa JOIN team_members tm ON tm.team_id = pa.team_id WHERE tm.user_id = $${i}
    )`
    params.push(user.id)
  }

  query += ' ORDER BY ii.name'

  const itemsRes = await db.query(query, params)
  const products = itemsRes.rows || []
  const itemIds = products.map((p: any) => p.id).filter(Boolean)

  if (!itemIds.length) {
    return []
  }

  const variantsRes = await db.query(
    `
    SELECT
      id,
      inventory_item_id AS product_id,
      label,
      unit_cost,
      selling_price,
      unit_of_measurement,
      images,
      attributes
    FROM inventory_item_variants
    WHERE inventory_item_id = ANY($1::int[])
      AND is_active = true
    ORDER BY id ASC
    `,
    [itemIds],
  )

  const variants = (variantsRes.rows || []).map((v: any) => ({
    ...v,
    images: normalizeJsonArray(v.images),
    attributes: normalizeJsonArray(v.attributes),
  }))

  const variantIds = variants.map((v: any) => v.id).filter(Boolean)

  const balancesRes = (projectId && cycleId && variantIds.length)
    ? await db.query(
        `
        SELECT inventory_item_variant_id, quantity_on_hand
          FROM inventory_balances
         WHERE organization_id = $1
           AND project_id = $2
           AND cycle_id = $3
           AND inventory_item_variant_id = ANY($4::int[])
        `,
        [user.organizationId, projectId, cycleId, variantIds],
      )
    : { rows: [] as any[] }

  const qtyByVariantId = new Map<number, number>()

  for (const b of balancesRes.rows || []) {
    qtyByVariantId.set(Number(b.inventory_item_variant_id), Number(b.quantity_on_hand ?? 0) || 0)
  }

  const variantsByProductId = new Map<number, any[]>()
  for (const v of variants) {
    const pid = Number(v.product_id)
    const vid = Number(v.id)

    const qty = qtyByVariantId.get(vid) ?? 0
    const enriched = {
      ...v,
      quantity_in_stock: qty,
      quantity_on_hand: qty,
    }
    if (!variantsByProductId.has(pid)) variantsByProductId.set(pid, [])
    variantsByProductId.get(pid)!.push(enriched)
  }

  return products.map((p: any) => {
    const vs = variantsByProductId.get(Number(p.id)) || []
    const primary = vs.find((v: any) => String(v.label || '').toLowerCase() === 'default') || vs[0] || null
    const total = vs.reduce((sum: number, v: any) => sum + (Number(v.quantity_in_stock ?? 0) || 0), 0)
    return {
      ...p,
      images: normalizeJsonArray(p.images),
      attributes: normalizeJsonArray(p.attributes),
      cycle_id: cycleId ?? null,
      variants: vs,
      quantity_in_stock: total,
      unit_cost: primary?.unit_cost ?? null,
      selling_price: primary?.selling_price ?? null,
      unit_of_measurement: primary?.unit_of_measurement ?? null,
      variant_name: null,
      variant_value: primary?.label ?? null,
    }
  })
}

async function handleV2ProductsGET(request: NextRequest, user: any) {
  const { searchParams } = new URL(request.url)
  const id = toInt(searchParams.get('id'))
  const projectId = toInt(searchParams.get('project_id'))
  const cycleId = toInt(searchParams.get('cycle_id'))

  const products = await fetchV2Products({ user, id, projectId, cycleId })
  return NextResponse.json({ status: 'success', products })
}

async function handleV2ProductsPOST(request: NextRequest, user: any) {
  const body = await request.json()

  const productName = typeof body.product_name === 'string' ? body.product_name.trim() : ''
  if (!productName) {
    return NextResponse.json({ status: 'error', message: 'product_name is required' }, { status: 400 })
  }

  const projectId = toInt(body.project_id)
  if (!projectId) {
    return NextResponse.json({ status: 'error', message: 'project_id is required' }, { status: 400 })
  }

  try {
    await assertProjectAccessV2(db.query, user, projectId)
  } catch {
    return NextResponse.json({ status: 'error', message: 'Forbidden' }, { status: 403 })
  }

  const projectCategoryId = body.project_category_id == null ? null : (toInt(body.project_category_id) || null)
  const reorderLevel = body.reorder_level == null ? 0 : (parseInt(String(body.reorder_level || '0'), 10) || 0)
  const category = typeof body.category === 'string' ? body.category : null
  const description = typeof body.description === 'string' ? body.description : null
  const status = typeof body.status === 'string' ? body.status : 'enabled'
  const isActive = String(status).toLowerCase() === 'enabled'
  const attributes = Array.isArray(body.attributes) ? body.attributes : []

  const variantsRaw = Array.isArray(body.variants) ? body.variants : []
  const variants = variantsRaw.map((v: any) => ({
    label: typeof v.label === 'string' ? v.label : null,
    unit_cost: toNum(v.unit_cost),
    selling_price: toNum(v.selling_price),
    unit_of_measurement: typeof v.unit_of_measurement === 'string' ? v.unit_of_measurement : null,
    images: Array.isArray(v.images) ? v.images : [],
    attributes: Array.isArray(v.attributes) ? v.attributes : [],
  }))

  const primaryVariant = variants[0] || null
  const sku = generateSKU(productName, primaryVariant?.label || undefined)
  const images = primaryVariant?.images || []
  const imageUrl = typeof images[0] === 'string' ? images[0] : null
  const uom = primaryVariant?.unit_of_measurement || null
  const defaultPurchaseUnitCost = primaryVariant?.unit_cost ?? null
  const defaultSalePrice = primaryVariant?.selling_price ?? null

  const created = await db.transaction(async (tx) => {
    const typeRes = await tx.query("SELECT id FROM inventory_item_types WHERE code = 'FINISHED_GOODS' LIMIT 1")
    const typeId = typeRes.rows[0]?.id
    if (!typeId) throw new Error('FINISHED_GOODS inventory item type not found')

    const ins = await tx.query(
      `
      INSERT INTO inventory_items (
        organization_id,
        inventory_item_type_id,
        project_id,
        project_category_id,
        name,
        sku,
        image_url,
        uom,
        is_active,
        category,
        reorder_level,
        description,
        default_purchase_unit_cost,
        default_sale_price,
        images,
        attributes,
        created_by
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15::jsonb,$16::jsonb,$17)
      RETURNING id
      `,
      [
        user.organizationId,
        typeId,
        projectId,
        projectCategoryId,
        productName,
        sku,
        imageUrl,
        uom,
        isActive,
        category,
        reorderLevel,
        description,
        defaultPurchaseUnitCost,
        defaultSalePrice,
        JSON.stringify(images),
        JSON.stringify(attributes),
        user.id,
      ],
    )

    const itemId = Number(ins.rows[0]?.id || 0) || 0
    if (!itemId) throw new Error('Failed to create product')

    if (variants.length > 0) {
      for (const v of variants) {
        await tx.query(
          `
          INSERT INTO inventory_item_variants (
            inventory_item_id,
            label,
            sku,
            is_active,
            unit_cost,
            selling_price,
            unit_of_measurement,
            images,
            attributes
          ) VALUES ($1,$2,NULL,true,$3,$4,$5,$6::jsonb,$7::jsonb)
          `,
          [
            itemId,
            v.label,
            v.unit_cost,
            v.selling_price,
            v.unit_of_measurement,
            JSON.stringify(v.images || []),
            JSON.stringify(v.attributes || []),
          ],
        )
      }
    } else {
      await tx.query(
        `
        INSERT INTO inventory_item_variants (
          inventory_item_id,
          label,
          sku,
          is_active,
          unit_cost,
          selling_price,
          unit_of_measurement,
          images,
          attributes
        ) VALUES ($1,'Default',NULL,true,NULL,NULL,NULL,'[]'::jsonb,'[]'::jsonb)
        `,
        [itemId],
      )
    }

    return { productId: itemId } as const
  })

  const products = await fetchV2Products({
    user,
    id: (created as any).productId,
    projectId,
    cycleId: toInt(body.cycle_id),
  })
  return NextResponse.json({ status: 'success', product: products[0] || null })
}

async function handleV2ProductsPUT(request: NextRequest, user: any) {
  const body = await request.json()
  const id = toInt(body.id)
  if (!id) {
    return NextResponse.json({ status: 'error', message: 'id is required' }, { status: 400 })
  }

  const existingRes = await db.query(
    `
    SELECT ii.project_id
      FROM inventory_items ii
      JOIN inventory_item_types it ON it.id = ii.inventory_item_type_id
     WHERE ii.id = $1 AND ii.organization_id = $2 AND it.code = 'FINISHED_GOODS'
     LIMIT 1
    `,
    [id, user.organizationId],
  )

  const existing = existingRes.rows[0]
  if (!existing) {
    return NextResponse.json({ status: 'error', message: 'Product not found' }, { status: 404 })
  }

  const existingProjectId = existing.project_id ? Number(existing.project_id) : null
  if (existingProjectId) {
    try {
      await assertProjectAccessV2(db.query, user, existingProjectId)
    } catch {
      return NextResponse.json({ status: 'error', message: 'Forbidden' }, { status: 403 })
    }
  } else if (user.role !== 'admin') {
    return NextResponse.json({ status: 'error', message: 'Forbidden' }, { status: 403 })
  }

  const productName = body.product_name === undefined ? undefined : (typeof body.product_name === 'string' ? body.product_name.trim() : '')
  const description = body.description === undefined ? undefined : (typeof body.description === 'string' ? body.description : null)
  const category = body.category === undefined ? undefined : (typeof body.category === 'string' ? body.category : null)
  const reorderLevel = body.reorder_level === undefined ? undefined : (parseInt(String(body.reorder_level || '0'), 10) || 0)
  const status = body.status === undefined ? undefined : (typeof body.status === 'string' ? body.status : 'enabled')
  const isActive = status === undefined ? undefined : (String(status).toLowerCase() === 'enabled')
  const attributes = body.attributes === undefined ? undefined : (Array.isArray(body.attributes) ? body.attributes : [])
  const projectCategoryId = body.project_category_id === undefined ? undefined : (body.project_category_id == null ? null : (toInt(body.project_category_id) || null))

  const variantsProvided = body.variants !== undefined
  const variantsRaw = Array.isArray(body.variants) ? body.variants : []
  const variants = variantsRaw.map((v: any) => ({
    id: toInt(v.id),
    label: typeof v.label === 'string' ? v.label : null,
    unit_cost: toNum(v.unit_cost),
    selling_price: toNum(v.selling_price),
    unit_of_measurement: typeof v.unit_of_measurement === 'string' ? v.unit_of_measurement : null,
    images: Array.isArray(v.images) ? v.images : [],
    attributes: Array.isArray(v.attributes) ? v.attributes : [],
  }))

  await db.transaction(async (tx) => {
    const fields: string[] = []
    const params: any[] = []
    let p = 0

    if (productName !== undefined) {
      p += 1
      fields.push(`name = $${p}`)
      params.push(productName)
    }
    if (description !== undefined) {
      p += 1
      fields.push(`description = $${p}`)
      params.push(description)
    }
    if (category !== undefined) {
      p += 1
      fields.push(`category = $${p}`)
      params.push(category)
    }
    if (reorderLevel !== undefined) {
      p += 1
      fields.push(`reorder_level = $${p}`)
      params.push(reorderLevel)
    }
    if (isActive !== undefined) {
      p += 1
      fields.push(`is_active = $${p}`)
      params.push(isActive)
    }
    if (attributes !== undefined) {
      p += 1
      fields.push(`attributes = $${p}::jsonb`)
      params.push(JSON.stringify(attributes))
    }
    if (projectCategoryId !== undefined) {
      p += 1
      fields.push(`project_category_id = $${p}`)
      params.push(projectCategoryId)
    }

    if (fields.length > 0) {
      p += 1
      params.push(id)
      p += 1
      params.push(user.organizationId)
      await tx.query(
        `UPDATE inventory_items SET ${fields.join(', ')} WHERE id = $${p - 1} AND organization_id = $${p}`,
        params,
      )
    }

    if (!variantsProvided) {
      return
    }

    const existingVariantsRes = await tx.query(
      'SELECT id FROM inventory_item_variants WHERE inventory_item_id = $1 AND is_active = true',
      [id],
    )
    const existingIds = new Set<number>((existingVariantsRes.rows || []).map((r: any) => Number(r.id)))
    const seen = new Set<number>()

    for (const v of variants) {
      if (v.id && existingIds.has(v.id)) {
        seen.add(v.id)
        await tx.query(
          `
          UPDATE inventory_item_variants
             SET label = $1,
                 unit_cost = $2,
                 selling_price = $3,
                 unit_of_measurement = $4,
                 images = $5::jsonb,
                 attributes = $6::jsonb
           WHERE id = $7
             AND inventory_item_id = $8
          `,
          [
            v.label,
            v.unit_cost,
            v.selling_price,
            v.unit_of_measurement,
            JSON.stringify(v.images || []),
            JSON.stringify(v.attributes || []),
            v.id,
            id,
          ],
        )
      } else {
        const ins = await tx.query(
          `
          INSERT INTO inventory_item_variants (
            inventory_item_id,
            label,
            sku,
            is_active,
            unit_cost,
            selling_price,
            unit_of_measurement,
            images,
            attributes
          ) VALUES ($1,$2,NULL,true,$3,$4,$5,$6::jsonb,$7::jsonb)
          RETURNING id
          `,
          [
            id,
            v.label,
            v.unit_cost,
            v.selling_price,
            v.unit_of_measurement,
            JSON.stringify(v.images || []),
            JSON.stringify(v.attributes || []),
          ],
        )
        const newId = ins.rows[0]?.id
        if (newId) {
          seen.add(Number(newId))
        }
      }
    }

    for (const existingId of Array.from(existingIds)) {
      if (!seen.has(existingId)) {
        await tx.query('UPDATE inventory_item_variants SET is_active = false WHERE id = $1 AND inventory_item_id = $2', [existingId, id])
      }
    }
  })

  const products = await fetchV2Products({ user, id, projectId: existingProjectId, cycleId: toInt(body.cycle_id) })
  return NextResponse.json({ status: 'success', product: products[0] || null })
}

async function handleV2ProductsDELETE(request: NextRequest, user: any) {
  const { searchParams } = new URL(request.url)
  const id = toInt(searchParams.get('id'))
  if (!id) {
    return NextResponse.json({ status: 'error', message: 'id is required' }, { status: 400 })
  }

  const existingRes = await db.query(
    `
    SELECT ii.project_id
      FROM inventory_items ii
      JOIN inventory_item_types it ON it.id = ii.inventory_item_type_id
     WHERE ii.id = $1 AND ii.organization_id = $2 AND it.code = 'FINISHED_GOODS'
     LIMIT 1
    `,
    [id, user.organizationId],
  )
  const projectId = existingRes.rows[0]?.project_id ? Number(existingRes.rows[0]?.project_id) : null
  if (projectId) {
    try {
      await assertProjectAccessV2(db.query, user, projectId)
    } catch {
      return NextResponse.json({ status: 'error', message: 'Forbidden' }, { status: 403 })
    }
  } else if (user.role !== 'admin') {
    return NextResponse.json({ status: 'error', message: 'Forbidden' }, { status: 403 })
  }

  await db.transaction(async (tx) => {
    await tx.query('UPDATE inventory_items SET is_active = false WHERE id = $1 AND organization_id = $2', [id, user.organizationId])
    await tx.query('UPDATE inventory_item_variants SET is_active = false WHERE inventory_item_id = $1', [id])
  })

  return NextResponse.json({ status: 'success', message: 'Product deleted successfully' })
}

async function getInventoryV2Support(): Promise<{
  enabled: boolean
  productsHasInventoryItemId: boolean
  productsHasDefaultVariant: boolean
  variantsHasInventoryVariantId: boolean
}> {
  const enabledRes = await db.query(
    "SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'inventory_balances' LIMIT 1",
  )

  const enabled = enabledRes.rows.length > 0
  if (!enabled) {
    return {
      enabled: false,
      productsHasInventoryItemId: false,
      productsHasDefaultVariant: false,
      variantsHasInventoryVariantId: false,
    }
  }

  const cols = await db.query(
    "SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = 'public' AND ((table_name = 'products' AND column_name IN ('inventory_item_id','inventory_item_variant_id')) OR (table_name = 'product_variants' AND column_name IN ('inventory_item_variant_id'))) ",
  )

  const set = new Set<string>(cols.rows.map((r: any) => `${String(r.table_name)}.${String(r.column_name)}`))

  return {
    enabled: true,
    productsHasInventoryItemId: set.has('products.inventory_item_id'),
    productsHasDefaultVariant: set.has('products.inventory_item_variant_id'),
    variantsHasInventoryVariantId: set.has('product_variants.inventory_item_variant_id'),
  }
}

async function ensureFinishedGoodsInventoryV2Mapping(args: {
  organizationId: number
  createdBy: number
  product: any
  productVariants: Array<{ id: number; label?: string | null; unit_cost?: number | null; selling_price?: number | null }>
}) {
  const v2 = await getInventoryV2Support()
  if (!v2.enabled || !v2.productsHasInventoryItemId) return

  const productId = Number(args.product?.id || 0) || 0
  if (!productId) return

  const { rows: typeRows } = await db.query(
    "SELECT id FROM inventory_item_types WHERE code = 'FINISHED_GOODS' LIMIT 1",
  )
  const fgTypeId = Number(typeRows[0]?.id || 0) || 0
  if (!fgTypeId) return

  const name = args.product?.product_name || null
  const sku = args.product?.sku || null
  const description = args.product?.description || null
  const uom = args.product?.unit_of_measurement || null
  const imageUrl = args.product?.images || null
  const isActive = (String(args.product?.status || 'enabled') || 'enabled') === 'enabled'
  const defaultPurchaseUnitCost = args.product?.unit_cost ?? null
  const defaultSalePrice = args.product?.selling_price ?? null

  await db.query(
    `
    INSERT INTO inventory_items (
      organization_id,
      inventory_item_type_id,
      name,
      sku,
      image_url,
      uom,
      is_active,
      default_purchase_unit_cost,
      default_sale_price,
      description,
      created_by,
      source_product_id
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
    ON CONFLICT (source_product_id)
    DO UPDATE SET
      name = EXCLUDED.name,
      sku = EXCLUDED.sku,
      image_url = EXCLUDED.image_url,
      uom = EXCLUDED.uom,
      is_active = EXCLUDED.is_active,
      default_purchase_unit_cost = EXCLUDED.default_purchase_unit_cost,
      default_sale_price = EXCLUDED.default_sale_price,
      description = EXCLUDED.description,
      updated_at = NOW()
    `,
    [
      args.organizationId,
      fgTypeId,
      name,
      sku,
      imageUrl,
      uom,
      isActive,
      defaultPurchaseUnitCost,
      defaultSalePrice,
      description,
      args.createdBy,
      productId,
    ],
  )

  const { rows: invItemRows } = await db.query(
    'SELECT id FROM inventory_items WHERE source_product_id = $1 LIMIT 1',
    [productId],
  )
  const inventoryItemId = Number(invItemRows[0]?.id || 0) || 0
  if (!inventoryItemId) return

  await db.query('UPDATE products SET inventory_item_id = $1 WHERE id = $2 AND organization_id = $3', [
    inventoryItemId,
    productId,
    args.organizationId,
  ])

  if (v2.productsHasDefaultVariant) {
    const { rows: existingDefaultRows } = await db.query(
      `
      SELECT id
        FROM inventory_item_variants
       WHERE inventory_item_id = $1
         AND source_product_variant_id IS NULL
         AND COALESCE(label, '') = 'Default'
       ORDER BY id ASC
       LIMIT 1
      `,
      [inventoryItemId],
    )

    let defaultVariantId = Number(existingDefaultRows[0]?.id || 0) || 0
    if (!defaultVariantId) {
      const { rows: insertedDefaultRows } = await db.query(
        `
        INSERT INTO inventory_item_variants (
          inventory_item_id,
          label,
          sku,
          is_active,
          unit_cost,
          selling_price,
          source_product_variant_id
        ) VALUES ($1,$2,$3,$4,$5,$6,$7)
        RETURNING id
        `,
        [inventoryItemId, 'Default', sku, true, defaultPurchaseUnitCost, defaultSalePrice, null],
      )
      defaultVariantId = Number(insertedDefaultRows[0]?.id || 0) || 0
    }

    if (defaultVariantId) {
      await db.query(
        'UPDATE products SET inventory_item_variant_id = $1 WHERE id = $2 AND organization_id = $3',
        [defaultVariantId, productId, args.organizationId],
      )
    }
  }

  if (!v2.variantsHasInventoryVariantId) return

  for (const pv of args.productVariants || []) {
    const pvId = Number(pv?.id || 0) || 0
    if (!pvId) continue

    await db.query(
      `
      INSERT INTO inventory_item_variants (
        inventory_item_id,
        label,
        sku,
        is_active,
        unit_cost,
        selling_price,
        source_product_variant_id
      ) VALUES ($1,$2,$3,$4,$5,$6,$7)
      ON CONFLICT (source_product_variant_id)
      DO UPDATE SET
        label = EXCLUDED.label,
        is_active = EXCLUDED.is_active,
        unit_cost = EXCLUDED.unit_cost,
        selling_price = EXCLUDED.selling_price
      `,
      [
        inventoryItemId,
        pv.label || null,
        null,
        true,
        pv.unit_cost ?? null,
        pv.selling_price ?? null,
        pvId,
      ],
    )

    const { rows: invVarRows } = await db.query(
      'SELECT id FROM inventory_item_variants WHERE source_product_variant_id = $1 LIMIT 1',
      [pvId],
    )
    const invVarId = Number(invVarRows[0]?.id || 0) || 0
    if (!invVarId) continue

    await db.query(
      'UPDATE product_variants SET inventory_item_variant_id = $1 WHERE id = $2',
      [invVarId, pvId],
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getApiOrSessionUser(request);

    if (!user?.organizationId) {
      return NextResponse.json({ status: 'error', message: 'API key required' }, { status: 401 });
    }
    const { organizationId, id: userId } = user;

    if (await isInventoryV2ProductsCutoverReady()) {
      return await handleV2ProductsPOST(request, user)
    }

    const body = await request.json();
    const { product_name, description, reorder_level, category, variants, project_id, cycle_id, project_category_id, status, attributes } = body;

    if (user.role !== 'admin') {
      if (!project_id) {
        return NextResponse.json({ status: 'error', message: 'Forbidden' }, { status: 403 });
      }

      const access = await db.query(
        `
        SELECT 1
          FROM project_assignments pa
         WHERE pa.project_id = $1 AND pa.user_id = $2
        UNION
        SELECT 1
          FROM project_assignments pa
          JOIN team_members tm ON tm.team_id = pa.team_id
         WHERE pa.project_id = $1 AND tm.user_id = $2
         LIMIT 1
        `,
        [project_id, userId],
      );

      if (!access.rows.length) {
        return NextResponse.json({ status: 'error', message: 'Forbidden' }, { status: 403 });
      }
    }

    const safeVariants = Array.isArray(variants) ? variants : [];
    const primaryVariant = safeVariants[0] || {};
    const sku = generateSKU(product_name, primaryVariant.variant_value);
    const safeAttributes = Array.isArray(attributes) ? attributes : [];

    // Stock is managed through inventory flows; always start new products at 0.
    const initialStock = 0;

    const result = await db.query(
      'INSERT INTO products (product_name, description, sku, unit_cost, selling_price, quantity_in_stock, reorder_level, category, variant_name, variant_value, unit_of_measurement, images, project_id, cycle_id, project_category_id, organization_id, created_by, status, attributes) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19) RETURNING *',
      [
        product_name,
        description || null,
        sku,
        primaryVariant.unit_cost || null,
        primaryVariant.selling_price || null,
        initialStock,
        reorder_level || 0,
        category || null,
        primaryVariant.variant_name || null,
        primaryVariant.variant_value || null,
        primaryVariant.unit_of_measurement || null,
        JSON.stringify(primaryVariant.images || []),
        project_id || null,
        cycle_id || null,
        project_category_id || null,
        organizationId,
        userId,
        status || 'enabled',
        JSON.stringify(safeAttributes),
      ]
    );

    const product = result.rows[0];

    const createdProductVariants: Array<{ id: number; label?: string | null; unit_cost?: number | null; selling_price?: number | null }> = []

    // Persist all variants into product_variants table
    if (safeVariants.length > 0) {
      for (const v of safeVariants) {
        const variantImages = JSON.stringify(v.images || []);
        const variantAttributes = JSON.stringify(Array.isArray(v.attributes) ? v.attributes : []);

        const pvRes = await db.query(
          'INSERT INTO product_variants (product_id, label, unit_cost, selling_price, quantity_in_stock, unit_of_measurement, images, attributes) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id, label, unit_cost, selling_price',
          [
            product.id,
            v.label || null,
            v.unit_cost || null,
            v.selling_price || null,
            0,
            v.unit_of_measurement || null,
            variantImages,
            variantAttributes,
          ]
        );

        const pvRow = pvRes.rows?.[0]
        if (pvRow?.id) {
          createdProductVariants.push({
            id: pvRow.id,
            label: pvRow.label ?? null,
            unit_cost: pvRow.unit_cost ?? null,
            selling_price: pvRow.selling_price ?? null,
          })
        }
      }
    }

    await ensureFinishedGoodsInventoryV2Mapping({
      organizationId,
      createdBy: userId,
      product,
      productVariants: createdProductVariants,
    })

    return NextResponse.json({
      status: 'success',
      product,
    });
  } catch (error) {
    console.error('Product creation error:', error);
    return NextResponse.json({
      status: 'error',
      message: 'Failed to create product',
    }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const user = await getApiOrSessionUser(request);

    if (!user?.organizationId) {
      return NextResponse.json({ status: 'error', message: 'API key required' }, { status: 401 });
    }
    const { organizationId } = user;

    if (await isInventoryV2ProductsCutoverReady()) {
      return await handleV2ProductsPUT(request, user)
    }

    const body = await request.json();
    const { id, product_name, description, reorder_level, category, variants, project_id, cycle_id, project_category_id, status, attributes } = body;

    if (user.role !== 'admin') {
      const existing = await db.query(
        'SELECT project_id FROM products WHERE id = $1 AND organization_id = $2',
        [id, organizationId],
      );
      if (!existing.rows.length) {
        return NextResponse.json({ status: 'error', message: 'Forbidden' }, { status: 403 });
      }

      const targetProjectId = project_id ?? existing.rows[0]?.project_id;
      if (!targetProjectId) {
        return NextResponse.json({ status: 'error', message: 'Forbidden' }, { status: 403 });
      }

      const access = await db.query(
        `
        SELECT 1
          FROM project_assignments pa
         WHERE pa.project_id = $1 AND pa.user_id = $2
        UNION
        SELECT 1
          FROM project_assignments pa
          JOIN team_members tm ON tm.team_id = pa.team_id
         WHERE pa.project_id = $1 AND tm.user_id = $2
         LIMIT 1
        `,
        [targetProjectId, user.id],
      );

      if (!access.rows.length) {
        return NextResponse.json({ status: 'error', message: 'Forbidden' }, { status: 403 });
      }
    }

    const safeVariants = Array.isArray(variants) ? variants : [];
    const primaryVariant = safeVariants[0] || {};
    const safeAttributes = Array.isArray(attributes) ? attributes : [];

    const existingProductRes = await db.query(
      'SELECT quantity_in_stock FROM products WHERE id = $1 AND organization_id = $2',
      [id, organizationId],
    );
    const existingProductStock = existingProductRes.rows[0]?.quantity_in_stock ?? 0;

    const result = await db.query(
      'UPDATE products SET product_name = $1, description = $2, unit_cost = $3, selling_price = $4, quantity_in_stock = $5, reorder_level = $6, category = $7, variant_name = $8, variant_value = $9, unit_of_measurement = $10, images = $11, project_id = $12, cycle_id = $13, project_category_id = $14, status = $15, attributes = $16 WHERE id = $17 AND organization_id = $18 RETURNING *',
      [
        product_name,
        description,
        primaryVariant.unit_cost,
        primaryVariant.selling_price,
        existingProductStock,
        reorder_level,
        category,
        primaryVariant.variant_name,
        primaryVariant.variant_value,
        primaryVariant.unit_of_measurement,
        JSON.stringify(primaryVariant.images || []),
        project_id,
        cycle_id,
        project_category_id,
        status || 'enabled',
        JSON.stringify(safeAttributes),
        id,
        organizationId,
      ]
    );

    const product = result.rows[0];

    if (!product) {
      return NextResponse.json(
        {
          status: 'error',
          message: 'Product not found',
        },
        { status: 404 }
      );
    }

    const touchedVariantRows: Array<{ id: number; label?: string | null; unit_cost?: number | null; selling_price?: number | null }> = []
    const deletedVariantIds: number[] = []

    // Upsert variants instead of delete+reinsert so we preserve stock quantities.
    if (safeVariants.length > 0) {
      const existingVariantsRes = await db.query(
        'SELECT id, quantity_in_stock FROM product_variants WHERE product_id = $1',
        [id],
      );
      const existingVariantsById = new Map<number, number>();
      for (const row of existingVariantsRes.rows) {
        existingVariantsById.set(row.id, row.quantity_in_stock ?? 0);
      }

      const seenVariantIds = new Set<number>();

      for (const v of safeVariants) {
        const imagesJson = JSON.stringify(v.images || []);
        const attributesJson = JSON.stringify(Array.isArray(v.attributes) ? v.attributes : []);

        if (v.id) {
          seenVariantIds.add(v.id);
          const existingStock = existingVariantsById.get(v.id) ?? 0;
          await db.query(
            'UPDATE product_variants SET label = $1, unit_cost = $2, selling_price = $3, quantity_in_stock = $4, unit_of_measurement = $5, images = $6, attributes = $7 WHERE id = $8 AND product_id = $9',
            [
              v.label || null,
              v.unit_cost || null,
              v.selling_price || null,
              existingStock,
              v.unit_of_measurement || null,
              imagesJson,
              attributesJson,
              v.id,
              id,
            ],
          );

          touchedVariantRows.push({
            id: v.id,
            label: v.label || null,
            unit_cost: v.unit_cost ?? null,
            selling_price: v.selling_price ?? null,
          })
        } else {
          const inserted = await db.query(
            'INSERT INTO product_variants (product_id, label, unit_cost, selling_price, quantity_in_stock, unit_of_measurement, images, attributes) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id, label, unit_cost, selling_price',
            [
              id,
              v.label || null,
              v.unit_cost || null,
              v.selling_price || null,
              0,
              v.unit_of_measurement || null,
              imagesJson,
              attributesJson,
            ],
          );

          const newId = inserted.rows?.[0]?.id
          if (newId) {
            touchedVariantRows.push({
              id: newId,
              label: inserted.rows?.[0]?.label ?? null,
              unit_cost: inserted.rows?.[0]?.unit_cost ?? null,
              selling_price: inserted.rows?.[0]?.selling_price ?? null,
            })
          }
        }
      }

      // Remove variants that were deleted in the UI
      for (const existingId of Array.from(existingVariantsById.keys())) {
        if (!seenVariantIds.has(existingId)) {
          deletedVariantIds.push(existingId)
          await db.query('DELETE FROM product_variants WHERE id = $1 AND product_id = $2', [existingId, id]);
        }
      }
    }

    for (const deletedId of deletedVariantIds) {
      await db.query(
        'UPDATE inventory_item_variants SET is_active = false WHERE source_product_variant_id = $1',
        [deletedId],
      ).catch(() => null)
    }

    const { rows: refreshed } = await db.query('SELECT * FROM products WHERE id = $1 AND organization_id = $2 LIMIT 1', [id, organizationId])
    const refreshedProduct = refreshed?.[0] || product

    await ensureFinishedGoodsInventoryV2Mapping({
      organizationId,
      createdBy: user.id,
      product: refreshedProduct,
      productVariants: touchedVariantRows,
    })

    return NextResponse.json({
      status: 'success',
      product,
    });
  } catch (error) {
    console.error('Product update error:', error);
    return NextResponse.json({
      status: 'error',
      message: 'Failed to update product',
    }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const user = await getApiOrSessionUser(request);
    if (!user?.organizationId) {
      return NextResponse.json({ status: 'error', message: 'API key required' }, { status: 401 });
    }
    const { organizationId } = user;

    if (await isInventoryV2ProductsCutoverReady()) {
      return await handleV2ProductsDELETE(request, user)
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (user.role !== 'admin') {
      const existing = await db.query(
        'SELECT project_id FROM products WHERE id = $1 AND organization_id = $2',
        [id, organizationId],
      );
      const project_id = existing.rows[0]?.project_id;
      if (!project_id) {
        return NextResponse.json({ status: 'error', message: 'Forbidden' }, { status: 403 });
      }

      const access = await db.query(
        `
        SELECT 1
          FROM project_assignments pa
         WHERE pa.project_id = $1 AND pa.user_id = $2
        UNION
        SELECT 1
          FROM project_assignments pa
          JOIN team_members tm ON tm.team_id = pa.team_id
         WHERE pa.project_id = $1 AND tm.user_id = $2
         LIMIT 1
        `,
        [project_id, user.id],
      );

      if (!access.rows.length) {
        return NextResponse.json({ status: 'error', message: 'Forbidden' }, { status: 403 });
      }
    }

    await db.query('DELETE FROM products WHERE id = $1 AND organization_id = $2', [id, organizationId]);

    return NextResponse.json({
      status: 'success',
      message: 'Product deleted successfully',
    });
  } catch (error) {
    return NextResponse.json({ 
      status: 'error', 
      message: 'Failed to delete product' 
    }, { status: 500 })
  }
}