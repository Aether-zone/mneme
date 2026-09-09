import { envSchema } from './env';

/**
 * The environment is validated at boot so a missing or malformed variable
 * fails the start rather than surfacing as `undefined` deep inside a request.
 * These cover the parts that are mneme's own decisions rather than zod's.
 */
describe('the environment', () => {
  it('serves on the port the workspace set aside for it', () => {
    // organon's base schema defaults PORT to 3000, which every service would
    // then collide on. 3130 is mneme's in the workspace port map.
    expect(envSchema.parse({}).PORT).toBe(3130);
  });

  it('reads PORT as a number, not the string it arrives as', () => {
    // `app.listen('3130')` is not the same call as `app.listen(3130)`.
    expect(envSchema.parse({ PORT: '4130' }).PORT).toBe(4130);
  });

  it('points at pistis by default rather than at nothing', () => {
    expect(envSchema.parse({}).OAUTH_ISSUER).toBe('http://localhost:3001');
  });

  it('refuses an issuer that is not a URL', () => {
    // The issuer is compared against the `iss` claim character for character,
    // so a typo here rejects every token with a message about the token.
    expect(() => envSchema.parse({ OAUTH_ISSUER: 'pistis' })).toThrow();
  });

  it('leaves the audience and the JWKS URI unset, so they can be derived', () => {
    // Both have a correct answer derived from the issuer — pistis's audience
    // is its own issuer, and its keys live at the RFC 8414 path. A default
    // here would be that rule written down twice.
    const env = envSchema.parse({});

    expect(env.OAUTH_AUDIENCE).toBeUndefined();
    expect(env.OAUTH_JWKS_URI).toBeUndefined();
  });

  it('does not default LOG_LEVEL, so the logger can pick per environment', () => {
    // JsonLogger falls back to `log` in production and `debug` elsewhere.
    // "unset" has to stay distinguishable from "set to log" for that to work.
    expect(envSchema.parse({}).LOG_LEVEL).toBeUndefined();
    expect(envSchema.parse({ LOG_LEVEL: 'WARN ' }).LOG_LEVEL).toBe('warn');
  });
});
