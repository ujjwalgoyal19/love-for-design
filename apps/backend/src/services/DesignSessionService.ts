import { PrismaClient, DesignCategory, SessionStatus } from '.prisma/client';
import { TRPCError } from '@trpc/server';

export class DesignSessionService {
  constructor(private db: PrismaClient) {}

  /**
   * Create a new design session with initial setup
   */
  async createSession(params: {
    userId: string;
    title: string;
    category: DesignCategory;
    initialQuestions?: boolean;
  }) {
    const { userId, title, category, initialQuestions = true } = params;

    // Start a transaction to create session and initial questions
    const session = await this.db.$transaction(async (tx) => {
      // Create the session
      const newSession = await tx.designSession.create({
        data: {
          title,
          category,
          userId,
          status: 'ACTIVE',
          currentVersion: 1
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

      // Create initial version
      await tx.sessionVersion.create({
        data: {
          sessionId: newSession.id,
          version: 1,
          canvasData: {},
          narrative: '',
          snapshot: {
            canvasData: {},
            narrative: '',
            timestamp: new Date().toISOString(),
            status: 'ACTIVE',
            questionsCount: 0,
            answersCount: 0
          }
        }
      });

      // Generate initial questions if requested
      if (initialQuestions) {
        await this.generateInitialQuestions(tx, newSession.id, category);
      }

      return newSession;
    });

    return session;
  }

  /**
   * Update session status with proper state transitions
   */
  async updateSessionStatus(params: {
    sessionId: string;
    userId: string;
    status: SessionStatus;
    reason?: string;
  }) {
    const { sessionId, userId, status, reason } = params;

    // Verify ownership and get current status
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

    // Validate status transition
    const isValidTransition = this.isValidStatusTransition(
      session.status,
      status
    );

    if (!isValidTransition) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: `Invalid status transition from ${session.status} to ${status}`
      });
    }

    // Update session with audit trail
    const updatedSession = await this.db.designSession.update({
      where: { id: sessionId },
      data: {
        status,
        updatedAt: new Date(),
        ...(status === 'COMPLETED' && { completedAt: new Date() }),
        ...(status === 'ARCHIVED' && { archivedAt: new Date() })
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

    // Create status change log entry
    await this.logStatusChange({
      sessionId,
      fromStatus: session.status,
      toStatus: status,
      reason,
      userId
    });

    return updatedSession;
  }

  /**
   * Get session progress and completion metrics
   */
  async getSessionProgress(sessionId: string, userId: string) {
    const session = await this.db.designSession.findFirst({
      where: {
        id: sessionId,
        userId
      },
      include: {
        questions: {
          include: {
            answers: true,
            children: {
              include: {
                answers: true
              }
            }
          }
        },
        versions: {
          orderBy: { version: 'desc' },
          take: 1
        }
      }
    });

    if (!session) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: 'Design session not found'
      });
    }

    // Calculate progress metrics
    const totalQuestions = session.questions.length;
    const answeredQuestions = session.questions.filter(
      (q) => q.answers.length > 0
    ).length;
    const progressPercentage =
      totalQuestions > 0
        ? Math.round((answeredQuestions / totalQuestions) * 100)
        : 0;

    // Calculate completion score based on answer quality
    const completionScore = await this.calculateCompletionScore(session);

    // Identify next recommended actions
    const nextActions = await this.getNextRecommendedActions(session);

    return {
      sessionId,
      status: session.status,
      progress: {
        totalQuestions,
        answeredQuestions,
        progressPercentage,
        completionScore
      },
      timeline: {
        createdAt: session.createdAt,
        lastUpdated: session.updatedAt,
        completedAt: session.completedAt,
        archivedAt: session.archivedAt
      },
      nextActions,
      currentVersion: session.currentVersion,
      hasCanvasData:
        session.canvasData !== null &&
        Object.keys((session.canvasData as any) || {}).length > 0
    };
  }

  /**
   * Archive old sessions based on criteria
   */
  async archiveOldSessions(params: {
    userId: string;
    olderThanDays?: number;
    status?: SessionStatus[];
    category?: DesignCategory[];
  }) {
    const {
      userId,
      olderThanDays = 30,
      status = ['COMPLETED'],
      category
    } = params;

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

    const where: any = {
      userId,
      status: { in: status },
      updatedAt: { lt: cutoffDate }
    };

    if (category && category.length > 0) {
      where.category = { in: category };
    }

    // Get sessions to archive
    const sessionsToArchive = await this.db.designSession.findMany({
      where,
      select: {
        id: true,
        title: true,
        category: true,
        status: true
      }
    });

    if (sessionsToArchive.length === 0) {
      return { archivedCount: 0, sessions: [] };
    }

    // Archive sessions
    const archived = await this.db.designSession.updateMany({
      where: {
        id: { in: sessionsToArchive.map((s) => s.id) }
      },
      data: {
        status: 'ARCHIVED',
        archivedAt: new Date()
      }
    });

    return {
      archivedCount: archived.count,
      sessions: sessionsToArchive
    };
  }

