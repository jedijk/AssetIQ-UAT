"""
Report generation routes for Causal Investigations.
Generates PowerPoint and PDF reports.
"""
from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel
from typing import Optional
from datetime import datetime, timezone
import io
import logging
from database import db, EMERGENT_LLM_KEY
from auth import get_current_user

# AI Integration
from emergentintegrations.llm.chat import LlmChat

# PowerPoint imports
from pptx import Presentation
from pptx.util import Inches, Pt
from pptx.dml.color import RGBColor
from pptx.enum.text import PP_ALIGN, MSO_ANCHOR
from pptx.enum.shapes import MSO_SHAPE

# PDF imports
from reportlab.lib import colors
from reportlab.lib.pagesizes import letter, A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak
from reportlab.lib.enums import TA_LEFT, TA_CENTER, TA_RIGHT

logger = logging.getLogger(__name__)
router = APIRouter(tags=["Reports"])

# Color scheme
COLORS = {
    "primary": RGBColor(79, 70, 229),  # Indigo-600
    "secondary": RGBColor(100, 116, 139),  # Slate-500
    "danger": RGBColor(239, 68, 68),  # Red-500
    "warning": RGBColor(245, 158, 11),  # Amber-500
    "success": RGBColor(34, 197, 94),  # Green-500
    "white": RGBColor(255, 255, 255),
    "dark": RGBColor(30, 41, 59),  # Slate-800
}


async def get_investigation_data(investigation_id: str, user_id: str):
    """Fetch all investigation data for report generation."""
    # Get investigation
    investigation = await db.investigations.find_one(
        {"id": investigation_id, "created_by": user_id},
        {"_id": 0}
    )
    if not investigation:
        raise HTTPException(status_code=404, detail="Investigation not found")
    
    # Get timeline events
    events = await db.timeline_events.find(
        {"investigation_id": investigation_id},
        {"_id": 0}
    ).sort("event_time", 1).to_list(100)
    
    # Get failure identifications
    failures = await db.failure_identifications.find(
        {"investigation_id": investigation_id},
        {"_id": 0}
    ).to_list(100)
    
    # Get cause nodes
    causes = await db.cause_nodes.find(
        {"investigation_id": investigation_id},
        {"_id": 0}
    ).to_list(100)
    
    # Get action items
    actions = await db.action_items.find(
        {"investigation_id": investigation_id},
        {"_id": 0}
    ).to_list(100)
    
    return {
        "investigation": investigation,
        "events": events,
        "failures": failures,
        "causes": causes,
        "actions": actions,
    }


def add_title_slide(prs, title, subtitle=""):
    """Add a title slide to the presentation."""
    slide_layout = prs.slide_layouts[6]  # Blank layout
    slide = prs.slides.add_slide(slide_layout)
    
    # Add background shape
    shape = slide.shapes.add_shape(
        MSO_SHAPE.RECTANGLE, 0, 0, prs.slide_width, prs.slide_height
    )
    shape.fill.solid()
    shape.fill.fore_color.rgb = COLORS["primary"]
    shape.line.fill.background()
    
    # Add title
    title_box = slide.shapes.add_textbox(Inches(0.5), Inches(2.5), Inches(9), Inches(1.5))
    title_frame = title_box.text_frame
    title_para = title_frame.paragraphs[0]
    title_para.text = title
    title_para.font.size = Pt(44)
    title_para.font.bold = True
    title_para.font.color.rgb = COLORS["white"]
    title_para.alignment = PP_ALIGN.CENTER
    
    # Add subtitle
    if subtitle:
        sub_box = slide.shapes.add_textbox(Inches(0.5), Inches(4), Inches(9), Inches(0.8))
        sub_frame = sub_box.text_frame
        sub_para = sub_frame.paragraphs[0]
        sub_para.text = subtitle
        sub_para.font.size = Pt(24)
        sub_para.font.color.rgb = COLORS["white"]
        sub_para.alignment = PP_ALIGN.CENTER
    
    # Add footer watermark
    add_slide_footer(slide, prs, is_title_slide=True)
    
    return slide


