import { z } from "zod";

export const telegramLoginSchema = z.object({ initData: z.string().min(1).max(8192) }).strict();

export type TelegramLoginDto = z.infer<typeof telegramLoginSchema>;
