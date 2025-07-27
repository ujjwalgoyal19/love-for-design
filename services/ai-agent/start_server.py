#!/usr/bin/env python3
"""
Startup script for the FastAPI AI Agent Service
"""
import uvicorn
import os
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

if __name__ == "__main__":
    port = int(os.getenv("PORT", "3001"))
    host = os.getenv("HOST", "0.0.0.0")

    print(f"🚀 Starting AI Agent Service on {host}:{port}")
    print(f"📚 API Documentation: http://{host}:{port}/docs")
    print(f"🔍 Health Check: http://{host}:{port}/health")

    uvicorn.run("app:app", host=host, port=port, reload=True, log_level="info")
