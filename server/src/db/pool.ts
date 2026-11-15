import pg from "pg";
import dotenv from "dotenv";

dotenv.config();

const { Pool } = pg;

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
    throw new Error(
        "DATABASE_URL is not set. Copy .env.example to .env " +
        "and fill in a real PostgreSQL connection string."
    );
}

// Render's managed Postgres (and most hosted providers) need
// SSL, but local development usually doesn't have a cert —
// this keeps both working without any extra configuration.
const isLocal =
    connectionString.includes("localhost") ||
    connectionString.includes("127.0.0.1");

export const pool = new Pool({
    connectionString,
    ssl: isLocal ? false : { rejectUnauthorized: false }
});

pool.on("error", (error) => {
    console.error("Unexpected PostgreSQL pool error:", error);
});