  /**
   * Get session analytics for a user
   */
  async getSessionAnalytics(userId: string) {
    const [
      totalSessions,
      sessionsByStatus,
      sessionsByCategory,
      completionRates,
      averageSessionDuration
    ] = await Promise.all([
      this.db.designSession.count({ where: { userId } }),

      this.db.designSession.groupBy({
        by: ['status'],
        where: { userId },
        _count: { id: true }
      }),

      this.db.designSession.groupBy({
        by: ['category'],
        where: { userId },
        _count: { id: true }
      }),

      this.calculateCompletionRatesByCategory(userId),

      this.calculateAverageSessionDuration(userId)
    ]);

    return {
      totalSessions,
      byStatus: sessionsByStatus.reduce((acc: any, item: any) => {
        acc[item.status] = item._count.id;
        return acc;
      }, {}),
      byCategory: sessionsByCategory.reduce((acc: any, item: any) => {
        acc[item.category] = item._count.id;
        return acc;
      }, {}),
      completionRates,
      averageSessionDuration
    };
  }

  // Private helper methods

  private async generateInitialQuestions(
    tx: any,
    sessionId: string,
    category: DesignCategory
  ) {
    // Get question templates for this category
    const templates = await tx.questionTemplate.findMany({
      where: {
        category,
        isActive: true
      },
      orderBy: { order: 'asc' },
      take: 5 // Start with 5 initial questions
    });

    // Create questions from templates
    for (let i = 0; i < templates.length; i++) {
      const template = templates[i];
      await tx.question.create({
        data: {
          sessionId,
          text: template.text,
          type: template.type,
          category: template.category,
          order: i + 1,
          context: template.context,
          generatedBy: 'SYSTEM_TEMPLATE'
        }
      });
    }
  }

  private isValidStatusTransition(
    from: SessionStatus,
    to: SessionStatus
  ): boolean {
    const validTransitions: Record<SessionStatus, SessionStatus[]> = {
      ACTIVE: ['COMPLETED', 'ARCHIVED'],
      COMPLETED: ['ARCHIVED', 'ACTIVE'], // Allow reopening
      ARCHIVED: ['ACTIVE'] // Allow unarchiving
    };

    return validTransitions[from]?.includes(to) || false;
  }

  private async logStatusChange(params: {
    sessionId: string;
    fromStatus: SessionStatus;
    toStatus: SessionStatus;
    reason?: string;
    userId: string;
  }) {
    // In a real implementation, you might store this in an audit table
    console.log(
      `Session ${params.sessionId} status changed from ${params.fromStatus} to ${params.toStatus}`,
      {
        reason: params.reason,
        userId: params.userId,
        timestamp: new Date().toISOString()
      }
    );
  }

  private async calculateCompletionScore(session: any): Promise<number> {
    if (session.questions.length === 0) return 0;

    let totalScore = 0;
    let maxPossibleScore = 0;

    for (const question of session.questions) {
      maxPossibleScore += 10; // Base score per question

      if (question.answers.length > 0) {
        const answer = question.answers[0]; // Use latest answer
        let questionScore = 5; // Base score for answering

        // Bonus points based on answer quality
        if (answer.content && answer.content.length > 20) {
          questionScore += 3; // Detailed answer bonus
        }
        if (answer.metadata) {
          questionScore += 2; // Rich metadata bonus
        }

        totalScore += questionScore;
      }
    }

    return maxPossibleScore > 0
      ? Math.round((totalScore / maxPossibleScore) * 100)
      : 0;
  }

  private async getNextRecommendedActions(session: any): Promise<string[]> {
    const actions: string[] = [];

    // Check for unanswered questions
    const unansweredQuestions = session.questions.filter(
      (q: any) => q.answers.length === 0
    );

    if (unansweredQuestions.length > 0) {
      actions.push(`Answer ${unansweredQuestions.length} remaining questions`);
    }

    // Check for canvas data
    const hasCanvas =
      session.canvasData && Object.keys(session.canvasData as any).length > 0;

    if (!hasCanvas) {
      actions.push('Create system architecture diagram');
    }

    // Check completion status
    if (session.status === 'ACTIVE' && unansweredQuestions.length === 0) {
      actions.push('Review and complete session');
    }

    // Check for exports
    const exports = await this.db.export.count({
      where: { sessionId: session.id }
    });

    if (exports === 0 && session.status === 'COMPLETED') {
      actions.push('Export design document');
    }

    return actions;
  }

  private async calculateCompletionRatesByCategory(
    userId: string
  ): Promise<Record<string, number>> {
    const categories = await this.db.designSession.groupBy({
      by: ['category', 'status'],
      where: { userId },
      _count: { id: true }
    });

    const rates: Record<string, { completed: number; total: number }> = {};

    categories.forEach((item: any) => {
      if (!rates[item.category]) {
        rates[item.category] = { completed: 0, total: 0 };
      }

      rates[item.category].total += item._count.id;
      if (item.status === 'COMPLETED') {
        rates[item.category].completed += item._count.id;
      }
    });

    // Convert to percentages
    const completionRates: Record<string, number> = {};
    Object.entries(rates).forEach(([category, data]) => {
      completionRates[category] =
        data.total > 0 ? Math.round((data.completed / data.total) * 100) : 0;
    });

    return completionRates;
  }

  private async calculateAverageSessionDuration(
    userId: string
  ): Promise<number> {
    const completedSessions = await this.db.designSession.findMany({
      where: {
        userId,
        status: 'COMPLETED',
        completedAt: { not: null }
      },
      select: {
        createdAt: true,
        completedAt: true
      }
    });

    if (completedSessions.length === 0) return 0;

    const totalDuration = completedSessions.reduce((sum, session) => {
      const duration =
        session.completedAt!.getTime() - session.createdAt.getTime();
      return sum + duration;
    }, 0);

    // Return average duration in hours
    return Math.round(
      totalDuration / completedSessions.length / (1000 * 60 * 60)
    );
  }
}
