from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import Dict, List, Any, Optional
from dotenv import load_dotenv
import os
import logging

from multi_agent_service import MultiAgentService
from orchestrator.agent_orchestrator import OrchestrationResponse

# Load environment variables
load_dotenv()

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Initialize FastAPI app
app = FastAPI(
    title="Multi-Agent AI Service",
    description="Multi-agent AI service for system design platform",
    version="2.0.0",
)

# Initialize multi-agent service
multi_agent_service = MultiAgentService()


# Initialize specialized agents
@app.on_event("startup")
async def startup_event():
    """Initialize specialized agents on startup"""

    # Remove existing test agent if it exists to avoid conflicts
    multi_agent_service.remove_agent("test_agent_1")

    # Add specialized question generation agent
    multi_agent_service.add_agent(
        agent_id="question_generator_1",
        name="Question Generator Agent",
        description="Specialized agent for generating dynamic Q&A questions for system design interviews",
        agent_type="openai",
        capabilities=["question_generation"],
        config={
            "model": "gpt-3.5-turbo",
            "temperature": 0.7,
            "max_tokens": 1500,
            "timeout": 30,
            "retry_attempts": 3,
        },
        priority=10,
    )

    # Add specialized design review agent
    multi_agent_service.add_agent(
        agent_id="design_reviewer_1",
        name="Design Review Agent",
        description="Specialized agent for reviewing system architecture and providing feedback",
        agent_type="openai",
        capabilities=["design_review"],
        config={
            "model": "gpt-4",
            "temperature": 0.5,
            "max_tokens": 2500,
            "timeout": 45,
            "retry_attempts": 3,
        },
        priority=10,
    )

    # Add specialized document generation agent
    multi_agent_service.add_agent(
        agent_id="doc_generator_1",
        name="Document Generator Agent",
        description="Specialized agent for generating technical documents and narratives",
        agent_type="openai",
        capabilities=["document_generation"],
        config={
            "model": "gpt-4",
            "temperature": 0.3,
            "max_tokens": 3000,
            "timeout": 60,
            "retry_attempts": 3,
        },
        priority=10,
    )

    # Add specialized canvas suggestion agent
    multi_agent_service.add_agent(
        agent_id="canvas_advisor_1",
        name="Canvas Suggestion Agent",
        description="Specialized agent for providing canvas diagram suggestions and improvements",
        agent_type="openai",
        capabilities=["canvas_suggestion"],
        config={
            "model": "gpt-3.5-turbo",
            "temperature": 0.6,
            "max_tokens": 2000,
            "timeout": 30,
            "retry_attempts": 3,
        },
        priority=10,
    )

    # Add a multi-capability agent as backup
    multi_agent_service.add_agent(
        agent_id="general_agent_1",
        name="General Purpose Agent",
        description="Multi-capability agent that can handle all specialized tasks as backup",
        agent_type="openai",
        capabilities=[
            "question_generation",
            "design_review",
            "document_generation",
            "canvas_suggestion",
        ],
        config={
            "model": "gpt-3.5-turbo",
            "temperature": 0.7,
            "max_tokens": 2000,
            "timeout": 45,
            "retry_attempts": 3,
        },
        priority=5,  # Lower priority than specialized agents
    )

    logger.info("Specialized agents initialized successfully")

    # Log the capabilities available
    capabilities = multi_agent_service.orchestrator.get_capabilities()
    logger.info(f"Available capabilities: {capabilities}")

    # Log agent health
    agent_health = multi_agent_service.orchestrator.get_agent_health()
    for agent_id, health in agent_health.items():
        logger.info(f"Agent {agent_id} ({health['name']}): {health['status']}")


# Pydantic models for request/response
class AgentRequest(BaseModel):
    capability: str
    data: Dict[str, Any]
    context: Optional[Dict[str, Any]] = None
    preferred_agent: Optional[str] = None
    timeout: int = 30


class AgentResponse(BaseModel):
    request_id: str
    capability: str
    result: Dict[str, Any]
    agent_used: str
    execution_time: float
    success: bool
    error: Optional[str] = None
    fallback_used: bool = False


