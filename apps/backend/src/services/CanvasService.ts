import { PrismaClient } from '.prisma/client';
import { z } from 'zod';

const prisma = new PrismaClient();

// Canvas element schema for validation
const CanvasElementSchema = z.object({
  id: z.string(),
  type: z.string(),
  x: z.number(),
  y: z.number(),
  width: z.number(),
  height: z.number(),
  angle: z.number().optional(),
  strokeColor: z.string().optional(),
  backgroundColor: z.string().optional(),
  fillStyle: z.string().optional(),
  strokeWidth: z.number().optional(),
  roughness: z.number().optional(),
  opacity: z.number().optional(),
  text: z.string().optional(),
  fontSize: z.number().optional(),
  fontFamily: z.string().optional(),
  textAlign: z.string().optional(),
  verticalAlign: z.string().optional(),
  points: z.array(z.array(z.number())).optional(),
  lastCommittedPoint: z.array(z.number()).optional(),
  startBinding: z.any().optional(),
  endBinding: z.any().optional(),
  startArrowhead: z.string().optional(),
  endArrowhead: z.string().optional()
});

const CanvasDataSchema = z.object({
  elements: z.array(CanvasElementSchema),
  appState: z
    .object({
      viewBackgroundColor: z.string().optional(),
      currentItemStrokeColor: z.string().optional(),
      currentItemBackgroundColor: z.string().optional(),
      currentItemFillStyle: z.string().optional(),
      currentItemStrokeWidth: z.number().optional(),
      currentItemRoughness: z.number().optional(),
      currentItemOpacity: z.number().optional(),
      currentItemFontFamily: z.string().optional(),
      currentItemFontSize: z.number().optional(),
      currentItemTextAlign: z.string().optional(),
      currentItemStartArrowhead: z.string().optional(),
      currentItemEndArrowhead: z.string().optional(),
      scrollX: z.number().optional(),
      scrollY: z.number().optional(),
      zoom: z
        .object({
          value: z.number()
        })
        .optional(),
      currentTool: z.string().optional(),
      selectedElementIds: z.record(z.boolean()).optional(),
      gridSize: z.number().optional(),
      colorPalette: z.record(z.string()).optional()
    })
    .optional(),
  files: z.record(z.any()).optional()
});

export type CanvasElement = z.infer<typeof CanvasElementSchema>;
export type CanvasData = z.infer<typeof CanvasDataSchema>;

export class CanvasService {
  /**
   * Get canvas data by session ID
   */
  async getCanvas(sessionId: string, userId: string) {
    const canvas = await prisma.canvas.findFirst({
      where: {
        sessionId,
        session: {
          userId
        }
      },
      include: {
        session: true
      }
    });

    if (!canvas) {
      // Return empty canvas if none exists
      return {
        id: null,
        sessionId,
        elements: [],
        appState: {},
        files: {},
        version: 0,
        createdAt: new Date(),
        updatedAt: new Date()
      };
    }

    return {
      ...canvas,
      data: canvas.data as CanvasData
    };
  }

  /**
   * Update canvas with validation and versioning
   */
  async updateCanvas(
    sessionId: string,
    userId: string,
    canvasData: CanvasData,
    version?: number
  ) {
    // Validate canvas data
    const validatedData = CanvasDataSchema.parse(canvasData);

    // Check if session exists and belongs to user
    const session = await prisma.designSession.findFirst({
      where: {
        id: sessionId,
        userId
      }
    });

    if (!session) {
      throw new Error('Design session not found or access denied');
    }

    // Get existing canvas
    const existingCanvas = await prisma.canvas.findFirst({
      where: { sessionId }
    });

    if (existingCanvas && version && existingCanvas.version !== version) {
      throw new Error('Canvas version conflict. Please refresh and try again.');
    }

    const newVersion = (existingCanvas?.version || 0) + 1;

    // Upsert canvas
    const canvas = await prisma.canvas.upsert({
      where: {
        sessionId
      },
      create: {
        sessionId,
        data: validatedData as any,
        version: newVersion
      },
      update: {
        data: validatedData as any,
        version: newVersion,
        updatedAt: new Date()
      }
    });

    // Update session's last activity
    await prisma.designSession.update({
      where: { id: sessionId },
      data: { updatedAt: new Date() }
    });

    return {
      ...canvas,
      data: canvas.data as CanvasData
    };
  }

  /**
   * Create canvas snapshot for versioning
   */
  async createSnapshot(
    sessionId: string,
    userId: string,
    description?: string
  ) {
    const canvas = await this.getCanvas(sessionId, userId);

    if (!canvas.data) {
      throw new Error('No canvas data to snapshot');
    }

    // Store snapshot in a separate table (you'd need to add this to schema)
    // For now, we'll just return the current canvas with snapshot metadata
    return {
      id: `snapshot_${Date.now()}`,
      sessionId,
      data: canvas.data,
      version: canvas.version,
      description:
        description || `Snapshot created at ${new Date().toISOString()}`,
      createdAt: new Date()
    };
  }

