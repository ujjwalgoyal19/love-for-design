import { designRouter } from './routers/design';
import { questionRouter } from './routers/question';
import { canvasRouter } from './routers/canvas';
import { exportRouter } from './routers/export';
import { adminRouter } from './routers/admin';
import { authRouter } from './routers/auth';
import { createCallerFactory, createTRPCRouter } from './trpc';

/**
 * This is the primary router for your server.
 *
 * All routers added in /routers should be manually added here.
 */
export const appRouter = createTRPCRouter({
  auth: authRouter,
  design: designRouter,
  question: questionRouter,
  canvas: canvasRouter,
  export: exportRouter,
  admin: adminRouter
});

// export type definition of API
export type AppRouter = typeof appRouter;

/**
 * Create a server-side caller for the tRPC API.
 * @example
 * const trpc = createCaller(createContext);
 * const res = await trpc.design.list();
 */
export const createCaller = createCallerFactory(appRouter);
