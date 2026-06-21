// Owns generated code artifacts, editable files, and code diagnostics state.
import { useCallback, useState } from "react";
import type {
  CodeBusinessLogic,
  CodeGenerationSpec,
  CodeRunSnapshot,
} from "@uml-platform/contracts";
import type { WorkspaceCodeRunSnapshot } from "../../../entities/workspace/model";

export function shouldPreserveCodeWorkspaceOnSnapshot(
  snapshot: WorkspaceCodeRunSnapshot,
) {
  return snapshot.status !== "completed" && snapshot.generationMode === "regenerate";
}

export function useCodeSlice() {
  const [codeSpec, setCodeSpec] = useState<CodeGenerationSpec | null>(null);
  const [codeBusinessLogic, setCodeBusinessLogic] =
    useState<CodeBusinessLogic | null>(null);
  const [codeFiles, setCodeFiles] = useState<Record<string, string>>({});
  const [codeEntryFile, setCodeEntryFile] = useState<string | null>(null);
  const [codeDependencies, setCodeDependencies] = useState<Record<string, string>>({});
  const [codeUiMockup, setCodeUiMockup] = useState<CodeRunSnapshot["uiMockup"]>(null);
  const [codeAgentPlan, setCodeAgentPlan] = useState<string[]>([]);
  const [codeSkills, setCodeSkills] = useState<CodeRunSnapshot["selectedCodeSkills"]>(
    [],
  );
  const [codeSkillDiagnostics, setCodeSkillDiagnostics] = useState<
    CodeRunSnapshot["skillDiagnostics"]
  >([]);
  const [codeSkillResourcePlan, setCodeSkillResourcePlan] = useState<
    CodeRunSnapshot["skillResourcePlan"]
  >(null);
  const [codeSkillContext, setCodeSkillContext] = useState<
    CodeRunSnapshot["codeSkillContext"]
  >(null);
  const [codeDiagnostics, setCodeDiagnostics] = useState<CodeRunSnapshot["diagnostics"]>(
    [],
  );
  const [codeEditVersion, setCodeEditVersion] = useState(0);

  const applyCodeRunSnapshot = useCallback((snapshot: WorkspaceCodeRunSnapshot) => {
    const preserveCurrentCode = shouldPreserveCodeWorkspaceOnSnapshot(snapshot);
    setCodeSpec(snapshot.spec);
    setCodeBusinessLogic(snapshot.businessLogic);
    if (!preserveCurrentCode) {
      setCodeFiles({ ...snapshot.files });
      setCodeEntryFile(snapshot.entryFile);
      setCodeDependencies({ ...snapshot.dependencies });
    }
    setCodeUiMockup(snapshot.uiMockup);
    setCodeAgentPlan([...snapshot.agentPlan]);
    setCodeSkills([...snapshot.selectedCodeSkills]);
    setCodeSkillDiagnostics([...snapshot.skillDiagnostics]);
    setCodeSkillResourcePlan(snapshot.skillResourcePlan);
    setCodeSkillContext(snapshot.codeSkillContext);
    setCodeDiagnostics([...snapshot.diagnostics]);
  }, []);

  const updateCodeFile = useCallback((path: string, value: string) => {
    setCodeFiles((current) => ({
      ...current,
      [path]: value,
    }));
    setCodeEditVersion((current) => current + 1);
  }, []);

  return {
    codeSpec,
    setCodeSpec,
    codeBusinessLogic,
    setCodeBusinessLogic,
    codeFiles,
    setCodeFiles,
    codeEntryFile,
    setCodeEntryFile,
    codeDependencies,
    setCodeDependencies,
    codeUiMockup,
    setCodeUiMockup,
    codeAgentPlan,
    setCodeAgentPlan,
    codeSkills,
    setCodeSkills,
    codeSkillDiagnostics,
    setCodeSkillDiagnostics,
    codeSkillResourcePlan,
    setCodeSkillResourcePlan,
    codeSkillContext,
    setCodeSkillContext,
    codeDiagnostics,
    setCodeDiagnostics,
    codeEditVersion,
    setCodeEditVersion,
    applyCodeRunSnapshot,
    updateCodeFile,
  };
}
