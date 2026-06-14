"""Shared criticality rank definitions."""

DEFAULT_CRITICALITY = [
    {
        "rank": 5, 
        "label": "Critical", 
        "color": "bg-red-600",
        "safety": "Fatality or permanent disability. Immediate danger to personnel.",
        "production": "Complete plant shutdown. Total loss of production capacity (100%).",
        "environment": "Major environmental disaster. Significant off-site contamination requiring regulatory notification.",
        "reputation": "International media coverage. Severe damage to company reputation. Loss of operating license possible."
    },
    {
        "rank": 4, 
        "label": "High", 
        "color": "bg-orange-500",
        "safety": "Serious injury requiring hospitalization. Lost time incident.",
        "production": "Major production loss (>50%). Extended downtime (>24 hours).",
        "environment": "Significant environmental impact. On-site contamination requiring remediation.",
        "reputation": "National media coverage. Significant customer complaints. Regulatory scrutiny."
    },
    {
        "rank": 3, 
        "label": "Medium", 
        "color": "bg-yellow-500",
        "safety": "Minor injury requiring first aid. Recordable incident.",
        "production": "Moderate production loss (25-50%). Downtime 8-24 hours.",
        "environment": "Minor environmental impact. Contained spill or emission.",
        "reputation": "Local media coverage. Customer dissatisfaction. Internal investigation required."
    },
    {
        "rank": 2, 
        "label": "Low", 
        "color": "bg-green-500",
        "safety": "Near miss or minor discomfort. No injury.",
        "production": "Minor production impact (<25%). Downtime <8 hours.",
        "environment": "Negligible environmental impact. Within permit limits.",
        "reputation": "Minor customer complaint. Internal reporting only."
    },
    {
        "rank": 1, 
        "label": "Minimal", 
        "color": "bg-green-700",
        "safety": "No safety impact. Normal operating conditions.",
        "production": "No production impact. Redundancy available.",
        "environment": "No environmental impact.",
        "reputation": "No reputational impact."
    },
]
