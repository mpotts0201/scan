import type { Migration } from '../migrate';
import { migration001 } from './001_initial_schema';

/** The only place a migration is registered. Order here is not load-bearing. */
export const MIGRATIONS: readonly Migration[] = [migration001];
