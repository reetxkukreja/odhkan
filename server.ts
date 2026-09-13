import express, { Request, Response, NextFunction } from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { db } from './server/db';
import {
  verifyAdminCredentials,
  createAdminSession,
  validateSessionToken,
  invalidateSession,
} from './server/auth';

const app = express();
const PORT = 3000;

app.use(express.json());

// SSE Clients for instant real-time live counter updates
let sseClients: Response[] = [];

async function broadcastStatusUpdate() {
  try {
    const status = await db.getPublicStatus();
    const payload = `data: ${JSON.stringify(status)}\n\n`;
    sseClients.forEach(client => {
      try {
        client.write(payload);
      } catch {
        // client dropped
      }
    });
  } catch (err) {
    console.error('Error broadcasting status update:', err);
  }
}

// -------------------------------------------------------------
// ADMIN AUTHENTICATION MIDDLEWARE
// -------------------------------------------------------------
function requireAdminAuth(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  const token = authHeader?.replace(/^Bearer\s+/i, '');

  if (!validateSessionToken(token)) {
    return res.status(401).json({
      success: false,
      error: 'Unauthorized. Admin session invalid or expired.',
    });
  }

  next();
}

// -------------------------------------------------------------
// PUBLIC APIS (NO BATCH INFORMATION OR ROSTER EXPOSED!)
// -------------------------------------------------------------

// 1. Live status & counter
app.get('/api/public/status', async (req: Request, res: Response) => {
  try {
    const status = await db.getPublicStatus();
    res.json(status);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to fetch public status' });
  }
});

// Real-time SSE stream for participant count and event transition
app.get('/api/public/stream', async (req: Request, res: Response) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  // Send initial state immediately
  try {
    const status = await db.getPublicStatus();
    res.write(`data: ${JSON.stringify(status)}\n\n`);
  } catch {
    // ignore
  }

  sseClients.push(res);

  req.on('close', () => {
    sseClients = sseClients.filter(c => c !== res);
  });
});

// 2. Join Odhkan
app.post('/api/participants/join', async (req: Request, res: Response) => {
  const { name, rollNumber, phoneNumber, eventId } = req.body;

  if (!name || !rollNumber || !phoneNumber) {
    return res.status(400).json({
      success: false,
      error: 'Please provide your name, college roll number, and phone number.',
    });
  }

  try {
    const result = await db.join(name, rollNumber, phoneNumber, eventId);

    if (!result.success) {
      return res.status(400).json(result);
    }

    // Broadcast updated count to all connected browsers
    await broadcastStatusUpdate();

    res.json(result);
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message || 'Failed to register' });
  }
});

// 2b. Check participant status
app.post('/api/participants/status', async (req: Request, res: Response) => {
  const { rollNumber, eventId } = req.body;

  if (!rollNumber) {
    return res.status(400).json({
      registered: false,
      isRevealed: false,
      error: 'Please enter your college roll number.',
    });
  }

  try {
    const result = await db.getParticipantStatus(rollNumber, eventId);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ registered: false, isRevealed: false, error: err.message });
  }
});

// 2c. Can't make it today - Participant self-withdrawal flow
app.post('/api/participants/withdraw', async (req: Request, res: Response) => {
  const { rollNumber, eventId } = req.body;

  if (!rollNumber) {
    return res.status(400).json({
      success: false,
      error: 'Please enter your college roll number.',
    });
  }

  try {
    const result = await db.withdraw(rollNumber, eventId);
    if (!result.success) {
      return res.status(400).json(result);
    }

    // Broadcast updated count immediately
    await broadcastStatusUpdate();

    res.json(result);
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message || 'Failed to withdraw' });
  }
});

