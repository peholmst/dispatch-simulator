import { expect, test } from "@playwright/test";

test("plays the first dispatch loop and shows debrief details", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "Dispatch Simulator" })).toBeVisible();
  await page.getByLabel("Training scenario").selectOption("smoke_then_fire");
  await page.getByRole("button", { name: "Start" }).click();

  await expect(page.getByText("Shift active at 00:00")).toBeVisible();
  await page.getByRole("button", { name: "Pause" }).click();
  await page.getByRole("button", { name: "+1 min" }).click();
  await expect(page.getByText("Shift active at 00:00")).toBeVisible();
  await page.getByRole("button", { name: "Resume" }).click();
  await page.getByLabel("Simulation speed").selectOption("2");

  await page.getByLabel("Dispatch code").selectOption("103");
  await page.getByLabel("Priority").selectOption("B");
  await page.getByRole("button", { name: "Classify" }).click();
  await page.getByRole("button", { name: "Assist" }).click();

  for (let step = 0; step < 10; step += 1) {
    if (await page.getByText("controlled").first().isVisible()) {
      break;
    }
    await page.getByRole("button", { name: "+1 min" }).click();
  }

  await expect(page.getByText("controlled").first()).toBeVisible();
  await page.getByRole("button", { name: "Finish" }).click();

  await expect(page.getByRole("heading", { name: "Debrief" })).toBeVisible();
  await expect(page.getByText("Control fire_suppression").first()).toBeVisible();
  await expect(page.getByText("Escalation").first()).toBeVisible();
  await expect(page.getByText("Duplicate Handling").first()).toBeVisible();
});

test("shows stacked units on the map and selects units from the chooser", async ({ page }) => {
  await page.goto("/");

  await page.getByLabel("Training scenario").selectOption("smoke_then_fire");
  await page.getByRole("button", { name: "Start" }).click();

  const unitRow = page.locator(".unit-row", { hasText: "RPI101" });
  await unitRow.getByRole("button", { name: "Show on map" }).click();

  const popup = page.locator(".map-popup");
  await expect(popup).toBeVisible();
  await expect(popup).toContainText("Units at location");
  await expect(popup).toContainText("S10");
  await expect(popup).toContainText("RPI101");

  await popup.getByRole("button", { name: /RPI101/ }).click();
  await expect(page.getByText("1 selected")).toBeVisible();
  await expect(unitRow).toHaveClass(/selected/);
});
