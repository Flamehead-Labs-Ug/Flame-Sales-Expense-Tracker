import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/database'
import { getSessionUser } from '@/lib/api-auth'
import { computeAmountInOrgCurrency } from '@/lib/org-currency'

export async function GET(request: Request) {
  try {
    const sessionUser = await getSessionUser(request as NextRequest);
    if (!sessionUser?.organizationId) {
      return NextResponse.json({ status: 'error', message: 'Authentication required' }, { status: 401 });
    }
    const { organizationId } = sessionUser;
    
    const { searchParams } = new URL(request.url)
    const projectId = searchParams.get('project_id')
    
    let query = 'SELECT id, project_id, cycle_id, product_id, variant_id, customer_name AS customer, quantity, unit_cost, price, status, cash_at_hand, balance, amount, sale_date, created_by, organization_id FROM sales WHERE organization_id = $1'
    let params: any[] = [organizationId]
    
    if (projectId) {
      query += ' AND project_id = $2'
      params.push(projectId)
    }
    
    query += ' ORDER BY sale_date DESC LIMIT 100'
    
    const result = await db.query(query, params)
    return NextResponse.json({ 
      status: 'success', 
      sales: result.rows 
    })
  } catch (error) {
    console.error('Failed to fetch sales:', error);
    return NextResponse.json({ 
      status: 'error', 
      message: 'Failed to fetch sales' 
    }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const sessionUser = await getSessionUser(request);
    if (!sessionUser?.organizationId) {
      throw new Error('Authentication required');
    }
    const { organizationId, id: userId } = sessionUser;

    const body = await request.json();
    const { project_id, cycle_id, product_id, variant_id, customer, quantity, unit_cost, price, status, sale_date, cash_at_hand, balance } = body;

    const safeQuantity = typeof quantity === 'number' ? quantity : parseInt(quantity || '0', 10) || 0;
    const safeUnitCost = typeof unit_cost === 'number' ? unit_cost : parseFloat(unit_cost || '0') || 0;
    const safePrice = typeof price === 'number' ? price : parseFloat(price || '0') || 0;
    const safeCashAtHand = typeof cash_at_hand === 'number' ? cash_at_hand : parseFloat(cash_at_hand || '0') || 0;
    const safeBalance = typeof balance === 'number' ? balance : parseFloat(balance || '0') || 0;
    const amount = safeQuantity * safePrice;
    const amountOrgCcy = await computeAmountInOrgCurrency(organizationId, project_id || null, amount);

    let customerId: number | null = null;
    if (customer && typeof customer === 'string' && customer.trim()) {
      const customerRes = await client.query(
        `INSERT INTO customers (name, organization_id)
         VALUES ($1, $2)
         ON CONFLICT (organization_id, name) DO UPDATE SET name = EXCLUDED.name
         RETURNING id`,
        [customer.trim(), organizationId]
      );
      customerId = customerRes.rows[0]?.id ?? null;
    }

    // Insert the sale
    const saleResult = await client.query(
      'INSERT INTO sales (project_id, cycle_id, product_id, variant_id, customer_name, customer_id, quantity, unit_cost, price, status, cash_at_hand, balance, amount, amount_org_ccy, sale_date, organization_id, created_by) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17) RETURNING *',
      [
        project_id || null,
        cycle_id || null,
        product_id || null,
        variant_id || null,
        customer || null,
        customerId,
        safeQuantity,
        safeUnitCost,
        safePrice,
        status || 'pending',
        safeCashAtHand,
        safeBalance,
        amount,
        amountOrgCcy,
        sale_date || null,
        organizationId,
        userId
      ]
    );

    // Reduce stock. If we have both product_id and variant_id, update both.
    // If only one is present, still update whichever we can.
    if (safeQuantity > 0) {
      if (product_id) {
        const productUpdate = await client.query(
          'UPDATE products SET quantity_in_stock = quantity_in_stock - $1 WHERE id = $2 AND organization_id = $3 RETURNING id',
          [safeQuantity, product_id, organizationId]
        );
        if (productUpdate.rowCount === 0) {
          throw new Error('Failed to update product stock. Product not found or permission denied.');
        }
      }

      if (variant_id) {
        const variantUpdate = await client.query(
          'UPDATE product_variants SET quantity_in_stock = quantity_in_stock - $1 WHERE id = $2 RETURNING id',
          [safeQuantity, variant_id]
        );
        if (variantUpdate.rowCount === 0) {
          throw new Error('Failed to update product variant stock. Variant not found.');
        }
      }
    }

    await client.query('COMMIT');
    return NextResponse.json({ status: 'success', sale: saleResult.rows[0] });

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Sale creation error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to create sale';
    return NextResponse.json({ status: 'error', message: errorMessage }, { status: 500 });
  } finally {
    client.release();
  }
}

export async function PUT(request: NextRequest) {
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const sessionUser = await getSessionUser(request);
    if (!sessionUser?.organizationId) {
      throw new Error('Authentication required');
    }
    const { organizationId } = sessionUser;

    const body = await request.json();
    const { id, project_id, cycle_id, product_id, variant_id, customer, quantity, unit_cost, price, status, sale_date, cash_at_hand, balance } = body;

    // Get the original sale to calculate stock adjustment
    const originalSaleResult = await client.query('SELECT quantity, product_id, variant_id, customer_id FROM sales WHERE id = $1 AND organization_id = $2', [id, organizationId]);
    if (originalSaleResult.rows.length === 0) {
      throw new Error('Sale not found');
    }
    const originalSale = originalSaleResult.rows[0];
    const originalQuantity = originalSale.quantity;
    const originalProductId = originalSale.product_id as number | null;
    const originalVariantId = originalSale.variant_id as number | null;
    const originalCustomerId = originalSale.customer_id as number | null;

    const safeQuantity = typeof quantity === 'number' ? quantity : parseInt(quantity || '0', 10) || 0;
    const quantityDifference = safeQuantity - originalQuantity;

    const safeUnitCost = typeof unit_cost === 'number' ? unit_cost : parseFloat(unit_cost || '0') || 0;
    const safePrice = typeof price === 'number' ? price : parseFloat(price || '0') || 0;
    const safeCashAtHand = typeof cash_at_hand === 'number' ? cash_at_hand : parseFloat(cash_at_hand || '0') || 0;
    const safeBalance = typeof balance === 'number' ? balance : parseFloat(balance || '0') || 0;
    const amount = safeQuantity * safePrice;
    const amountOrgCcy = await computeAmountInOrgCurrency(organizationId, project_id || null, amount);

    let customerId: number | null = originalCustomerId;
    if (customer && typeof customer === 'string' && customer.trim()) {
      const customerRes = await client.query(
        `INSERT INTO customers (name, organization_id)
         VALUES ($1, $2)
         ON CONFLICT (organization_id, name) DO UPDATE SET name = EXCLUDED.name
         RETURNING id`,
        [customer.trim(), organizationId]
      );
      customerId = customerRes.rows[0]?.id ?? null;
    }

    // Update the sale
    const saleResult = await client.query(
      'UPDATE sales SET project_id = $1, cycle_id = $2, product_id = $3, variant_id = $4, customer_name = $5, customer_id = $6, quantity = $7, unit_cost = $8, price = $9, status = $10, cash_at_hand = $11, balance = $12, amount = $13, amount_org_ccy = $14, sale_date = $15 WHERE id = $16 AND organization_id = $17 RETURNING *',
      [
        project_id || null,
        cycle_id || null,
        product_id || null,
        variant_id || null,
        customer || null,
        customerId,
        safeQuantity,
        safeUnitCost,
        safePrice,
        status || 'pending',
        safeCashAtHand,
        safeBalance,
        amount,
        amountOrgCcy,
        sale_date || null,
        id,
        organizationId
      ]
    );

    // Adjust stock based on changes.
    // If both product and variant are unchanged, apply the quantity difference only.
    if (originalProductId === product_id && originalVariantId === variant_id) {
      if (quantityDifference !== 0 && product_id) {
        const productUpdate = await client.query(
          'UPDATE products SET quantity_in_stock = quantity_in_stock - $1 WHERE id = $2 AND organization_id = $3 RETURNING id',
          [quantityDifference, product_id, organizationId]
        );
        if (productUpdate.rowCount === 0) {
          throw new Error('Failed to update product stock. Product not found or permission denied.');
        }

        if (variant_id) {
          const variantUpdate = await client.query(
            'UPDATE product_variants SET quantity_in_stock = quantity_in_stock - $1 WHERE id = $2 RETURNING id',
            [quantityDifference, variant_id]
          );
          if (variantUpdate.rowCount === 0) {
            throw new Error('Failed to update product variant stock. Variant not found.');
          }
        }
      }
    } else {
      // Product and/or variant changed.
      // 1) Restore stock for the original sale.
      if (originalProductId && originalQuantity > 0) {
        const restoreProduct = await client.query(
          'UPDATE products SET quantity_in_stock = quantity_in_stock + $1 WHERE id = $2 AND organization_id = $3 RETURNING id',
          [originalQuantity, originalProductId, organizationId]
        );
        if (restoreProduct.rowCount === 0) {
          throw new Error('Failed to restore stock for the original product.');
        }

        if (originalVariantId) {
          const restoreVariant = await client.query(
            'UPDATE product_variants SET quantity_in_stock = quantity_in_stock + $1 WHERE id = $2 RETURNING id',
            [originalQuantity, originalVariantId]
          );
          if (restoreVariant.rowCount === 0) {
            throw new Error('Failed to restore stock for the original product variant.');
          }
        }
      }

      // 2) Apply stock reduction for the new sale values.
      if (product_id && safeQuantity > 0) {
        const deductProduct = await client.query(
          'UPDATE products SET quantity_in_stock = quantity_in_stock - $1 WHERE id = $2 AND organization_id = $3 RETURNING id',
          [safeQuantity, product_id, organizationId]
        );
        if (deductProduct.rowCount === 0) {
          throw new Error('Failed to deduct stock for the new product.');
        }

        if (variant_id) {
          const deductVariant = await client.query(
            'UPDATE product_variants SET quantity_in_stock = quantity_in_stock - $1 WHERE id = $2 RETURNING id',
            [safeQuantity, variant_id]
          );
          if (deductVariant.rowCount === 0) {
            throw new Error('Failed to deduct stock for the new product variant.');
          }
        }
      }
    }

    await client.query('COMMIT');
    return NextResponse.json({ status: 'success', sale: saleResult.rows[0] });

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Sale update error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to update sale';
    return NextResponse.json({ status: 'error', message: errorMessage }, { status: 500 });
  } finally {
    client.release();
  }
}

