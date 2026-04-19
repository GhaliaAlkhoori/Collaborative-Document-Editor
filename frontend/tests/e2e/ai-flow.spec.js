import { expect, test } from "@playwright/test";

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Verifies the full happy-path experience by registering a user, logging in,
 * creating a document, streaming an AI suggestion, partially rejecting one
 * change block, and applying the reviewed output to the editor.
 */
test("registers, logs in, creates a document, and partially applies an AI suggestion", async ({
  page,
}) => {
  const uniqueId = Date.now();
  const email = `bonus-${uniqueId}@example.com`;
  const password = "bonus-pass-123";
  const initialText = "This draft needs better structure.";

  await page.goto("/register");

  await page.getByLabel("Full Name").fill("Bonus Tester");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Register" }).click();

  await page.waitForURL("**/login");

  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Login" }).click();

  await page.waitForURL("**/dashboard");

  await page.getByPlaceholder("Document title").fill("Bonus Flow Document");
  await page.getByRole("button", { name: "Create" }).click();

  await page.waitForURL("**/documents/**");

  const editor = page.locator(".collab-textarea");
  await editor.fill(initialText);
  await expect(editor).toHaveValue(initialText);

  await page.getByRole("button", { name: "Use full document" }).click();
  await page.getByRole("button", { name: "Generate Suggestion" }).click();

  await expect(page.locator(".ai-review-item").nth(1)).toBeVisible();

  const firstChange = page.locator(".ai-review-item").first();
  const originalSnippet = ((await firstChange.locator(".ai-review-text.before").textContent()) || "").trim();
  const aiSnippet = ((await firstChange.locator(".ai-review-text.after").textContent()) || "").trim();
  await firstChange.getByRole("button", { name: "Keep original" }).click();
  await expect(firstChange.getByText("Keeping original")).toBeVisible();

  await page.getByRole("button", { name: "Apply reviewed version" }).click();

  await expect(editor).not.toHaveValue(initialText);

  if (originalSnippet) {
    await expect(editor).toHaveValue(new RegExp(escapeRegExp(originalSnippet)));
  }

  if (aiSnippet && aiSnippet !== originalSnippet) {
    await expect(editor).not.toHaveValue(new RegExp(escapeRegExp(aiSnippet)));
  }
});
