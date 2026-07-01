"""Pulse survey domain models and templates."""
from __future__ import annotations

from typing import Any, Dict, List, Literal

SurveyStatus = Literal["draft", "scheduled", "active", "closed", "archived"]
QuestionType = Literal["rating", "yes_no", "multiple_choice"]

MAX_QUESTIONS = 3

DEFAULT_PLATFORM_FEEDBACK = {
    "template_id": "platform_feedback",
    "title": "AssetIQ Platform Feedback",
    "description": "Quick feedback on your AssetIQ experience (under 1 minute).",
    "survey_type": "platform_satisfaction",
    "comment_prompt": "What is the most important improvement we should make?",
    "questions": [
        {
            "id": "q1",
            "type": "rating",
            "label": "AssetIQ helps me perform my daily work more effectively.",
            "scale_min": 1,
            "scale_max": 5,
        },
        {
            "id": "q2",
            "type": "rating",
            "label": "AssetIQ is easy to use during my daily activities.",
            "scale_min": 1,
            "scale_max": 5,
        },
        {
            "id": "q3",
            "type": "rating",
            "label": "I know where to get help if I experience problems using AssetIQ.",
            "scale_min": 1,
            "scale_max": 5,
        },
    ],
}

SURVEY_TEMPLATES: List[Dict[str, Any]] = [
    DEFAULT_PLATFORM_FEEDBACK,
    {
        "template_id": "training_effectiveness",
        "title": "Training Effectiveness",
        "description": "How well did AssetIQ training prepare you for daily use?",
        "survey_type": "training",
        "comment_prompt": "What training topic would help you most?",
        "questions": [
            {"id": "q1", "type": "rating", "label": "Training prepared me to use AssetIQ.", "scale_min": 1, "scale_max": 5},
            {"id": "q2", "type": "yes_no", "label": "I completed all required training."},
            {"id": "q3", "type": "rating", "label": "I feel confident using AssetIQ on my own.", "scale_min": 1, "scale_max": 5},
        ],
    },
    {
        "template_id": "mobile_experience",
        "title": "Mobile Experience",
        "description": "Feedback on AssetIQ mobile usage.",
        "survey_type": "mobile",
        "comment_prompt": "What slows you down on mobile?",
        "questions": [
            {"id": "q1", "type": "rating", "label": "Mobile AssetIQ is easy to use.", "scale_min": 1, "scale_max": 5},
            {"id": "q2", "type": "yes_no", "label": "I use AssetIQ on a mobile device weekly."},
            {"id": "q3", "type": "rating", "label": "Mobile performance is acceptable.", "scale_min": 1, "scale_max": 5},
        ],
    },
    {
        "template_id": "go_live_feedback",
        "title": "Go-Live Feedback",
        "description": "Post go-live pulse check.",
        "survey_type": "go_live",
        "comment_prompt": "What is blocking adoption on your team?",
        "questions": [
            {"id": "q1", "type": "rating", "label": "Go-live support met my needs.", "scale_min": 1, "scale_max": 5},
            {"id": "q2", "type": "rating", "label": "I use AssetIQ in my daily workflow.", "scale_min": 1, "scale_max": 5},
            {"id": "q3", "type": "yes_no", "label": "I would recommend AssetIQ to a colleague."},
        ],
    },
    {
        "template_id": "quarterly_adoption",
        "title": "Quarterly Adoption Review",
        "description": "Quarterly adoption and satisfaction pulse.",
        "survey_type": "adoption",
        "comment_prompt": "What feature provides the most value?",
        "questions": [
            {"id": "q1", "type": "rating", "label": "AssetIQ is part of my normal work routine.", "scale_min": 1, "scale_max": 5},
            {"id": "q2", "type": "rating", "label": "AssetIQ improves reliability outcomes.", "scale_min": 1, "scale_max": 5},
            {
                "id": "q3",
                "type": "multiple_choice",
                "label": "Primary barrier to adoption",
                "options": ["Time", "Training", "Connectivity", "Process change", "None"],
            },
        ],
    },
    {
        "template_id": "customer_success_checkin",
        "title": "Customer Success Check-in",
        "description": "Check-in with key users on implementation progress.",
        "survey_type": "cs_checkin",
        "comment_prompt": "Is there anything preventing you from using AssetIQ?",
        "questions": [
            {"id": "q1", "type": "rating", "label": "Implementation is on track.", "scale_min": 1, "scale_max": 5},
            {"id": "q2", "type": "rating", "label": "I receive enough support.", "scale_min": 1, "scale_max": 5},
            {"id": "q3", "type": "yes_no", "label": "I know who to contact for help."},
        ],
    },
]

PULSE_READINESS_MAX_CONTRIBUTION = 0.10
