import { NextRequest, NextResponse } from 'next/server';
import { Pool } from 'pg';
import { getSessionUser, isUserMidSetup } from '@/lib/api-auth';
import { seedVariantTypes } from '@/lib/seed-variant-types';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  let pool: Pool | null = null;
  
  try {
    const sessionUser = await getSessionUser(request);
    const midSetup = await isUserMidSetup(request);

    if (!sessionUser?.id || (!sessionUser.organizationId && !midSetup)) {
      return NextResponse.json({ status: 'error', message: 'Authentication required' }, { status: 401 });
    }

    pool = new Pool({
      host: process.env.PG_HOST,
      database: process.env.PG_DATABASE,
      user: process.env.PG_USER,
      password: process.env.PG_PASSWORD,
      port: parseInt(process.env.PG_PORT || '5432')
    });

    // First, try to get the variant types
    const result = await pool.query(`
      SELECT 
        vt.id,
        vt.type_name,
        COALESCE(
          JSON_AGG(
            JSON_BUILD_OBJECT('id', uom.id, 'unit_name', uom.unit_name)
            ORDER BY uom.unit_name
          ) FILTER (WHERE uom.id IS NOT NULL), 
          '[]'::json
        ) as units
      FROM variant_types vt
      LEFT JOIN units_of_measurement uom ON vt.id = uom.variant_type_id
      GROUP BY vt.id, vt.type_name
      ORDER BY vt.type_name
    `);

    // If no variant types exist, seed the database with defaults
    if (result.rows.length === 0) {
      await seedVariantTypes();
      
      // Fetch the data again after seeding
      const seededResult = await pool.query(`
        SELECT 
          vt.id,
          vt.type_name,
          COALESCE(
            JSON_AGG(
              JSON_BUILD_OBJECT('id', uom.id, 'unit_name', uom.unit_name)
              ORDER BY uom.unit_name
            ) FILTER (WHERE uom.id IS NOT NULL), 
            '[]'::json
          ) as units
        FROM variant_types vt
        LEFT JOIN units_of_measurement uom ON vt.id = uom.variant_type_id
        GROUP BY vt.id, vt.type_name
        ORDER BY vt.type_name
      `);
      
      return NextResponse.json({
        status: 'success',
        variantTypes: seededResult.rows
      });
    }

    return NextResponse.json({
      status: 'success',
      variantTypes: result.rows
    });
 } catch (error) {
    console.error('Error fetching variant types:', error);
    return NextResponse.json({
      status: 'error',
      message: 'Failed to fetch variant types'
    }, { status: 500 });
  } finally {
    if (pool) await pool.end();
  }
}