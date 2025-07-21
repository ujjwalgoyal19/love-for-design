import { z } from "zod";
import { QuestionType } from "@prisma/client";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";

export const qaRouter = createTRPCRouter({
  addQuestion: protectedProcedure
    .input(
      z.object({
        sessionId: z.string(),
        text: z.string(),
        type: z.nativeEnum(QuestionType),
        category: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      return ctx.db.question.create({
        data: {
          sessionId: input.sessionId,
          text: input.text,
          type: input.type,
          category: input.category ?? "",
        },
      });
    }),
  getQuestions: protectedProcedure
    .input(z.object({ sessionId: z.string() }))
    .query(async ({ ctx, input }) => {
      return ctx.db.question.findMany({
        where: { sessionId: input.sessionId },
        orderBy: { order: "asc" },
      });
    }),
  submitAnswer: protectedProcedure
    .input(
      z.object({ questionId: z.string(), content: z.string(), metadata: z.any().optional() })
    )
    .mutation(async ({ ctx, input }) => {
      return ctx.db.answer.create({
        data: {
          questionId: input.questionId,
          content: input.content,
          metadata: input.metadata,
        },
      });
    }),
});
