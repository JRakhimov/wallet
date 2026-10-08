import { Body, Controller, Get, Patch } from "@nestjs/common";
import { OwnerId } from "../common/decorators/owner.decorator";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import { UpdateSettingsDto, updateSettingsSchema } from "./dto/update-settings.dto";
import { OwnerService } from "./owner.service";

@Controller()
export class OwnerController {
  constructor(private readonly owners: OwnerService) {}

  @Get("me")
  getProfile(@OwnerId() ownerId: string) {
    return this.owners.getProfile(ownerId);
  }

  @Patch("settings")
  updateSettings(
    @OwnerId() ownerId: string,
    @Body(new ZodValidationPipe(updateSettingsSchema)) body: UpdateSettingsDto,
  ) {
    return this.owners.updateSettings(ownerId, body);
  }
}
