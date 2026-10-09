import { Injectable, NestMiddleware, Type } from "@nestjs/common";
import { NextFunction, Request, Response } from "express";

type Window = { startedAt: number; count: number };

const MINUTE_MS = 60_000;

/**
 * Creates an in-memory fixed-window limiter keyed by client IP, e.g.
 * `consumer.apply(rateLimit({ maxRequests: 60 })).forRoutes(AuthController)`.
 * Each call returns its own middleware class, so routes keep separate counters.
 */
export function rateLimit(options: {
  maxRequests: number;
  windowMs?: number;
}): Type<NestMiddleware> {
  const windowMs = options.windowMs ?? MINUTE_MS;

  @Injectable()
  class RateLimitMiddleware implements NestMiddleware {
    private readonly windows = new Map<string, Window>();

    use(req: Request, res: Response, next: NextFunction) {
      const now = Date.now();
      this.dropExpired(now);

      const ip = req.socket.remoteAddress || "unknown";
      const window = this.windows.get(ip) ?? { startedAt: now, count: 0 };
      window.count++;
      this.windows.set(ip, window);

      if (window.count > options.maxRequests) {
        res.status(429).json({ message: "Слишком много попыток. Подождите минуту" });
        return;
      }
      next();
    }

    private dropExpired(now: number) {
      for (const [ip, window] of this.windows) {
        if (now - window.startedAt > windowMs) {
          this.windows.delete(ip);
        }
      }
    }
  }

  return RateLimitMiddleware;
}
