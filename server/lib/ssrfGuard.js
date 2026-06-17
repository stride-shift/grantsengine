// SSRF guard — validate user-supplied URLs before the server fetches them.
// Blocks non-http(s) schemes and hosts that resolve to private / loopback /
// link-local / cloud-metadata IP ranges. Used by the URL verifier, the autofill
// form-detection fetch, and (mirrored) the Playwright service.
import dns from 'node:dns/promises';
import net from 'node:net';

export class SsrfError extends Error {
  constructor(message) { super(message); this.name = 'SsrfError'; }
}

// True for ranges that should never be reachable from a user-supplied URL.
export function isPrivateIp(ip) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    if (a === 0 || a === 127) return true;              // this-host / loopback
    if (a === 10) return true;                          // private
    if (a === 169 && b === 254) return true;            // link-local + 169.254.169.254 metadata
    if (a === 172 && b >= 16 && b <= 31) return true;   // private
    if (a === 192 && b === 168) return true;            // private
    if (a === 100 && b >= 64 && b <= 127) return true;  // CGNAT
    if (a >= 224) return true;                          // multicast / reserved
    return false;
  }
  if (net.isIPv6(ip)) {
    const lower = ip.toLowerCase();
    if (lower === '::1' || lower === '::') return true;       // loopback / unspecified
    if (lower.startsWith('fe80')) return true;                // link-local
    if (lower.startsWith('fc') || lower.startsWith('fd')) return true; // unique-local
    const mapped = lower.match(/::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);
    if (mapped) return isPrivateIp(mapped[1]);                // IPv4-mapped
    return false;
  }
  return true; // not a parseable IP → treat as unsafe
}

// Throws SsrfError if the URL is unsafe to fetch; returns the URL string if safe.
export async function assertSafeUrl(raw) {
  let u;
  try { u = new URL(raw); } catch { throw new SsrfError('Invalid URL'); }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') {
    throw new SsrfError(`Blocked URL scheme: ${u.protocol}`);
  }
  const host = u.hostname.replace(/^\[|\]$/g, ''); // strip IPv6 brackets
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

// Convenience boolean wrapper.
export async function isSafeUrl(raw) {
  try { await assertSafeUrl(raw); return true; } catch { return false; }
}
