import { Injectable, type NestMiddleware } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { attachVerifiedPrincipal } from "../auth/user-context.js";
import { readLocalPlayConfig } from "./local-play.config.js";

@Injectable()
export class LocalPlayPrincipalMiddleware implements NestMiddleware {
  private readonly config = readLocalPlayConfig();

  use(request: object, _response: unknown, next: () => void): void {
    attachVerifiedPrincipal(request, {
      verification: "verified",
      userId: this.config.localUserId,
      authenticationSubject: "local-play",
      requestId: randomUUID(),
    });
    next();
  }
}
