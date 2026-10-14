import os from 'os';
import crypto from 'crypto';

export function getLocalIPv4Addresses(): string[] {
  const interfaces = os.networkInterfaces();
  const addresses: string[] = [];

  for (const name of Object.keys(interfaces)) {
    const netList = interfaces[name];
    if (!netList) continue;

    for (const net of netList) {
      // IPv4, not internal loopback
      if (net.family === 'IPv4' && !net.internal) {
        addresses.push(net.address);
      }
    }
  }

  // Fallback to loopback if no external interface detected
  if (addresses.length === 0) {
    addresses.push('127.0.0.1');
  }

  return addresses;
}

export function getPreferredLANAddress(): string {
  const addrs = getLocalIPv4Addresses();
  // Prefer private LAN IP ranges (192.168.x.x, 10.x.x.x, 172.16-31.x.x)
  const lan = addrs.find(
    (ip) =>
      ip.startsWith('192.168.') ||
      ip.startsWith('10.') ||
      /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(ip)
  );

  return lan || addrs[0] || '127.0.0.1';
}

export function getServerFingerprint(): string {
  const hostname = os.hostname();
  const platform = os.platform();
  const arch = os.arch();
  return crypto.createHash('sha256').update(`${hostname}-${platform}-${arch}`).digest('hex').substring(0, 16);
}
