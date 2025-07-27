# Design Document

## Overview

Love for Design is a scalable, agentic system design platform empowering users to generate system architecture solutions through interactive, AI-driven Q&A sessions, an intuitive canvas editor, and seamless professional export. The platform leverages a Next.js frontend with TypeScript, a dedicated Node.js backend for business logic and orchestration, Python FastAPI microservices for multi-agent AI operations, PostgreSQL for persistent data, and Redis for cache and async tasks.

The architecture employs a modular microservices approach to maximize scalability, resilience, and rapid feature evolution, while maintaining a delightful user experience for both interview preparation and real-world system planning.

## Architecture

### High-Level Architecture

```mermaid
graph TB
    subgraph "Client Layer"
        UI[Next.js Frontend]
        Canvas[Interactive Canvas]
        Export[Document Export]
    end

    subgraph "API Layer"
        NodeAPI[Node.js API (tRPC/REST)]
        Auth[Auth (NextAuth.js)]
    end

    subgraph "Service Layer"
        AIPy[AI Service - FastAPI]
        AgentOrch[Multi-Agent Orchestrator]
        QGen[Question Generator]
        DocGen[Document Generator]
    end

    subgraph "Data Layer"
        DB[(PostgreSQL)]
        FileStore[File Storage (S3/minio)]
        Cache[Redis]
    end

    UI --> NodeAPI
    Canvas --> NodeAPI
    Export --> NodeAPI
    NodeAPI --> AIPy
    NodeAPI --> DB
    NodeAPI --> FileStore
    NodeAPI --> Cache
    AIPy --> AgentOrch
    AgentOrch --> QGen
    AgentOrch --> DocGen
    AIPy --> Cache
```

### Component Architecture

**Frontend (Next.js/TypeScript):**

- SSR/SPA with advanced routing, state management, and Excalidraw/Tldraw canvas integration
- tRPC or REST calls to Node.js backend

**Backend (Node.js/TypeScript):**

- API gateway, authentication, user/session logic, orchestration, admin controls
- Manages communication with AI microservices, DB, cache, and storage

**AI Service (Python/FastAPI):**

- Multi-agent orchestration, LLM prompt chaining, advanced Q&A, and document synthesis
- Modular endpoints for AI pipelines

**Data Layer (PostgreSQL/Prisma, Redis):**

- Durable storage of users, sessions, design data, versions, templates, exports
- Redis for cache and queueing async tasks (e.g., long-running doc exports, AI jobs)

## Components and Interfaces

### Frontend Components

- **DashboardLayout**: Navigation and main app shell
- **QuestionFlow**: Dynamic AI-driven Q&A
- **CanvasEditor**: Excalidraw/Tldraw-powered, supports insertions and manual edits
- **ExportDialog**: Document export and download controls
- **AdminPanel**: Config and analytics for admins
- **VersionHistory**: Timeline and rollback for canvas and sessions

### Backend Services

#### API Layer (Node.js)

```typescript
export const appRouter = router({
  auth: authRouter,
  design: designRouter,
  canvas: canvasRouter,
  export: exportRouter,
  admin: adminRouter
});

// Example: Design Router
const designRouter = router({
  createSession: protectedProcedure
    .input(createSessionSchema)
    .mutation(({ input, ctx }) => designService.createSession(input, ctx.user)),
  getQuestions: protectedProcedure
    .input(getQuestionsSchema)
    .query(({ input }) => questionService.getQuestions(input)),
  submitAnswers: protectedProcedure
    .input(submitAnswersSchema)
    .mutation(({ input }) => questionService.processAnswers(input))
});
```

#### AI Agent Orchestration (Python/FastAPI)

```python
class AIAgent:
    def __init__(self, id, name, model, capabilities):
        ...

    async def process_request(self, input: AgentInput) -> AgentOutput:
        ...

class AgentOrchestrator:
    def __init__(self, agents: List[AIAgent]):
        ...

    async def route_request(self, request: DesignRequest) -> DesignResponse:
        ...
```

#### Document Export Service

```typescript
interface DocumentExporter {
  generateDocument(
    canvas: CanvasData,
    narrative: string,
    template: Template
  ): Promise<Document>;
  exportToPDF(document: Document): Promise<Buffer>;
  exportToDocx(document: Document): Promise<Buffer>;
}
```

## Data Models

### User and Authentication

```prisma
model User {
  id            String    @id @default(cuid())
  name          String?
  email         String?   @unique
  emailVerified DateTime?
  image         String?
  role          UserRole  @default(USER)
  accounts      Account[]
  sessions      Session[]
  designSessions DesignSession[]
  templates     Template[]
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}

enum UserRole {
  USER
  ADMIN
}
```

### Design Session and Versioning

```prisma
model DesignSession {
  id          String @id @default(cuid())
  title       String
  category    DesignCategory
  status      SessionStatus @default(ACTIVE)
  userId      String
  user        User @relation(fields: [userId], references: [id])
  questions   Question[]
  answers     Answer[]
  canvasData  Json?
  narrative   String?
  versions    SessionVersion[]
  currentVersion Int @default(1)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}

model SessionVersion {
  id          String @id @default(cuid())
  sessionId   String
  session     DesignSession @relation(fields: [sessionId], references: [id])
  version     Int
  canvasData  Json
  narrative   String?
  snapshot    Json
  createdAt DateTime @default(now())
}
```

### Question and Answer

