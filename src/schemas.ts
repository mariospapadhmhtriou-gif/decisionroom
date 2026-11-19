/**
 * Collection Schemas, single source of truth, imported by worker and frontend.
 */

import type { CollectionSchema } from 'deepspace/schema'
import { usersSchema } from './schemas/users-schema'
import { settingsSchema } from './schemas/admin-schema'
import { decisionsSchema, usageEventsSchema } from './schemas/decisions-schema'

export const schemas: CollectionSchema[] = [
  usersSchema,
  settingsSchema,
  decisionsSchema,
  usageEventsSchema,
]
