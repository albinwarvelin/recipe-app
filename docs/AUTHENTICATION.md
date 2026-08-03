# Authentication and authorization

## Production flow

Both the production Worker URL and version preview URLs are restricted by Cloudflare Access.

```text
Signed-out browser
  -> Cloudflare Access email one-time PIN
  -> Access Allow policy
  -> Access adds Cf-Access-Jwt-Assertion
  -> Worker verifies the JWT and owner email
  -> React checks /api/session
  -> recipe tester loads
```

Cloudflare owns the authorization cookie. React never reads, copies, or stores the JWT. HTML navigations are deliberately excluded from the service-worker precache so a signed-out visit always reaches Access before the application shell is served. The React signed-out screen covers an already open application whose Access session expires.

## Two Access audiences

Production and preview URLs have separate Access applications and audience tags. The Worker selects exactly one expected audience from the request host:

- exact `recipe-app-api.albin-warvelin.workers.dev` host: `ACCESS_PRODUCTION_AUDIENCE`
- `<version-or-alias>-recipe-app-api.albin-warvelin.workers.dev`: `ACCESS_PREVIEW_AUDIENCE`
- any other host: fail closed

The Worker never accepts both tags for one request. This prevents a valid preview token from being treated as a production token. `PRODUCTION_HOSTNAME` defines the host boundary.

## Approved identities

`APPROVED_EMAILS` is a comma-separated backend allowlist. Every address must also be allowed by the two Cloudflare Access policies. Multiple addresses are alternate trusted identities for one recipe library, not separate users.

The complete API validation is: RS256 signature through the team JWKS endpoint, issuer, host-selected audience, expiration, not-before, subject, email claim, and `APPROVED_EMAILS`.

## Logout

The UI links to `/cdn-cgi/access/logout`. Cloudflare clears the Access authorization session; the app stores no separate login session.
