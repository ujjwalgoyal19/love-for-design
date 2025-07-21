import { z } from "zod";
import { ExportFormat } from "@prisma/client";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";

export const exportRouter = createTRPCRouter({
  createExport: protectedProcedure
    .input(z.object({ sessionId: z.string(), templateId: z.string(), format: z.nativeEnum(ExportFormat) }))
    .mutation(async ({ ctx, input }) => {
      return ctx.db.export.create({
        data: {
          sessionId: input.sessionId,
          templateId: input.templateId,
          format: input.format,
        },
      });
    }),
  getStatus: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      return ctx.db.export.findUnique({ where: { id: input.id } });
    }),
});
