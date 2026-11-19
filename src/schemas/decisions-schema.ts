import type { CollectionSchema } from 'deepspace/schema'

/**
 * One record per decision, private to its creator.
 *
 * - Reads: only the creator ('own' = createdBy), enforced by the RecordRoom
 *   on the server before any record is sent over the socket.
 * - Writes: NO client role may create/update/delete directly. Every write
 *   goes through a server action in src/actions/index.ts that checks
 *   ownership and validates the whole document. (Actions bypass RBAC.)
 * - Signed-out callers ('*') get nothing.
 *
 * The whole decision lives in `doc` (JSON). That is a deliberate first
 * tradeoff: one record = one optimistic-concurrency `revision`, so a stale
 * tab cannot silently overwrite a newer save. It is not built for
 * simultaneous multi-user editing.
 */
export const decisionsSchema: CollectionSchema = {
  name: 'decisions',
  columns: [
    { name: 'ownerId', storage: 'text', interpretation: 'plain' },
    { name: 'title', storage: 'text', interpretation: 'plain' },
    { name: 'doc', storage: 'text', interpretation: 'plain' },
    { name: 'revision', storage: 'number', interpretation: 'plain' },
  ],
  permissions: {
    '*': { read: false, create: false, update: false, delete: false },
    viewer: { read: 'own', create: false, update: false, delete: false },
    member: { read: 'own', create: false, update: false, delete: false },
    admin: { read: 'own', create: false, update: false, delete: false },
  },
}

/**
 * Server-only log of billed actions, used for per-user rate limits and
 * email duplicate protection. No client role can read or write it.
 */
export const usageEventsSchema: CollectionSchema = {
  name: 'usage_events',
  columns: [
    { name: 'ownerId', storage: 'text', interpretation: 'plain' },
    { name: 'kind', storage: 'text', interpretation: 'plain' },
    { name: 'detail', storage: 'text', interpretation: 'plain' },
    { name: 'atMs', storage: 'number', interpretation: 'plain' },
  ],
  permissions: {
    '*': { read: false, create: false, update: false, delete: false },
    viewer: { read: false, create: false, update: false, delete: false },
    member: { read: false, create: false, update: false, delete: false },
    admin: { read: false, create: false, update: false, delete: false },
  },
}
