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

    const result = user.role === 'admin'
      ? await db.query(
          `
          SELECT *
            FROM products
           WHERE organization_id = $1
             AND ($2::int IS NULL OR id = $2::int)
           ORDER BY product_name
          `,
          [organizationId, id ? parseInt(id, 10) : null]
        )
      : await db.query(
          `
          SELECT *
            FROM products
           WHERE organization_id = $1
             AND ($3::int IS NULL OR id = $3::int)
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
          [organizationId, user.id, id ? parseInt(id, 10) : null]
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

export async function POST(request: NextRequest) {
  try {
    const user = await getApiOrSessionUser(request);
    if (!user?.organizationId) {
      return NextResponse.json({ status: 'error', message: 'API key required' }, { status: 401 });
    }
    const { organizationId, id: userId } = user;

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

    // Persist all variants into product_variants table
    if (safeVariants.length > 0) {
      for (const v of safeVariants) {
        const variantImages = JSON.stringify(v.images || []);
        const variantAttributes = JSON.stringify(Array.isArray(v.attributes) ? v.attributes : []);

        await db.query(
          'INSERT INTO product_variants (product_id, label, unit_cost, selling_price, quantity_in_stock, unit_of_measurement, images, attributes) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)',
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
      }
    }

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
        } else {
          await db.query(
            'INSERT INTO product_variants (product_id, label, unit_cost, selling_price, quantity_in_stock, unit_of_measurement, images, attributes) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)',
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
        }
      }

      // Remove variants that were deleted in the UI
      for (const existingId of Array.from(existingVariantsById.keys())) {
        if (!seenVariantIds.has(existingId)) {
          await db.query('DELETE FROM product_variants WHERE id = $1 AND product_id = $2', [existingId, id]);
        }
      }
    }

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