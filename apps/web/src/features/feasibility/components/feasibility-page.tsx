// Composes feasibility overview, context subviews, and the persisted implementation-plan editor.
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  AlertTriangle,
  CheckCircle2,
  CircleDashed,
  Loader2,
  Network,
  RefreshCw,
  Wrench,
  Wand2,
} from "lucide-react";
import {
  contextDiagramSpecSchema,
  type ContextDiagramSpec,
  type FeasibilityArtifactKind,
  type FeasibilityImplementationPlan,
  type FeasibilityInputs,
} from "@uml-platform/contracts";
import { useWorkspaceRepository } from "../../../services/workspace-repository";
import type { WorkspaceRecord } from "../../../entities/workspace/model";
import { Button } from "../../../shared/ui/button";
import { Badge } from "../../../shared/ui/badge";
import {
  ContextDiagramView,
  type ContextDiagramSection,
} from "../../diagrams/components/diagram-detail-page";
import { TraceabilityMatrixPage } from "../../traceability/components/traceability-matrix-page";
import { acceptedFeasibilityRules, feasibilityArtifactState } from "../lib/feasibility-freshness";
import { buildContextTraceability } from "../lib/context-traceability";
import { useWorkspaceSession } from "../../workspace-session/state";
import { ImplementationPlanDashboard } from "./implementation-plan-dashboard";
import { ModelBentoCard } from "../../workspace-shell/components/model-bento-card";
import { ModelPicker } from "../../../shared/ui/model-picker";
import {
  USER_SETTINGS_CHANGED_EVENT,
  loadUserSettings,
  patchUserSettings,
} from "../../../shared/lib/user-settings";
import { createStartFeasibilityRunInput } from "../../../services/workspace-repository/start-inputs";
import { ApiClientError } from "../../../services/api-client";
import { localizeApiFailure } from "../../../shared/i18n/api-errors";

export type FeasibilityView =
  | "overview"
  | "context"
  | "trace"
  | "elements"
  | "relations"
  | "implementation";

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

type ArtifactKind = FeasibilityArtifactKind;

function StatusBadge({ exists, stale, generating, failed }: { exists: boolean; stale: boolean; generating: boolean; failed: boolean }) {
  const { t } = useTranslation();
  if (generating) return <Badge variant="secondary" className="gap-1"><Loader2 className="size-3 animate-spin" />{t("feasibility.status.generating")}</Badge>;
  if (failed) return <Badge variant="destructive" className="gap-1"><AlertTriangle className="size-3" />{t("feasibility.status.failed")}</Badge>;
  if (stale) return <Badge variant="warning">{t("feasibility.status.stale")}</Badge>;
  if (exists) return <Badge className="gap-1"><CheckCircle2 className="size-3" />{t("feasibility.status.completed")}</Badge>;
  return <Badge variant="secondary" className="gap-1"><CircleDashed className="size-3" />{t("feasibility.status.missing")}</Badge>;
}

