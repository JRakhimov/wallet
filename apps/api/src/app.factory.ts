import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { NestExpressApplication } from "@nestjs/platform-express";
import { NextFunction, Request, Response } from "express";
import helmet from "helmet";
import { AppModule } from "./app.module";
import { ApiExceptionFilter } from "./common/filters/api-exception.filter";
import { AppConfig } from "./config/app-config";

export async function createApp(config: AppConfig, quiet = false) {
  const app = await NestFactory.create<NestExpressApplication>(AppModule.register(config), {
    logger: quiet ? false : ["log", "warn", "error"],
  });

  app.setGlobalPrefix("api");
  app.useGlobalFilters(new ApiExceptionFilter());
  app.use(securityHeaders(config));
  app.enableCors({
    origin: config.allowedOrigins,
    methods: ["GET", "POST", "PATCH", "PUT", "DELETE"],
    allowedHeaders: ["Content-Type", "Authorization", "Idempotency-Key"],
  });
  app.use("/api", noStore);
  app.enableShutdownHooks();

  return app;
}

function securityHeaders(config: AppConfig) {
  return helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "https://telegram.org"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:"],
        connectSrc: ["'self'"],
        frameAncestors: ["'self'", "https://web.telegram.org", "https://*.telegram.org"],
        upgradeInsecureRequests: config.env === "production" ? [] : null,
      },
    },
    crossOriginEmbedderPolicy: false,
    // The Mini App is embedded in Telegram's iframe.
    frameguard: false,
  });
}

/** API responses contain private financial data and must never be cached. */
function noStore(_req: Request, res: Response, next: NextFunction) {
  res.setHeader("Cache-Control", "no-store");
  next();
}
