import fastifyCookie from '@fastify/cookie';
import fp from 'fastify-plugin';
import { env } from '../env.js';

/**
 * Registers `@fastify/cookie` with HMAC signing keyed off `COOKIE_SECRET`
 * (T-01-02 — tampered cookies fail `unsignCookie` and surface as 401 in
 * `requireSession`).
 */
export const cookiesPlugin = fp(async (app) => {
  await app.register(fastifyCookie, {
    secret: env.COOKIE_SECRET,
    parseOptions: { signed: true },
  });
});
