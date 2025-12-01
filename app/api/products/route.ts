import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/database'
import { getSessionUser } from '@/lib/api-auth'

export async function GET(request: NextRequest) {
  try {
    const sessionUser = await getSessionUser(request);
    if (!sessionUser?.organizationId) {
      return NextResponse.json({ status: 'error', message: 'Authentication required' }, { status: 401 });
    }
    const { organizationId } = sessionUser;

    const result = await db.query(
      'SELECT * FROM products WHERE organization_id = $1 ORDER BY product_name',
      [organizationId]
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
    const sessionUser = await getSessionUser(request);
    if (!sessionUser?.organizationId) {
      return NextResponse.json({ status: 'error', message: 'Authentication required' }, { status: 401 });
    }
    const { organizationId, id: userId } = sessionUser;

    const body = await request.json();
    const { product_name, description, reorder_level, category, variants, project_id, cycle_id, project_category_id, status, attributes } = body;
    const safeVariants = Array.isArray(variants) ? variants : [];
    const primaryVariant = safeVariants[0] || {};
    const sku = generateSKU(product_name, primaryVariant.variant_value);
    const safeAttributes = Array.isArray(attributes) ? attributes : [];
    
    const result = await db.query(
      'INSERT INTO products (product_name, description, sku, unit_cost, selling_price, quantity_in_stock, reorder_level, category, variant_name, variant_value, unit_of_measurement, images, project_id, cycle_id, project_category_id, organization_id, created_by, status, attributes) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19) RETURNING *',
      [
        product_name,
        description || null,
        sku,
        primaryVariant.unit_cost || null,
        primaryVariant.selling_price || null,
        primaryVariant.quantity_in_stock || 0,
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
    )

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
            v.quantity_in_stock || 0,
            v.unit_of_measurement || null,
            variantImages,
            variantAttributes,
          ]
        );
      }
    }

    return NextResponse.json({ 
      status: 'success', 
      product
    })
  } catch (error) {
    console.error('Product creation error:', error)
    return NextResponse.json({ 
      status: 'error', 
      message: 'Failed to create product' 
    }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  try {
    const sessionUser = await getSessionUser(request);
    if (!sessionUser?.organizationId) {
      return NextResponse.json({ status: 'error', message: 'Authentication required' }, { status: 401 });
    }
    const { organizationId } = sessionUser;

    const body = await request.json();
    const { id, product_name, description, reorder_level, category, variants, project_id, cycle_id, project_category_id, status, attributes } = body;
    const safeVariants = Array.isArray(variants) ? variants : [];
    const primaryVariant = safeVariants[0] || {};
    const safeAttributes = Array.isArray(attributes) ? attributes : [];
    
    const result = await db.query(
      'UPDATE products SET product_name = $1, description = $2, unit_cost = $3, selling_price = $4, quantity_in_stock = $5, reorder_level = $6, category = $7, variant_name = $8, variant_value = $9, unit_of_measurement = $10, images = $11, project_id = $12, cycle_id = $13, project_category_id = $14, status = $15, attributes = $16 WHERE id = $17 AND organization_id = $18 RETURNING *',
      [
        product_name,
        description,
        primaryVariant.unit_cost,
        primaryVariant.selling_price,
        primaryVariant.quantity_in_stock,
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
    )

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

    // Replace existing variants with the new set
    await db.query('DELETE FROM product_variants WHERE product_id = $1', [id]);

    if (safeVariants.length > 0) {
      for (const v of safeVariants) {
        const imagesJson = JSON.stringify(v.images || []);
        const attributesJson = JSON.stringify(Array.isArray(v.attributes) ? v.attributes : []);

        await db.query(
          'INSERT INTO product_variants (product_id, label, unit_cost, selling_price, quantity_in_stock, unit_of_measurement, images, attributes) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)',
          [
            id,
            v.label || null,
            v.unit_cost || null,
            v.selling_price || null,
            v.quantity_in_stock || 0,
            v.unit_of_measurement || null,
            imagesJson,
            attributesJson,
          ]
        );
      }
    }

    return NextResponse.json({
      status: 'success',
      product,
    })
  } catch (error) {
    console.error('Product update error:', error)
    return NextResponse.json({ 
      status: 'error', 
      message: 'Failed to update product' 
    }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const sessionUser = await getSessionUser(request);
    if (!sessionUser?.organizationId) {
      return NextResponse.json({ status: 'error', message: 'Authentication required' }, { status: 401 });
    }
    const { organizationId } = sessionUser;

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    
    await db.query('DELETE FROM products WHERE id = $1 AND organization_id = $2', [id, organizationId])
    
    return NextResponse.json({ 
      status: 'success', 
      message: 'Product deleted successfully' 
    })
  } catch (error) {
    return NextResponse.json({ 
      status: 'error', 
      message: 'Failed to delete product' 
    }, { status: 500 })
  }
}