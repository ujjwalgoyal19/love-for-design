import { z } from "zod";
import { DesignCategory, SessionStatus } from "@prisma/client";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";

export const designRouter = createTRPCRouter({
  createSession: protectedProcedure
    .input(z.object({ title: z.string(), category: z.nativeEnum(DesignCategory) }))
    .mutation(async ({ ctx, input }) => {
      return ctx.db.designSession.create({
        data: {
          title: input.title,
          category: input.category,
          user: { connect: { id: ctx.session.user.id } },
        },
      });
    }),
  getSession: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      return ctx.db.designSession.findUnique({
        where: { id: input.id, userId: ctx.session.user.id },
      });
    }),
  listSessions: protectedProcedure.query(async ({ ctx }) => {
    return ctx.db.designSession.findMany({
      where: { userId: ctx.session.user.id },
      orderBy: { createdAt: "desc" },
    });
  }),
  updateSession: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        title: z.string().optional(),
        status: z.nativeEnum(SessionStatus).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;
      return ctx.db.designSession.update({ where: { id }, data });
    }),
  deleteSession: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db.designSession.delete({ where: { id: input.id } });
      return { success: true };
    }),
});
