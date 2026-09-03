import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import type {
  ImportEventEmitter,
  ImportEventMetadataFor,
} from "../../../observability/import-events.js";
import {
  getGuardedAuthenticatedContext,
  VerifiedPrincipalGuard,
} from "../../../auth/verified-principal.guard.js";
import { COMMUNITY_FUNNEL_EVENT_EMITTER } from "../../ports/tokens.js";

@Controller("community-funnel")
export class CommunityFunnelController {
  constructor(
    @Inject(COMMUNITY_FUNNEL_EVENT_EMITTER)
    private readonly emitter: ImportEventEmitter,
  ) {}

  @Post("events")
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(VerifiedPrincipalGuard)
  report(@Req() request: object, @Body() body: unknown): void {
    // Authentication is required, but the owner identifier is deliberately
    // not copied into product telemetry.
    void getGuardedAuthenticatedContext(request);
    this.emitter.emit(
      "community.funnel",
      body as ImportEventMetadataFor<"community.funnel">,
    );
  }
}
