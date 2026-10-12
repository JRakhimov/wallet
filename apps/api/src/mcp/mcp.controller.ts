import {
  All,
  Controller,
  Get,
  Inject,
  NotFoundException,
  Param,
  Post,
  Req,
  Res,
} from "@nestjs/common";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { Request, Response } from "express";
import { timingSafeEqual } from "node:crypto";
import { Public } from "../common/decorators/public.decorator";
import { AppConfig, CONFIG } from "../config/app-config";
import { McpServerFactory } from "./mcp-server";

function sameSecret(received: string, expected: string) {
  const a = Buffer.from(received);
  const b = Buffer.from(expected);

  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * MCP endpoints. The secret in the path is the key: without it, or with MCP_SECRET unset, the
 * API answers 404 as if there were nothing here.
 * - SSE (Home Assistant): GET /api/mcp/<secret>/sse opens the stream, the client posts to
 *   /api/mcp/<secret>/messages?sessionId=…
 * - Streamable HTTP (Claude, Cursor and newer clients): /api/mcp/<secret>, stateless.
 */
@Public()
@Controller("mcp")
export class McpController {
  /** Open SSE streams by session id; the posts of a session go to its transport. */
  private readonly sessions = new Map<string, SSEServerTransport>();

  constructor(
    @Inject(CONFIG) private readonly config: AppConfig,
    private readonly servers: McpServerFactory,
  ) {}

  @Get(":secret/sse")
  async openStream(@Param("secret") secret: string, @Res() res: Response) {
    this.checkSecret(secret);

    const transport = new SSEServerTransport(`/api/mcp/${secret}/messages`, res);
    this.sessions.set(transport.sessionId, transport);
    res.on("close", () => this.sessions.delete(transport.sessionId));

    // A proxy must pass the events through at once instead of buffering them.
    res.setHeader("X-Accel-Buffering", "no");

    await this.servers.create().connect(transport);
  }

  @Post(":secret/messages")
  async postMessage(@Param("secret") secret: string, @Req() req: Request, @Res() res: Response) {
    this.checkSecret(secret);

    const transport = this.sessions.get(String(req.query.sessionId ?? ""));
    if (!transport) {
      res.status(404).json({ message: "Сессия не найдена" });
      return;
    }

    await transport.handlePostMessage(req, res, req.body);
  }

  @All(":secret")
  async streamableHttp(@Param("secret") secret: string, @Req() req: Request, @Res() res: Response) {
    this.checkSecret(secret);

    // Stateless: a server and a transport per request, nothing to clean up between calls.
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    const server = this.servers.create();
    res.on("close", () => {
      void transport.close();
      void server.close();
    });

    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  }

  private checkSecret(secret: string) {
    if (!this.config.mcp || !sameSecret(secret, this.config.mcp.secret)) {
      throw new NotFoundException();
    }
  }
}
