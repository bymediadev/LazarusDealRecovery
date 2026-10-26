/**
 * Apply supabase/migrations/*.sql in order against SUPABASE_DB_URL or DATABASE_URL.
 * Usage: npm run migrate:local
 */
import { readdir, readFile } from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const migrationsDir = path.join(root, "supabase", "migrations");

async function main() {
  const dbUrl = process.env.SUPABASE_DB_URL || process.env.DATABASE_URL;
  if (!dbUrl) {
    console.log(
      "migrate:local — set SUPABASE_DB_URL (Postgres connection string) then re-run."
    );
    console.log(
      "Alternatively apply files in supabase/migrations/ via the Supabase SQL editor in order."
    );
    process.exit(0);
  }

  const { default: pg } = await import("pg").catch(() => ({ default: null }));
  if (!pg) {
    console.error("Install pg to run migrate:local against a live database: npm i pg");
    process.exit(1);
  }

  const files = (await readdir(migrationsDir))
    .filter((f) => f.endsWith(".sql"))
    .sort();
  const client = new pg.Client({ connectionString: dbUrl });
  await client.connect();
  try {
    for (const file of files) {
      const sql = await readFile(path.join(migrationsDir, file), "utf8");
      console.log("Applying", file);
      await client.query(sql);
    }
    console.log("migrate:local complete:", files.length, "files");
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
