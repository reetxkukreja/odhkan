import nodemailer from 'nodemailer';
import { db, Registration, Group, OdhkanEvent } from './db';
import { parseISTDate } from './ist';
import { query, isPostgresConfigured } from './postgres';

export interface EmailLog {
  id: string;
  eventId: string;
  eventName?: string;
  participantId?: string;
  recipientEmail: string;
  recipientName: string;
  emailType: 'reminder' | 'reveal' | 'test';
  status: 'pending' | 'sent' | 'delivered' | 'failed' | 'simulated';
  provider: 'smtp' | 'resend' | 'simulation';
  messageId?: string | null;
  errorMessage?: string | null;
  subject?: string;
  previewText?: string;
  sentAt?: number | null;
  createdAt: number;
}

// In-memory fallback for email logs
const inMemoryEmailLogs: EmailLog[] = [];

export interface ProviderStatusInfo {
  configured: boolean;
  provider: 'smtp' | 'resend' | 'simulation';
  fromAddress: string;
  host?: string;
  port?: number;
  user?: string;
  details: string;
}

/**
 * Get current configured email provider status and details.
 */
export function getProviderStatus(): ProviderStatusInfo {
  if (process.env.RESEND_API_KEY) {
    const rawFrom = process.env.EMAIL_FROM || 'onboarding@resend.dev';
    return {
      configured: true,
      provider: 'resend',
      fromAddress: rawFrom.includes('<') ? rawFrom : `Odhkan <${rawFrom}>`,
      details: 'Resend HTTP API',
    };
  }

  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const port = process.env.SMTP_PORT ? parseInt(process.env.SMTP_PORT, 10) : 587;

  // Check if user attempted to configure SMTP (at least one variable provided)
  const isSmtpPartiallyConfigured = Boolean(host || user || pass || process.env.SMTP_PORT);

  if (isSmtpPartiallyConfigured) {
    const isComplete = Boolean(host && user && pass);
    const rawFrom = process.env.EMAIL_FROM || user || 'odhkan@college.edu';
    return {
      configured: isComplete,
      provider: 'smtp',
      fromAddress: rawFrom.includes('<') ? rawFrom : `Odhkan <${rawFrom}>`,
      host: host || 'Missing SMTP_HOST',
      port,
      user: user || 'Missing SMTP_USER',
      details: isComplete
        ? `SMTP Server (${host}:${port})`
        : `SMTP Incomplete: Missing ${[!host && 'SMTP_HOST', !user && 'SMTP_USER', !pass && 'SMTP_PASS'].filter(Boolean).join(', ')}`,
    };
  }

  return {
    configured: false,
    provider: 'simulation',
    fromAddress: process.env.EMAIL_FROM || 'Odhkan <odhkan@college.edu>',
    details: 'Simulation Mode (No SMTP or Resend API key configured in .env)',
  };
}

/**
 * Clean, secret-safe server-side logging for email dispatches.
 */
function logEmailDispatch(params: {
  recipient: string;
  sender: string;
  provider: 'smtp' | 'resend' | 'simulation';
  status: 'accepted' | 'delivered' | 'failed' | 'simulated';
  messageId?: string | null;
  error?: string | null;
  timestamp?: string;
}) {
  const ts = params.timestamp || new Date().toISOString();
  let istTime = '';
  try {
    istTime = new Date(ts).toLocaleTimeString('en-US', {
      timeZone: 'Asia/Kolkata',
      hour: 'numeric',
      minute: '2-digit',
      second: '2-digit',
      hour12: true,
    });
  } catch {}

  console.log(`\n================== [ODHKAN EMAIL DISPATCH LOG] ==================`);
  console.log(`• Recipient:   ${params.recipient}`);
  console.log(`• Sender:      ${params.sender}`);
  console.log(`• Provider:    ${params.provider.toUpperCase()}`);
  console.log(`• Status:      ${params.status.toUpperCase()}`);
  if (params.messageId) console.log(`• Message ID:  ${params.messageId}`);
  if (params.error)     console.log(`• Error:       ${params.error}`);
  console.log(`• Timestamp:   ${ts} (${istTime} IST)`);
  console.log(`=================================================================\n`);
}

/**
 * Generates a clever, playful, non-cringe English rhyme based on recipient's first name.
 * 1-2 lines maximum. English only. Natural and conversational.
 */
