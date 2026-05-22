/**
 * Password hashing — Argon2id с параметрами по рекомендациям OWASP/RFC 9106.
 *
 * memoryCost = 65536 (64 MiB) — устойчиво к GPU/ASIC
 * timeCost   = 3            — 3 итерации
 * parallelism = 4           — 4 lane'а
 *
 * Эти параметры подобраны так, что хеш считается ~100–300 мс на нашем VPS,
 * что приемлемо для логина и достаточно дорого для брутфорса.
 */
import argon2 from 'argon2';

const ARGON2_OPTS: argon2.Options = {
  type: argon2.argon2id,
  memoryCost: 65536,
  timeCost: 3,
  parallelism: 4
};

export async function hashPassword(plain: string): Promise<string> {
  return argon2.hash(plain, ARGON2_OPTS);
}

export async function verifyPassword(hash: string, plain: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, plain);
  } catch {
    // Невалидный hash или несовместимый формат — всегда возвращаем false.
    return false;
  }
}

/**
 * Dummy verify: гоняем Argon2 даже если юзер не найден, чтобы не было timing-side-channel
 * (атакующий иначе может определить по времени ответа, существует ли email).
 */
const DUMMY_HASH =
  '$argon2id$v=19$m=65536,t=3,p=4$ZHVtbXlkdW1teWR1bW15$mZJp1V3hT7BkjGmYI8a8w7vH4lEvE2bO5dXrf7L8VhE';
export async function dummyVerify(): Promise<void> {
  try {
    await argon2.verify(DUMMY_HASH, 'no-such-password');
  } catch {
    // intentionally swallow
  }
}
