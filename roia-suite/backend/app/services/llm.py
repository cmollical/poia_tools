import os
import re
import time
from typing import List, Dict, Any
from app.models import ClassifiedIntent, IssueType, Priority
from app.chat_agent import ChatAgent

class LLMService:
    def __init__(self):
        self.system_message = """You are an AI assistant that analyzes project management updates and classifies them into structured Jira issues.

Analyze the given transcript and extract:
1. Issue type (story, bug, task, epic, comment)
2. Brief summary (1 line)
3. Detailed description
4. Acceptance criteria (as a list)
5. Priority (low, medium, high, critical)
6. Epic keywords (words that might help match to existing epics)

Guidelines:
- "Story" = new feature or user functionality
- "Bug" = something broken that needs fixing
- "Task" = general work item or improvement
- "Epic" = large initiative spanning multiple stories
- "Comment" = status update or general information

Return your response as valid JSON with the following structure:
{
    "type": "story|bug|task|epic|comment",
    "summary": "Brief one-line summary",
    "description": "Detailed description with context",
    "acceptance_criteria": ["criterion 1", "criterion 2"],
    "priority": "low|medium|high|critical",
    "epic_keywords": ["keyword1", "keyword2"],
    "confidence": 0.95
}"""
        self.chat_agent = ChatAgent(system_message=self.system_message)
    
    def clean_transcript(self, transcript: str) -> str:
        """Clean and normalize transcript text."""
        # Remove common filler words and normalize text
        filler_words = [
            r'\buh+\b', r'\bum+\b', r'\ber+\b', r'\bah+\b', r'\blike\b', 
            r'\byou know\b', r'\bactually\b', r'\bbasically\b', r'\bso\b',
            r'\bwell\b', r'\bokay\b', r'\bright\b'
        ]
        
        cleaned = transcript.lower()
        
        # Remove filler words
        for pattern in filler_words:
            cleaned = re.sub(pattern, '', cleaned, flags=re.IGNORECASE)
        
        # Clean up extra spaces and punctuation
        cleaned = re.sub(r'\s+', ' ', cleaned)  # Multiple spaces to single
        cleaned = re.sub(r'[,]{2,}', ',', cleaned)  # Multiple commas
        cleaned = re.sub(r'[.]{2,}', '.', cleaned)  # Multiple periods
        cleaned = cleaned.strip()
        
        # Capitalize first letter of sentences
        sentences = cleaned.split('.')
        cleaned_sentences = []
        for sentence in sentences:
            sentence = sentence.strip()
            if sentence:
                sentence = sentence[0].upper() + sentence[1:] if len(sentence) > 1 else sentence.upper()
                cleaned_sentences.append(sentence)
        
        return '. '.join(cleaned_sentences) if cleaned_sentences else transcript

    def classify_intent(self, cleaned_transcript: str) -> ClassifiedIntent:
        """Use athenaGPT to classify transcript intent and extract structured data."""
        
        user_prompt = f"Analyze this project update transcript:\n\n{cleaned_transcript}"

        try:
            # Use the ChatAgent to process the transcript
            content = self.chat_agent.send_message(user_prompt)
            
            # Extract JSON from the response (in case there's extra text)
            import json
            try:
                # Try to find JSON in the response
                json_start = content.find('{')
                json_end = content.rfind('}') + 1
                if json_start != -1 and json_end != -1:
                    json_str = content[json_start:json_end]
                    parsed_data = json.loads(json_str)
                else:
                    # Fallback parsing
                    parsed_data = json.loads(content)
                
                return ClassifiedIntent(
                    type=IssueType(parsed_data.get("type", "task")),
                    summary=parsed_data.get("summary", "Project update"),
                    description=parsed_data.get("description", cleaned_transcript),
                    acceptance_criteria=parsed_data.get("acceptance_criteria", []),
                    priority=Priority(parsed_data.get("priority", "medium")),
                    epic_keywords=parsed_data.get("epic_keywords", []),
                    confidence=float(parsed_data.get("confidence", 0.8))
                )
                
            except json.JSONDecodeError:
                # Fallback if JSON parsing fails
                return self._fallback_classification(cleaned_transcript)
                
        except Exception as e:
            print(f"LLM classification error: {e}")
            return self._fallback_classification(cleaned_transcript)

    def _fallback_classification(self, transcript: str) -> ClassifiedIntent:
        """Fallback classification when LLM fails."""
        # Simple keyword-based classification
        transcript_lower = transcript.lower()
        
        issue_type = IssueType.TASK
        priority = Priority.MEDIUM
        
        # Basic keyword detection
        if any(word in transcript_lower for word in ['bug', 'error', 'broken', 'issue', 'problem']):
            issue_type = IssueType.BUG
            priority = Priority.HIGH
        elif any(word in transcript_lower for word in ['feature', 'new', 'add', 'create', 'user']):
            issue_type = IssueType.STORY
        elif any(word in transcript_lower for word in ['epic', 'initiative', 'project', 'milestone']):
            issue_type = IssueType.EPIC
        elif any(word in transcript_lower for word in ['update', 'status', 'progress', 'meeting']):
            issue_type = IssueType.COMMENT
            
        # Extract potential epic keywords
        epic_keywords = []
        words = transcript_lower.split()
        for word in words:
            if len(word) > 4 and word.isalpha():  # Longer words are more likely to be meaningful
                epic_keywords.append(word)
        
        return ClassifiedIntent(
            type=issue_type,
            summary=transcript[:100] + "..." if len(transcript) > 100 else transcript,
            description=transcript,
            acceptance_criteria=[],
            priority=priority,
            epic_keywords=epic_keywords[:5],  # Limit to 5 keywords
            confidence=0.6  # Lower confidence for fallback
        )

    def find_epic_matches(self, epic_keywords: List[str], available_epics: List[Dict[str, Any]] = None) -> Dict[str, Any]:
        """Find matching epics based on keywords. This is a placeholder for now."""
        # TODO: Implement actual epic matching with Jira API or vector search
        # For now, return a mock response
        
        if not epic_keywords or not available_epics:
            return {
                "epic_id": None,
                "epic_name": None,
                "match_confidence": 0.0,
                "keywords_matched": []
            }
        
        # Simple mock matching logic (to be replaced with actual implementation)
        best_match = None
        best_score = 0.0
        matched_keywords = []
        
        for epic in available_epics:
            epic_name = epic.get("name", "").lower()
            epic_description = epic.get("description", "").lower()
            
            score = 0
            current_matches = []
            
            for keyword in epic_keywords:
                if keyword.lower() in epic_name or keyword.lower() in epic_description:
                    score += 1
                    current_matches.append(keyword)
            
            if score > best_score:
                best_score = score
                best_match = epic
                matched_keywords = current_matches
        
        if best_match and best_score > 0:
            confidence = min(best_score / len(epic_keywords), 1.0)
            return {
                "epic_id": best_match.get("id"),
                "epic_name": best_match.get("name"),
                "match_confidence": confidence,
                "keywords_matched": matched_keywords
            }
        
        return {
            "epic_id": None,
            "epic_name": None,
            "match_confidence": 0.0,
            "keywords_matched": []
        }
