import { Body, Controller, Get, Put } from "@nestjs/common";
import { OwnerId } from "../../common/decorators/owner.decorator";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe";
import {
  SaveProfileDto,
  saveProfileSchema,
  UpdateTargetsDto,
  updateTargetsSchema,
} from "./dto/profile.dto";
import { ProfileService } from "./profile.service";

@Controller("nutrition/profile")
export class ProfileController {
  constructor(private readonly profiles: ProfileService) {}

  @Get()
  async get(@OwnerId() ownerId: string) {
    return { profile: await this.profiles.get(ownerId) };
  }

  @Put()
  save(
    @OwnerId() ownerId: string,
    @Body(new ZodValidationPipe(saveProfileSchema)) body: SaveProfileDto,
  ) {
    return this.profiles.save(ownerId, body);
  }

  /** Sets manual targets; send `null` for a target to return to the calculated value. */
  @Put("targets")
  updateTargets(
    @OwnerId() ownerId: string,
    @Body(new ZodValidationPipe(updateTargetsSchema)) body: UpdateTargetsDto,
  ) {
    return this.profiles.updateTargets(ownerId, body);
  }
}
