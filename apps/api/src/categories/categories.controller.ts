import { Body, Controller, Get, Param, Patch, Post } from "@nestjs/common";
import { OwnerId } from "../common/decorators/owner.decorator";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import { uuid } from "../common/validation/schemas";
import { CategoriesService } from "./categories.service";
import {
  CreateCategoryDto,
  createCategorySchema,
  UpdateCategoryDto,
  updateCategorySchema,
} from "./dto/category.dto";

@Controller("categories")
export class CategoriesController {
  constructor(private readonly categories: CategoriesService) {}

  @Get()
  list(@OwnerId() ownerId: string) {
    return this.categories.list(ownerId);
  }

  @Post()
  create(
    @OwnerId() ownerId: string,
    @Body(new ZodValidationPipe(createCategorySchema)) body: CreateCategoryDto,
  ) {
    return this.categories.create(ownerId, body);
  }

  @Patch(":id")
  update(
    @OwnerId() ownerId: string,
    @Param("id", new ZodValidationPipe(uuid)) id: string,
    @Body(new ZodValidationPipe(updateCategorySchema)) body: UpdateCategoryDto,
  ) {
    return this.categories.update(ownerId, id, body);
  }
}
