import { z } from 'zod';
import { TRPCError } from '@trpc/server';

import { createTRPCRouter, protectedProcedure } from '~/trpc/trpc';
import { AnswerService } from '~/services/answer.service';

// Input schemas
const createQuestionSchema = z.object({
  sessionId: z.string(),
  text: z.string().min(1),
  type: z.enum(['MULTIPLE_CHOICE', 'TEXT_INPUT', 'SCALE', 'BOOLEAN']),
  category: z.string(),
  order: z.number().int().min(0),
  parentId: z.string().optional(),
  generatedBy: z.string().optional(),
  context: z.any().optional()
});

const submitAnswerSchema = z.object({
  questionId: z.string(),
  sessionId: z.string(),
  content: z.string(),
  metadata: z.any().optional()
});

const getQuestionsSchema = z.object({
  sessionId: z.string(),
  parentId: z.string().optional()
});

const updateQuestionSchema = z.object({
  id: z.string(),
  text: z.string().min(1).optional(),
  type: z
    .enum(['MULTIPLE_CHOICE', 'TEXT_INPUT', 'SCALE', 'BOOLEAN'])
    .optional(),
  category: z.string().optional(),
  order: z.number().int().min(0).optional(),
  context: z.any().optional()
});

const generateFollowUpSchema = z.object({
  sessionId: z.string(),
  answerId: z.string(),
  agentId: z.string().optional()
});

export const questionRouter = createTRPCRouter({
  // Create a new question
  create: protectedProcedure
    .input(createQuestionSchema)
    .mutation(async ({ ctx, input }) => {
      // Verify session ownership
      const session = await ctx.db.designSession.findFirst({
        where: {
          id: input.sessionId,
          userId: ctx.session.user.id
        }
      });

      if (!session) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Design session not found'
        });
      }

      // Verify parent question exists if provided
      if (input.parentId) {
        const parentQuestion = await ctx.db.question.findFirst({
          where: {
            id: input.parentId,
            sessionId: input.sessionId
          }
        });

        if (!parentQuestion) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Parent question not found'
          });
        }
      }

      const question = await ctx.db.question.create({
        data: input,
        include: {
          answers: true,
          children: {
            orderBy: { order: 'asc' },
            include: {
              answers: true
            }
          },
          parent: true
        }
      });

      return question;
    }),

  // Get questions for a session
  getBySession: protectedProcedure
    .input(getQuestionsSchema)
    .query(async ({ ctx, input }) => {
      // Verify session ownership
      const session = await ctx.db.designSession.findFirst({
        where: {
          id: input.sessionId,
          userId: ctx.session.user.id
        }
      });

      if (!session) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Design session not found'
        });
      }

      const questions = await ctx.db.question.findMany({
        where: {
          sessionId: input.sessionId,
          parentId: input.parentId || null
        },
        orderBy: { order: 'asc' },
        include: {
          answers: {
            orderBy: { createdAt: 'desc' }
          },
          children: {
            orderBy: { order: 'asc' },
            include: {
              answers: {
                orderBy: { createdAt: 'desc' }
              }
            }
          },
          parent: true
        }
      });

      return questions;
    }),

  // Update a question
  update: protectedProcedure
    .input(updateQuestionSchema)
    .mutation(async ({ ctx, input }) => {
      const { id, ...updateData } = input;

      // Verify question exists and user owns the session
      const question = await ctx.db.question.findFirst({
        where: { id },
        include: {
          session: true
        }
      });

      if (!question || question.session.userId !== ctx.session.user.id) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Question not found'
        });
      }

      const updatedQuestion = await ctx.db.question.update({
        where: { id },
        data: updateData,
        include: {
          answers: true,
          children: {
            orderBy: { order: 'asc' },
            include: {
              answers: true
            }
          },
          parent: true
        }
      });

      return updatedQuestion;
    }),

  // Delete a question
  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      // Verify question exists and user owns the session
      const question = await ctx.db.question.findFirst({
        where: { id: input.id },
        include: {
          session: true
        }
      });

      if (!question || question.session.userId !== ctx.session.user.id) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Question not found'
        });
      }

      await ctx.db.question.delete({
        where: { id: input.id }
      });

      return { success: true };
    }),

  // Submit an answer
  submitAnswer: protectedProcedure
    .input(submitAnswerSchema)
    .mutation(async ({ ctx, input }) => {
      const answerService = new AnswerService(ctx.db);
      
      const result = await answerService.submitAnswer({
        ...input,
        userId: ctx.session.user.id
      });
      
      return result;
    }),

  // Get answers for a session
  getAnswers: protectedProcedure
    .input(z.object({ sessionId: z.string() }))
    .query(async ({ ctx, input }) => {
      // Verify session ownership
      const session = await ctx.db.designSession.findFirst({
        where: {
          id: input.sessionId,
          userId: ctx.session.user.id
        }
      });

      if (!session) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Design session not found'
        });
      }

      const answers = await ctx.db.answer.findMany({
        where: {
          sessionId: input.sessionId
        },
        include: {
          question: true
        },
        orderBy: {
          createdAt: 'asc'
        }
      });

      return answers;
    }),

  // Generate follow-up questions based on an answer
  generateFollowUp: protectedProcedure
    .input(generateFollowUpSchema)
    .mutation(async ({ ctx, input }) => {
      // Verify answer exists and user owns the session
      const answer = await ctx.db.answer.findFirst({
        where: {
          id: input.answerId,
          sessionId: input.sessionId
        },
        include: {
          question: true,
          session: true
        }
      });

      if (!answer || answer.session.userId !== ctx.session.user.id) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Answer not found'
        });
      }

      // TODO: This will integrate with the AI service to generate follow-up questions
      // For now, return a placeholder response
      return {
        success: true,
        message:
          'Follow-up question generation will be implemented with AI service integration',
        answerId: input.answerId,
        sessionId: input.sessionId
      };
    }),

  // Get question hierarchy for a session
  getHierarchy: protectedProcedure
    .input(z.object({ sessionId: z.string() }))
    .query(async ({ ctx, input }) => {
      // Verify session ownership
      const session = await ctx.db.designSession.findFirst({
        where: {
          id: input.sessionId,
          userId: ctx.session.user.id
        }
      });

      if (!session) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Design session not found'
        });
      }

      // Get root questions (no parent) with their full hierarchy
      const rootQuestions = await ctx.db.question.findMany({
        where: {
          sessionId: input.sessionId,
          parentId: null
        },
        orderBy: { order: 'asc' },
        include: {
          answers: {
            orderBy: { createdAt: 'desc' },
            take: 1
          },
          children: {
            orderBy: { order: 'asc' },
            include: {
              answers: {
                orderBy: { createdAt: 'desc' },
                take: 1
              },
              children: {
                orderBy: { order: 'asc' },
                include: {
                  answers: {
                    orderBy: { createdAt: 'desc' },
                    take: 1
                  }
                }
              }
            }
          }
        }
      });

      return rootQuestions;
    })
});
