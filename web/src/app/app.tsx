import { useState } from "react";
import { AppProviders, createAppQueryClient } from "./providers";
import { createAppRouter } from "./router";

export function App() {
  const [queryClient] = useState(createAppQueryClient);
  const [router] = useState(() => createAppRouter());
  return <AppProviders router={router} queryClient={queryClient} />;
}
