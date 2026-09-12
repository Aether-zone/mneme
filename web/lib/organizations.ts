import 'server-only';

import type { OrganizationMembership } from '@aether-zone/daimon';
import { cookies } from 'next/headers';

import { getSession } from './auth';

export const ACTIVE_ORGANIZATION = 'mneme.organization';

export type Organization = OrganizationMembership & { id: string };

/**
 * The organizations this person belongs to, from the token's `orgs` claim.
 *
 * pistis is the authority and mneme asks it nothing at request time. pistis
 * re-reads the memberships on every token issue, refreshes included, so a
 * change there lands here within one refresh.
 */
export function organizationsOf(
  memberships: Record<string, OrganizationMembership> | undefined,
): Organization[] {
  return Object.entries(memberships ?? {})
    .map(([id, membership]) => ({ id, ...membership }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Which organization the person is currently working in.
 *
 * The cookie is a preference, never a permission: it is validated against the
 * token's memberships on every read, and a stale or forged value falls back to
 * the first organization they really belong to. The api is told which
 * organization a request is for through the URL, and decides for itself whether
 * the token allows it — this cookie never travels there.
 */
export async function activeOrganization(): Promise<Organization | null> {
  const session = await getSession();

  if (!session) {
    return null;
  }

  const organizations = organizationsOf(session.organizations);
  const [first] = organizations;

  if (!first) {
    return null;
  }

  const preferred = (await cookies()).get(ACTIVE_ORGANIZATION)?.value;

  return organizations.find((org) => org.id === preferred) ?? first;
}
