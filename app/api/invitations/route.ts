import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/database';
import { getSessionUser } from '@/lib/api-auth';
import crypto from 'crypto';
import nodemailer from 'nodemailer';

// This function configures the email transport.
// For development, it uses Ethereal to create a test account.
// For production, it uses SMTP credentials from environment variables.
async function getMailTransport() {
  if (process.env.NODE_ENV === 'development') {
    let testAccount = await nodemailer.createTestAccount();
    console.log('Ethereal test account created:', testAccount.user, testAccount.pass);
    return nodemailer.createTransport({
      host: 'smtp.ethereal.email',
      port: 587,
      secure: false,
      auth: {
        user: testAccount.user,
        pass: testAccount.pass,
      },
    });
  }

  // For production, ensure you have these environment variables set.
  if (!process.env.SMTP_HOST || !process.env.SMTP_PORT || !process.env.SMTP_USER || !process.env.SMTP_PASS) {
    throw new Error("SMTP configuration is missing in environment variables.");
  }
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT, 10),
    secure: parseInt(process.env.SMTP_PORT, 10) === 465,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
}

export async function POST(request: NextRequest) {
  const client = await db.connect();
  try {
    const sessionUser = await getSessionUser(request);
    if (sessionUser?.role !== 'admin') {
      return NextResponse.json({ status: 'error', message: 'Unauthorized' }, { status: 401 });
    }

    const { email, username, role, project_ids } = await request.json();

    if (!email || !username || !role) {
      return NextResponse.json({ status: 'error', message: 'Email, username, and role are required' }, { status: 400 });
    }

    const existingUser = await client.query('SELECT * FROM users WHERE email = $1 AND status = $2', [email, 'active']);
    if (existingUser.rows.length > 0) {
        return NextResponse.json({ status: 'error', message: 'An active user with this email already exists.' }, { status: 409 });
    }

    await client.query('BEGIN');

    const invitation_token = crypto.randomBytes(32).toString('hex');
    const invitation_expires_at = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours from now

    // Upsert user: create if not exists, or update if pending
    const userResult = await client.query(`
      INSERT INTO users (email, employee_name, user_role, organization_id, status, invitation_token, invitation_expires_at)
      VALUES ($1, $2, $3, $4, 'pending', $5, $6)
      ON CONFLICT (email) DO UPDATE
      SET employee_name = EXCLUDED.employee_name, 
          user_role = EXCLUDED.user_role, 
          organization_id = EXCLUDED.organization_id,
          status = 'pending',
          invitation_token = EXCLUDED.invitation_token,
          invitation_expires_at = EXCLUDED.invitation_expires_at
      RETURNING id;
    `, [email, username, role, sessionUser.organizationId, invitation_token, invitation_expires_at]);

    const newUserId = userResult.rows[0].id;

    // Clear old project assignments and add new ones
    await client.query('DELETE FROM project_assignments WHERE user_id = $1', [newUserId]);
    if (project_ids && project_ids.length > 0) {
      const assignmentValues = project_ids.map((projectId: number) => `(${newUserId}, ${projectId})`).join(',');
      await client.query(`INSERT INTO project_assignments (user_id, project_id) VALUES ${assignmentValues}`);
    }

    const transport = await getMailTransport();
    const activationUrl = `${process.env.NEXTAUTH_URL}/accept-invitation?token=${invitation_token}`;

    const mailOptions = {
      from: `"Flame Expense Tracker" <${process.env.SMTP_FROM_EMAIL || 'noreply@example.com'}>`,
      to: email,
      subject: 'You have been invited to join an organization',
      text: `Hello ${username},\n\nYou have been invited to join an organization on Flame Expense Tracker. Please click the following link to accept and activate your account: ${activationUrl}\n\nThis link will expire in 24 hours.`,
      html: `<p>Hello ${username},</p><p>You have been invited to join an organization on Flame Expense Tracker. Please click the link below to accept and activate your account.</p><a href="${activationUrl}">Accept Invitation</a><p>This link will expire in 24 hours.</p>`,
    };

    const info = await transport.sendMail(mailOptions);

    await client.query('COMMIT');

    console.log('Invitation email sent. Preview URL: %s', nodemailer.getTestMessageUrl(info));

    return NextResponse.json({ status: 'success', message: 'Invitation sent successfully.' });

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error sending invitation:', error);
    return NextResponse.json({ status: 'error', message: 'Failed to send invitation' }, { status: 500 });
  } finally {
    client.release();
  }
}
