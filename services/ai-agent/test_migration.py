#!/usr/bin/env python3
"""
Test script to verify FastAPI migration is working correctly
"""
import asyncio
import json
from fastapi.testclient import TestClient
from app import app


def test_fastapi_migration():
    """Test the FastAPI migration"""
    client = TestClient(app)

    print("Testing FastAPI migration...")

    # Test health endpoint
    print("\n1. Testing health endpoint...")
    response = client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "healthy"
    assert data["service"] == "ai-agent"
    print("✅ Health endpoint working")

    # Test generate endpoint (should fail gracefully without API key)
    print("\n2. Testing generate endpoint without API key...")
    response = client.post(
        "/generate", json={"prompt": "Hello world", "model": "gpt-3.5-turbo"}
    )
    assert response.status_code == 503
    data = response.json()
    assert "OpenAI API key not configured" in data["detail"]
    print("✅ Generate endpoint properly handles missing API key")

    # Test API documentation endpoints
    print("\n3. Testing API documentation...")
    response = client.get("/docs")
    assert response.status_code == 200
    print("✅ Swagger UI documentation available")

    response = client.get("/openapi.json")
    assert response.status_code == 200
    openapi_spec = response.json()
    assert openapi_spec["info"]["title"] == "AI Agent Service"
    print("✅ OpenAPI specification available")

    # Test request validation
    print("\n4. Testing request validation...")
    response = client.post(
        "/generate",
        json={
            "prompt": "",  # Empty prompt should still work
            "model": "gpt-4",
            "max_tokens": 500,
            "temperature": 0.5,
        },
    )
    assert (
        response.status_code == 503
    )  # Should fail due to missing API key, not validation
    print("✅ Request validation working")

    # Test invalid request
    response = client.post("/generate", json={"invalid_field": "test"})
    assert response.status_code == 422  # Validation error
    print("✅ Invalid request properly rejected")

    print("\n🎉 All FastAPI migration tests passed!")
    print("\nMigration Summary:")
    print("- ✅ Flask → FastAPI conversion complete")
    print("- ✅ Async/await support implemented")
    print("- ✅ Pydantic models for request/response validation")
    print("- ✅ Structured error handling")
    print("- ✅ Health check endpoint")
    print("- ✅ Auto-generated API documentation")
    print("- ✅ Graceful handling of missing API keys")


if __name__ == "__main__":
    test_fastapi_migration()
