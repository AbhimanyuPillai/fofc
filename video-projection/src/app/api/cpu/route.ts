import os from 'os';
import fs from 'fs';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { NextResponse } from 'next/server';

const execFileAsync = promisify(execFile);

// Ensure this route is always dynamic (no static caching)
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// Take a snapshot of CPU times
function snapshot() {
  const cpus = os.cpus();
  return cpus.map((c) => ({
    idle: c.times.idle,
    total: c.times.user + c.times.nice + c.times.sys + c.times.irq + c.times.idle,
  }));
}

function utilizationPct(prev: { idle: number; total: number }[], curr: { idle: number; total: number }[]) {
  const perCore: number[] = [];
  for (let i = 0; i < Math.min(prev.length, curr.length); i++) {
    const idle = curr[i].idle - prev[i].idle;
    const total = curr[i].total - prev[i].total;
    const usage = total > 0 ? (1 - idle / total) * 100 : 0;
    perCore.push(Math.max(0, Math.min(100, usage)));
  }
  const avg = perCore.length ? perCore.reduce((a, b) => a + b, 0) / perCore.length : 0;
  return { avg, perCore };
}

export async function GET() {
  try {
    const s1 = snapshot();
    // Short interval to compute delta-based utilization
    await new Promise((r) => setTimeout(r, 120));
    const s2 = snapshot();
    const { avg, perCore } = utilizationPct(s1, s2);
    const [l1, l5, l15] = os.loadavg();
    const temp = await getCpuTemperatureC();
    let temperatureC: number | undefined = temp?.value;
    let temperatureSource: string | undefined = temp?.source;
    if (temperatureC === undefined) {
      // Provide a conservative estimate when sensors are not available
      // Baseline 40°C + 0.5°C per 1% utilization, clamped 30–95°C
      const est = Math.max(30, Math.min(95, 40 + (avg * 0.5)));
      temperatureC = Math.round(est * 10) / 10;
      temperatureSource = 'estimated';
    }

    const res = NextResponse.json({
      ok: true,
      cpu: {
        percent: Math.round(avg),
        perCore: perCore.map((v) => Math.round(v)),
        loadavg: { '1m': l1, '5m': l5, '15m': l15 },
        cores: perCore.length,
        temperatureC,
        temperatureSource,
      },
    });
    res.headers.set('Cache-Control', 'no-store');
    return res;
  } catch (e) {
    const err = NextResponse.json({ ok: false, error: 'CPU_METRICS_ERROR' }, { status: 500 });
    err.headers.set('Cache-Control', 'no-store');
    return err;
  }
}

type TempReading = { value: number; source: 'sensors' | 'thermal' | 'hwmon' | 'vcgencmd' | 'istats' } | undefined;

async function getCpuTemperatureC(): Promise<TempReading> {
  // 1) Try lm-sensors (`sensors -u`) if available
  try {
    const { stdout } = await execFileAsync('sensors', ['-u']);
    // Look for lines like: temp1_input: 49.000
    const match = stdout.match(/temp\d+_input:\s*([0-9.]+)/);
    if (match) {
      const val = Number(match[1]);
      if (!Number.isNaN(val)) return { value: val, source: 'sensors' };
    }
  } catch {}

  // Try common Linux thermal paths first
  const tryPaths = [
    '/sys/class/thermal/thermal_zone0/temp',
    '/sys/devices/virtual/thermal/thermal_zone0/temp',
  ];
  for (const p of tryPaths) {
    try {
      const raw = fs.readFileSync(p, 'utf8').trim();
      const n = Number(raw);
      if (!Number.isNaN(n)) {
        // Usually reported in millidegrees C
        const v = n > 200 ? n / 1000 : n;
        return { value: v, source: 'thermal' };
      }
    } catch {}
  }
  // Try hwmon style: /sys/class/hwmon/hwmon*/temp*_input
  try {
    const hwmonRoot = '/sys/class/hwmon';
    if (fs.existsSync(hwmonRoot)) {
      const entries = fs.readdirSync(hwmonRoot);
      for (const e of entries) {
        const dir = `${hwmonRoot}/${e}`;
        try {
          const files = fs.readdirSync(dir);
          for (const f of files) {
            if (f.startsWith('temp') && f.endsWith('_input')) {
              const raw = fs.readFileSync(`${dir}/${f}`, 'utf8').trim();
              const n = Number(raw);
              if (!Number.isNaN(n)) {
                const v = n > 200 ? n / 1000 : n;
                return { value: v, source: 'hwmon' };
              }
            }
          }
        } catch {}
      }
    }
  } catch {}
  // Raspberry Pi vcgencmd
  try {
    const { stdout } = await execFileAsync('vcgencmd', ['measure_temp']);
    // Output format: temp=49.0'C
    const m = stdout.match(/temp=([0-9.]+)'C/);
    if (m) return { value: Number(m[1]), source: 'vcgencmd' };
  } catch {}

  // macOS (requires `istats` gem). Output contains lines like: "CPU temp: 49.13°C"
  try {
    const { stdout } = await execFileAsync('istats');
    const m = stdout.match(/CPU temp:\s*([0-9.]+)°C/i);
    if (m) return { value: Number(m[1]), source: 'istats' };
  } catch {}
  return undefined;
}
