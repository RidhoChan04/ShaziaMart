import type { HttpHandler } from "msw";

/** Kas keluar laci kasir, ambil uang pemilik, dan batal kas keluar pemilik (S2, S5, S10). */
export const cashHandlers: HttpHandler[] = [];
