import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@aether-zone/kosmos';

import { activeOrganization } from '@/lib/organizations';

/**
 * The overview.
 *
 * mneme has no domain yet — this is the scaffold, signed in and scoped to an
 * organization, with nothing to show behind it. The page says so rather than
 * pretending: an empty console that looks finished is worse than one that
 * names what is missing.
 */
export default async function OverviewPage() {
  const organization = await activeOrganization();

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>
            {organization ? organization.name : 'No organization'}
          </CardTitle>
          <CardDescription>
            {organization
              ? 'Everything below is scoped to this organization. Switch it in the sidebar.'
              : 'You are signed in but belong to no organization. Ask an owner to add you in pistis.'}
          </CardDescription>
        </CardHeader>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Nothing here yet</CardTitle>
          <CardDescription>
            The console is wired end to end — sign-in through pistis, the shared
            chrome, an api client that scopes every request to the organization
            above. What it does not have is anything to remember.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          <p>
            The api answers on{' '}
            <span className="font-mono text-foreground">:3130</span> with
            organon&rsquo;s health probes and pistis token verification, and no
            routes of its own. The first domain module goes there; the screen
            for it goes beside this page, and its entry goes in{' '}
            <span className="font-mono text-foreground">nav.tsx</span>.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