export function generateNameRhyme(fullName: string): string {
  const firstName = (fullName || 'Friend').trim().split(/\s+/)[0];
  const name = firstName.charAt(0).toUpperCase() + firstName.slice(1);
  const nameLower = firstName.toLowerCase();

  // Curated database of witty, natural rhymes for common names
  const customRhymes: Record<string, string> = {
    reet: "Reet, back on your feet,\nanother Odhkan crew you're about to meet.",
    karan: "Karan, here's the plan,\ngo meet your new clan.",
    rohan: "Rohan, time to roam on,\nyour new group is waiting — come on.",
    priya: "Priya, no need to wonder why,\nthree new people are waiting nearby.",
    aarav: "Aarav, clear your schedule and laugh,\nyour new Odhkan group is ready on path.",
    ananya: "Ananya, take a break from the grind,\nthree great minds you're about to find.",
    kabir: "Kabir, have no fear,\nyour new crew is already here.",
    aditya: "Aditya, time to step into the light,\nthis conversation might just make your night.",
    sneha: "Sneha, say goodbye to the day's stress,\nthree fresh faces are here to impress.",
    dev: "Dev, put your laptop on rest,\nthis Odhkan meet might just be the best.",
    tanvi: "Tanvi, let's keep it lively and bright,\nyour new group is waiting in sight.",
    arjun: "Arjun, keep your focus on point,\nyour new trio is meeting at the joint.",
    ishan: "Ishan, here's where the stories began,\ngo say hi to your new campus clan.",
    riya: "Riya, look who's stopping by,\na whole new crew under the Friday sky.",
    diya: "Diya, bring that positive vibe,\ngo say hello to your new tribe.",
    neha: "Neha, take a quick little break,\nnew friendships are waiting to make.",
    aryan: "Aryan, grab a tea and carry on,\nyour Odhkan group is ready and on.",
    varun: "Varun, afternoon's turning around soon,\ngo meet your crew this afternoon.",
    sahil: "Sahil, let the conversations prevail,\nyour new group is ready to set sail.",
    mehak: "Mehak, step out into the breeze,\nmeeting new people is done with ease.",
    dhruv: "Dhruv, time to make a quick move,\nyour Odhkan crew has found their groove.",
    rahul: "Rahul, keep it relaxed and cool,\nyour new trio is waiting after school.",
    yash: "Yash, leave the room in a flash,\nthree new people are ready to mash.",
    pooja: "Pooja, take a stroll on the path,\nyour group is waiting with a smile and a laugh.",
    simran: "Simran, put your routine on hold,\na brand new campus story's about to unfold.",
    tanya: "Tanya, curiosity in the air,\nyour Odhkan trio is waiting over there.",
    aman: "Aman, take a walk if you can,\ngo find your brand new clan.",
    sid: "Sid, whatever you did,\nyour new group is ready, no need to hide.",
    shivam: "Shivam, the weekend's on the rhythm,\nyour new group has got that charisma with 'em.",
    amit: "Amit, let's keep it simple and sweet,\nthree new people you're ready to meet.",
    khushi: "Khushi, let the good mood start,\nthree new companions to warm your heart.",
  };

  if (customRhymes[nameLower]) {
    return customRhymes[nameLower];
  }

  // Phonetic & syllable ending rules for names not in curated list
  if (nameLower.endsWith('an') || nameLower.endsWith('aan') || nameLower.endsWith('on')) {
    return `${name}, stick to the plan,\ngo say hello to your new clan.`;
  }
  if (nameLower.endsWith('eet') || nameLower.endsWith('it') || nameLower.endsWith('ith')) {
    return `${name}, take a break and take your seat,\nthree new folks you're about to meet.`;
  }
  if (nameLower.endsWith('av') || nameLower.endsWith('ab')) {
    return `${name}, let's make it a good run,\nmeeting new people is half the fun.`;
  }
  if (nameLower.endsWith('ya') || nameLower.endsWith('a') || nameLower.endsWith('ah')) {
    return `${name}, no need to wonder why,\nthree new companions are waiting nearby.`;
  }
  if (nameLower.endsWith('ur') || nameLower.endsWith('ar') || nameLower.endsWith('er')) {
    return `${name}, look around near and far,\nyour new group is right where you are.`;
  }
  if (nameLower.endsWith('sh') || nameLower.endsWith('esh') || nameLower.endsWith('ish')) {
    return `${name}, wrap up that afternoon wish,\nyour new trio is waiting to mesh.`;
  }
  if (nameLower.endsWith('el') || nameLower.endsWith('il') || nameLower.endsWith('al')) {
    return `${name}, step out and let it unravel,\nnew stories are ready to travel.`;
  }

  // Universal witty default
  return `${name}, let the routine pause for a bit,\nyour new Odhkan group is ready to sit.`;
}

/**
 * Formats a college email from roll number or provided address.
 */
export function getRecipientEmail(rollNumber: string, fallbackEmail?: string): string {
  if (fallbackEmail && fallbackEmail.includes('@')) {
    return fallbackEmail.trim();
  }
  const cleanRoll = rollNumber.trim().toLowerCase();
  // Default college email structure (can be customized via domain or format)
  return `${cleanRoll}@college.edu`;
}

/**
 * Configure ₹0 Free Transporter (SMTP / Nodemailer with Brevo / Custom Relay)
 */
function createTransporter() {
  const host = process.env.SMTP_HOST || 'smtp-relay.brevo.com';
  const port = process.env.SMTP_PORT ? parseInt(process.env.SMTP_PORT, 10) : 587;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (host && user && pass) {
    return nodemailer.createTransport({
      host,
      port,
      secure: port === 465, // false for 587 (STARTTLS)
      auth: { user, pass },
      tls: {
        rejectUnauthorized: true,
      },
      connectionTimeout: 15000,
      greetingTimeout: 15000,
      socketTimeout: 20000,
    });
  }

  // Return null if SMTP not configured
  return null;
}

export interface SendEmailResult {
  success: boolean;
  status: 'sent' | 'delivered' | 'failed' | 'simulated';
  provider: 'smtp' | 'resend' | 'simulation';
  messageId?: string;
  error?: string;
  details?: string;
}

/**
 * Send an email with automatic provider detection, error handling, and server logging.
 */
