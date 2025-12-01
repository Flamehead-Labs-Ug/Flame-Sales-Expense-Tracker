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
      'SELECT * FROM vendors WHERE organization_id = $1 ORDER BY vendor_name',
      [organizationId]
    );
    return NextResponse.json({
      status: 'success',
      vendors: result.rows,
    });
  } catch (error) {
    return NextResponse.json(
      {
        status: 'error',
        message: 'Failed to fetch vendors',
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const sessionUser = await getSessionUser(request);
    if (!sessionUser?.organizationId) {
      return NextResponse.json({ status: 'error', message: 'Authentication required' }, { status: 401 });
    }
    const { organizationId } = sessionUser;

    const { vendor_name, contact_person, email, phone, address } = await request.json();
    
    const result = await db.query(
      'INSERT INTO vendors (vendor_name, contact_person, email, phone, address, organization_id) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
      [vendor_name, contact_person, email, phone, address, organizationId]
    )
    
    return NextResponse.json({ 
      status: 'success', 
      vendor: result.rows[0] 
    })
  } catch (error) {
    return NextResponse.json({ 
      status: 'error', 
      message: 'Failed to create vendor' 
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

    const { id, vendor_name, contact_person, email, phone, address } = await request.json();
    
    const result = await db.query(
      'UPDATE vendors SET vendor_name = $1, contact_person = $2, email = $3, phone = $4, address = $5 WHERE id = $6 AND organization_id = $7 RETURNING *',
      [vendor_name, contact_person, email, phone, address, id, organizationId]
    )
    
    return NextResponse.json({ 
      status: 'success', 
      vendor: result.rows[0] 
    })
  } catch (error) {
    return NextResponse.json({ 
      status: 'error', 
      message: 'Failed to update vendor' 
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
    
    await db.query('DELETE FROM vendors WHERE id = $1 AND organization_id = $2', [id, organizationId])
    
    return NextResponse.json({ 
      status: 'success', 
      message: 'Vendor deleted successfully' 
    })
  } catch (error) {
    return NextResponse.json({ 
      status: 'error', 
      message: 'Failed to delete vendor' 
    }, { status: 500 })
  }
}