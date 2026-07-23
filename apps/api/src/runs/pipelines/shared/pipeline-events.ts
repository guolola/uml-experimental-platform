// Provides shared run stage progress values for pipeline event emission.
import { type RunStage } from "@uml-platform/contracts";

export function stageProgressValue(stage: RunStage) {
  switch (stage) {
    case "extract_rules":
      return 20;
    case "generate_models":
      return 65;
    case "generate_design_sequence":
      return 45;
    case "generate_design_models":
      return 70;
    case "generate_tests":
      return 75;
    case "analyze_code_business_logic":
      return 18;
    case "analyze_code_product":
      return 18;
    case "plan_code_ui":
      return 34;
    case "generate_code_ui_mockup":
      return 42;
    case "analyze_code_ui_mockup":
      return 46;
    case "generate_code_ui_ir":
      return 49;
    case "load_web_design_skill":
      return 50;
    case "select_code_skills":
      return 50;
    case "plan_code_files":
      return 52;
    case "generate_code_spec":
      return 45;
    case "generate_code_files":
      return 80;
    case "plan_code":
      return 58;
    case "write_code_files":
      return 74;
    case "audit_code_quality":
      return 88;
    case "verify_code_ui_fidelity":
      return 91;
    case "verify_code_rendered_preview":
      return 93;
    case "verify_code_business_assertions":
      return 96;
    case "verify_code_preview":
      return 98;
    case "repair_code_files":
      return 96;
    case "generate_document_text":
      return 55;
    case "render_document_file":
      return 90;
    case "generate_plantuml":
      return 80;
    case "render_svg":
      return 95;
    case "generate_context":
      return 35;
    case "render_context":
      return 60;
    case "generate_implementation":
      return 85;
  }
}