export async function sendEmailDirectly(options: {
  to: string;
  subject: string;
  text: string;
  html: string;
  from?: string;
}): Promise<SendEmailResult> {
  const providerInfo = getProviderStatus();
  const from = options.from || providerInfo.fromAddress;
  const cleanTo = (options.to || '').trim();

  // Basic recipient validation
  if (!cleanTo || !cleanTo.includes('@')) {
    const errorMsg = `Invalid recipient email address: "${options.to}"`;
    logEmailDispatch({
      recipient: cleanTo || '<empty>',
      sender: from,
      provider: providerInfo.provider,
      status: 'failed',
      error: errorMsg,
    });
    return {
      success: false,
      status: 'failed',
      provider: providerInfo.provider,
      error: errorMsg,
    };
  }

  // 1. Resend API
  if (providerInfo.provider === 'resend') {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    try {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from,
          to: [cleanTo],
          subject: options.subject,
          text: options.text,
          html: options.html,
        }),
        signal: controller.signal,
      });
      clearTimeout(timeout);

      const data: any = await response.json().catch(() => ({}));

      if (response.ok && data?.id) {
        logEmailDispatch({
          recipient: cleanTo,
          sender: from,
          provider: 'resend',
          status: 'accepted',
          messageId: data.id,
        });
        return {
          success: true,
          status: 'sent',
          provider: 'resend',
          messageId: data.id,
          details: 'Accepted by Resend API for delivery (Status: Sent)',
        };
      }

      const errMsg = data?.message || data?.error || `Resend HTTP ${response.status} ${response.statusText}`;
      logEmailDispatch({
        recipient: cleanTo,
        sender: from,
        provider: 'resend',
        status: 'failed',
        error: errMsg,
      });
      return {
        success: false,
        status: 'failed',
        provider: 'resend',
        error: errMsg,
      };
    } catch (err: any) {
      clearTimeout(timeout);
      const isTimeout = err.name === 'AbortError';
      const errMsg = isTimeout ? 'Resend API request timed out after 15s' : err.message;
      logEmailDispatch({
        recipient: cleanTo,
        sender: from,
        provider: 'resend',
        status: 'failed',
        error: errMsg,
      });
      return {
        success: false,
        status: 'failed',
        provider: 'resend',
        error: errMsg,
      };
    }
  }

  // 2. SMTP Transporter
  if (providerInfo.provider === 'smtp') {
    const transporter = createTransporter();
    if (!transporter) {
      const errMsg = providerInfo.details || 'SMTP credentials incomplete (missing SMTP_USER or SMTP_PASS)';
      logEmailDispatch({
        recipient: cleanTo,
        sender: from,
        provider: 'smtp',
        status: 'failed',
        error: errMsg,
      });
      return {
        success: false,
        status: 'failed',
        provider: 'smtp',
        error: errMsg,
      };
    }

    try {
      const info = await transporter.sendMail({
        from,
        to: cleanTo,
        subject: options.subject,
        text: options.text,
        html: options.html,
      });

      logEmailDispatch({
        recipient: cleanTo,
        sender: from,
        provider: 'smtp',
        status: 'accepted',
        messageId: info.messageId,
      });

      return {
        success: true,
        status: 'sent',
        provider: 'smtp',
        messageId: info.messageId,
        details: `Accepted by SMTP server (${providerInfo.host}) (Status: Sent)`,
      };
    } catch (err: any) {
      logEmailDispatch({
        recipient: cleanTo,
        sender: from,
        provider: 'smtp',
        status: 'failed',
        error: err.message,
      });
      return {
        success: false,
        status: 'failed',
        provider: 'smtp',
        error: err.message,
      };
    }
  }

  // 3. Free Development & Preview Simulation Mode (When no credentials in .env)
  const simMessageId = `sim_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  logEmailDispatch({
    recipient: cleanTo,
    sender: from,
    provider: 'simulation',
    status: 'simulated',
    messageId: simMessageId,
  });

  return {
    success: true,
    status: 'simulated',
    provider: 'simulation',
    messageId: simMessageId,
    details: 'Simulated preview (No SMTP/API key in .env). Logged to server console.',
  };
}

/**
 * Log email in PostgreSQL and in-memory table.
 */
export async function recordEmailLog(log: Omit<EmailLog, 'id' | 'createdAt'>): Promise<EmailLog> {
  const id = `eml_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  const now = Date.now();
  const entry: EmailLog = {
    ...log,
    id,
    provider: log.provider || 'simulation',
    createdAt: now,
  };

  if (isPostgresConfigured()) {
    try {
      await query(
        `INSERT INTO email_logs (
           id, event_id, participant_id, recipient_email, recipient_name,
           email_type, status, error_message, subject, preview_text, sent_at, created_at, provider, message_id
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14);`,
        [
          entry.id,
          entry.eventId,
          entry.participantId || null,
          entry.recipientEmail,
          entry.recipientName,
          entry.emailType,
          entry.status,
          entry.errorMessage || null,
          entry.subject || null,
          entry.previewText || null,
          entry.sentAt || null,
          entry.createdAt,
          entry.provider,
          entry.messageId || null,
        ]
      );
    } catch (e: any) {
      console.error('[Email Log] Postgres write error:', e.message);
    }
  }

  inMemoryEmailLogs.unshift(entry);
  if (inMemoryEmailLogs.length > 500) {
    inMemoryEmailLogs.pop();
  }

  return entry;
}

/**
 * Check if a participant has already received an email of specific type for an event.
 */
export async function hasEmailBeenSent(
  eventId: string,
  participantId: string,
  emailType: 'reminder' | 'reveal'
): Promise<boolean> {
  if (isPostgresConfigured()) {
    try {
      const res = await query(
        `SELECT id FROM email_logs WHERE event_id = $1 AND participant_id = $2 AND email_type = $3 AND status IN ('sent', 'delivered', 'simulated') LIMIT 1;`,
        [eventId, participantId, emailType]
      );
      return res.rows.length > 0;
    } catch (e) {
      // fallback to memory
    }
  }

  return inMemoryEmailLogs.some(
    l => l.eventId === eventId && l.participantId === participantId && l.emailType === emailType && (l.status === 'sent' || l.status === 'delivered' || l.status === 'simulated')
  );
}

/**
 * Renders the Odhkan branded HTML email shell.
 * Uses safe table-based layout, safe font stacks, and responsive sizing.
 */
