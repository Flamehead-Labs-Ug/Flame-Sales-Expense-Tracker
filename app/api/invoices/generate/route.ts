'use server';

import fs from 'fs';
import path from 'path';
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/database';
import { getSessionUser } from '@/lib/api-auth';
import { generateInvoicePDF, validateInvoice } from '@casoon/invoice-generator';

interface GenerateInvoiceRequest {
  saleIds: number[];
  recipient: {
    name: string;
    address?: {
      street?: string;
      postalCode?: string;
      city?: string;
    };
  };
  invoiceNumber?: string;
  invoiceDate?: string; // ISO date string from client (yyyy-MM-dd)
  dueDate?: string; // ISO date string from client
  servicePeriod?: string;
  currency?: string;
}

function formatInvoiceDateFromISO(iso?: string): string {
  const date = iso ? new Date(iso) : new Date();
  if (Number.isNaN(date.getTime())) {
    return formatGermanDate(new Date());
  }
  return formatGermanDate(date);
}

function formatGermanDate(date: Date): string {
  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const yy = String(date.getFullYear() % 100).padStart(2, '0');
  return `${dd}.${mm}.${yy}`;
}

function ensureHelveticaFont() {
  try {
    const vendorDataDir = path.join(process.cwd(), '.next', 'server', 'vendor-chunks', 'data');
    fs.mkdirSync(vendorDataDir, { recursive: true });

    const fonts = ['Helvetica.afm', 'Helvetica-Bold.afm'];
    for (const font of fonts) {
      const targetPath = path.join(vendorDataDir, font);
      if (fs.existsSync(targetPath)) {
        continue;
      }

      const sourcePath = path.join(process.cwd(), 'node_modules', 'pdfkit', 'js', 'data', font);
      if (!fs.existsSync(sourcePath)) {
        console.error(`${font} source file not found at`, sourcePath);
        continue;
      }

      fs.copyFileSync(sourcePath, targetPath);
    }
  } catch (err) {
    console.error('Failed to ensure Helvetica font files', err);
  }
}

