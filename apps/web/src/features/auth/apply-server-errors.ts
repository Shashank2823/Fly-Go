import type { FieldValues, Path, UseFormSetError } from 'react-hook-form';
import { ApiError } from '../../api/api-error';

/**
 * Maps API field errors onto form fields; returns a message for anything not field-specific.
 * The server is the authority — client validation only gives faster feedback.
 */
export function applyServerErrors<T extends FieldValues>(
  err: unknown,
  fields: readonly Path<T>[],
  setError: UseFormSetError<T>,
): string | null {
  if (!(err instanceof ApiError)) return 'Something went wrong. Please try again.';
  let unmatched = false;
  for (const e of err.errors) {
    const field = fields.find((f) => f === e.field);
    if (field) setError(field, { type: 'server', message: e.message });
    else unmatched = true;
  }
  if (err.code === 'TOO_MANY_REQUESTS') {
    const wait = Number(err.meta?.retryAfterSeconds ?? 60);
    return `Too many attempts. Please wait ${wait} seconds and try again.`;
  }
  return err.errors.length === 0 || unmatched ? err.message : null;
}
