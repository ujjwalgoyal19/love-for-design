#!/usr/bin/env python3
"""
Test FastAPI endpoints for specialized agents
"""

import asyncio
import json
from fastapi.testclient import TestClient
from app import app


def test_specialized_endpoints():
    """Test all specialized FastAPI endpoints"""
    print("Testing FastAPI specialized endpoints...")

    client = TestClient(app)

    # Test question generation endpoint
    print("\n1. Testing /agents/question-generation endpoint...")
    question_request = {
        "category": "distributed_systems",
        "previous_answers": {
            "What type of system?": "Social media platform",
            "Expected users?": "10 million DAU",
        },
        "question_type": "follow_up",
        "max_questions": 3,
    }

    response = client.post("/agents/question-generation", json=question_request)
    print(f"   Status: {response.status_code}")
    if response.status_code == 200:
        data = response.json()
        print(f"   ✓ Generated {len(data.get('questions', []))} questions")
        print(f"   ✓ Response keys: {list(data.keys())}")
    else:
        print(f"   ✗ Error: {response.text}")

    # Test design review endpoint
    print("\n2. Testing /agents/design-review endpoint...")
    design_request = {
        "design_data": {
            "architecture": "microservices",
            "components": ["user-service", "post-service", "notification-service"],
            "database": "PostgreSQL with Redis cache",
        },
        "review_focus": ["scalability", "reliability"],
        "detail_level": "standard",
    }

    response = client.post("/agents/design-review", json=design_request)
    print(f"   Status: {response.status_code}")
    if response.status_code == 200:
        data = response.json()
        print(f"   ✓ Review summary length: {len(data.get('review_summary', ''))}")
        print(f"   ✓ Feedback items: {len(data.get('detailed_feedback', []))}")
        print(f"   ✓ Response keys: {list(data.keys())}")
    else:
        print(f"   ✗ Error: {response.text}")

    # Test document generation endpoint
    print("\n3. Testing /agents/document-generation endpoint...")
    doc_request = {
        "design_session_data": {
            "requirements": ["Handle 10M users", "Real-time notifications"],
            "architecture": "Microservices with event-driven communication",
        },
        "template_type": "technical_spec",
        "sections": ["System Overview", "Architecture Design"],
    }

    response = client.post("/agents/document-generation", json=doc_request)
    print(f"   Status: {response.status_code}")
    if response.status_code == 200:
        data = response.json()
        print(f"   ✓ Document word count: {data.get('word_count', 0)}")
        print(f"   ✓ Sections generated: {len(data.get('sections_generated', []))}")
        print(f"   ✓ Response keys: {list(data.keys())}")
    else:
        print(f"   ✗ Error: {response.text}")

    # Test canvas suggestions endpoint
    print("\n4. Testing /agents/canvas-suggestions endpoint...")
    canvas_request = {
        "design_context": {
            "system_type": "social_media",
            "scale": "10M users",
            "key_features": ["posts", "comments", "notifications"],
        },
        "current_canvas_state": {"components": ["user-db", "post-service"]},
        "suggestion_type": "architecture",
        "complexity_level": "medium",
    }

    response = client.post("/agents/canvas-suggestions", json=canvas_request)
    print(f"   Status: {response.status_code}")
    if response.status_code == 200:
        data = response.json()
        print(f"   ✓ Suggestions count: {len(data.get('suggestions', []))}")
        print(f"   ✓ Diagram snippets: {len(data.get('diagram_snippets', []))}")
        print(f"   ✓ Response keys: {list(data.keys())}")
    else:
        print(f"   ✗ Error: {response.text}")

    # Test batch processing endpoint
    print("\n5. Testing /agents/batch-process endpoint...")
    batch_request = {
        "requests": [
            {
                "type": "question_generation",
                "data": {
                    "category": "web_systems",
                    "question_type": "initial",
                    "max_questions": 2,
                },
            },
            {
                "type": "canvas_suggestion",
                "data": {
                    "design_context": {"system_type": "e-commerce"},
                    "suggestion_type": "flow",
                },
            },
        ]
    }

    response = client.post("/agents/batch-process", json=batch_request)
    print(f"   Status: {response.status_code}")
    if response.status_code == 200:
        data = response.json()
        responses = data.get("responses", [])
        print(f"   ✓ Processed {len(responses)} requests")
        for i, resp in enumerate(responses):
            print(f"   ✓ Request {i+1} ({resp['type']}): Success={resp['success']}")
    else:
        print(f"   ✗ Error: {response.text}")

    # Test system endpoints
    print("\n6. Testing system endpoints...")

    # Health check
    response = client.get("/health")
    print(f"   Health check: {response.status_code}")

    # Capabilities
    response = client.get("/system/capabilities")
    print(f"   Capabilities: {response.status_code}")
    if response.status_code == 200:
        data = response.json()
        print(f"   ✓ Available capabilities: {data.get('capabilities', [])}")

    # Agents list
    response = client.get("/agents")
    print(f"   Agents list: {response.status_code}")
    if response.status_code == 200:
        data = response.json()
        print(f"   ✓ Total agents: {data.get('total', 0)}")

    print("\n✓ All FastAPI endpoint tests completed!")


if __name__ == "__main__":
    test_specialized_endpoints()
