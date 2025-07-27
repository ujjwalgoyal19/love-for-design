"""
Base AI Agent class with capabilities and configuration
"""

from abc import ABC, abstractmethod
from typing import Dict, List, Any, Optional
from pydantic import BaseModel
from datetime import datetime
import logging
import uuid

logger = logging.getLogger(__name__)


class AgentCapability(BaseModel):
    """Represents a capability that an agent can perform"""

    name: str
    description: str
    input_schema: Dict[str, Any]
    output_schema: Dict[str, Any]


class AgentConfig(BaseModel):
    """Configuration for an AI agent"""

    model: str = "gpt-3.5-turbo"
    temperature: float = 0.7
    max_tokens: int = 1000
    timeout: int = 30
    retry_attempts: int = 3
    custom_params: Dict[str, Any] = {}


class AgentInput(BaseModel):
    """Input data for agent processing"""

    request_id: str
    capability: str
    data: Dict[str, Any]
    context: Optional[Dict[str, Any]] = None


class AgentOutput(BaseModel):
    """Output data from agent processing"""

    request_id: str
    agent_id: str
    capability: str
    result: Dict[str, Any]
    metadata: Dict[str, Any] = {}
    execution_time: float
    tokens_used: Optional[int] = None
    success: bool = True
    error: Optional[str] = None


class AgentExecutionLog(BaseModel):
    """Log entry for agent execution"""

    log_id: str
    agent_id: str
    request_id: str
    capability: str
    timestamp: datetime
    execution_time: float
    success: bool
    tokens_used: Optional[int] = None
    error: Optional[str] = None
    input_size: int
    output_size: int


class AIAgent(ABC):
    """Base class for all AI agents"""

    def __init__(
        self,
        agent_id: str,
        name: str,
        description: str,
        capabilities: List[AgentCapability],
        config: AgentConfig,
        priority: int = 0,
    ):
        self.agent_id = agent_id
        self.name = name
        self.description = description
        self.capabilities = {cap.name: cap for cap in capabilities}
        self.config = config
        self.priority = priority
        self.is_active = True
        self.request_count = 0
        self.last_used = None
        self.execution_logs: List[AgentExecutionLog] = []

    def can_handle(self, capability: str) -> bool:
        """Check if agent can handle a specific capability"""
        return capability in self.capabilities and self.is_active

    def get_capability(self, capability: str) -> Optional[AgentCapability]:
        """Get capability definition"""
        return self.capabilities.get(capability)

    async def process_request(self, agent_input: AgentInput) -> AgentOutput:
        """Process a request with logging and error handling"""
        start_time = datetime.now()
        request_id = agent_input.request_id
        capability = agent_input.capability

        # Validate capability
        if not self.can_handle(capability):
            error_msg = f"Agent {self.agent_id} cannot handle capability: {capability}"
            logger.error(error_msg)
            return AgentOutput(
                request_id=request_id,
                agent_id=self.agent_id,
                capability=capability,
                result={},
                execution_time=0,
                success=False,
                error=error_msg,
            )

        try:
            # Execute the actual processing
            result = await self._execute(agent_input)
            execution_time = (datetime.now() - start_time).total_seconds()

            # Update agent statistics
            self.request_count += 1
            self.last_used = datetime.now()

            # Create output
            output = AgentOutput(
                request_id=request_id,
                agent_id=self.agent_id,
                capability=capability,
                result=result.get("result", {}),
                metadata=result.get("metadata", {}),
                execution_time=execution_time,
                tokens_used=result.get("tokens_used"),
                success=True,
            )

            # Log execution
            self._log_execution(agent_input, output, True)

            return output

        except Exception as e:
            execution_time = (datetime.now() - start_time).total_seconds()
            error_msg = str(e)
            logger.error(f"Agent {self.agent_id} execution failed: {error_msg}")

            output = AgentOutput(
                request_id=request_id,
                agent_id=self.agent_id,
                capability=capability,
                result={},
                execution_time=execution_time,
                success=False,
                error=error_msg,
            )

            # Log failed execution
            self._log_execution(agent_input, output, False)

            return output

    def _log_execution(
        self, agent_input: AgentInput, output: AgentOutput, success: bool
    ):
        """Log agent execution for monitoring"""
        log_entry = AgentExecutionLog(
            log_id=str(uuid.uuid4()),
            agent_id=self.agent_id,
            request_id=agent_input.request_id,
            capability=agent_input.capability,
            timestamp=datetime.now(),
            execution_time=output.execution_time,
            success=success,
            tokens_used=output.tokens_used,
            error=output.error,
            input_size=len(str(agent_input.data)),
            output_size=len(str(output.result)),
        )

        self.execution_logs.append(log_entry)

        # Keep only last 100 logs per agent to prevent memory issues
        if len(self.execution_logs) > 100:
            self.execution_logs = self.execution_logs[-100:]

    def get_stats(self) -> Dict[str, Any]:
        """Get agent statistics"""
        recent_logs = self.execution_logs[-10:] if self.execution_logs else []
        success_rate = (
            sum(1 for log in recent_logs if log.success) / len(recent_logs)
            if recent_logs
            else 0
        )
        avg_execution_time = (
            sum(log.execution_time for log in recent_logs) / len(recent_logs)
            if recent_logs
            else 0
        )

        return {
            "agent_id": self.agent_id,
            "name": self.name,
            "is_active": self.is_active,
            "request_count": self.request_count,
            "last_used": self.last_used,
            "capabilities": list(self.capabilities.keys()),
            "success_rate": success_rate,
            "avg_execution_time": avg_execution_time,
            "total_logs": len(self.execution_logs),
        }

    @abstractmethod
    async def _execute(self, agent_input: AgentInput) -> Dict[str, Any]:
        """Execute the agent's specific logic - to be implemented by subclasses"""
        pass
