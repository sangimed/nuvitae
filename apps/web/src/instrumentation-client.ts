import { z } from "zod";

// Next runs this before loading/hydrating application modules. Configure Zod
// before any contracts construct schemas: even its eval-support probe violates
// CSP. The interpreted validators preserve the same validation semantics.
z.config({ jitless: true });
