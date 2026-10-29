const net = require('net');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const EmbeddedPostgres = require('embedded-postgres').default;

function isPortOpen(port, host = '127.0.0.1') {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(1200);
    socket.on('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.on('timeout', () => {
      socket.destroy();
      resolve(false);
    });
    socket.on('error', () => {
      resolve(false);
    });
    socket.connect(port, host);
  });
}

async function start() {
  const dbUp = await isPortOpen(5432);
  let localPg = null;

  if (!dbUp) {
    console.log('[dev] PostgreSQL is not running. Starting local database...');
    const dbDir = path.resolve(__dirname, '..', 'data', 'pgdata');
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }
    localPg = new EmbeddedPostgres({
      databaseDir: dbDir,
      user: 'safeexit',
      password: 'safeexit_dev',
      port: 5432,
      persistent: true,
    });

    try {
      await localPg.initialise();
    } catch (_) {}

    await localPg.start();

    try {
      await localPg.createDatabase('safeexit');
    } catch (_) {}

    console.log('[dev] Local PostgreSQL started on 127.0.0.1:5432');
  } else {
    console.log('[dev] PostgreSQL is running on port 5432.');
  }

  // Ensure database schema exists
  try {
    const { Client } = require('pg');
    require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });
    const client = new Client({
      connectionString: process.env.DATABASE_URL || 'postgres://safeexit:safeexit_dev@127.0.0.1:5432/safeexit'
    });
    await client.connect();
    const tableRes = await client.query("SELECT to_regclass('public.users') AS exists");
    if (!tableRes.rows[0].exists) {
      console.log('[dev] Initializing database schema...');
      const { splitStatements, DDL_DIR } = require('./applySchema');
      const filesToApply = [
        '001_schema.sql',
        '002_post_etl_constraints.sql',
        '003_validate_constraints.sql',
        '005_profile_window.sql',
        '006_leave_parent_phone.sql',
        '007_leave_workflow.sql',
        '008_day_scholar.sql'
      ];
      for (const file of filesToApply) {
        const full = path.join(DDL_DIR, file);
        const sql = fs.readFileSync(full, 'utf8');
        const stmts = splitStatements(sql);
        for (const stmt of stmts) {
          try {
            await client.query(stmt);
          } catch (err) {
            if (!['42710', '42P07', '42701'].includes(err.code)) {
              console.warn(`[dev] Schema warning in ${file}:`, err.message);
            }
          }
        }
      }
      console.log('[dev] Database schema initialized successfully.');
    }
    await client.end();
  } catch (err) {
    console.warn('[dev] Schema check warning:', err.message);
  }

  const nodemonBin = path.resolve(
    __dirname,
    '..',
    'node_modules',
    '.bin',
    process.platform === 'win32' ? 'nodemon.cmd' : 'nodemon'
  );

  const child = spawn(nodemonBin, ['src/server.js'], {
    stdio: 'inherit',
    shell: true,
  });

  const cleanExit = async () => {
    if (localPg) {
      try {
        await localPg.stop();
      } catch (_) {}
    }
    process.exit(0);
  };

  process.on('SIGINT', cleanExit);
  process.on('SIGTERM', cleanExit);

  child.on('exit', async (code) => {
    if (localPg) {
      try {
        await localPg.stop();
      } catch (_) {}
    }
    process.exit(code || 0);
  });
}

start().catch((err) => {
  console.error('[dev] Error starting backend development environment:', err);
  process.exit(1);
});
