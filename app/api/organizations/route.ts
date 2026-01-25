import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/database';
import { getApiOrSessionUser } from '@/lib/api-auth-keys';

/**
 * @swagger
 * /api/organizations:
 *   get:
 *     operationId: getCurrentOrganization
 *     tags:
 *       - Organizations
 *     summary: Get the current user's organization
 *     description: Returns the organization associated with the authenticated user's session.
 *     security:
 *       - stackSession: []
 *     responses:
 *       200:
 *         description: Organization fetched successfully (or empty list if user has no organization).
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: success
 *                 organizations:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Organization'
 *       401:
 *         description: API key required.
 *       500:
 *         description: Failed to fetch organizations.
 *   post:
 *     operationId: createOrganization
 *     tags:
 *       - Organizations
 *     summary: Create a new organization and assign current user as admin
 *     security:
 *       - stackSession: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               countryCode:
 *                 type: string
 *                 nullable: true
 *               currencyCode:
 *                 type: string
 *                 nullable: true
 *               currencySymbol:
 *                 type: string
 *                 nullable: true
 *             required:
 *               - name
 *     responses:
 *       200:
 *         description: Organization created successfully and current user updated as admin.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: success
 *                 organization:
 *                   $ref: '#/components/schemas/Organization'
 *       400:
 *         description: Validation error (e.g. missing name).
 *       401:
 *         description: API key required.
 *   put:
 *     operationId: updateOrganization
 *     tags:
 *       - Organizations
 *     summary: Update an existing organization (admin only)
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
 *               name:
 *                 type: string
 *               countryCode:
 *                 type: string
 *                 nullable: true
 *               currencyCode:
 *                 type: string
 *                 nullable: true
 *               currencySymbol:
 *                 type: string
 *                 nullable: true
 *             required:
 *               - id
 *               - name
 *     responses:
 *       200:
 *         description: Organization updated successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                 organization:
 *                   $ref: '#/components/schemas/Organization'
 *       400:
 *         description: Validation error.
 *       401:
 *         description: API key required.
 *       403:
 *         description: Forbidden – user is not allowed to update this organization.
 */

export async function GET(request: NextRequest) {
  try {
    const user = await getApiOrSessionUser(request);
    if (!user) {
      return NextResponse.json({ status: 'error', message: 'API key required' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const idParam = searchParams.get('id');

    if (!user.organizationId) {
      return NextResponse.json({ status: 'success', organizations: [] });
    }

    const userOrgId = user.organizationId;
    const requestedId = idParam ? parseInt(idParam, 10) : null;

    if (requestedId && requestedId !== userOrgId) {
      if (user.role !== 'admin') {
        return NextResponse.json({ status: 'error', message: 'Forbidden' }, { status: 403 });
      }

      const orgCheck = await db.query(
        'SELECT id FROM organizations WHERE id = $1 AND created_by = $2',
        [requestedId, user.id],
      );

      if (!orgCheck.rows.length) {
        return NextResponse.json({ status: 'error', message: 'Forbidden' }, { status: 403 });
      }
    }

    const targetId = requestedId || userOrgId;

    const result = await db.query(
      'SELECT id, name, created_at, country_code, currency_code, currency_symbol FROM organizations WHERE id = $1',
      [targetId]
    );

    return NextResponse.json({
      status: 'success',
      organizations: result.rows
    });
  } catch (error) {
    console.error('Error fetching organizations:', error);
    return NextResponse.json({ status: 'error', message: 'Failed to fetch organizations' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getApiOrSessionUser(request);
    if (!user?.id) {
      return NextResponse.json({ status: 'error', message: 'API key required' }, { status: 401 });
    }

    const { name, countryCode, currencyCode, currencySymbol } = await request.json();
    if (!name) {
      return NextResponse.json({ status: 'error', message: 'Organization name is required' }, { status: 400 });
    }

    // Create the organization and record who created it
    const result = await db.query(
      'INSERT INTO organizations (name, country_code, currency_code, currency_symbol, created_by) VALUES ($1, $2, $3, $4, $5) RETURNING id, name, created_at, country_code, currency_code, currency_symbol, created_by',
      [name, countryCode || null, currencyCode || null, currencySymbol || null, user.id]
    );

    const newOrgId = result.rows[0].id;

    // Update the current user to belong to this organization and set as admin
    await db.query(
      'UPDATE users SET organization_id = $1, user_role = $2 WHERE id = $3',
      [newOrgId, 'admin', user.id]
    );

    return NextResponse.json({
      status: 'success',
      organization: {
        ...result.rows[0],
        organization_name: result.rows[0].name,
      },
    });
  } catch (error) {
    console.error('Error creating organization:', error);
    return NextResponse.json({ status: 'error', message: 'Failed to create organization' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const user = await getApiOrSessionUser(request);
    if (user?.role !== 'admin') {
      return NextResponse.json({ status: 'error', message: 'API key required' }, { status: 401 });
    }

    const { id, name, countryCode, currencyCode, currencySymbol } = await request.json();
    if (!id || !name) {
      return NextResponse.json({ status: 'error', message: 'Organization ID and name are required' }, { status: 400 });
    }

    // Ensure the admin is updating their own organization
    if (id !== user.organizationId) {
        return NextResponse.json({ status: 'error', message: 'Forbidden' }, { status: 403 });
    }

    const result = await db.query(
      'UPDATE organizations SET name = $1, country_code = COALESCE($2, country_code), currency_code = COALESCE($3, currency_code), currency_symbol = COALESCE($4, currency_symbol), updated_at = NOW() WHERE id = $5 RETURNING id, name, created_at, updated_at, country_code, currency_code, currency_symbol',
      [name, countryCode || null, currencyCode || null, currencySymbol || null, id]
    );

    if (result.rows.length === 0) {
      return NextResponse.json({ status: 'error', message: 'Organization not found' }, { status: 404 });
    }

    return NextResponse.json({
      status: 'success',
      organization: result.rows[0],
    });
  } catch (error) {
    console.error('Error updating organization:', error);
    return NextResponse.json({ status: 'error', message: 'Failed to update organization' }, { status: 500 });
  }
}