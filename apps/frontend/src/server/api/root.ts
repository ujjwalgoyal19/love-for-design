import { postRouter } from "~/server/api/routers/post";
import { designRouter } from "~/server/api/routers/design";
import { qaRouter } from "~/server/api/routers/qa";
import { canvasRouter } from "~/server/api/routers/canvas";
import { exportRouter } from "~/server/api/routers/export";
import { adminRouter } from "~/server/api/routers/admin";
import { createCallerFactory, createTRPCRouter } from "~/server/api/trpc";

/**
 * This is the primary router for your server.
 *
 * All routers added in /api/routers should be manually added here.
 */
export const appRouter = createTRPCRouter({
  post: postRouter,
  design: designRouter,
  qa: qaRouter,
  canvas: canvasRouter,
  export: exportRouter,
  admin: adminRouter,
});

// export type definition of API
export type AppRouter = typeof appRouter;

/**
 * Create a server-side caller for the tRPC API.
 * @example
 * const trpc = createCaller(createContext);
 * const res = await trpc.post.all();
 *       ^? Post[]
 */
export const createCaller = createCallerFactory(appRouter);
