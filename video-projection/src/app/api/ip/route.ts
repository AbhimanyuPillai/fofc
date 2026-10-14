import { NextResponse } from 'next/server';
import os from 'os';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function getLanIPs() {
  const nets = os.networkInterfaces();
  const out: { iface: string; address: string }[] = [];
  for (const [iface, addrs] of Object.entries(nets)) {
    if (!addrs) continue;
    for (const a of addrs) {
      if (a.family === 'IPv4' && !a.internal) {
        out.push({ iface, address: a.address });
      }
    }
  }
  return out;
}

export async function GET() {
  try {
    const ips = getLanIPs();
    // Prefer typical ethernet/wifi interfaces if present
    const prefer = ips.find(i => /^(eth|en|wlan|wl)/i.test(i.iface)) || ips[0] || null;
    return NextResponse.json({
      ok: true,
      ip: prefer?.address || null,
      interfaces: ips
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? 'Failed to get IP' }, { status: 500 });
  }
}
