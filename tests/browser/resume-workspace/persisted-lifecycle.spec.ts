import { expect, test } from "@playwright/test";

const draftId = "11111111-1111-4111-8111-111111111111";
const requestId = "22222222-2222-4222-8222-222222222222";
const createdAt = "2026-08-23T09:00:00.000Z";
const resumeId = "33333333-3333-4333-8333-333333333333";
let updatedAt = createdAt;
let content = blankContent();

test.beforeEach(async ({ page }) => {
  updatedAt = createdAt;
  content = blankContent();
  await page.route("**/api/community-auth/session/status", (route) =>
    route.fulfill({ status: 401, json: {} }),
  );
  await page.route("**/api/manual-resume-drafts", async (route) => {
    if (route.request().method() !== "POST") return route.fallback();
    await route.fulfill({ status: 201, json: manualDraftResponse() });
  });
  await page.route(`**/api/manual-resume-drafts/${draftId}`, async (route) => {
    if (route.request().method() === "PATCH") {
      const request = route.request().postDataJSON() as {
        content: ReturnType<typeof blankContent>;
      };
      content = request.content;
      updatedAt = "2026-08-23T09:05:00.000Z";
      await route.fulfill({ status: 200, json: manualDraftResponse() });
      return;
    }
    await route.fulfill({ status: 200, json: manualDraftResponse() });
  });
  await page.route("**/api/resumes", (route) =>
    route.fulfill({
      status: 200,
      json: {
        version: "2026-07-28",
        requestId,
        status: "resume_workspace",
        resumes: [
          {
            id: draftId,
            kind: "manual_draft",
            title: content.headline?.value ?? "Untitled resume",
            updatedAt,
            editUrl: `/resumes/drafts/${draftId}`,
            provenanceLabel: "manual_entry",
          },
        ],
      },
    }),
  );
});

test("save, leave, list, and reopen continues editing persisted content", async ({
  page,
}) => {
  await page.goto("/resumes/new/manual");
  await expect(page).toHaveURL(`/resumes/drafts/${draftId}`);

  await page
    .getByRole("textbox", { name: "Professional headline" })
    .fill("Platform Engineer");
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.locator(".save-status")).toHaveText("Saved");

  await page.getByRole("link", { name: "My resumes" }).first().click();
  await expect(page).toHaveURL("/resumes");
  await expect(page.getByRole("heading", { name: "My resumes" })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Platform Engineer" }),
  ).toBeVisible();

  await page.getByRole("link", { name: "Continue editing" }).click();
  await expect(page).toHaveURL(`/resumes/drafts/${draftId}`);
  await expect(
    page.getByRole("textbox", { name: "Professional headline" }),
  ).toHaveValue("Platform Engineer");
});

test("confirmed imports save through their structured-resume source of truth", async ({
  page,
}) => {
  let headline = "Imported Engineer";
  let resumeUpdatedAt = createdAt;
  await page.route(`**/api/structured-resumes/${resumeId}`, async (route) => {
    if (route.request().method() === "PATCH") {
      const request = route.request().postDataJSON() as {
        content: { headline?: { value: string } };
      };
      headline = request.content.headline?.value ?? headline;
      resumeUpdatedAt = "2026-08-23T09:10:00.000Z";
    }
    await route.fulfill({
      status: 200,
      json: confirmedResumeResponse(headline, resumeUpdatedAt),
    });
  });
  await page.route("**/api/resumes", (route) =>
    route.fulfill({
      status: 200,
      json: {
        version: "2026-07-28",
        requestId,
        status: "resume_workspace",
        resumes: [
          {
            id: resumeId,
            kind: "confirmed_resume",
            title: headline,
            updatedAt: resumeUpdatedAt,
            editUrl: `/resumes/${resumeId}`,
            provenanceLabel: "imported_from_initial_resume",
          },
        ],
      },
    }),
  );

  await page.goto(`/resumes/${resumeId}`);
  await page
    .getByRole("textbox", { name: "Professional headline" })
    .fill("Principal Engineer");
  await page.getByRole("button", { name: "Save resume" }).click();
  await expect(page.locator(".save-status")).toHaveText("Saved");

  await page.getByRole("link", { name: "My resumes" }).first().click();
  await expect(
    page.getByRole("heading", { name: "Principal Engineer" }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Continue editing" }).click();
  await expect(
    page.getByRole("textbox", { name: "Professional headline" }),
  ).toHaveValue("Principal Engineer");
});

test("confirmed resume stale saves require an explicit reload", async ({
  page,
}) => {
  await page.route(`**/api/structured-resumes/${resumeId}`, async (route) => {
    if (route.request().method() === "PATCH") {
      await route.fulfill({ status: 409, json: {} });
      return;
    }
    await route.fulfill({
      status: 200,
      json: confirmedResumeResponse("Imported Engineer", createdAt),
    });
  });

  await page.goto(`/resumes/${resumeId}`);
  await page
    .getByRole("textbox", { name: "Professional headline" })
    .fill("Conflicting edit");
  await page.getByRole("button", { name: "Save resume" }).click();

  await expect(page.locator(".save-status")).toHaveText(
    "Error — reload required",
  );
  await expect(
    page.getByRole("button", { name: "Reload resume" }),
  ).toBeVisible();
  await expect(page.getByText("changed in another tab")).toBeVisible();
});

function manualDraftResponse() {
  return {
    version: "2026-07-28",
    requestId,
    status: "manual_draft",
    draft: {
      draftId,
      source: "manual_entry",
      status: "editing",
      content,
      createdAt,
      updatedAt,
    },
    userMessage: "Your resume draft was saved.",
  };
}

function blankContent() {
  return {
    sectionOrder: [
      "basics",
      "summary",
      "workExperiences",
      "education",
      "projects",
      "skills",
      "certifications",
      "languages",
      "professionalLinks",
    ],
    personal: [],
    contact: [],
    workExperiences: [],
    education: [],
    skills: [],
    languages: [],
    projects: [],
    certifications: [],
    professionalLinks: [],
  } as {
    sectionOrder: string[];
    personal: never[];
    contact: never[];
    headline?: {
      value: string;
      sourceStatus: "user_added";
      confidenceStatus: "not_applicable";
      inferenceStatus: "not_inferred";
    };
    workExperiences: never[];
    education: never[];
    skills: never[];
    languages: never[];
    projects: never[];
    certifications: never[];
    professionalLinks: never[];
  };
}

function confirmedResumeResponse(headline: string, responseUpdatedAt: string) {
  const sourced = (value: string) => ({
    value,
    sourceStatus: "user_edited",
    confidenceStatus: "not_applicable",
    inferenceStatus: "not_inferred",
    provenance: { kind: "user_edited" },
  });
  return {
    version: "2026-07-28",
    requestId,
    status: "confirmed_structured_resume",
    structuredResumeId: resumeId,
    confirmationStatus: "confirmed",
    provenanceLabel: "imported_from_initial_resume",
    content: {
      personal: [sourced("Jamie Example")],
      contact: [],
      headline: sourced(headline),
      workExperiences: [],
      education: [],
      skills: [],
      languages: [],
      projects: [],
      certifications: [],
      professionalLinks: [],
    },
    createdAt,
    updatedAt: responseUpdatedAt,
    sourceAvailability: "source_no_longer_available",
    userMessage: "Your resume was saved.",
  };
}
