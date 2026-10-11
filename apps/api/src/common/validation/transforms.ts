import { Transform } from 'class-transformer';

type Fn = (s: string) => string;

/** Applies `fn` to string input only; anything else is passed through for the validators to reject. */
const stringTransform = (fn: Fn) =>
  Transform(({ value }: { value: unknown }): unknown =>
    typeof value === 'string' ? fn(value) : value,
  );

export const Trim = () => stringTransform((s) => s.trim());
export const TrimLower = () => stringTransform((s) => s.trim().toLowerCase());
export const TrimUpper = () => stringTransform((s) => s.trim().toUpperCase());
/** Trims and collapses internal whitespace (names). */
export const NormalizeSpaces = () => stringTransform((s) => s.trim().replace(/\s+/g, ' '));
