import { PrismaClient, Answer, Question, DesignSession } from '.prisma/client';
import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { QuestionGenerationService } from './question-generation.service';

// Answer validation schemas
export const answerValidationSchema = z.object({
  questionId: z.string().uuid(),
  sessionId: z.string().uuid(),
  content: z.string().min(1),
  metadata: z.record(z.any()).optional(),
  confidence: z.number().min(0).max(1).optional(),
  source: z.enum(['USER', 'AI', 'IMPORT']).default('USER'),
  tags: z.array(z.string()).optional()
});

export const bulkAnswersSchema = z.object({
  sessionId: z.string().uuid(),
  answers: z.array(answerValidationSchema)
});

export const answerUpdateSchema = answerValidationSchema.partial().extend({
  id: z.string().uuid()
});

export const answerFilterSchema = z.object({
  sessionId: z.string().uuid(),
  questionIds: z.array(z.string().uuid()).optional(),
  categories: z.array(z.string()).optional(),
  dateRange: z
    .object({
      from: z.date(),
      to: z.date()
    })
    .optional(),
  hasFollowups: z.boolean().optional(),
  confidence: z
    .object({
      min: z.number().min(0).max(1),
      max: z.number().min(0).max(1)
    })
    .optional()
});

// Answer trigger types
export interface AnswerTrigger {
  type: 'FOLLOW_UP' | 'VALIDATION' | 'COMPLETION' | 'BRANCHING';
  condition: (answer: Answer, question: Question) => boolean;
  action: (
    answer: Answer,
    question: Question,
    context: AnswerProcessingContext
  ) => Promise<void>;
}

export interface AnswerProcessingContext {
  db: PrismaClient;
  session: DesignSession;
  userId: string;
  questionGenService?: QuestionGenerationService;
}

export interface AnswerAnalytics {
  totalAnswers: number;
  answersByCategory: Record<string, number>;
  averageConfidence: number;
  completionRate: number;
  responseTime: {
    average: number;
    median: number;
  };
  followUpCount: number;
}

export class AnswerService {
  private triggers: AnswerTrigger[] = [];

  constructor(
    private db: PrismaClient,
    private questionGenService?: QuestionGenerationService
  ) {
    this.initializeTriggers();
  }

  /**
   * Submit a single answer with validation and trigger processing
   */
  async submitAnswer(
    data: z.infer<typeof answerValidationSchema>,
    context: AnswerProcessingContext
  ): Promise<Answer & { question: Question }> {
    // Validate input
    const validated = answerValidationSchema.parse(data);

    // Verify question exists and session ownership
    const question = await this.validateQuestionAndSession(
      validated.questionId,
      validated.sessionId,
      context.userId
    );

    // Process answer content based on question type
    const processedContent = await this.processAnswerContent(
      validated.content,
      question,
      validated.metadata
    );

    // Check for existing answer and decide whether to update or create
    const existingAnswer = await this.db.answer.findFirst({
      where: {
        questionId: validated.questionId,
        sessionId: validated.sessionId
      }
    });

    let answer: Answer & { question: Question };

    if (existingAnswer) {
      // Update existing answer
      answer = await this.db.answer.update({
        where: { id: existingAnswer.id },
        data: {
          content: processedContent.content,
          metadata: {
            ...validated.metadata,
            ...processedContent.metadata,
            previousValue: existingAnswer.content,
            updatedAt: new Date().toISOString()
          },
          confidence: validated.confidence,
          source: validated.source,
          tags: validated.tags
        },
        include: {
          question: true
        }
      });
    } else {
      // Create new answer
      answer = await this.db.answer.create({
        data: {
          ...validated,
          content: processedContent.content,
          metadata: {
            ...validated.metadata,
            ...processedContent.metadata
          }
        },
        include: {
          question: true
        }
      });
    }

    // Process triggers
    await this.processTriggers(answer, question, context);

    // Update session progress
    await this.updateSessionProgress(validated.sessionId);

    return answer;
  }

