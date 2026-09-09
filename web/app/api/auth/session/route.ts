import { createSessionRoute } from '@aether-zone/daimon';

import { auth } from '@/lib/auth';
import { activeOrganization, organizationsOf } from '@/lib/organizations';

/**
 * Who is signed in, for client components. Never the access token — that stays
 * in an httpOnly cookie the browser cannot read.
 */
export const GET = createSessionRoute(auth.getSession, async (session) => ({
  user: session?.user ?? null,
  organizations: organizationsOf(session?.organizations),
  activeOrganization: (await activeOrganization())?.id ?? null,
}));