  /**
   * Export canvas to different formats
   */
  async exportCanvas(
    sessionId: string,
    userId: string,
    format: 'json' | 'png' | 'svg' = 'json'
  ) {
    const canvas = await this.getCanvas(sessionId, userId);

    if (!canvas.data || !canvas.data.elements.length) {
      throw new Error('No canvas data to export');
    }

    switch (format) {
      case 'json':
        return {
          format,
          data: canvas.data,
          metadata: {
            sessionId,
            version: canvas.version,
            exportedAt: new Date().toISOString(),
            elementCount: canvas.data.elements.length
          }
        };

      case 'png':
      case 'svg':
        // For image exports, we'd need to integrate with Excalidraw's export functions
        // This would typically be handled on the frontend, but we can provide metadata
        return {
          format,
          metadata: {
            sessionId,
            version: canvas.version,
            exportedAt: new Date().toISOString(),
            elementCount: canvas.data.elements.length,
            instructions: `Use Excalidraw's export${format.toUpperCase()} function on the frontend`
          }
        };

      default:
        throw new Error(`Unsupported export format: ${format}`);
    }
  }

  /**
   * Generate AI-powered diagram suggestions based on context
   */
  async generateDiagramSuggestions(
    sessionId: string,
    userId: string,
    context?: string
  ) {
    // Get session context
    const session = await prisma.designSession.findFirst({
      where: {
        id: sessionId,
        userId
      },
      include: {
        answers: {
          include: {
            question: true
          }
        }
      }
    });

    if (!session) {
      throw new Error('Design session not found');
    }

    // Analyze answers to understand design requirements
    const designContext = session.answers.map((answer) => ({
      question: answer.question.text,
      answer: answer.value,
      type: answer.question.type
    }));

    // Generate diagram suggestions based on common UX patterns
    const suggestions = this.generateDiagramTemplates(designContext, context);

    return {
      sessionId,
      suggestions,
      generatedAt: new Date().toISOString(),
      context: designContext
    };
  }

  /**
   * Insert AI-generated diagram elements
   */
  async insertGeneratedDiagram(
    sessionId: string,
    userId: string,
    diagramType: string,
    position?: { x: number; y: number }
  ) {
    const templates = this.getDiagramTemplates();
    const template = templates[diagramType];

    if (!template) {
      throw new Error(`Unknown diagram type: ${diagramType}`);
    }

    const basePosition = position || { x: 100, y: 100 };

    // Generate elements based on template
    const elements = template.elements.map((element: any, index: number) => ({
      ...element,
      id: `generated_${Date.now()}_${index}`,
      x: basePosition.x + (element.x || 0),
      y: basePosition.y + (element.y || 0)
    }));

    // Get current canvas
    const canvas = await this.getCanvas(sessionId, userId);
    const currentElements = canvas.data?.elements || [];

    // Combine with existing elements
    const updatedData: CanvasData = {
      elements: [...currentElements, ...elements],
      appState: canvas.data?.appState || {},
      files: canvas.data?.files || {}
    };

    // Update canvas
    return await this.updateCanvas(
      sessionId,
      userId,
      updatedData,
      canvas.version
    );
  }

  /**
   * Get analytics about canvas usage
   */
  async getCanvasAnalytics(sessionId: string, userId: string) {
    const canvas = await this.getCanvas(sessionId, userId);

    if (!canvas.data) {
      return {
        elementCount: 0,
        elementTypes: {},
        complexity: 0,
        lastModified: canvas.updatedAt
      };
    }

    const elements = canvas.data.elements;
    const elementTypes = elements.reduce(
      (acc: Record<string, number>, element) => {
        acc[element.type] = (acc[element.type] || 0) + 1;
        return acc;
      },
      {}
    );

    const complexity = this.calculateComplexity(elements);

    return {
      elementCount: elements.length,
      elementTypes,
      complexity,
      lastModified: canvas.updatedAt,
      version: canvas.version,
      hasText: elements.some((el) => el.type === 'text'),
      hasShapes: elements.some((el) =>
        ['rectangle', 'ellipse', 'diamond'].includes(el.type)
      ),
      hasArrows: elements.some((el) => el.type === 'arrow'),
      boundingBox: this.calculateBoundingBox(elements)
    };
  }

