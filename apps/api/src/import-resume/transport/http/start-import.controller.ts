import {
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UploadedFile,
  UseFilters,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import {
  ApiBody,
  ApiConsumes,
  ApiCreatedResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from "@nestjs/swagger";
import { importInitializationResponseSchema } from "@nuvitae/contracts";
import { StartImportExceptionFilter } from "./start-import-exception.filter.js";
import { StartImportHttpError } from "./start-import.errors.js";
import { StartImportMultipartInterceptor } from "./start-import-multipart.interceptor.js";
import type { BufferedResumeUpload } from "../../ports/start-import.js";
import { StartImportService } from "../../use-cases/start-import.js";
import {
  getGuardedAuthenticatedContext,
  VerifiedPrincipalGuard,
} from "../../../auth/verified-principal.guard.js";

@ApiTags("resume import")
@Controller("import-resume")
@UseFilters(StartImportExceptionFilter)
export class StartImportController {
  constructor(private readonly startImportService: StartImportService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(VerifiedPrincipalGuard)
  @UseInterceptors(StartImportMultipartInterceptor)
  @ApiOperation({
    summary: "Privately store a resume and initialize its import record",
  })
  @ApiConsumes("multipart/form-data")
  @ApiBody({
    schema: {
      type: "object",
      required: ["file"],
      properties: {
        file: { type: "string", format: "binary" },
      },
      additionalProperties: false,
    },
  })
  @ApiCreatedResponse({ description: "The private upload is durable." })
  @ApiUnauthorizedResponse({ description: "Authentication is required." })
  async start(
    @Req() request: object,
    @UploadedFile() file: BufferedResumeUpload | undefined,
  ) {
    const authenticated = getGuardedAuthenticatedContext(request);
    if (
      file === undefined ||
      file.truncated === true ||
      !(file.buffer instanceof Uint8Array)
    ) {
      throw new StartImportHttpError(
        400,
        "unsafe_upload_metadata",
        "Upload exactly one resume file in the file field.",
      );
    }
    const result = await this.startImportService.start({
      ownerUserId: authenticated.userId,
      visibleFilename: file.originalname,
      contentType: file.mimetype,
      content: file.buffer,
    });
    return importInitializationResponseSchema.parse(result);
  }
}
