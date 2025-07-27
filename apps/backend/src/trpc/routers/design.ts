import { z } from 'zod';
import { TRPCError } from '@trpc/server';

import { createTRPCRouter, protectedProcedure } from '~/trpc/trpc';

// Input schemas
const createSessionSchema = z.object({
  title: z.string().min(1).max(255),
  category: z.enum([
    'SOCIAL_MEDIA',
    'MESSAGING',
    'STREAMING',
    'ECOMMERCE',
    'SEARCH',
    'STORAGE',
    'ANALYTICS',
    'GAMING'
  ])
});

const updateSessionSchema = z.object({
  id: z.string(),
  title: z.string().min(1).max(255).optional(),
  status: z.enum(['ACTIVE', 'COMPLETED', 'ARCHIVED']).optional(),
  narrative: z.string().optional(),
  canvasData: z.any().optional()
});

const getSessionSchema = z.object({
  id: z.string()
});

const listSessionsSchema = z.object({
  category: z
    .enum([
      'SOCIAL_MEDIA',
      'MESSAGING',
      'STREAMING',
      'ECOMMERCE',
      'SEARCH',
      'STORAGE',
      'ANALYTICS',
      'GAMING'
    ])
    .optional(),
  status: z.enum(['ACTIVE', 'COMPLETED', 'ARCHIVED']).optional(),
  limit: z.number().min(1).max(100).default(20),
  cursor: z.string().optional()
});

export const designRouter = createTRPCRouter({
  // Create a new design session
  create: protectedProcedure
    .input(createSessionSchema)
    .mutation(async ({ ctx, input }) => {
      const session = await ctx.db.designSession.create({
        data: {
          title: input.title,
          category: input.category,
          userId: ctx.session.user.id
        },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true
            }
          },
          _count: {
            select: {
              questions: true,
              answers: true,
              versions: true
            }
          }
        }
      });

      return session;
    }),

  // Get a specific design session
  get: protectedProcedure
    .input(getSessionSchema)
    .query(async ({ ctx, input }) => {
      const session = await ctx.db.designSession.findFirst({
        where: {
          id: input.id,
          userId: ctx.session.user.id
        },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true
            }
          },
          questions: {
            orderBy: { order: 'asc' },
            include: {
              answers: true,
              children: {
                orderBy: { order: 'asc' },
                include: {
                  answers: true
                }
              }
            }
          },
          versions: {
            orderBy: { version: 'desc' },
            take: 5
          },
          _count: {
            select: {
              questions: true,
              answers: true,
              versions: true
            }
          }
        }
      });

      if (!session) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Design session not found'
        });
      }

      return session;
    }),

  // List user's design sessions
  list: protectedProcedure
    .input(listSessionsSchema)
    .query(async ({ ctx, input }) => {
      const where = {
        userId: ctx.session.user.id,
        ...(input.category && { category: input.category }),
        ...(input.status && { status: input.status })
      };

      const sessions = await ctx.db.designSession.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        take: input.limit + 1,
        ...(input.cursor && {
          cursor: { id: input.cursor },
          skip: 1
        }),
        include: {
          _count: {
            select: {
              questions: true,
              answers: true,
              versions: true
            }
          }
        }
      });

      let nextCursor: typeof input.cursor | undefined = undefined;
      if (sessions.length > input.limit) {
        const nextItem = sessions.pop();
        nextCursor = nextItem!.id;
      }

      return {
        sessions,
        nextCursor
      };
    }),

  // Update a design session
  update: protectedProcedure
    .input(updateSessionSchema)
    .mutation(async ({ ctx, input }) => {
      const { id, ...updateData } = input;

      // Verify ownership
      const existingSession = await ctx.db.designSession.findFirst({
        where: {
          id,
          userId: ctx.session.user.id
        }
      });

      if (!existingSession) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Design session not found'
        });
      }

      let finalUpdateData = { ...updateData };

      // If canvas data is being updated, create a new version
      if (input.canvasData) {
        await ctx.db.sessionVersion.create({
          data: {
            sessionId: id,
            version: existingSession.currentVersion + 1,
            canvasData: input.canvasData,
            narrative: input.narrative || existingSession.narrative,
            snapshot: {
              canvasData: input.canvasData,
              narrative: input.narrative || existingSession.narrative,
              timestamp: new Date().toISOString()
            }
          }
        });

        // Update the session's currentVersion separately
        await ctx.db.designSession.update({
          where: { id },
          data: { currentVersion: existingSession.currentVersion + 1 }
        });
      }

      const updatedSession = await ctx.db.designSession.update({
        where: { id },
        data: finalUpdateData,
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true
            }
          },
          _count: {
            select: {
              questions: true,
              answers: true,
              versions: true
            }
          }
        }
      });

      return updatedSession;
    }),

  // Delete a design session
  delete: protectedProcedure
    .input(getSessionSchema)
    .mutation(async ({ ctx, input }) => {
      // Verify ownership
      const session = await ctx.db.designSession.findFirst({
        where: {
          id: input.id,
          userId: ctx.session.user.id
        }
      });

      if (!session) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Design session not found'
        });
      }

      await ctx.db.designSession.delete({
        where: { id: input.id }
      });

      return { success: true };
    }),

  // Get session statistics
  getStats: protectedProcedure.query(async ({ ctx }) => {
    const stats = await ctx.db.designSession.groupBy({
      by: ['category', 'status'],
      where: {
        userId: ctx.session.user.id
      },
      _count: {
        id: true
      }
    });

    const totalSessions = await ctx.db.designSession.count({
      where: {
        userId: ctx.session.user.id
      }
    });

    return {
      totalSessions,
      byCategory: stats.reduce(
        (
          acc: Record<
            string,
            { total: number; byStatus: Record<string, number> }
          >,
          stat: any
        ) => {
          if (!acc[stat.category]) {
            acc[stat.category] = { total: 0, byStatus: {} };
          }
          acc[stat.category]!.total += stat._count.id;
          acc[stat.category]!.byStatus[stat.status] = stat._count.id;
          return acc;
        },
        {}
      )
    };
  })
});