def add_slide_footer(slide, prs, is_title_slide=False):
    """Add 'Generated with AssetIQ' footer to a slide."""
    footer_box = slide.shapes.add_textbox(
        Inches(7), Inches(7.1), Inches(2.8), Inches(0.3)
    )
    footer_frame = footer_box.text_frame
    footer_para = footer_frame.paragraphs[0]
    footer_para.text = "Generated with AssetIQ"
    footer_para.font.size = Pt(9)
    footer_para.font.italic = True
    footer_para.alignment = PP_ALIGN.RIGHT
    if is_title_slide:
        footer_para.font.color.rgb = RGBColor(200, 200, 220)  # Light on dark
    else:
        footer_para.font.color.rgb = RGBColor(148, 163, 184)  # slate-400


def add_section_slide(prs, title):
    """Add a section divider slide."""
    slide_layout = prs.slide_layouts[6]
    slide = prs.slides.add_slide(slide_layout)
    
    # Add accent bar
    bar = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, 0, Inches(2.8), Inches(10), Inches(1.5))
    bar.fill.solid()
    bar.fill.fore_color.rgb = COLORS["primary"]
    bar.line.fill.background()
    
    # Add title
    title_box = slide.shapes.add_textbox(Inches(0.5), Inches(3), Inches(9), Inches(1))
    title_frame = title_box.text_frame
    title_para = title_frame.paragraphs[0]
    title_para.text = title
    title_para.font.size = Pt(36)
    title_para.font.bold = True
    title_para.font.color.rgb = COLORS["white"]
    title_para.alignment = PP_ALIGN.CENTER
    
    # Add footer
    add_slide_footer(slide, prs)
    
    return slide


def add_content_slide(prs, title, content_items):
    """Add a content slide with bullet points."""
    slide_layout = prs.slide_layouts[6]
    slide = prs.slides.add_slide(slide_layout)
    
    # Add title bar
    bar = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, 0, 0, Inches(10), Inches(1.2))
    bar.fill.solid()
    bar.fill.fore_color.rgb = COLORS["primary"]
    bar.line.fill.background()
    
    # Add title text
    title_box = slide.shapes.add_textbox(Inches(0.5), Inches(0.3), Inches(9), Inches(0.7))
    title_frame = title_box.text_frame
    title_para = title_frame.paragraphs[0]
    title_para.text = title
    title_para.font.size = Pt(28)
    title_para.font.bold = True
    title_para.font.color.rgb = COLORS["white"]
    
    # Add content
    content_box = slide.shapes.add_textbox(Inches(0.5), Inches(1.5), Inches(9), Inches(5))
    tf = content_box.text_frame
    tf.word_wrap = True
    
    for i, item in enumerate(content_items[:8]):  # Limit to 8 items per slide
        if i == 0:
            p = tf.paragraphs[0]
        else:
            p = tf.add_paragraph()
        
        p.text = f"• {item}"
        p.font.size = Pt(18)
        p.font.color.rgb = COLORS["dark"]
        p.space_after = Pt(12)
    
    # Add footer
    add_slide_footer(slide, prs)
    
    return slide


