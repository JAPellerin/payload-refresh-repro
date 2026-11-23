import { getPayload, handleEndpoints } from 'payload'

import config from './payload.config'
import { revokeDuringRefresh } from './collections/Users'

/**
 * pnpm repro
 *
 * Sends `POST /api/users/refresh-token` three times: once untouched (the witness), once with the
 * caller's session removed while the request is in flight, once with every session removed.
 * Expected: 200, 403, 403. Observed on 3.94.1: 200, 500, 500
 * (`TypeError: Cannot set properties of undefined (setting 'expiresAt')`).
 */
const email = 'repro@example.com'
const password = 'repro-password'

const payload = await getPayload({ config })

await payload.delete({ collection: 'users', where: { email: { equals: email } } })
await payload.create({ collection: 'users', data: { email, password } })

const login = async (): Promise<string> => {
  const { token } = await payload.login({ collection: 'users', data: { email, password } })
  if (!token) throw new Error('no token')
  return token
}

const refresh = async (token: string): Promise<number> => {
  const response = await handleEndpoints({
    config,
    request: new Request('http://localhost:3000/api/users/refresh-token', {
      headers: { Authorization: `JWT ${token}` },
      method: 'POST',
    }),
  })
  return response.status
}

const results: Record<string, number> = {}

revokeDuringRefresh.mode = 'none'
results['session untouched (witness)'] = await refresh(await login())

// Two sessions, so that `sessions` stays a non-empty array once the caller's own is removed.
await login()
revokeDuringRefresh.mode = 'thisSession'
results['own session removed mid-request'] = await refresh(await login())

revokeDuringRefresh.mode = 'allSessions'
results['every session removed mid-request'] = await refresh(await login())

revokeDuringRefresh.mode = 'none'
await payload.delete({ collection: 'users', where: { email: { equals: email } } })

console.log('\nPOST /api/users/refresh-token')
for (const [label, status] of Object.entries(results)) console.log(`  ${status}  ${label}`)
console.log('\nExpected: 200, 403, 403')
process.exit(0)
