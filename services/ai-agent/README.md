# AI Service

This folder contains a Python microservice built with FastAPI. It provides async endpoints for AI text generation using the OpenAI API with structured request/response models.

## Features

- **FastAPI**: Modern, fast web framework with automatic API documentation
- **Async/Await**: Full async support for better performance
- **Pydantic Models**: Structured request/response validation
- **OpenAI Integration**: Async OpenAI client for text generation
- **Health Checks**: Built-in health monitoring endpoint
- **Auto Documentation**: Interactive API docs at `/docs`

## Setup

1. Create and activate a virtual environment:

   ```bash
   python -m venv .venv
   source .venv/bin/activate  # On Windows: .venv\Scripts\activate
   ```

2. Install dependencies:

   ```bash
   pip install -r requirements.txt
   ```

3. Copy `.env.example` to `.env` and set your `OPENAI_API_KEY`.

## Usage

### Development Mode

Run the service locally with auto-reload:

```bash
python app.py
```

### Production Mode

Run with uvicorn directly:

```bash
uvicorn app:app --host 0.0.0.0 --port 3001
```

The server listens on the port specified in `.env` (default `3001`).

## API Endpoints

- **GET /health** - Health check endpoint
- **POST /generate** - Generate text using OpenAI API
- **GET /docs** - Interactive API documentation (Swagger UI)
- **GET /redoc** - Alternative API documentation

## API Usage Example

```bash
curl -X POST "http://localhost:3001/generate" \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "Explain microservices architecture",
    "model": "gpt-3.5-turbo",
    "max_tokens": 500,
    "temperature": 0.7
  }'
```
