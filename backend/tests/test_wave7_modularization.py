"""Wave 7 frontend modularization smoke tests."""
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
FORMS = REPO / "frontend" / "src" / "features" / "forms"
ACTIONS = REPO / "frontend" / "src" / "features" / "actions"


def test_forms_page_main_under_600_lines():
    main = FORMS / "FormsPageMain.jsx"
    assert main.exists()
    assert len(main.read_text().splitlines()) < 600


def test_actions_page_main_under_900_lines():
    main = ACTIONS / "ActionsPageMain.jsx"
    assert main.exists()
    assert len(main.read_text().splitlines()) < 900


def test_forms_dialog_components_exist():
    names = [
        "FormsTemplateEditorDialog.jsx",
        "FormsFieldEditorDialog.jsx",
        "FormsViewTemplateDialog.jsx",
        "FormsDeleteConfirmDialog.jsx",
    ]
    for name in names:
        assert (FORMS / "components" / name).exists()


def test_actions_edit_components_exist():
    assert (ACTIONS / "components" / "ActionsEditSheet.jsx").exists()
    assert (ACTIONS / "components" / "ActionsEditDialog.jsx").exists()


def test_typed_api_reexports():
    actions_js = REPO / "frontend" / "src" / "lib" / "apis" / "actions.js"
    inv_js = REPO / "frontend" / "src" / "lib" / "apis" / "investigations.js"
    assert 'from "./actions.ts"' in actions_js.read_text()
    assert 'from "./investigations.ts"' in inv_js.read_text()
