import {
  boolean,
  integer,
  pgEnum,
  pgTable,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

export const planEnum = pgEnum('plan', ['free', 'paid']);
export const tierEnum = pgEnum('tier', ['free', 'paid']);

export const users = pgTable('users', {
  id: varchar('id', { length: 255 }).primaryKey(), // Clerk userId
  email: varchar('email', { length: 255 }).notNull(),
  phone: varchar('phone', { length: 50 }),
  phone_verified: boolean('phone_verified').notNull().default(false),
  plan: planEnum('plan').notNull().default('free'),
  trips_used: integer('trips_used').notNull().default(0),
  stripe_customer_id: varchar('stripe_customer_id', { length: 255 }),
  stripe_subscription_id: varchar('stripe_subscription_id', { length: 255 }),
  created_at: timestamp('created_at').notNull().defaultNow(),
});

export const trips = pgTable('trips', {
  id: uuid('id').primaryKey().defaultRandom(),
  user_id: varchar('user_id', { length: 255 })
    .notNull()
    .references(() => users.id),
  thread_id: varchar('thread_id', { length: 255 }).notNull(),
  team: varchar('team', { length: 255 }).notNull(),
  match_label: varchar('match_label', { length: 500 }).notNull(),
  match_date: varchar('match_date', { length: 10 }).notNull(),
  destination: varchar('destination', { length: 255 }).notNull(),
  tier: tierEnum('tier').notNull(),
  created_at: timestamp('created_at').notNull().defaultNow(),
});
