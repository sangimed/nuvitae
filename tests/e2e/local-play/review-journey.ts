import { expect, type Page } from "@playwright/test";
import { confirmedStructuredResumeReadResponseSchema } from "@nuvitae/contracts";

export async function expandReviewSections(page: Page): Promise<void> {
  const closed = page.locator("details.review-section:not([open]) > summary");
  while ((await closed.count()) > 0) await closed.first().click();
}

export async function reviewAndCreateResume(page: Page): Promise<void> {
  await expandReviewSections(page);
  const pending = page.getByRole("button", {
    name: "Confirm this information",
    exact: true,
  });
  while ((await pending.count()) > 0) {
    const remaining = await pending.count();
    await pending.first().click();
    await expect(pending).toHaveCount(remaining - 1);
  }
  const warnings = page.getByRole("button", {
    name: "Leave out for now",
    exact: true,
  });
  while ((await warnings.count()) > 0) {
    const remaining = await warnings.count();
    await warnings.first().click();
    await expect(warnings).toHaveCount(remaining - 1);
  }
  // Explicit-source fallback fields do not need inference confirmation. Saving
  // one reviewed field records the user's review before explicit creation.
  await page
    .getByRole("button", { name: "Edit field", exact: true })
    .first()
    .click();
  const saved = page.waitForResponse(
    (response) =>
      response.request().method() === "PATCH" &&
      /\/review$/.test(new URL(response.url()).pathname),
  );
  await page.getByRole("button", { name: "Save change", exact: true }).click();
  expect((await saved).status()).toBe(200);
  const create = page.getByRole("button", {
    name: "Create my resume",
    exact: true,
  });
  await expect(create).toBeEnabled();
  await create.click();
  await page.getByRole("link", { name: "Open my resume", exact: true }).click();
}

export async function verifyPdfProvenance(page: Page): Promise<void> {
  const id = new URL(page.url()).pathname.split("/").at(-1);
  const response = await page.request.get(`/api/structured-resumes/${id}`);
  expect(response.status()).toBe(200);
  const resume = confirmedStructuredResumeReadResponseSchema.parse(
    await response.json(),
  );
  expect(resume.confirmationStatus).toBe("confirmed");
  expect(resume.provenanceLabel).toBe("imported_from_initial_resume");
  const fields = [
    ...resume.content.personal,
    ...resume.content.contact,
    ...resume.content.skills.map((skill) => skill.name),
  ];
  expect(
    fields.some(
      (field) =>
        field.provenance.kind === "pdf" && field.provenance.pageNumber === 1,
    ),
  ).toBe(true);
}
