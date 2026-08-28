import type { z } from 'zod';

/**
 * Validate raw JSON against a schema. Throws with a readable path on mismatch —
 * data files fail loudly at load time, never silently at runtime (§14).
 */
export function parseData<S extends z.ZodTypeAny>(
  schema: S,
  raw: unknown,
  sourceName: string,
): z.infer<S> {
  const result = schema.safeParse(raw);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  ${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid data in ${sourceName}:\n${issues}`);
  }
  return result.data;
}
