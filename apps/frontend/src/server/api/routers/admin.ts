import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";

export const adminRouter = createTRPCRouter({
  listUsers: protectedProcedure.query(({ ctx }) => {
    return ctx.db.user.findMany({ select: { id: true, email: true, role: true } });
  }),
  listAgents: protectedProcedure.query(({ ctx }) => {
    return ctx.db.aIAgent.findMany();
  }),
});
