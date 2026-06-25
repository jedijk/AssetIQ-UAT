#!/usr/bin/env python3
"""
HTTP route auth inventory — Phase 0 security audit.

Scans backend/routes/**/*.py for FastAPI handlers and classifies auth dependencies.

Usage:
  cd backend && python scripts/route_auth_inventory.py
  cd backend && python scripts/route_auth_inventory.py --json reports/route_auth.json
  cd backend && python scripts/route_auth_inventory.py --public-only
"""
from __future__ import annotations

import argparse
import ast
import json
import sys
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Iterable, List, Optional

BACKEND_DIR = Path(__file__).resolve().parent.parent
ROUTES_DIR = BACKEND_DIR / "routes"


@dataclass
class RouteAuthRow:
    file: str
    line: int
    method: str
    path: str
    handler: str
    auth: str
    detail: str


def _depends_target(default: ast.AST) -> Optional[str]:
    if not isinstance(default, ast.Call):
        return None
    func = default.func
    name = getattr(func, "id", None) or getattr(func, "attr", None)
    if name != "Depends" or not default.args:
        return None
    arg = default.args[0]
    if isinstance(arg, ast.Name):
        return arg.id
    if isinstance(arg, ast.Call):
        return ast.unparse(arg) if hasattr(ast, "unparse") else None
    return None


def _auth_from_default(default: ast.AST) -> tuple[str, str]:
    target = _depends_target(default)
    if not target:
        return "unknown", ""
    if target == "get_current_user":
        return "authenticated", target
    if target.startswith("_") or "require_permission" in target or "require_roles" in target:
        return "permission", target
    return "depends", target


def _scan_function(func: ast.FunctionDef | ast.AsyncFunctionDef, *, file: str, method: str, path: str, line: int) -> RouteAuthRow:
    auth = "none"
    detail = ""
    args = func.args.args
    defaults = func.args.defaults
    offset = len(args) - len(defaults)

    for i, arg in enumerate(args):
        if arg.arg != "current_user":
            continue
        default_index = i - offset
        if default_index >= 0 and default_index < len(defaults):
            auth, detail = _auth_from_default(defaults[default_index])
            break
        if arg.annotation:
            auth, detail = _auth_from_annotation(arg.annotation)
            break

    if auth == "none":
        for default in defaults + [d for d in func.args.kw_defaults if d is not None]:
            candidate_auth, candidate_detail = _auth_from_default(default)
            if candidate_auth != "unknown":
                auth, detail = candidate_auth, candidate_detail
                break
    return RouteAuthRow(
        file=file,
        line=line,
        method=method.upper(),
        path=path,
        handler=func.name,
        auth=auth,
        detail=detail[:120],
    )


def _auth_from_annotation(node: ast.AST) -> tuple[str, str]:
    text = ast.unparse(node) if hasattr(ast, "unparse") else ""
    if "require_permission" in text:
        return "permission", text
    if "require_any_permission" in text:
        return "any_permission", text
    if "require_roles" in text:
        return "role", text
    if "get_current_user" in text:
        return "authenticated", text
    if "Depends" in text:
        return "depends", text
    return "unknown", text


def _iter_route_handlers(path: Path) -> Iterable[RouteAuthRow]:
    rel = path.relative_to(BACKEND_DIR).as_posix()
    try:
        tree = ast.parse(path.read_text(encoding="utf-8"))
    except SyntaxError as exc:
        print(f"WARN: skip {rel}: {exc}", file=sys.stderr)
        return

    for node in tree.body:
        if not isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            continue
        method = None
        route_path = ""
        decorator_line = node.lineno
        for dec in node.decorator_list:
            dec_text = ast.unparse(dec) if hasattr(ast, "unparse") else ""
            for http_method in ("get", "post", "put", "patch", "delete", "head", "options"):
                prefix = f"router.{http_method}("
                if prefix in dec_text:
                    method = http_method
                    if isinstance(dec, ast.Call) and dec.args:
                        first = dec.args[0]
                        if isinstance(first, ast.Constant) and isinstance(first.value, str):
                            route_path = first.value
                    break
            if method:
                break
        if not method:
            continue
        yield _scan_function(node, file=rel, method=method, path=route_path, line=decorator_line)


def build_inventory() -> List[RouteAuthRow]:
    rows: List[RouteAuthRow] = []
    for path in sorted(ROUTES_DIR.rglob("*.py")):
        if path.name == "__init__.py":
            continue
        rows.extend(_iter_route_handlers(path))
    return rows


def main() -> int:
    parser = argparse.ArgumentParser(description="Route auth inventory")
    parser.add_argument("--json", help="Write JSON report to path")
    parser.add_argument("--public-only", action="store_true", help="Only print unauthenticated routes")
    args = parser.parse_args()

    rows = build_inventory()
    public = [r for r in rows if r.auth == "none"]
    permission = [r for r in rows if r.auth == "permission"]
    authenticated = [r for r in rows if r.auth == "authenticated"]

    if args.public_only:
        for row in public:
            print(f"{row.method:6} {row.path:40} {row.file}:{row.line} {row.handler}")
        print(f"\nTotal public handlers: {len(public)} / {len(rows)}")
    else:
        print("=== Route Auth Inventory (Phase 0) ===")
        print(f"Total handlers scanned: {len(rows)}")
        print(f"  permission:      {len(permission)}")
        print(f"  authenticated:   {len(authenticated)}")
        print(f"  none (public):   {len(public)}")
        print(f"  other:           {len(rows) - len(permission) - len(authenticated) - len(public)}")
        if public:
            print("\nPublic routes (review required):")
            for row in public[:40]:
                print(f"  {row.method:6} {row.path:36} {row.file}:{row.line}")
            if len(public) > 40:
                print(f"  ... and {len(public) - 40} more (use --public-only for full list)")

    if args.json:
        out = Path(args.json)
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(json.dumps([asdict(r) for r in rows], indent=2), encoding="utf-8")
        print(f"\nWrote {out}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
