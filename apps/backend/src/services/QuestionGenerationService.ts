import { PrismaClient, QuestionType, DesignCategory } from '.prisma/client';
import { TRPCError } from '@trpc/server';

interface QuestionGenerationContext {
  sessionId: string;
  category: DesignCategory;
  previousAnswers: Array<{
    questionId: string;
    questionText: string;
    content: string;
    metadata?: any;
  }>;
  currentQuestionCount: number;
}

interface FollowUpRule {
  triggerCondition: {
    type:
      | 'answer_contains'
      | 'answer_equals'
      | 'answer_length'
      | 'metadata_exists';
    value: any;
    field?: string;
  };
  action: {
    type: 'generate_question' | 'skip_questions' | 'change_category';
    questionTemplate?: string;
    skipCount?: number;
    newCategory?: DesignCategory;
  };
}

export class QuestionGenerationService {
  constructor(private db: PrismaClient) {}

  /**
   * Generate initial questions for a new session
   */
  async generateInitialQuestions(params: {
    sessionId: string;
    category: DesignCategory;
    count?: number;
  }) {
    const { sessionId, category, count = 5 } = params;

    // Get question templates for this category
    const templates = await this.db.questionTemplate.findMany({
      where: {
        category,
        isActive: true
      },
      orderBy: { order: 'asc' },
      take: count
    });

    if (templates.length === 0) {
      // Generate default questions if no templates exist
      return await this.generateDefaultQuestions(sessionId, category);
    }

    const questions = [];
    for (let i = 0; i < templates.length; i++) {
      const template = templates[i];
      const question = await this.db.question.create({
        data: {
          sessionId,
          text: template.text,
          type: template.type,
          category: template.category,
          order: i + 1,
          context: template.context,
          generatedBy: 'TEMPLATE_SYSTEM'
        },
        include: {
          answers: true,
          children: true
        }
      });
      questions.push(question);
    }

    return questions;
  }

