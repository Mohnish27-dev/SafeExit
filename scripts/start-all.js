const { spawn } = require('child_process');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');

console.log('====================================================');
console.log('🚀 Starting NITP-SafeExit Full Stack Application...');
console.log('====================================================');
console.log('• Backend API: http://localhost:5000');
console.log('• Frontend UI: http://localhost:3000/safeexit');
console.log('====================================================\n');

// 1. Launch backend
const backend = spawn('npm', ['--prefix', 'backend', 'run', 'dev'], {
  cwd: rootDir,
  stdio: 'inherit',
  shell: true,
});

// 2. Launch frontend
const frontend = spawn('npm', ['--prefix', 'safeexit', 'run', 'dev'], {
  cwd: rootDir,
  stdio: 'inherit',
  shell: true,
});

const cleanup = () => {
  try { backend.kill(); } catch (_) {}
  try { frontend.kill(); } catch (_) {}
  process.exit(0);
};

process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);
