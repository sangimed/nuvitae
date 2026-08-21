import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Req,
  UseFilters,
  UseGuards,
} from "@nestjs/common";
import {
  createManualDraftRequestSchema,
  updateManualDraftRequestSchema,
} from "@nuvitae/contracts";
import type { StructuredResumeContent } from "@nuvitae/domain";
import { z } from "zod";
import {
  getGuardedAuthenticatedContext,
  VerifiedPrincipalGuard,
} from "../auth/verified-principal.guard.js";
import { CreateManualResumeDraftService } from "./create-manual-resume-draft.service.js";
import { GetManualResumeDraftService } from "./get-manual-resume-draft.service.js";
import { ManualResumeExceptionFilter } from "./manual-resume-exception.filter.js";
import { ManualResumeHttpError } from "./manual-resume.errors.js";
import { UpdateManualResumeDraftService } from "./update-manual-resume-draft.service.js";

const draftIdSchema = z.string().uuid();

@Controller("manual-resume-drafts")
@UseFilters(ManualResumeExceptionFilter)
export class ManualResumeDraftsController {
  constructor(
    private readonly createService: CreateManualResumeDraftService,
    private readonly getService: GetManualResumeDraftService,
    private readonly updateService: UpdateManualResumeDraftService,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(VerifiedPrincipalGuard)
  async create(@Req() request: object, @Body() body: unknown) {
    const context = getGuardedAuthenticatedContext(request);
    const parsed = createManualDraftRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new ManualResumeHttpError(
        400,
        "validation_failed",
        "Use a valid manual draft creation key.",
      );
    }
    return this.createService.create({
      ownerUserId: context.userId,
      creationKey: parsed.data.creationKey,
    });
  }

  @Get(":draftId")
  @UseGuards(VerifiedPrincipalGuard)
  async get(@Req() request: object, @Param("draftId") draftId: string) {
    const context = getGuardedAuthenticatedContext(request);
    const parsedDraftId = draftIdSchema.safeParse(draftId);
    if (!parsedDraftId.success) {
      throw new ManualResumeHttpError(404, "not_found", "Draft not found.");
    }
    return this.getService.get({ context, draftId: parsedDraftId.data });
  }

  @Patch(":draftId")
  @UseGuards(VerifiedPrincipalGuard)
  async update(
    @Req() request: object,
    @Param("draftId") draftId: string,
    @Body() body: unknown,
  ) {
    const context = getGuardedAuthenticatedContext(request);
    const parsedDraftId = draftIdSchema.safeParse(draftId);
    if (!parsedDraftId.success) {
      throw new ManualResumeHttpError(404, "not_found", "Draft not found.");
    }
    const parsed = updateManualDraftRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new ManualResumeHttpError(
        400,
        "validation_failed",
        "Fix the highlighted fields before saving.",
      );
    }
    return this.updateService.update({
      context,
      draftId: parsedDraftId.data,
      expectedUpdatedAt: parsed.data.expectedUpdatedAt,
      content: parsed.data.content as StructuredResumeContent,
    });
  }
}
