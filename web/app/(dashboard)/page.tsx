import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@aether-zone/kosmos';
import { Suspense } from 'react';

import { searchMemory } from '@/lib/memory';
import { activeOrganization } from '@/lib/organizations';

import { SearchForm } from './search-form';
import { SearchResults } from './search-results';

/**
 * Searching what the workspace remembers.
 *
 * The query lives in the URL rather than in component state, so a search is
 * linkable and survives a reload — and the whole page is a server component,
 * which means the access token never leaves the server.
 */
export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const query = q?.trim() ?? '';
  const organization = await activeOrganization();

  return (
    <div className="flex flex-col gap-6">
      {/* `useSearchParams` in the form opts its subtree into client-side
          rendering, which Next requires a boundary for. */}
      <Suspense fallback={<div className="h-9" />}>
        <SearchForm />
      </Suspense>

      {!organization ? (
        <Card>
          <CardHeader>
            <CardTitle>No organization</CardTitle>
            <CardDescription>
              You are signed in but belong to no organization, and memory is
              scoped to one. Ask an owner to add you in pistis.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : query ? (
        <Results query={query} />
      ) : (
        <Empty organizationName={organization.name} />
      )}
    </div>
  );
}

async function Results({ query }: { query: string }) {
  const result = await searchMemory(query);
  console.log(result);
  if (!result.ok) {
    /*
     * Reasons rather than a status code, so the copy can say what to do about
     * it. `unavailable` is the one worth distinguishing: the api being down
     * looks exactly like an empty memory if both render "nothing found".
     */
    return (
      <Card>
        <CardHeader>
          <CardTitle>That search did not run</CardTitle>
          <CardDescription>
            {result.reason === 'unavailable'
              ? 'The mneme api did not answer. It may be starting, or stopped.'
              : (result.body?.message ??
                'Something went wrong running that search.')}
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return <SearchResults hits={result.data.results} />;
}

function Empty({ organizationName }: { organizationName: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{organizationName}</CardTitle>
        <CardDescription>
          Everything {organizationName} has announced is searchable here.
        </CardDescription>
      </CardHeader>
      <CardContent className="text-sm text-muted-foreground">
        <p>
          mneme listens to the same events arachni does: a meeting created in
          akouo, a file stored in loculus. Nobody uploads anything here — it
          fills up on its own, and this box asks it what it has.
        </p>
      </CardContent>
    </Card>
  );
}
