"""
Simple test for the multi-agent system
"""

import asyncio
import os
from multi_agent_service import MultiAgentService


async def test_multi_agent_system():
    """Test the multi-agent system functionality"""
    print("Testing Multi-Agent System...")

    # Initialize service
    service = MultiAgentService()

    # Add a test agent
    success = service.add_agent(
        agent_id="test_agent_1",
        name="Test Agent",
        description="Test agent for validation",
        agent_type="openai",
        capabilities=["question_generation", "design_review"],
        config={"model": "gpt-3.5-turbo", "temperature": 0.7, "max_tokens": 500},
        priority=5,
    )

    print(f"Agent added: {success}")

    # Get system status
    status = service.get_system_status()
    print(f"Total agents: {status['registry']['total_agents']}")
    print(f"Active agents: {status['registry']['active_agents']}")
    print(f"Capabilities: {status['capabilities']}")

    # Test validation
    validation = service.validate_system()
    print(f"System valid: {validation['is_valid']}")
    if not validation["is_valid"]:
        print(f"Issues: {validation}")

    # Test health check
    health = await service.health_check()
    print(f"Overall health: {health['overall_health']}")

    # Test a simple request (only if OpenAI key is available)
    if os.getenv("OPENAI_API_KEY"):
        print("\nTesting agent request...")
        try:
            response = await service.process_request(
                capability="question_generation",
                data={
                    "category": "database",
                    "previous_answers": [
                        {
                            "question": "What type of system are you designing?",
                            "answer": "A social media platform",
                        }
                    ],
                },
                timeout=10,
            )

            print(f"Request success: {response.success}")
            print(f"Agent used: {response.agent_used}")
            print(f"Execution time: {response.execution_time:.2f}s")
            if response.success:
                print(f"Result keys: {list(response.result.keys())}")
            else:
                print(f"Error: {response.error}")

        except Exception as e:
            print(f"Request failed: {str(e)}")
    else:
        print("Skipping agent request test - no OpenAI API key")

    print("\nTest completed!")


if __name__ == "__main__":
    asyncio.run(test_multi_agent_system())
