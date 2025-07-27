"""
Agent Orchestrator for routing requests between agents
"""

from typing import Dict, List, Optional, Any
from datetime import datetime
import logging
import uuid
import asyncio
from concurrent.futures import ThreadPoolExecutor
from pydantic import BaseModel

from agents.base_agent import AIAgent, AgentInput, AgentOutput, AgentExecutionLog

logger = logging.getLogger(__name__)


class OrchestrationRequest(BaseModel):
    """Request for agent orchestration"""

    request_id: str
    capability: str
    data: Dict[str, Any]
    context: Optional[Dict[str, Any]] = None
    preferred_agent: Optional[str] = None
    fallback_enabled: bool = True
    timeout: int = 30


class OrchestrationResponse(BaseModel):
    """Response from agent orchestration"""

    request_id: str
    capability: str
    result: Dict[str, Any]
    agent_used: str
    execution_time: float
    success: bool
    error: Optional[str] = None
    fallback_used: bool = False
    agents_tried: List[str] = []


class AgentOrchestrator:
    """Orchestrates requests between multiple AI agents"""

    def __init__(self):
        self.agents: Dict[str, AIAgent] = {}
        self.capability_map: Dict[str, List[str]] = (
            {}
        )  # capability -> list of agent_ids
        self.execution_logs: List[AgentExecutionLog] = []
        self.executor = ThreadPoolExecutor(max_workers=10)

    def register_agent(self, agent: AIAgent):
        """Register an agent with the orchestrator"""
        self.agents[agent.agent_id] = agent

        # Update capability mapping
        for capability in agent.capabilities.keys():
            if capability not in self.capability_map:
                self.capability_map[capability] = []
            if agent.agent_id not in self.capability_map[capability]:
                self.capability_map[capability].append(agent.agent_id)

        # Sort agents by priority (higher priority first)
        for capability in self.capability_map:
            self.capability_map[capability].sort(
                key=lambda agent_id: self.agents[agent_id].priority, reverse=True
            )

        logger.info(f"Registered agent: {agent.name} ({agent.agent_id})")

    def unregister_agent(self, agent_id: str):
        """Unregister an agent from the orchestrator"""
        if agent_id in self.agents:
            agent = self.agents[agent_id]

            # Remove from capability mapping
            for capability in list(self.capability_map.keys()):
                if agent_id in self.capability_map[capability]:
                    self.capability_map[capability].remove(agent_id)
                if not self.capability_map[capability]:
                    del self.capability_map[capability]

            del self.agents[agent_id]
            logger.info(f"Unregistered agent: {agent.name} ({agent_id})")

    def get_agents_for_capability(self, capability: str) -> List[AIAgent]:
        """Get available agents for a specific capability, sorted by priority"""
        agent_ids = self.capability_map.get(capability, [])
        return [
            self.agents[agent_id]
            for agent_id in agent_ids
            if self.agents[agent_id].is_active
        ]

    async def route_request(
        self, request: OrchestrationRequest
    ) -> OrchestrationResponse:
        """Route a request to the appropriate agent(s)"""
        start_time = datetime.now()
        agents_tried = []

        # Get available agents for the capability
        available_agents = self.get_agents_for_capability(request.capability)

        if not available_agents:
            error_msg = f"No agents available for capability: {request.capability}"
            logger.error(error_msg)
            return OrchestrationResponse(
                request_id=request.request_id,
                capability=request.capability,
                result={},
                agent_used="",
                execution_time=(datetime.now() - start_time).total_seconds(),
                success=False,
                error=error_msg,
                agents_tried=agents_tried,
            )

        # If preferred agent is specified, try it first
        if request.preferred_agent and request.preferred_agent in self.agents:
            preferred_agent = self.agents[request.preferred_agent]
            if preferred_agent.can_handle(request.capability):
                available_agents = [preferred_agent] + [
                    agent
                    for agent in available_agents
                    if agent.agent_id != request.preferred_agent
                ]

        # Try agents in order of priority
        last_error = None
        for agent in available_agents:
            agents_tried.append(agent.agent_id)

            try:
                # Create agent input
                agent_input = AgentInput(
                    request_id=request.request_id,
                    capability=request.capability,
                    data=request.data,
                    context=request.context,
                )

                # Execute with timeout
                output = await asyncio.wait_for(
                    agent.process_request(agent_input), timeout=request.timeout
                )

                if output.success:
                    execution_time = (datetime.now() - start_time).total_seconds()

                    return OrchestrationResponse(
                        request_id=request.request_id,
                        capability=request.capability,
                        result=output.result,
                        agent_used=agent.agent_id,
                        execution_time=execution_time,
                        success=True,
                        fallback_used=len(agents_tried) > 1,
                        agents_tried=agents_tried,
                    )
                else:
                    last_error = output.error
                    logger.warning(f"Agent {agent.agent_id} failed: {output.error}")

                    if not request.fallback_enabled:
                        break

            except asyncio.TimeoutError:
                last_error = (
                    f"Agent {agent.agent_id} timed out after {request.timeout}s"
                )
                logger.warning(last_error)

                if not request.fallback_enabled:
                    break

            except Exception as e:
                last_error = f"Agent {agent.agent_id} error: {str(e)}"
                logger.error(last_error)

                if not request.fallback_enabled:
                    break

        # All agents failed
        execution_time = (datetime.now() - start_time).total_seconds()
        error_msg = f"All agents failed for capability {request.capability}. Last error: {last_error}"

        return OrchestrationResponse(
            request_id=request.request_id,
            capability=request.capability,
            result={},
            agent_used="",
            execution_time=execution_time,
            success=False,
            error=error_msg,
            agents_tried=agents_tried,
        )

    async def route_parallel_requests(
        self, requests: List[OrchestrationRequest]
    ) -> List[OrchestrationResponse]:
        """Route multiple requests in parallel"""
        tasks = [self.route_request(request) for request in requests]
        return await asyncio.gather(*tasks, return_exceptions=True)

    def get_orchestrator_stats(self) -> Dict[str, Any]:
        """Get orchestrator statistics"""
        agent_stats = {
            agent_id: agent.get_stats() for agent_id, agent in self.agents.items()
        }

        capability_coverage = {
            capability: len(agent_ids)
            for capability, agent_ids in self.capability_map.items()
        }

        return {
            "total_agents": len(self.agents),
            "active_agents": sum(
                1 for agent in self.agents.values() if agent.is_active
            ),
            "capabilities": list(self.capability_map.keys()),
            "capability_coverage": capability_coverage,
            "agent_stats": agent_stats,
        }

    def get_agent_health(self) -> Dict[str, Any]:
        """Get health status of all agents"""
        health_status = {}

        for agent_id, agent in self.agents.items():
            recent_logs = agent.execution_logs[-10:] if agent.execution_logs else []
            success_rate = (
                sum(1 for log in recent_logs if log.success) / len(recent_logs)
                if recent_logs
                else 1.0
            )

            health_status[agent_id] = {
                "name": agent.name,
                "is_active": agent.is_active,
                "success_rate": success_rate,
                "last_used": agent.last_used,
                "request_count": agent.request_count,
                "status": (
                    "healthy" if agent.is_active and success_rate > 0.8 else "degraded"
                ),
            }

        return health_status

    def set_agent_active(self, agent_id: str, active: bool):
        """Enable or disable an agent"""
        if agent_id in self.agents:
            self.agents[agent_id].is_active = active
            logger.info(f"Agent {agent_id} set to {'active' if active else 'inactive'}")
        else:
            logger.warning(f"Agent {agent_id} not found")

    def get_capabilities(self) -> List[str]:
        """Get all available capabilities"""
        return list(self.capability_map.keys())

    def get_agents_by_capability(self, capability: str) -> List[Dict[str, Any]]:
        """Get agent information for a specific capability"""
        agents = self.get_agents_for_capability(capability)
        return [
            {
                "agent_id": agent.agent_id,
                "name": agent.name,
                "priority": agent.priority,
                "is_active": agent.is_active,
                "request_count": agent.request_count,
                "last_used": agent.last_used,
            }
            for agent in agents
        ]
