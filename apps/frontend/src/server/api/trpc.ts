/**
 * Frontend tRPC configuration that proxies to backend API
 */

import { initTRPC } from "@trpc/server";
import superjson from "superjson";
import { ZodError } from "zod";

/**
 * Context for frontend tRPC (minimal since we proxy to backend)
 */
interface CreateContextOptions {
  headers: Headers;
}

export const createTRPCContext = async (opts: CreateContextOptions) => {
  return {
    headers: opts.headers,
  };
};

/**
 * Initialize tRPC
 */
const t = initTRPC.context<typeof createTRPCContext>().create({
  transformer: superjson,
  errorFormatter({ shape, error }) {
    return {
      ...shape,
      data: {
        ...shape.data,
        zodError:
          error.cause instanceof ZodError ? error.cause.flatten() : null,
      },
    };
  },
});

export const createCallerFactory = t.createCallerFactory;
export const createTRPCRouter = t.router;
export const publicProcedure = t.procedure;