class ParallelRequest(BaseModel):
    requests: List[AgentRequest]


class AddAgentRequest(BaseModel):
    agent_id: str
    name: str
    description: str
    agent_type: str
    capabilities: List[str]
    config: Dict[str, Any]
    priority: int = 0


class UpdateAgentConfigRequest(BaseModel):
    config: Dict[str, Any]


class SetAgentActiveRequest(BaseModel):
    active: bool


# Specialized endpoint models
class QuestionGenerationRequest(BaseModel):
    category: str
    previous_answers: Dict[str, Any] = {}
    context: Optional[Dict[str, Any]] = None
    question_type: str = "follow_up"  # "initial", "follow_up", "clarification"
    max_questions: int = 5


class QuestionGenerationResponse(BaseModel):
    questions: List[Dict[str, Any]]
    category: str
    question_type: str
    context_used: Dict[str, Any]
    generation_metadata: Dict[str, Any]


class DesignReviewRequest(BaseModel):
    design_data: Dict[str, Any]
    review_focus: List[str] = ["scalability", "reliability", "performance", "security"]
    context: Optional[Dict[str, Any]] = None
    detail_level: str = "comprehensive"  # "brief", "standard", "comprehensive"


class DesignReviewResponse(BaseModel):
    review_summary: str
    detailed_feedback: List[Dict[str, Any]]
    recommendations: List[Dict[str, Any]]
    risk_assessment: Dict[str, Any]
    review_metadata: Dict[str, Any]


class DocumentGenerationRequest(BaseModel):
    design_session_data: Dict[str, Any]
    template_type: str = (
        "technical_spec"  # "technical_spec", "design_document", "presentation"
    )
    sections: List[str] = []  # If empty, use default sections for template type
    context: Optional[Dict[str, Any]] = None
    formatting_options: Dict[str, Any] = {}


class DocumentGenerationResponse(BaseModel):
    document_content: str
    sections_generated: List[str]
    template_used: str
    word_count: int
    generation_metadata: Dict[str, Any]


class CanvasSuggestionRequest(BaseModel):
    design_context: Dict[str, Any]
    current_canvas_state: Optional[Dict[str, Any]] = None
    suggestion_type: str = (
        "architecture"  # "architecture", "flow", "component", "sequence"
    )
    complexity_level: str = "medium"  # "simple", "medium", "complex"
    preferred_style: str = "technical"  # "technical", "conceptual", "detailed"


class CanvasSuggestionResponse(BaseModel):
    suggestions: List[Dict[str, Any]]
    diagram_snippets: List[Dict[str, Any]]
    recommended_elements: List[Dict[str, Any]]
    canvas_modifications: Dict[str, Any]
    suggestion_metadata: Dict[str, Any]


class BatchProcessRequest(BaseModel):
    requests: List[Dict[str, Any]]


# Legacy endpoint for backward compatibility
class GenerateRequest(BaseModel):
    prompt: str
    model: str = "gpt-3.5-turbo"
    max_tokens: int = 1000
    temperature: float = 0.7


class GenerateResponse(BaseModel):
    result: str
    model_used: str
    tokens_used: int


@app.get("/health")
async def health_check():
    """Comprehensive health check endpoint"""
    health_result = await multi_agent_service.health_check()

    if health_result["overall_health"] == "healthy":
        return {
            "status": "healthy",
            "service": "multi-agent-ai",
            "details": health_result,
        }
    else:
        raise HTTPException(
            status_code=503, detail=f"Service health: {health_result['overall_health']}"
        )


@app.post("/agent/process", response_model=AgentResponse)
async def process_agent_request(request: AgentRequest):
    """Process a request through the multi-agent system"""
    try:
        response = await multi_agent_service.process_request(
            capability=request.capability,
            data=request.data,
            context=request.context,
            preferred_agent=request.preferred_agent,
            timeout=request.timeout,
        )

        return AgentResponse(
            request_id=response.request_id,
            capability=response.capability,
            result=response.result,
            agent_used=response.agent_used,
            execution_time=response.execution_time,
            success=response.success,
            error=response.error,
            fallback_used=response.fallback_used,
        )

    except Exception as e:
        logger.error(f"Error processing agent request: {str(e)}")
        raise HTTPException(
            status_code=500, detail=f"Failed to process request: {str(e)}"
        )