export function FeasibilityPage({
  view,
  highlightedElement,
  highlightedRelationshipId,
  initialCandidateId,
  initialSelectedArtifacts,
}: {
  view: FeasibilityView;
  highlightedElement?: { kind: string; id: string } | null;
  highlightedRelationshipId?: string | null;
  initialCandidateId?: string;
  initialSelectedArtifacts?: FeasibilityArtifactKind[];
}) {
  const { t } = useTranslation();
  const repository = useWorkspaceRepository();
  const {
    syncFeasibilityArtifacts,
    feasibilityContextSaveStatus,
    setFeasibilityContextSaveStatus,
    canUpdateWorkspace,
    canStartRuns,
    workspacePermissionReason,
    beginFeasibilityGenerationTask,
    attachFeasibilityGenerationRun,
    updateFeasibilityGenerationTask,
    failFeasibilityGenerationTask,
  } = useWorkspaceSession();
  const [workspace, setWorkspace] = useState<WorkspaceRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [activeArtifacts, setActiveArtifacts] = useState<ArtifactKind[]>([]);
  const [failedArtifacts, setFailedArtifacts] = useState<ArtifactKind[]>([]);
  const [generationMessage, setGenerationMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedArtifacts, setSelectedArtifacts] = useState<ArtifactKind[]>(
    () => initialSelectedArtifacts ?? [],
  );
  const [defaultModel, setDefaultModel] = useState(() => loadUserSettings().defaultModel);

  useEffect(() => {
    const syncSettings = () => setDefaultModel(loadUserSettings().defaultModel);
    window.addEventListener(USER_SETTINGS_CHANGED_EVENT, syncSettings);
    return () => window.removeEventListener(USER_SETTINGS_CHANGED_EVENT, syncSettings);
  }, []);

  const reload = useCallback(async () => {
    const next = await repository.loadWorkspace();
    setWorkspace(next);
    syncFeasibilityArtifacts(next);
    setLoading(false);
  }, [repository, syncFeasibilityArtifacts]);

  useEffect(() => {
    void reload().catch((cause) => {
      setError(cause instanceof ApiClientError ? cause.message : t("feasibility.errors.load"));
      setLoading(false);
    });
  }, [reload, t]);

  const generate = async (selectedArtifacts: ArtifactKind[]) => {
    if (!repository.startFeasibilityRun || !repository.getFeasibilityRunSnapshot) {
      setError(t("feasibility.repositoryUnsupported"));
      return;
    }
    setGenerating(true);
    setActiveArtifacts(selectedArtifacts);
    setFailedArtifacts((current) => current.filter((artifact) => !selectedArtifacts.includes(artifact)));
    setError(null);
    let currentArtifact: ArtifactKind = selectedArtifacts[0] ?? "context";
    let clientTaskId: string | null = null;
    let runFailureMessage: string | null = null;
    try {
      const input = createStartFeasibilityRunInput(selectedArtifacts);
      clientTaskId = beginFeasibilityGenerationTask({
        providerModel: input.providerSettings.model,
        startedAtMs: Date.now(),
      });
      const { runId } = await repository.startFeasibilityRun(input);
      attachFeasibilityGenerationRun(
        clientTaskId,
        runId,
        input.providerSettings.model,
      );
      if (repository.subscribeToFeasibilityRun) {
        await repository.subscribeToFeasibilityRun(runId, (event) => {
          if (clientTaskId) updateFeasibilityGenerationTask(clientTaskId, event);
          if (event.type === "stage_started" || event.type === "stage_progress") {
            currentArtifact = event.stage === "generate_implementation" ? "implementation" : "context";
            setGenerationMessage(
              event.stage === "generate_context"
                ? t("feasibility.generation.context")
                : event.stage === "render_context"
                  ? t("feasibility.generation.rendering")
                  : event.stage === "generate_implementation"
                    ? t("feasibility.generation.implementation")
                    : t("feasibility.generation.waiting"),
            );
          }
          if (event.type === "failed") {
            runFailureMessage = localizeApiFailure({ error: event.error }, 500);
            setError(runFailureMessage);
          }
        });
      } else {
        while (true) {
          const snapshot = await repository.getFeasibilityRunSnapshot(runId);
          currentArtifact = snapshot.currentStage === "generate_implementation" ? "implementation" : "context";
          if (snapshot.status === "completed") break;
          if (snapshot.status === "failed" || snapshot.status === "cancelled") {
            runFailureMessage = snapshot.status === "cancelled"
              ? t("feasibility.errors.cancelled")
              : localizeApiFailure(snapshot.error ? { error: snapshot.error } : null, 500);
            throw new Error(runFailureMessage);
          }
          await sleep(700);
        }
      }
      await sleep(200);
      await reload();
      window.dispatchEvent(
        new CustomEvent("uml-generation-completed", {
          detail: { kind: "feasibility", selectedArtifacts },
        }),
      );
      setGenerationMessage(t("feasibility.generation.completed"));
    } catch (cause) {
      const message = runFailureMessage
        ?? (cause instanceof ApiClientError ? cause.message : t("feasibility.errors.generate"));
      if (clientTaskId) failFeasibilityGenerationTask(clientTaskId, message);
      setFailedArtifacts((current) => Array.from(new Set([...current, currentArtifact])));
      await reload().catch(() => undefined);
      setGenerationMessage(null);
      setError(message);
    } finally {
      setGenerating(false);
      setActiveArtifacts([]);
    }
  };

  const saveContext = async (model: ContextDiagramSpec) => {
    if (!workspace || !repository.renderStructuredModel) return;
    setError(null);
    setGenerationMessage(t("feasibility.contextSave.saving"));
    setFeasibilityContextSaveStatus("saving");
    try {
      const parsed = contextDiagramSpecSchema.parse(model);
      validateContextSources(parsed, acceptedFeasibilityRules(workspace).map((rule) => rule.id));
      const contextTraceability = buildContextTraceability(parsed);
      const rendered = await repository.renderStructuredModel(parsed);
      // Persist the validated model and every derived artifact together, so a render failure cannot replace the last valid version.
      await repository.updateFeasibility?.({
        contextModel: parsed,
        contextTraceability,
        contextPlantUml: rendered.plantUmlSource,
        contextSvg: rendered.svg,
        contextFingerprint: feasibilityArtifactState(workspace).currentContextFingerprint,
      });
      await reload();
      setFeasibilityContextSaveStatus("saved");
      setGenerationMessage(t("feasibility.contextSave.saved"));
    } catch (cause) {
      setFeasibilityContextSaveStatus("error");
      setGenerationMessage(null);
      const message = cause instanceof ApiClientError ? cause.message : t("feasibility.errors.saveContext");
      setError(message);
      throw new Error(message);
    }
  };

  const savePlan = async (plan: FeasibilityImplementationPlan, inputs: FeasibilityInputs, planDirty: boolean) => {
    if (!workspace) return;
    const nextWorkspace = { ...workspace, feasibilityInputs: inputs, feasibilityImplementationPlan: plan };
    const patch: Parameters<NonNullable<typeof repository.updateFeasibility>>[0] = {
      inputs,
      implementationPlan: plan,
    };
    if (planDirty) {
      patch.implementationFingerprint = feasibilityArtifactState(nextWorkspace).currentImplementationFingerprint;
      nextWorkspace.feasibilityImplementationFingerprint = patch.implementationFingerprint;
    }
    await repository.updateFeasibility?.(patch);
    setWorkspace(nextWorkspace);
    setGenerationMessage(t("feasibility.workspaceSaved"));
  };

  if (loading || !workspace) {
    return <div className="flex h-full items-center justify-center text-sm text-muted-foreground"><Loader2 className="mr-2 size-4 animate-spin" />{t("feasibility.loading")}</div>;
  }

  const states = feasibilityArtifactState(workspace);
  const contextExists = states.contextExists;
  const implementationExists = states.implementationExists;
  const acceptedRules = acceptedFeasibilityRules(workspace);
  const latestContextExists = contextExists && !states.contextStale;
  const settings = loadUserSettings();
  const hasProviderModel = Boolean(
    settings.providerConfigId.trim() &&
    defaultModel.trim() &&
    settings.providerModelOptions.includes(defaultModel),
  );
  const generationBlockedReason = !canUpdateWorkspace || !canStartRuns
    ? workspacePermissionReason ?? t("feasibility.runPermissionDenied")
    : acceptedRules.length === 0
      ? t("feasibility.prerequisiteRules")
      : !hasProviderModel
        ? t("feasibility.providerRequired")
        : selectedArtifacts.length === 0
          ? t("feasibility.noArtifactSelected")
          : null;
  const toggleArtifact = (artifact: ArtifactKind, selected: boolean) => {
    if (generating) return;
    setSelectedArtifacts((current) => {
      const next = new Set(current);
      if (selected) {
        next.add(artifact);
        if (artifact === "implementation" && !latestContextExists) next.add("context");
      } else {
        next.delete(artifact);
        if (artifact === "context" && !latestContextExists) next.delete("implementation");
      }
      return (["context", "implementation"] as const).filter((item) => next.has(item));
    });
  };
  const updateModel = (model: string) => {
    setDefaultModel(model);
    patchUserSettings({ defaultModel: model });
  };

  if (view === "trace") {
    return (
      <TraceabilityMatrixPage
        mode="context"
        contextData={{
          model: workspace.feasibilityContextModel,
          traceability: workspace.feasibilityContextTraceability,
          rules: acceptedRules,
          stale: states.contextStale,
        }}
      />
    );
  }

  if (view === "context" || view === "elements" || view === "relations") {
    const section: ContextDiagramSection = view === "elements"
      ? "elements"
      : view === "relations"
        ? "relations"
        : "diagram";
    return (
      <ContextDiagramView
        section={section}
        highlightedElement={highlightedElement}
        highlightedRelationshipId={highlightedRelationshipId}
        data={{
          model: workspace.feasibilityContextModel,
          plantUmlSource: workspace.feasibilityContextPlantUml,
          svgMarkup: workspace.feasibilityContextSvg,
          stale: states.contextStale,
          rules: acceptedRules.map((rule) => ({ id: rule.id, text: rule.text })),
          saveStatus: feasibilityContextSaveStatus,
          statusMessage: generationMessage,
          errorMessage: error,
          headerAction: (
            <Button
              type="button"
              onClick={() => void generate(["context"])}
              disabled={generating || acceptedRules.length === 0 || !canUpdateWorkspace || !canStartRuns || !hasProviderModel}
              title={workspace.rules.length === 0 ? t("feasibility.prerequisiteRules") : undefined}
            >
              {generating ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
              {contextExists ? t("feasibility.regenerate") : t("feasibility.generate")}
            </Button>
          ),
          onSave: saveContext,
        }}
      />
    );
  }

  if (view === "implementation") {
    return (
      <div className="h-full overflow-y-auto bg-background">
        <ImplementationPlanDashboard
          workspace={workspace}
          states={states}
          initialCandidateId={initialCandidateId}
          contextExists={contextExists}
          generating={generating}
          message={generationMessage}
          errorMessage={error}
          onRegenerate={() => generate(["implementation"])}
          onSave={savePlan}
        />
      </div>
    );
  }

  const pageTitle = t("feasibility.title");

  return (
    <div className="h-full overflow-y-auto bg-background">
      <div className="mx-auto flex w-[calc(100%-2rem)] max-w-7xl flex-col gap-5 py-5 lg:w-[calc(100%-3rem)]">
        <header>
          <div>
            <h1 className="text-2xl font-semibold lg:text-3xl">{pageTitle}</h1>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              {t("feasibility.overviewDescription")}
            </p>
          </div>
        </header>

        <section className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-semibold">{t("feasibility.targetArtifacts")}</h2>
              <Badge variant="secondary" className="rounded-full font-mono">
                {selectedArtifacts.length}/2
              </Badge>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {generationMessage && <span aria-live="polite" className="text-xs text-muted-foreground">{generationMessage}</span>}
            <ModelPicker
              value={defaultModel}
              onValueChange={updateModel}
              align="end"
              disabled={generating || !canUpdateWorkspace || !canStartRuns}
              triggerClassName="bg-card"
            />
            <Button
              type="button"
              onClick={() => void generate(selectedArtifacts)}
              disabled={generating || Boolean(generationBlockedReason)}
              title={generationBlockedReason ?? undefined}
            >
              {generating ? <Loader2 className="size-4 animate-spin" /> : <Wand2 className="size-4" />}
              {t("feasibility.generateAnalysis")}
            </Button>
          </div>
        </section>

        {error && <div role="alert" className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"><AlertTriangle className="size-4" />{error}</div>}

        <div className="grid gap-4 md:grid-cols-2">
          <ModelBentoCard
            label={t("feasibility.artifact.context")}
            english="Context Diagram"
            description={t("feasibility.artifact.contextDescription")}
            icon={Network}
            selected={selectedArtifacts.includes("context")}
            disabled={generating || !canUpdateWorkspace || !canStartRuns}
            countLabel={workspace.feasibilityContextTraceability.length}
            ariaLabel={t(selectedArtifacts.includes("context") ? "feasibility.selection.deselectContext" : "feasibility.selection.selectContext")}
            checkboxLabel={t("feasibility.selection.selectContext")}
            onSelectedChange={(selected) => toggleArtifact("context", selected)}
            status={<StatusBadge exists={contextExists} stale={states.contextStale} generating={activeArtifacts.includes("context")} failed={failedArtifacts.includes("context")} />}
          />
          <ModelBentoCard
            label={t("feasibility.artifact.implementation")}
            english="Technical Proposed Solution"
            description={t("feasibility.artifact.implementationArtifactDescription")}
            icon={Wrench}
            selected={selectedArtifacts.includes("implementation")}
            disabled={generating || !canUpdateWorkspace || !canStartRuns}
            countLabel={workspace.feasibilityImplementationPlan?.candidates.length ?? 0}
            ariaLabel={t(selectedArtifacts.includes("implementation") ? "feasibility.selection.deselectImplementation" : "feasibility.selection.selectImplementation")}
            checkboxLabel={t("feasibility.selection.selectImplementation")}
            onSelectedChange={(selected) => toggleArtifact("implementation", selected)}
            status={<StatusBadge exists={implementationExists} stale={states.implementationStale} generating={activeArtifacts.includes("implementation")} failed={failedArtifacts.includes("implementation")} />}
          />
        </div>
      </div>
    </div>
  );
}

function validateContextSources(model: ContextDiagramSpec, validRuleIds: string[]) {
  const validIds = new Set(validRuleIds);
  const elements = [model.system, ...model.people, ...model.externalSystems];
  const elementIds = new Set<string>();
  for (const element of elements) {
    if (elementIds.has(element.id)) throw new Error(`上下文元素标识重复：${element.id}`);
    elementIds.add(element.id);
  }
  if (model.system.id !== "system") throw new Error("中心系统标识必须保持为 system。");
  for (const target of [...model.people, ...model.externalSystems, ...model.relationships]) {
    const invalid = target.sourceRequirementIds.filter((id) => !validIds.has(id));
    if (invalid.length > 0) throw new Error(`来源需求规则已失效：${invalid.join("、")}`);
  }
  for (const relation of model.relationships) {
    if (!elementIds.has(relation.sourceId) || !elementIds.has(relation.targetId)) {
      throw new Error(`关系 ${relation.label} 存在无效端点。`);
    }
  }
}
