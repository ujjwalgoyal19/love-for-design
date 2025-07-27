# Specialized Agent Endpoints

This document describes the specialized agent endpoints implemented for the system design platform.

## Overview

The AI service now provides four specialized agent endpoints that handle specific aspects of the system design workflow:

1. **Question Generation** - Dynamic Q&A flow generation
2. **Design Review** - Architecture feedback and analysis
3. **Document Generation** - Narrative document creation
4. **Canvas Suggestions** - Diagram recommendations and improvements

## Endpoints

### 1. Question Generation

**Endpoint:** `POST /agents/question-generation`

Generates dynamic questions for system design Q&A flows based on category, previous answers, and question type.

**Request Body:**

```json
{
  "category": "distributed_systems",
  "previous_answers": {
    "What type of system are you designing?": "A social media platform",
    "How many users do you expect?": "10 million daily active users"
  },
  "context": {
    "system_context": "Interview preparation context"
  },
  "question_type": "follow_up",
  "max_questions": 5
}
```

**Response:**

```json
{
  "questions": [
    {
      "text": "What is the expected read/write ratio for your system?",
      "type": "text_input",
      "category": "performance",
      "priority": "high",
      "follow_up_trigger": "Based on user scale mentioned",
      "expected_answer_type": "Numeric ratio or description",
      "id": "q_1_12345"
    }
  ],
  "category": "distributed_systems",
  "question_type": "follow_up",
  "context_used": {
    "previous_answers_count": 2,
    "category_focus": "distributed_systems"
  },
  "generation_metadata": {
    "agent_used": "question_generator_1",
    "execution_time": 1.23,
    "request_id": "req_20250721_123456_789",
    "total_questions": 3,
    "question_types": ["text_input", "multiple_choice"],
    "categories": ["performance", "scalability"]
  }
}
```

### 2. Design Review

**Endpoint:** `POST /agents/design-review`

Reviews system designs and provides architectural feedback, recommendations, and risk assessment.

**Request Body:**

```json
{
  "design_data": {
    "architecture": "microservices",
    "components": ["user-service", "post-service", "notification-service"],
    "database": "PostgreSQL with Redis cache",
    "load_balancer": "nginx",
    "message_queue": "RabbitMQ"
  },
  "review_focus": ["scalability", "reliability", "performance", "security"],
  "context": {
    "requirements": ["Handle 10M users", "99.9% uptime"]
  },
  "detail_level": "comprehensive"
}
```

**Response:**

```json
{
  "review_summary": "The design shows good separation of concerns with microservices architecture. However, there are potential scalability bottlenecks that need attention.",
  "detailed_feedback": [
    {
      "id": "feedback_1",
      "category": "scalability",
      "severity": "high",
      "title": "Database scaling concerns",
      "description": "Single PostgreSQL instance may become a bottleneck at 10M user scale",
      "impact": "System may experience performance degradation under high load",
      "recommendation": "Consider implementing database sharding or read replicas"
    }
  ],
  "recommendations": [
    {
      "id": "rec_1",
      "priority": "high",
      "category": "scalability",
      "title": "Implement database sharding",
      "description": "Horizontal partitioning of user data across multiple database instances",
      "implementation_effort": "high",
      "expected_benefit": "Improved read/write performance and horizontal scalability"
    }
  ],
  "risk_assessment": {
    "overall_risk_level": "medium",
    "critical_risks": ["Database bottleneck", "Single point of failure"],
    "mitigation_priorities": ["Database scaling", "Load balancer redundancy"],
    "deployment_readiness": "needs_work"
  },
  "review_metadata": {
    "agent_used": "design_reviewer_1",
    "execution_time": 2.45,
    "request_id": "req_20250721_123457_890",
    "review_focus": ["scalability", "reliability"],
    "feedback_count": 3,
    "recommendation_count": 5,
    "severity_distribution": { "high": 1, "medium": 2 },
    "category_distribution": { "scalability": 2, "reliability": 1 }
  }
}
```

### 3. Document Generation

**Endpoint:** `POST /agents/document-generation`

Generates technical documents and narratives from design session data.

**Request Body:**

```json
{
  "design_session_data": {
    "requirements": [
      "Handle 10M users",
      "Real-time notifications",
      "99.9% uptime"
    ],
    "architecture": "Microservices with event-driven communication",
    "components": [
      "API Gateway",
      "User Service",
      "Post Service",
      "Notification Service"
    ],
    "technologies": ["Node.js", "PostgreSQL", "Redis", "RabbitMQ"]
  },
  "template_type": "technical_spec",
  "sections": [
    "System Overview",
    "Architecture Design",
    "Component Specifications"
  ],
  "context": {
    "project_name": "Social Media Platform",
    "target_audience": "Development team"
  },
  "formatting_options": {
    "include_diagrams": true,
    "technical_depth": "high"
  }
}
```

**Response:**

```json
{
  "document_content": "# Technical Specification: Social Media Platform\n\n## System Overview\n\nThis document outlines the technical specification for a social media platform designed to handle 10 million daily active users...",
  "sections_generated": [
    "System Overview",
    "Architecture Design",
    "Component Specifications"
  ],
  "template_used": "technical_spec",
  "word_count": 2500,
  "generation_metadata": {
    "agent_used": "doc_generator_1",
    "execution_time": 3.67,
    "request_id": "req_20250721_123458_901",
    "template_type": "technical_spec",
    "character_count": 15000,
    "section_count": 3,
    "estimated_reading_time": 13
  }
}
```

