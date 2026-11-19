import { defineConfig } from "orval";

export default defineConfig({
  api: {
    input: "../api/openapi.yaml",
    output: {
      target: "src/shared/api/gen",
      mode: "tags-split",
      client: "react-query",
      httpClient: "fetch",
      override: {
        fetch: { includeHttpResponseReturnType: false },
        // Body dengan beberapa media type (gambar QRIS PNG/JPEG) → satu fungsi per media type
        // dengan Content-Type yang benar, bukan satu fungsi yang selalu mengirim media type pertama.
        splitByContentType: true,
        mutator: { path: "src/shared/api/fetcher.ts", name: "customFetch" },
      },
    },
  },
  zod: {
    input: "../api/openapi.yaml",
    output: {
      target: "src/shared/api/gen/zod",
      mode: "tags-split",
      client: "zod",
    },
  },
});
