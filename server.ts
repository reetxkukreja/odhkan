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
  const { name, rollNumber, phoneNumber } = req.body;

  if (!name || !rollNumber || !phoneNumber) {
    return res.status(400).json({
      success: false,
      error: 'Please provide your name, college roll number, and phone number.',
    });
  }

  try {
    const result = await db.join(name, rollNumber, phoneNumber);

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
  const { rollNumber } = req.body;

  if (!rollNumber) {
    return res.status(400).json({
      registered: false,
      isRevealed: false,
      error: 'Please enter your college roll number.',
    });
  }

  try {
    const result = await db.getParticipantStatus(rollNumber);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ registered: false, isRevealed: false, error: err.message });
  }
});

// 2c. Can't make it today - Participant self-withdrawal flow
app.post('/api/participants/withdraw', async (req: Request, res: Response) => {
  const { rollNumber } = req.body;

  if (!rollNumber) {
    return res.status(400).json({
      success: false,
      error: 'Please enter your college roll number.',
    });
  }

  try {
    const result = await db.withdraw(rollNumber);
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
  const { rollNumber } = req.body;

  if (!rollNumber) {
    return res.status(400).json({
      success: false,
      error: 'Please enter your college roll number.',
    });
  }

  try {
    const result = await db.revealGroupForRoll(rollNumber);
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
  const { rollNumber } = req.body;

  if (!rollNumber) {
    return res.status(400).json({
      success: false,
      error: 'Please enter your college roll number.',
    });
  }

  try {
    const result = await db.getGroupContactsForRoll(rollNumber);
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

// Full Admin Dashboard Data
app.get('/api/admin/data', requireAdminAuth, async (req: Request, res: Response) => {
  try {
    const data = await db.getAdminData();
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Toggle Registration Open/Closed
app.post('/api/admin/toggle-registration', requireAdminAuth, async (req: Request, res: Response) => {
  const { isOpen } = req.body;
  try {
    const status = await db.toggleRegistration(Boolean(isOpen));
    await broadcastStatusUpdate();
    res.json({ success: true, registrationOpen: status });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Step 3: Check for duplicates
app.post('/api/admin/duplicate-check', requireAdminAuth, async (req: Request, res: Response) => {
  try {
    const check = await db.runDuplicateCheck();
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
  try {
    const result = await db.mixMatch();
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
  try {
    const result = await db.lockGroups();
    await broadcastStatusUpdate();
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Step 7: Final Integrity Pre-Publish Check
app.post('/api/admin/final-check', requireAdminAuth, async (req: Request, res: Response) => {
  try {
    const check = await db.runFinalIntegrityCheck();
    await broadcastStatusUpdate();
    res.json(check);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Step 8: Publish Final List
app.post('/api/admin/publish-final-list', requireAdminAuth, async (req: Request, res: Response) => {
  try {
    const result = await db.publishFinalList();
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

// Export Data (JSON/CSV)
app.get('/api/admin/export', requireAdminAuth, async (req: Request, res: Response) => {
  const format = req.query.format === 'csv' ? 'csv' : 'json';
  try {
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

// -------------------------------------------------------------
// VITE INTEGRATION / STATIC ASSETS
// -------------------------------------------------------------

async function start() {
  // Initialize database schema and connections
  await db.init();

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
