"""Wave 13: extract ai_routes -> ai_risk_service + thin orchestrator."""
from __future__ import annotations

import ast
import re
from pathlib import Path

BACKEND = Path(__file__).resolve().parent.parent
ROUTE = BACKEND / "routes" / "ai_routes.py"
SERVICE = BACKEND / "services" / "ai_risk_service.py"


def _parse_route_handlers(source: str) -> list[dict]:
    tree = ast.parse(source)
    handlers = []
    for node in tree.body:
        if not isinstance(node, ast.AsyncFunctionDef):
            continue
        route_path = None
        methods = []
        rate_limit = None
        for dec in node.decorator_list:
            if isinstance(dec, ast.Call) and isinstance(dec.func, ast.Attribute):
                if dec.func.attr in ("get", "post", "put", "patch", "delete"):
                    if dec.args and isinstance(dec.args[0], ast.Constant):
                        route_path = dec.args[0].value
                        methods.append(dec.func.attr)
                if dec.func.attr == "limit" and dec.args:
                    if isinstance(dec.args[0], ast.Constant):
                        rate_limit = dec.args[0].value
        if not route_path:
            continue
        params = []
        for arg in node.args.args:
            if arg.arg in ("request", "current_user"):
                continue
            params.append(arg.arg)
        handlers.append(
            {
                "name": node.name,
                "path": route_path,
                "method": methods[0] if methods else "get",
                "rate_limit": rate_limit,
                "params": params,
                "has_request": any(a.arg == "request" for a in node.args.args),
            }
        )
    return handlers


def _build_service(source: str) -> str:
    lines = source.splitlines()
    out: list[str] = []
    skip = False
    i = 0
    while i < len(lines):
        line = lines[i]
        if line.startswith('"""') and i < 3:
            out.append('"""')
            out.append("AI Risk Engine — Wave 13 tenant-scoped service.")
            out.append('"""')
            if line.count('"""') < 2:
                i += 1
                while i < len(lines) and '"""' not in lines[i]:
                    i += 1
            i += 1
            continue
        if any(
            line.startswith(p)
            for p in (
                "from slowapi",
                "router = APIRouter",
                "limiter = Limiter",
                "AI_RATE_LIMIT =",
                "AI_HEAVY_RATE_LIMIT =",
            )
        ):
            i += 1
            continue
        if line.startswith("@router.") or line.startswith("@limiter."):
            i += 1
            continue
        if line.startswith("from fastapi import"):
            out.append("from fastapi import HTTPException")
            out.append("from fastapi.responses import JSONResponse")
            i += 1
            continue
        if line.startswith("from auth import"):
            i += 1
            continue
        out.append(line)
        i += 1

    text = "\n".join(out)
    text = re.sub(
        r"async def (\w+)\(\s*\n(?:\s*request: Request,\s*\n)?",
        r"async def \1(\n    actor: dict,\n",
        text,
    )
    text = re.sub(
        r"async def (\w+)\(\s*\n\s*actor: dict,\s*\n\s*actor: dict,",
        r"async def \1(\n    actor: dict,",
        text,
    )
    text = re.sub(
        r",\s*\n\s*current_user: dict = Depends\(get_current_user\),?\s*\n\s*\):",
        "\n):",
        text,
    )
    text = re.sub(
        r"current_user: dict = Depends\(get_current_user\),?\s*\n\s*\):",
        "):\n",
        text,
    )
    text = text.replace("current_user", "actor")
    return text + "\n"


def _build_thin_route(handlers: list[dict]) -> str:
    lines = [
        '"""AI Risk Engine routes — orchestration only (Wave 13)."""',
        "import os",
        "from typing import Any, Dict, Optional",
        "",
        "from fastapi import APIRouter, Depends, Request",
        "from slowapi import Limiter",
        "from slowapi.util import get_remote_address",
        "",
        "from ai_risk_models import (",
        "    AnalyzeRiskRequest,",
        "    GenerateCausesRequest,",
        "    GenerateFaultTreeRequest,",
        "    OptimizeActionsRequest,",
        ")",
        "from auth import get_current_user",
        "from services import ai_risk_service as svc",
        "",
        "router = APIRouter(tags=[\"AI Risk Engine\"])",
        "limiter = Limiter(key_func=get_remote_address)",
        "",
        'AI_RATE_LIMIT = "20/minute"',
        'AI_HEAVY_RATE_LIMIT = "10/minute"',
        "",
    ]

    for h in handlers:
        decs = [f'@router.{h["method"]}("{h["path"]}")']
        if h["rate_limit"]:
            var = "AI_HEAVY_RATE_LIMIT" if h["rate_limit"].startswith("10") else "AI_RATE_LIMIT"
            decs.append(f"@limiter.limit({var})")
        lines.extend(decs)

        sig_parts = []
        if h["has_request"]:
            sig_parts.append("request: Request")
        for p in h["params"]:
            if p == "body":
                sig_parts.append("body: Dict[str, Any]")
            elif p == "data":
                sig_parts.append("data: dict")
            elif p == "threat_id":
                sig_parts.append("threat_id: str")
            elif p == "language":
                sig_parts.append("language: Optional[str] = None")
            elif p in ("body", "request"):
                continue
            elif p.endswith("_id"):
                sig_parts.append(f"{p}: str")
            else:
                sig_parts.append(f"{p}: Optional[{p.split('_')[0].title()}Request] = None")
        sig_parts.append("current_user: dict = Depends(get_current_user)")

        lines.append(f"async def {h['name']}(")
        for part in sig_parts:
            lines.append(f"    {part},")
        lines.append("):")

        call_args = ["current_user"]
        if h["has_request"]:
            call_args.insert(0, "request")
        for p in h["params"]:
            call_args.append(p)
        lines.append(f"    return await svc.{h['name']}({', '.join(call_args)})")
        lines.append("")

    return "\n".join(lines)


def main() -> None:
    source = ROUTE.read_text(encoding="utf-8")
    handlers = _parse_route_handlers(source)
    SERVICE.write_text(_build_service(source), encoding="utf-8")
    ROUTE.write_text(_build_thin_route(handlers), encoding="utf-8")
    print(f"Wrote {SERVICE} and thin {ROUTE} ({len(handlers)} handlers)")


if __name__ == "__main__":
    main()
