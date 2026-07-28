# Nuvitae

Nuvitae is a visual, AI-native resume builder designed for non-technical users.

Its primary experience is:

1. Import an existing resume.
2. Review and correct the extracted information.
3. Improve and customize the resume visually.
4. Adapt it to a job description with AI-assisted, reviewable changes.
5. Export a professional, human-readable and ATS-readable PDF.

Nuvitae is not a "resume as code" product. Technical formats and AI-provider
configuration must remain outside the standard user journey.

The product is intended to support:

- a free self-hosted edition where users can connect their own AI assistant;
- a managed cloud edition with hosting and AI usage included.

## Docker Bootstrap

Development, dependency installation, checks, tests, builds, and runtime
services run through Docker Compose. The host workflow requires Docker, Git,
GitHub CLI, and the coding agent only.

Pinned bootstrap versions:

- Node.js Docker base: `node:24.15.0-bookworm-slim`
- pnpm package manager: `pnpm@11.15.1`
- PostgreSQL image: `postgres:17.10-alpine3.24`
- Redis-compatible queue image: `valkey/valkey:8.1.9-alpine3.24`
- Playwright test image: `mcr.microsoft.com/playwright:v1.62.0-noble`
- Next.js: `15.5.22`
- React: `19.2.8`
- NestJS: `11.1.28`
- TypeORM: `0.3.28`
- Zod: `4.4.3`