@app.post("/agent/process-parallel")
async def process_parallel_requests(request: ParallelRequest):
    """Process multiple requests in parallel"""
    try:
        request_data = [
            {
                "capability": req.capability,
                "data": req.data,
                "context": req.context,
                "preferred_agent": req.preferred_agent,
                "timeout": req.timeout,
            }
            for req in request.requests
        ]

        responses = await multi_agent_service.process_parallel_requests(request_data)

        return {
            "responses": [
                {
                    "request_id": resp.request_id,
                    "capability": resp.capability,
                    "result": resp.result,
                    "agent_used": resp.agent_used,
                    "execution_time": resp.execution_time,
                    "success": resp.success,
                    "error": resp.error,
                    "fallback_used": resp.fallback_used,
                }
                for resp in responses
            ]
        }

    except Exception as e:
        logger.error(f"Error processing parallel requests: {str(e)}")
        raise HTTPException(
            status_code=500, detail=f"Failed to process parallel requests: {str(e)}"
        )


@app.get("/system/status")
async def get_system_status():
    """Get comprehensive system status"""
    return multi_agent_service.get_system_status()


@app.get("/system/capabilities")
async def get_capabilities():
    """Get all available capabilities"""
    capabilities = multi_agent_service.orchestrator.get_capabilities()
    capability_info = {}

    for capability in capabilities:
        capability_info[capability] = multi_agent_service.get_capability_info(
            capability
        )

    return {"capabilities": capabilities, "details": capability_info}


@app.get("/agents")
async def list_agents():
    """List all registered agents"""
    agents = multi_agent_service.registry.list_agents()
    return {"agents": [agent.dict() for agent in agents], "total": len(agents)}


@app.get("/agents/{agent_id}")
async def get_agent_details(agent_id: str):
    """Get detailed information about a specific agent"""
    details = multi_agent_service.get_agent_details(agent_id)
    if not details:
        raise HTTPException(status_code=404, detail="Agent not found")
    return details


@app.post("/agents")
async def add_agent(request: AddAgentRequest):
    """Add a new agent to the system"""
    success = multi_agent_service.add_agent(
        agent_id=request.agent_id,
        name=request.name,
        description=request.description,
        agent_type=request.agent_type,
        capabilities=request.capabilities,
        config=request.config,
        priority=request.priority,
    )

    if success:
        return {"message": f"Agent {request.agent_id} added successfully"}
    else:
        raise HTTPException(
            status_code=400, detail=f"Failed to add agent {request.agent_id}"
        )


@app.delete("/agents/{agent_id}")
async def remove_agent(agent_id: str):
    """Remove an agent from the system"""
    success = multi_agent_service.remove_agent(agent_id)
    if success:
        return {"message": f"Agent {agent_id} removed successfully"}
    else:
        raise HTTPException(status_code=404, detail="Agent not found")


@app.put("/agents/{agent_id}/config")
async def update_agent_config(agent_id: str, request: UpdateAgentConfigRequest):
    """Update agent configuration"""
    success = multi_agent_service.update_agent_config(agent_id, request.config)
    if success:
        return {"message": f"Agent {agent_id} config updated successfully"}
    else:
        raise HTTPException(status_code=404, detail="Agent not found")


@app.put("/agents/{agent_id}/active")
async def set_agent_active(agent_id: str, request: SetAgentActiveRequest):
    """Enable or disable an agent"""
    success = multi_agent_service.set_agent_active(agent_id, request.active)
    if success:
        status = "activated" if request.active else "deactivated"
        return {"message": f"Agent {agent_id} {status} successfully"}
    else:
        raise HTTPException(status_code=404, detail="Agent not found")


@app.get("/monitoring/metrics")
async def get_monitoring_metrics():
    """Get system monitoring metrics"""
    return multi_agent_service.monitor.get_system_metrics().dict()


