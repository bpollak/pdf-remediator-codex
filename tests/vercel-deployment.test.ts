import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const directories: string[] = [];
afterEach(() => directories.splice(0).forEach((dir) => rmSync(dir, { recursive: true, force: true })));

function parse(value: unknown, raw = false) {
  const dir = mkdtempSync(path.join(tmpdir(), 'vercel-release-'));
  directories.push(dir);
  const file = path.join(dir, 'deployment.json');
  writeFileSync(file, raw ? String(value) : JSON.stringify(value, null, 2));
  return spawnSync(process.execPath, [path.resolve('scripts/read-vercel-deployment.mjs'), file], { encoding: 'utf8' });
}
const ready = { url: 'https://pdf-remediator-example.vercel.app', readyState: 'READY', target: 'production' };

describe('release deployment evidence', () => {
  it.each([ready, { status: 'ok', deployment: ready }])('reads a ready CLI deployment instead of its final JSON brace', (payload) => {
    const result = parse(payload);
    expect(result.status).toBe(0);
    expect(result.stdout.trim()).toBe(ready.url + '/');
  });
  it.each([
    { ...ready, readyState: 'ERROR' },
    { ...ready, target: 'preview' },
    { ...ready, url: 'http://example.com' },
    { status: 'error', deployment: ready }
  ])('refuses failed, non-production or unsafe deployment evidence', (payload) => {
    const result = parse(payload);
    expect(result.status).toBe(1);
    expect(result.stdout).toBe('');
  });
  it('refuses malformed output without echoing its contents', () => {
    const result = parse('private-output-not-json', true);
    expect(result.status).toBe(1);
    expect(result.stderr).not.toContain('private-output-not-json');
  });
});
