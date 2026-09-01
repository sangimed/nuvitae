import { Module } from "@nestjs/common";
import { ApiPersistenceModule } from "../persistence/api-persistence.module.js";
import { ResumeWorkspaceController } from "./resume-workspace.controller.js";
import { ResumeWorkspaceService } from "./resume-workspace.service.js";
import { ContextualResumeEditingController } from "./contextual-resume-editing.controller.js";
import { ContextualResumeEditingService } from "./contextual-resume-editing.service.js";

@Module({
  imports: [ApiPersistenceModule],
  controllers: [ResumeWorkspaceController, ContextualResumeEditingController],
  providers: [ResumeWorkspaceService, ContextualResumeEditingService],
})
export class ResumeWorkspaceModule {}
