import type { CollectionConfig } from 'payload'

/**
 * Set by `src/repro.ts` for one request. It stands for anything that revokes the caller's session
 * while its refresh is in flight: a logout from another tab, or a server-side revocation.
 */
export const revokeDuringRefresh: { mode: 'none' | 'thisSession' | 'allSessions' } = { mode: 'none' }

export const Users: CollectionConfig = {
  slug: 'users',
  admin: {
    useAsTitle: 'email',
  },
  auth: true,
  fields: [],
  hooks: {
    beforeOperation: [
      // Runs inside `refreshOperation`, AFTER the JWT strategy accepted the session (`req.user` is
      // set) and BEFORE the operation reads the user again.
      async ({ args, operation, req }) => {
        if (operation === 'refresh' && req.user && revokeDuringRefresh.mode !== 'none') {
          const stored = await req.payload.db.findOne<{ id: number | string; sessions?: { id: string }[] }>({
            collection: 'users',
            req,
            where: { id: { equals: req.user.id } },
          })
          const sid = (req.user as { _sid?: string })._sid
          const sessions =
            revokeDuringRefresh.mode === 'allSessions'
              ? []
              : (stored?.sessions ?? []).filter((session) => session.id !== sid)
          await req.payload.db.updateOne({
            collection: 'users',
            data: { sessions },
            req,
            where: { id: { equals: req.user.id } },
          })
        }
        return args
      },
    ],
  },
}