  /**
   * Generate diagram templates based on design context
   */
  private generateDiagramTemplates(
    designContext: any[],
    additionalContext?: string
  ) {
    const suggestions = [];

    // Analyze context for common UX patterns
    const hasUserFlow = designContext.some(
      (ctx) =>
        ctx.question.toLowerCase().includes('user') ||
        ctx.question.toLowerCase().includes('flow')
    );

    const hasLayout = designContext.some(
      (ctx) =>
        ctx.question.toLowerCase().includes('layout') ||
        ctx.question.toLowerCase().includes('structure')
    );

    const hasNavigation = designContext.some(
      (ctx) =>
        ctx.question.toLowerCase().includes('navigation') ||
        ctx.question.toLowerCase().includes('menu')
    );

    if (hasUserFlow) {
      suggestions.push({
        type: 'userFlow',
        title: 'User Flow Diagram',
        description:
          'Visual representation of user journey through your design',
        complexity: 'medium',
        elements: 5
      });
    }

    if (hasLayout) {
      suggestions.push({
        type: 'wireframe',
        title: 'Layout Wireframe',
        description: 'Basic structural layout of your interface',
        complexity: 'low',
        elements: 8
      });
    }

    if (hasNavigation) {
      suggestions.push({
        type: 'sitemap',
        title: 'Site Map',
        description: 'Hierarchical structure of your application',
        complexity: 'medium',
        elements: 6
      });
    }

    // Always suggest basic templates
    suggestions.push(
      {
        type: 'basicLayout',
        title: 'Basic Layout',
        description: 'Simple rectangular layout components',
        complexity: 'low',
        elements: 4
      },
      {
        type: 'processFlow',
        title: 'Process Flow',
        description: 'Step-by-step process visualization',
        complexity: 'medium',
        elements: 6
      }
    );

    return suggestions;
  }

  /**
   * Get predefined diagram templates
   */
  private getDiagramTemplates() {
    return {
      basicLayout: {
        elements: [
          {
            type: 'rectangle',
            width: 200,
            height: 50,
            x: 0,
            y: 0,
            strokeColor: '#1e1e1e',
            backgroundColor: '#ffffff',
            text: 'Header'
          },
          {
            type: 'rectangle',
            width: 60,
            height: 300,
            x: 0,
            y: 70,
            strokeColor: '#1e1e1e',
            backgroundColor: '#f8f9fa',
            text: 'Sidebar'
          },
          {
            type: 'rectangle',
            width: 120,
            height: 300,
            x: 80,
            y: 70,
            strokeColor: '#1e1e1e',
            backgroundColor: '#ffffff',
            text: 'Main Content'
          }
        ]
      },
      userFlow: {
        elements: [
          {
            type: 'ellipse',
            width: 80,
            height: 40,
            x: 0,
            y: 0,
            strokeColor: '#1971c2',
            backgroundColor: '#e7f5ff',
            text: 'Start'
          },
          {
            type: 'arrow',
            x: 90,
            y: 20,
            width: 50,
            height: 0,
            points: [
              [0, 0],
              [50, 0]
            ]
          },
          {
            type: 'rectangle',
            width: 100,
            height: 60,
            x: 150,
            y: -10,
            strokeColor: '#1971c2',
            backgroundColor: '#ffffff',
            text: 'Action'
          },
          {
            type: 'arrow',
            x: 260,
            y: 20,
            width: 50,
            height: 0,
            points: [
              [0, 0],
              [50, 0]
            ]
          },
          {
            type: 'ellipse',
            width: 80,
            height: 40,
            x: 320,
            y: 0,
            strokeColor: '#37b24d',
            backgroundColor: '#ebfbee',
            text: 'End'
          }
        ]
      }
    };
  }

  /**
   * Calculate complexity score for canvas elements
   */
  private calculateComplexity(elements: CanvasElement[]): number {
    let complexity = 0;

    elements.forEach((element) => {
      // Base complexity per element
      complexity += 1;

      // Additional complexity for text
      if (element.text) {
        complexity += element.text.length * 0.01;
      }

      // Additional complexity for paths/drawings
      if (element.points && element.points.length > 2) {
        complexity += element.points.length * 0.5;
      }

      // Additional complexity for custom styling
      if (
        element.backgroundColor !== '#ffffff' ||
        element.strokeColor !== '#000000'
      ) {
        complexity += 0.5;
      }
    });

    return Math.round(complexity * 10) / 10;
  }

  /**
   * Calculate bounding box for all elements
   */
  private calculateBoundingBox(elements: CanvasElement[]) {
    if (elements.length === 0) {
      return { minX: 0, minY: 0, maxX: 0, maxY: 0, width: 0, height: 0 };
    }

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    elements.forEach((element) => {
      minX = Math.min(minX, element.x);
      minY = Math.min(minY, element.y);
      maxX = Math.max(maxX, element.x + element.width);
      maxY = Math.max(maxY, element.y + element.height);
    });

    return {
      minX,
      minY,
      maxX,
      maxY,
      width: maxX - minX,
      height: maxY - minY
    };
  }
}

export default CanvasService;
