import { Injectable } from '@nestjs/common';
import * as argon2 from 'argon2';

/** OWASP-recommended Argon2id minimum: m=19 MiB, t=2, p=1 (docs §8.2). */
const OPTIONS = { type: argon2.argon2id, memoryCost: 19_456, timeCost: 2, parallelism: 1 } as const;

@Injectable()
export class PasswordHasher {
  /** Hash of a random value, verified against when the email is unknown to equalise timing. */
  private readonly dummyHash: Promise<string> = argon2.hash('flygo-timing-equaliser', OPTIONS);

  hash(password: string): Promise<string> {
    return argon2.hash(password, OPTIONS);
  }

  async verify(hash: string | null, password: string): Promise<boolean> {
    try {
      return await argon2.verify(hash ?? (await this.dummyHash), password);
    } catch {
      return false;
    }
  }

  needsRehash(hash: string): boolean {
    return argon2.needsRehash(hash, OPTIONS);
  }
}
