import type { AnyHandler, UnhandledFrameStrategy } from "msw";
import { setupServer, type SetupServer } from "msw/node";
import { afterAll, afterEach, beforeAll } from "vitest";

export interface MswServerOptions {
  onUnhandledFrame?: UnhandledFrameStrategy;
}

/**
 * Registers an opt-in MSW Node server scoped to the current test file.
 * Keeps `vi.stubGlobal("fetch", ...)` in legacy test files untouched.
 */
export function setupMswServer(
  handlers: AnyHandler[] = [],
  options: MswServerOptions = {}
): SetupServer {
  const server = setupServer(...handlers);
  const onUnhandledFrame = options.onUnhandledFrame ?? "error";

  beforeAll(() => {
    server.listen({ onUnhandledFrame });
  });

  afterEach(() => {
    server.resetHandlers();
  });

  afterAll(() => {
    server.close();
  });

  return server;
}
