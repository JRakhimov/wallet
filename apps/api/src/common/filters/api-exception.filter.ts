import { ArgumentsHost, Catch, ExceptionFilter, HttpException, Logger } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { Response } from "express";

const prismaErrors: Record<string, { status: number; message: string }> = {
  P2002: { status: 409, message: "Такая запись уже существует" },
  P2025: { status: 404, message: "Запись не найдена" },
};

/** Turns every error into `{ message }` JSON without leaking internals. */
@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger("ApiExceptionFilter");

  catch(error: unknown, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>();

    if (error instanceof HttpException) {
      res.status(error.getStatus()).json({ message: error.message });
      return;
    }

    if (error instanceof Prisma.PrismaClientKnownRequestError && prismaErrors[error.code]) {
      const { status, message } = prismaErrors[error.code];
      res.status(status).json({ message });
      return;
    }

    this.logger.error(
      `Request failed: ${error instanceof Error ? error.constructor.name : "Unknown error"}`,
    );
    res.status(500).json({ message: "Не удалось выполнить запрос. Попробуйте снова" });
  }
}
