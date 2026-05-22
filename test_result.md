#====================================================================================================
# START - Testing Protocol - DO NOT EDIT OR REMOVE THIS SECTION
#====================================================================================================

# THIS SECTION CONTAINS CRITICAL TESTING INSTRUCTIONS FOR BOTH AGENTS
# BOTH MAIN_AGENT AND TESTING_AGENT MUST PRESERVE THIS ENTIRE BLOCK

# Communication Protocol:
# If the `testing_agent` is available, main agent should delegate all testing tasks to it.
#
# You have access to a file called `test_result.md`. This file contains the complete testing state
# and history, and is the primary means of communication between main and the testing agent.
#
# Main and testing agents must follow this exact format to maintain testing data. 
# The testing data must be entered in yaml format Below is the data structure:
# 
## user_problem_statement: {problem_statement}
## backend:
##   - task: "Task name"
##     implemented: true
##     working: true  # or false or "NA"
##     file: "file_path.py"
##     stuck_count: 0
##     priority: "high"  # or "medium" or "low"
##     needs_retesting: false
##     status_history:
##         -working: true  # or false or "NA"
##         -agent: "main"  # or "testing" or "user"
##         -comment: "Detailed comment about status"
##
## frontend:
##   - task: "Task name"
##     implemented: true
##     working: true  # or false or "NA"
##     file: "file_path.js"
##     stuck_count: 0
##     priority: "high"  # or "medium" or "low"
##     needs_retesting: false
##     status_history:
##         -working: true  # or false or "NA"
##         -agent: "main"  # or "testing" or "user"
##         -comment: "Detailed comment about status"
##
## metadata:
##   created_by: "main_agent"
##   version: "1.0"
##   test_sequence: 0
##   run_ui: false
##
## test_plan:
##   current_focus:
##     - "Task name 1"
##     - "Task name 2"
##   stuck_tasks:
##     - "Task name with persistent issues"
##   test_all: false
##   test_priority: "high_first"  # or "sequential" or "stuck_first"
##
## agent_communication:
##     -agent: "main"  # or "testing" or "user"
##     -message: "Communication message between agents"

# Protocol Guidelines for Main agent
#
# 1. Update Test Result File Before Testing:
#    - Main agent must always update the `test_result.md` file before calling the testing agent
#    - Add implementation details to the status_history
#    - Set `needs_retesting` to true for tasks that need testing
#    - Update the `test_plan` section to guide testing priorities
#    - Add a message to `agent_communication` explaining what you've done
#
# 2. Incorporate User Feedback:
#    - When a user provides feedback that something is or isn't working, add this information to the relevant task's status_history
#    - Update the working status based on user feedback
#    - If a user reports an issue with a task that was marked as working, increment the stuck_count
#    - Whenever user reports issue in the app, if we have testing agent and task_result.md file so find the appropriate task for that and append in status_history of that task to contain the user concern and problem as well 
#
# 3. Track Stuck Tasks:
#    - Monitor which tasks have high stuck_count values or where you are fixing same issue again and again, analyze that when you read task_result.md
#    - For persistent issues, use websearch tool to find solutions
#    - Pay special attention to tasks in the stuck_tasks list
#    - When you fix an issue with a stuck task, don't reset the stuck_count until the testing agent confirms it's working
#
# 4. Provide Context to Testing Agent:
#    - When calling the testing agent, provide clear instructions about:
#      - Which tasks need testing (reference the test_plan)
#      - Any authentication details or configuration needed
#      - Specific test scenarios to focus on
#      - Any known issues or edge cases to verify
#
# 5. Call the testing agent with specific instructions referring to test_result.md
#
# IMPORTANT: Main agent must ALWAYS update test_result.md BEFORE calling the testing agent, as it relies on this file to understand what to test next.

#====================================================================================================
# END - Testing Protocol - DO NOT EDIT OR REMOVE THIS SECTION
#====================================================================================================



#====================================================================================================
# Testing Data - Main Agent and testing sub agent both should log testing data below this section
#====================================================================================================

user_problem_statement: "Implement PM Intelligence Import feature - Upload maintenance plans and convert to failure mode intelligence"

