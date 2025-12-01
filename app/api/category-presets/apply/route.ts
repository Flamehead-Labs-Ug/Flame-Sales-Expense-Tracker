import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/database'
import { getSessionUser } from '@/lib/api-auth'

export const dynamic = 'force-dynamic';

// POST /api/category-presets/apply
// Body: { projectCategoryPresetIds: number[] }
// Creates real project_categories and expense_category rows for the current organization
export async function POST(request: NextRequest) {
  const client = await db.connect()

  try {
    const sessionUser = await getSessionUser(request)
    if (!sessionUser?.organizationId || !sessionUser.id) {
      return NextResponse.json({ status: 'error', message: 'Unauthorized' }, { status: 401 })
    }

    const { projectCategoryPresetIds, project_id } = await request.json()

    if (!Array.isArray(projectCategoryPresetIds) || projectCategoryPresetIds.length === 0) {
      return NextResponse.json(
        { status: 'error', message: 'projectCategoryPresetIds must be a non-empty array' },
        { status: 400 }
      )
    }

    const orgId = sessionUser.organizationId

    await client.query('BEGIN')

    const presetsResult = await client.query(
      `SELECT id, name, description
       FROM public.project_category_presets
       WHERE id = ANY($1::int[]) AND is_active = true`,
      [projectCategoryPresetIds]
    )

    if (presetsResult.rows.length === 0) {
      await client.query('ROLLBACK')
      return NextResponse.json(
        { status: 'error', message: 'No matching project category presets found' },
        { status: 400 }
      )
    }

    const expensePresetsResult = await client.query(
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

    for (const preset of presetsResult.rows) {
      const projectInsert = await client.query(
        `INSERT INTO public.project_categories (category_name, description, organization_id, is_custom, project_id)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING *`,
        [preset.name, preset.description || null, orgId, 0, project_id || null]
      )

      const projectCategory = projectInsert.rows[0]
      createdProjectCategories.push(projectCategory)

      const expensePresets = expensePresetsByPresetId[preset.id] || []
      for (const expPreset of expensePresets) {
        const expenseInsert = await client.query(
          `INSERT INTO public.expense_category (category_name, description, project_category_id, organization_id, project_id)
           VALUES ($1, $2, $3, $4, $5)
           RETURNING *`,
          [expPreset.name, expPreset.description || null, projectCategory.id, orgId, project_id || null]
        )
        createdExpenseCategories.push(expenseInsert.rows[0])
      }
    }

    await client.query('COMMIT')

    return NextResponse.json({
      status: 'success',
      projectCategories: createdProjectCategories,
      expenseCategories: createdExpenseCategories,
    })
  } catch (error) {
    await client.query('ROLLBACK')
    console.error('Error applying category presets:', error)
    return NextResponse.json(
      {
        status: 'error',
        message: 'Failed to apply category presets',
      },
      { status: 500 }
    )
  } finally {
    client.release()
  }
}
