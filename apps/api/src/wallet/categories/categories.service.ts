import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { CreateCategoryDto, UpdateCategoryDto } from "./dto/category.dto";

@Injectable()
export class CategoriesService {
  constructor(private readonly db: PrismaService) {}

  list(ownerId: string) {
    return this.db.category.findMany({
      where: { ownerId },
      orderBy: [{ kind: "asc" }, { position: "asc" }, { name: "asc" }],
    });
  }

  /** New categories go to the end of their kind's list. */
  create(ownerId: string, input: CreateCategoryDto) {
    return this.db.ownerTransaction(ownerId, async (tx) => {
      const position = await tx.category.count({ where: { ownerId, kind: input.kind } });
      return tx.category.create({ data: { ownerId, ...input, position } });
    });
  }

  update(ownerId: string, id: string, input: UpdateCategoryDto) {
    return this.db.ownerTransaction(ownerId, async (tx) => {
      const category = await tx.category.findFirst({ where: { id, ownerId } });
      if (!category) {
        throw new NotFoundException("Категория не найдена");
      }
      return tx.category.update({ where: { id }, data: input });
    });
  }
}
