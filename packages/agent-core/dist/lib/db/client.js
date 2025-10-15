"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.db = void 0;
const node_postgres_1 = require("drizzle-orm/node-postgres");
const pg_1 = require("pg");
const schema = require("./schema");
const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
    throw new Error('DATABASE_URL is not set.');
}
const pool = global.__dbPool ??
    new pg_1.Pool({
        connectionString,
        ssl: process.env.PGSSLMODE === 'disable'
            ? false
            : { rejectUnauthorized: false },
    });
if (!global.__dbPool) {
    global.__dbPool = pool;
}
exports.db = (0, node_postgres_1.drizzle)(pool, { schema });
exports.default = exports.db;