export async function DELETE(request: NextRequest) {
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')
    
    const sessionUser = await getSessionUser(request);
    if (!sessionUser?.organizationId) {
      throw new Error('Authentication required');
    }
    const { organizationId } = sessionUser;

    // Get the sale to restore stock
    const saleResult = await client.query('SELECT product_id, variant_id, quantity FROM sales WHERE id = $1 AND organization_id = $2', [id, organizationId]);
    if (saleResult.rows.length === 0) {
      throw new Error('Sale not found');
    }
    const { product_id, variant_id, quantity } = saleResult.rows[0];

    // Restore stock on the main product row and its specific variant (if any)
    if (product_id && quantity > 0) {
      const updateResult = await client.query(
        'UPDATE products SET quantity_in_stock = quantity_in_stock + $1 WHERE id = $2 AND organization_id = $3 RETURNING id',
        [quantity, product_id, organizationId]
      );
      if (updateResult.rowCount === 0) {
        throw new Error('Failed to restore product stock. Product not found or permission denied.');
      }

      if (variant_id) {
        const variantUpdate = await client.query(
          'UPDATE product_variants SET quantity_in_stock = quantity_in_stock + $1 WHERE id = $2 RETURNING id',
          [quantity, variant_id]
        );
        if (variantUpdate.rowCount === 0) {
          throw new Error('Failed to restore product variant stock. Variant not found or permission denied.');
        }
      }
    }
    
    // Delete the sale
    await client.query('DELETE FROM sales WHERE id = $1 AND organization_id = $2', [id, organizationId]);
    
    await client.query('COMMIT');
    return NextResponse.json({ 
      status: 'success', 
      message: 'Sale deleted successfully' 
    });

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Sale deletion error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to delete sale';
    return NextResponse.json({ 
      status: 'error', 
      message: errorMessage
    }, { status: 500 });
  } finally {
    client.release();
  }
}