import { sqliteTable, text, integer, primaryKey } from 'drizzle-orm/sqlite-core';
export const courses = sqliteTable('courses', {
  userId: text('user_id').notNull(), id: text('id').notNull(), name: text('name').notNull(),
  data: text('data').notNull(), revision: integer('revision').notNull().default(1), updatedAt: integer('updated_at').notNull(),
}, t => [primaryKey({columns:[t.userId,t.id]})]);