@app.get("/monitoring/recent-activity")
async def get_recent_activity(hours: int = 24):
    """Get recent system activity"""
    return multi_agent_service.get_recent_activity(hours=hours)


@app.get("/monitoring/agents/{agent_id}/health")
async def get_agent_health(agent_id: str):
    """Get health status for a specific agent"""
    health = multi_agent_service.monitor.get_agent_health_status(agent_id)
    return health


# Specialized Agent Endpoints


@app.post("/agents/question-generation", response_model=QuestionGenerationResponse)
async def generate_questions(request: QuestionGenerationRequest):
    """Generate dynamic questions for system design Q&A flow"""
    try:
        response = await multi_agent_service.process_request(
            capability="question_generation",
            data={
                "category": request.category,
                "previous_answers": request.previous_answers,
                "question_type": request.question_type,
                "max_questions": request.max_questions,
            },
            context=request.context,
        )

        if response.success:
            result = response.result
            return QuestionGenerationResponse(
                questions=result.get("questions", []),
                category=request.category,
                question_type=request.question_type,
                context_used=result.get("context_used", {}),
                generation_metadata={
                    "agent_used": response.agent_used,
                    "execution_time": response.execution_time,
                    "request_id": response.request_id,
                },
            )
        else:
            raise HTTPException(
                status_code=500,
                detail=f"Question generation failed: {response.error}",
            )

    except Exception as e:
        logger.error(f"Error in question generation endpoint: {str(e)}")
        raise HTTPException(
            status_code=500, detail=f"Failed to generate questions: {str(e)}"
        )


@app.post("/agents/design-review", response_model=DesignReviewResponse)
async def review_design(request: DesignReviewRequest):
    """Review system design and provide architectural feedback"""
    try:
        response = await multi_agent_service.process_request(
            capability="design_review",
            data={
                "design_data": request.design_data,
                "review_focus": request.review_focus,
                "detail_level": request.detail_level,
            },
            context=request.context,
        )

        if response.success:
            result = response.result
            return DesignReviewResponse(
                review_summary=result.get("review_summary", ""),
                detailed_feedback=result.get("detailed_feedback", []),
                recommendations=result.get("recommendations", []),
                risk_assessment=result.get("risk_assessment", {}),
                review_metadata={
                    "agent_used": response.agent_used,
                    "execution_time": response.execution_time,
                    "request_id": response.request_id,
                    "review_focus": request.review_focus,
                },
            )
        else:
            raise HTTPException(
                status_code=500, detail=f"Design review failed: {response.error}"
            )

    except Exception as e:
        logger.error(f"Error in design review endpoint: {str(e)}")
        raise HTTPException(
            status_code=500, detail=f"Failed to review design: {str(e)}"
        )


@app.post("/agents/document-generation", response_model=DocumentGenerationResponse)
async def generate_document(request: DocumentGenerationRequest):
    """Generate narrative documents from design session data"""
    try:
        response = await multi_agent_service.process_request(
            capability="document_generation",
            data={
                "design_session_data": request.design_session_data,
                "template_type": request.template_type,
                "sections": request.sections,
                "formatting_options": request.formatting_options,
            },
            context=request.context,
        )

        if response.success:
            result = response.result
            return DocumentGenerationResponse(
                document_content=result.get("document_content", ""),
                sections_generated=result.get("sections_generated", []),
                template_used=request.template_type,
                word_count=result.get("word_count", 0),
                generation_metadata={
                    "agent_used": response.agent_used,
                    "execution_time": response.execution_time,
                    "request_id": response.request_id,
                    "template_type": request.template_type,
                },
            )
        else:
            raise HTTPException(
                status_code=500,
                detail=f"Document generation failed: {response.error}",
            )

    except Exception as e:
        logger.error(f"Error in document generation endpoint: {str(e)}")
        raise HTTPException(
            status_code=500, detail=f"Failed to generate document: {str(e)}"
        )


