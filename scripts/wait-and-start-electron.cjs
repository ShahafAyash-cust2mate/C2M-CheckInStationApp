const { spawn } = require('child_process');
const http = require('http');

const url = 'http://127.0.0.1:5173';
const timeoutMs = 30000;
const startedAt = Date.now();

function ping() {
  http.get(url, (res) => {
    res.resume();
    startElectron();
  }).on('error', () => {
    if (Date.now() - startedAt > timeoutMs) {
      console.error('Vite server did not start within 30 seconds');
      process.exit(1);
    }
    setTimeout(ping, 500);
  });
}

function startElectron() {
  const electronCmd = process.platform === 'win32'
    ? '.\\node_modules\\.bin\\electron.cmd'
    : './node_modules/.bin/electron';

  const child = spawn(electronCmd, ['.'], {
    shell: true,
    stdio: 'inherit',
    env: { ...process.env, VITE_DEV_SERVER_URL: url }
  });

  child.on('exit', (code) => process.exit(code ?? 0));
}

ping();