backend:
  - task: "PM Import Upload Endpoint"
    implemented: true
    working: true
    file: "/app/backend/routes/pm_import.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
      - working: "NA"
        agent: "main"
        comment: "Implemented POST /pm-import/upload endpoint. Accepts Excel, PDF, and image files. Creates session and processes with AI."
      - working: true
        agent: "testing"
        comment: "TESTED: POST /pm-import/upload successfully uploads Excel file, creates session, processes with AI (GPT-4o-mini), extracts 5 maintenance tasks with components, task types, failure modes, and confidence scores. Returns session_id and status. Fixed timeout issue by adding /pm-import to long timeout paths in server.py middleware. All upload tests passing."

  - task: "PM Import Session Management"
    implemented: true
    working: true
    file: "/app/backend/routes/pm_import.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
      - working: "NA"
        agent: "main"
        comment: "Implemented session CRUD: GET /pm-import/session/{id}, PATCH task updates, accept/reject tasks, bulk actions, import to library."
      - working: true
        agent: "testing"
        comment: "TESTED: All session management endpoints working correctly. GET /pm-import/session/{id} returns complete session with tasks and stats. POST accept/reject task endpoints update review_status correctly (fixed bug where status was being overwritten to 'edited'). POST bulk-action with 'accept_high_confidence' accepts tasks with confidence >= 70%. POST import endpoint successfully imports accepted tasks to failure mode library (linked 4 to existing, skipped 1 rejected). GET /pm-import/sessions lists all user sessions. All 13 test cases passing."

  - task: "PM Import AI Processing Service"
    implemented: true
    working: true
    file: "/app/backend/services/pm_import_service.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
      - working: "NA"
        agent: "main"
        comment: "Implemented PMImportService with Excel/PDF parsing, GPT-4o Vision OCR, rule-based task classification, AI analysis with GPT-4o-mini, library matching, and confidence scoring."
      - working: true
        agent: "testing"
        comment: "TESTED: AI processing service working correctly. Successfully parsed Excel file with 5 maintenance tasks. AI analysis extracted components (Gearbox GB-101, Motor M-201, etc.), classified task types (Inspection, Lubrication, Calibration, Replacement, Cleaning), identified 8 unique failure modes, matched 5 tasks to existing library entries, calculated confidence scores (81% average). Processing completed in ~30 seconds with multiple GPT-4o-mini API calls. All AI features functioning as expected."

frontend:
  - task: "PM Import Wizard Component"
    implemented: true
    working: "NA"
    file: "/app/frontend/src/components/library/PMImportWizard.jsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: "NA"
        agent: "main"
        comment: "Created 4-step wizard: Upload (drag/drop), Processing (animated progress), Review (KPI cards, task list with accept/reject), Import Summary."

  - task: "PM Import Button on Failure Modes Page"
    implemented: true
    working: "NA"
    file: "/app/frontend/src/pages/FailureModesPage.js"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: "NA"
        agent: "main"
        comment: "Added 'Import PM Plan' button next to Export Excel on Failure Modes tab. Opens PMImportWizard modal."

  - task: "PM Import API Client"
    implemented: true
    working: "NA"
    file: "/app/frontend/src/lib/apis/pmImport.js"
    stuck_count: 0
    priority: "medium"
    needs_retesting: true
    status_history:
      - working: "NA"
        agent: "main"
        comment: "Created pmImportAPI with upload, getSession, updateTask, acceptTask, rejectTask, bulkAction, importToLibrary, exportReview methods."

metadata:
  created_by: "main_agent"
  version: "1.0"
  test_sequence: 5
  run_ui: false

test_plan:
  current_focus:
    - "PM Import Upload Endpoint"
    - "PM Import Session Management"
    - "PM Import AI Processing Service"
  stuck_tasks: []
  test_all: false
  test_priority: "high_first"

agent_communication:
  - agent: "main"
    message: "Implemented PM Intelligence Import feature. Backend: POST /pm-import/upload endpoint that accepts Excel/PDF/images, creates session, processes with AI (GPT-4o Vision for OCR, GPT-4o-mini for analysis), extracts maintenance tasks, classifies task types, identifies failure modes, and matches with existing library. Frontend: PMImportWizard with 4-step flow (Upload, Processing animation, Review with KPI cards and task list, Import Summary). Added 'Import PM Plan' button on Failure Modes page. Please test backend endpoints first."
  - agent: "testing"
    message: "BACKEND TESTING COMPLETE - ALL TESTS PASSING (13/13). Tested all PM Import endpoints: upload, get session, accept/reject tasks, bulk actions, import to library, list sessions. Fixed 2 minor issues: (1) Added /pm-import to timeout middleware for 120s timeout, (2) Fixed bug in update_task where review_status was being overwritten to 'edited'. All backend APIs working correctly with AI processing, library matching, and data persistence. Ready for frontend integration testing."