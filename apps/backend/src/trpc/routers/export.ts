import { z } from 'zod';
import { TRPCError } from '@trpc/server';

import { createTRPCRouter, protectedProcedure } from '~/trpc/trpc';
import { DocumentGenerationService } from '../../services/DocumentGenerationService';

// Input schemas
const createExportSchema = z.object({
  sessionId: z.string(),
  templateId: z.string(),
  format: z.enum(['PDF', 'DOCX', 'HTML'])
});

const getExportSchema = z.object({
  id: z.string()
});

const listExportsSchema = z.object({
  sessionId: z.string().optional(),
  status: z.enum(['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED']).optional(),
  limit: z.number().min(1).max(100).default(20),
  cursor: z.string().optional()
});

const createTemplateSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  type: z.enum(['DESIGN_DOCUMENT', 'PRESENTATION', 'TECHNICAL_SPEC']),
  content: z.any(),
  isPublic: z.boolean().default(false)
});

const updateTemplateSchema = z.object({
  id: z.string(),
  name: z.string().min(1).max(255).optional(),
  description: z.string().optional(),
  type: z
    .enum(['DESIGN_DOCUMENT', 'PRESENTATION', 'TECHNICAL_SPEC'])
    .optional(),
  content: z.any().optional(),
  isPublic: z.boolean().optional()
});

