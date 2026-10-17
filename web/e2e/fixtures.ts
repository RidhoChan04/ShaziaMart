import AxeBuilder from "@axe-core/playwright";
import { test as base, expect, type Page } from "@playwright/test";

type Fixtures = { externalRequestGuard: undefined };

/** Test dasar: gagal bila ada request ke host selain server aplikasi sendiri. */
export const test = base.extend<Fixtures>({
  externalRequestGuard: [
    async ({ context, baseURL }, use) => {
      const ownOrigin = new URL(baseURL ?? "http://localhost:4173").origin;
      const offending: string[] = [];
      context.on("request", (request) => {
        const url = request.url();
        if (url.startsWith("data:") || url.startsWith("blob:")) return;
        if (new URL(url).origin !== ownOrigin) offending.push(url);
      });
      await use(undefined);
      expect(
        offending,
        `Request ke host selain ${ownOrigin}:\n${offending.join("\n")}`,
      ).toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };

/** Gagal bila axe menemukan pelanggaran WCAG A/AA berdampak serious/critical. */
export async function expectNoA11yViolations(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa"])
    .analyze();
  const serious = results.violations.filter(
    (v) => v.impact === "serious" || v.impact === "critical",
  );
  const summary = serious
    .map(
      (v) =>
        `${v.id} (${v.impact}): ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`,
    )
    .join("\n");
  expect(serious, `Pelanggaran aksesibilitas:\n${summary}`).toEqual([]);
}
