import { spawn, type ChildProcess } from 'node:child_process';
import { createRequire } from 'node:module';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';

/** Only launches an owned, ephemeral Anvil. No external RPC option or imported wallets. */
export async function startAnvil(timeoutMs = 60_000) {
  const require = createRequire(import.meta.url);
  let bin: string;
  try {
    bin = require.resolve('@foundry-rs/anvil/bin.mjs');
  } catch {
    throw new Error('Local driver needs @foundry-rs/anvil@1.7.1. Run npm ci in the repository.');
  }
  const child = spawn(
    process.execPath,
    [bin, '--host', '127.0.0.1', '--port', '0', '--chain-id', '31337', '--accounts', '0'],
    { stdio: ['ignore', 'pipe', 'pipe'] },
  );
  // Anvil logs are never emitted: ordinary dev-node output can contain wallet material.
  child.stderr.resume();
  let stopped = false;
  async function stop() {
    if (stopped) return;
    stopped = true;
    clearTimeout(hardTimeout);
    process.off('exit', kill);
    kill();
    if (child.exitCode === null) await Promise.race([once(child, 'exit'), delay(2000)]);
  }
  const kill = () => {
    child.kill('SIGTERM');
  };
  const hardTimeout = setTimeout(kill, timeoutMs);
  process.once('exit', kill);
  try {
    const url = await new Promise<string>((resolve, reject) => {
      const readyTimeout = setTimeout(() => reject(new Error('Anvil startup timed out')), 10_000);
      let data = '';
      const finish = (err?: Error, url?: string) => {
        clearTimeout(readyTimeout);
        if (err) reject(err);
        else resolve(url!);
      };
      child.once('error', (err) => finish(err));
      child.once('exit', (code) => finish(new Error(`Anvil exited (${code})`)));
      child.stdout.on('data', (chunk: Buffer) => {
        data = (data + chunk.toString()).slice(-2048);
        const match = data.match(/Listening on 127\.0\.0\.1:(\d+)/);
        if (match) finish(undefined, `http://127.0.0.1:${match[1]}`);
      });
    });
    return { url, stop, child: child as ChildProcess };
  } catch (err) {
    await stop();
    throw err;
  }
}