  /**
   * Submit multiple answers in bulk
   */
  async submitBulkAnswers(
    data: z.infer<typeof bulkAnswersSchema>,
    context: AnswerProcessingContext
  ): Promise<(Answer & { question: Question })[]> {
    const validated = bulkAnswersSchema.parse(data);
    const results: (Answer & { question: Question })[] = [];

    // Use transaction for bulk operations
    await this.db.$transaction(async (tx) => {
      for (const answerData of validated.answers) {
        const contextWithTx = { ...context, db: tx };
        const answer = await this.submitAnswer(answerData, contextWithTx);
        results.push(answer);
      }
    });

    return results;
  }

  /**
   * Update an existing answer
   */
  async updateAnswer(
    data: z.infer<typeof answerUpdateSchema>,
    context: AnswerProcessingContext
  ): Promise<Answer & { question: Question }> {
    const validated = answerUpdateSchema.parse(data);
    const { id, ...updateData } = validated;

    // Verify answer exists and user owns the session
    const existingAnswer = await this.db.answer.findFirst({
      where: { id },
      include: {
        question: {
          include: {
            session: true
          }
        }
      }
    });

    if (
      !existingAnswer ||
      existingAnswer.question.session.userId !== context.userId
    ) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: 'Answer not found'
      });
    }

    // Process content if provided
    let processedContent;
    if (updateData.content) {
      processedContent = await this.processAnswerContent(
        updateData.content,
        existingAnswer.question,
        updateData.metadata
      );
    }

    const updatedAnswer = await this.db.answer.update({
      where: { id },
      data: {
        ...updateData,
        ...(processedContent && {
          content: processedContent.content,
          metadata: {
            ...existingAnswer.metadata,
            ...updateData.metadata,
            ...processedContent.metadata,
            updatedAt: new Date().toISOString()
          }
        })
      },
      include: {
        question: true
      }
    });

    // Re-process triggers if content changed
    if (processedContent) {
      await this.processTriggers(
        updatedAnswer,
        existingAnswer.question,
        context
      );
    }

    return updatedAnswer;
  }

  /**
   * Delete an answer
   */
  async deleteAnswer(
    answerId: string,
    userId: string
  ): Promise<{ success: boolean }> {
    // Verify answer exists and user owns the session
    const answer = await this.db.answer.findFirst({
      where: { id: answerId },
      include: {
        question: {
          include: {
            session: true
          }
        }
      }
    });

    if (!answer || answer.question.session.userId !== userId) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: 'Answer not found'
      });
    }

    await this.db.answer.delete({
      where: { id: answerId }
    });

    // Update session progress
    await this.updateSessionProgress(answer.sessionId);

    return { success: true };
  }

  /**
   * Get answers with filtering and pagination
   */
  async getAnswers(
    filters: z.infer<typeof answerFilterSchema>,
    pagination?: { skip?: number; take?: number }
  ): Promise<(Answer & { question: Question })[]> {
    const validated = answerFilterSchema.parse(filters);

    const where: Prisma.AnswerWhereInput = {
      sessionId: validated.sessionId
    };

    // Apply filters
    if (validated.questionIds?.length) {
      where.questionId = { in: validated.questionIds };
    }

    if (validated.categories?.length) {
      where.question = {
        category: { in: validated.categories }
      };
    }

    if (validated.dateRange) {
      where.createdAt = {
        gte: validated.dateRange.from,
        lte: validated.dateRange.to
      };
    }

    if (validated.hasFollowups !== undefined) {
      if (validated.hasFollowups) {
        where.question = {
          ...where.question,
          children: { some: {} }
        };
      } else {
        where.question = {
          ...where.question,
          children: { none: {} }
        };
      }
    }

    if (validated.confidence) {
      where.confidence = {
        gte: validated.confidence.min,
        lte: validated.confidence.max
      };
    }

    const answers = await this.db.answer.findMany({
      where,
      include: {
        question: true
      },
      orderBy: {
        createdAt: 'asc'
      },
      skip: pagination?.skip,
      take: pagination?.take
    });

    return answers;
  }

  /**
   * Get answer analytics for a session
   */
  async getAnswerAnalytics(sessionId: string): Promise<AnswerAnalytics> {
    const answers = await this.db.answer.findMany({
      where: { sessionId },
      include: {
        question: true
      }
    });

    const totalQuestions = await this.db.question.count({
      where: { sessionId }
    });

    // Calculate analytics
    const answersByCategory: Record<string, number> = {};
    let confidenceSum = 0;
    let confidenceCount = 0;
    let responseTimeSum = 0;
    const responseTimes: number[] = [];

    for (const answer of answers) {
      // Category count
      const category = answer.question.category;
      answersByCategory[category] = (answersByCategory[category] || 0) + 1;

      // Confidence
      if (answer.confidence !== null) {
        confidenceSum += answer.confidence;
        confidenceCount++;
      }

      // Response time (if available in metadata)
      const responseTime = answer.metadata?.responseTime;
      if (responseTime && typeof responseTime === 'number') {
        responseTimeSum += responseTime;
        responseTimes.push(responseTime);
      }
    }

    // Follow-up count
    const followUpCount = await this.db.question.count({
      where: {
        sessionId,
        parentId: { not: null }
      }
    });

    // Calculate median response time
    responseTimes.sort((a, b) => a - b);
    const median =
      responseTimes.length > 0
        ? responseTimes[Math.floor(responseTimes.length / 2)]
        : 0;

    return {
      totalAnswers: answers.length,
      answersByCategory,
      averageConfidence:
        confidenceCount > 0 ? confidenceSum / confidenceCount : 0,
      completionRate: totalQuestions > 0 ? answers.length / totalQuestions : 0,
      responseTime: {
        average:
          responseTimes.length > 0 ? responseTimeSum / responseTimes.length : 0,
        median
      },
      followUpCount
    };
  }

  /**
   * Validate question exists and user owns the session
   */
  private async validateQuestionAndSession(
    questionId: string,
    sessionId: string,
    userId: string
  ): Promise<Question> {
    const question = await this.db.question.findFirst({
      where: {
        id: questionId,
        sessionId: sessionId
      },
      include: {
        session: true
      }
    });

    if (!question) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: 'Question not found'
      });
    }

    if (question.session.userId !== userId) {
      throw new TRPCError({
        code: 'FORBIDDEN',
        message: 'Access denied'
      });
    }

    return question;
  }

  /**
   * Process answer content based on question type
   */
  private async processAnswerContent(
    content: string,
    question: Question,
    metadata?: Record<string, any>
  ): Promise<{ content: string; metadata: Record<string, any> }> {
    const processedMetadata: Record<string, any> = { ...metadata };

    switch (question.type) {
      case 'SCALE':
        // Validate scale values
        const scaleValue = parseInt(content);
        if (isNaN(scaleValue) || scaleValue < 1 || scaleValue > 10) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Scale value must be between 1 and 10'
          });
        }
        processedMetadata.numericValue = scaleValue;
        break;

      case 'BOOLEAN':
        // Normalize boolean responses
        const normalizedBool = this.normalizeBooleanResponse(content);
        processedMetadata.booleanValue = normalizedBool;
        return {
          content: normalizedBool.toString(),
          metadata: processedMetadata
        };

      case 'MULTIPLE_CHOICE':
        // Validate against available options (if provided in question context)
        const options = question.context?.options;
        if (options && !options.includes(content)) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Selected option is not valid'
          });
        }
        processedMetadata.selectedOption = content;
        break;

      case 'TEXT_INPUT':
        // Basic text processing
        processedMetadata.wordCount = content.split(/\s+/).length;
        processedMetadata.characterCount = content.length;
        break;
    }

    processedMetadata.processedAt = new Date().toISOString();
    processedMetadata.originalType = question.type;

    return { content, metadata: processedMetadata };
  }

  /**
   * Normalize boolean responses
   */
  private normalizeBooleanResponse(content: string): boolean {
    const normalized = content.toLowerCase().trim();
    const trueValues = ['yes', 'true', '1', 'y', 'on', 'enable', 'enabled'];
    const falseValues = ['no', 'false', '0', 'n', 'off', 'disable', 'disabled'];

    if (trueValues.includes(normalized)) return true;
    if (falseValues.includes(normalized)) return false;

    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: 'Boolean answer must be yes/no, true/false, or similar'
    });
  }

  /**
   * Initialize answer processing triggers
   */
  private initializeTriggers(): void {
    // Follow-up question trigger
    this.triggers.push({
      type: 'FOLLOW_UP',
      condition: (answer, question) => {
        // Trigger follow-up for certain answer patterns
        const triggerKeywords = question.context?.followUpTriggers || [];
        return triggerKeywords.some((keyword: string) =>
          answer.content.toLowerCase().includes(keyword.toLowerCase())
        );
      },
      action: async (answer, question, context) => {
        if (context.questionGenService) {
          await context.questionGenService.generateFollowUpQuestions(
            answer.sessionId,
            answer.id,
            { maxQuestions: 2 }
          );
        }
      }
    });

    // Validation trigger
    this.triggers.push({
      type: 'VALIDATION',
      condition: (answer, question) => {
        // Trigger validation for critical questions
        return question.context?.requiresValidation === true;
      },
      action: async (answer, question, context) => {
        // Mark answer as requiring validation
        await context.db.answer.update({
          where: { id: answer.id },
          data: {
            metadata: {
              ...answer.metadata,
              requiresValidation: true,
              validationStatus: 'PENDING'
            }
          }
        });
      }
    });

    // Completion trigger
    this.triggers.push({
      type: 'COMPLETION',
      condition: async (answer, question) => {
        // Check if this completes a question group
        return question.context?.completionTrigger === true;
      },
      action: async (answer, question, context) => {
        // Update session status if this was a completion trigger
        await this.updateSessionProgress(answer.sessionId);
      }
    });
  }

  /**
   * Process all applicable triggers for an answer
   */
  private async processTriggers(
    answer: Answer,
    question: Question,
    context: AnswerProcessingContext
  ): Promise<void> {
    for (const trigger of this.triggers) {
      try {
        if (trigger.condition(answer, question)) {
          await trigger.action(answer, question, context);
        }
      } catch (error) {
        // Log error but don't fail the answer submission
        console.error(
          `Trigger ${trigger.type} failed for answer ${answer.id}:`,
          error
        );
      }
    }
  }

  /**
   * Update session progress based on answered questions
   */
  private async updateSessionProgress(sessionId: string): Promise<void> {
    const totalQuestions = await this.db.question.count({
      where: { sessionId }
    });

    const answeredQuestions = await this.db.question.count({
      where: {
        sessionId,
        answers: { some: {} }
      }
    });

    const progress =
      totalQuestions > 0 ? (answeredQuestions / totalQuestions) * 100 : 0;

    await this.db.designSession.update({
      where: { id: sessionId },
      data: {
        metadata: {
          progress,
          answeredQuestions,
          totalQuestions,
          lastAnsweredAt: new Date().toISOString()
        }
      }
    });
  }

  /**
   * Add custom trigger
   */
  addTrigger(trigger: AnswerTrigger): void {
    this.triggers.push(trigger);
  }

  /**
   * Remove trigger by type
   */
  removeTrigger(type: AnswerTrigger['type']): void {
    this.triggers = this.triggers.filter((trigger) => trigger.type !== type);
  }
}
