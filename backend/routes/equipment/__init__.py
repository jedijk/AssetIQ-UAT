"""
Equipment Hierarchy routes - Modular structure.

This package contains all equipment hierarchy operations split into logical modules:
- equipment_types.py - Equipment type CRUD
- equipment_nodes.py - Node CRUD operations (get, create, update, delete)
- equipment_operations.py - Move, reorder, change level operations
- equipment_criticality.py - Criticality and discipline assignment
- equipment_utils.py - Search, stats, unstructured items
- equipment_history.py - Equipment history timeline
- equipment_import.py - Hierarchy import (Excel, JSON)
"""
from fastapi import APIRouter

# Create main router that includes all sub-routers
router = APIRouter(tags=["Equipment Hierarchy"])

# Import and include sub-routers
from .equipment_types import router as types_router
from .equipment_nodes import router as nodes_router
from .equipment_operations import router as operations_router
from .equipment_criticality import router as criticality_router
from .equipment_utils import router as utils_router
from .equipment_history import router as history_router
from .equipment_import import router as import_router

# Include all sub-routers
router.include_router(types_router)
router.include_router(nodes_router)
router.include_router(operations_router)
router.include_router(criticality_router)
router.include_router(utils_router)
router.include_router(history_router)
router.include_router(import_router)
