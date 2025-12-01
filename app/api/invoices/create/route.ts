'use server'

import fs from 'fs'
import path from 'path'
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/database'
import { getSessionUser } from '@/lib/api-auth'
import { generateInvoicePDF, validateInvoice } from '@casoon/invoice-generator'

interface CreateInvoiceItem {
  description: string
  quantity: number
  unit?: string
  unitPrice: number
  vatRate?: number
}

interface CreateInvoiceRequest {
  customerId?: number
  projectId?: number
  cycleId?: number
  recipient: {
    name: string
    address?: {
      street?: string
      postalCode?: string
      city?: string
    }
  }
  items: CreateInvoiceItem[]
  invoiceNumber?: string
  invoiceDate?: string
  dueDate?: string
  servicePeriod?: string
  currency?: string
}

function formatInvoiceDateFromISO(iso?: string): string {
  const date = iso ? new Date(iso) : new Date()
  if (Number.isNaN(date.getTime())) {
    return formatGermanDate(new Date())
  }
  return formatGermanDate(date)
}

function formatGermanDate(date: Date): string {
  const dd = String(date.getDate()).padStart(2, '0')
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const yy = String(date.getFullYear() % 100).padStart(2, '0')
  return `${dd}.${mm}.${yy}`
}

function ensureHelveticaFont() {
  try {
    const vendorDataDir = path.join(process.cwd(), '.next', 'server', 'vendor-chunks', 'data')
    fs.mkdirSync(vendorDataDir, { recursive: true })

    const fonts = ['Helvetica.afm', 'Helvetica-Bold.afm']
    for (const font of fonts) {
      const targetPath = path.join(vendorDataDir, font)
      if (fs.existsSync(targetPath)) continue

      const sourcePath = path.join(process.cwd(), 'node_modules', 'pdfkit', 'js', 'data', font)
      if (!fs.existsSync(sourcePath)) {
        console.error(`${font} source file not found at`, sourcePath)
        continue
      }

      fs.copyFileSync(sourcePath, targetPath)
    }
  } catch (err) {
    console.error('Failed to ensure Helvetica font files', err)
  }
}

