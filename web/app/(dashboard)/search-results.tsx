import { Card, CardContent, CardHeader, CardTitle } from '@aether-zone/kosmos';

import { describeResource, type SearchHit } from '@/lib/memory';

/**
 * What mneme recalled.
 *
 * Each result is a *passage*, not a document — a chunk, with the resource it
 * came out of named above it. That is the honest unit: mneme matched this
 * paragraph, and saying so lets a reader judge the hit rather than trusting
 * the score.
 */
export function SearchResults({ hits }: { hits: SearchHit[] }) {
  if (hits.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Nothing came back</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          <p>
            Either nothing in this organization is close enough to that, or
            nothing has been remembered yet. mneme fills up as the other
            services announce things — a meeting created in akouo is
            searchable here without anyone uploading it.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {hits.map((hit) => (
        <Card key={`${hit.resourceUri}#${hit.chunkIndex}`}>
          <CardHeader className="flex-row items-baseline justify-between gap-3">
            <CardTitle className="text-sm font-medium">
              {describeResource(hit.resourceUri)}
            </CardTitle>
            <span
              className="shrink-0 font-mono text-xs text-muted-foreground"
              title={`Cosine similarity: ${hit.similarity}`}
            >
              {hit.similarity.toFixed(3)}
            </span>
          </CardHeader>
          <CardContent>
            {/* `whitespace-pre-wrap`: the indexed text is one fact per line,
                and collapsing it would run the labels into each other. */}
            <p className="whitespace-pre-wrap text-sm text-foreground">
              {hit.content}
            </p>
            {hit.chunkIndex > 0 && (
              <p className="mt-2 text-xs text-muted-foreground">
                Passage {hit.chunkIndex + 1} of this resource
              </p>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
