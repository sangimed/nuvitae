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
import {
  ApiConflictResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnauthorizedResponse,
} from "@nestjs/swagger";
import {
  importResumeResponseSchemaVersion,
  reviewDraftReadResponseSchema,
  reviewErrorResponseSchema,
  reviewMutationResponseSchema,
} from "@nuvitae/contracts";
import {
  ReadImportDraftService,
  UpdateImportReviewService,
} from "../../use-cases/index.js";
import {
  getGuardedAuthenticatedContext,
  VerifiedPrincipalGuard,
} from "../../../auth/verified-principal.guard.js";

@ApiTags("resume import")
@Controller("import-resume")
export class ReviewController {
  constructor(
    private readonly readDraftService: ReadImportDraftService,
    private readonly updateReviewService: UpdateImportReviewService,
  ) {}

  @Get(":importId/review")
  @UseGuards(VerifiedPrincipalGuard)
  @ApiOperation({ summary: "Read an owner-scoped import review draft" })
  @ApiParam({ name: "importId", format: "uuid" })
  @ApiOkResponse({ description: "Grouped import review draft." })
  @ApiUnauthorizedResponse({ description: "Authentication is required." })
  @ApiNotFoundResponse({ description: "Import is unavailable." })
  @ApiConflictResponse({ description: "Import is not ready for review." })
  async read(
    @Req() request: object,
    @Param("importId", ParseUUIDPipe) importId: string,
  ) {
    const authenticated = getGuardedAuthenticatedContext(request);
    const result = await this.readDraftService.read({
      importId,
      ownerUserId: authenticated.userId,
      ...(authenticated.requestId === undefined
        ? {}
        : { requestId: authenticated.requestId }),
    });
    if (!result.ok) throwReviewError(result);
    return reviewDraftReadResponseSchema.parse(result.response);
  }

  @Patch(":importId/review")
  @UseGuards(VerifiedPrincipalGuard)
  @ApiOperation({ summary: "Apply one owner-scoped import review action" })
  @ApiParam({ name: "importId", format: "uuid" })
  @ApiOkResponse({ description: "Updated grouped import review draft." })
  @ApiUnauthorizedResponse({ description: "Authentication is required." })
  @ApiConflictResponse({ description: "Review revision is stale." })
  async update(
    @Req() request: object,
    @Param("importId", ParseUUIDPipe) importId: string,
    @Body() body: unknown,
  ) {
    const authenticated = getGuardedAuthenticatedContext(request);
    const result = await this.updateReviewService.update({
      importId,
      ownerUserId: authenticated.userId,
      body,
      ...(authenticated.requestId === undefined
        ? {}
        : { requestId: authenticated.requestId }),
    });
    if (!result.ok) throwReviewError(result);
    return reviewMutationResponseSchema.parse(result.response);
  }
}

function throwReviewError(error: {
  readonly status: number;
  readonly code: string;
  readonly requestId: string;
  readonly message: string;
}): never {
  throw new HttpException(
    reviewErrorResponseSchema.parse({
      version: importResumeResponseSchemaVersion,
      requestId: error.requestId,
      status: "review_error",
      code: error.code,
      userMessage: error.message,
    }),
    error.status,
  );
}