export function renderOdhkanEmailShell({
  heading,
  subheading,
  bodyHtml,
  ctaText,
  ctaUrl,
  footerNote,
}: {
  heading?: string;
  subheading?: string;
  bodyHtml: string;
  ctaText?: string;
  ctaUrl?: string;
  footerNote?: string;
}): string {
  const appUrl = process.env.APP_URL || 'https://odhkan.com';
  const actionUrl = ctaUrl || appUrl;

  const ctaButtonHtml = ctaText
    ? `
    <table border="0" cellpadding="0" cellspacing="0" style="margin: 24px 0;">
      <tr>
        <td align="left">
          <a href="${actionUrl}" target="_blank" style="display: inline-block; background-color: #E11D48; color: #ffffff; font-size: 14px; font-weight: 600; text-decoration: none; padding: 12px 24px; border-radius: 8px; line-height: 1.2; font-family: Arial, Helvetica, sans-serif;">
            ${ctaText} &rarr;
          </a>
        </td>
      </tr>
    </table>`
    : '';

  return `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Odhkan</title>
  <style type="text/css">
    body {
      margin: 0;
      padding: 0;
      background-color: #FAF9F6;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      -webkit-font-smoothing: antialiased;
      -moz-osx-font-smoothing: grayscale;
    }
    table {
      border-collapse: collapse;
    }
    @media only screen and (max-width: 600px) {
      .card-container {
        padding: 24px 18px !important;
      }
      .heading-title {
        font-size: 20px !important;
      }
    }
  </style>
</head>
<body style="margin: 0; padding: 0; background-color: #FAF9F6;">
  <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #FAF9F6; padding: 36px 12px;">
    <tr>
      <td align="center">
        <!-- Main Email Container -->
        <table border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 500px; background-color: #ffffff; border: 1px solid #E5E7EB; border-radius: 12px; overflow: hidden; box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);">
          <tr>
            <td class="card-container" style="padding: 36px 32px;">
              
              <!-- Brand Header -->
              <div style="font-size: 14px; font-weight: 800; letter-spacing: 0.18em; color: #E11D48; text-transform: uppercase; margin-bottom: 24px; font-family: Arial, Helvetica, sans-serif;">
                ODHKAN
              </div>

              ${
                heading
                  ? `<h1 class="heading-title" style="margin: 0 0 8px 0; font-size: 22px; font-weight: 700; color: #111827; letter-spacing: -0.02em; line-height: 1.3; font-family: Arial, Helvetica, sans-serif;">${heading}</h1>`
                  : ''
              }

              ${
                subheading
                  ? `<p style="margin: 0 0 20px 0; font-size: 15px; color: #4B5563; line-height: 1.5; font-family: Arial, Helvetica, sans-serif;">${subheading}</p>`
                  : ''
              }

              <!-- Body Content -->
              <div style="font-size: 15px; line-height: 1.6; color: #374151; font-family: Arial, Helvetica, sans-serif;">
                ${bodyHtml}
              </div>

              ${ctaButtonHtml}

              <!-- Email Footer -->
              <div style="margin-top: 32px; padding-top: 20px; border-top: 1px solid #E5E7EB; font-size: 13px; color: #6B7280; line-height: 1.5; font-family: Arial, Helvetica, sans-serif;">
                ${footerNote ? `<div style="margin-bottom: 12px; color: #6B7280;">${footerNote}</div>` : ''}
                <strong style="color: #111827;">Odhkan</strong><br />
                <span style="color: #6B7280;">Random people. One college. More connections.</span>
              </div>

            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/**
 * RENDER REMINDER EMAIL
 * Subject: Your Odhkan group goes live in 1 hour
 * Send 1 hour before configured reveal time.
 */
export function renderReminderEmail(
  event: OdhkanEvent,
  participant?: Registration
): { subject: string; text: string; html: string } {
  const ist = parseISTDate(event.revealTime);
  const timeFormatted = ist.timeFormatted; // e.g. "3:00 PM"
  const firstName = participant?.name ? participant.name.trim().split(/\s+/)[0] : 'there';
  const appUrl = process.env.APP_URL || 'https://odhkan.com';

  const subject = 'Your Odhkan group goes live in 1 hour';

  const text = `ODHKAN

Your group is almost here.

Hi ${firstName},

Just a little heads-up — your Odhkan group goes live in about an hour.
Be around when the group is revealed.

See Odhkan: ${appUrl}

Event Details:
Event: ${event.name}
Group reveal: ${timeFormatted} today

---
Odhkan
Random people. One college. More connections.
`;

  const bodyHtml = `
    <p style="margin: 0 0 16px 0; font-size: 15px; color: #374151; line-height: 1.6;">
      Hi ${firstName},
    </p>
    <p style="margin: 0 0 16px 0; font-size: 15px; color: #374151; line-height: 1.6;">
      Just a little heads-up &mdash; your Odhkan group goes live in about an hour.
    </p>
    <p style="margin: 0 0 20px 0; font-size: 15px; color: #374151; line-height: 1.6;">
      Be around when the group is revealed.
    </p>

    <div style="background-color: #F9FAFB; border: 1px solid #E5E7EB; border-radius: 8px; padding: 16px 20px; margin: 24px 0 8px 0;">
      <div style="font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: #6B7280; margin-bottom: 8px;">Event Information</div>
      <div style="font-size: 14px; color: #111827; margin-bottom: 6px;">
        <span style="color: #6B7280;">Event:</span> <strong style="color: #111827;">${event.name}</strong>
      </div>
      <div style="font-size: 14px; color: #111827;">
        <span style="color: #6B7280;">Group reveal:</span> <strong style="color: #111827;">${timeFormatted} today</strong>
      </div>
    </div>
  `;

  const html = renderOdhkanEmailShell({
    heading: 'Your group is almost here.',
    bodyHtml,
    ctaText: 'See Odhkan',
    ctaUrl: appUrl,
  });

  return { subject, text, html };
}

/**
 * RENDER PERSONALIZED GROUP REVEAL EMAIL
 */
export async function renderRevealEmail(
  event: OdhkanEvent,
  participant: Registration,
  group: Group,
  allEventGroups: Group[],
  allRegistrations: Registration[]
): Promise<{ subject: string; text: string; html: string }> {
  const firstName = participant.name.trim().split(/\s+/)[0];
  const appUrl = process.env.APP_URL || 'https://odhkan.com';
  const subject = 'Your Odhkan group is here 🎉';

  // Find other members of this participant's group
  const memberRegs = group.memberIds
    .filter(mId => mId !== participant.id)
    .map(mId => allRegistrations.find(r => r.id === mId))
    .filter(Boolean) as Registration[];

  // Format group members (Name — Batch/Year). Note: Strict privacy - never disclose roll number, phone, or email.
  const groupLines = memberRegs.map(m => {
    const formattedBatch = m.batch.startsWith('20') ? m.batch : `20${m.batch.slice(0, 2)}`;
    return `${m.name} — Batch ${formattedBatch}`;
  });

  // Determine participant's Odhkan history across all published events
  const allEvents = await db.getEvents();
  const publishedEvents = allEvents.filter(e => e.isPublished || e.status === 'completed');
  const pastEventsJoined = allRegistrations.filter(
    r =>
      r.rollNumber === participant.rollNumber &&
      (r.status === 'active' || r.status === 'valid') &&
      r.groupId &&
      r.eventId !== event.id
  );

  const participationCount = pastEventsJoined.length + 1; // including this one
  const isFirstTime = pastEventsJoined.length === 0;
  const isFinalOdhkan =
    event.name.toLowerCase().includes('final') || (publishedEvents.length >= 4 && participationCount >= 4);

  // Personalized opening copy
  let openingCopy = '';
  let pastGroupMention = '';

  if (isFinalOdhkan) {
    openingCopy = 'One last Odhkan. Make this one count.';
  } else if (isFirstTime) {
    openingCopy = "First Odhkan. Three random people. Let's see where this goes.";
  } else if (participationCount === 2) {
    openingCopy = "Round 2. You clearly haven't had enough of meeting random people yet.";
  } else {
    openingCopy = 'At this point, meeting random people from college is becoming a habit.';
  }

  // Reference their previous group members if they completed a previous event
  if (pastEventsJoined.length > 0) {
    const lastReg = pastEventsJoined[pastEventsJoined.length - 1];
    if (lastReg && lastReg.groupId) {
      const allPastGroups = await db.getAllGroups();
      const lastGrp = allPastGroups.find(g => g.id === lastReg.groupId);
      if (lastGrp) {
        const prevNames = lastGrp.memberIds
          .filter(id => id !== lastReg.id)
          .map(id => allRegistrations.find(r => r.id === id)?.name.split(' ')[0])
          .filter(Boolean) as string[];

        if (prevNames.length > 0) {
          const namesList =
            prevNames.length === 1
              ? prevNames[0]
              : prevNames.length === 2
              ? `${prevNames[0]} and ${prevNames[1]}`
              : `${prevNames.slice(0, -1).join(', ')} and ${prevNames[prevNames.length - 1]}`;
          pastGroupMention = `Last time you met ${namesList}. Hope that conversation went well.`;
        }
      }
    }
  }

  // Generate personalized rhyme for participant's first name
  const nameRhyme = generateNameRhyme(participant.name);

  // Assemble plain text
  const textParts = [
    'ODHKAN',
    '',
    'Your group is here.',
    '',
    `Hi ${firstName},`,
    '',
    "It's time to meet your people.",
    openingCopy ? `\n${openingCopy}` : '',
    pastGroupMention ? `\n${pastGroupMention}` : '',
    '',
    nameRhyme ? `"${nameRhyme}"\n` : '',
    'YOUR ODHKAN GROUP:',
    ...groupLines.map(g => `• ${g}`),
    '',
    'Go find them.',
    '',
    "Can't find them around campus? You can use the Odhkan website to contact your group.",
    '',
    `Meet your people: ${appUrl}`,
    '',
    '---',
    'Odhkan',
    'Random people. One college. More connections.',
  ].filter(Boolean);

  const text = textParts.join('\n');

  // Build group rows HTML
  const memberRowsHtml = memberRegs
    .map((m, idx) => {
      const formattedBatch = m.batch.startsWith('20') ? m.batch : `20${m.batch.slice(0, 2)}`;
      const isLast = idx === memberRegs.length - 1;
      return `
        <div style="padding: 10px 0; ${isLast ? '' : 'border-bottom: 1px solid #F3F4F6;'} font-size: 15px; color: #111827;">
          <span style="font-weight: 600; color: #111827;">${m.name}</span>
          <span style="color: #6B7280; font-size: 13px; margin-left: 6px;">&bull; Batch ${formattedBatch}</span>
        </div>
      `;
    })
    .join('');

  const bodyHtml = `
    <p style="margin: 0 0 14px 0; font-size: 15px; color: #374151; line-height: 1.6;">
      Hi ${firstName},
    </p>
    <p style="margin: 0 0 16px 0; font-size: 15px; color: #374151; line-height: 1.6;">
      It's time to meet your people.
    </p>
    ${
      openingCopy
        ? `<p style="margin: 0 0 14px 0; font-size: 15px; color: #374151; line-height: 1.6;">${openingCopy}</p>`
        : ''
    }
    ${
      pastGroupMention
        ? `<p style="margin: 0 0 16px 0; font-size: 14px; color: #6B7280; font-style: italic; line-height: 1.5;">${pastGroupMention}</p>`
        : ''
    }

    ${
      nameRhyme
        ? `<div style="background-color: #FFF1F2; border-left: 3px solid #E11D48; padding: 12px 16px; border-radius: 6px; font-size: 14px; font-weight: 500; color: #9F1239; line-height: 1.5; margin: 20px 0; white-space: pre-line;">${nameRhyme}</div>`
        : ''
    }

    <div style="background-color: #F9FAFB; border: 1px solid #E5E7EB; border-radius: 8px; padding: 18px 20px; margin: 24px 0 20px 0;">
      <div style="font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: #6B7280; margin-bottom: 12px;">YOUR GROUP</div>
      ${memberRowsHtml || '<div style="font-size: 14px; color: #6B7280;">Group members assigned.</div>'}
    </div>

    <div style="font-size: 16px; font-weight: 600; color: #111827; margin: 20px 0 6px 0;">
      Go find them.
    </div>
    <p style="font-size: 13px; color: #6B7280; line-height: 1.5; margin: 0 0 8px 0;">
      Can't find them around campus? You can use the Odhkan website to contact your group.
    </p>
  `;

  const html = renderOdhkanEmailShell({
    heading: 'Your group is here.',
    bodyHtml,
    ctaText: 'Meet your people',
    ctaUrl: appUrl,
  });

  return { subject, text, html };
}

/**
 * Helper to dynamically look up a participant from the database for test previews.
 */
export async function findParticipantForPreview(
  queryInput: string,
  eventId?: string
): Promise<{
  participant?: Registration;
  event: OdhkanEvent;
  error?: string;
}> {
  const event = eventId ? ((await db.getEventById(eventId)) || (await db.getActiveEvent())) : await db.getActiveEvent();

  if (!event) {
    return { event: null as any, error: 'No active event found.' };
  }

  const q = (queryInput || '').trim().toLowerCase();
  const eventRegs = await db.getEventRegistrations(event.id);
  const allRegs = await db.getAllRegistrations();

  if (!q) {
    return { event, error: 'Please enter a registered participant email, roll number, or name.' };
  }

  // 1. Search in target event registrations
  let participant = eventRegs.find(r => {
    const rollEmail = `${r.rollNumber.toLowerCase()}@college.edu`;
    return (
      r.id.toLowerCase() === q ||
      r.rollNumber.toLowerCase() === q ||
      rollEmail === q ||
      (r.phoneNumber && r.phoneNumber.toLowerCase() === q) ||
      r.name.toLowerCase() === q ||
      r.name.toLowerCase().includes(q)
    );
  });

  // 2. If not found in this event, check other events
  if (!participant) {
    const foundOther = allRegs.find(r => {
      const rollEmail = `${r.rollNumber.toLowerCase()}@college.edu`;
      return (
        r.id.toLowerCase() === q ||
        r.rollNumber.toLowerCase() === q ||
        rollEmail === q ||
        (r.phoneNumber && r.phoneNumber.toLowerCase() === q) ||
        r.name.toLowerCase() === q
      );
    });

    if (foundOther) {
      return {
        event,
        error: `Participant "${foundOther.name}" (${foundOther.rollNumber}) is found in the system but is not registered for ${event.name}.`,
      };
    }

    return {
      event,
      error: `Participant not found for "${queryInput}". Please enter a registered participant email or roll number.`,
    };
  }

  // 3. Status checks
  if (participant.status === 'withdrawn') {
    return {
      event,
      error: `Participant "${participant.name}" is withdrawn from ${event.name}.`,
    };
  }

  if (participant.status !== 'active' && participant.status !== 'valid') {
    return {
      event,
      error: `Participant "${participant.name}" has status "${participant.status}" and cannot receive group emails.`,
    };
  }

  return { participant, event };
}

/**
 * Send Reminders for an event to all eligible participants.
 * Eligible: registered for event, status 'active' or 'valid', not withdrawn, no duplicate.
 */
export async function dispatchReminderEmails(eventId?: string): Promise<{
  totalSent: number;
  totalFailed: number;
  skippedCount: number;
  errors: string[];
}> {
  const targetEvent = eventId
    ? ((await db.getEventById(eventId)) || (await db.getActiveEvent()))
    : await db.getActiveEvent();

  const registrations = await db.getEventRegistrations(targetEvent.id);
  const eligible = registrations.filter(r => r.status === 'active' || r.status === 'valid');

  let totalSent = 0;
  let totalFailed = 0;
  let skippedCount = 0;
  const errors: string[] = [];

  for (const reg of eligible) {
    const alreadySent = await hasEmailBeenSent(targetEvent.id, reg.id, 'reminder');
    if (alreadySent) {
      skippedCount++;
      continue;
    }

    const template = renderReminderEmail(targetEvent, reg);
    const email = getRecipientEmail(reg.rollNumber, reg.phoneNumber);
    const result = await sendEmailDirectly({
      to: email,
      subject: template.subject,
      text: template.text,
      html: template.html,
    });

    if (result.success) {
      totalSent++;
      await recordEmailLog({
        eventId: targetEvent.id,
        eventName: targetEvent.name,
        participantId: reg.id,
        recipientEmail: email,
        recipientName: reg.name,
        emailType: 'reminder',
        status: result.status,
        provider: result.provider,
        messageId: result.messageId,
        subject: template.subject,
        previewText: template.text.slice(0, 100),
        sentAt: Date.now(),
      });
    } else {
      totalFailed++;
      errors.push(`${reg.name} (${reg.rollNumber}): ${result.error}`);
      await recordEmailLog({
        eventId: targetEvent.id,
        eventName: targetEvent.name,
        participantId: reg.id,
        recipientEmail: email,
        recipientName: reg.name,
        emailType: 'reminder',
        status: 'failed',
        provider: result.provider,
        errorMessage: result.error,
        subject: template.subject,
        previewText: template.text.slice(0, 100),
      });
    }
  }

  return { totalSent, totalFailed, skippedCount, errors };
}

/**
 * Send Reveal Emails to all eligible participants in published groups.
 * Strict verification: Event published, groups locked, integrity passed, participant active & in group.
 */
export async function dispatchRevealEmails(eventId?: string): Promise<{
  totalSent: number;
  totalFailed: number;
  skippedCount: number;
  errors: string[];
}> {
  const targetEvent = eventId
    ? ((await db.getEventById(eventId)) || (await db.getActiveEvent()))
    : await db.getActiveEvent();

  if (!targetEvent.isPublished) {
    return {
      totalSent: 0,
      totalFailed: 0,
      skippedCount: 0,
      errors: ['Event is not published yet. Reveal emails can only be sent after publishing.'],
    };
  }

  const registrations = await db.getEventRegistrations(targetEvent.id);
  const groups = await db.getEventGroups(targetEvent.id);
  const allRegistrations = await db.getAllRegistrations();

  const groupMap = new Map<string, Group>();
  for (const g of groups) {
    groupMap.set(g.id, g);
  }

  let totalSent = 0;
  let totalFailed = 0;
  let skippedCount = 0;
  const errors: string[] = [];

  for (const reg of registrations) {
    if (reg.status !== 'active' && reg.status !== 'valid') {
      continue; // Withdrawn, duplicate, or invalid
    }
    if (!reg.groupId || !groupMap.has(reg.groupId)) {
      continue; // No valid group
    }

    const alreadySent = await hasEmailBeenSent(targetEvent.id, reg.id, 'reveal');
    if (alreadySent) {
      skippedCount++;
      continue;
    }

    const group = groupMap.get(reg.groupId)!;
    const template = await renderRevealEmail(targetEvent, reg, group, groups, allRegistrations);
    const email = getRecipientEmail(reg.rollNumber, reg.phoneNumber);

    const result = await sendEmailDirectly({
      to: email,
      subject: template.subject,
      text: template.text,
      html: template.html,
    });

    if (result.success) {
      totalSent++;
      await recordEmailLog({
        eventId: targetEvent.id,
        eventName: targetEvent.name,
        participantId: reg.id,
        recipientEmail: email,
        recipientName: reg.name,
        emailType: 'reveal',
        status: result.status,
        provider: result.provider,
        messageId: result.messageId,
        subject: template.subject,
        previewText: template.text.slice(0, 100),
        sentAt: Date.now(),
      });
    } else {
      totalFailed++;
      errors.push(`${reg.name} (${reg.rollNumber}): ${result.error}`);
      await recordEmailLog({
        eventId: targetEvent.id,
        eventName: targetEvent.name,
        participantId: reg.id,
        recipientEmail: email,
        recipientName: reg.name,
        emailType: 'reveal',
        status: 'failed',
        provider: result.provider,
        errorMessage: result.error,
        subject: template.subject,
        previewText: template.text.slice(0, 100),
      });
    }
  }

  return { totalSent, totalFailed, skippedCount, errors };
}

/**
 * Get all email logs for admin view.
 */
export async function getEmailLogs(): Promise<EmailLog[]> {
  if (isPostgresConfigured()) {
    try {
      const res = await query(`SELECT * FROM email_logs ORDER BY created_at DESC LIMIT 200;`);
      return res.rows.map(row => ({
        id: row.id,
        eventId: row.event_id,
        participantId: row.participant_id,
        recipientEmail: row.recipient_email,
        recipientName: row.recipient_name,
        emailType: row.email_type,
        status: row.status,
        provider: row.provider || 'simulation',
        messageId: row.message_id,
        errorMessage: row.error_message,
        subject: row.subject,
        previewText: row.preview_text,
        sentAt: row.sent_at ? Number(row.sent_at) : null,
        createdAt: Number(row.created_at),
      }));
    } catch {
      // fallback
    }
  }
  return [...inMemoryEmailLogs];
}

/**
 * Handle delivery webhooks from providers (e.g. Resend, SendGrid).
 */
export async function handleEmailWebhook(payload: any): Promise<{ success: boolean; updated: boolean; status?: string }> {
  const type = payload?.type;
  const messageId = payload?.data?.email_id || payload?.data?.id || payload?.messageId || payload?.id;

  if (!messageId) return { success: false, updated: false };

  let newStatus: 'delivered' | 'failed' | null = null;
  let errorMsg: string | null = null;

  if (type === 'email.delivered' || type === 'delivered') {
    newStatus = 'delivered';
  } else if (type === 'email.bounced' || type === 'email.complained' || type === 'bounce' || type === 'failed' || type === 'email.delivery_delayed') {
    newStatus = 'failed';
    errorMsg = payload?.data?.reason || payload?.reason || 'Delivery Bounced/Rejected';
  }

  if (newStatus) {
    if (isPostgresConfigured()) {
      await query(
        `UPDATE email_logs SET status = $1, error_message = $2 WHERE message_id = $3;`,
        [newStatus, errorMsg, messageId]
      );
    }
    const mem = inMemoryEmailLogs.find(l => l.messageId === messageId);
    if (mem) {
      mem.status = newStatus;
      if (errorMsg) mem.errorMessage = errorMsg;
    }
    return { success: true, updated: true, status: newStatus };
  }

  return { success: true, updated: false };
}

/**
 * Retry all failed emails.
 */
export async function retryFailedEmails(): Promise<{ retriedCount: number; successCount: number; errors: string[] }> {
  const allLogs = await getEmailLogs();
  const failed = allLogs.filter(l => l.status === 'failed');

  let retriedCount = 0;
  let successCount = 0;
  const errors: string[] = [];

  for (const item of failed) {
    retriedCount++;
    const event = await db.getEventById(item.eventId);
    if (!event) continue;

    let res: SendEmailResult | undefined;
    if (item.emailType === 'reminder') {
      const template = renderReminderEmail(event);
      res = await sendEmailDirectly({
        to: item.recipientEmail,
        subject: template.subject,
        text: template.text,
        html: template.html,
      });
    } else {
      // Reveal email retry
      const allRegs = await db.getAllRegistrations();
      const reg = allRegs.find(r => r.id === item.participantId);
      const groups = await db.getEventGroups(event.id);
      const grp = groups.find(g => g.id === reg?.groupId);

      if (reg && grp) {
        const template = await renderRevealEmail(event, reg, grp, groups, allRegs);
        res = await sendEmailDirectly({
          to: item.recipientEmail,
          subject: template.subject,
          text: template.text,
          html: template.html,
        });
      }
    }

    if (res && res.success) {
      successCount++;
      if (isPostgresConfigured()) {
        await query(
          `UPDATE email_logs SET status = $1, provider = $2, message_id = $3, sent_at = $4, error_message = NULL WHERE id = $5;`,
          [res.status, res.provider, res.messageId || null, Date.now(), item.id]
        );
      }
      item.status = res.status;
      item.provider = res.provider;
      item.messageId = res.messageId;
      item.sentAt = Date.now();
      item.errorMessage = null;
    } else if (res) {
      errors.push(`${item.recipientName}: ${res.error}`);
    }
  }

  return { retriedCount, successCount, errors };
}

/**
 * Send a test preview email to an admin-specified address with dynamic participant data.
 * NEVER uses hardcoded/sample participant data.
 */
export async function sendTestEmail(
  targetEmailOrParams:
    | string
    | {
        targetEmail: string;
        type: 'reminder' | 'reveal';
        participantQuery?: string;
        eventId?: string;
      },
  legacyType?: 'reminder' | 'reveal',
  legacyParticipantQuery?: string,
  legacyEventId?: string
): Promise<{
  success: boolean;
  status: 'sent' | 'delivered' | 'failed' | 'simulated';
  provider: 'smtp' | 'resend' | 'simulation';
  error?: string;
  messageId?: string;
  details?: string;
  previewData?: {
    participantName: string;
    participantRoll: string;
    eventName: string;
  };
}> {
  let targetEmail: string;
  let type: 'reminder' | 'reveal';
  let participantQuery: string | undefined;
  let eventId: string | undefined;

  if (typeof targetEmailOrParams === 'object') {
    targetEmail = targetEmailOrParams.targetEmail;
    type = targetEmailOrParams.type;
    participantQuery = targetEmailOrParams.participantQuery;
    eventId = targetEmailOrParams.eventId;
  } else {
    targetEmail = targetEmailOrParams;
    type = legacyType || 'reminder';
    participantQuery = legacyParticipantQuery;
    eventId = legacyEventId;
  }

  const activeEvent = eventId
    ? ((await db.getEventById(eventId)) || (await db.getActiveEvent()))
    : await db.getActiveEvent();

  if (!activeEvent) {
    return {
      success: false,
      status: 'failed',
      provider: 'smtp',
      error: 'No active event found to generate preview.',
    };
  }

  // 1. Resolve participant dynamically
  const queryStr = (participantQuery || '').trim() || targetEmail.trim();
  const resLookup = await findParticipantForPreview(queryStr, activeEvent.id);

  let template: { subject: string; text: string; html: string };
  let previewParticipant: Registration | undefined;

  if (type === 'reminder') {
    if (resLookup.participant) {
      previewParticipant = resLookup.participant;
      template = renderReminderEmail(activeEvent, previewParticipant);
    } else {
      // If participantQuery was explicitly passed and not found, report error
      if (participantQuery && participantQuery.trim()) {
        return {
          success: false,
          status: 'failed',
          provider: 'smtp',
          error: resLookup.error || `Participant "${participantQuery}" not found in event ${activeEvent.name}.`,
        };
      }
      // Otherwise render general reminder
      template = renderReminderEmail(activeEvent);
    }
  } else {
    // Reveal email preview REQUIRES dynamic participant lookup
    if (!resLookup.participant) {
      return {
        success: false,
        status: 'failed',
        provider: 'smtp',
        error:
          resLookup.error ||
          'Test reveal preview requires a registered participant. Enter a registered participant email or roll number.',
      };
    }

    previewParticipant = resLookup.participant;
    const allGroups = await db.getEventGroups(activeEvent.id);
    const participantGroup = allGroups.find(g => g.id === previewParticipant?.groupId);

    if (!participantGroup) {
      return {
        success: false,
        status: 'failed',
        provider: 'smtp',
        error: `Participant "${previewParticipant.name}" does not have an assigned group in ${activeEvent.name}. Mix groups or assign a group first.`,
      };
    }

    const allRegs = await db.getAllRegistrations();
    template = await renderRevealEmail(activeEvent, previewParticipant, participantGroup, allGroups, allRegs);
  }

  const res = await sendEmailDirectly({
    to: targetEmail,
    subject: `[TEST] ${template.subject}`,
    text: template.text,
    html: template.html,
  });

  const previewParticipantName = previewParticipant?.name || 'General';
  await recordEmailLog({
    eventId: activeEvent.id,
    eventName: activeEvent.name,
    recipientEmail: targetEmail,
    recipientName: `[Preview: ${previewParticipantName}]`,
    emailType: 'test',
    status: res.status,
    provider: res.provider,
    messageId: res.messageId,
    errorMessage: res.error,
    subject: `[TEST] ${template.subject}`,
    previewText: template.text.slice(0, 100),
    sentAt: res.success ? Date.now() : null,
  });

  return {
    ...res,
    previewData: previewParticipant
      ? {
          participantName: previewParticipant.name,
          participantRoll: previewParticipant.rollNumber,
          eventName: activeEvent.name,
        }
      : undefined,
  };
}

/**
 * AUTOMATED SERVER-SIDE BACKGROUND SCHEDULER
 * Checks every 30 seconds:
 * 1. Reminder: 1 hour (<= 60 mins) before revealTime
 * 2. Reveal: At or after revealTime if published
 */
let schedulerInterval: NodeJS.Timeout | null = null;

export function startEmailScheduler() {
  if (schedulerInterval) return;

  console.log('[Email Scheduler] Started ₹0 automated server-side email scheduler (30s tick)');

  schedulerInterval = setInterval(async () => {
    try {
      const now = Date.now();
      const events = await db.getEvents();

      for (const evt of events) {
        const revealMs = new Date(evt.revealTime).getTime();
        const diffMinutes = (revealMs - now) / (1000 * 60);

        // 1. Send Reminder if between 0 and 65 minutes before reveal time
        if (diffMinutes > 0 && diffMinutes <= 65) {
          // Check if reminders pending
          await dispatchReminderEmails(evt.id);
        }

        // 2. Send Reveal email if at or after reveal time and published
        if (now >= revealMs && evt.isPublished && evt.groupsLocked) {
          await dispatchRevealEmails(evt.id);
        }
      }
    } catch (err: any) {
      console.error('[Email Scheduler] Tick error:', err.message);
    }
  }, 30000);
}
