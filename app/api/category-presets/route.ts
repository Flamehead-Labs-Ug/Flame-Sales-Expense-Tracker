import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/database'
import { getSessionUser } from '@/lib/api-auth'

export const dynamic = 'force-dynamic';

// GET /api/category-presets
// Returns global project category presets with their expense presets
export async function GET(request: NextRequest) {
  try {
    const sessionUser = await getSessionUser(request)
    if (!sessionUser?.id) {
      return NextResponse.json({ status: 'error', message: 'Unauthorized' }, { status: 401 })
    }

    const result = await db.query(
      `SELECT 
         p.id,
         p.name,
         p.description,
         p.sort_order,
         COALESCE(
           json_agg(
             json_build_object(
               'id', e.id,
               'name', e.name,
               'description', e.description,
               'sort_order', e.sort_order
             )
           ) FILTER (WHERE e.id IS NOT NULL),
           '[]'::json
         ) AS expense_presets
       FROM public.project_category_presets p
       LEFT JOIN public.expense_category_presets e
         ON e.project_category_preset_id = p.id AND e.is_active = true
       WHERE p.is_active = true
       GROUP BY p.id
       ORDER BY p.sort_order NULLS FIRST, p.name`
    )

    return NextResponse.json({
      status: 'success',
      presets: result.rows,
    })
  } catch (error) {
    console.error('Error fetching category presets:', error)
    return NextResponse.json(
      {
        status: 'error',
        message: 'Failed to fetch category presets',
      },
      { status: 500 }
    )
  }
}
