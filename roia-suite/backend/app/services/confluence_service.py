"""
Confluence Service for AI-Driven Project Management Suite

This service implements integration with Confluence API for retrieving pages,
matching content, and updating pages based on AI-processed transcripts.
"""

import os
import logging
import re
import requests
import urllib3
from typing import Dict, Any, List, Optional
from datetime import datetime
from pydantic import BaseModel
import json

# Configure logging
logger = logging.getLogger(__name__)

# Configure SSL warnings
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

class ConfluencePage(BaseModel):
    """Model representing a Confluence page."""
    page_id: str
    page_title: str
    page_url: str
    space_key: str
    space_name: str
    page_content: Optional[str] = None
    last_modified: Optional[str] = None
    author: Optional[str] = None
    version: int = 1
    match_score: float = 0.0
    content_excerpt: Optional[str] = None

class ConfluenceService:
    """Service for interacting with Confluence API."""
    
    def __init__(self):
        """Initialize the Confluence service client."""
        self.confluence_token = os.environ.get("CONFLUENCE_PAT")
        self.confluence_base_url = os.environ.get("CONFLUENCE_BASE_URL", "https://athenaconfluence.athenahealth.com")
        self.api_base_url = f"{self.confluence_base_url}/rest/api"
        
        # Configure session for API calls
        self.session = requests.Session()
        if self.confluence_token:
            self.session.headers.update({
                'Authorization': f'Bearer {self.confluence_token}',
                'Content-Type': 'application/json'
            })
        
        # SSL verification
        verify_ssl = os.environ.get("CONFLUENCE_VERIFY_SSL", "false").lower() == "true"
        self.session.verify = verify_ssl
        
        logger.info("Confluence service initialized")
    
    def health_check(self) -> Dict[str, Any]:
        """
        Check the health of the Confluence connection.
        
        Returns:
            Dictionary with health status information
        """
        try:
            if not self.confluence_token:
                return {
                    "connected": False,
                    "error": "No Confluence token configured",
                    "token_configured": False,
                    "server_configured": bool(self.confluence_base_url)
                }
            
            # Test connection with a simple API call
            response = self.session.get(f"{self.api_base_url}/space")
            
            if response.status_code == 200:
                spaces_data = response.json()
                return {
                    "connected": True,
                    "server_info": {
                        "base_url": self.confluence_base_url,
                        "spaces_found": len(spaces_data.get('results', []))
                    },
                    "token_configured": True,
                    "server_configured": True
                }
            else:
                return {
                    "connected": False,
                    "error": f"HTTP {response.status_code}: {response.text}",
                    "token_configured": True,
                    "server_configured": True
                }
                
        except Exception as e:
            logger.error(f"Error checking Confluence health: {e}")
            return {
                "connected": False,
                "error": str(e),
                "token_configured": bool(self.confluence_token),
                "server_configured": bool(self.confluence_base_url)
            }
    
    def get_pages_from_space(self, space_key: str = "ROIA", max_results: int = 50) -> List[ConfluencePage]:
        """
        Retrieve pages from a specific Confluence space.
        
        Args:
            space_key: The space key to retrieve pages from (defaults to ROIA)
            max_results: Maximum number of pages to return
            
        Returns:
            List of ConfluencePage objects
        """
        try:
            if not self.confluence_token:
                raise ValueError("Confluence token not configured")
            
            pages = []
            start = 0
            limit = min(25, max_results)  # API limit is usually 25 per request
            
            while len(pages) < max_results:
                # Get pages with content expansion
                response = self.session.get(
                    f"{self.api_base_url}/content",
                    params={
                        'spaceKey': space_key,
                        'type': 'page',
                        'status': 'current',
                        'expand': 'space,version,body.storage',
                        'start': start,
                        'limit': limit
                    }
                )
                
                if response.status_code != 200:
                    logger.error(f"Error fetching pages: HTTP {response.status_code}")
                    break
                
                data = response.json()
                results = data.get('results', [])
                
                if not results:
                    break
                
                for page_data in results:
                    try:
                        # Extract page content (HTML)
                        content = ""
                        if 'body' in page_data and 'storage' in page_data['body']:
                            content = page_data['body']['storage']['value']
                        
                        # Create content excerpt (first 200 chars of text)
                        excerpt = self._extract_text_excerpt(content, 200)
                        
                        page = ConfluencePage(
                            page_id=page_data['id'],
                            page_title=page_data['title'],
                            page_url=f"{self.confluence_base_url}/pages/viewpage.action?pageId={page_data['id']}",
                            space_key=page_data['space']['key'],
                            space_name=page_data['space']['name'],
                            page_content=content,
                            last_modified=page_data['version']['when'],
                            author=page_data['version']['by']['displayName'] if 'by' in page_data['version'] else None,
                            version=page_data['version']['number'],
                            content_excerpt=excerpt
                        )
                        
                        pages.append(page)
                        
                        if len(pages) >= max_results:
                            break
                            
                    except Exception as page_error:
                        logger.warning(f"Error processing page {page_data.get('id', 'unknown')}: {page_error}")
                        continue
                
                # Check if there are more pages
                if len(results) < limit:
                    break
                    
                start += limit
            
            logger.info(f"Retrieved {len(pages)} pages from space {space_key}")
            return pages
            
        except Exception as e:
            logger.error(f"Error retrieving pages from space {space_key}: {e}")
            return []
    
    def get_page_by_id(self, page_id: str) -> Optional[Dict[str, Any]]:
        """
        Retrieve a specific Confluence page by its ID.
        
        Args:
            page_id: The ID of the page to retrieve
            
        Returns:
            Dictionary with page data, or None if not found
        """
        try:
            if not self.confluence_token:
                raise ValueError("Confluence token not configured")
            
            # Get page with content expansion
            response = self.session.get(
                f"{self.api_base_url}/content/{page_id}",
                params={
                    'expand': 'space,version,body.storage'
                }
            )
            
            if response.status_code == 200:
                page_data = response.json()
                logger.info(f"Successfully retrieved page {page_id}: {page_data.get('title', 'Unknown')}")
                return page_data
            else:
                logger.error(f"Error retrieving page {page_id}: HTTP {response.status_code}")
                return None
                
        except Exception as e:
            logger.error(f"Error retrieving page {page_id}: {e}")
            return None
    
    def create_page(self, title: str, content: str, space_key: str, parent_id: Optional[str] = None) -> Dict[str, Any]:
        """
        Create a new Confluence page.
        
        Args:
            title: Title of the page
            content: HTML content of the page
            space_key: Space key where the page will be created
            parent_id: Optional parent page ID
            
        Returns:
            Dictionary with page ID and URL
        """
        try:
            if not self.confluence_token:
                raise ValueError("Confluence token not configured")
            
            # Prepare page data
            page_data = {
                "type": "page",
                "title": title,
                "space": {"key": space_key},
                "body": {
                    "storage": {
                        "value": content,
                        "representation": "storage"
                    }
                }
            }
            
            # Add parent page reference if provided
            if parent_id:
                page_data["ancestors"] = [{"id": parent_id}]
            
            # Create the page
            response = self.session.post(
                f"{self.api_base_url}/content",
                json=page_data
            )
            
            if response.status_code not in (200, 201):
                logger.error(f"Error creating page: HTTP {response.status_code}: {response.text}")
                raise ValueError(f"Failed to create page: HTTP {response.status_code}")
            
            # Parse response
            result = response.json()
            page_id = result.get('id')
            page_url = f"{self.confluence_base_url}/pages/viewpage.action?pageId={page_id}"
            
            logger.info(f"Created Confluence page: {title} (ID: {page_id})")
            
            return {
                "page_id": page_id,
                "page_url": page_url,
                "title": title,
                "space_key": space_key
            }
            
        except Exception as e:
            logger.error(f"Error creating Confluence page: {e}")
            raise
    
    def find_matching_pages(self, classified_intent, user_info: Optional[Dict[str, Any]] = None, 
                           space_key: str = "ROIA", max_results: int = 3) -> List[ConfluencePage]:
        """
        Find Confluence pages that best match the classified intent and user context.
        
        Args:
            classified_intent: The classified intent object
            user_info: Optional user information to improve matching
            space_key: Confluence space to search in
            max_results: Maximum number of pages to return
            
        Returns:
            List of matching ConfluencePage objects with match_score populated
        """
        try:
            # Get all pages from the space
            all_pages = self.get_pages_from_space(space_key, max_results=100)
            
            if not all_pages:
                logger.warning(f"No pages found in space {space_key}")
                return []
            
            # Extract keywords from the intent
            keywords = []
            if hasattr(classified_intent, 'epic_keywords') and classified_intent.epic_keywords:
                keywords.extend(classified_intent.epic_keywords)
            if hasattr(classified_intent, 'summary') and classified_intent.summary:
                keywords.extend(self._extract_keywords(classified_intent.summary))
            if hasattr(classified_intent, 'description') and classified_intent.description:
                keywords.extend(self._extract_keywords(classified_intent.description))
            
            # Remove duplicates and empty keywords
            keywords = list(set([k.strip().lower() for k in keywords if k.strip()]))
            
            logger.info(f"Matching pages with keywords: {keywords}")
            
            # Score each page based on relevance
            scored_pages = []
            for page in all_pages:
                score = self._calculate_page_match_score(page, keywords, classified_intent, user_info)
                if score > 0:  # Only include pages with some relevance
                    page_copy = page.model_copy()
                    page_copy.match_score = score
                    scored_pages.append(page_copy)
            
            # Sort by score and return top matches
            scored_pages.sort(key=lambda x: x.match_score, reverse=True)
            top_matches = scored_pages[:max_results]
            
            logger.info(f"Found {len(top_matches)} matching pages with scores: {[p.match_score for p in top_matches]}")
            return top_matches
            
        except Exception as e:
            logger.error(f"Error finding matching pages: {e}")
            return []
    
    def update_page_content(self, page_id: str, new_content: str, comment: str = "Updated via AI Project Management Suite") -> bool:
        """
        Update the content of a Confluence page.
        
        Args:
            page_id: The ID of the page to update
            new_content: The new content in Confluence storage format (HTML)
            comment: Version comment for the update
            
        Returns:
            True if successful, False otherwise
        """
        try:
            if not self.confluence_token:
                raise ValueError("Confluence token not configured")
            
            # First, get the current page to get the current version
            response = self.session.get(
                f"{self.api_base_url}/content/{page_id}",
                params={'expand': 'version,space'}
            )
            
            if response.status_code != 200:
                logger.error(f"Error getting page {page_id}: HTTP {response.status_code}")
                return False
            
            current_page = response.json()
            current_version = current_page['version']['number']
            page_title = current_page['title']
            space_key = current_page['space']['key']
            
            # Prepare the update payload
            update_data = {
                "version": {
                    "number": current_version + 1,
                    "message": comment
                },
                "title": page_title,
                "type": "page",
                "space": {
                    "key": space_key
                },
                "body": {
                    "storage": {
                        "value": new_content,
                        "representation": "storage"
                    }
                }
            }
            
            # Update the page
            response = self.session.put(
                f"{self.api_base_url}/content/{page_id}",
                json=update_data
            )
            
            if response.status_code == 200:
                logger.info(f"Successfully updated page {page_id}")
                return True
            else:
                logger.error(f"Error updating page {page_id}: HTTP {response.status_code} - {response.text}")
                return False
                
        except Exception as e:
            logger.error(f"Error updating page {page_id}: {e}")
            return False
    
    def append_to_page(self, page_id: str, additional_content: str, 
                      comment: str = "Added content via AI Project Management Suite") -> bool:
        """
        Append content to an existing Confluence page.
        
        Args:
            page_id: The ID of the page to update
            additional_content: Content to append (in HTML format)
            comment: Version comment for the update
            
        Returns:
            True if successful, False otherwise
        """
        try:
            # Get current page content
            response = self.session.get(
                f"{self.api_base_url}/content/{page_id}",
                params={'expand': 'body.storage,version,space'}
            )
            
            if response.status_code != 200:
                logger.error(f"Error getting page {page_id}: HTTP {response.status_code}")
                return False
            
            current_page = response.json()
            current_content = current_page['body']['storage']['value']
            
            # Format the additional content nicely
            formatted_content = self._format_update_content(additional_content)
            
            # Append the new content
            new_content = current_content + "\n\n" + formatted_content
            
            # Update the page
            return self.update_page_content(page_id, new_content, comment)
            
        except Exception as e:
            logger.error(f"Error appending to page {page_id}: {e}")
            return False
    
    def _extract_keywords(self, text: str) -> List[str]:
        """
        Extract keywords from text by removing common words.
        
        Args:
            text: The text to extract keywords from
            
        Returns:
            List of keywords
        """
        if not text:
            return []
        
        # Common words to filter out
        stop_words = {
            'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with',
            'by', 'is', 'are', 'was', 'were', 'be', 'been', 'have', 'has', 'had', 'do', 'does',
            'did', 'will', 'would', 'could', 'should', 'may', 'might', 'can', 'this', 'that',
            'these', 'those', 'i', 'you', 'he', 'she', 'it', 'we', 'they', 'me', 'him', 'her',
            'us', 'them', 'my', 'your', 'his', 'her', 'its', 'our', 'their'
        }
        
        # Extract words (alphanumeric only)
        words = re.findall(r'\b[a-zA-Z0-9]+\b', text.lower())
        
        # Filter out stop words and short words
        keywords = [word for word in words if len(word) > 2 and word not in stop_words]
        
        return keywords
    
    def _extract_text_excerpt(self, html_content: str, max_length: int = 200) -> str:
        """
        Extract plain text excerpt from HTML content.
        
        Args:
            html_content: HTML content to extract text from
            max_length: Maximum length of the excerpt
            
        Returns:
            Plain text excerpt
        """
        try:
            if not html_content:
                return ""
            
            # Use BeautifulSoup to extract text
            soup = BeautifulSoup(html_content, 'html.parser')
            text = soup.get_text(separator=' ', strip=True)
            
            # Truncate to max_length
            if len(text) > max_length:
                text = text[:max_length] + "..."
                
            return text
        except Exception as e:
            logger.warning(f"Error extracting text excerpt: {e}")
            return html_content[:max_length] if html_content else ""
    
    def _calculate_page_match_score(self, page: ConfluencePage, keywords: List[str], 
                                   classified_intent, user_info: Optional[Dict[str, Any]]) -> float:
        """
        Calculate a match score between a page and the classified intent.
        
        Args:
            page: The ConfluencePage to score
            keywords: List of keywords from the intent
            classified_intent: The classified intent object
            user_info: Optional user information for context-based matching
            
        Returns:
            Match score between 0 and 1
        """
        score = 0.0
        
        if not keywords:
            return score
        
        # 1. Title matching (highest weight)
        title_text = page.page_title.lower()
        title_matches = sum(1 for keyword in keywords if keyword in title_text)
        if title_matches > 0:
            score += 0.4 * (title_matches / len(keywords))
        
        # 2. Content matching (medium weight)
        if page.content_excerpt:
            content_text = page.content_excerpt.lower()
            content_matches = sum(1 for keyword in keywords if keyword in content_text)
            if content_matches > 0:
                score += 0.3 * (content_matches / len(keywords))
        
        # 3. Recent activity bonus (pages modified recently)
        if page.last_modified:
            try:
                modified_date = datetime.fromisoformat(page.last_modified.replace('Z', '+00:00'))
                days_diff = (datetime.now() - modified_date).days
                if days_diff <= 30:  # Modified in last 30 days
                    score += 0.1
                elif days_diff <= 90:  # Modified in last 90 days
                    score += 0.05
            except Exception:
                pass
        
        # 4. User context matching
        if user_info and page.author:
            if user_info.get('display_name') and user_info['display_name'] in page.author:
                score += 0.2  # Boost if user is the author
        
        return min(1.0, score)
    
    def format_content_update(self, summary: str, description: str, 
                            acceptance_criteria: List[str] = None, priority: str = "medium") -> str:
        """
        Format structured content update for Confluence with nice styling.
        
        Args:
            summary: The summary/title of the update
            description: The detailed description
            acceptance_criteria: List of acceptance criteria (optional)
            priority: Priority level (optional)
            
        Returns:
            Formatted HTML content for Confluence
        """
        timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        
        # Build the formatted content
        formatted = f"""
<hr/>
<h3>🔄 Project Update - {timestamp}</h3>
<div class="panel" style="border-color: #4A90E2; border-width: 1px;">
<div class="panelContent">
<p><strong>Summary:</strong> {summary}</p>
<p><strong>Description:</strong> {description}</p>
<p><strong>Priority:</strong> {priority}</p>
"""
        
        # Add acceptance criteria if provided
        if acceptance_criteria:
            formatted += "<h4>Acceptance Criteria:</h4>\n<ul>\n"
            for criteria in acceptance_criteria:
                formatted += f"<li>{criteria}</li>\n"
            formatted += "</ul>\n"
        
        formatted += """
</div>
</div>
<p><em>Generated by AI-Driven Project Management Suite</em></p>
"""
        return formatted
    
    def _format_update_content(self, content: str) -> str:
        """
        Format update content for Confluence with nice styling.
        
        Args:
            content: Raw content to format
            
        Returns:
            Formatted HTML content for Confluence
        """
        timestamp = datetime.now().strftime("%Y-%m-%d %H:%M")
        
        formatted = f"""
<hr/>
<h3>🔄 Project Update - {timestamp}</h3>
<div class="panel" style="border-color: #4A90E2; border-width: 1px;">
<div class="panelContent">
<p>{content}</p>
</div>
</div>
<p><em>Updated via AI Project Management Suite</em></p>
"""
        return formatted
