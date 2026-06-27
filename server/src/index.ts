import { createApp } from "./app.js";
import { loadConfig } from "./config.js";
import { openDatabase } from "./db/index.js";

const config = loadConfig();
const db = openDatabase(config.DATABASE_PATH);
const app = createApp({ db, config });

const server = app.listen(config.PORT, () => {
  console.log(`bolalar-ai api listening on http://localhost:${config.PORT}`);
  console.log(`  database : ${config.DATABASE_PATH}`);
  console.log(`  lessons  : ${config.OPENAI_API_KEY ? "openai" : "offline generator (no key set)"}`);
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    console.log(`\n${signal} received, shutting down`);
    server.close(() => {
      db.close();
      process.exit(0);
    });
  });
}
