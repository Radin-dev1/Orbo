/**
 * Orbo migration runner.
 *
 *   npm run migrate            apply every pending migration
 *   npm run migrate -- --list  show applied / pending without changing anything
 *
 * Reads supabase/migrations/*.sql in filename order and runs each one that
 * hasn't been recorded in the _orbo_migrations bookkeeping table. Each file is
 * executed inside a single transaction.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadEnv } from "dotenv";
import { Client } from "pg";

loadEnv({ path: ".env.local" });
loadEnv({ path: ".env" });

const MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "supabase", "migrations");
const listOnly = process.argv.includes("--list");

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url || url.includes("YOUR-PROJECT-REF")) {
    console.error(
      "\n  DATABASE_URL is not set.\n" +
        "  Put your Supabase connection string in .env.local first.\n" +
        "  (Project Settings → Database → Connection string → Session pooler)\n",
    );
    process.exit(1);
  }

  const client = new Client({
    connectionString: url,
    ssl: url.includes("localhost") ? undefined : { rejectUnauthorized: false },
  });
  await client.connect();

  await client.query(`
    create table if not exists public._orbo_migrations (
      name       text primary key,
      applied_at timestamptz not null default now()
    );
  `);

  const applied = new Set<string>(
    (await client.query<{ name: string }>("select name from public._orbo_migrations")).rows.map(
      (r) => r.name,
    ),
  );

  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  if (listOnly) {
    console.log("\n  Migrations:");
    for (const f of files) {
      console.log(`   ${applied.has(f) ? "✓ applied " : "· pending "} ${f}`);
    }
    console.log();
    await client.end();
    return;
  }

  const pending = files.filter((f) => !applied.has(f));
  if (pending.length === 0) {
    console.log("  Nothing to do — database is up to date.");
    await client.end();
    return;
  }

  for (const file of pending) {
    const sql = readFileSync(join(MIGRATIONS_DIR, file), "utf8");
    process.stdout.write(`  applying ${file} ... `);
    try {
      await client.query("begin");
      await client.query(sql);
      await client.query("insert into public._orbo_migrations (name) values ($1)", [file]);
      await client.query("commit");
      console.log("ok");
    } catch (err) {
      await client.query("rollback");
      console.log("failed");
      console.error(err);
      await client.end();
      process.exit(1);
    }
  }

  console.log(`\n  Done. Applied ${pending.length} migration(s).`);
  await client.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
