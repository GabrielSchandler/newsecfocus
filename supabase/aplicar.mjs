// Aplica arquivos de migração pelo nome. Uso: SENHA_BANCO=... node aplicar.mjs 0020_x.sql
import { readFileSync } from "node:fs";
import pg from "pg";
const REF = "auwotdrgxjrrhhhmmekc";
const c = new pg.Client({
  connectionString: `postgresql://postgres.${REF}:${process.env.SENHA_BANCO}@aws-0-sa-east-1.pooler.supabase.com:5432/postgres`,
  ssl: { rejectUnauthorized: false },
});
await c.connect();
for (const arquivo of process.argv.slice(2)) {
  process.stdout.write(arquivo.padEnd(42));
  try {
    await c.query("begin");
    await c.query(readFileSync(new URL(`./migrations/${arquivo}`, import.meta.url), "utf8"));
    await c.query("commit");
    console.log("ok");
  } catch (e) {
    await c.query("rollback").catch(() => {});
    console.log("FALHOU\n   " + e.message);
    await c.end();
    process.exit(1);
  }
}
await c.end();
