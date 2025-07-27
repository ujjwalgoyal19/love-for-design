"""
Agent Registry and Management System
"""

from typing import Dict, List, Optional, Any
from datetime import datetime
import logging
import json
import os
from pydantic import BaseModel

from agents.base_agent import AIAgent, AgentConfig, AgentCapability

logger = logging.getLogger(__name__)


class AgentRegistration(BaseModel):
    """Agent registration information"""

    agent_id: str
    name: str
    description: str
    agent_type: str
    capabilities: List[str]
    config: AgentConfig
    priority: int = 0
    is_active: bool = True
    created_at: datetime
    updated_at: datetime


class AgentRegistry:
    """Registry for managing AI agents"""

    def __init__(self, config_file: Optional[str] = None):
        self.config_file = config_file or "agent_config.json"
        self.registrations: Dict[str, AgentRegistration] = {}
        self.agent_types: Dict[str, type] = {}  # agent_type -> agent class
        self.load_config()

    def register_agent_type(self, agent_type: str, agent_class: type):
        """Register an agent class type"""
        self.agent_types[agent_type] = agent_class
        logger.info(f"Registered agent type: {agent_type}")

    def register_agent(
        self,
        agent_id: str,
        name: str,
        description: str,
        agent_type: str,
        capabilities: List[AgentCapability],
        config: AgentConfig,
        priority: int = 0,
        is_active: bool = True,
    ) -> bool:
        """Register an agent in the registry"""
        if agent_type not in self.agent_types:
            logger.error(f"Unknown agent type: {agent_type}")
            return False

        registration = AgentRegistration(
            agent_id=agent_id,
            name=name,
            description=description,
            agent_type=agent_type,
            capabilities=[cap.name for cap in capabilities],
            config=config,
            priority=priority,
            is_active=is_active,
            created_at=datetime.now(),
            updated_at=datetime.now(),
        )

        self.registrations[agent_id] = registration
        self.save_config()

        logger.info(f"Registered agent: {name} ({agent_id})")
        return True

    def unregister_agent(self, agent_id: str) -> bool:
        """Unregister an agent from the registry"""
        if agent_id in self.registrations:
            agent_name = self.registrations[agent_id].name
            del self.registrations[agent_id]
            self.save_config()
            logger.info(f"Unregistered agent: {agent_name} ({agent_id})")
            return True
        return False

    def get_agent_registration(self, agent_id: str) -> Optional[AgentRegistration]:
        """Get agent registration by ID"""
        return self.registrations.get(agent_id)

    def list_agents(self, active_only: bool = False) -> List[AgentRegistration]:
        """List all registered agents"""
        agents = list(self.registrations.values())
        if active_only:
            agents = [agent for agent in agents if agent.is_active]
        return agents

    def get_agents_by_capability(self, capability: str) -> List[AgentRegistration]:
        """Get agents that support a specific capability"""
        return [
            registration
            for registration in self.registrations.values()
            if capability in registration.capabilities and registration.is_active
        ]

    def get_agents_by_type(self, agent_type: str) -> List[AgentRegistration]:
        """Get agents of a specific type"""
        return [
            registration
            for registration in self.registrations.values()
            if registration.agent_type == agent_type
        ]

    def update_agent_config(self, agent_id: str, config: AgentConfig) -> bool:
        """Update agent configuration"""
        if agent_id in self.registrations:
            self.registrations[agent_id].config = config
            self.registrations[agent_id].updated_at = datetime.now()
            self.save_config()
            logger.info(f"Updated config for agent: {agent_id}")
            return True
        return False

    def set_agent_active(self, agent_id: str, active: bool) -> bool:
        """Enable or disable an agent"""
        if agent_id in self.registrations:
            self.registrations[agent_id].is_active = active
            self.registrations[agent_id].updated_at = datetime.now()
            self.save_config()
            logger.info(f"Set agent {agent_id} to {'active' if active else 'inactive'}")
            return True
        return False

    def update_agent_priority(self, agent_id: str, priority: int) -> bool:
        """Update agent priority"""
        if agent_id in self.registrations:
            self.registrations[agent_id].priority = priority
            self.registrations[agent_id].updated_at = datetime.now()
            self.save_config()
            logger.info(f"Updated priority for agent {agent_id} to {priority}")
            return True
        return False

    def create_agent_instance(self, agent_id: str) -> Optional[AIAgent]:
        """Create an agent instance from registration"""
        registration = self.registrations.get(agent_id)
        if not registration:
            logger.error(f"Agent registration not found: {agent_id}")
            return None

        agent_class = self.agent_types.get(registration.agent_type)
        if not agent_class:
            logger.error(f"Agent type not registered: {registration.agent_type}")
            return None

        try:
            # Create capabilities from registration
            capabilities = []
            for cap_name in registration.capabilities:
                # This is a simplified capability creation
                # In a real implementation, you'd load full capability definitions
                capability = AgentCapability(
                    name=cap_name,
                    description=f"Capability: {cap_name}",
                    input_schema={},
                    output_schema={},
                )
                capabilities.append(capability)

            # Create agent instance
            agent = agent_class(
                agent_id=registration.agent_id,
                name=registration.name,
                description=registration.description,
                capabilities=capabilities,
                config=registration.config,
                priority=registration.priority,
            )

            agent.is_active = registration.is_active
            return agent

        except Exception as e:
            logger.error(f"Failed to create agent instance {agent_id}: {str(e)}")
            return None

    def load_config(self):
        """Load agent configuration from file"""
        if os.path.exists(self.config_file):
            try:
                with open(self.config_file, "r") as f:
                    config_data = json.load(f)

                for agent_data in config_data.get("agents", []):
                    # Convert datetime strings back to datetime objects
                    agent_data["created_at"] = datetime.fromisoformat(
                        agent_data["created_at"]
                    )
                    agent_data["updated_at"] = datetime.fromisoformat(
                        agent_data["updated_at"]
                    )

                    registration = AgentRegistration(**agent_data)
                    self.registrations[registration.agent_id] = registration

                logger.info(
                    f"Loaded {len(self.registrations)} agent registrations from {self.config_file}"
                )

            except Exception as e:
                logger.error(f"Failed to load agent config: {str(e)}")
        else:
            logger.info(f"No existing config file found at {self.config_file}")

    def save_config(self):
        """Save agent configuration to file"""
        try:
            config_data = {"agents": []}

            for registration in self.registrations.values():
                agent_data = registration.dict()
                # Convert datetime objects to strings for JSON serialization
                agent_data["created_at"] = registration.created_at.isoformat()
                agent_data["updated_at"] = registration.updated_at.isoformat()
                config_data["agents"].append(agent_data)

            with open(self.config_file, "w") as f:
                json.dump(config_data, f, indent=2)

            logger.debug(f"Saved agent config to {self.config_file}")

        except Exception as e:
            logger.error(f"Failed to save agent config: {str(e)}")

    def get_registry_stats(self) -> Dict[str, Any]:
        """Get registry statistics"""
        total_agents = len(self.registrations)
        active_agents = sum(1 for reg in self.registrations.values() if reg.is_active)

        capabilities = set()
        agent_types = set()

        for registration in self.registrations.values():
            capabilities.update(registration.capabilities)
            agent_types.add(registration.agent_type)

        return {
            "total_agents": total_agents,
            "active_agents": active_agents,
            "inactive_agents": total_agents - active_agents,
            "unique_capabilities": len(capabilities),
            "capabilities": list(capabilities),
            "agent_types": list(agent_types),
            "registered_types": list(self.agent_types.keys()),
        }

    def validate_registry(self) -> List[str]:
        """Validate registry configuration and return any issues"""
        issues = []

        for agent_id, registration in self.registrations.items():
            # Check if agent type is registered
            if registration.agent_type not in self.agent_types:
                issues.append(
                    f"Agent {agent_id}: Unknown agent type '{registration.agent_type}'"
                )

            # Check if capabilities are defined
            if not registration.capabilities:
                issues.append(f"Agent {agent_id}: No capabilities defined")

            # Check configuration
            try:
                AgentConfig(**registration.config.dict())
            except Exception as e:
                issues.append(f"Agent {agent_id}: Invalid config - {str(e)}")

        return issues