export const exportRouter = createTRPCRouter({
  // Create a new export
  create: protectedProcedure
    .input(createExportSchema)
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

      // Verify template exists and is accessible
      const template = await ctx.db.template.findFirst({
        where: {
          id: input.templateId,
          OR: [{ createdBy: ctx.session.user.id }, { isPublic: true }]
        }
      });

      if (!template) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Template not found or not accessible'
        });
      }

      const exportRecord = await ctx.db.export.create({
        data: {
          sessionId: input.sessionId,
          templateId: input.templateId,
          format: input.format,
          status: 'PENDING'
        }
      });

      // Get related data for response
      const sessionData = await ctx.db.designSession.findUnique({
        where: { id: input.sessionId },
        select: {
          id: true,
          title: true,
          category: true
        }
      });

      const templateData = await ctx.db.template.findUnique({
        where: { id: input.templateId },
        select: {
          id: true,
          name: true,
          type: true
        }
      });

      // Start document generation process
      try {
        const documentService = new DocumentGenerationService();
        
        // Update status to processing
        await ctx.db.export.update({
          where: { id: exportRecord.id },
          data: { status: 'PROCESSING' }
        });
        
        // Generate the document asynchronously
        documentService.generateDocument(
          exportRecord.id,
          input.sessionId,
          input.templateId,
          input.format
        ).then(async (result) => {
          await ctx.db.export.update({
            where: { id: exportRecord.id },
            data: {
              status: 'COMPLETED',
              fileUrl: result.fileUrl,
              completedAt: new Date()
            }
          });
        }).catch(async (error) => {
          console.error('Export generation failed:', error);
          await ctx.db.export.update({
            where: { id: exportRecord.id },
            data: {
              status: 'FAILED'
            }
          });
        });
      } catch (error) {
        // If there's an immediate error, mark as failed
        await ctx.db.export.update({
          where: { id: exportRecord.id },
          data: { status: 'FAILED' }
        });
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to start export generation'
        });
      }

      return {
        ...exportRecord,
        session: sessionData,
        template: templateData
      };
    }),

  // Get a specific export
  get: protectedProcedure
    .input(getExportSchema)
    .query(async ({ ctx, input }) => {
      const exportRecord = await ctx.db.export.findFirst({
        where: { id: input.id }
      });

      if (!exportRecord) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Export not found'
        });
      }

      // Check session ownership
      const session = await ctx.db.designSession.findUnique({
        where: { id: exportRecord.sessionId },
        select: { userId: true, id: true, title: true, category: true }
      });

      if (!session || session.userId !== ctx.session.user.id) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Export not found'
        });
      }

      // Get template data
      const template = await ctx.db.template.findUnique({
        where: { id: exportRecord.templateId },
        select: {
          id: true,
          name: true,
          type: true
        }
      });

      return {
        ...exportRecord,
        session,
        template
      };
    }),

  // List exports
  list: protectedProcedure
    .input(listExportsSchema)
    .query(async ({ ctx, input }) => {
      const where: any = {};

      // If sessionId is provided, verify ownership
      if (input.sessionId) {
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

        where.sessionId = input.sessionId;
      } else {
        // Get all sessions owned by the user
        const userSessions = await ctx.db.designSession.findMany({
          where: { userId: ctx.session.user.id },
          select: { id: true }
        });

        where.sessionId = { in: userSessions.map((s: any) => s.id) };
      }

      if (input.status) {
        where.status = input.status;
      }

      const exports = await ctx.db.export.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: input.limit + 1,
        ...(input.cursor && {
          cursor: { id: input.cursor },
          skip: 1
        })
      });

      // Get related data
      const sessionIds = [...new Set(exports.map((e: any) => e.sessionId))];
      const templateIds = [...new Set(exports.map((e: any) => e.templateId))];

      const sessions = await ctx.db.designSession.findMany({
        where: { id: { in: sessionIds } },
        select: {
          id: true,
          title: true,
          category: true
        }
      });

      const templates = await ctx.db.template.findMany({
        where: { id: { in: templateIds } },
        select: {
          id: true,
          name: true,
          type: true
        }
      });

      let nextCursor: typeof input.cursor | undefined = undefined;
      if (exports.length > input.limit) {
        const nextItem = exports.pop();
        nextCursor = nextItem!.id;
      }

      // Combine data
      const exportsWithData = exports.map((exp: any) => ({
        ...exp,
        session: sessions.find((s: any) => s.id === exp.sessionId),
        template: templates.find((t: any) => t.id === exp.templateId)
      }));

      return {
        exports: exportsWithData,
        nextCursor
      };
    }),

  // Delete an export
  delete: protectedProcedure
    .input(getExportSchema)
    .mutation(async ({ ctx, input }) => {
      const exportRecord = await ctx.db.export.findFirst({
        where: { id: input.id }
      });

      if (!exportRecord) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Export not found'
        });
      }

      // Check session ownership
      const session = await ctx.db.designSession.findUnique({
        where: { id: exportRecord.sessionId },
        select: { userId: true }
      });

      if (!session || session.userId !== ctx.session.user.id) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Export not found'
        });
      }

      await ctx.db.export.delete({
        where: { id: input.id }
      });

      // TODO: Clean up export file if it exists

      return { success: true };
    }),

  // Create a template
  createTemplate: protectedProcedure
    .input(createTemplateSchema)
    .mutation(async ({ ctx, input }) => {
      const template = await ctx.db.template.create({
        data: {
          name: input.name,
          description: input.description,
          type: input.type,
          content: input.content || {},
          isPublic: input.isPublic,
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

  // Get templates
  getTemplates: protectedProcedure
    .input(
      z.object({
        type: z
          .enum(['DESIGN_DOCUMENT', 'PRESENTATION', 'TECHNICAL_SPEC'])
          .optional(),
        includePublic: z.boolean().default(true)
      })
    )
    .query(async ({ ctx, input }) => {
      const where: any = {
        OR: [
          { createdBy: ctx.session.user.id },
          ...(input.includePublic ? [{ isPublic: true }] : [])
        ]
      };

      if (input.type) {
        where.type = input.type;
      }

      const templates = await ctx.db.template.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
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

      // Get export counts separately
      const templateIds = templates.map((t: any) => t.id);
      const exportCounts = await ctx.db.export.groupBy({
        by: ['templateId'],
        where: {
          templateId: { in: templateIds }
        },
        _count: {
          id: true
        }
      });

      // Add counts to templates
      const templatesWithCounts = templates.map((template: any) => ({
        ...template,
        exportCount:
          exportCounts.find((e: any) => e.templateId === template.id)?._count.id || 0
      }));

      return templatesWithCounts;
    }),

  // Update a template
  updateTemplate: protectedProcedure
    .input(updateTemplateSchema)
    .mutation(async ({ ctx, input }) => {
      const { id, ...updateData } = input;

      // Verify template ownership
      const template = await ctx.db.template.findFirst({
        where: {
          id,
          createdBy: ctx.session.user.id
        }
      });

      if (!template) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Template not found'
        });
      }

      const updatedTemplate = await ctx.db.template.update({
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

      // Get export count separately
      const exportCount = await ctx.db.export.count({
        where: { templateId: id }
      });

      return {
        ...updatedTemplate,
        exportCount
      };
    }),

  // Delete a template
  deleteTemplate: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      // Verify template ownership
      const template = await ctx.db.template.findFirst({
        where: {
          id: input.id,
          createdBy: ctx.session.user.id
        }
      });

      if (!template) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Template not found'
        });
      }

      // Check if template is being used in any exports
      const activeExports = await ctx.db.export.count({
        where: {
          templateId: input.id,
          status: {
            in: ['PENDING', 'PROCESSING']
          }
        }
      });

      if (activeExports > 0) {
        throw new TRPCError({
          code: 'CONFLICT',
          message: 'Cannot delete template with active exports'
        });
      }

      await ctx.db.template.delete({
        where: { id: input.id }
      });

      return { success: true };
    }),

  // Process export (for background job simulation)
  processExport: protectedProcedure
    .input(getExportSchema)
    .mutation(async ({ ctx, input }) => {
      const exportRecord = await ctx.db.export.findFirst({
        where: { id: input.id }
      });

      if (!exportRecord) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Export not found'
        });
      }

      // Check session ownership
      const session = await ctx.db.designSession.findUnique({
        where: { id: exportRecord.sessionId },
        select: { userId: true }
      });

      if (!session || session.userId !== ctx.session.user.id) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Export not found'
        });
      }

      if (exportRecord.status !== 'PENDING') {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Export is not in pending status'
        });
      }

      // Update status to processing
      await ctx.db.export.update({
        where: { id: input.id },
        data: { status: 'PROCESSING' }
      });

      // Implement actual export processing logic
      try {
        const documentService = new DocumentGenerationService();
        
        const result = await documentService.generateDocument(
          input.id,
          exportRecord.sessionId,
          exportRecord.templateId,
          exportRecord.format as 'PDF' | 'DOCX' | 'HTML'
        );
        
        await ctx.db.export.update({
          where: { id: input.id },
          data: {
            status: 'COMPLETED',
            fileUrl: result.fileUrl,
            completedAt: new Date()
          }
        });
      } catch (error) {
        console.error('Export processing failed:', error);
        await ctx.db.export.update({
          where: { id: input.id },
          data: {
            status: 'FAILED'
          }
        });
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Export processing failed'
        });
      }

      return {
        success: true,
        message: 'Export processing started'
      };
    }),

  // Get export statistics
  getStats: protectedProcedure.query(async ({ ctx }) => {
    // Get all sessions owned by the user
    const userSessions = await ctx.db.designSession.findMany({
      where: { userId: ctx.session.user.id },
      select: { id: true }
    });

    const sessionIds = userSessions.map((s: any) => s.id);

    const stats = await ctx.db.export.groupBy({
      by: ['status', 'format'],
      where: {
        sessionId: { in: sessionIds }
      },
      _count: {
        id: true
      }
    });

    const totalExports = await ctx.db.export.count({
      where: {
        sessionId: { in: sessionIds }
      }
    });

    return {
      totalExports,
      byStatus: stats.reduce(
        (
          acc: Record<
            string,
            { total: number; byFormat: Record<string, number> }
          >,
          stat: any
        ) => {
          if (!acc[stat.status]) {
            acc[stat.status] = { total: 0, byFormat: {} };
          }
          const count = typeof stat._count === 'object' ? stat._count.id : 0;
          acc[stat.status]!.total += count;
          acc[stat.status]!.byFormat[stat.format] = count;
          return acc;
        },
        {}
      )
    };
  })
});
