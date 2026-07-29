import { Module } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { ApiPersistenceModule } from "../persistence/api-persistence.module.js";
import { CreateManualResumeDraftService } from "./create-manual-resume-draft.service.js";
import { GetManualResumeDraftService } from "./get-manual-resume-draft.service.js";
import { ManualResumeDraftsController } from "./manual-resume-drafts.controller.js";
import { ManualResumeExceptionFilter } from "./manual-resume-exception.filter.js";
import {
  MANUAL_RESUME_CLOCK,
  MANUAL_RESUME_ID_GENERATOR,
  MANUAL_RESUME_REQUEST_ID_GENERATOR,
} from "./manual-resume.tokens.js";
import { UpdateManualResumeDraftService } from "./update-manual-resume-draft.service.js";

@Module({
  imports: [ApiPersistenceModule],
  controllers: [ManualResumeDraftsController],
  providers: [
    CreateManualResumeDraftService,
    GetManualResumeDraftService,
    UpdateManualResumeDraftService,
    ManualResumeExceptionFilter,
    { provide: MANUAL_RESUME_CLOCK, useValue: { now: () => new Date() } },
    {
      provide: MANUAL_RESUME_ID_GENERATOR,
      useValue: { nextId: () => randomUUID() },
    },
    {
      provide: MANUAL_RESUME_REQUEST_ID_GENERATOR,
      useValue: { nextRequestId: () => randomUUID() },
    },
  ],
})
export class ManualResumeModule {}
