"""
Confluence API Router for AI-Driven Project Management Suite
"""

import logging
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from ..services.confluence_service import ConfluenceService, ConfluencePage
from ..models import ClassifiedIntent, UserInfo

# Configure logging
logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/confluence", tags=["confluence"])

# Dependency to get ConfluenceService instance
def get_confluence_service() -> ConfluenceService:
    return ConfluenceService()

# Request/Response Models
class PageMatchRequest(BaseModel):
    classified_intent: ClassifiedIntent
    user_info: Optional[UserInfo] = None
    space_key: str = Field("ROIA", description="Confluence space key to search in")
    max_results: int = Field(3, description="Maximum number of matching pages to return")

class PageUpdateRequest(BaseModel):
    page_id: str
    content: str
    comment: str = Field("Updated via AI Project Management Suite", description="Version comment")
    append: bool = Field(True, description="Whether to append content or replace it")

class PageUpdateResponse(BaseModel):
    success: bool
    page_id: str
    page_url: str
    message: str

@router.get("/health")
async def health_check(confluence_service: ConfluenceService = Depends(get_confluence_service)):
    """
    Check the health of the Confluence connection.
    """
    try:
        health_status = confluence_service.health_check()
        return health_status
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Health check failed: {str(e)}")

@router.get("/pages", response_model=List[ConfluencePage])
async def get_pages(
    space_key: str = "ROIA",
    max_results: int = 50,
    confluence_service: ConfluenceService = Depends(get_confluence_service)
):
    """
    Get pages from a Confluence space.
    
    Args:
        space_key: The space key to retrieve pages from
        max_results: Maximum number of pages to return
    """
    try:
        pages = confluence_service.get_pages_from_space(space_key, max_results)
        return pages
    except Exception as e:
        logger.error(f"Error retrieving pages: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to retrieve pages: {str(e)}")

@router.post("/match-pages", response_model=List[ConfluencePage])
async def match_pages(
    request: PageMatchRequest,
    confluence_service: ConfluenceService = Depends(get_confluence_service)
):
    """
    Find Confluence pages that match the classified intent and user context.
    
    Args:
        request: PageMatchRequest containing classified intent and optional user info
    """
    try:
        # Log the received data for debugging
        logger.debug(f"Received match-pages request: {request}")
        
        # Ensure user_info is properly formatted
        user_info = None
        if request.user_info:
            try:
                user_info = request.user_info.model_dump()
            except Exception as e:
                logger.warning(f"Error converting user_info to dict: {e}")
                user_info = None
        
        # Find matching pages
        matching_pages = confluence_service.find_matching_pages(
            classified_intent=request.classified_intent,
            user_info=user_info,
            space_key=request.space_key,
            max_results=request.max_results
        )
        
        return matching_pages
    except ValueError as ve:
        raise HTTPException(status_code=422, detail=f"Validation error: {str(ve)}")
    except Exception as e:
        logger.error(f"Error matching pages: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to match pages: {str(e)}")

@router.post("/update-page", response_model=PageUpdateResponse)
async def update_page(
    request: PageUpdateRequest,
    confluence_service: ConfluenceService = Depends(get_confluence_service)
):
    """
    Update a Confluence page with new content.
    
    Args:
        request: PageUpdateRequest with page ID, content, and options
    """
    try:
        if request.append:
            # Append content to existing page
            success = confluence_service.append_to_page(
                page_id=request.page_id,
                additional_content=request.content,
                comment=request.comment
            )
        else:
            # Replace page content
            success = confluence_service.update_page_content(
                page_id=request.page_id,
                new_content=request.content,
                comment=request.comment
            )
        
        if success:
            # Construct page URL
            page_url = f"{confluence_service.confluence_base_url}/pages/viewpage.action?pageId={request.page_id}"
            
            return PageUpdateResponse(
                success=True,
                page_id=request.page_id,
                page_url=page_url,
                message="Page updated successfully"
            )
        else:
            raise HTTPException(status_code=500, detail="Failed to update page")
            
    except Exception as e:
        logger.error(f"Error updating page {request.page_id}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to update page: {str(e)}")

@router.get("/page/{page_id}", response_model=ConfluencePage)
async def get_page(
    page_id: str,
    confluence_service: ConfluenceService = Depends(get_confluence_service)
):
    """
    Get a specific Confluence page by ID.
    
    Args:
        page_id: The ID of the page to retrieve
    """
    try:
        # This is a simplified version - in practice, you'd want a dedicated method
        # For now, we'll search through all pages to find the one with matching ID
        pages = confluence_service.get_pages_from_space("ROIA", max_results=100)
        
        for page in pages:
            if page.page_id == page_id:
                return page
        
        raise HTTPException(status_code=404, detail=f"Page with ID {page_id} not found")
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error retrieving page {page_id}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to retrieve page: {str(e)}")


class CreatePageRequest(BaseModel):
    title: str = Field(..., description="Title of the page")
    content: str = Field(..., description="HTML content of the page")

class CreatePageResponse(BaseModel):
    page_id: str = Field(..., description="ID of the created page")
    page_url: str = Field(..., description="URL to access the created page")
    title: str = Field(..., description="Title of the created page")
    space_key: str = Field(..., description="Space key where the page was created")

@router.post("/create-page", response_model=CreatePageResponse)
async def create_page(
    request: CreatePageRequest,
    space_key: str = Query(..., description="Confluence space key"),
    parent_id: Optional[str] = Query(None, description="Optional parent page ID"),
    confluence_service: ConfluenceService = Depends(get_confluence_service)
):
    """
    Create a new Confluence page.
    
    Args:
        request: CreatePageRequest with title and content
        space_key: Confluence space key
        parent_id: Optional parent page ID
    """
    try:
        # Log the request for debugging
        logger.info(f"Creating Confluence page: {request.title} in space {space_key}")
        if parent_id:
            logger.info(f"With parent page ID: {parent_id}")
        
        # Create the page
        result = confluence_service.create_page(
            title=request.title,
            content=request.content,
            space_key=space_key,
            parent_id=parent_id
        )
        
        return CreatePageResponse(**result)
        
    except ValueError as ve:
        raise HTTPException(status_code=422, detail=str(ve))
    except Exception as e:
        logger.error(f"Error creating page: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to create page: {str(e)}")
