'use client';

import { Button, Input } from '@aether-zone/kosmos';
import { useSearchParams } from 'next/navigation';

/**
 * The search box.
 *
 * A plain GET form, so the query ends up in the URL: a search is then
 * linkable, survives a reload, and works before any JavaScript has loaded.
 * The results are rendered by the server component that reads it, which is why
 * nothing here holds the results in state.
 *
 * `defaultValue` rather than `value`, so typing is not routed through React on
 * every keystroke — the field is uncontrolled and the URL is the state.
 */
export function SearchForm() {
  const query = useSearchParams().get('q') ?? '';

  return (
    <form method="GET" action="/" className="flex gap-2">
      <Input
        name="q"
        type="search"
        defaultValue={query}
        placeholder="What are you trying to remember?"
        aria-label="Search"
        className="flex-1"
        autoFocus
      />
      <Button type="submit">Search</Button>
    </form>
  );
}
