# Payload: `refresh` throws when the session is revoked under it

Reproduction for Payload 3.94.1 (3.x line), built from the `blank` template with the SQLite adapter.

With `auth.useSessions` on (the default), `POST /api/users/refresh-token` answers **500** instead of
**403** when the caller's session is removed from the user document after the JWT strategy has
authenticated the request and before `refreshOperation` reads the user again:

```
TypeError: Cannot set properties of undefined (setting 'expiresAt')
```

`packages/payload/src/auth/operations/refresh.ts` looks the session up and writes on it with no
check that it was found:

```ts
const existingSession = user.sessions.find(({ id }: { id: number }) => id === sid)
// ...
existingSession.expiresAt = new Date(now.getTime() + tokenExpInMs)
```

## Run it

```sh
pnpm install
pnpm repro
```

Nothing to configure: the database is a local SQLite file and the secret is a literal.

Output on 3.94.1:

```
POST /api/users/refresh-token
  200  session untouched (witness)
  500  own session removed mid-request
  500  every session removed mid-request

Expected: 200, 403, 403
```

## How it reproduces the race

- `src/collections/Users.ts`: a `beforeOperation` hook on `users`. During a `refresh` it removes the
  caller's session (or every session). That hook runs after the JWT strategy has accepted the
  session and before the operation reads the user again, which is the window a concurrent logout or
  a server-side revocation falls into.
- `src/repro.ts`: logs in through the Local API, then sends the real REST request through
  `handleEndpoints`, three times.

## Suggested fix

Right after the lookup, as the JWT strategy already does for a missing session:

```ts
if (!existingSession) {
  throw new Forbidden(args.req.t)
}
```
