# Multi-Agent AI System

This document describes the multi-agent system implementation for the system design platform.

## Overview

The multi-agent system provides a scalable, orchestrated approach to AI processing with the following key components:

- **AIAgent**: Base class for all AI agents with capabilities and configuration
- **AgentOrchestrator**: Routes requests between agents based on capabilities and priority
- **AgentRegistry**: Manages agent registration, configuration, and persistence
- **AgentMonitor**: Provides execution logging and monitoring capabilities
- **MultiAgentService**: Main service that coordinates all components

## Architecture

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   FastAPI App   │───▶│ MultiAgentService│───▶│ AgentOrchestrator│
└─────────────────┘    └──────────────────┘    └─────────────────┘
                                │                        │
                                ▼                        ▼
                       ┌─────────────────┐    ┌─────────────────┐
                       │  AgentRegistry  │    │   AIAgent Pool  │
                       └─────────────────┘    └─────────────────┘
                                │                        │
                                ▼                        ▼
                       ┌─────────────────┐    ┌─────────────────┐
                       │  AgentMonitor   │    │  OpenAI Agent   │
                       └─────────────────┘    └─────────────────┘
```

## Key Features

### 1. Agent Management

- **Registration**: Agents are registered with capabilities, configuration, and priority
- **Discovery**: Automatic capability-based agent discovery
- **Configuration**: Dynamic agent configuration updates
- **Lifecycle**: Enable/disable agents without system restart

### 2. Request Orchestration

- **Capability Routing**: Requests routed to agents based on capabilities
- **Priority Handling**: Higher priority agents are tried first
- **Fallback Support**: Automatic fallback to alternative agents on failure
- **Parallel Processing**: Support for parallel request processing

### 3. Monitoring & Logging

- **Execution Tracking**: All agent executions are logged with metrics
- **Health Monitoring**: Real-time agent health status
- **Performance Metrics**: Success rates, response times, token usage
- **Error Tracking**: Detailed error logging and analysis

### 4. Fault Tolerance

- **Graceful Degradation**: System continues operating when agents fail
- **Timeout Handling**: Configurable timeouts prevent hanging requests
- **Error Recovery**: Automatic retry with alternative agents
- **Health Checks**: Comprehensive system health validation

## Agent Capabilities

The system supports the following capabilities:

### question_generation

Generates follow-up questions for system design interviews based on previous answers.

**Input:**

```json
{
  "category": "database|scalability|architecture",
  "previous_answers": [{ "question": "...", "answer": "..." }]
}
```

**Output:**

```json
{
  "questions": [
    {
      "text": "question text",
      "type": "text_input|multiple_choice|scale|boolean",
      "category": "requirements|architecture|scalability"
    }
  ]
}
```

### design_review

Reviews system designs and provides constructive feedback.

**Input:**

```json
{
  "design": {...},
  "requirements": ["req1", "req2"]
}
```

**Output:**

```json
{
  "strengths": ["strength1", "strength2"],
  "concerns": ["concern1", "concern2"],
  "recommendations": ["rec1", "rec2"],
  "alternatives": ["alt1", "alt2"]
}
```

### document_generation

Generates technical documents from design data.

**Input:**

```json
{
  "design": {...},
  "template_type": "design_document|presentation|technical_spec"
}
```

**Output:**

```markdown
# Generated Document

...
```

### canvas_suggestion

Provides suggestions for canvas diagram improvements.

**Input:**

```json
{
  "canvas": {...},
  "design_context": {...}
}
```

**Output:**

```json
{
  "add_components": [...],
  "add_connections": [...],
  "add_groups": [...],
  "add_annotations": [...]
}
```

## API Endpoints

### Core Processing

- `POST /agent/process` - Process a single request
- `POST /agent/process-parallel` - Process multiple requests in parallel

### System Management

- `GET /system/status` - Get comprehensive system status
- `GET /system/capabilities` - List all available capabilities
- `GET /health` - Health check with validation

### Agent Management

- `GET /agents` - List all registered agents
- `GET /agents/{agent_id}` - Get agent details
- `POST /agents` - Add a new agent
- `DELETE /agents/{agent_id}` - Remove an agent
- `PUT /agents/{agent_id}/config` - Update agent configuration
- `PUT /agents/{agent_id}/active` - Enable/disable an agent

### Monitoring

- `GET /monitoring/metrics` - Get system metrics
- `GET /monitoring/recent-activity` - Get recent activity
- `GET /monitoring/agents/{agent_id}/health` - Get agent health

## Configuration

### Agent Configuration

```json
{
  "model": "gpt-3.5-turbo",
  "temperature": 0.7,
  "max_tokens": 1000,
  "timeout": 30,
  "retry_attempts": 3,
  "custom_params": {}
}
```

### Environment Variables

- `OPENAI_API_KEY` - Required for OpenAI agents
- `PORT` - Service port (default: 3001)

## Usage Examples

### Adding an Agent

```python
service = MultiAgentService()

success = service.add_agent(
    agent_id="my_agent",
    name="My Custom Agent",
    description="Custom agent for specific tasks",
    agent_type="openai",
    capabilities=["question_generation"],
    config={
        "model": "gpt-4",
        "temperature": 0.5,
        "max_tokens": 1500
    },
    priority=10
)
```

### Processing a Request

```python
response = await service.process_request(
    capability="question_generation",
    data={
        "category": "scalability",
        "previous_answers": [...]
    },
    timeout=30
)

if response.success:
    result = response.result
    print(f"Agent used: {response.agent_used}")
else:
    print(f"Error: {response.error}")
```

### Monitoring Agent Health

```python
health = service.monitor.get_agent_health_status("my_agent")
print(f"Status: {health['status']}")
print(f"Success rate: {health['metrics']['success_rate']}")
```

## Error Handling

The system provides comprehensive error handling:

1. **Agent Failures**: Automatic fallback to alternative agents
2. **Timeout Handling**: Configurable timeouts with graceful degradation
3. **API Errors**: Proper error propagation with detailed messages
4. **Configuration Errors**: Validation and clear error reporting
5. **System Failures**: Health checks and monitoring alerts

## Performance Considerations

- **Caching**: Metrics are cached to reduce computation overhead
- **Parallel Processing**: Multiple requests can be processed simultaneously
- **Resource Management**: Configurable limits on logs and memory usage
- **Monitoring Overhead**: Lightweight logging with configurable retention

## Extending the System

### Adding New Agent Types

1. Create a new agent class inheriting from `AIAgent`
2. Implement the `_execute` method
3. Register the agent type in `MultiAgentService`

### Adding New Capabilities

1. Define the capability in agent implementations
2. Update capability-specific prompt building
3. Add result processing logic
4. Update API documentation

## Testing

Run the test suite:

```bash
python test_multi_agent.py
```

The test validates:

- Agent registration and management
- System status and health checks
- Request processing (with API key)
- Error handling and validation

## Deployment

1. Set environment variables (especially `OPENAI_API_KEY`)
2. Install dependencies: `pip install -r requirements.txt`
3. Start the service: `python app.py`
4. Verify health: `curl http://localhost:3001/health`

## Monitoring and Maintenance

- Monitor `/monitoring/metrics` for system performance
- Check `/monitoring/recent-activity` for error patterns
- Use `/system/status` for comprehensive system overview
- Review agent health regularly via `/monitoring/agents/{id}/health`

## Security Considerations

- API keys are handled securely through environment variables
- Request validation prevents malicious inputs
- Rate limiting can be implemented at the FastAPI level
- Audit logging tracks all agent executions
