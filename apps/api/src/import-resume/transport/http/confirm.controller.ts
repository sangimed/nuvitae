import {
  Body,
  Controller,
  Delete,
  Get,
  HttpException,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import {
  ApiConflictResponse,
  ApiGoneResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnauthorizedResponse,
  ApiUnprocessableEntityResponse,
} from "@nestjs/swagger";
import {
  confirmStructuredResumeErrorResponseSchema,
  confirmStructuredResumeResponseSchema,
  discardImportErrorResponseSchema,
  discardImportResponseSchema,
  deleteResumeSourceErrorResponseSchema,
  importResumeResponseSchemaVersion,
  sourceDeletionResponseSchema,
} from "@nuvitae/contracts";
import {
  ConfirmStructuredResumeService,
  DeleteSourceService,
} from "../../use-cases/index.js";
import {
  getGuardedAuthenticatedContext,
  VerifiedPrincipalGuard,
} from "../../../auth/verified-principal.guard.js";

@ApiTags("resume import")
@Controller("import-resume")
export class ConfirmController {
  constructor(private readonly service: ConfirmStructuredResumeService) {}

  @Post(":importId/confirm")
  @UseGuards(VerifiedPrincipalGuard)
  @ApiOperation({ summary: "Explicitly confirm structured resume creation" })
  @ApiParam({ name: "importId", format: "uuid" })
  @ApiOkResponse({ description: "Structured resume confirmed." })
  @ApiUnauthorizedResponse({ description: "Authentication is required." })
  @ApiNotFoundResponse({ description: "Import is unavailable." })
  @ApiConflictResponse({ description: "Review revision is stale." })
  @ApiGoneResponse({ description: "Import expired." })
  @ApiUnprocessableEntityResponse({ description: "Review is not confirmable." })
  async confirm(
    @Req() request: object,
    @Param("importId", ParseUUIDPipe) importId: string,
    @Body() body: unknown,
  ) {
    const authenticated = getGuardedAuthenticatedContext(request);
    const result = await this.service.confirm({
      importId,
      ownerUserId: authenticated.userId,
      body,
      ...(authenticated.requestId === undefined
        ? {}
        : { requestId: authenticated.requestId }),
    });
    if (!result.ok) throwConfirmError(result);
    return confirmStructuredResumeResponseSchema.parse(result.response);
  }

  @Post(":importId/discard")
  @UseGuards(VerifiedPrincipalGuard)
  @ApiOperation({ summary: "Discard an unconfirmed import draft" })
  @ApiParam({ name: "importId", format: "uuid" })
  @ApiOkResponse({ description: "Import discarded and cleanup scheduled." })
  async discard(
    @Req() request: object,
    @Param("importId", ParseUUIDPipe) importId: string,
    @Body() body: unknown,
  ) {
    const authenticated = getGuardedAuthenticatedContext(request);
    const result = await this.service.discard({
      importId,
      ownerUserId: authenticated.userId,
      body,
      ...(authenticated.requestId === undefined
        ? {}
        : { requestId: authenticated.requestId }),
    });
    if (!result.ok) throwDiscardError(result);
    return discardImportResponseSchema.parse(result.response);
  }
}

@ApiTags("structured resumes")
@Controller("structured-resumes")
export class ConfirmedStructuredResumeController {
  constructor(private readonly service: ConfirmStructuredResumeService) {}

  @Get(":resumeId")
  @UseGuards(VerifiedPrincipalGuard)
  @ApiOperation({ summary: "Read a confirmed structured resume" })
  @ApiParam({ name: "resumeId", format: "uuid" })
  async read(
    @Req() request: object,
    @Param("resumeId", ParseUUIDPipe) resumeId: string,
  ) {
    const authenticated = getGuardedAuthenticatedContext(request);
    const result = await this.service.readConfirmed({
      structuredResumeId: resumeId,
      ownerUserId: authenticated.userId,
      ...(authenticated.requestId === undefined
        ? {}
        : { requestId: authenticated.requestId }),
    });
    if (!result.ok) throwConfirmError(result);
    return result.response;
  }
}

@ApiTags("structured resumes")
@Controller("structured-resumes")
export class SourceDeletionController {
  constructor(private readonly service: DeleteSourceService) {}

  @Delete(":resumeId/source")
  @UseGuards(VerifiedPrincipalGuard)
  @ApiOperation({
    summary:
      "Permanently delete an uploaded source without deleting its resume",
  })
  @ApiParam({ name: "resumeId", format: "uuid" })
  @ApiOkResponse({ description: "Uploaded source deleted; resume preserved." })
  @ApiUnauthorizedResponse({ description: "Authentication is required." })
  @ApiNotFoundResponse({ description: "Resume or source is unavailable." })
  async delete(
    @Req() request: object,
    @Param("resumeId", ParseUUIDPipe) resumeId: string,
  ) {
    const authenticated = getGuardedAuthenticatedContext(request);
    const result = await this.service.deleteForStructuredResume({
      structuredResumeId: resumeId,
      ownerUserId: authenticated.userId,
      ...(authenticated.requestId === undefined
        ? {}
        : { requestId: authenticated.requestId }),
    });
    if (!result.ok) {
      throw new HttpException(
        deleteResumeSourceErrorResponseSchema.parse({
          version: importResumeResponseSchemaVersion,
          requestId: result.requestId,
          status: "source_document_deletion_error",
          structuredResumeId: resumeId,
          code: result.code,
          userMessage: result.message,
        }),
        result.status,
      );
    }
    return sourceDeletionResponseSchema.parse(result.response);
  }
}

function throwConfirmError(error: {
  readonly status: number;
  readonly code: string;
  readonly requestId: string;
  readonly importId?: string;
  readonly draftId?: string;
  readonly message: string;
  readonly blockerCount?: number;
}): never {
  throw new HttpException(
    confirmStructuredResumeErrorResponseSchema.parse({
      version: importResumeResponseSchemaVersion,
      requestId: error.requestId,
      status: "structured_resume_confirmation_error",
      ...(error.importId === undefined ? {} : { importId: error.importId }),
      ...(error.draftId === undefined ? {} : { draftId: error.draftId }),
      code: error.code,
      userMessage: error.message,
      ...(error.blockerCount === undefined
        ? {}
        : { blockerCount: error.blockerCount }),
    }),
    error.status,
  );
}

function throwDiscardError(error: {
  readonly status: number;
  readonly code: string;
  readonly requestId: string;
  readonly importId?: string;
  readonly draftId?: string;
  readonly message: string;
}): never {
  throw new HttpException(
    discardImportErrorResponseSchema.parse({
      version: importResumeResponseSchemaVersion,
      requestId: error.requestId,
      status: "import_discard_error",
      ...(error.importId === undefined ? {} : { importId: error.importId }),
      ...(error.draftId === undefined ? {} : { draftId: error.draftId }),
      code: error.code,
      userMessage: error.message,
    }),
    error.status,
  );
}
