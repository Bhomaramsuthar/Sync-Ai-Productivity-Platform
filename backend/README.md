# AI Productivity Platform - Backend

This is the FastAPI backend for the AI Productivity Platform.

## Setup Instructions

1. **Create a virtual environment:**
   ```bash
   python -m venv venv
   ```

2. **Activate the virtual environment:**
   - Windows:
     ```bash
     venv\Scripts\activate
     ```
   - macOS/Linux:
     ```bash
     source venv/bin/activate
     ```

3. **Install dependencies:**
   ```bash
   pip install -r requirements.txt
   ```

4. **Environment Variables:**
   Copy `.env.example` to `.env` and fill in your Supabase PostgreSQL credentials and other secrets.
   ```bash
   cp .env.example .env
   ```

5. **Run Migrations:**
   Ensure your database URL is set in `.env`, then run:
   ```bash
   alembic upgrade head
   ```

6. **Run the Development Server:**
   ```bash
   uvicorn app.main:app --reload
   ```

The API will be available at `http://127.0.0.1:8000`. You can view the interactive API documentation at `http://127.0.0.1:8000/docs`.
