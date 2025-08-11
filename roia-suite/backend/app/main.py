from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
import os

from app.routers import transcript, jira, confluence

# Load environment variables
load_dotenv()

app = FastAPI(
    title="AI-Driven Project Management Suite API",
    description="Backend API for processing voice transcripts and creating Jira stories",
    version="1.0.0"
)

# Configure CORS for frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",  # Original React frontend
        "http://localhost:8006",  # Current React frontend port
        "https://localhost:8006",  # HTTPS React frontend
        "http://10.4.74.143:8006",  # VM IP HTTP
        "https://10.4.74.143:8006",  # VM IP HTTPS
        "*"  # Allow all origins for testing (remove in production)
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(transcript.router, prefix="/api/v1", tags=["transcript"])
app.include_router(jira.router, prefix="/api/v1/jira", tags=["jira"])
app.include_router(confluence.router, tags=["confluence"])

@app.get("/")
async def root():
    return {
        "message": "AI-Driven Project Management Suite API",
        "version": "1.0.0",
        "status": "operational",
        "endpoints": {
            "transcript_processing": "/api/v1/transcript/process",
            "jira_integration": "/api/v1/jira",
            "confluence_integration": "/api/v1/confluence",
            "health": "/health"
        }
    }

@app.get("/health")
async def health_check():
    return {
        "status": "healthy",
        "athenagpt_configured": bool(os.getenv("AGPT_API")),
        "jira_configured": bool(os.getenv("JIRA")),
        "confluence_configured": bool(os.getenv("CONFLUENCE_PAT"))
    }
