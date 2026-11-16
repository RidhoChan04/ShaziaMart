import { expect, test } from "vitest";
import styles from "./styles.css?raw";

// (koreksi mockup M4) jsdom tidak menghitung tata letak; posisi nyata diuji e2e (T15) lewat
// `[data-sonner-toaster]` vs `nav[aria-label="Navigasi utama"]`. Di sini aturannya dikunci.
test("toast pemilik < 1024 px berada 76 px di atas tepi bawah (di atas tab bar), hanya data-app owner", () => {
  const media = styles.match(
    /@media \(max-width: 1023\.98px\) \{\s*([^}]*)\{([^}]*)\}\s*\}/,
  );
  expect(media?.[1]?.trim()).toBe(
    ':root[data-app="owner"] [data-sonner-toaster][data-y-position="bottom"]',
  );
  const body = media?.[2] ?? "";
  for (const v of ["--offset-bottom", "--mobile-offset-bottom"]) {
    expect(body).toContain(
      `${v}: calc(76px + env(safe-area-inset-bottom)) !important;`,
    );
  }
  expect(styles).not.toMatch(/data-app="(kasir|staff)"\] \[data-sonner/);
});
