import { z } from 'zod';
import { TRPCError } from '@trpc/server';

import { createTRPCRouter, protectedProcedure } from '~/trpc/trpc';
import { CanvasService } from '~/services/CanvasService';

// Input schemas
const updateCanvasSchema = z.object({
  sessionId: z.string(),
  canvasData: z.any(),
  createVersion: z.boolean().default(false)
});

const createElementSchema = z.object({
  sessionId: z.string(),
  versionId: z.string(),
  elementType: z.enum([
    'SHAPE',
    'CONNECTOR',
    'TEXT',
    'IMAGE',
    'GROUP',
    'AI_DIAGRAM'
  ]),
  elementId: z.string(),
  data: z.any(),
  position: z.object({
    x: z.number(),
    y: z.number()
  }),
  size: z
    .object({
      width: z.number(),
      height: z.number()
    })
    .optional(),
  style: z.any().optional(),
  generatedBy: z.string().optional(),
  prompt: z.string().optional()
});

const updateElementSchema = z.object({
  id: z.string(),
  data: z.any().optional(),
  position: z
    .object({
      x: z.number(),
      y: z.number()
    })
    .optional(),
  size: z
    .object({
      width: z.number(),
      height: z.number()
    })
    .optional(),
  style: z.any().optional()
});

const getCanvasSchema = z.object({
  sessionId: z.string(),
  versionId: z.string().optional()
});

const generateDiagramSchema = z.object({
  sessionId: z.string(),
  prompt: z.string().min(1),
  diagramType: z.string().optional(),
  agentId: z.string().optional()
});

const canvasService = new CanvasService();

export const canvasRouter = createTRPCRouter({
  // Get canvas data for a session
  get: protectedProcedure
    .input(getCanvasSchema)
    .query(async ({ ctx, input }) => {
      return canvasService.getCanvasData({
        userId: ctx.session.user.id,
        sessionId: input.sessionId,
        versionId: input.versionId,
        db: ctx.db
      });
    }),

  // Update canvas data
  update: protectedProcedure
    .input(updateCanvasSchema)
    .mutation(async ({ ctx, input }) => {
      return canvasService.updateCanvas({
        userId: ctx.session.user.id,
        sessionId: input.sessionId,
        canvasData: input.canvasData,
        createVersion: input.createVersion,
        db: ctx.db
      });
    }),

  // Create a canvas element
  createElement: protectedProcedure
    .input(createElementSchema)
    .mutation(async ({ ctx, input }) => {
      return canvasService.createElement({
        userId: ctx.session.user.id,
        ...input,
        db: ctx.db
      });
    }),

  // Update a canvas element
  updateElement: protectedProcedure
    .input(updateElementSchema)
    .mutation(async ({ ctx, input }) => {
      return canvasService.updateElement({
        userId: ctx.session.user.id,
        ...input,
        db: ctx.db
      });
    }),

  // Delete a canvas element
  deleteElement: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      return canvasService.deleteElement({
        userId: ctx.session.user.id,
        elementId: input.id,
        db: ctx.db
      });
    }),

  // Get canvas elements for a version
  getElements: protectedProcedure
    .input(
      z.object({
        sessionId: z.string(),
        versionId: z.string().optional()
      })
    )
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

      let versionId = input.versionId;

      // If no version specified, get the latest version
      if (!versionId) {
        const latestVersion = await ctx.db.sessionVersion.findFirst({
          where: { sessionId: input.sessionId },
          orderBy: { version: 'desc' }
        });
        versionId = latestVersion?.id;
      }

      if (!versionId) {
        return [];
      }

      const elements = await ctx.db.canvasElement.findMany({
        where: {
          sessionId: input.sessionId,
          versionId
        },
        orderBy: { createdAt: 'asc' }
      });

      return elements;
    }),

  // Generate AI diagram
  generateDiagram: protectedProcedure
    .input(generateDiagramSchema)
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

      // TODO: This will integrate with the AI service to generate diagrams
      // For now, return a placeholder response
      return {
        success: true,
        message:
          'AI diagram generation will be implemented with AI service integration',
        prompt: input.prompt,
        sessionId: input.sessionId,
        diagramType: input.diagramType
      };
    }),

  // Get canvas history/versions
  getVersions: protectedProcedure
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

      const versions = await ctx.db.sessionVersion.findMany({
        where: { sessionId: input.sessionId },
        orderBy: { version: 'desc' },
        include: {
          _count: {
            select: {
              canvasElements: true
            }
          }
        }
      });

      return versions;
    }),

  // Restore a specific version
  restoreVersion: protectedProcedure
    .input(
      z.object({
        sessionId: z.string(),
        versionId: z.string()
      })
    )
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

      // Get the version to restore
      const versionToRestore = await ctx.db.sessionVersion.findFirst({
        where: {
          id: input.versionId,
          sessionId: input.sessionId
        }
      });

      if (!versionToRestore) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Version not found'
        });
      }

      // Create a new version based on the restored version
      const newVersion = await ctx.db.sessionVersion.create({
        data: {
          sessionId: input.sessionId,
          version: session.currentVersion + 1,
          canvasData: versionToRestore.canvasData as any,
          narrative: versionToRestore.narrative,
          snapshot: {
            ...(typeof versionToRestore.snapshot === 'object' &&
            versionToRestore.snapshot !== null
              ? versionToRestore.snapshot
              : {}),
            restoredFrom: versionToRestore.version,
            timestamp: new Date().toISOString()
          }
        }
      });

      // Update session with restored data
      await ctx.db.designSession.update({
        where: { id: input.sessionId },
        data: {
          canvasData: versionToRestore.canvasData as any,
          narrative: versionToRestore.narrative,
          currentVersion: newVersion.version
        }
      });

      return {
        success: true,
        newVersion,
        restoredFromVersion: versionToRestore.version
      };
    })
});
