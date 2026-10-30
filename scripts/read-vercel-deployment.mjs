import { readFileSync } from 'node:fs';

// Vercel 63 returns a deployment directly, or an agent envelope containing it.
try {
  const result = JSON.parse(readFileSync(process.argv[2], 'utf8'));
  const deployment = result.deployment ?? result;
  if ((result.status && result.status !== 'ok') || deployment.readyState !== 'READY' || deployment.target !== 'production') {
    throw new Error('Vercel did not report a ready production deployment.');
  }
  const url = new URL(deployment.url);
  if (url.protocol !== 'https:' || url.username || url.password) {
    throw new Error('Vercel returned an invalid deployment URL.');
  }
  process.stdout.write(url.href + '\n');
} catch {
  // Do not echo raw CLI data: it may contain sensitive configuration details.
  console.error('Could not confirm a ready production deployment from Vercel output.');
  process.exitCode = 1;
}
