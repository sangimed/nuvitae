import { Module } from "@nestjs/common";
import { ApiPersistenceModule } from "../persistence/api-persistence.module.js";
import { ResumeWorkspaceController } from "./resume-workspace.controller.js";
import { ResumeWorkspaceService } from "./resume-workspace.service.js";

@Module({
  imports: [ApiPersistenceModule],
  controllers: [ResumeWorkspaceController],
  providers: [ResumeWorkspaceService],
})
export class ResumeWorkspaceModule {}