def add_table_slide(prs, title, headers, rows):
    """Add a slide with a table."""
    slide_layout = prs.slide_layouts[6]
    slide = prs.slides.add_slide(slide_layout)
    
    # Add title bar
    bar = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, 0, 0, Inches(10), Inches(1.2))
    bar.fill.solid()
    bar.fill.fore_color.rgb = COLORS["primary"]
    bar.line.fill.background()
    
    # Add title
    title_box = slide.shapes.add_textbox(Inches(0.5), Inches(0.3), Inches(9), Inches(0.7))
    title_frame = title_box.text_frame
    title_para = title_frame.paragraphs[0]
    title_para.text = title
    title_para.font.size = Pt(28)
    title_para.font.bold = True
    title_para.font.color.rgb = COLORS["white"]
    
    # Add table
    num_rows = min(len(rows) + 1, 10)  # Limit rows
    num_cols = len(headers)
    
    table = slide.shapes.add_table(
        num_rows, num_cols,
        Inches(0.3), Inches(1.5),
        Inches(9.4), Inches(5)
    ).table
    
    # Style header row
    for col_idx, header in enumerate(headers):
        cell = table.cell(0, col_idx)
        cell.text = header
        cell.fill.solid()
        cell.fill.fore_color.rgb = COLORS["primary"]
        para = cell.text_frame.paragraphs[0]
        para.font.bold = True
        para.font.size = Pt(14)
        para.font.color.rgb = COLORS["white"]
        para.alignment = PP_ALIGN.CENTER
        cell.vertical_anchor = MSO_ANCHOR.MIDDLE
    
    # Fill data rows
    for row_idx, row_data in enumerate(rows[:num_rows-1]):
        for col_idx, cell_text in enumerate(row_data):
            cell = table.cell(row_idx + 1, col_idx)
            cell.text = str(cell_text)[:50] if cell_text else "-"
            para = cell.text_frame.paragraphs[0]
            para.font.size = Pt(12)
            para.font.color.rgb = COLORS["dark"]
            cell.vertical_anchor = MSO_ANCHOR.MIDDLE
    
    # Add footer
    add_slide_footer(slide, prs)
    
    return slide


def generate_pptx(data):
    """Generate PowerPoint presentation from investigation data."""
    prs = Presentation()
    prs.slide_width = Inches(10)
    prs.slide_height = Inches(7.5)
    
    inv = data["investigation"]
    events = data["events"]
    failures = data["failures"]
    causes = data["causes"]
    actions = data["actions"]
    
    # Title Slide
    add_title_slide(
        prs,
        inv.get("title", "Investigation Report"),
        f"Case: {inv.get('case_number', 'N/A')} | {inv.get('incident_date', '')[:10] if inv.get('incident_date') else 'Date N/A'}"
    )
    
    # Overview Slide
    overview_items = [
        f"Asset: {inv.get('asset_name', 'N/A')}",
        f"Location: {inv.get('location', 'N/A')}",
        f"Lead Investigator: {inv.get('investigation_leader', 'N/A')}",
        f"Status: {inv.get('status', 'N/A').replace('_', ' ').title()}",
        f"Created: {inv.get('created_at', '')[:10] if inv.get('created_at') else 'N/A'}",
    ]
    if inv.get("description"):
        overview_items.append(f"Description: {inv.get('description')[:100]}...")
    
    add_content_slide(prs, "Investigation Overview", overview_items)
    
    # Timeline Section
    if events:
        add_section_slide(prs, "Timeline of Events")
        
        event_headers = ["Time", "Category", "Description", "Confidence"]
        event_rows = []
        for event in events:
            event_rows.append([
                event.get("event_time", "")[:16] if event.get("event_time") else "-",
                event.get("category", "-").replace("_", " ").title(),
                event.get("description", "-")[:40],
                event.get("confidence", "-").title()
            ])
        
        add_table_slide(prs, f"Events Timeline ({len(events)} events)", event_headers, event_rows)
    
    # Failures Section
    if failures:
        add_section_slide(prs, "Failure Identifications")
        
        failure_headers = ["Asset", "Component", "Failure Mode", "Mechanism"]
        failure_rows = []
        for f in failures:
            failure_rows.append([
                f.get("asset_name", "-")[:20],
                f.get("component", "-")[:20],
                f.get("failure_mode", "-")[:25],
                f.get("degradation_mechanism", "-")[:25]
            ])
        
        add_table_slide(prs, f"Identified Failures ({len(failures)})", failure_headers, failure_rows)
    
    # Root Cause Analysis Section
    if causes:
        add_section_slide(prs, "Root Cause Analysis")
        
        root_causes = [c for c in causes if c.get("is_root_cause")]
        contributing = [c for c in causes if not c.get("is_root_cause")]
        
        if root_causes:
            cause_items = [f"[ROOT] {c.get('description', 'N/A')[:80]}" for c in root_causes]
            add_content_slide(prs, f"Root Causes ({len(root_causes)})", cause_items)
        
        if contributing:
            contrib_items = [f"{c.get('description', 'N/A')[:80]}" for c in contributing[:8]]
            add_content_slide(prs, f"Contributing Factors ({len(contributing)})", contrib_items)
    
    # Actions Section
    if actions:
        add_section_slide(prs, "Corrective Actions")
        
        action_headers = ["#", "Description", "Owner", "Priority", "Status"]
        action_rows = []
        for a in actions:
            action_rows.append([
                a.get("action_number", "-"),
                a.get("description", "-")[:30],
                a.get("owner", "-")[:15],
                a.get("priority", "-").title(),
                a.get("status", "-").replace("_", " ").title()
            ])
        
        add_table_slide(prs, f"Action Items ({len(actions)})", action_headers, action_rows)
    
    # Summary Slide
    summary_items = [
        f"Total Events: {len(events)}",
        f"Identified Failures: {len(failures)}",
        f"Root Causes Found: {len([c for c in causes if c.get('is_root_cause')])}",
        f"Contributing Factors: {len([c for c in causes if not c.get('is_root_cause')])}",
        f"Action Items: {len(actions)}",
        f"Completed Actions: {len([a for a in actions if a.get('status') == 'completed'])}",
    ]
    add_content_slide(prs, "Investigation Summary", summary_items)
    
    # Save to bytes
    output = io.BytesIO()
    prs.save(output)
    output.seek(0)
    return output.getvalue()