export async function POST(request: NextRequest) {
  try {
    const sessionUser = await getSessionUser(request)
    if (!sessionUser?.organizationId) {
      return NextResponse.json({ status: 'error', message: 'Authentication required' }, { status: 401 })
    }
    const { organizationId, email: userEmail } = sessionUser

    const body = (await request.json()) as CreateInvoiceRequest
    const { customerId, projectId, cycleId, recipient, items, invoiceNumber, invoiceDate, dueDate, servicePeriod, currency } = body

    if (!recipient?.name) {
      return NextResponse.json({ status: 'error', message: 'Recipient name is required' }, { status: 400 })
    }
    if (!items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ status: 'error', message: 'At least one invoice item is required' }, { status: 400 })
    }

    const orgResult = await db.query(
      'SELECT id, name, country_code, currency_code FROM organizations WHERE id = $1',
      [organizationId],
    )
    const org = orgResult.rows[0]
    const orgCurrency: string | undefined = org?.currency_code || undefined
    const invoiceCurrency = currency || orgCurrency || 'USD'

    // Normalize items and compute totals
    const normalizedItems = items.map((item) => {
      const quantity = Number(item.quantity) || 0
      const unitPrice = Number(item.unitPrice) || 0
      const total = quantity * unitPrice
      return {
        description: item.description || 'Item',
        quantity,
        unit: item.unit || 'pcs',
        vatRate: item.vatRate ?? 0,
        unitPrice,
        total,
        currency: invoiceCurrency,
      }
    })

    const netAmount = normalizedItems.reduce((sum, item) => sum + (item.total || 0), 0)
    const vatRate = 0
    const vatAmount = 0
    const grossAmount = netAmount + vatAmount

    const invoiceDateFormatted = formatInvoiceDateFromISO(invoiceDate)
    const dueDateFormatted = formatInvoiceDateFromISO(dueDate)

    // Load customer contact info so we can include email/phone in the recipient block
    let customerRow: { name: string; email?: string | null; phone?: string | null; phone_number?: string | null } | null = null
    if (customerId) {
      const customerResult = await db.query(
        'SELECT name, email, phone, phone_number FROM customers WHERE id = $1 AND organization_id = $2',
        [customerId, organizationId],
      )
      customerRow = customerResult.rows[0] || null
    }

    const recipientName = recipient.name || customerRow?.name || 'Customer'
    const customerEmail = customerRow?.email || ''
    const primaryPhone = customerRow?.phone || ''
    const altPhone = customerRow?.phone_number || ''

    const streetLines: string[] = []
    const baseStreet = recipient.address?.street || ''
    if (baseStreet) streetLines.push(baseStreet)
    if (customerEmail) streetLines.push(`Email: ${customerEmail}`)
    if (primaryPhone) {
      streetLines.push(`Phone: ${primaryPhone}`)
    } else if (altPhone) {
      streetLines.push(`Phone: ${altPhone}`)
    }

    const recipientAddress = {
      street: (streetLines.join('\n') || baseStreet || ' ').trim(),
      postalCode: recipient.address?.postalCode || '',
      city: recipient.address?.city || '',
    }

    const senderEmail = userEmail || process.env.INVOICE_SENDER_EMAIL || 'billing@example.com'

    // Derive a human-readable customer number; for now we use the internal customerId as a string.
    const customerNumber = customerId != null ? String(customerId) : ''

    const invoice = {
      sender: {
        name: org?.name || 'Your Organization',
        company: org?.name || 'Your Organization',
        address: {
          street: process.env.INVOICE_SENDER_STREET || 'Example Street 1',
          postalCode: process.env.INVOICE_SENDER_POSTAL_CODE || '12345',
          city: process.env.INVOICE_SENDER_CITY || 'Example City',
        },
        contactInfo: {
          phone: process.env.INVOICE_SENDER_PHONE || '',
          mobile: process.env.INVOICE_SENDER_MOBILE || '',
          email: senderEmail,
          website: process.env.INVOICE_SENDER_WEBSITE || '',
        },
        businessOwner: process.env.INVOICE_BUSINESS_OWNER || undefined,
        vatId: process.env.INVOICE_SENDER_VAT_ID || undefined,
      },
      recipient: {
        name: recipientName,
        address: recipientAddress,
      },
      details: {
        invoiceNumber: invoiceNumber || `INV-${new Date().getFullYear()}-${Date.now()}`,
        customerNumber,
        invoiceDate: invoiceDateFormatted,
        deliveryDate: invoiceDateFormatted,
        servicePeriod,
        dueDate: dueDateFormatted,
        vatId: undefined,
      },
      salutation: {
        greeting: `Dear ${recipientName},`,
        introduction: 'Thank you for your business. Please find your invoice below:',
      },
      items: normalizedItems,
      totals: {
        netAmount,
        vatRate,
        vatAmount,
        grossAmount,
        currency: invoiceCurrency,
      },
      paymentInfo: {
        paymentTerms: `Payable without deduction by ${dueDateFormatted}`,
        dueDate: dueDateFormatted,
        bank: process.env.INVOICE_BANK_NAME || 'Example Bank',
        accountHolder: org?.name || process.env.INVOICE_ACCOUNT_HOLDER || 'Your Organization',
        iban: process.env.INVOICE_SENDER_IBAN || 'DE12 3456 7890 1234 5678 90',
        bic: process.env.INVOICE_SENDER_BIC || 'TESTDE12XXX',
      },
      metadata: {
        createdWith: 'Flame Expense Tracker',
        creationDate: new Date().toISOString(),
        filename: 'invoice.json',
      },
    }

    const validation = validateInvoice(invoice as any)
    if (!validation.isValid) {
      console.error('Invoice validation errors:', validation.errors)
      return NextResponse.json(
        { status: 'error', message: 'Invoice validation failed', errors: validation.errors },
        { status: 400 }
      )
    }

    // Persist invoice metadata and, if a project/cycle is provided, link via a synthetic sale row
    try {
      const invoiceInsert = await db.query(
        `INSERT INTO invoices (
           organization_id,
           customer_id,
           invoice_number,
           invoice_date,
           due_date,
           currency,
           net_amount,
           vat_amount,
           gross_amount,
           status
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         ON CONFLICT (organization_id, invoice_number)
         DO UPDATE SET
           customer_id = EXCLUDED.customer_id,
           invoice_date = EXCLUDED.invoice_date,
           due_date = EXCLUDED.due_date,
           currency = EXCLUDED.currency,
           net_amount = EXCLUDED.net_amount,
           vat_amount = EXCLUDED.vat_amount,
           gross_amount = EXCLUDED.gross_amount,
           status = EXCLUDED.status
         RETURNING id`,
        [
          organizationId,
          customerId ?? null,
          invoice.details.invoiceNumber,
          invoiceDate || null,
          dueDate || null,
          invoiceCurrency,
          netAmount,
          vatAmount,
          grossAmount,
          'generated',
        ]
      )

      const invoiceId = invoiceInsert.rows[0]?.id as number | undefined
      if (!invoiceId) {
        console.warn('Invoice created without ID')
      } else if (projectId) {
        try {
          const safeProjectId = Number(projectId) || null
          const safeCycleId = cycleId ? Number(cycleId) || null : null

          // Create a minimal synthetic sale used only for linking invoices to project/cycle
          const totalQuantity = normalizedItems.reduce((sum, item) => sum + (item.quantity || 0), 0)
          const safeQuantity = totalQuantity > 0 ? totalQuantity : 1
          const unitPriceForSale = grossAmount / safeQuantity

          const saleInsert = await db.query(
            `INSERT INTO sales (
               project_id,
               cycle_id,
               product_id,
               variant_id,
               customer_name,
               customer_id,
               quantity,
               unit_cost,
               price,
               status,
               cash_at_hand,
               balance,
               amount,
               sale_date,
               organization_id,
               created_by
             ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
             RETURNING id`,
            [
              safeProjectId,
              safeCycleId,
              null,
              null,
              recipientName,
              customerId ?? null,
              safeQuantity,
              0,
              unitPriceForSale,
              'invoiced',
              0,
              0,
              grossAmount,
              invoiceDate || null,
              organizationId,
              sessionUser.id,
            ],
          )

          const saleId = saleInsert.rows[0]?.id as number | undefined
          if (saleId) {
            await db.query(
              'INSERT INTO invoice_sales (invoice_id, sale_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
              [invoiceId, saleId],
            )
          }
        } catch (linkError) {
          console.error('Failed to link invoice to project/cycle via invoice_sales:', linkError)
        }
      }
    } catch (metaError: any) {
      if (metaError?.code !== '23505') {
        console.error('Failed to persist invoice metadata', metaError)
      }
      // Continue anyway; PDF generation should still work
    }

    // Ensure pdfkit can find the built-in Helvetica font in Next.js server environment
    ensureHelveticaFont()

    const logoPath = process.env.INVOICE_LOGO_PATH || 'logo/logo.png'

    const pdfBuffer = await generateInvoicePDF(invoice as any, {
      language: 'en',
      includeLogo: true,
      logoPath,
    })

    const filename = `${invoice.details.invoiceNumber || 'invoice'}.pdf`

    return new NextResponse(pdfBuffer as any, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    })
  } catch (error) {
    console.error('Invoice creation error:', error)
    const message = error instanceof Error ? error.message : 'Failed to create invoice'
    return NextResponse.json({ status: 'error', message }, { status: 500 })
  }
}
