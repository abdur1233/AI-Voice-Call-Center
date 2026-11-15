import { existsSync, readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { pool } from "./pool.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

export async function initDb(): Promise<void> {
    const candidates = [
        join(process.cwd(), "src/db/schema.sql"),
        join(__dirname, "../../src/db/schema.sql"),
        join(__dirname, "../src/db/schema.sql"),
        join(__dirname, "schema.sql"),
    ];

    let schemaPath = candidates.find((p) => existsSync(p)) || join(__dirname, "schema.sql");
    const schemaSql = readFileSync(schemaPath, "utf-8");

    const client = await pool.connect();

    try {
        await client.query(schemaSql);
        console.log("Database schema is ready.");
    } finally {
        client.release();
    }
}
