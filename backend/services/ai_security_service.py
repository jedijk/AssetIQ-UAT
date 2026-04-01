"""
AI Security Service
Provides input sanitization and prompt injection protection for AI features.
"""
import re
import logging
from typing import Optional

logger = logging.getLogger(__name__)

# Patterns that could indicate prompt injection attempts
INJECTION_PATTERNS = [
    # Direct instruction override attempts
    r'ignore\s+(previous|all|above|prior|earlier)\s+(instructions?|prompts?|rules?|context)',
    r'disregard\s+(previous|all|above|prior|earlier)\s+(instructions?|prompts?|rules?|context)',
    r'forget\s+(previous|all|above|prior|earlier)\s+(instructions?|prompts?|rules?|context)',
    r'override\s+(previous|all|above|prior|earlier)\s+(instructions?|prompts?|rules?|context)',
    
    # New instruction injection
    r'new\s+(instructions?|prompt|system\s*message|rules?)',
    r'updated?\s+(instructions?|prompt|system\s*message|rules?)',
    r'here\s+are\s+(new|your)\s+instructions?',
    
    # Role/persona hijacking
    r'you\s+are\s+now\s+a',
    r'act\s+as\s+(if\s+you\s+are|a)',
    r'pretend\s+(to\s+be|you\s+are)',
    r'roleplay\s+as',
    r'from\s+now\s+on\s+you',
    
    # System message injection
    r'system\s*:\s*',
    r'assistant\s*:\s*',
    r'user\s*:\s*',
    r'\[system\]',
    r'\[assistant\]',
    r'\[inst\]',
    r'<<sys>>',
    r'<\|system\|>',
    r'<\|assistant\|>',
    
    # Code block injection (potential for prompt leakage)
    r'```\s*(system|prompt|instructions?)',
    
    # Output manipulation
    r'output\s+only',
    r'respond\s+with\s+only',
    r'say\s+exactly',
    r'repeat\s+after\s+me',
    
    # Data exfiltration attempts
    r'(show|reveal|display|print|output)\s+(the|your)\s+(system|original|initial)\s+(prompt|instructions?|message)',
    r'what\s+(are|is)\s+your\s+(system|original|initial)\s+(prompt|instructions?|message)',
    
    # Delimiter injection
    r'---+\s*(system|instructions?|prompt)',
    r'===+\s*(system|instructions?|prompt)',
    r'\*\*\*+\s*(system|instructions?|prompt)',
]

# Compile patterns for efficiency
COMPILED_PATTERNS = [re.compile(pattern, re.IGNORECASE) for pattern in INJECTION_PATTERNS]

# Characters that should be escaped or removed
DANGEROUS_CHARS = [
    '\x00',  # Null byte
    '\x1b',  # Escape character
    '\r',    # Carriage return (can cause issues in some contexts)
]


def detect_prompt_injection(text: str) -> tuple[bool, Optional[str]]:
    """
    Detect potential prompt injection attempts in user input.
    
    Args:
        text: The user input to check
        
    Returns:
        Tuple of (is_suspicious, matched_pattern)
    """
    if not text:
        return False, None
    
    for pattern in COMPILED_PATTERNS:
        match = pattern.search(text)
        if match:
            logger.warning(f"Prompt injection pattern detected: {match.group()[:50]}")
            return True, match.group()
    
    return False, None


def sanitize_for_ai_prompt(
    text: str, 
    max_length: int = 1000,
    field_name: str = "input",
    strict: bool = False
) -> str:
    """
    Sanitize user input before embedding in AI prompts.
    
    Args:
        text: The user input to sanitize
        max_length: Maximum allowed length (truncates if exceeded)
        field_name: Name of the field (for logging)
        strict: If True, reject suspicious input entirely; if False, filter it
        
    Returns:
        Sanitized text safe for AI prompt embedding
    """
    if not text:
        return "Not specified"
    
    # Convert to string if not already
    text = str(text)
    
    # Remove dangerous characters
    for char in DANGEROUS_CHARS:
        text = text.replace(char, '')
    
    # Truncate to max length
    if len(text) > max_length:
        text = text[:max_length] + "..."
        logger.info(f"AI input truncated: {field_name} exceeded {max_length} chars")
    
    # Check for injection attempts
    is_suspicious, matched = detect_prompt_injection(text)
    
    if is_suspicious:
        if strict:
            logger.warning(f"Strict mode: Rejecting suspicious AI input in {field_name}")
            return "[Content filtered for security]"
        else:
            # Filter out the suspicious patterns
            for pattern in COMPILED_PATTERNS:
                text = pattern.sub('[FILTERED]', text)
            logger.warning(f"Filtered suspicious patterns from AI input in {field_name}")
    
    # Normalize whitespace
    text = ' '.join(text.split())
    
    return text


