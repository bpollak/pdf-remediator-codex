/** Name shown after every page title, e.g. "About – PDF Remediator | UC San Diego". */
export const SITE_TITLE = 'PDF Remediator | UC San Diego';

export function pageTitle(name: string): string {
  return `${name} – ${SITE_TITLE}`;
}
