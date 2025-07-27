import { z } from 'zod';
import { TRPCError } from '@trpc/server';

import { createTRPCRouter, protectedProcedure } from '~/trpc/trpc';

// Admin middleware to check for admin role
const adminProcedure = protectedProcedure.use(async ({ ctx, next }) => {
  // Get user with role from database
  const user = await ctx.db.user.findUnique({
    where: { id: ctx.session.user.id },
    select: { role: true }
  });

  if (!user || user.role !== 'ADMIN') {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'Admin access required'
    });
  }
  return next();
});

// Input schemas
const createAgentSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  model: z.string().min(1),
  provider: z.string().min(1),
  capabilities: z.array(z.string()),
  config: z.any(),
  isActive: z.boolean().default(true),
  priority: z.number().int().default(0)
});

const updateAgentSchema = z.object({
  id: z.string(),
  name: z.string().min(1).max(255).optional(),
  description: z.string().optional(),
  model: z.string().min(1).optional(),
  provider: z.string().min(1).optional(),
  capabilities: z.array(z.string()).optional(),
  config: z.any().optional(),
  isActive: z.boolean().optional(),
  priority: z.number().int().optional()
});

const updateSettingSchema = z.object({
  key: z.string().min(1),
  value: z.any(),
  description: z.string().optional()
});

const createQuestionTemplateSchema = z.object({
  text: z.string().min(1),
  type: z.enum(['MULTIPLE_CHOICE', 'TEXT_INPUT', 'SCALE', 'BOOLEAN']),
  category: z.enum([
    'SOCIAL_MEDIA',
    'MESSAGING',
    'STREAMING',
    'ECOMMERCE',
    'SEARCH',
    'STORAGE',
    'ANALYTICS',
    'GAMING'
  ]),
  order: z.number().int().optional(),
  description: z.string().optional(),
  isActive: z.boolean().default(true),
  context: z.any().optional(),
  followUpRules: z.any().optional()
});

const updateQuestionTemplateSchema = z.object({
  id: z.string(),
  text: z.string().min(1).optional(),
  type: z
    .enum(['MULTIPLE_CHOICE', 'TEXT_INPUT', 'SCALE', 'BOOLEAN'])
    .optional(),
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
  order: z.number().int().optional(),
  description: z.string().optional(),
  isActive: z.boolean().optional(),
  context: z.any().optional(),
  followUpRules: z.any().optional()
});

