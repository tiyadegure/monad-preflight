/**
 * Lossless JSON for engine values that contain bigints.
 *
 * Why: the Risk API is stateless on purpose (nothing about a user's
 * transaction is stored server-side), so post-flight verification needs
 * the caller to hand back what was simulated. PreparedTx and
 * SimulationResult are full of bigints, which JSON.stringify rejects —
 * this codec round-trips them as tagged strings.
 *
 * The tag is deliberately ugly ("$bigint") so it cannot collide with a
 * plausible user-supplied field, and decode only revives EXACT
 * single-key objects of that shape. Everything else passes through
 * untouched.
 */

const TAG = '$bigint';

export function encodeBig(value: unknown): string {
  return JSON.stringify(value, (_key, v: unknown) =>
    typeof v === 'bigint' ? { [TAG]: v.toString() } : v,
  );
}

export function decodeBig(text: string): unknown {
  return JSON.parse(text, (_key, v: unknown) => {
    if (
      v !== null &&
      typeof v === 'object' &&
      !Array.isArray(v) &&
      Object.keys(v).length === 1 &&
      typeof (v as Record<string, unknown>)[TAG] === 'string' &&
      /^-?\d+$/.test((v as Record<string, string>)[TAG] as string)
    ) {
      return BigInt((v as Record<string, string>)[TAG] as string);
    }
    return v;
  });
}
