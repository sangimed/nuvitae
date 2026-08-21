import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Inject,
  Injectable,
  Param,
  Optional,
  ParseUUIDPipe,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import { z } from "zod";
import {
  emitImportTiming,
  type ImportEventEmitter,
} from "../observability/import-events.js";
import type { ImportWorkflowReader } from "@nuvitae/import-application";
import { API_IMPORT_RESUME_REPOSITORY } from "../persistence/api-persistence.module.js";
import {
  START_IMPORT_CLOCK,
  START_IMPORT_PRIVACY_LOGGER,
} from "./start-import.tokens.js";
import type { StartImportClock } from "./start-import.ports.js";
import {
  getGuardedAuthenticatedContext,
  VerifiedPrincipalGuard,
} from "../auth/verified-principal.guard.js";

const clientTimingSchema = z
  .object({
    phase: z.enum([
      "review_first_poll",
      "review_available_to_client",
      "review_rendered",
    ]),
    durationMs: z.number().int().min(0).max(86_400_000).optional(),
  })
  .strict();

@Injectable()
@Controller("import-resume")
export class ImportTimingController {
  constructor(
    @Inject(API_IMPORT_RESUME_REPOSITORY)
    private readonly repository: Pick<
      ImportWorkflowReader,
      "findImportByOwner"
    >,
    @Inject(START_IMPORT_PRIVACY_LOGGER)
    private readonly logger: ImportEventEmitter,
    @Optional()
    @Inject(START_IMPORT_CLOCK)
    private readonly clock: StartImportClock = { now: () => new Date() },
  ) {}

  @Post(":importId/timing")
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(VerifiedPrincipalGuard)
  async report(
    @Req() request: object,
    @Param("importId", ParseUUIDPipe) importId: string,
    @Body() body: unknown,
  ): Promise<void> {
    const authenticated = getGuardedAuthenticatedContext(request);
    const parsed = clientTimingSchema.safeParse(body);
    if (!parsed.success) return;
    const aggregate = await this.repository.findImportByOwner(
      importId,
      authenticated.userId,
    );
    if (aggregate === null) return;
    emitImportTiming(this.logger, {
      importId,
      correlationId: importId,
      phase: parsed.data.phase,
      source: "web",
      at: this.clock.now(),
      ...(parsed.data.durationMs === undefined
        ? {}
        : { durationMs: parsed.data.durationMs }),
    });
  }
}