export async function POST(request: NextRequest) {
  try {
    const sessionUser = await getSessionUser(request);
    if (!sessionUser?.organizationId) {
      return NextResponse.json({ status: 'error', message: 'Authentication required' }, { status: 401 });
    }
    const { organizationId, email: userEmail } = sessionUser;

    const body = (await request.json()) as GenerateInvoiceRequest;
    const { saleIds, recipient, invoiceNumber, invoiceDate, dueDate, servicePeriod, currency } = body;

    if (!saleIds || !Array.isArray(saleIds) || saleIds.length === 0) {
      return NextResponse.json({ status: 'error', message: 'saleIds is required' }, { status: 400 });
    }
    if (!recipient?.name) {
      return NextResponse.json({ status: 'error', message: 'Recipient name is required' }, { status: 400 });
    }

    // Load sales
    const placeholders = saleIds.map((_, idx) => `$${idx + 2}`).join(', ');
    const salesQuery = `
      SELECT id, project_id, cycle_id, product_id, variant_id, customer_name AS customer,
             customer_id, quantity, unit_cost, price, amount, sale_date
      FROM sales
      WHERE organization_id = $1 AND id IN (${placeholders})
    `;
    const salesResult = await db.query(salesQuery, [organizationId, ...saleIds]);

    const sales = salesResult.rows;
    if (sales.length === 0) {
      return NextResponse.json({ status: 'error', message: 'No sales found for the given IDs' }, { status: 404 });
    }

    // Ensure all sales share the same customer
    const customerName = sales[0].customer as string | null;
    const allSameCustomer = sales.every((s) => s.customer === customerName);
    if (!allSameCustomer) {
      return NextResponse.json({ status: 'error', message: 'All selected sales must have the same customer to generate a single invoice' }, { status: 400 });
    }

    // Load basic organization info as sender
    const orgResult = await db.query(
      'SELECT id, name, country_code, currency_code FROM organizations WHERE id = $1',
      [organizationId]
    );
    const org = orgResult.rows[0];
    const orgCurrency: string | undefined = org?.currency_code || undefined;

    const invoiceCurrency = currency || orgCurrency || 'USD';

    // Build items from sales
    const items = sales.map((sale) => {
      const quantity = Number(sale.quantity) || 0;
      const unitPrice = Number(sale.price) || 0;
      const total = quantity * unitPrice;
      return {
        description: `Sale #${sale.id}`,
        quantity,
        unit: 'pcs',
        vatRate: 0,
        unitPrice,
        total,
        currency: invoiceCurrency,
      };
    });

    const netAmount = items.reduce((sum, item) => sum + (item.total || 0), 0);
    const vatRate = 0;
    const vatAmount = 0;
    const grossAmount = netAmount + vatAmount;

    const invoiceDateFormatted = formatInvoiceDateFromISO(invoiceDate);
    const dueDateFormatted = formatInvoiceDateFromISO(dueDate);

    const senderEmail = userEmail || process.env.INVOICE_SENDER_EMAIL || 'billing@example.com';

    // Derive a human-readable customer number when we know the underlying customer_id
    const customerIdForInvoice = (sales[0] as any).customer_id ?? null;

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
        name: recipient.name,
        address: recipient.address || {},
      },
      details: {
        invoiceNumber: invoiceNumber || `INV-${new Date().getFullYear()}-${Date.now()}`,
        customerNumber: customerIdForInvoice != null ? String(customerIdForInvoice) : '',
        invoiceDate: invoiceDateFormatted,
        deliveryDate: invoiceDateFormatted,
        servicePeriod: servicePeriod,
        dueDate: dueDateFormatted,
        vatId: undefined,
      },
      salutation: {
        greeting: `Dear ${recipient.name},`,
        introduction: 'Thank you for your business. Please find your invoice below:',
      },
      items,
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
    };

    const validation = validateInvoice(invoice as any);
    if (!validation.isValid) {
      console.error('Invoice validation errors:', validation.errors);
      return NextResponse.json({ status: 'error', message: 'Invoice validation failed', errors: validation.errors }, { status: 400 });
    }

    // Persist invoice metadata if invoices tables exist
    try {
      const firstSale = sales[0];
      const customerIdForInvoice = (firstSale as any).customer_id ?? null;

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
          customerIdForInvoice,
          invoice.details.invoiceNumber,
          invoiceDate || null,
          dueDate || null,
          invoiceCurrency,
          netAmount,
          vatAmount,
          grossAmount,
          'generated',
        ]
      );

      const invoiceId = invoiceInsert.rows[0]?.id as number | undefined;
      if (invoiceId) {
        for (const sale of sales) {
          await db.query(
            'INSERT INTO invoice_sales (invoice_id, sale_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
            [invoiceId, sale.id]
          );
        }
      }
    } catch (metaError: any) {
      // Ignore duplicate invoice_number for the same organization, log other errors
      if (metaError?.code !== '23505') {
        console.error('Failed to persist invoice metadata', metaError);
      }
      // Continue anyway; PDF generation should still work
    }

    // Ensure pdfkit can find the built-in Helvetica font in Next.js server environment
    ensureHelveticaFont();

    const logoPath = process.env.INVOICE_LOGO_PATH || 'logo/logo.png';

    const pdfBuffer = await generateInvoicePDF(invoice as any, {
      language: 'en',
      includeLogo: true,
      logoPath,
    });

    const filename = `${invoice.details.invoiceNumber || 'invoice'}.pdf`;

    return new NextResponse(pdfBuffer as any, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    console.error('Invoice generation error:', error);
    const message = error instanceof Error ? error.message : 'Failed to generate invoice';
    return NextResponse.json({ status: 'error', message }, { status: 500 });
  }
}