  /**
   * Generate follow-up questions based on previous answers
   */
  async generateFollowUpQuestions(params: {
    sessionId: string;
    triggeredByAnswerId: string;
  }) {
    const { sessionId, triggeredByAnswerId } = params;

    // Get the answer that triggered this generation
    const triggerAnswer = await this.db.answer.findUnique({
      where: { id: triggeredByAnswerId },
      include: {
        question: {
          include: {
            session: true
          }
        }
      }
    });

    if (!triggerAnswer) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: 'Trigger answer not found'
      });
    }

    // Get question template with follow-up rules
    const questionTemplate = await this.db.questionTemplate.findFirst({
      where: {
        text: triggerAnswer.question.text,
        category: triggerAnswer.question.category
      }
    });

    if (!questionTemplate?.followUpRules) {
      return []; // No follow-up rules defined
    }

    // Process follow-up rules
    const followUpRules = questionTemplate.followUpRules as FollowUpRule[];
    const generatedQuestions = [];

    for (const rule of followUpRules) {
      if (await this.evaluateFollowUpRule(rule, triggerAnswer)) {
        const newQuestions = await this.executeFollowUpAction(rule.action, {
          sessionId,
          parentQuestionId: triggerAnswer.question.id,
          triggerAnswer,
          category: triggerAnswer.question.category
        });
        generatedQuestions.push(...newQuestions);
      }
    }

    return generatedQuestions;
  }

  /**
   * Generate smart questions based on session context and AI
   */
  async generateSmartQuestions(params: {
    sessionId: string;
    userId: string;
    context?: string;
    maxQuestions?: number;
  }) {
    const { sessionId, userId, context, maxQuestions = 3 } = params;

    // Get session context
    const sessionContext = await this.buildSessionContext(sessionId);

    // Generate questions using context analysis
    const smartQuestions = await this.generateContextBasedQuestions(
      sessionContext,
      context,
      maxQuestions
    );

    // Create questions in database
    const createdQuestions = [];
    for (const questionData of smartQuestions) {
      const question = await this.db.question.create({
        data: {
          sessionId,
          text: questionData.text,
          type: questionData.type,
          category: sessionContext.category,
          order:
            sessionContext.currentQuestionCount + createdQuestions.length + 1,
          context: questionData.context,
          generatedBy: 'AI_SMART_GENERATION'
        },
        include: {
          answers: true,
          children: true
        }
      });
      createdQuestions.push(question);
    }

    return createdQuestions;
  }

  /**
   * Update question order and hierarchy
   */
  async updateQuestionHierarchy(params: {
    sessionId: string;
    userId: string;
    updates: Array<{
      questionId: string;
      order?: number;
      parentId?: string | null;
    }>;
  }) {
    const { sessionId, userId, updates } = params;

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

    // Update questions in transaction
    return await this.db.$transaction(async (tx) => {
      const updatedQuestions = [];

      for (const update of updates) {
        const question = await tx.question.update({
          where: { id: update.questionId },
          data: {
            ...(update.order !== undefined && { order: update.order }),
            ...(update.parentId !== undefined && { parentId: update.parentId })
          },
          include: {
            answers: true,
            children: true,
            parent: true
          }
        });
        updatedQuestions.push(question);
      }

      return updatedQuestions;
    });
  }

  /**
   * Get next recommended question for user
   */
  async getNextRecommendedQuestion(params: {
    sessionId: string;
    userId: string;
  }) {
    const { sessionId, userId } = params;

    // Get session with questions and answers
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
          },
          orderBy: { order: 'asc' }
        }
      }
    });

    if (!session) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: 'Design session not found'
      });
    }

    // Find next unanswered question
    const unansweredQuestion = session.questions.find(
      (q) => q.answers.length === 0 && !q.parentId // Top-level questions first
    );

    if (unansweredQuestion) {
      return {
        question: unansweredQuestion,
        reason: 'next_unanswered',
        progress: this.calculateQuestionProgress(session.questions)
      };
    }

    // Check for follow-up questions that can be generated
    const questionsWithAnswers = session.questions.filter(
      (q) => q.answers.length > 0
    );
    for (const question of questionsWithAnswers) {
      const canGenerateFollowUp = await this.canGenerateFollowUp(question);
      if (canGenerateFollowUp) {
        const followUpQuestions = await this.generateFollowUpQuestions({
          sessionId,
          triggeredByAnswerId: question.answers[0].id
        });

        if (followUpQuestions.length > 0) {
          return {
            question: followUpQuestions[0],
            reason: 'generated_followup',
            progress: this.calculateQuestionProgress(session.questions)
          };
        }
      }
    }

    // All questions answered - suggest completion or advanced questions
    return {
      question: null,
      reason: 'session_complete',
      progress: this.calculateQuestionProgress(session.questions),
      suggestions: [
        'Review your answers',
        'Create system architecture diagram',
        'Generate advanced questions',
        'Complete session'
      ]
    };
  }

  /**
   * Generate questions of specific types for testing/demo
   */
  async generateQuestionsByType(params: {
    sessionId: string;
    type: QuestionType;
    count: number;
    category: DesignCategory;
  }) {
    const { sessionId, type, count, category } = params;

    const questionGenerators = {
      MULTIPLE_CHOICE: () =>
        this.generateMultipleChoiceQuestions(category, count),
      TEXT_INPUT: () => this.generateTextInputQuestions(category, count),
      SCALE: () => this.generateScaleQuestions(category, count),
      BOOLEAN: () => this.generateBooleanQuestions(category, count)
    };

    const questionTemplates = questionGenerators[type]();
    const questions = [];

    for (let i = 0; i < questionTemplates.length; i++) {
      const template = questionTemplates[i];
      const question = await this.db.question.create({
        data: {
          sessionId,
          text: template.text,
          type: template.type,
          category,
          order: 1000 + i, // High order to appear at end
          context: template.context,
          generatedBy: 'TYPE_GENERATOR'
        },
        include: {
          answers: true,
          children: true
        }
      });
      questions.push(question);
    }

    return questions;
  }

  // Private helper methods

  private async generateDefaultQuestions(
    sessionId: string,
    category: DesignCategory
  ) {
    const defaultQuestions = this.getDefaultQuestionsByCategory(category);
    const questions = [];

    for (let i = 0; i < defaultQuestions.length; i++) {
      const questionData = defaultQuestions[i];
      const question = await this.db.question.create({
        data: {
          sessionId,
          text: questionData.text,
          type: questionData.type,
          category,
          order: i + 1,
          context: questionData.context,
          generatedBy: 'DEFAULT_SYSTEM'
        },
        include: {
          answers: true,
          children: true
        }
      });
      questions.push(question);
    }

    return questions;
  }

  private getDefaultQuestionsByCategory(category: DesignCategory) {
    const questionSets = {
      SOCIAL_MEDIA: [
        {
          text: 'What is the expected number of daily active users?',
          type: 'TEXT_INPUT' as QuestionType,
          context: { category: 'scale', importance: 'high' }
        },
        {
          text: 'What are the main features users will use most?',
          type: 'MULTIPLE_CHOICE' as QuestionType,
          context: {
            options: [
              'Post creation',
              'Feed browsing',
              'Messaging',
              'Stories',
              'Live streaming'
            ],
            allowMultiple: true
          }
        },
        {
          text: 'Do you need real-time notifications?',
          type: 'BOOLEAN' as QuestionType,
          context: { category: 'features' }
        },
        {
          text: 'Rate the importance of content moderation (1-10)',
          type: 'SCALE' as QuestionType,
          context: { min: 1, max: 10, category: 'safety' }
        },
        {
          text: 'Describe your content recommendation strategy',
          type: 'TEXT_INPUT' as QuestionType,
          context: { category: 'algorithms', importance: 'medium' }
        }
      ],
      ECOMMERCE: [
        {
          text: 'What is your expected transaction volume per day?',
          type: 'TEXT_INPUT' as QuestionType,
          context: { category: 'scale', importance: 'high' }
        },
        {
          text: 'Which payment methods will you support?',
          type: 'MULTIPLE_CHOICE' as QuestionType,
          context: {
            options: [
              'Credit Cards',
              'PayPal',
              'Apple Pay',
              'Google Pay',
              'Bank Transfer',
              'Cryptocurrency'
            ],
            allowMultiple: true
          }
        },
        {
          text: 'Do you need inventory management?',
          type: 'BOOLEAN' as QuestionType,
          context: { category: 'features' }
        },
        {
          text: 'Rate the importance of recommendation engine (1-10)',
          type: 'SCALE' as QuestionType,
          context: { min: 1, max: 10, category: 'personalization' }
        },
        {
          text: 'Describe your order fulfillment process',
          type: 'TEXT_INPUT' as QuestionType,
          context: { category: 'logistics', importance: 'high' }
        }
      ],
      STREAMING: [
        {
          text: 'What is the expected peak concurrent viewers?',
          type: 'TEXT_INPUT' as QuestionType,
          context: { category: 'scale', importance: 'critical' }
        },
        {
          text: 'Which video qualities will you support?',
          type: 'MULTIPLE_CHOICE' as QuestionType,
          context: {
            options: ['480p', '720p', '1080p', '4K', '8K'],
            allowMultiple: true
          }
        },
        {
          text: 'Do you need live streaming capabilities?',
          type: 'BOOLEAN' as QuestionType,
          context: { category: 'features' }
        },
        {
          text: 'Rate the importance of global CDN (1-10)',
          type: 'SCALE' as QuestionType,
          context: { min: 1, max: 10, category: 'performance' }
        },
        {
          text: 'Describe your content encoding strategy',
          type: 'TEXT_INPUT' as QuestionType,
          context: { category: 'technical', importance: 'high' }
        }
      ]
      // Add more categories as needed...
    };

    return questionSets[category] || questionSets.SOCIAL_MEDIA;
  }

  private async evaluateFollowUpRule(
    rule: FollowUpRule,
    triggerAnswer: any
  ): Promise<boolean> {
    const { triggerCondition } = rule;
    const { content, metadata } = triggerAnswer;

    switch (triggerCondition.type) {
      case 'answer_contains':
        return content
          .toLowerCase()
          .includes(triggerCondition.value.toLowerCase());

      case 'answer_equals':
        return content.toLowerCase() === triggerCondition.value.toLowerCase();

      case 'answer_length':
        return content.length >= triggerCondition.value;

      case 'metadata_exists':
        return metadata && metadata[triggerCondition.field] !== undefined;

      default:
        return false;
    }
  }

  private async executeFollowUpAction(
    action: FollowUpRule['action'],
    context: {
      sessionId: string;
      parentQuestionId: string;
      triggerAnswer: any;
      category: DesignCategory;
    }
  ) {
    const questions = [];

    switch (action.type) {
      case 'generate_question':
        if (action.questionTemplate) {
          const question = await this.db.question.create({
            data: {
              sessionId: context.sessionId,
              text: action.questionTemplate,
              type: 'TEXT_INPUT',
              category: context.category,
              parentId: context.parentQuestionId,
              order: 999, // Will be reordered later
              generatedBy: 'FOLLOWUP_RULE'
            },
            include: {
              answers: true,
              children: true
            }
          });
          questions.push(question);
        }
        break;

      case 'skip_questions':
        // Mark questions as skipped (this would need additional database structure)
        break;

      case 'change_category':
        // Generate questions from new category
        if (action.newCategory) {
          const newQuestions = await this.generateDefaultQuestions(
            context.sessionId,
            action.newCategory
          );
          questions.push(...newQuestions);
        }
        break;
    }

    return questions;
  }

  private async buildSessionContext(
    sessionId: string
  ): Promise<QuestionGenerationContext> {
    const session = await this.db.designSession.findUnique({
      where: { id: sessionId },
      include: {
        questions: {
          include: {
            answers: true
          }
        }
      }
    });

    if (!session) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: 'Session not found'
      });
    }

    const previousAnswers = session.questions
      .filter((q) => q.answers.length > 0)
      .map((q) => ({
        questionId: q.id,
        questionText: q.text,
        content: q.answers[0].content,
        metadata: q.answers[0].metadata
      }));

    return {
      sessionId,
      category: session.category,
      previousAnswers,
      currentQuestionCount: session.questions.length
    };
  }

  private async generateContextBasedQuestions(
    context: QuestionGenerationContext,
    userContext?: string,
    maxQuestions: number = 3
  ) {
    // This is where you would integrate with AI/LLM for smart question generation
    // For now, return some context-based questions

    const questions = [];

    // Analyze previous answers for patterns
    const answersText = context.previousAnswers.map((a) => a.content).join(' ');

    // Generate questions based on missing information
    if (answersText.toLowerCase().includes('database')) {
      questions.push({
        text: 'What type of database consistency do you need (ACID vs BASE)?',
        type: 'MULTIPLE_CHOICE' as QuestionType,
        context: {
          options: [
            'Strong consistency (ACID)',
            'Eventual consistency (BASE)',
            'Hybrid approach'
          ],
          category: 'database'
        }
      });
    }

    if (answersText.toLowerCase().includes('users')) {
      questions.push({
        text: 'How will you handle user authentication and authorization?',
        type: 'TEXT_INPUT' as QuestionType,
        context: { category: 'security', importance: 'high' }
      });
    }

    if (
      answersText.toLowerCase().includes('real-time') ||
      answersText.toLowerCase().includes('live')
    ) {
      questions.push({
        text: "What's your acceptable latency for real-time features?",
        type: 'TEXT_INPUT' as QuestionType,
        context: { category: 'performance', unit: 'milliseconds' }
      });
    }

    return questions.slice(0, maxQuestions);
  }

  private calculateQuestionProgress(questions: any[]) {
    const total = questions.length;
    const answered = questions.filter((q) => q.answers.length > 0).length;

    return {
      total,
      answered,
      percentage: total > 0 ? Math.round((answered / total) * 100) : 0
    };
  }

  private async canGenerateFollowUp(question: any): Promise<boolean> {
    // Check if follow-up questions already exist
    const existingFollowUps = await this.db.question.count({
      where: {
        parentId: question.id
      }
    });

    // Only generate if no follow-ups exist and answer has sufficient content
    return (
      existingFollowUps === 0 &&
      question.answers.length > 0 &&
      question.answers[0].content.length > 10
    );
  }

  // Question type generators
  private generateMultipleChoiceQuestions(
    category: DesignCategory,
    count: number
  ) {
    const templates = [
      {
        text: 'Which architecture pattern best fits your needs?',
        type: 'MULTIPLE_CHOICE' as QuestionType,
        context: {
          options: [
            'Microservices',
            'Monolithic',
            'Serverless',
            'Event-driven'
          ],
          category: 'architecture'
        }
      },
      {
        text: 'What caching strategies will you use?',
        type: 'MULTIPLE_CHOICE' as QuestionType,
        context: {
          options: [
            'Redis',
            'Memcached',
            'CDN',
            'Application-level',
            'Database caching'
          ],
          allowMultiple: true,
          category: 'performance'
        }
      }
    ];

    return templates.slice(0, count);
  }

  private generateTextInputQuestions(category: DesignCategory, count: number) {
    return [
      {
        text: 'Describe your data modeling strategy in detail',
        type: 'TEXT_INPUT' as QuestionType,
        context: { category: 'database', minLength: 50 }
      },
      {
        text: 'What are your specific security requirements?',
        type: 'TEXT_INPUT' as QuestionType,
        context: { category: 'security', minLength: 30 }
      }
    ].slice(0, count);
  }

  private generateScaleQuestions(category: DesignCategory, count: number) {
    return [
      {
        text: 'Rate the importance of horizontal scalability (1-10)',
        type: 'SCALE' as QuestionType,
        context: { min: 1, max: 10, category: 'scalability' }
      },
      {
        text: "How would you rate your team's DevOps maturity? (1-5)",
        type: 'SCALE' as QuestionType,
        context: { min: 1, max: 5, category: 'operations' }
      }
    ].slice(0, count);
  }

  private generateBooleanQuestions(category: DesignCategory, count: number) {
    return [
      {
        text: 'Do you need multi-region deployment?',
        type: 'BOOLEAN' as QuestionType,
        context: { category: 'deployment' }
      },
      {
        text: 'Is regulatory compliance required?',
        type: 'BOOLEAN' as QuestionType,
        context: { category: 'compliance' }
      }
    ].slice(0, count);
  }
}
