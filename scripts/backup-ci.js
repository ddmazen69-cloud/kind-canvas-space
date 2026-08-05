#!/usr/bin/env node
const { createClient } = require('@supabase/supabase-js');

const DATA_TABLES = ["customers", "suppliers", "invoices", "invoice_items", "payments", "purchases", "purchase_items", "supplier_payments", "stock_items", "stock_adjustments", "expenses"];
const BACKUP_TABLES = [...DATA_TABLES, 'shop_settings'];

function stamp() { return new Date().toISOString().slice(0,10); }

async function main() {
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars');
    process.exit(2);
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

  // Ensure bucket exists (best-effort)
  try {
    const { data: buckets } = await supabase.storage.listBuckets();
    if (!buckets.find(b => b.name === 'backups')) {
      console.log('Creating backups bucket');
      await supabase.storage.createBucket('backups', { public: false });
    }
  } catch (e) {
    console.warn('Could not ensure backups bucket exists:', e?.message || e);
  }

  // list users
  let users = [];
  try {
    const res = await supabase.auth.admin.listUsers();
    users = res.data || [];
  } catch (e) {
    console.error('Failed to list users:', e?.message || e);
    process.exit(3);
  }

  for (const u of users) {
    const userId = u.id;
    console.log('Backing up user', userId);
    const tables = {};
    for (const table of BACKUP_TABLES) {
      try {
        const { data, error } = await supabase.from(table).select('*').eq('user_id', userId);
        if (error) {
          console.warn(`Warning: error selecting ${table}:`, error.message);
          tables[table] = [];
        } else {
          tables[table] = data || [];
        }
      } catch (e) {
        console.warn(`Warning: failed ${table}:`, e?.message || e);
        tables[table] = [];
      }
    }

    const payload = { app: 'segilly', version: 1, exportedAt: new Date().toISOString(), tables };
    const filename = `segilly-backup-${stamp()}.json`;
    const path = `${userId}/${filename}`;
    try {
      const buf = Buffer.from(JSON.stringify(payload, null, 2));
      const { error: uploadErr } = await supabase.storage.from('backups').upload(path, buf, { upsert: true, contentType: 'application/json' });
      if (uploadErr) {
        console.error('Upload error for', userId, uploadErr.message);
      } else {
        console.log('Uploaded', path);
      }
    } catch (e) {
      console.error('Failed to upload for', userId, e?.message || e);
    }
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