```prisma
model Question {
  id            String @id @default(cuid())
  sessionId     String
  session       DesignSession @relation(fields: [sessionId], references: [id])
  text          String
  type          QuestionType
  category      String
  order         Int
  parentId      String?
  parent        Question? @relation("QuestionHierarchy", fields: [parentId], references: [id])
  children      Question[] @relation("QuestionHierarchy")
  generatedBy   String?
  context       Json?
  answers       Answer[]
  createdAt DateTime @default(now())
}

model Answer {
  id          String @id @default(cuid())
  questionId  String
  question    Question @relation(fields: [questionId], references: [id])
  content     String
  metadata    Json?
  createdAt DateTime @default(now())
}

enum QuestionType {
  MULTIPLE_CHOICE
  TEXT_INPUT
  SCALE
  BOOLEAN
}
```

### Template and Export

```prisma
model Template {
  id          String @id @default(cuid())
  name        String
  description String?
  type        TemplateType
  content     Json
  createdBy   String
  creator     User @relation(fields: [createdBy], references: [id])
  isPublic    Boolean @default(false)
  exports     Export[]
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}

model Export {
  id          String @id @default(cuid())
  sessionId   String
  templateId  String
  template    Template @relation(fields: [templateId], references: [id])
  format      ExportFormat
  status      ExportStatus @default(PENDING)
  fileUrl     String?
  createdAt DateTime @default(now())
  completedAt DateTime?
}

enum TemplateType {
  DESIGN_DOCUMENT
  PRESENTATION
  TECHNICAL_SPEC
}

enum ExportFormat {
  PDF
  DOCX
  HTML
}

enum ExportStatus {
  PENDING
  PROCESSING
  COMPLETED
  FAILED
}
```

### AI Agent Registry

```prisma
model AIAgent {
  id            String @id @default(cuid())
  name          String
  description   String?
  model         String // e.g., "gpt-4"
  provider      String // e.g., "openai"
  capabilities  String[]
  config        Json
  isActive      Boolean @default(true)
  priority      Int @default(0)
  requestCount  Int @default(0)
  lastUsed      DateTime?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}
```

## Error Handling

### Client-Side

- **Network Errors**: Retry with exponential backoff, user notification
- **Validation Errors**: Inline, real-time feedback for forms and canvas
- **Canvas/Export Errors**: Auto-save state, informative user prompts

### Server-Side

```typescript
class APIError extends Error {
  constructor(
    public code: string,
    public message: string,
    public statusCode: number,
    public details?: any
  ) {
    super(message);
  }
}
```

- **Middleware**: Consistent JSON error responses
- **AI Service Fallback**: Retry/route to alternate agents or cache
- **Rate Limiting**: Per-user/IP throttling
- **Context Length**: AI input truncation and summarization

## Testing Strategy

### Frontend

- **Unit**: React Testing Library, Jest
- **Integration/E2E**: Cypress
- **Visual Regression**: Chromatic
- **Performance**: Lighthouse CI

### Backend

- **API**: Supertest/Jest
- **DB**: In-memory test DB with Prisma
- **AI**: Mock AI agent responses
- **Load**: Artillery

### Canvas

- **Interaction**: Automated Excalidraw/Tldraw tests
- **Export**: Document validation
- **Cross-Browser**: Selenium Grid

### CI/CD

- **Pre-commit**: Linting/format checks
- **Pull Requests**: Full suite with code coverage
- **Deployments**: Automated to staging/prod, rollback support
- **Monitoring**: Error and performance tracking (Sentry, Datadog, etc.)

## Non-Functional Requirements (NFRs)

- **Latency**: <2s for interactive actions; <10s for document export
- **Availability**: 99.9% uptime
- **Scalability**: Horizontal scaling for Node.js and Python services
- **Security**: OAuth/JWT, RBAC for admin features, encryption in-transit and at-rest
- **Privacy**: GDPR-compliant data retention and deletion APIs
- **Auditability**: Logging of key admin/user actions, export access
- **Accessibility**: WCAG 2.1 compliant UI, keyboard navigation, screen reader support
- **Internationalization**: Framework ready for i18n/l10n

## Observability & Operations

### Centralized Logging

All services ship logs to ELK/CloudWatch/etc.

### Metrics

API latency, AI agent success/error rates, export success, usage stats

### Dashboards

Real-time admin dashboard for usage and error tracking

### Alerting

Threshold-based alerts for errors, slow responses, queue buildup

## Data Retention & Compliance

- **User Data**: API for user-initiated deletion (right to be forgotten)
- **Session Data**: Configurable retention (e.g., 90 days default, purge after)
- **Exports**: Time-limited download links; auto-delete after X days
- **Audit Logs**: Retained for 1 year, encrypted at rest

## Extensibility

- **Admin UI**: Manage AI agents, document templates, question sets
- **Plugin SDK**: Framework for adding new agent types, export formats, question modules
- **Open API/GraphQL**: For integrating with external tools

## Security

- **Authentication**: NextAuth.js/OAuth/JWT
- **Authorization**: RBAC (user, admin), resource ownership enforced
- **Rate Limiting**: Per-user and per-IP controls
- **Audit Logging**: For all export/admin actions
- **Secret Management**: Use vault for API keys, credentials

## Summary

The Love for Design platform's architecture balances modern user experience, scalable backend orchestration, and robust AI/LLM integration. With clear service boundaries, extensibility, and strong security and testing, it is built for both rapid iteration and future growth.