export const adminRouter = createTRPCRouter({
  // System overview/dashboard
  getDashboard: adminProcedure.query(async ({ ctx }) => {
    const [
      totalUsers,
      totalSessions,
      totalExports,
      totalAgents,
      activeAgents,
      recentSessions,
      systemSettings
    ] = await Promise.all([
      ctx.db.user.count(),
      ctx.db.designSession.count(),
      ctx.db.export.count(),
      ctx.db.aIAgent.count(),
      ctx.db.aIAgent.count({ where: { isActive: true } }),
      ctx.db.designSession.findMany({
        take: 10,
        orderBy: { createdAt: 'desc' },
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
              answers: true
            }
          }
        }
      }),
      ctx.db.systemSetting.findMany({
        orderBy: { key: 'asc' }
      })
    ]);

    // Get session statistics by category
    const sessionsByCategory = await ctx.db.designSession.groupBy({
      by: ['category'],
      _count: { id: true }
    });

    // Get export statistics by status
    const exportsByStatus = await ctx.db.export.groupBy({
      by: ['status'],
      _count: { id: true }
    });

    return {
      stats: {
        totalUsers,
        totalSessions,
        totalExports,
        totalAgents,
        activeAgents
      },
      sessionsByCategory: sessionsByCategory.reduce(
        (acc: Record<string, number>, item: any) => {
          acc[item.category] = item._count.id;
          return acc;
        },
        {} as Record<string, number>
      ),
      exportsByStatus: exportsByStatus.reduce(
        (acc: Record<string, number>, item: any) => {
          acc[item.status] = item._count.id;
          return acc;
        },
        {} as Record<string, number>
      ),
      recentSessions,
      systemSettings
    };
  }),

  // User management
  getUsers: adminProcedure
    .input(
      z.object({
        limit: z.number().min(1).max(100).default(20),
        cursor: z.string().optional(),
        role: z.enum(['USER', 'ADMIN']).optional()
      })
    )
    .query(async ({ ctx, input }) => {
      const where = input.role ? { role: input.role } : {};

      const users = await ctx.db.user.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: input.limit + 1,
        ...(input.cursor && {
          cursor: { id: input.cursor },
          skip: 1
        }),
        include: {
          _count: {
            select: {
              designSessions: true,
              templates: true,
              questionTemplates: true
            }
          }
        }
      });

      let nextCursor: typeof input.cursor | undefined = undefined;
      if (users.length > input.limit) {
        const nextItem = users.pop();
        nextCursor = nextItem!.id;
      }

      return {
        users,
        nextCursor
      };
    }),

  // Update user role
  updateUserRole: adminProcedure
    .input(
      z.object({
        userId: z.string(),
        role: z.enum(['USER', 'ADMIN'])
      })
    )
    .mutation(async ({ ctx, input }) => {
      const user = await ctx.db.user.findUnique({
        where: { id: input.userId }
      });

      if (!user) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'User not found'
        });
      }

      const updatedUser = await ctx.db.user.update({
        where: { id: input.userId },
        data: { role: input.role },
        select: {
          id: true,
          name: true,
          email: true,
          role: true
        }
      });

      return updatedUser;
    }),

  // AI Agent management
  getAgents: adminProcedure.query(async ({ ctx }) => {
    const agents = await ctx.db.aIAgent.findMany({
      orderBy: [{ priority: 'desc' }, { name: 'asc' }],
      include: {
        creator: {
          select: {
            id: true,
            name: true,
            email: true
          }
        },
        _count: {
          select: {
            executionLogs: true
          }
        }
      }
    });

    return agents;
  }),

  createAgent: adminProcedure
    .input(createAgentSchema)
    .mutation(async ({ ctx, input }) => {
      const agent = await ctx.db.aIAgent.create({
        data: {
          name: input.name,
          description: input.description,
          model: input.model,
          provider: input.provider,
          capabilities: input.capabilities,
          config: input.config || {},
          isActive: input.isActive,
          priority: input.priority,
          createdBy: ctx.session.user.id
        },
        include: {
          creator: {
            select: {
              id: true,
              name: true,
              email: true
            }
          }
        }
      });

      return agent;
    }),

  updateAgent: adminProcedure
    .input(updateAgentSchema)
    .mutation(async ({ ctx, input }) => {
      const { id, ...updateData } = input;

      const agent = await ctx.db.aIAgent.findUnique({
        where: { id }
      });

      if (!agent) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Agent not found'
        });
      }

      const updatedAgent = await ctx.db.aIAgent.update({
        where: { id },
        data: updateData,
        include: {
          creator: {
            select: {
              id: true,
              name: true,
              email: true
            }
          }
        }
      });

      return updatedAgent;
    }),

  deleteAgent: adminProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const agent = await ctx.db.aIAgent.findUnique({
        where: { id: input.id }
      });

      if (!agent) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Agent not found'
        });
      }

      await ctx.db.aIAgent.delete({
        where: { id: input.id }
      });

      return { success: true };
    }),

  // System settings management
  getSettings: adminProcedure.query(async ({ ctx }) => {
    const settings = await ctx.db.systemSetting.findMany({
      orderBy: { key: 'asc' },
      include: {
        updatedByUser: {
          select: {
            id: true,
            name: true,
            email: true
          }
        }
      }
    });

    return settings;
  }),

  updateSetting: adminProcedure
    .input(updateSettingSchema)
    .mutation(async ({ ctx, input }) => {
      const setting = await ctx.db.systemSetting.upsert({
        where: { key: input.key },
        update: {
          value: input.value,
          description: input.description,
          updatedBy: ctx.session.user.id
        },
        create: {
          key: input.key,
          value: input.value,
          description: input.description,
          updatedBy: ctx.session.user.id
        },
        include: {
          updatedByUser: {
            select: {
              id: true,
              name: true,
              email: true
            }
          }
        }
      });

      return setting;
    }),

  deleteSetting: adminProcedure
    .input(z.object({ key: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const setting = await ctx.db.systemSetting.findUnique({
        where: { key: input.key }
      });

      if (!setting) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Setting not found'
        });
      }

      await ctx.db.systemSetting.delete({
        where: { key: input.key }
      });

      return { success: true };
    }),

  // Question template management
  getQuestionTemplates: adminProcedure
    .input(
      z.object({
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
        isActive: z.boolean().optional()
      })
    )
    .query(async ({ ctx, input }) => {
      const where: any = {};
      if (input.category) where.category = input.category;
      if (input.isActive !== undefined) where.isActive = input.isActive;

      const templates = await ctx.db.questionTemplate.findMany({
        where,
        orderBy: [{ category: 'asc' }, { order: 'asc' }, { text: 'asc' }],
        include: {
          creator: {
            select: {
              id: true,
              name: true,
              email: true
            }
          }
        }
      });

      return templates;
    }),

  createQuestionTemplate: adminProcedure
    .input(createQuestionTemplateSchema)
    .mutation(async ({ ctx, input }) => {
      const template = await ctx.db.questionTemplate.create({
        data: {
          ...input,
          createdBy: ctx.session.user.id
        },
        include: {
          creator: {
            select: {
              id: true,
              name: true,
              email: true
            }
          }
        }
      });

      return template;
    }),

  updateQuestionTemplate: adminProcedure
    .input(updateQuestionTemplateSchema)
    .mutation(async ({ ctx, input }) => {
      const { id, ...updateData } = input;

      const template = await ctx.db.questionTemplate.findUnique({
        where: { id }
      });

      if (!template) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Question template not found'
        });
      }

      const updatedTemplate = await ctx.db.questionTemplate.update({
        where: { id },
        data: updateData,
        include: {
          creator: {
            select: {
              id: true,
              name: true,
              email: true
            }
          }
        }
      });

      return updatedTemplate;
    }),

  deleteQuestionTemplate: adminProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const template = await ctx.db.questionTemplate.findUnique({
        where: { id: input.id }
      });

      if (!template) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Question template not found'
        });
      }

      await ctx.db.questionTemplate.delete({
        where: { id: input.id }
      });

      return { success: true };
    }),

  // Agent execution logs
  getAgentLogs: adminProcedure
    .input(
      z.object({
        agentId: z.string().optional(),
        sessionId: z.string().optional(),
        requestType: z.string().optional(),
        limit: z.number().min(1).max(100).default(50),
        cursor: z.string().optional()
      })
    )
    .query(async ({ ctx, input }) => {
      const where: any = {};
      if (input.agentId) where.agentId = input.agentId;
      if (input.sessionId) where.sessionId = input.sessionId;
      if (input.requestType) where.requestType = input.requestType;

      const logs = await ctx.db.agentExecutionLog.findMany({
        where,
        orderBy: { startTime: 'desc' },
        take: input.limit + 1,
        ...(input.cursor && {
          cursor: { id: input.cursor },
          skip: 1
        }),
        include: {
          agent: {
            select: {
              id: true,
              name: true,
              model: true,
              provider: true
            }
          },
          session: {
            select: {
              id: true,
              title: true,
              category: true
            }
          }
        }
      });

      let nextCursor: typeof input.cursor | undefined = undefined;
      if (logs.length > input.limit) {
        const nextItem = logs.pop();
        nextCursor = nextItem!.id;
      }

      return {
        logs,
        nextCursor
      };
    }),

  // System health check
  getSystemHealth: adminProcedure.query(async ({ ctx }) => {
    try {
      // Test database connection
      await ctx.db.$queryRaw`SELECT 1`;

      // Get basic metrics
      const [userCount, sessionCount, agentCount] = await Promise.all([
        ctx.db.user.count(),
        ctx.db.designSession.count(),
        ctx.db.aIAgent.count({ where: { isActive: true } })
      ]);

      return {
        status: 'healthy',
        database: 'connected',
        metrics: {
          users: userCount,
          sessions: sessionCount,
          activeAgents: agentCount
        },
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        database: 'disconnected',
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString()
      };
    }
  })
});
