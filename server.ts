import express, { Request, Response } from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import fs from 'fs';
import { exec } from 'child_process';
import { initializeApp } from 'firebase/app';
import {
  getFirestore,
  collection,
  doc,
  getDocs,
  writeBatch,
  terminate,
} from 'firebase/firestore';
import config from './firebase-applet-config.json';
import { computeSyncPlan, executeSyncPlan } from './scripts/sync_firestore';

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

// Body parser
app.use(express.json({ limit: '15mb' }));
app.use(express.urlencoded({ extended: true, limit: '15mb' }));

/**
 * GET /api/csv-data
 * Returns the current disk contents of dealers.csv, legacy_leads.csv, and reconciliation.csv
 */
app.get('/api/csv-data', (req: Request, res: Response) => {
  try {
    const dealersPath = path.resolve('data/dealers.csv');
    const leadsPath = path.resolve('data/legacy_leads.csv');
    const reconciliationPath = path.resolve('reports/reconciliation.csv');

    const dealersCsv = fs.existsSync(dealersPath) ? fs.readFileSync(dealersPath, 'utf-8') : '';
    const leadsCsv = fs.existsSync(leadsPath) ? fs.readFileSync(leadsPath, 'utf-8') : '';
    const reconciliationCsv = fs.existsSync(reconciliationPath) ? fs.readFileSync(reconciliationPath, 'utf-8') : '';

    res.json({
      success: true,
      dealersCsv,
      leadsCsv,
      reconciliationCsv,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/dealers
 * Appends or updates a dealer in data/dealers.csv so disk data stays in sync with Firestore
 */
app.post('/api/dealers', (req: Request, res: Response) => {
  try {
    const { dealerId, name, city, state, pincodePrefixes, contactPerson, phone, email } = req.body;
    if (!dealerId || !name || !pincodePrefixes) {
      return res.status(400).json({
        success: false,
        error: 'dealerId, name, and pincodePrefixes are required.',
      });
    }

    const dealersPath = path.resolve('data/dealers.csv');
    let dealersLines: string[] = [];
    if (fs.existsSync(dealersPath)) {
      dealersLines = fs.readFileSync(dealersPath, 'utf-8').split('\n').filter((l) => l.trim().length > 0);
    } else {
      dealersLines = ['dealer_id,dealer_name,city,state,pincode_prefixes,contact_person,phone,email'];
    }

    const safeCsv = (val?: string) => {
      const s = (val || '').trim();
      if (s.includes(',') || s.includes('"')) {
        return `"${s.replace(/"/g, '""')}"`;
      }
      return s;
    };

    const headers = dealersLines[0].split(',').map((h) => h.trim());
    const fieldMap: Record<string, string> = {
      dealer_id: dealerId.trim(),
      dealer_name: safeCsv(name),
      city: safeCsv(city || ''),
      state: safeCsv(state || ''),
      pincode_prefixes: pincodePrefixes.trim(),
      contact_person: safeCsv(contactPerson || ''),
      contact_email: email ? email.trim() : '',
      email: email ? email.trim() : '',
      phone: phone ? phone.trim() : '',
    };
    const newRow = headers.map((h) => (fieldMap[h] !== undefined ? fieldMap[h] : '')).join(',');

    // Check if dealer already exists in CSV
    let foundIndex = -1;
    for (let i = 1; i < dealersLines.length; i++) {
      const parts = dealersLines[i].split(',');
      if (parts[0].trim() === dealerId.trim()) {
        foundIndex = i;
        break;
      }
    }

    if (foundIndex >= 1) {
      dealersLines[foundIndex] = newRow;
    } else {
      dealersLines.push(newRow);
    }

    fs.writeFileSync(dealersPath, dealersLines.join('\n') + '\n', 'utf-8');

    res.json({
      success: true,
      dealer: {
        dealerId: dealerId.trim(),
        name: name.trim(),
        city: (city || '').trim(),
        state: (state || '').trim(),
        pincodePrefixes: pincodePrefixes.trim(),
        contactPerson: (contactPerson || '').trim(),
        phone: (phone || '').trim(),
        email: (email || '').trim(),
      },
    });
  } catch (error: any) {
    console.error('Error updating dealers.csv: ', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/upload-and-clean
 * Accepts updated CSV contents (dealersCsv, leadsCsv), executes the Python cleaning script,
 * and optionally syncs the cleaned data directly to Firebase Firestore.
 */
app.post('/api/upload-and-clean', async (req: Request, res: Response) => {
  try {
    const { dealersCsv, leadsCsv, commit = false, prune = true } = req.body;

    const dealersPath = path.resolve('data/dealers.csv');
    const leadsPath = path.resolve('data/legacy_leads.csv');
    const reportPath = path.resolve('reports/reconciliation.csv');
    const cleanedJsonPath = path.resolve('reports/cleaned_data.json');

    // 1. Save uploaded CSV content to data directory if supplied
    if (dealersCsv && typeof dealersCsv === 'string') {
      fs.mkdirSync(path.dirname(dealersPath), { recursive: true });
      fs.writeFileSync(dealersPath, dealersCsv.trim() + '\n', 'utf-8');
    }

    if (leadsCsv && typeof leadsCsv === 'string') {
      fs.mkdirSync(path.dirname(leadsPath), { recursive: true });
      fs.writeFileSync(leadsPath, leadsCsv.trim() + '\n', 'utf-8');
    }

    // 2. Execute Python Cleaning Script (scripts/clean_and_import.py)
    const pythonCmd = `python3 scripts/clean_and_import.py --dealers "${dealersPath}" --leads "${leadsPath}" --report "${reportPath}" --export-json "${cleanedJsonPath}"`;

    exec(pythonCmd, async (error, stdout, stderr) => {
      if (error) {
        console.error('Python execution error: ', error);
        return res.status(500).json({
          success: false,
          error: `Python cleaner failed: ${error.message}`,
          details: stderr || stdout,
        });
      }

      // Read output files
      let reconciliationRows: any[] = [];
      let cleanedData: any = null;

      if (fs.existsSync(reportPath)) {
        const rawReport = fs.readFileSync(reportPath, 'utf-8');
        const lines = rawReport.trim().split('\n');
        for (let i = 1; i < lines.length; i++) {
          const l = lines[i].trim();
          if (!l) continue;
          const firstComma = l.indexOf(',');
          const secondComma = l.indexOf(',', firstComma + 1);
          if (firstComma > -1 && secondComma > -1) {
            const lead_id = l.slice(0, firstComma).trim();
            const action = l.slice(firstComma + 1, secondComma).trim();
            let reason = l.slice(secondComma + 1).trim();
            if (reason.startsWith('"') && reason.endsWith('"')) {
              reason = reason.slice(1, -1);
            }
            reconciliationRows.push({ lead_id, action, reason });
          }
        }
      }

      if (fs.existsSync(cleanedJsonPath)) {
        cleanedData = JSON.parse(fs.readFileSync(cleanedJsonPath, 'utf-8'));
      }

      // 3. If commit is requested, execute batch synchronization to Firestore
      let commitResult = null;
      if (commit) {
        const fbApp = initializeApp(config);
        const fbDb = getFirestore(fbApp, config.firestoreDatabaseId);
        try {
          const plan = await computeSyncPlan(fbDb, dealersPath, leadsPath, true);
          commitResult = await executeSyncPlan(fbDb, plan, prune);
        } catch (syncErr: any) {
          console.error('Firestore commit error: ', syncErr);
          return res.status(500).json({
            success: false,
            error: `Python executed but Firestore sync failed: ${syncErr.message}`,
            pythonOutput: stdout,
            reconciliationRows,
          });
        } finally {
          await terminate(fbDb);
        }
      }

      return res.json({
        success: true,
        pythonOutput: stdout,
        reconciliation: reconciliationRows,
        stats: cleanedData?.stats || null,
        committed: commit,
        commitResult,
      });
    });
  } catch (err: any) {
    console.error('Upload and clean endpoint error: ', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Setup Vite middleware in dev or static files in production
async function startServer() {
  const isProd = process.env.NODE_ENV === 'production';

  if (!isProd) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.resolve('dist')));
    app.get('*', (req: Request, res: Response) => {
      res.sendFile(path.resolve('dist', 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Dealer Lead Router server running at http://0.0.0.0:${PORT}`);
  });
}

startServer();