// 3. Reveal group for participant (Only available when published!)
// Privacy: Never returns phone numbers in default reveal
app.post('/api/group/reveal-my-group', async (req: Request, res: Response) => {
  const { rollNumber, eventId } = req.body;

  if (!rollNumber) {
    return res.status(400).json({
      success: false,
      error: 'Please enter your college roll number.',
    });
  }

  try {
    const result = await db.revealGroupForRoll(rollNumber, eventId);
    if (!result.success) {
      return res.status(400).json(result);
    }

    res.json(result);
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 3b. Controlled Group Contact info (Revealed ONLY on explicit user choice)
app.post('/api/group/contacts', async (req: Request, res: Response) => {
  const { rollNumber, eventId } = req.body;

  if (!rollNumber) {
    return res.status(400).json({
      success: false,
      error: 'Please enter your college roll number.',
    });
  }

  try {
    const result = await db.getGroupContactsForRoll(rollNumber, eventId);
    if (!result.success) {
      return res.status(400).json(result);
    }

    res.json(result);
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// -------------------------------------------------------------
// ADMIN AUTHENTICATION ROUTES
// -------------------------------------------------------------

app.post('/api/admin/login', (req: Request, res: Response) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({
      success: false,
      error: 'Username and password are required.',
    });
  }

  const isValid = verifyAdminCredentials(username, password);
  if (!isValid) {
    return res.status(401).json({
      success: false,
      error: 'Invalid organizer credentials.',
    });
  }

  const token = createAdminSession(username.trim());
  res.json({
    success: true,
    token,
    user: { username: username.trim() },
  });
});

app.post('/api/admin/logout', (req: Request, res: Response) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.replace(/^Bearer\s+/i, '');
  invalidateSession(token);
  res.json({ success: true });
});

app.get('/api/admin/me', (req: Request, res: Response) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.replace(/^Bearer\s+/i, '');
  const isValid = validateSessionToken(token);
  res.json({ authenticated: isValid });
});

// -------------------------------------------------------------
// PROTECTED ADMIN APIS
// -------------------------------------------------------------

// Full Admin Dashboard Data (supports ?eventId=...)
app.get('/api/admin/data', requireAdminAuth, async (req: Request, res: Response) => {
  try {
    const eventId = typeof req.query.eventId === 'string' ? req.query.eventId : undefined;
    const data = await db.getAdminData(eventId);
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// -------------------------------------------------------------
// EVENTS MANAGEMENT APIS
// -------------------------------------------------------------

// List all events
app.get('/api/admin/events', requireAdminAuth, async (req: Request, res: Response) => {
  try {
    const events = await db.getEvents();
    res.json({ success: true, events });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Create a new future event
app.post('/api/admin/events', requireAdminAuth, async (req: Request, res: Response) => {
  try {
    const newEvent = await db.createEvent(req.body);
    await broadcastStatusUpdate();
    res.json({ success: true, event: newEvent });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// Update an existing event
app.put('/api/admin/events/:id', requireAdminAuth, async (req: Request, res: Response) => {
  try {
    const updated = await db.updateEvent(req.params.id, req.body);
    if (!updated) {
      return res.status(404).json({ success: false, error: 'Event not found.' });
    }
    await broadcastStatusUpdate();
    res.json({ success: true, event: updated });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// Delete an event
app.delete('/api/admin/events/:id', requireAdminAuth, async (req: Request, res: Response) => {
  try {
    const deleted = await db.deleteEvent(req.params.id);
    if (!deleted) {
      return res.status(404).json({ success: false, error: 'Event not found.' });
    }
    await broadcastStatusUpdate();
    res.json({ success: true });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// Activate an event as the current active event
app.post('/api/admin/events/:id/activate', requireAdminAuth, async (req: Request, res: Response) => {
  try {
    const active = await db.setActiveEvent(req.params.id);
    if (!active) {
      return res.status(404).json({ success: false, error: 'Event not found.' });
    }
    await broadcastStatusUpdate();
    res.json({ success: true, event: active });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// Get participant history for an event (cross-event tracking)
app.get('/api/admin/events/:id/history', requireAdminAuth, async (req: Request, res: Response) => {
  try {
    const history = await db.getEventHistory(req.params.id);
    res.json({ success: true, history });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Toggle Registration Open/Closed
app.post('/api/admin/toggle-registration', requireAdminAuth, async (req: Request, res: Response) => {
  const { isOpen, eventId } = req.body;
  try {
    const status = await db.toggleRegistration(Boolean(isOpen), eventId);
    await broadcastStatusUpdate();
    res.json({ success: true, registrationOpen: status });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Step 3: Check for duplicates
app.post('/api/admin/duplicate-check', requireAdminAuth, async (req: Request, res: Response) => {
  const { eventId } = req.body;
  try {
    const check = await db.runDuplicateCheck(eventId);
    await broadcastStatusUpdate();
    res.json(check);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Duplicate review: Keep first or Keep latest
app.post('/api/admin/resolve-duplicate', requireAdminAuth, async (req: Request, res: Response) => {
  const { rollNumber, choice } = req.body;
  if (!rollNumber || !choice) {
    return res.status(400).json({ success: false, error: 'rollNumber and choice required' });
  }

  try {
    const result = await db.resolveDuplicate(rollNumber, choice);
    await broadcastStatusUpdate();
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Step 5: Mix Match
app.post('/api/admin/mix-match', requireAdminAuth, async (req: Request, res: Response) => {
  const { eventId } = req.body;
  try {
    const result = await db.mixMatch(eventId);
    await broadcastStatusUpdate();
    if (!result.success) {
      return res.status(400).json(result);
    }
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Step 6: Lock Groups
app.post('/api/admin/lock-groups', requireAdminAuth, async (req: Request, res: Response) => {
  const { eventId } = req.body;
  try {
    const result = await db.lockGroups(eventId);
    await broadcastStatusUpdate();
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Step 7: Final Integrity Pre-Publish Check
app.post('/api/admin/final-check', requireAdminAuth, async (req: Request, res: Response) => {
  const { eventId } = req.body;
  try {
    const check = await db.runFinalIntegrityCheck(eventId);
    await broadcastStatusUpdate();
    res.json(check);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Step 8: Publish Final List
app.post('/api/admin/publish-final-list', requireAdminAuth, async (req: Request, res: Response) => {
  const { eventId } = req.body;
  try {
    const result = await db.publishFinalList(eventId);
    await broadcastStatusUpdate();
    if (!result.success) {
      return res.status(400).json(result);
    }
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Reset Data for testing
app.post('/api/admin/reset-data', requireAdminAuth, async (req: Request, res: Response) => {
  try {
    const result = await db.resetDevData();
    await broadcastStatusUpdate();
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Clear Data to test zero-state
app.post('/api/admin/clear-data', requireAdminAuth, async (req: Request, res: Response) => {
  try {
    const result = await db.clearAllData();
    await broadcastStatusUpdate();
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Add single participant directly for testing
app.post('/api/admin/add-participant', requireAdminAuth, async (req: Request, res: Response) => {
  const { name, rollNumber, phoneNumber } = req.body;
  try {
    const result = await db.join(name, rollNumber, phoneNumber || '9876543210');
    await broadcastStatusUpdate();
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Export Data (Excel / CSV / JSON)
app.get('/api/admin/export', requireAdminAuth, async (req: Request, res: Response) => {
  const format = req.query.format as string;
  try {
    if (format === 'excel' || format === 'xlsx') {
      const { generateOdhkanExcelBuffer } = await import('./server/excel');
      const buffer = await generateOdhkanExcelBuffer();
      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      );
      res.setHeader('Content-Disposition', 'attachment; filename="odhkan-master-export.xlsx"');
      return res.send(buffer);
    }

    const data = await db.getAdminData();

    if (format === 'csv') {
      let csv = 'ID,Name,Roll Number,Batch,Phone,Registered At,Status,Group ID\n';
      data.registrations.forEach(p => {
        csv += `"${p.id}","${p.name}","${p.rollNumber}","${p.batch}","${p.phoneNumber || ''}","${new Date(p.registeredAt).toISOString()}","${p.status}","${p.groupId || 'Unassigned'}"\n`;
      });
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="odhkan-registrations.csv"');
      return res.send(csv);
    }

    res.setHeader('Content-Disposition', 'attachment; filename="odhkan-data.json"');
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Dedicated Excel Export Endpoint
app.get('/api/admin/export/excel', requireAdminAuth, async (req: Request, res: Response) => {
  try {
    const { generateOdhkanExcelBuffer } = await import('./server/excel');
    const buffer = await generateOdhkanExcelBuffer();
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader('Content-Disposition', 'attachment; filename="odhkan-master-export.xlsx"');
    res.send(buffer);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Comprehensive Historical Analytics Endpoint
app.get('/api/admin/analytics', requireAdminAuth, async (req: Request, res: Response) => {
  try {
    const { getHistoricalAnalytics } = await import('./server/analytics');
    const analytics = await getHistoricalAnalytics();
    res.json({ success: true, ...analytics });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// -------------------------------------------------------------
// EMAIL MANAGEMENT & AUTOMATION APIS (100% FREE ₹0 SYSTEM)
// -------------------------------------------------------------

// Fetch email provider configuration status
app.get('/api/admin/emails/provider-status', requireAdminAuth, async (req: Request, res: Response) => {
  try {
    const { getProviderStatus } = await import('./server/email');
    const status = getProviderStatus();
    res.json({ success: true, ...status });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Fetch email logs
app.get('/api/admin/emails/logs', requireAdminAuth, async (req: Request, res: Response) => {
  try {
    const { getEmailLogs } = await import('./server/email');
    const logs = await getEmailLogs();
    res.json({ success: true, logs });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Inbound email provider webhook for delivery/bounce callbacks (e.g. Resend, SendGrid)
app.post('/api/webhooks/email', async (req: Request, res: Response) => {
  try {
    const { handleEmailWebhook } = await import('./server/email');
    const result = await handleEmailWebhook(req.body);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Send 1-hour reminder emails
app.post('/api/admin/emails/send-reminders', requireAdminAuth, async (req: Request, res: Response) => {
  const { eventId } = req.body;
  try {
    const { dispatchReminderEmails } = await import('./server/email');
    const result = await dispatchReminderEmails(eventId);
    res.json({ success: true, ...result });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Send personalized reveal emails (after publish)
app.post('/api/admin/emails/send-reveal', requireAdminAuth, async (req: Request, res: Response) => {
  const { eventId } = req.body;
  try {
    const { dispatchRevealEmails } = await import('./server/email');
    const result = await dispatchRevealEmails(eventId);
    res.json({ success: true, ...result });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Retry all failed emails
app.post('/api/admin/emails/retry-failed', requireAdminAuth, async (req: Request, res: Response) => {
  try {
    const { retryFailedEmails } = await import('./server/email');
    const result = await retryFailedEmails();
    res.json({ success: true, ...result });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Send test preview email
app.post('/api/admin/emails/test', requireAdminAuth, async (req: Request, res: Response) => {
  const { email, type } = req.body;
  if (!email || !email.includes('@')) {
    return res.status(400).json({ success: false, error: 'Please enter a valid email address.' });
  }
  try {
    const { sendTestEmail } = await import('./server/email');
    const result = await sendTestEmail(email, type === 'reveal' ? 'reveal' : 'reminder');
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// -------------------------------------------------------------
// VITE INTEGRATION / STATIC ASSETS
// -------------------------------------------------------------

async function start() {
  // Initialize database schema and connections
  await db.init();

  // Start the automated ₹0 server-side email background scheduler
  const { startEmailScheduler } = await import('./server/email');
  startEmailScheduler();

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req: Request, res: Response) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`ODHKAN Server running on http://0.0.0.0:${PORT}`);
  });
}

start();
