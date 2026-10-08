import { Injectable, NestMiddleware } from "@nestjs/common";
import { NextFunction, Request, Response } from "express";

const WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_WINDOW = 60;

type Window = { startedAt: number; count: number };

/** Simple in-memory fixed-window limiter keyed by client IP. */
@Injectable()
export class RateLimitMiddleware implements NestMiddleware {
  private readonly windows = new Map<string, Window>();

  use(req: Request, res: Response, next: NextFunction) {
    const now = Date.now();
    this.dropExpired(now);

    const ip = req.socket.remoteAddress || "unknown";
    const window = this.windows.get(ip) ?? { startedAt: now, count: 0 };
    window.count++;
    this.windows.set(ip, window);

    if (window.count > MAX_REQUESTS_PER_WINDOW) {
      res.status(429).json({ message: "Слишком много попыток. Подождите минуту" });
      return;
    }
    next();
  }

  private dropExpired(now: number) {
    for (const [ip, window] of this.windows) {
      if (now - window.startedAt > WINDOW_MS) {
        this.windows.delete(ip);
      }
    }
  }
}
