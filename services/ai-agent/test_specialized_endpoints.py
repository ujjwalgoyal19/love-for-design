#!/usr/bin/env python3
"""
Test script for specialized agent endpoints
"""

import asyncio
import json
from multi_agent_service import MultiAgentService


async def test_specialized_capabilities():
    """Test all specialized capabilities"""
    print("Testing specialized agent capabilities...")

    # Initialize service
    service = MultiAgentService()

    # Test question generation
    print("\n1. Testing Question Generation...")
    try:
        response = await service.process_request(
            capability="question_generation",
            data={
                "category": "distributed_systems",
                "previous_answers": {
                    "What type of system are you designing?": "A social media platform",
                    "How many users do you expect?": "10 million daily active users",
                },
                "question_type": "follow_up",
                "max_questions": 3,
            },
            context={"system_context": "System design interview context"},
        )
        print(f"✓ Question Generation: Success={response.success}")
        if response.success:
            result = response.result
            print(f"  Generated {len(result.get('questions', []))} questions")
        else:
            print(f"  Error: {response.error}")
    except Exception as e:
        print(f"✗ Question Generation failed: {e}")

    # Test design review
    print("\n2. Testing Design Review...")
    try:
        response = await service.process_request(
            capability="design_review",
            data={
                "design_data": {
                    "architecture": "microservices",
                    "components": [
                        "user-service",
                        "post-service",
                        "notification-service",
                    ],
                    "database": "PostgreSQL with Redis cache",
                    "load_balancer": "nginx",
                },
                "review_focus": ["scalability", "reliability"],
                "detail_level": "standard",
            },
        )
        print(f"✓ Design Review: Success={response.success}")
        if response.success:
            result = response.result
            print(
                f"  Generated review with {len(result.get('detailed_feedback', []))} feedback items"
            )
        else:
            print(f"  Error: {response.error}")
    except Exception as e:
        print(f"✗ Design Review failed: {e}")

    # Test document generation
    print("\n3. Testing Document Generation...")
    try:
        response = await service.process_request(
            capability="document_generation",
            data={
                "design_session_data": {
                    "requirements": ["Handle 10M users", "Real-time notifications"],
                    "architecture": "Microservices with event-driven communication",
                    "components": ["API Gateway", "User Service", "Post Service"],
                },
                "template_type": "technical_spec",
                "sections": [
                    "System Overview",
                    "Architecture Design",
                    "Component Specifications",
                ],
            },
        )
        print(f"✓ Document Generation: Success={response.success}")
        if response.success:
            result = response.result
            print(f"  Generated document with {result.get('word_count', 0)} words")
        else:
            print(f"  Error: {response.error}")
    except Exception as e:
        print(f"✗ Document Generation failed: {e}")

    # Test canvas suggestions
    print("\n4. Testing Canvas Suggestions...")
    try:
        response = await service.process_request(
            capability="canvas_suggestion",
            data={
                "design_context": {
                    "system_type": "social_media",
                    "scale": "10M users",
                    "key_features": ["posts", "comments", "notifications"],
                },
                "current_canvas_state": {"components": ["user-db", "post-service"]},
                "suggestion_type": "architecture",
                "complexity_level": "medium",
            },
        )
        print(f"✓ Canvas Suggestions: Success={response.success}")
        if response.success:
            result = response.result
            print(f"  Generated {len(result.get('suggestions', []))} suggestions")
        else:
            print(f"  Error: {response.error}")
    except Exception as e:
        print(f"✗ Canvas Suggestions failed: {e}")

    print("\n✓ All specialized capability tests completed!")


if __name__ == "__main__":
    asyncio.run(test_specialized_capabilities())
