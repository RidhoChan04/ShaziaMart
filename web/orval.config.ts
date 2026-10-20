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
