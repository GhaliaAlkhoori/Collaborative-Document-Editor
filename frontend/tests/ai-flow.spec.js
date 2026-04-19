import { expect, test } from "@playwright/test";

test("registers, logs in, creates a document, and partially applies an AI suggestion", async ({
  page,
}) => {
  const uniqueId = Date.now();
  const email = `bonus-${uniqueId}@example.com`;
  const password = "bonus-pass-123";
  const initialText = "This draft needs better structure.";
  const rejectedLeadIn = "This revised version presents the same ideas with a more polished tone.";
  const acceptedClosing = "The revised draft keeps the original meaning while sounding more polished.";

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

  await expect(page.locator(".ai-review-item")).toHaveCount(2);

  const firstChange = page.locator(".ai-review-item").first();
  await firstChange.getByRole("button", { name: "Keep original" }).click();
  await expect(firstChange.getByText("Keeping original")).toBeVisible();

  await page.getByRole("button", { name: "Apply reviewed version" }).click();

  await expect(editor).toHaveValue(new RegExp(acceptedClosing.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  await expect(editor).toHaveValue(
    new RegExp(initialText.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
  );
  await expect(editor).not.toHaveValue(
    new RegExp(rejectedLeadIn.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
  );
});
