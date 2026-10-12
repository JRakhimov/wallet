import { Module } from "@nestjs/common";
import { AssistantModule } from "../assistant/assistant.module";
import { TelegramModule } from "../telegram/telegram.module";
import { McpController } from "./mcp.controller";
import { McpServerFactory } from "./mcp-server";

/** MCP server for Home Assistant and other clients: the assistant's tools over HTTP. */
@Module({
  imports: [AssistantModule, TelegramModule],
  controllers: [McpController],
  providers: [McpServerFactory],
})
export class McpModule {}
