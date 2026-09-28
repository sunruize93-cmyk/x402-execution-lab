import { spawn } from 'node:child_process';
import { delimiter } from 'node:path';
import { fileURLToPath } from 'node:url';

// Inherit the active virtual environment. Arguments remain separate; no shell.
const child = spawn(process.env.AEB_PYTHON || 'python3', ['-m', 'aeb', ...process.argv.slice(2)], {
  stdio: 'inherit',
  env: {
    ...process.env,
    PYTHONPATH: [fileURLToPath(new URL('../bench/src', import.meta.url)), process.env.PYTHONPATH]
      .filter(Boolean)
      .join(delimiter),
  },
});
child.on('error', () => {
  console.error('Bench needs Python 3.10+ and an installation of ./bench. See README.md.');
  process.exitCode = 3;
});
child.on('exit', (code, signal) => {
  process.exitCode = code ?? (signal ? 3 : 0);
});
