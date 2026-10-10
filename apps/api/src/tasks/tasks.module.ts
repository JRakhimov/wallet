import { Module } from "@nestjs/common";
import { OwnerModule } from "../owner/owner.module";
import { TasksController } from "./tasks.controller";
import { TasksService } from "./tasks.service";

/** Tasks mini app: to-do list, notes and reminders sent by the bot. */
@Module({
  imports: [OwnerModule],
  controllers: [TasksController],
  providers: [TasksService],
  exports: [TasksService],
})
export class TasksModule {}
