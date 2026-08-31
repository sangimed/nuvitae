import {
  Body,
  Controller,
  HttpException,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import {
  createContextualResumeEditProposalRequestSchema,
  importResumeResponseSchemaVersion,
} from "@nuvitae/contracts";
import { randomUUID } from "node:crypto";
import {
  getGuardedAuthenticatedContext,
  VerifiedPrincipalGuard,
} from "../auth/verified-principal.guard.js";
import {
  ContextualResumeEditingError,
  ContextualResumeEditingService,
} from "./contextual-resume-editing.service.js";

@Controller("structured-resumes/:resumeId/ai-edit-proposals")
@UseGuards(VerifiedPrincipalGuard)
export class ContextualResumeEditingController {
  constructor(private readonly service: ContextualResumeEditingService) {}

  @Post()
  async propose(
    @Req() request: object,
    @Param("resumeId", ParseUUIDPipe) resumeId: string,
    @Body() body: unknown,
  ) {
    const parsed =
      createContextualResumeEditProposalRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw proposalError(
        400,
        "validation_failed",
        "The AI editing request was not valid.",
      );
    }
    try {
      return await this.service.propose({
        ownerUserId: getGuardedAuthenticatedContext(request).userId,
        resumeId,
        ...parsed.data,
      });
    } catch (error) {
      if (error instanceof ContextualResumeEditingError) {
        throw proposalError(error.status, error.code, error.userMessage);
      }
      throw error;
    }
  }
}

function proposalError(status: number, code: string, userMessage: string) {
  return new HttpException(
    {
      version: importResumeResponseSchemaVersion,
      requestId: randomUUID(),
      status: "contextual_resume_edit_proposal_error",
      code,
      userMessage,
    },
    status,
  );
}
