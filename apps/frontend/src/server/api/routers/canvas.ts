import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";

export const canvasRouter = createTRPCRouter({
  updateCanvas: protectedProcedure
    .input(z.object({ sessionId: z.string(), canvasData: z.any() }))
    .mutation(async ({ ctx, input }) => {
      return ctx.db.designSession.update({
        where: { id: input.sessionId },
        data: { canvasData: input.canvasData },
      });
    }),
  getCanvas: protectedProcedure
    .input(z.object({ sessionId: z.string() }))
    .query(async ({ ctx, input }) => {
      const session = await ctx.db.designSession.findUnique({
        where: { id: input.sessionId },
        select: { canvasData: true },
      });
      return session?.canvasData ?? null;
    }),
});
