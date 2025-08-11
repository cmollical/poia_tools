import time
from datetime import datetime
from fastapi import APIRouter, HTTPException, Depends
from fastapi.responses import FileResponse
from typing import Optional
import os

from app.models import (
    TranscriptRequest, 
    ProcessTranscriptResponse, 
    ClassifiedIntent, 
    EpicMatch,
    ErrorResponse
)
from app.services.llm import LLMService
from app.services.athena_gpt import AthenaGPTService
from app.services.excel_export import ExcelExportService

router = APIRouter()

def get_llm_service():
    """Dependency to get LLM service instance.
    
    Returns an instance of LLMService which uses athenaGPT for AI processing.
    """
    return LLMService()

def get_excel_service() -> ExcelExportService:
    """Dependency to get Excel export service instance."""
    return ExcelExportService()

@router.post("/transcript/process", response_model=ProcessTranscriptResponse)
async def process_transcript(
    request: TranscriptRequest,
    llm_service: LLMService = Depends(get_llm_service),
    excel_service: ExcelExportService = Depends(get_excel_service)
):
    """
    Process a voice transcript and extract structured project management data.
    
    This endpoint:
    1. Cleans and normalizes the transcript
    2. Uses LLM to classify intent and extract structured data
    3. Attempts to match to existing epics (placeholder for now)
    4. Returns structured data ready for Jira integration
    """
    start_time = time.time()
    
    try:
        # Validate input
        if not request.transcript or not request.transcript.strip():
            raise HTTPException(
                status_code=400, 
                detail="Transcript cannot be empty"
            )
        
        # Step 1: Clean the transcript
        cleaned_transcript = llm_service.clean_transcript(request.transcript)
        
        # Step 2: Classify intent using LLM
        classified_intent = llm_service.classify_intent(cleaned_transcript)
        
        # Step 3: Find epic matches (placeholder implementation)
        # TODO: Replace with actual Jira API integration
        mock_epics = [
            {"id": "EPIC-1", "name": "User Authentication", "description": "Login and user management features"},
            {"id": "EPIC-2", "name": "Dashboard", "description": "Main dashboard and reporting"},
            {"id": "EPIC-3", "name": "API Integration", "description": "Third-party API connections"},
        ]
        
        epic_match_data = llm_service.find_epic_matches(
            classified_intent.epic_keywords, 
            mock_epics
        )
        
        epic_match = EpicMatch(
            epic_id=epic_match_data.get("epic_id"),
            epic_name=epic_match_data.get("epic_name"),
            match_confidence=epic_match_data.get("match_confidence", 0.0),
            keywords_matched=epic_match_data.get("keywords_matched", [])
        )
        
        # Calculate processing time
        processing_time_ms = int((time.time() - start_time) * 1000)
        
        # Export to Excel
        excel_result = excel_service.export_story(
            classified_intent=classified_intent,
            epic_match=epic_match,
            cleaned_transcript=cleaned_transcript,
            original_transcript=request.transcript,
            processing_time_ms=processing_time_ms
        )
        
        # Add Excel export information to response
        response = ProcessTranscriptResponse(
            success=True,
            classified_intent=classified_intent,
            epic_match=epic_match,
            cleaned_transcript=cleaned_transcript,
            processing_time_ms=processing_time_ms,
            error_message=None
        )
        
        # Add Excel export status to the response (we'll extend the model for this)
        print(f"Excel export result: {excel_result}")
        
        return response
        
    except HTTPException:
        raise
    except Exception as e:
        processing_time_ms = int((time.time() - start_time) * 1000)
        
        # Log the error (in production, use proper logging)
        print(f"Error processing transcript: {str(e)}")
        
        return ProcessTranscriptResponse(
            success=False,
            classified_intent=None,
            epic_match=None,
            cleaned_transcript=request.transcript,
            processing_time_ms=processing_time_ms,
            error_message=f"Processing failed: {str(e)}"
        )

@router.get("/transcript/health")
async def transcript_health_check():
    """Health check endpoint for transcript processing service."""
    try:
        llm_service = LLMService()
        
        # Test basic functionality
        test_transcript = "This is a test transcript for health checking."
        cleaned = llm_service.clean_transcript(test_transcript)
        
        # Test athenaGPT connection
        llm_available = bool(os.getenv("AGPT_API"))
        
        return {
            "status": "healthy",
            "service": "transcript_processing",
            "timestamp": datetime.now().isoformat(),
            "test_cleaning": {
                "original": test_transcript,
                "cleaned": cleaned,
                "success": len(cleaned) > 0
            },
            "llm_available": llm_available,
            "athenaGPT_configured": llm_available
        }
    except Exception as e:
        return {
            "status": "unhealthy",
            "service": "transcript_processing", 
            "timestamp": datetime.now().isoformat(),
            "error": str(e),
            "llm_available": False
        }

@router.post("/transcript/clean")
async def clean_transcript_only(
    request: TranscriptRequest,
    llm_service: LLMService = Depends(get_llm_service)
):
    """
    Clean and normalize transcript text only (without LLM processing).
    Useful for testing and debugging.
    """
    try:
        if not request.transcript or not request.transcript.strip():
            raise HTTPException(
                status_code=400,
                detail="Transcript cannot be empty"
            )
        
        cleaned = llm_service.clean_transcript(request.transcript)
        
        return {
            "success": True,
            "original": request.transcript,
            "cleaned": cleaned,
            "word_count_original": len(request.transcript.split()),
            "word_count_cleaned": len(cleaned.split()),
            "reduction_percent": round(
                (1 - len(cleaned.split()) / len(request.transcript.split())) * 100, 2
            ) if request.transcript.split() else 0
        }
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Cleaning failed: {str(e)}"
        )

@router.get("/excel/download")
async def download_excel_file(
    excel_service: ExcelExportService = Depends(get_excel_service)
):
    """
    Download the Excel file containing all exported stories.
    """
    try:
        excel_path = excel_service.get_excel_file_path()
        
        if not os.path.exists(excel_path):
            raise HTTPException(
                status_code=404,
                detail="Excel file not found. No stories have been exported yet."
            )
        
        return FileResponse(
            path=excel_path,
            filename="project_stories.xlsx",
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        )
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to download Excel file: {str(e)}"
        )

@router.get("/excel/summary")
async def get_excel_summary(
    excel_service: ExcelExportService = Depends(get_excel_service)
):
    """
    Get summary information about the exported Excel file.
    """
    try:
        summary = excel_service.get_export_summary()
        return {
            "success": True,
            "summary": summary,
            "message": f"Excel file contains {summary['total_stories']} stories"
        }
        
    except Exception as e:
        return {
            "success": False,
            "summary": None,
            "error": str(e),
            "message": f"Failed to get Excel summary: {str(e)}"
        }