### 4. Canvas Suggestions

**Endpoint:** `POST /agents/canvas-suggestions`

Provides AI suggestions for canvas diagrams and visual improvements.

**Request Body:**

```json
{
  "design_context": {
    "system_type": "social_media",
    "scale": "10M users",
    "key_features": ["posts", "comments", "notifications", "messaging"],
    "architecture_style": "microservices"
  },
  "current_canvas_state": {
    "components": ["user-db", "post-service", "api-gateway"],
    "connections": [{ "from": "api-gateway", "to": "post-service" }]
  },
  "suggestion_type": "architecture",
  "complexity_level": "medium",
  "preferred_style": "technical"
}
```

**Response:**

```json
{
  "suggestions": [
    {
      "id": "suggestion_1",
      "type": "add_component",
      "priority": "high",
      "title": "Add notification service",
      "description": "A dedicated service for handling real-time notifications",
      "rationale": "Separates notification logic and enables better scalability"
    }
  ],
  "diagram_snippets": [
    {
      "id": "snippet_1",
      "name": "notification_flow",
      "type": "flow_diagram",
      "description": "Shows how notifications flow through the system",
      "elements": [
        {
          "type": "rectangle",
          "label": "Notification Service",
          "position": { "x": 300, "y": 200 },
          "properties": { "color": "#4CAF50", "size": "medium" }
        }
      ]
    }
  ],
  "recommended_elements": [
    {
      "id": "element_1",
      "element_type": "service",
      "name": "notification-service",
      "description": "Handles push notifications, email alerts, and in-app notifications",
      "suggested_position": { "x": 400, "y": 300 },
      "connections_to": ["user-service", "message-queue"],
      "properties": { "technology": "Node.js", "criticality": "high" }
    }
  ],
  "canvas_modifications": {
    "layout_suggestions": [
      {
        "type": "reorganize",
        "target": "services_group",
        "change": "Arrange services in logical layers",
        "benefit": "Clearer visual hierarchy and data flow"
      }
    ],
    "style_improvements": [
      {
        "aspect": "colors",
        "current_issue": "All components use same color",
        "suggested_change": "Use color coding by component type",
        "impact": "Better visual distinction between services, databases, and queues"
      }
    ]
  },
  "suggestion_metadata": {
    "agent_used": "canvas_advisor_1",
    "execution_time": 1.89,
    "request_id": "req_20250721_123459_012",
    "suggestion_type": "architecture",
    "total_suggestions": 4,
    "snippet_count": 2,
    "element_count": 3,
    "priority_distribution": { "high": 2, "medium": 2 },
    "suggestion_types": ["add_component", "add_connection", "modify_layout"]
  }
}
```

### 5. Batch Processing

**Endpoint:** `POST /agents/batch-process`

Process multiple specialized requests in parallel for improved performance.

**Request Body:**

```json
{
  "requests": [
    {
      "type": "question_generation",
      "data": {
        "category": "web_systems",
        "question_type": "initial",
        "max_questions": 2
      },
      "context": { "interview_stage": "initial" }
    },
    {
      "type": "canvas_suggestion",
      "data": {
        "design_context": { "system_type": "e-commerce" },
        "suggestion_type": "flow"
      },
      "timeout": 20
    }
  ]
}
```

**Response:**

```json
{
  "responses": [
    {
      "type": "question_generation",
      "request_id": "req_20250721_123460_123",
      "success": true,
      "result": {
        "questions": [...],
        "generation_metadata": {...}
      },
      "agent_used": "question_generator_1",
      "execution_time": 1.23,
      "error": null
    },
    {
      "type": "canvas_suggestion",
      "request_id": "req_20250721_123460_124",
      "success": true,
      "result": {
        "suggestions": [...],
        "suggestion_metadata": {...}
      },
      "agent_used": "canvas_advisor_1",
      "execution_time": 0.89,
      "error": null
    }
  ]
}
```

## Agent Configuration

The service initializes specialized agents on startup:

- **Question Generator Agent** - Uses GPT-3.5-turbo, optimized for question generation
- **Design Review Agent** - Uses GPT-4, optimized for architectural analysis
- **Document Generator Agent** - Uses GPT-4, optimized for technical writing
- **Canvas Suggestion Agent** - Uses GPT-3.5-turbo, optimized for visual suggestions
- **General Purpose Agent** - Backup agent that can handle all capabilities

## Error Handling

All endpoints return structured error responses:

```json
{
  "detail": "Error description",
  "error_code": "CAPABILITY_NOT_AVAILABLE",
  "timestamp": "2025-07-21T12:34:56Z"
}
```

Common error scenarios:

- No agents available for capability
- Agent execution timeout
- Invalid request format
- OpenAI API errors

## Integration with Main Application

These endpoints are designed to be called from the main Next.js application's tRPC routers:

- Question generation integrates with the Q&A flow
- Design review provides feedback during design sessions
- Document generation creates exportable documents
- Canvas suggestions enhance the interactive canvas

## Performance Considerations

- Specialized agents are optimized for their specific tasks
- Batch processing reduces latency for multiple requests
- Fallback agents ensure high availability
- Request timeouts prevent hanging operations
- Caching can be implemented at the application layer

## Security

- All endpoints require proper authentication (handled by main app)
- Input validation prevents malicious prompts
- Rate limiting protects against abuse
- Audit logging tracks all agent interactions
