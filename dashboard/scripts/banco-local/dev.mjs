// npm run dev:local — banco PGlite com dados sintéticos + next dev apontando para ele.
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { iniciarServidor } from "./servidor.mjs";

const PORTA_BANCO = 54329;
const porta = process.env.PORT ?? "3217";

await iniciarServidor({ porta: PORTA_BANCO });

const require = createRequire(import.meta.url);
const next = spawn(process.execPath, [require.resolve("next/dist/bin/next"), "dev", "-p", porta], {
  stdio: "inherit",
  env: {
    ...process.env,
    FOCUS_BANCO_LOCAL: `http://127.0.0.1:${PORTA_BANCO}`,
    NEXT_PUBLIC_FOCUS_BANCO_LOCAL: "1",
  },
});
next.on("exit", (codigo) => process.exit(codigo ?? 0));
