# AI Service

This folder contains a simple Python microservice built with Flask. It exposes an endpoint for generating text using the OpenAI API.

## Setup

1. Create and activate a virtual environment:
   ```bash
   python -m venv .venv
   source .venv/bin/activate
   ```
2. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```
3. Copy `.env.example` to `.env` and set your `OPENAI_API_KEY`.

## Usage

Run the service locally with:

```bash
python app.py
```

The server listens on the port specified in `.env` (default `3001`).

