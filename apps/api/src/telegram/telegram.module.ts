import { Module } from "@nestjs/common";
import { AccessModule } from "../access/access.module";
import { AssistantModule } from "../assistant/assistant.module";
import { TasksModule } from "../tasks/tasks.module";
import { BriefingService } from "./briefing.service";
import { ReminderService } from "./reminder.service";
import { TaskReminderService } from "./task-reminder.service";
import { TelegramBotService } from "./telegram-bot.service";
import { TelegramWebhookController } from "./telegram-webhook.controller";

@Module({
  imports: [AccessModule, AssistantModule, TasksModule],
  controllers: [TelegramWebhookController],
  providers: [TelegramBotService, ReminderService, TaskReminderService, BriefingService],
})
export class TelegramModule {}
