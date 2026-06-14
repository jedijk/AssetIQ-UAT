"""Wave 8 frontend modularization smoke tests."""
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
FRONTEND = REPO / "frontend"
FORMS = FRONTEND / "src" / "features" / "forms"
ACTIONS = FRONTEND / "src" / "features" / "actions"


def test_no_jsconfig_conflicts_with_tsconfig():
    assert (FRONTEND / "tsconfig.json").exists()
    assert not (FRONTEND / "jsconfig.json").exists()


def test_forms_page_main_under_200_lines():
    main = FORMS / "FormsPageMain.jsx"
    assert main.exists()
    assert len(main.read_text().splitlines()) < 200


def test_actions_page_main_under_150_lines():
    main = ACTIONS / "ActionsPageMain.jsx"
    assert main.exists()
    assert len(main.read_text().splitlines()) < 150


def test_page_hooks_exist():
    assert (FORMS / "useFormsPage.js").exists()
    assert (ACTIONS / "useActionsPage.js").exists()


def test_actions_list_section_extracted():
    section = ACTIONS / "components" / "ActionsListSection.jsx"
    assert section.exists()
    assert len(section.read_text().splitlines()) > 200


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
