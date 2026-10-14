import { useEffect } from 'react';
import { type Params, useMatches } from 'react-router';

/** Route `handle`: a fixed page title, or one built from the URL params. */
export interface RouteHandle {
  title?: string | ((params: Params) => string);
}

export const APP_NAME = 'FlyGo';

export function formatTitle(page: string | undefined): string {
  return page ? `${page} · ${APP_NAME}` : `${APP_NAME} — book flights and pick your seat`;
}

/** Keeps document.title in step with the deepest matched route that declares one. */
export function useRouteTitle(): void {
  const matches = useMatches();
  const match = [...matches].reverse().find((m) => (m.handle as RouteHandle | undefined)?.title);
  const title = (match?.handle as RouteHandle | undefined)?.title;
  const page = typeof title === 'function' ? title(match!.params) : title;
  useEffect(() => {
    document.title = formatTitle(page);
  }, [page]);
}
