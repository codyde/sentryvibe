import { Pool } from 'pg';
import * as schema from './schema';
declare global {
    var __dbPool: Pool | undefined;
}
export declare const db: import("drizzle-orm/node-postgres").NodePgDatabase<typeof schema> & {
    $client: any;
};
export default db;
