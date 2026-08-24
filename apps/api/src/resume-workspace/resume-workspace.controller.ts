import {
  Body,
  Controller,
  Get,
  HttpException,
  Param,
  ParseUUIDPipe,
  Patch,
  Req,
  UseGuards,
} from "@nestjs/common";
import { updateConfirmedStructuredResumeRequestSchema } from "@nuvitae/contracts";
import type { StructuredResumeContent } from "@nuvitae/domain";
import {
  getGuardedAuthenticatedContext,
  VerifiedPrincipalGuard,
} from "../auth/verified-principal.guard.js";
import {
  ResumeWorkspaceError,
  ResumeWorkspaceService,
} from "./resume-workspace.service.js";

@Controller()
@UseGuards(VerifiedPrincipalGuard)
export class ResumeWorkspaceController {
  constructor(private readonly service: ResumeWorkspaceService) {}

  @Get("resumes")
  list(@Req() request: object) {
    return this.service.list(getGuardedAuthenticatedContext(request).userId);
  }

  @Patch("structured-resumes/:resumeId")
  async update(
    @Req() request: object,
    @Param("resumeId", ParseUUIDPipe) resumeId: string,
    @Body() body: unknown,
  ) {
    const parsed = updateConfirmedStructuredResumeRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new HttpException(
        {
          status: "resume_update_error",
          code: "validation_failed",
          userMessage: "Fix the highlighted fields before saving.",
        },
        400,
      );
    }
    try {
      return await this.service.update({
        ownerUserId: getGuardedAuthenticatedContext(request).userId,
        resumeId,
        expectedUpdatedAt: parsed.data.expectedUpdatedAt,
        content: parsed.data.content as StructuredResumeContent,
      });
    } catch (error) {
      if (error instanceof ResumeWorkspaceError) {
        throw new HttpException(
          {
            status: "resume_update_error",
            code: error.code,
            userMessage: error.userMessage,
          },
          error.status,
        );
      }
      throw error;
    }
  }
}
