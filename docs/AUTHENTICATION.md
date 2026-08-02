# Authentication and authorization

## Production flow

The production `workers.dev` Worker must be protected with Cloudflare Access.

```text
Signed out browser
  -> Cloudflare Access login page
  -> identity provider or email one-time PIN
  -> Access Allow policy
  -> Worker validates Cf-Access-Jwt-Assertion
  -> React checks /api/session
  -> placeholder home
```

Cloudflare Access stores the session in its authorization cookie. The React app does not read, copy, or store the JWT. The browser sends the cookie automatically and Cloudflare adds `Cf-Access-Jwt-Assertion` to the request delivered to the Worker.

The fallback React sign-in screen is used only if a cached application shell is open after the Access session expires, or when the API returns `401` or `403`. In a normal online signed-out visit, Access intercepts the request before React loads.

## Approved identities

`APPROVED_EMAILS` is a comma-separated allowlist. Every email must also be included in the Cloudflare Access Allow policy.

```text
APPROVED_EMAILS=owner@example.com,alternate-owner@example.com
```

Multiple approved emails are alternate trusted identities for the same single-user recipe library. They are not separate application users and they all see the same data. Public self-registration and separate per-user recipe data are intentionally not implemented.

## Logout

The application links to:

```text
/cdn-cgi/access/logout
```

Cloudflare clears the application authorization session. Previously issued tokens may take a short period to stop being accepted at every edge location.

## Security boundary

- Cloudflare Access is the outer authentication gate.
- The Worker independently validates signature, issuer, audience, time claims, subject, and approved email.
- Every `/api/*` route is authenticated before route handling.
- React authentication state is user experience only; it is not trusted for authorization.
- No token is stored in `localStorage`, `sessionStorage`, IndexedDB, or application state.
