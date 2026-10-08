import "dotenv/config";
import { createApp } from "./app.factory";
import { readConfig } from "./config/app-config";

async function bootstrap() {
  const config = readConfig();
  const app = await createApp(config);
  await app.listen(config.port, config.host);

  const authMode = config.dev ? "LOCAL DEVELOPMENT" : "TELEGRAM";
  console.log(`Wallet API: http://${config.host}:${config.port} | auth: ${authMode}`);
}

bootstrap().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Startup failed");
  process.exit(1);
});