def generate_pdf(data):
    """Generate PDF report from investigation data."""
    inv = data["investigation"]
    events = data["events"]
    failures = data["failures"]
    causes = data["causes"]
    actions = data["actions"]
    
    buffer = io.BytesIO()
    
    # Custom page template with footer
    def add_page_footer(canvas, doc):
        canvas.saveState()
        # Right-aligned footer
        canvas.setFont('Helvetica-Oblique', 8)
        canvas.setFillColor(colors.HexColor('#94A3B8'))
        canvas.drawRightString(
            letter[0] - 72,  # Right margin
            40,  # 40 points from bottom
            "Generated with AssetIQ"
        )
        canvas.restoreState()
    
    doc = SimpleDocTemplate(
        buffer,
        pagesize=letter,
        rightMargin=72,
        leftMargin=72,
        topMargin=72,
        bottomMargin=72
    )
    
    # Styles
    styles = getSampleStyleSheet()
    
    title_style = ParagraphStyle(
        'CustomTitle',
        parent=styles['Heading1'],
        fontSize=24,
        spaceAfter=20,
        textColor=colors.HexColor('#4F46E5'),
        alignment=TA_CENTER
    )
    
    heading_style = ParagraphStyle(
        'CustomHeading',
        parent=styles['Heading2'],
        fontSize=16,
        spaceAfter=12,
        spaceBefore=20,
        textColor=colors.HexColor('#4F46E5')
    )
    
    subheading_style = ParagraphStyle(
        'CustomSubheading',
        parent=styles['Heading3'],
        fontSize=12,
        spaceAfter=8,
        spaceBefore=12,
        textColor=colors.HexColor('#1E293B')
    )
    
    normal_style = ParagraphStyle(
        'CustomNormal',
        parent=styles['Normal'],
        fontSize=10,
        spaceAfter=6,
        textColor=colors.HexColor('#334155')
    )
    
    story = []
    
    # Title
    story.append(Paragraph(inv.get("title", "Investigation Report"), title_style))
    story.append(Paragraph(f"Case Number: {inv.get('case_number', 'N/A')}", normal_style))
    story.append(Spacer(1, 20))
    
    # Overview Table
    story.append(Paragraph("Investigation Overview", heading_style))
    overview_data = [
        ["Field", "Value"],
        ["Asset", inv.get("asset_name", "N/A")],
        ["Location", inv.get("location", "N/A")],
        ["Incident Date", inv.get("incident_date", "N/A")[:10] if inv.get("incident_date") else "N/A"],
        ["Lead Investigator", inv.get("investigation_leader", "N/A")],
        ["Status", inv.get("status", "N/A").replace("_", " ").title()],
    ]
    
    overview_table = Table(overview_data, colWidths=[2*inch, 4*inch])
    overview_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#4F46E5')),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, -1), 10),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
        ('TOPPADDING', (0, 0), (-1, -1), 8),
        ('BACKGROUND', (0, 1), (-1, -1), colors.HexColor('#F8FAFC')),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#CBD5E1')),
        ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
    ]))
    story.append(overview_table)
    
    if inv.get("description"):
        story.append(Spacer(1, 10))
        story.append(Paragraph("Description:", subheading_style))
        story.append(Paragraph(inv.get("description"), normal_style))
    
    # Timeline Events
    if events:
        story.append(PageBreak())
        story.append(Paragraph(f"Timeline of Events ({len(events)})", heading_style))
        
        event_data = [["Time", "Category", "Description", "Confidence"]]
        for event in events:
            event_data.append([
                event.get("event_time", "-")[:16] if event.get("event_time") else "-",
                event.get("category", "-").replace("_", " ").title()[:15],
                event.get("description", "-")[:50],
                event.get("confidence", "-").title()
            ])
        
        event_table = Table(event_data, colWidths=[1.2*inch, 1.2*inch, 2.8*inch, 0.8*inch])
        event_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#4F46E5')),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, -1), 9),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
            ('TOPPADDING', (0, 0), (-1, -1), 6),
            ('BACKGROUND', (0, 1), (-1, -1), colors.HexColor('#F8FAFC')),
            ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#CBD5E1')),
            ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
            ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ]))
        story.append(event_table)
    
    # Failures
    if failures:
        story.append(PageBreak())
        story.append(Paragraph(f"Failure Identifications ({len(failures)})", heading_style))
        
        failure_data = [["Asset", "Component", "Failure Mode", "Mechanism"]]
        for f in failures:
            failure_data.append([
                f.get("asset_name", "-")[:20],
                f.get("component", "-")[:15],
                f.get("failure_mode", "-")[:25],
                f.get("degradation_mechanism", "-")[:25]
            ])
        
        failure_table = Table(failure_data, colWidths=[1.5*inch, 1.2*inch, 1.8*inch, 1.5*inch])
        failure_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#4F46E5')),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, -1), 9),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
            ('TOPPADDING', (0, 0), (-1, -1), 6),
            ('BACKGROUND', (0, 1), (-1, -1), colors.HexColor('#F8FAFC')),
            ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#CBD5E1')),
            ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
            ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ]))
        story.append(failure_table)
    
    # Root Causes
    if causes:
        story.append(PageBreak())
        story.append(Paragraph("Root Cause Analysis", heading_style))
        
        root_causes = [c for c in causes if c.get("is_root_cause")]
        contributing = [c for c in causes if not c.get("is_root_cause")]
        
        if root_causes:
            story.append(Paragraph(f"Root Causes ({len(root_causes)})", subheading_style))
            for c in root_causes:
                story.append(Paragraph(f"• <b>[ROOT]</b> {c.get('description', 'N/A')}", normal_style))
        
        if contributing:
            story.append(Spacer(1, 10))
            story.append(Paragraph(f"Contributing Factors ({len(contributing)})", subheading_style))
            for c in contributing:
                category = c.get("category", "").replace("_", " ").title()
                story.append(Paragraph(f"• [{category}] {c.get('description', 'N/A')}", normal_style))
    
    # Actions
    if actions:
        story.append(PageBreak())
        story.append(Paragraph(f"Corrective Actions ({len(actions)})", heading_style))
        
        action_data = [["#", "Description", "Owner", "Priority", "Due Date", "Status"]]
        for a in actions:
            action_data.append([
                a.get("action_number", "-"),
                a.get("description", "-")[:35],
                a.get("owner", "-")[:12],
                a.get("priority", "-").title(),
                a.get("due_date", "-")[:10] if a.get("due_date") else "-",
                a.get("status", "-").replace("_", " ").title()
            ])
        
        action_table = Table(action_data, colWidths=[0.6*inch, 2.2*inch, 1*inch, 0.8*inch, 0.8*inch, 0.8*inch])
        action_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#4F46E5')),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, -1), 8),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
            ('TOPPADDING', (0, 0), (-1, -1), 5),
            ('BACKGROUND', (0, 1), (-1, -1), colors.HexColor('#F8FAFC')),
            ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#CBD5E1')),
            ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
            ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ]))
        story.append(action_table)
    
    # Summary
    story.append(PageBreak())
    story.append(Paragraph("Investigation Summary", heading_style))
    
    summary_data = [
        ["Metric", "Count"],
        ["Timeline Events", str(len(events))],
        ["Identified Failures", str(len(failures))],
        ["Root Causes", str(len([c for c in causes if c.get("is_root_cause")]))],
        ["Contributing Factors", str(len([c for c in causes if not c.get("is_root_cause")]))],
        ["Total Actions", str(len(actions))],
        ["Completed Actions", str(len([a for a in actions if a.get("status") == "completed"]))],
    ]
    
    summary_table = Table(summary_data, colWidths=[3*inch, 2*inch])
    summary_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#4F46E5')),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, -1), 10),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
        ('TOPPADDING', (0, 0), (-1, -1), 8),
        ('BACKGROUND', (0, 1), (-1, -1), colors.HexColor('#F8FAFC')),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#CBD5E1')),
        ('ALIGN', (0, 0), (0, -1), 'LEFT'),
        ('ALIGN', (1, 0), (1, -1), 'CENTER'),
    ]))
    story.append(summary_table)
    
    # Footer
    story.append(Spacer(1, 30))
    story.append(Paragraph(
        f"Generated on {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')} | AssetIQ Causal Engine",
        ParagraphStyle('Footer', parent=normal_style, alignment=TA_CENTER, textColor=colors.HexColor('#94A3B8'))
    ))
    
    doc.build(story, onFirstPage=add_page_footer, onLaterPages=add_page_footer)
    buffer.seek(0)
    return buffer.getvalue()


