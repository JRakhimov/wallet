import { BadRequestException } from "@nestjs/common";
import { z } from "zod";

/** Parses a value or throws 400 with a readable list of issues. */
export function parse<S extends z.ZodTypeAny>(schema: S, value: unknown): z.output<S> {
  const result = schema.safeParse(value);
  if (!result.success) {
    const issues = result.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`);
    throw new BadRequestException(issues.join("; "));
  }
  return result.data;
}