@app.post("/agents/canvas-suggestions", response_model=CanvasSuggestionResponse)
async def get_canvas_suggestions(request: CanvasSuggestionRequest):
    """Get AI suggestions for canvas diagrams and elements"""
    try:
        response = await multi_agent_service.process_request(
            capability="canvas_suggestion",
            data={
                "design_context": request.design_context,
                "current_canvas_state": request.current_canvas_state,
                "suggestion_type": request.suggestion_type,
                "complexity_level": request.complexity_level,
                "preferred_style": request.preferred_style,
            },
        )

        if response.success:
            result = response.result
            return CanvasSuggestionResponse(
                suggestions=result.get("suggestions", []),
                diagram_snippets=result.get("diagram_snippets", []),
                recommended_elements=result.get("recommended_elements", []),
                canvas_modifications=result.get("canvas_modifications", {}),
                suggestion_metadata={
                    "agent_used": response.agent_used,
                    "execution_time": response.execution_time,
                    "request_id": response.request_id,
                    "suggestion_type": request.suggestion_type,
                },
            )
        else:
            raise HTTPException(
                status_code=500,
                detail=f"Canvas suggestions failed: {response.error}",
            )

    except Exception as e:
        logger.error(f"Error in canvas suggestions endpoint: {str(e)}")
        raise HTTPException(
            status_code=500, detail=f"Failed to get canvas suggestions: {str(e)}"
        )


# Batch processing endpoint for multiple specialized requests
@app.post("/agents/batch-process")
async def batch_process_specialized_requests(batch_request: BatchProcessRequest):
    """Process multiple specialized agent requests in parallel"""
    try:
        # Convert specialized requests to standard agent requests
        agent_requests = []

        for req in batch_request.requests:
            request_type = req.get("type")
            data = req.get("data", {})
            context = req.get("context")

            if request_type == "question_generation":
                capability = "question_generation"
            elif request_type == "design_review":
                capability = "design_review"
            elif request_type == "document_generation":
                capability = "document_generation"
            elif request_type == "canvas_suggestion":
                capability = "canvas_suggestion"
            else:
                raise HTTPException(
                    status_code=400, detail=f"Unknown request type: {request_type}"
                )

            agent_requests.append(
                {
                    "capability": capability,
                    "data": data,
                    "context": context,
                    "timeout": req.get("timeout", 30),
                }
            )

        responses = await multi_agent_service.process_parallel_requests(agent_requests)

        # Format responses with type information
        formatted_responses = []
        for i, response in enumerate(responses):
            formatted_responses.append(
                {
                    "type": batch_request.requests[i]["type"],
                    "request_id": response.request_id,
                    "success": response.success,
                    "result": response.result,
                    "agent_used": response.agent_used,
                    "execution_time": response.execution_time,
                    "error": response.error,
                }
            )

        return {"responses": formatted_responses}

    except Exception as e:
        logger.error(f"Error in batch processing endpoint: {str(e)}")
        raise HTTPException(
            status_code=500, detail=f"Failed to process batch requests: {str(e)}"
        )


# Legacy endpoint for backward compatibility
@app.post("/generate", response_model=GenerateResponse)
async def generate(request: GenerateRequest):
    """Legacy generate endpoint - routes to multi-agent system"""
    try:
        # Route through the multi-agent system using a generic capability
        response = await multi_agent_service.process_request(
            capability="question_generation",  # Use any available capability
            data={
                "prompt": request.prompt,
                "model": request.model,
                "max_tokens": request.max_tokens,
                "temperature": request.temperature,
            },
        )

        if response.success:
            result_content = response.result.get("content", "")
            return GenerateResponse(
                result=result_content,
                model_used=request.model,
                tokens_used=0,  # Token counting would need to be implemented
            )
        else:
            raise HTTPException(
                status_code=500, detail=f"Generation failed: {response.error}"
            )

    except Exception as e:
        logger.error(f"Error in legacy generate endpoint: {str(e)}")
        raise HTTPException(
            status_code=500, detail=f"Failed to generate response: {str(e)}"
        )


if __name__ == "__main__":
    import uvicorn

    port = int(os.getenv("PORT", "3001"))
    uvicorn.run("app:app", host="0.0.0.0", port=port, reload=True, log_level="info")