def sanitize_threat_context(threat: dict) -> dict:
    """
    Sanitize all user-provided fields in a threat object before AI processing.
    
    Args:
        threat: The threat dictionary with user-provided data
        
    Returns:
        Sanitized threat dictionary
    """
    sanitized = {}
    
    # Fields that are user-provided and need sanitization
    user_fields = [
        ('title', 200),
        ('description', 1000),
        ('cause', 500),
        ('impact', 500),
        ('asset', 200),
        ('equipment_type', 100),
        ('failure_mode', 200),
        ('location', 200),
        ('frequency', 100),
    ]
    
    for field, max_len in user_fields:
        if field in threat:
            sanitized[field] = sanitize_for_ai_prompt(
                threat.get(field, ''),
                max_length=max_len,
                field_name=f"threat.{field}"
            )
    
    # Copy non-user fields as-is (system-generated values)
    system_fields = [
        'id', 'risk_score', 'risk_level', 'status', 'created_at', 
        'updated_at', 'created_by', 'installation_id', 'linked_equipment_id',
        'equipment_criticality', 'severity', 'likelihood', 'detectability'
    ]
    
    for field in system_fields:
        if field in threat:
            sanitized[field] = threat[field]
    
    return sanitized


def sanitize_equipment_history(history: dict) -> dict:
    """
    Sanitize equipment history data before AI processing.
    
    Args:
        history: Equipment history dictionary
        
    Returns:
        Sanitized history dictionary
    """
    if not history:
        return {}
    
    sanitized = {
        'observations': [],
        'actions': [],
        'tasks': []
    }
    
    # Sanitize observations
    for obs in history.get('observations', [])[:10]:  # Limit to 10
        sanitized['observations'].append({
            'title': sanitize_for_ai_prompt(obs.get('title', ''), max_length=100, field_name='obs.title'),
            'failure_mode': sanitize_for_ai_prompt(obs.get('failure_mode', ''), max_length=100, field_name='obs.failure_mode'),
            'risk_score': obs.get('risk_score'),
            'status': obs.get('status'),
            'created_at': obs.get('created_at')
        })
    
    # Sanitize actions
    for action in history.get('actions', [])[:10]:
        sanitized['actions'].append({
            'title': sanitize_for_ai_prompt(action.get('title', ''), max_length=100, field_name='action.title'),
            'status': action.get('status'),
            'priority': action.get('priority'),
            'created_at': action.get('created_at')
        })
    
    # Sanitize tasks
    for task in history.get('tasks', [])[:10]:
        sanitized['tasks'].append({
            'name': sanitize_for_ai_prompt(task.get('name', ''), max_length=100, field_name='task.name'),
            'status': task.get('status'),
            'completed_at': task.get('completed_at')
        })
    
    return sanitized


class AISecurityValidator:
    """Validator class for AI request security checks."""
    
    def __init__(self, strict_mode: bool = False):
        self.strict_mode = strict_mode
        self.blocked_requests = 0
        self.filtered_requests = 0
    
    def validate_and_sanitize(self, data: dict, context: str = "request") -> tuple[dict, bool]:
        """
        Validate and sanitize data for AI processing.
        
        Args:
            data: The data dictionary to validate
            context: Context description for logging
            
        Returns:
            Tuple of (sanitized_data, was_modified)
        """
        was_modified = False
        sanitized = {}
        
        for key, value in data.items():
            if isinstance(value, str):
                original = value
                sanitized[key] = sanitize_for_ai_prompt(
                    value, 
                    max_length=1000, 
                    field_name=f"{context}.{key}",
                    strict=self.strict_mode
                )
                if sanitized[key] != original:
                    was_modified = True
            elif isinstance(value, dict):
                sanitized[key], nested_modified = self.validate_and_sanitize(value, f"{context}.{key}")
                was_modified = was_modified or nested_modified
            elif isinstance(value, list):
                sanitized[key] = []
                for i, item in enumerate(value[:50]):  # Limit list items
                    if isinstance(item, dict):
                        sanitized_item, _ = self.validate_and_sanitize(item, f"{context}.{key}[{i}]")
                        sanitized[key].append(sanitized_item)
                    elif isinstance(item, str):
                        sanitized[key].append(sanitize_for_ai_prompt(item, max_length=500))
                    else:
                        sanitized[key].append(item)
            else:
                sanitized[key] = value
        
        if was_modified:
            self.filtered_requests += 1
            logger.info(f"AI input modified during sanitization: {context}")
        
        return sanitized, was_modified
    
    def get_stats(self) -> dict:
        """Get security statistics."""
        return {
            'blocked_requests': self.blocked_requests,
            'filtered_requests': self.filtered_requests
        }


# Global validator instance
ai_security_validator = AISecurityValidator(strict_mode=False)
