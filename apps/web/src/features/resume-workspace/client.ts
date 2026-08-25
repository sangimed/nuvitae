import { resumeWorkspaceListResponseSchema } from "@nuvitae/contracts";
import { apiPath } from "../../services/api-config";

export async function listResumes(input: {
  readonly signal?: AbortSignal;
  readonly fetchImpl?: typeof fetch;
}) {
  try {
    const response = await (input.fetchImpl ?? fetch)(apiPath("/resumes"), {
      credentials: "include",
      ...(input.signal === undefined ? {} : { signal: input.signal }),
    });
    if (!response.ok) {
      return {
        ok: false as const,
        cancelled: false as const,
        message:
          response.status === 401
            ? "Sign in to view your resumes."
            : "Your resumes are temporarily unavailable.",
      };
    }
    const parsed = resumeWorkspaceListResponseSchema.safeParse(
      await response.json(),
    );
    return parsed.success
      ? ({ ok: true as const, response: parsed.data } as const)
      : ({
          ok: false as const,
          cancelled: false as const,
          message: "The resume list could not be understood safely.",
        } as const);
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      return { ok: false as const, cancelled: true as const, message: "" };
    }
    return {
      ok: false as const,
      cancelled: false as const,
      message: "Your resumes are temporarily unavailable.",
    };
  }
}
