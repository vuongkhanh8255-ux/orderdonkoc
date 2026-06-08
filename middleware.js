// Vercel Edge Middleware
// Serves a STATIC, crawlable company website for the appcash.app domain so that
// security/content scanners (which do not run JavaScript) see real company
// information instead of an empty SPA shell. All other hosts (the internal tool)
// pass through completely untouched.
//
// matcher: only "page" routes — excludes /api, /assets, and any path containing a
// dot (static files like .html/.svg/.css/.js). This prevents loops because the
// rewrite targets (/appcash*.html) contain a dot and therefore bypass middleware.
export const config = {
  matcher: ['/((?!api/|assets/|.*\\.).*)'],
};

export default async function middleware(request) {
  const { hostname, pathname } = new URL(request.url);

  // Only the public company domain is intercepted. Everything else continues normally.
  if (hostname !== 'appcash.app' && hostname !== 'www.appcash.app') {
    return; // proceed to the normal application
  }

  let file = '/appcash.html';
  if (pathname === '/privacy' || pathname === '/privacy/') file = '/appcash-privacy.html';
  else if (pathname === '/terms' || pathname === '/terms/') file = '/appcash-terms.html';

  // Return the static company page content (URL stays the same — this is a rewrite, not a redirect).
  return fetch(new URL(file, request.url));
}
