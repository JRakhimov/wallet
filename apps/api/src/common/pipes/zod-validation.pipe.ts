import { PipeTransform } from "@nestjs/common";
import { z } from "zod";
import { parse } from "../validation/parse";

/** Validates a request value with a zod schema and returns the parsed result. */
export class ZodValidationPipe<S extends z.ZodTypeAny> implements PipeTransform<
  unknown,
  z.output<S>
> {
  constructor(private readonly schema: S) {}

  transform(value: unknown): z.output<S> {
    return parse(this.schema, value);
  }
}
