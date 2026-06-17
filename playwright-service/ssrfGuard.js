// SSRF guard for the Playwright service — blocks navigating the headless
// browser to internal / loopback / link-local / cloud-metadata hosts.
// Self-contained (this service deploys separately from the main server).
import dns from 'node:dns/promises';
import net from 'node:net';

export class SsrfError extends Error {
  constructor(message) { super(message); this.name = 'SsrfError'; }
}

export function isPrivateIp(ip) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    if (a === 0 || a === 127) return true;
    if (a === 10) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true;
    if (a >= 224) return true;
    return false;
  }
  if (net.isIPv6(ip)) {
    const lower = ip.toLowerCase();
    if (lower === '::1' || lower === '::') return true;
    if (lower.startsWith('fe80')) return true;
    if (lower.startsWith('fc') || lower.startsWith('fd')) return true;
    const mapped = lower.match(/::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);
    if (mapped) return isPrivateIp(mapped[1]);
    return false;
  }
  return true;
}

export async function assertSafeUrl(raw) {
  let u;
  try { u = new URL(raw); } catch { throw new SsrfError('Invalid URL'); }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') {
    throw new SsrfError(`Blocked URL scheme: ${u.protocol}`);
  }
  const host = u.hostname.replace(/^\[|\]$/g, '');
  if (/^(localhost|.*\.local|.*\.internal)$/i.test(host)) {
    throw new SsrfError('Blocked host');
  }
  if (net.isIP(host)) {
    if (isPrivateIp(host)) throw new SsrfError('Blocked private IP literal');
    return raw;
  }
  let addrs;
  try { addrs = await dns.lookup(host, { all: true }); }
  catch { throw new SsrfError('DNS resolution failed'); }
  if (!addrs.length) throw new SsrfError('Host did not resolve');
  for (const a of addrs) {
    if (isPrivateIp(a.address)) throw new SsrfError('Host resolves to a private IP');
  }
  return raw;
}
