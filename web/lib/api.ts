import {
  createApiClient,
  type ApiErrorBody as DaimonApiErrorBody,
  type ApiFailure as DaimonApiFailure,
  type ApiResult as DaimonApiResult,
  type TargetResolver,
} from '@aether-zone/daimon';

import { activeOrganization } from './organizations';
import { getSession } from './auth';

const API_URL = process.env.MNEME_API_URL ?? 'http://localhost:3130';

/**
 * `noOrganization` is signed in but a member of nothing — distinct from
 * `unauthenticated`, because signing in again would not help. Someone has to
 * add them to an organization in pistis.
 */
export type ApiFailure = DaimonApiFailure<'noOrganization'>;
export type ApiResult<T> = DaimonApiResult<T, 'noOrganization'>;
export type ApiErrorBody = DaimonApiErrorBody;

/**
 * Resolves a path against the organization the person is working in.
 *
 * Doing it here rather than at each call site is deliberate: the organization
 * is not something every caller should remember to add, and an api answers 403
 * — not 404 — for one the token does not carry, so a forgotten prefix surfaces
 * as a puzzling permission error rather than a bad URL.
 *
 * Annotated rather than left to inference, so `noOrganization` is the only
 * reason added to daimon's base four.
 */
const resolve: TargetResolver<'noOrganization'> = async (path) => {
  const session = await getSession();

  if (!session) {
    return { ok: false, reason: 'unauthenticated' };
  }

  const organization = await activeOrganization();

  if (!organization) {
    // Signed in, but pistis says they belong to nowhere. Nothing in mneme
    // exists outside an organization, so there is no request to make.
    return { ok: false, reason: 'noOrganization' };
  }

  return {
    ok: true,
    url: `${API_URL}/organizations/${organization.id}${path}`,
    accessToken: session.accessToken,
  };
};

const client = createApiClient(resolve);

/** GET from the Nest api, authorized with the session's access token. */
export const apiGet = client.get;

/**
 * POST to the Nest api. On failure the parsed body is passed back so callers
 * can map per-field validation messages onto their form.
 */
export const apiPost = client.post;

/** PUT to the Nest api. Same failure shape as {@link apiPost}. */
export const apiPut = client.put;

/** DELETE against the Nest api. The response body is not used. */
export const apiDelete = client.del;
