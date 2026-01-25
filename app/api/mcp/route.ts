import { NextRequest, NextResponse } from 'next/server'
import { getApiOrSessionUser } from '@/lib/api-auth-keys'
import { db } from '@/lib/database'

// Direct database implementation of MCP tools

async function addProjectCategory(params: any, organizationId: number) {
  const { category_name, description, is_custom, project_id } = params;
  const result = await db.query(
    'INSERT INTO project_categories (category_name, description, is_custom, organization_id, project_id) VALUES ($1, $2, $3, $4, $5) RETURNING *',
    [category_name, description || null, is_custom ? 1 : 0, organizationId, project_id ?? null]
  );
  return result.rows[0];
}

async function addExpenseCategory(params: any) {
  const { category_name, description, project_category_id, organization_id, project_id } = params;
  
  if (!project_category_id) {
    throw new Error('Project category ID is required');
  }

  if (!organization_id) {
    throw new Error('Organization ID is required');
  }

  const result = await db.query(
    `INSERT INTO expense_category 
     (category_name, description, project_category_id, organization_id, project_id) 
     VALUES ($1, $2, $3, $4, $5) 
     RETURNING *`,
    [
      category_name, 
      description || null, 
      project_category_id, 
      organization_id,
      project_id ?? null,
    ]
  );
  
  return result.rows[0];
}

async function deleteExpenseCategory(params: any) {
  const { category_id } = params;
  await db.query('DELETE FROM expense_category WHERE id = $1', [category_id]);
  return { success: true };
}

async function getPaymentMethods(organizationId: number) {
  const result = await db.query('SELECT * FROM payment_methods WHERE organization_id = $1 ORDER BY method_name', [organizationId]);
  return result.rows;
}

async function addPaymentMethod(params: any, organizationId: number, userId: number) {
  const { method_name, description } = params;
  const query = `
    INSERT INTO payment_methods (method_name, description, organization_id)
    VALUES ($1, $2, $3)
    RETURNING *;
  `;
  const values = [method_name, description, organizationId];
  const result = await db.query(query, values);
  return result.rows[0];
}

async function updatePaymentMethod(params: any) {
  const { payment_method_id, method_name, description } = params;

  const setClauses = [];
  const values = [];
  let placeholderIndex = 1;

  if (method_name) {
    setClauses.push(`method_name = $${placeholderIndex++}`);
    values.push(method_name);
  }
  if (description) {
    setClauses.push(`description = $${placeholderIndex++}`);
    values.push(description);
  }

  if (setClauses.length === 0) {
    // Nothing to update
    return { success: true, message: "No fields to update" };
  }

  values.push(payment_method_id);
  const query = `
    UPDATE payment_methods
    SET ${setClauses.join(', ')}
    WHERE id = $${placeholderIndex}
    RETURNING *;
  `;

  const result = await db.query(query, values);
  return result.rows[0];
}

async function deletePaymentMethod(params: any) {
  const { payment_method_id } = params;
  await db.query('DELETE FROM expenses WHERE payment_method_id = $1', [payment_method_id]);
  await db.query('DELETE FROM payment_methods WHERE id = $1', [payment_method_id]);
  return { success: true };
}

export async function POST(request: NextRequest) {
  try {
    const { tool, params } = await request.json()

    const user = await getApiOrSessionUser(request);
    if (!user?.organizationId) {
      return NextResponse.json({ status: 'error', message: 'API key required' }, { status: 401 });
    }
    const { organizationId, id: userId } = user;

    const enhancedParams = { ...params, organization_id: organizationId, created_by: userId };

    // Handle different MCP tools directly
    let result;
    switch (tool) {
      case 'add_project_category':
        result = await addProjectCategory(enhancedParams, organizationId);
        break;
      case 'add_expense_category':
        result = await addExpenseCategory(enhancedParams);
        break;
      case 'delete_expense_category':
        result = await deleteExpenseCategory(enhancedParams);
        break;
      case 'get_payment_methods':
        result = await getPaymentMethods(organizationId);
        break;
      case 'add_payment_method':
        result = await addPaymentMethod(enhancedParams, organizationId, userId);
        break;
      case 'update_payment_method':
        result = await updatePaymentMethod(enhancedParams);
        break;
      case 'delete_payment_method':
        result = await deletePaymentMethod(enhancedParams);
        break;
      default:
        return NextResponse.json(
          { status: 'error', message: 'Unsupported tool' },
          { status: 400 }
        );
    }

    if (tool === 'add_project_category' || tool === 'add_expense_category') {
      return NextResponse.json({
        status: 'success',
        category: result,
        data: result,
      });
    }

    return NextResponse.json({
      status: 'success',
      data: result,
    });

  } catch (error: unknown) {
    console.error('MCP route error:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
    return NextResponse.json(
      { status: 'error', message: 'Database operation failed', detail: errorMessage },
      { status: 500 }
    );
  }
}