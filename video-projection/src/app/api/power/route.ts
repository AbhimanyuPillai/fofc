import { NextResponse } from 'next/server';

// Simple placeholder power telemetry endpoint.
// On real hardware, replace this with actual readings from your device or a local agent.
// Example response:
// {
//   voltage: 5.12, // volts
//   current: 1.85, // amps
//   source: 'placeholder'
// }

export async function GET() {
  // Generate lightly varying but stable-ish sample data
  const t = Date.now();
  // Voltage around typical 5V USB supply with slight jitter
  const voltage = Number((5.0 + 0.15 * Math.sin(t / 5000)).toFixed(2));
  // Current draw in amps with small motion
  const current = Number((1.8 + 0.3 * Math.cos(t / 7000)).toFixed(2));

  return NextResponse.json({ voltage, current, source: 'placeholder' }, { status: 200 });
}