@router.get("/investigations/{investigation_id}/report/pptx")
async def generate_pptx_report(
    investigation_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Generate PowerPoint report for an investigation."""
    try:
        data = await get_investigation_data(investigation_id, current_user["id"])
        pptx_bytes = generate_pptx(data)
        
        filename = f"Investigation_{data['investigation'].get('case_number', investigation_id)}.pptx"
        
        return Response(
            content=pptx_bytes,
            media_type="application/vnd.openxmlformats-officedocument.presentationml.presentation",
            headers={"Content-Disposition": f"attachment; filename={filename}"}
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error generating PPTX report: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to generate report: {str(e)}")


@router.get("/investigations/{investigation_id}/report/pdf")
async def generate_pdf_report(
    investigation_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Generate PDF report for an investigation."""
    try:
        data = await get_investigation_data(investigation_id, current_user["id"])
        pdf_bytes = generate_pdf(data)
        
        filename = f"Investigation_{data['investigation'].get('case_number', investigation_id)}.pdf"
        
        return Response(
            content=pdf_bytes,
            media_type="application/pdf",
            headers={"Content-Disposition": f"attachment; filename={filename}"}
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error generating PDF report: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to generate report: {str(e)}")


# ============= AI SUMMARY =============

class AISummaryResponse(BaseModel):
    summary: str
    key_findings: list
    next_steps: list
    recommendations: list


async def generate_ai_summary(data: dict) -> dict:
    """Generate AI-powered summary of investigation with next steps."""
    inv = data["investigation"]
    events = data["events"]
    failures = data["failures"]
    causes = data["causes"]
    actions = data["actions"]
    
    # Prepare context for AI
    context = f"""
Investigation: {inv.get('title', 'N/A')}
Asset: {inv.get('asset_name', 'N/A')}
Location: {inv.get('location', 'N/A')}
Incident Date: {inv.get('incident_date', 'N/A')}
Status: {inv.get('status', 'N/A')}
Description: {inv.get('description', 'N/A')}

TIMELINE EVENTS ({len(events)}):
{chr(10).join([f"- [{e.get('category', 'event')}] {e.get('description', '')}" for e in events[:10]])}

IDENTIFIED FAILURES ({len(failures)}):
{chr(10).join([f"- {f.get('asset_name', '')}: {f.get('failure_mode', '')} - {f.get('degradation_mechanism', '')}" for f in failures[:5]])}

ROOT CAUSES:
{chr(10).join([f"- [ROOT CAUSE] {c.get('description', '')}" for c in causes if c.get('is_root_cause')][:5])}

CONTRIBUTING FACTORS:
{chr(10).join([f"- [{c.get('category', 'factor')}] {c.get('description', '')}" for c in causes if not c.get('is_root_cause')][:5])}

CORRECTIVE ACTIONS ({len(actions)}):
{chr(10).join([f"- [{a.get('priority', 'medium')}] {a.get('description', '')} - Status: {a.get('status', 'open')}" for a in actions[:8]])}
"""
    
    prompt = f"""You are an expert reliability engineer analyzing a causal investigation report. Based on the following investigation data, provide:

1. A concise executive summary (2-3 paragraphs) covering the incident, key findings, and overall assessment
2. A list of 3-5 key findings from the investigation
3. A list of 4-6 specific, actionable next steps the team should take
4. A list of 2-4 strategic recommendations for preventing similar incidents

{context}

Respond in JSON format with the following structure:
{{
  "summary": "Executive summary text here...",
  "key_findings": ["Finding 1", "Finding 2", ...],
  "next_steps": ["Step 1", "Step 2", ...],
  "recommendations": ["Recommendation 1", "Recommendation 2", ...]
}}

Focus on actionable insights and practical recommendations. Be specific to this investigation."""

    try:
        chat = LlmChat(api_key=EMERGENT_LLM_KEY, model="gpt-5.2")
        response = await chat.send_message_async(prompt)
        
        # Parse JSON response
        import json
        # Clean up response if needed
        response_text = response.strip()
        if response_text.startswith("```json"):
            response_text = response_text[7:]
        if response_text.startswith("```"):
            response_text = response_text[3:]
        if response_text.endswith("```"):
            response_text = response_text[:-3]
        
        result = json.loads(response_text.strip())
        return result
    except Exception as e:
        logger.error(f"Error generating AI summary: {e}")
        # Return a basic fallback
        return {
            "summary": f"Investigation '{inv.get('title', 'N/A')}' identified {len([c for c in causes if c.get('is_root_cause')])} root causes and {len(failures)} failure modes. {len(actions)} corrective actions have been defined.",
            "key_findings": [
                f"Identified {len(failures)} failure identification(s)",
                f"Found {len([c for c in causes if c.get('is_root_cause')])} root cause(s)",
                f"{len([a for a in actions if a.get('status') == 'completed'])} of {len(actions)} actions completed"
            ],
            "next_steps": [
                "Review and validate all identified root causes",
                "Prioritize and assign owners to open action items",
                "Schedule follow-up review in 2-4 weeks",
                "Document lessons learned"
            ],
            "recommendations": [
                "Implement preventive maintenance procedures",
                "Update equipment monitoring protocols",
                "Share findings with relevant teams"
            ]
        }


@router.get("/investigations/{investigation_id}/ai-summary")
async def get_ai_summary(
    investigation_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Generate AI-powered summary of investigation with next steps."""
    try:
        data = await get_investigation_data(investigation_id, current_user["id"])
        summary = await generate_ai_summary(data)
        return summary
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting AI summary: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to generate AI summary: {str(e)}")
