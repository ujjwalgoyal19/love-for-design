import {
  PrismaClient,
  QuestionType,
  DesignCategory,
  Question,
  Answer
} from '.prisma/client';
import { TRPCError } from '@trpc/server';
import { QuestionGenerationService } from './QuestionGenerationService';

interface QuestionWithDetails extends Question {
  answers: Answer[];
  children: Question[];
  parent?: Question | null;
}

interface CreateQuestionParams {
  sessionId: string;
  text: string;
  type: QuestionType;
  category?: DesignCategory;
  order?: number;
  parentId?: string | null;
  context?: any;
}

interface UpdateQuestionParams {
  id: string;
  text?: string;
  type?: QuestionType;
  order?: number;
  parentId?: string | null;
  context?: any;
}

interface QuestionTemplateParams {
  text: string;
  type: QuestionType;
  category: DesignCategory;
  order?: number;
  context?: any;
  followUpRules?: any;
  isActive?: boolean;
}

export class QuestionService {
  private generationService: QuestionGenerationService;

  constructor(private db: PrismaClient) {
    this.generationService = new QuestionGenerationService(db);
  }

  /**
   * Create a new question
   */
  async createQuestion(
    params: CreateQuestionParams
  ): Promise<QuestionWithDetails> {
    const { sessionId, text, type, category, order, parentId, context } =
      params;

    // Verify session exists
    const session = await this.db.designSession.findUnique({
      where: { id: sessionId }
    });

    if (!session) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: 'Design session not found'
      });
    }

    // If order not provided, set as last
    let questionOrder = order;
    if (!questionOrder) {
      const lastQuestion = await this.db.question.findFirst({
        where: { sessionId },
        orderBy: { order: 'desc' }
      });
      questionOrder = (lastQuestion?.order || 0) + 1;
    }

    const question = await this.db.question.create({
      data: {
        sessionId,
        text,
        type,
        category: category || session.category,
        order: questionOrder,
        parentId,
        context,
        generatedBy: 'MANUAL_CREATION'
      },
      include: {
        answers: true,
        children: {
          include: {
            answers: true
          }
        },
        parent: true
      }
    });

    return question;
  }

  /**
   * Update an existing question
   */
  async updateQuestion(
    params: UpdateQuestionParams
  ): Promise<QuestionWithDetails> {
    const { id, ...updateData } = params;

    // Verify question exists
    const existingQuestion = await this.db.question.findUnique({
      where: { id }
    });

    if (!existingQuestion) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: 'Question not found'
      });
    }

    const question = await this.db.question.update({
      where: { id },
      data: updateData,
      include: {
        answers: true,
        children: {
          include: {
            answers: true
          }
        },
        parent: true
      }
    });

    return question;
  }

  /**
   * Delete a question and its children
   */
  async deleteQuestion(questionId: string, userId?: string): Promise<void> {
    // Verify question exists and check ownership if userId provided
    const question = await this.db.question.findUnique({
      where: { id: questionId },
      include: {
        session: true,
        children: true
      }
    });

    if (!question) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: 'Question not found'
      });
    }

    if (userId && question.session.userId !== userId) {
      throw new TRPCError({
        code: 'FORBIDDEN',
        message: 'Not authorized to delete this question'
      });
    }

    // Delete in transaction to ensure consistency
    await this.db.$transaction(async (tx) => {
      // Delete all child questions first
      await tx.question.deleteMany({
        where: { parentId: questionId }
      });

      // Delete the main question (answers will be cascade deleted)
      await tx.question.delete({
        where: { id: questionId }
      });
    });
  }

  /**
   * Get question by ID with full details
   */
  async getQuestion(questionId: string): Promise<QuestionWithDetails | null> {
    return await this.db.question.findUnique({
      where: { id: questionId },
      include: {
        answers: {
          orderBy: { createdAt: 'asc' }
        },
        children: {
          include: {
            answers: true
          },
          orderBy: { order: 'asc' }
        },
        parent: true
      }
    });
  }

  /**
   * Get all questions for a session with hierarchy
   */
  async getSessionQuestions(
    sessionId: string,
    userId?: string
  ): Promise<{
    questions: QuestionWithDetails[];
    hierarchy: any;
    progress: any;
  }> {
    // Verify session access if userId provided
    if (userId) {
      const session = await this.db.designSession.findFirst({
        where: {
          id: sessionId,
          userId
        }
      });

      if (!session) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Design session not found or access denied'
        });
      }
    }

    const questions = await this.db.question.findMany({
      where: { sessionId },
      include: {
        answers: {
          orderBy: { createdAt: 'asc' }
        },
        children: {
          include: {
            answers: true
          },
          orderBy: { order: 'asc' }
        },
        parent: true
      },
      orderBy: { order: 'asc' }
    });

    // Build hierarchy
    const hierarchy = this.buildQuestionHierarchy(questions);

    // Calculate progress
    const progress = {
      total: questions.length,
      answered: questions.filter((q) => q.answers.length > 0).length,
      percentage:
        questions.length > 0
          ? Math.round(
              (questions.filter((q) => q.answers.length > 0).length /
                questions.length) *
                100
            )
          : 0
    };

    return {
      questions,
      hierarchy,
      progress
    };
  }

  /**
   * Initialize questions for a new session
   */
  async initializeSessionQuestions(
    sessionId: string,
    category: DesignCategory,
    count: number = 5
  ): Promise<QuestionWithDetails[]> {
    return await this.generationService.generateInitialQuestions({
      sessionId,
      category,
      count
    });
  }

  /**
   * Generate follow-up questions
   */
  async generateFollowUpQuestions(
    sessionId: string,
    triggeredByAnswerId: string
  ): Promise<QuestionWithDetails[]> {
    return await this.generationService.generateFollowUpQuestions({
      sessionId,
      triggeredByAnswerId
    });
  }

  /**
   * Generate smart/AI questions
   */
  async generateSmartQuestions(params: {
    sessionId: string;
    userId: string;
    context?: string;
    maxQuestions?: number;
  }): Promise<QuestionWithDetails[]> {
    return await this.generationService.generateSmartQuestions(params);
  }

  /**
   * Get next recommended question
   */
  async getNextQuestion(sessionId: string, userId: string) {
    return await this.generationService.getNextRecommendedQuestion({
      sessionId,
      userId
    });
  }

  /**
   * Reorder questions in a session
   */
  async reorderQuestions(
    sessionId: string,
    userId: string,
    questionOrders: Array<{ questionId: string; order: number }>
  ): Promise<QuestionWithDetails[]> {
    // Verify session ownership
    const session = await this.db.designSession.findFirst({
      where: {
        id: sessionId,
        userId
      }
    });

    if (!session) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: 'Design session not found'
      });
    }

    // Update orders in transaction
    return await this.db.$transaction(async (tx) => {
      const updatedQuestions = [];

      for (const { questionId, order } of questionOrders) {
        const question = await tx.question.update({
          where: { id: questionId },
          data: { order },
          include: {
            answers: true,
            children: {
              include: {
                answers: true
              }
            },
            parent: true
          }
        });
        updatedQuestions.push(question);
      }

      return updatedQuestions;
    });
  }

  // Question Template Management

  /**
   * Create question template
   */
  async createQuestionTemplate(params: QuestionTemplateParams) {
    const {
      text,
      type,
      category,
      order,
      context,
      followUpRules,
      isActive = true
    } = params;

    // Get next order if not provided
    let templateOrder = order;
    if (!templateOrder) {
      const lastTemplate = await this.db.questionTemplate.findFirst({
        where: { category },
        orderBy: { order: 'desc' }
      });
      templateOrder = (lastTemplate?.order || 0) + 1;
    }

    return await this.db.questionTemplate.create({
      data: {
        text,
        type,
        category,
        order: templateOrder,
        context,
        followUpRules,
        isActive
      }
    });
  }

  /**
   * Update question template
   */
  async updateQuestionTemplate(
    templateId: string,
    updates: Partial<QuestionTemplateParams>
  ) {
    return await this.db.questionTemplate.update({
      where: { id: templateId },
      data: updates
    });
  }

  /**
   * Delete question template
   */
  async deleteQuestionTemplate(templateId: string): Promise<void> {
    await this.db.questionTemplate.delete({
      where: { id: templateId }
    });
  }

  /**
   * Get question templates for category
   */
  async getQuestionTemplates(
    category?: DesignCategory,
    includeInactive: boolean = false
  ) {
    return await this.db.questionTemplate.findMany({
      where: {
        ...(category && { category }),
        ...(includeInactive ? {} : { isActive: true })
      },
      orderBy: [{ category: 'asc' }, { order: 'asc' }]
    });
  }

  /**
   * Bulk create question templates
   */
  async createQuestionTemplatesBulk(templates: QuestionTemplateParams[]) {
    return await this.db.$transaction(async (tx) => {
      const createdTemplates = [];

      for (const template of templates) {
        const created = await tx.questionTemplate.create({
          data: {
            ...template,
            isActive: template.isActive ?? true
          }
        });
        createdTemplates.push(created);
      }

      return createdTemplates;
    });
  }

  // Utility and Helper Methods

  /**
   * Get question statistics for a session
   */
  async getQuestionStatistics(sessionId: string) {
    const questions = await this.db.question.findMany({
      where: { sessionId },
      include: {
        answers: true,
        children: true
      }
    });

    const stats = {
      total: questions.length,
      answered: questions.filter((q) => q.answers.length > 0).length,
      unanswered: questions.filter((q) => q.answers.length === 0).length,
      hasFollowups: questions.filter((q) => q.children.length > 0).length,
      byType: {} as Record<QuestionType, number>,
      byGeneratedBy: {} as Record<string, number>
    };

    // Count by type
    questions.forEach((q) => {
      stats.byType[q.type] = (stats.byType[q.type] || 0) + 1;
      const generatedBy = q.generatedBy || 'UNKNOWN';
      stats.byGeneratedBy[generatedBy] =
        (stats.byGeneratedBy[generatedBy] || 0) + 1;
    });

    return stats;
  }

  /**
   * Search questions by text or context
   */
  async searchQuestions(params: {
    sessionId?: string;
    searchTerm: string;
    type?: QuestionType;
    category?: DesignCategory;
    hasAnswers?: boolean;
  }) {
    const { sessionId, searchTerm, type, category, hasAnswers } = params;

    return await this.db.question.findMany({
      where: {
        ...(sessionId && { sessionId }),
        ...(type && { type }),
        ...(category && { category }),
        ...(hasAnswers !== undefined && {
          answers: hasAnswers ? { some: {} } : { none: {} }
        }),
        OR: [
          { text: { contains: searchTerm, mode: 'insensitive' } },
          { context: { path: ['category'], string_contains: searchTerm } }
        ]
      },
      include: {
        answers: true,
        children: true,
        session: {
          select: {
            title: true,
            category: true
          }
        }
      }
    });
  }

  /**
   * Clone questions from one session to another
   */
  async cloneQuestionsToSession(
    sourceSessionId: string,
    targetSessionId: string,
    userId: string,
    questionIds?: string[]
  ) {
    // Verify both sessions exist and user has access
    const [sourceSession, targetSession] = await Promise.all([
      this.db.designSession.findFirst({
        where: { id: sourceSessionId, userId }
      }),
      this.db.designSession.findFirst({
        where: { id: targetSessionId, userId }
      })
    ]);

    if (!sourceSession || !targetSession) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: 'Source or target session not found'
      });
    }

    // Get questions to clone
    const questionsToClone = await this.db.question.findMany({
      where: {
        sessionId: sourceSessionId,
        ...(questionIds && { id: { in: questionIds } })
      },
      include: {
        children: true
      }
    });

    // Clone questions in transaction
    return await this.db.$transaction(async (tx) => {
      const clonedQuestions = [];
      const questionIdMap = new Map<string, string>(); // old ID -> new ID

      // Clone parent questions first
      for (const question of questionsToClone.filter((q) => !q.parentId)) {
        const cloned = await tx.question.create({
          data: {
            sessionId: targetSessionId,
            text: question.text,
            type: question.type,
            category: question.category || targetSession.category,
            order: question.order,
            context: question.context,
            generatedBy: 'CLONED'
          },
          include: {
            answers: true,
            children: true
          }
        });

        clonedQuestions.push(cloned);
        questionIdMap.set(question.id, cloned.id);
      }

      // Clone child questions
      for (const question of questionsToClone.filter((q) => q.parentId)) {
        const parentId = questionIdMap.get(question.parentId!);
        if (parentId) {
          const cloned = await tx.question.create({
            data: {
              sessionId: targetSessionId,
              text: question.text,
              type: question.type,
              category: question.category || targetSession.category,
              order: question.order,
              parentId,
              context: question.context,
              generatedBy: 'CLONED'
            },
            include: {
              answers: true,
              children: true
            }
          });

          clonedQuestions.push(cloned);
        }
      }

      return clonedQuestions;
    });
  }

  // Private helper methods

  private buildQuestionHierarchy(questions: QuestionWithDetails[]) {
    const questionMap = new Map(questions.map((q) => [q.id, q]));
    const rootQuestions: QuestionWithDetails[] = [];

    questions.forEach((question) => {
      if (!question.parentId) {
        rootQuestions.push(question);
      }
    });

    const buildTree = (question: QuestionWithDetails): any => {
      return {
        ...question,
        children: question.children.map((child) => buildTree(child))
      };
    };

    return rootQuestions.map((root) => buildTree(root));
  }

  /**
   * Validate question hierarchy to prevent cycles
   */
  private async validateQuestionHierarchy(
    questionId: string,
    newParentId: string | null
  ): Promise<boolean> {
    if (!newParentId) return true;

    // Check if newParentId is a descendant of questionId
    const checkDescendant = async (
      currentId: string,
      targetId: string
    ): Promise<boolean> => {
      const children = await this.db.question.findMany({
        where: { parentId: currentId },
        select: { id: true }
      });

      if (children.some((child) => child.id === targetId)) {
        return true;
      }

      for (const child of children) {
        if (await checkDescendant(child.id, targetId)) {
          return true;
        }
      }

      return false;
    };

    return !(await checkDescendant(questionId, newParentId));
  }
}
