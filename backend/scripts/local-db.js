const EmbeddedPostgres = require('embedded-postgres').default;
const path = require('path');
const fs = require('fs');

const dbDir = path.resolve(__dirname, '..', 'data', 'pgdata');
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const pg = new EmbeddedPostgres({
  databaseDir: dbDir,
  user: 'safeexit',
  password: 'safeexit_dev',
  port: 5432,
  persistent: true,
});

async function main() {
  console.log('[pg-local] Setting up database at:', dbDir);
  try {
    await pg.initialise();
    console.log('[pg-local] Cluster initialized.');
  } catch (err) {
    console.log('[pg-local] Cluster already initialized or notice:', err.message);
  }

  console.log('[pg-local] Starting PostgreSQL on port 5432...');
  await pg.start();
  console.log('[pg-local] PostgreSQL is running on 127.0.0.1:5432!');

  try {
    await pg.createDatabase('safeexit');
    console.log('[pg-local] Database "safeexit" created.');
  } catch (err) {
    console.log('[pg-local] Notice:', err.message);
  }

  console.log('[pg-local] PostgreSQL is ready and accepting connections.');

  // Keep process alive if run directly
  process.on('SIGINT', async () => {
    console.log('[pg-local] Stopping PostgreSQL...');
    await pg.stop();
    process.exit(0);
  });
}

main().catch(err => {
  console.error('[pg-local] Error:', err);
  process.exit(1);
});
