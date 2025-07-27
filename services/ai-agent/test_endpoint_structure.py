#!/usr/bin/env python3
"""
Test script to verify endpoint structure without requiring API keys
"""

import asyncio
import json
from multi_agent_service import MultiAgentService


class MockOpenAIAgent:
    """Mock agent for testing without API keys"""

    def __init__(self, agent_id, name, description, capabilities, config, priority=0):
        self.agent_id = agent_id
        self.name = name
        self.description = description
        self.capabilities = {cap.name: cap for cap in capabilities}
        self.config = config
        self.priority = priority
        self.is_active = True
        self.request_count = 0
        self.last_used = None
        self.execution_logs = []

    def can_handle(self, capability: str) -> bool:
        return capability in self.capabilities and self.is_active

    async def process_request(self, agent_input):
        """Mock process request that returns structured test data"""
        from agents.base_agent import AgentOutput
        from datetime import datetime

        capability = agent_input.capability

        # Mock responses for each capability
        mock_responses = {
            "question_generation": {
                "questions": [
                    {
                        "text": "What is the expected read/write ratio for your system?",
                        "type": "text_input",
                        "category": "performance",
                        "priority": "high",
                    }
                ],
                "context_used": {"previous_answers_count": 2},
            },
            "design_review": {
                "review_summary": "The design shows good separation of concerns with microservices architecture.",
                "detailed_feedback": [
                    {
                        "category": "scalability",
                        "severity": "medium",
                        "title": "Database scaling concerns",
                        "description": "Single PostgreSQL instance may become a bottleneck",
                    }
                ],
                "recommendations": [
                    {
                        "priority": "high",
                        "title": "Implement database sharding",
                        "description": "Consider horizontal partitioning for user data",
                    }
                ],
                "risk_assessment": {"overall_risk_level": "medium"},
            },
            "document_generation": {
                "document_content": "# System Design Document\n\n## Overview\nThis is a mock document...",
                "sections_generated": ["Overview", "Architecture"],
                "word_count": 150,
            },
            "canvas_suggestion": {
                "suggestions": [
                    {
                        "type": "add_component",
                        "priority": "high",
                        "title": "Add load balancer",
                        "description": "Add a load balancer to distribute traffic",
                    }
                ],
                "diagram_snippets": [],
                "recommended_elements": [],
            },
        }

        result = mock_responses.get(capability, {"content": "Mock response"})

        return AgentOutput(
            request_id=agent_input.request_id,
            agent_id=self.agent_id,
            capability=capability,
            result=result,
            execution_time=0.1,
            success=True,
        )

    def get_stats(self):
        return {
            "agent_id": self.agent_id,
            "name": self.name,
            "is_active": self.is_active,
            "request_count": self.request_count,
        }


async def test_endpoint_structure():
    """Test endpoint structure with mock agents"""
    print("Testing specialized endpoint structure...")

    # Create service with mock agents
    service = MultiAgentService()

    # Clear existing agents and add mock agents
    service.orchestrator.agents.clear()
    service.orchestrator.capability_map.clear()

    # Create mock capabilities
    from agents.base_agent import AgentCapability

    capabilities = [
        AgentCapability(
            name="question_generation",
            description="Generate questions",
            input_schema={},
            output_schema={},
        ),
        AgentCapability(
            name="design_review",
            description="Review designs",
            input_schema={},
            output_schema={},
        ),
        AgentCapability(
            name="document_generation",
            description="Generate documents",
            input_schema={},
            output_schema={},
        ),
        AgentCapability(
            name="canvas_suggestion",
            description="Suggest canvas elements",
            input_schema={},
            output_schema={},
        ),
    ]

    # Add mock agent
    mock_agent = MockOpenAIAgent(
        agent_id="mock_agent_1",
        name="Mock Agent",
        description="Mock agent for testing",
        capabilities=capabilities,
        config=None,
    )

    service.orchestrator.register_agent(mock_agent)

    # Test each capability
    test_cases = [
        {
            "name": "Question Generation",
            "capability": "question_generation",
            "data": {
                "category": "distributed_systems",
                "previous_answers": {"q1": "answer1"},
                "question_type": "follow_up",
                "max_questions": 3,
            },
        },
        {
            "name": "Design Review",
            "capability": "design_review",
            "data": {
                "design_data": {"architecture": "microservices"},
                "review_focus": ["scalability"],
                "detail_level": "standard",
            },
        },
        {
            "name": "Document Generation",
            "capability": "document_generation",
            "data": {
                "design_session_data": {"requirements": ["req1"]},
                "template_type": "technical_spec",
                "sections": ["Overview"],
            },
        },
        {
            "name": "Canvas Suggestions",
            "capability": "canvas_suggestion",
            "data": {
                "design_context": {"system_type": "social_media"},
                "suggestion_type": "architecture",
                "complexity_level": "medium",
            },
        },
    ]

    for test_case in test_cases:
        print(f"\n✓ Testing {test_case['name']}...")
        try:
            response = await service.process_request(
                capability=test_case["capability"], data=test_case["data"]
            )

            if response.success:
                print(f"  ✓ Success: Agent {response.agent_used} processed request")
                print(f"  ✓ Execution time: {response.execution_time:.3f}s")
                print(f"  ✓ Result keys: {list(response.result.keys())}")
            else:
                print(f"  ✗ Failed: {response.error}")

        except Exception as e:
            print(f"  ✗ Exception: {e}")

    print(f"\n✓ Available capabilities: {service.orchestrator.get_capabilities()}")
    print("✓ Endpoint structure test completed!")


if __name__ == "__main__":
    asyncio.run(test_endpoint_structure())
