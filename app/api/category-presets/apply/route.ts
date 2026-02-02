import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/database'
import { getApiOrSessionUser } from '@/lib/api-auth-keys'

export const dynamic = 'force-dynamic';

/**
 * @swagger
 * /api/category-presets/apply:
 *   post:
 *     operationId: applyCategoryPresets
 *     tags:
 *       - Category Presets
 *     summary: Apply global project and expense category presets to an organization/project
 *     security:
 *       - stackSession: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               projectCategoryPresetIds:
 *                 type: array
 *                 items:
 *                   type: integer
 *               project_id:
 *                 type: integer
 *                 nullable: true
 *             required:
 *               - projectCategoryPresetIds
 *     responses:
 *       200:
 *         description: Presets applied successfully.
 *       400:
 *         description: Validation error.
 *       401:
 *         description: API key required.
 */

// POST /api/category-presets/apply
// Body: { projectCategoryPresetIds: number[] }
// Creates real project_categories and expense_category rows for the current organization
export async function POST(request: NextRequest) {
  try {
    const user = await getApiOrSessionUser(request)
    if (!user?.organizationId || !user.id) {
      return NextResponse.json({ status: 'error', message: 'API key required' }, { status: 401 })
    }

    const { projectCategoryPresetIds, project_id } = await request.json()

    if (!Array.isArray(projectCategoryPresetIds) || projectCategoryPresetIds.length === 0) {
      return NextResponse.json(
        { status: 'error', message: 'projectCategoryPresetIds must be a non-empty array' },
        { status: 400 }
      )
    }

    const orgId = user.organizationId

    const presetsResult = await db.query(
      `SELECT id, name, description
       FROM public.project_category_presets
       WHERE id = ANY($1::int[]) AND is_active = true`,
      [projectCategoryPresetIds]
    )

    if (presetsResult.rows.length === 0) {
      return NextResponse.json(
        { status: 'error', message: 'No matching project category presets found' },
        { status: 400 }
      )
    }

    const expensePresetsResult = await db.query(
      `SELECT id, project_category_preset_id, name, description
       FROM public.expense_category_presets
       WHERE project_category_preset_id = ANY($1::int[]) AND is_active = true`,
      [projectCategoryPresetIds]
    )

    const expensePresetsByPresetId: Record<number, { id: number; name: string; description: string | null }[]> = {}
    for (const row of expensePresetsResult.rows) {
      const presetId: number = row.project_category_preset_id
      if (!expensePresetsByPresetId[presetId]) {
        expensePresetsByPresetId[presetId] = []
      }
      expensePresetsByPresetId[presetId].push({
        id: row.id,
        name: row.name,
        description: row.description ?? null,
      })
    }

    const createdProjectCategories: any[] = []
    const createdExpenseCategories: any[] = []

    await db.query('BEGIN');

    for (const preset of presetsResult.rows) {
      const existingProjectCategoryRes = await db.query(
        `SELECT *
           FROM public.project_categories
          WHERE (organization_id = $1 OR organization_id IS NULL)
            AND project_id IS NOT DISTINCT FROM $2
            AND category_name = $3
            AND COALESCE(is_custom, 0) = 0
          ORDER BY organization_id DESC NULLS LAST, id
          LIMIT 1`,
        [orgId, project_id ?? null, preset.name],
      );

      let projectCategory = existingProjectCategoryRes.rows[0];

      if (!projectCategory) {
        try {
          const projectInsert = await db.query(
            `INSERT INTO public.project_categories (category_name, description, organization_id, is_custom, project_id)
             VALUES ($1, $2, $3, $4, $5)
             RETURNING *`,
            [preset.name, preset.description || null, orgId, 0, project_id ?? null]
          )

          projectCategory = projectInsert.rows[0]
          createdProjectCategories.push(projectCategory)
        } catch (e: any) {
          // If concurrent requests try to create the same category, swallow the unique violation
          // and re-read the existing row.
          if (e?.code === '23505') {
            const reread = await db.query(
              `SELECT *
                 FROM public.project_categories
                WHERE (organization_id = $1 OR organization_id IS NULL)
                  AND project_id IS NOT DISTINCT FROM $2
                  AND category_name = $3
                  AND COALESCE(is_custom, 0) = 0
                ORDER BY organization_id DESC NULLS LAST, id
                LIMIT 1`,
              [orgId, project_id ?? null, preset.name],
            )
            projectCategory = reread.rows[0]
          } else {
            throw e
          }
        }
      }

      const expensePresets = expensePresetsByPresetId[preset.id] || []
      for (const expPreset of expensePresets) {
        const existingExpenseRes = await db.query(
          `SELECT *
             FROM public.expense_category
            WHERE organization_id = $1
              AND project_id IS NOT DISTINCT FROM $2
              AND project_category_id = $3
              AND category_name = $4
            ORDER BY id
            LIMIT 1`,
          [orgId, project_id ?? null, projectCategory.id, expPreset.name],
        );

        if (existingExpenseRes.rows[0]) {
          continue;
        }

        try {
          const expenseInsert = await db.query(
            `INSERT INTO public.expense_category (category_name, description, project_category_id, organization_id, project_id)
             VALUES ($1, $2, $3, $4, $5)
             RETURNING *`,
            [expPreset.name, expPreset.description || null, projectCategory.id, orgId, project_id ?? null]
          )
          createdExpenseCategories.push(expenseInsert.rows[0])
        } catch (e: any) {
          // Concurrent preset applications can race; ignore duplicates.
          if (e?.code === '23505') {
            continue
          }
          throw e
        }
      }
    }

    await db.query('COMMIT');

    return NextResponse.json({
      status: 'success',
      projectCategories: createdProjectCategories,
      expenseCategories: createdExpenseCategories,
    })
  } catch (error) {
    try {
      await db.query('ROLLBACK');
    } catch {
    }
    console.error('Error applying category presets:', error)
    return NextResponse.json(
      {
        status: 'error',
        message: 'Failed to apply category presets',
      },
      { status: 500 }
    )
  }
}
