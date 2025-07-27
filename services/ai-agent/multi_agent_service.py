"""
Multi-Agent Service Integration
Brings together the agent registry, orchestrator, and monitoring
"""

from typing import Dict, List, Optional, Any
import logging
import asyncio
from datetime import datetime

from agents.base_agent import AIAgent, AgentInput, AgentCapability, AgentConfig
from agents.openai_agent import OpenAIAgent
from orchestrator.agent_orchestrator import (
    AgentOrchestrator,
    OrchestrationRequest,
    OrchestrationResponse,
)
from registry.agent_registry import AgentRegistry, AgentRegistration
from monitoring.agent_monitor import AgentMonitor

logger = logging.getLogger(__name__)


class MultiAgentService:
    """Main service that coordinates all multi-agent functionality"""

    def __init__(self, config_file: Optional[str] = None):
        self.registry = AgentRegistry(config_file)
        self.orchestrator = AgentOrchestrator()
        self.monitor = AgentMonitor()

        # Register agent types
        self._register_agent_types()

        # Initialize agents from registry
        self._initialize_agents()

    def _register_agent_types(self):
        """Register available agent types"""
        self.registry.register_agent_type("openai", OpenAIAgent)
        logger.info("Registered agent types")

    def _initialize_agents(self):
        """Initialize agents from registry"""
        registrations = self.registry.list_agents(active_only=True)

        for registration in registrations:
            agent = self.registry.create_agent_instance(registration.agent_id)
            if agent:
                self.orchestrator.register_agent(agent)
                logger.info(f"Initialized agent: {agent.name}")
            else:
                logger.error(f"Failed to initialize agent: {registration.agent_id}")

    async def process_request(
        self,
        capability: str,
        data: Dict[str, Any],
        context: Optional[Dict[str, Any]] = None,
        preferred_agent: Optional[str] = None,
        timeout: int = 30,
    ) -> OrchestrationResponse:
        """Process a request through the multi-agent system"""
        request_id = f"req_{datetime.now().strftime('%Y%m%d_%H%M%S')}_{id(data)}"

        orchestration_request = OrchestrationRequest(
            request_id=request_id,
            capability=capability,
            data=data,
            context=context,
            preferred_agent=preferred_agent,
            timeout=timeout,
        )

        # Route through orchestrator
        response = await self.orchestrator.route_request(orchestration_request)

        # Log execution for monitoring
        if response.success and response.agent_used in self.orchestrator.agents:
            agent = self.orchestrator.agents[response.agent_used]
            # The agent's execution is already logged in its process_request method
            # The monitor will receive logs through the agent's _log_execution method

        return response

    async def process_parallel_requests(
        self, requests: List[Dict[str, Any]]
    ) -> List[OrchestrationResponse]:
        """Process multiple requests in parallel"""
        orchestration_requests = []

        for req_data in requests:
            request_id = (
                f"req_{datetime.now().strftime('%Y%m%d_%H%M%S')}_{id(req_data)}"
            )

            orchestration_request = OrchestrationRequest(
                request_id=request_id,
                capability=req_data["capability"],
                data=req_data["data"],
                context=req_data.get("context"),
                preferred_agent=req_data.get("preferred_agent"),
                timeout=req_data.get("timeout", 30),
            )
            orchestration_requests.append(orchestration_request)

        return await self.orchestrator.route_parallel_requests(orchestration_requests)

    def add_agent(
        self,
        agent_id: str,
        name: str,
        description: str,
        agent_type: str,
        capabilities: List[str],
        config: Dict[str, Any],
        priority: int = 0,
    ) -> bool:
        """Add a new agent to the system"""
        # Create capabilities (simplified - in real implementation, load from config)
        agent_capabilities = []
        for cap_name in capabilities:
            capability = AgentCapability(
                name=cap_name,
                description=f"Capability: {cap_name}",
                input_schema={},
                output_schema={},
            )
            agent_capabilities.append(capability)

        # Create agent config
        agent_config = AgentConfig(**config)

        # Register in registry
        success = self.registry.register_agent(
            agent_id=agent_id,
            name=name,
            description=description,
            agent_type=agent_type,
            capabilities=agent_capabilities,
            config=agent_config,
            priority=priority,
        )

        if success:
            # Create and register agent instance
            agent = self.registry.create_agent_instance(agent_id)
            if agent:
                self.orchestrator.register_agent(agent)
                logger.info(f"Added agent: {name} ({agent_id})")
                return True
            else:
                logger.error(f"Failed to create agent instance: {agent_id}")
                self.registry.unregister_agent(agent_id)
                return False

        return False

    def remove_agent(self, agent_id: str) -> bool:
        """Remove an agent from the system"""
        # Unregister from orchestrator
        self.orchestrator.unregister_agent(agent_id)

        # Unregister from registry
        return self.registry.unregister_agent(agent_id)

    def update_agent_config(self, agent_id: str, config: Dict[str, Any]) -> bool:
        """Update agent configuration"""
        agent_config = AgentConfig(**config)
        success = self.registry.update_agent_config(agent_id, agent_config)

        if success:
            # Recreate agent instance with new config
            agent = self.registry.create_agent_instance(agent_id)
            if agent:
                self.orchestrator.unregister_agent(agent_id)
                self.orchestrator.register_agent(agent)
                logger.info(f"Updated config for agent: {agent_id}")
                return True

        return False

    def set_agent_active(self, agent_id: str, active: bool) -> bool:
        """Enable or disable an agent"""
        # Update in registry
        registry_success = self.registry.set_agent_active(agent_id, active)

        # Update in orchestrator
        self.orchestrator.set_agent_active(agent_id, active)

        logger.info(f"Set agent {agent_id} to {'active' if active else 'inactive'}")
        return registry_success

    def get_system_status(self) -> Dict[str, Any]:
        """Get comprehensive system status"""
        registry_stats = self.registry.get_registry_stats()
        orchestrator_stats = self.orchestrator.get_orchestrator_stats()
        system_metrics = self.monitor.get_system_metrics()
        agent_health = self.orchestrator.get_agent_health()

        return {
            "registry": registry_stats,
            "orchestrator": orchestrator_stats,
            "metrics": system_metrics.dict(),
            "agent_health": agent_health,
            "capabilities": self.orchestrator.get_capabilities(),
            "timestamp": datetime.now().isoformat(),
        }

    def get_agent_details(self, agent_id: str) -> Optional[Dict[str, Any]]:
        """Get detailed information about a specific agent"""
        registration = self.registry.get_agent_registration(agent_id)
        if not registration:
            return None

        agent_metrics = self.monitor.get_agent_metrics(agent_id)
        health_status = self.monitor.get_agent_health_status(agent_id)

        return {
            "registration": registration.dict(),
            "metrics": agent_metrics.dict() if agent_metrics else None,
            "health": health_status,
            "is_active": agent_id in self.orchestrator.agents
            and self.orchestrator.agents[agent_id].is_active,
        }

    def get_capability_info(self, capability: str) -> Dict[str, Any]:
        """Get information about a specific capability"""
        agents = self.orchestrator.get_agents_by_capability(capability)
        capability_metrics = self.monitor.get_capability_metrics().get(capability, {})

        return {
            "capability": capability,
            "available_agents": agents,
            "metrics": capability_metrics,
            "agent_count": len(agents),
        }

    def get_recent_activity(self, hours: int = 24) -> Dict[str, Any]:
        """Get recent system activity"""
        recent_errors = self.monitor.get_recent_errors(hours=hours)
        system_metrics = self.monitor.get_system_metrics()

        return {
            "time_period_hours": hours,
            "recent_errors": recent_errors,
            "requests_per_minute": system_metrics.requests_per_minute,
            "top_capabilities": system_metrics.top_capabilities,
            "overall_success_rate": system_metrics.overall_success_rate,
        }

    def validate_system(self) -> Dict[str, Any]:
        """Validate the entire multi-agent system"""
        registry_issues = self.registry.validate_registry()

        # Check orchestrator consistency
        orchestrator_issues = []
        for agent_id in self.orchestrator.agents:
            if not self.registry.get_agent_registration(agent_id):
                orchestrator_issues.append(
                    f"Agent {agent_id} in orchestrator but not in registry"
                )

        # Check for missing agents
        missing_agents = []
        for registration in self.registry.list_agents(active_only=True):
            if registration.agent_id not in self.orchestrator.agents:
                missing_agents.append(
                    f"Active agent {registration.agent_id} not in orchestrator"
                )

        return {
            "registry_issues": registry_issues,
            "orchestrator_issues": orchestrator_issues,
            "missing_agents": missing_agents,
            "is_valid": len(registry_issues) == 0
            and len(orchestrator_issues) == 0
            and len(missing_agents) == 0,
        }

    async def health_check(self) -> Dict[str, Any]:
        """Perform a comprehensive health check"""
        # Test a simple capability if available
        test_result = None
        capabilities = self.orchestrator.get_capabilities()

        if capabilities:
            try:
                test_capability = capabilities[0]
                test_response = await self.process_request(
                    capability=test_capability,
                    data={"test": "health_check"},
                    timeout=10,
                )
                test_result = {
                    "success": test_response.success,
                    "agent_used": test_response.agent_used,
                    "execution_time": test_response.execution_time,
                }
            except Exception as e:
                test_result = {"success": False, "error": str(e)}

        validation = self.validate_system()
        system_status = self.get_system_status()

        overall_health = "healthy"
        if not validation["is_valid"]:
            overall_health = "critical"
        elif test_result and not test_result["success"]:
            overall_health = "degraded"
        elif system_status["metrics"]["overall_success_rate"] < 0.8:
            overall_health = "warning"

        return {
            "overall_health": overall_health,
            "test_result": test_result,
            "validation": validation,
            "system_status": system_status,
            "timestamp": datetime.now().isoformat(),
        }
