// Converts normalized diagram model objects into PlantUML text expected by downstream rendering.
import type {
  ActivityDiagramSpec,
  ActivityRelationship,
  ActivityNode,
  AnalysisSequenceDiagramSpec,
  ArchitectureDiagramSpec,
  ArchitectureRelationship,
  ClassAttribute,
  ClassDiagramSpec,
  ClassEntity,
  ClassOperation,
  ClassRelationship,
  ComponentRelationship,
  ComponentRelationshipDiagramSpec,
  DeploymentDiagramSpec,
  DeploymentRelationship,
  DesignDiagramModelSpec,
  DesignPlantUmlArtifact,
  DiagramModelSpec,
  FunctionStructureDiagramSpec,
  PlantUmlArtifact,
  PrototypeInterfaceDiagramSpec,
  PrototypeInterfaceRelationship,
  SequenceDiagramSpec,
  SequenceMessage,
  TableDiagramSpec,
  TableRelationship,
  UseCaseDiagramSpec,
  UseCaseRelationship,
} from "@uml-platform/contracts";
import {
  compactDiagramText,
  shortDiagramLabel,
} from "./normalizers/diagrams/relationship-labels.js";

function safeAlias(value: string) {
  return value.replace(/[^A-Za-z0-9_]/g, "_") || "node";
}

function quoteLabel(label: string) {
  return `"${label.replace(/"/g, "'")}"`;
}

function shortLabelPart(value: unknown, maxLength = 18) {
  const label = shortDiagramLabel(value, maxLength);
  return label || undefined;
}

function appendNotes(lines: string[], notes: string[]) {
  if (notes.length === 0) {
    return;
  }
  const diagramNotes = notes
    .map((note) => shortDiagramLabel(compactDiagramText(note), 40))
    .filter((note) => note.length > 0);
  if (diagramNotes.length === 0) {
    return;
  }
  lines.push("note right");
  for (const note of diagramNotes) {
    lines.push(note);
  }
  lines.push("end note");
}

function renderUseCaseRelationship(relation: UseCaseRelationship) {
  const source = safeAlias(relation.sourceId);
  const target = safeAlias(relation.targetId);
  const labelParts = [shortLabelPart(relation.label)].filter(Boolean);
  const suffix = labelParts.length > 0 ? ` : ${labelParts.join(" | ")}` : "";

  switch (relation.type) {
    case "association":
      return `${source} --> ${target}${suffix}`;
    case "include":
      return `${source} ..> ${target} : <<include>>`;
    case "extend":
      return `${source} ..> ${target} : <<extend>>`;
    case "generalization":
      return `${source} --|> ${target}${suffix}`;
  }
}

function renderUseCase(model: UseCaseDiagramSpec) {
  const lines = ["@startuml", "left to right direction"];

  for (const actor of model.actors) {
    lines.push(`actor ${quoteLabel(actor.name)} as ${safeAlias(actor.id)}`);
  }

  const boundaryName = model.systemBoundaries[0]?.name ?? model.title;
  lines.push(`rectangle ${quoteLabel(boundaryName)} {`);
  for (const useCase of model.useCases) {
    lines.push(`  usecase ${quoteLabel(useCase.name)} as ${safeAlias(useCase.id)}`);
  }
  lines.push("}");

  for (const relation of model.relationships) {
    lines.push(renderUseCaseRelationship(relation));
  }

  appendNotes(lines, model.notes);
  return `${lines.join("\n")}\n@enduml`;
}

function wbsLabel(value: unknown, maxLength = 34) {
  return (shortDiagramLabel(value, maxLength) || "未命名功能").replace(/\*/g, "-");
}

function renderFunctionStructure(model: FunctionStructureDiagramSpec) {
  const lines = ["@startwbs", `* ${wbsLabel(model.title)}`];
  const nodesById = new Map(model.nodes.map((node) => [node.id, node]));
  const childrenByParent = new Map<string, FunctionStructureDiagramSpec["nodes"]>();
  const childIds = new Set<string>();

  for (const relationship of model.relationships) {
    if (relationship.type !== "decomposition") continue;
    const parent = relationship.sourceId;
    const child = relationship.targetId;
    const childNode = nodesById.get(child);
    if (!childNode || !nodesById.has(parent)) continue;
    childrenByParent.set(parent, [...(childrenByParent.get(parent) ?? []), childNode]);
    childIds.add(child);
  }

  for (const node of model.nodes) {
    if (!node.parentId) continue;
    const parent = node.parentId;
    if (!nodesById.has(parent)) continue;
    childrenByParent.set(parent, [...(childrenByParent.get(parent) ?? []), node]);
    childIds.add(node.id);
  }

  const roots = model.nodes.filter((node) => !childIds.has(node.id));
  const rendered = new Set<string>();
  const renderNode = (node: FunctionStructureDiagramSpec["nodes"][number], depth: number) => {
    if (rendered.has(node.id)) return;
    rendered.add(node.id);
    lines.push(`${"*".repeat(depth)} ${wbsLabel(node.name)}`);
    for (const child of childrenByParent.get(node.id) ?? []) {
      renderNode(child, depth + 1);
    }
  };

  for (const root of roots.length > 0 ? roots : model.nodes.slice(0, 1)) {
    renderNode(root, 2);
  }

  const unrendered = model.nodes.filter((node) => !rendered.has(node.id));
  if (unrendered.length > 0) {
    lines.push("** 未归类功能");
    for (const node of unrendered) {
      renderNode(node, 3);
    }
  }

  const dependencyNotes = model.relationships.filter(
    (relationship) => relationship.type === "dependency",
  );
  if (dependencyNotes.length > 0) {
    lines.push("** 依赖关系");
    for (const relationship of dependencyNotes) {
      const source = nodesById.get(relationship.sourceId);
      const target = nodesById.get(relationship.targetId);
      const label = wbsLabel(relationship.label ?? relationship.description ?? "依赖", 16);
      lines.push(
        `*** ${wbsLabel(source?.name ?? relationship.sourceId, 18)} -> ${wbsLabel(target?.name ?? relationship.targetId, 18)}: ${label}`,
      );
    }
  }

  if (model.notes.length > 0) {
    lines.push("** 备注");
    for (const note of model.notes) {
      lines.push(`*** ${wbsLabel(note, 42)}`);
    }
  }

  return `${lines.join("\n")}\n@endwbs`;
}

function visibilityToSymbol(visibility: ClassAttribute["visibility"]) {
  switch (visibility) {
    case "public":
      return "+";
    case "protected":
      return "#";
    case "private":
      return "-";
    case "package":
      return "~";
  }
}

function formatAttribute(attribute: ClassAttribute) {
  const prefix = visibilityToSymbol(attribute.visibility);
  const requiredFlag = attribute.required === false ? "?" : "";
  const multiplicity = attribute.multiplicity ? ` [${attribute.multiplicity}]` : "";
  const defaultValue = attribute.defaultValue ? ` = ${attribute.defaultValue}` : "";
  return `${prefix}${attribute.name}${requiredFlag}: ${attribute.type}${multiplicity}${defaultValue}`;
}

function formatOperation(operation: ClassOperation) {
  const prefix = visibilityToSymbol(operation.visibility);
  const parameters = operation.parameters
    .map((parameter) => {
      const direction = parameter.direction ? `${parameter.direction} ` : "";
      const requiredFlag = parameter.required === false ? "?" : "";
      return `${direction}${parameter.name}${requiredFlag}: ${parameter.type}`;
    })
    .join(", ");
  const returnType = operation.returnType ? `: ${operation.returnType}` : "";
  return `${prefix}${operation.name}(${parameters})${returnType}`;
}

function renderClassBlock(entity: ClassEntity, options: { includeOperations?: boolean } = {}) {
  const includeOperations = options.includeOperations ?? true;
  const alias = safeAlias(entity.id);
  const stereotype = entity.stereotype
    ? ` <<${entity.stereotype}>>`
    : entity.classKind
      ? ` <<${entity.classKind}>>`
      : "";
  const lines = [`class ${quoteLabel(entity.name)} as ${alias}${stereotype} {`];
  for (const attribute of entity.attributes) {
    lines.push(`  ${formatAttribute(attribute)}`);
  }
  if (includeOperations && entity.attributes.length > 0 && entity.operations.length > 0) {
    lines.push("  --");
  }
  if (includeOperations) {
    for (const operation of entity.operations) {
      lines.push(`  ${formatOperation(operation)}`);
    }
  }
  lines.push("}");
  return lines;
}

function renderClassRelationship(relation: ClassRelationship) {
  const source = safeAlias(relation.sourceId);
  const target = safeAlias(relation.targetId);
  const leftMultiplicity = relation.sourceMultiplicity
    ? ` "${relation.sourceMultiplicity}"`
    : "";
  const rightMultiplicity = relation.targetMultiplicity
    ? ` "${relation.targetMultiplicity}"`
    : "";

  let arrow = "-->";
  switch (relation.type) {
    case "association":
      arrow =
        relation.navigability === "target-to-source"
          ? "<--"
          : relation.navigability === "bidirectional"
            ? "<-->"
            : "-->";
      break;
    case "aggregation":
      arrow = "o--";
      break;
    case "composition":
      arrow = "*--";
      break;
    case "inheritance":
      arrow = "--|>";
      break;
    case "implementation":
      arrow = "..|>";
      break;
    case "dependency":
      arrow = "..>";
      break;
  }

  const labelParts = [shortLabelPart(relation.label, 16)].filter(Boolean);

  const suffix = labelParts.length > 0 ? ` : ${labelParts.join(" | ")}` : "";
  return `${source}${leftMultiplicity} ${arrow}${rightMultiplicity} ${target}${suffix}`;
}

function renderClass(model: ClassDiagramSpec, options: { includeOperations?: boolean } = {}) {
  const includeOperations = options.includeOperations ?? true;
  const lines = ["@startuml"];

  for (const entity of model.classes) {
    lines.push(...renderClassBlock(entity, { includeOperations }));
  }

  for (const entity of model.interfaces) {
    lines.push(`interface ${quoteLabel(entity.name)} as ${safeAlias(entity.id)} {`);
    if (includeOperations) {
      for (const operation of entity.operations) {
        lines.push(`  ${formatOperation(operation)}`);
      }
    }
    lines.push("}");
  }

  for (const entity of model.enums) {
    lines.push(`enum ${quoteLabel(entity.name)} as ${safeAlias(entity.id)} {`);
    for (const literal of entity.literals) {
      lines.push(`  ${literal}`);
    }
    lines.push("}");
  }

  for (const relation of model.relationships) {
    lines.push(renderClassRelationship(relation));
  }

  appendNotes(lines, model.notes);
  return `${lines.join("\n")}\n@enduml`;
}

function findSwimlaneName(model: ActivityDiagramSpec, laneId?: string) {
  if (!laneId) {
    return null;
  }
  return model.swimlanes.find((lane) => lane.id === laneId)?.name ?? laneId;
}

function escapeActivityLabel(value: string) {
  return value.replace(/;/g, "；");
}

function escapeQuotedActivityLabel(value: string) {
  return escapeActivityLabel(value).replace(/"/g, "'");
}

function renderActivity(model: ActivityDiagramSpec) {
  const lines = ["@startuml"];
  const nodesById = new Map<string, ActivityNode>(
    model.nodes.map((node) => [node.id, node]),
  );
  const activityFlows: ActivityDiagramSpec["relationships"] = model.relationships.filter(
    (relation) => relation.type === "control_flow" || relation.type === "object_flow",
  );
  const outgoing = new Map<string, ActivityDiagramSpec["relationships"]>();
  const incoming = new Map<string, ActivityDiagramSpec["relationships"]>();
  const shouldRenderStartNodesAsActions =
    model.nodes.some((node) => node.type === "start" && node.name.trim().length > 0) &&
    !model.nodes.some(
      (node) =>
        node.type === "activity" ||
        node.type === "decision" ||
        node.type === "fork" ||
        node.type === "join" ||
        node.type === "merge",
    );

  for (const relation of activityFlows) {
    const nextOutgoing = outgoing.get(relation.sourceId) ?? [];
    nextOutgoing.push(relation);
    outgoing.set(relation.sourceId, nextOutgoing);

    const nextIncoming = incoming.get(relation.targetId) ?? [];
    nextIncoming.push(relation);
    incoming.set(relation.targetId, nextIncoming);
  }

  const renderedNodes = new Set<string>();
  let currentLane: string | null = null;
  let sawStop = false;
  let stopCount = 0;

  function pushLane(laneId?: string) {
    const lane = findSwimlaneName(model, laneId);
    if (!lane || lane === currentLane) {
      return;
    }
    lines.push(`|${lane}|`);
    currentLane = lane;
  }

  function firstRenderableLane(startId?: string) {
    let currentId = startId;
    const seen = new Set<string>();
    while (currentId && !seen.has(currentId)) {
      seen.add(currentId);
      const node = nodesById.get(currentId);
      if (!node) {
        return null;
      }
      if (node.type === "activity" && node.actorOrLane) {
        return node.actorOrLane;
      }
      const next = outgoing.get(currentId)?.[0]?.targetId;
      if (!next) {
        return null;
      }
      currentId = next;
    }
    return null;
  }

  function findCommonTerminal(branchStartIds: string[]) {
    return findCommonContinuation(branchStartIds, (node) =>
      node.type === "merge" || node.type === "join" || node.type === "end",
      true,
    );
  }

  function collectLinearPath(
    startId: string,
    stopAt: (node: ActivityNode) => boolean = () => false,
  ) {
    const path: string[] = [];
    let currentId: string | undefined = startId;
    const seen = new Set<string>();

    while (currentId && !seen.has(currentId)) {
      seen.add(currentId);
      const node = nodesById.get(currentId);
      if (!node) {
        break;
      }

      path.push(currentId);
      if (node.type === "end" || stopAt(node)) {
        break;
      }

      const nextOutgoing: ActivityRelationship[] = outgoing.get(currentId) ?? [];
      if (node.type === "decision" || node.type === "fork" || nextOutgoing.length !== 1) {
        break;
      }
      currentId = nextOutgoing[0]?.targetId;
    }

    return path;
  }

  function findCommonContinuation(
    branchStartIds: string[],
    isCandidate: (node: ActivityNode) => boolean = () => true,
    stopAtCandidate = false,
  ) {
    const paths = branchStartIds.map((branchStartId) =>
      collectLinearPath(
        branchStartId,
        stopAtCandidate ? isCandidate : () => false,
      ),
    );
    if (paths.length === 0 || paths.some((path) => path.length === 0)) {
      return null;
    }

    const otherPathSets = paths.slice(1).map((path) => new Set(path));
    return (
      paths[0].find((nodeId) => {
        const node = nodesById.get(nodeId);
        return (
          node &&
          isCandidate(node) &&
          otherPathSets.every((path) => path.has(nodeId))
        );
      }) ?? null
    );
  }

  function followSingleOutgoing(nodeId?: string) {
    if (!nodeId) {
      return undefined;
    }
    const nextOutgoing: ActivityRelationship[] = outgoing.get(nodeId) ?? [];
    return nextOutgoing.length === 1 ? nextOutgoing[0]?.targetId : undefined;
  }

  function branchLabel(relation: ActivityRelationship, fallback: string) {
    return shortDiagramLabel(
      relation.guard ??
        relation.condition ??
        relation.trigger ??
        relation.description ??
        fallback,
      14,
    ) || fallback;
  }

  function escapeConditionLabel(value: string) {
    return escapeActivityLabel(value)
      .replace(/\(/g, "（")
      .replace(/\)/g, "）");
  }

  function renderBranches(
    question: string,
    branches: ActivityRelationship[],
    stopBefore: Set<string>,
    pathSeen: Set<string>,
  ) {
    const commonContinuation = findCommonContinuation(
      branches.map((branch) => branch.targetId),
    );
    const branchStopBefore = new Set(stopBefore);
    if (commonContinuation) {
      branchStopBefore.add(commonContinuation);
    }

    branches.forEach((branch, index) => {
      const label = escapeConditionLabel(
        branchLabel(branch, index === 0 ? "是" : index === branches.length - 1 ? "否" : `分支${index + 1}`),
      );
      if (index === 0) {
        lines.push(`if (${escapeConditionLabel(question)}) then (${label})`);
      } else if (index === branches.length - 1) {
        lines.push(`else (${label})`);
      } else {
        lines.push(`elseif (${escapeConditionLabel(question)}) then (${label})`);
      }
      renderSequence(branch.targetId, branchStopBefore, new Set(pathSeen));
    });
    lines.push("endif");

    return commonContinuation;
  }

  function renderSequence(
    currentId?: string,
    stopBefore = new Set<string>(),
    pathSeen = new Set<string>(),
  ) {
    let nodeId = currentId;
    while (nodeId && !stopBefore.has(nodeId)) {
      if (pathSeen.has(nodeId)) {
        return undefined;
      }
      pathSeen.add(nodeId);
      const node = nodesById.get(nodeId);
      if (!node) {
        return undefined;
      }

      switch (node.type) {
        case "start":
          // LLM output can occasionally wire a timer/start marker into an existing flow.
          if ((incoming.get(node.id) ?? []).length > 0) {
            if (shouldRenderStartNodesAsActions && node.name) {
              lines.push(`:${escapeActivityLabel(node.name)};`);
            }
            renderedNodes.add(node.id);
            {
              const branches = outgoing.get(node.id) ?? [];
              if (branches.length > 1) {
                const commonContinuation = renderBranches(
                  node.name || "路径选择",
                  branches,
                  stopBefore,
                  pathSeen,
                );
                if (!commonContinuation) {
                  return undefined;
                }
                nodeId = commonContinuation;
                continue;
              }
            }
            nodeId = followSingleOutgoing(node.id);
            continue;
          }
          if (!renderedNodes.has(node.id)) {
            lines.push("start");
            if ((shouldRenderStartNodesAsActions || entryNodes.length > 1) && node.name) {
              lines.push(`:${escapeActivityLabel(node.name)};`);
            }
            renderedNodes.add(node.id);
          }
          {
            const branches = outgoing.get(node.id) ?? [];
            if (branches.length > 1) {
              const commonContinuation = renderBranches(
                node.name || "路径选择",
                branches,
                stopBefore,
                pathSeen,
              );
              if (!commonContinuation) {
                return undefined;
              }
              nodeId = commonContinuation;
              continue;
            }
          }
          nodeId = followSingleOutgoing(node.id);
          continue;
        case "end":
          lines.push("stop");
          sawStop = true;
          stopCount += 1;
          renderedNodes.add(node.id);
          return undefined;
        case "activity":
          pushLane(node.actorOrLane);
          lines.push(`:${escapeActivityLabel(node.name)};`);
          renderedNodes.add(node.id);
          {
            const branches = outgoing.get(node.id) ?? [];
            if (branches.length > 1) {
              const commonContinuation = renderBranches(
                node.name || "路径选择",
                branches,
                stopBefore,
                pathSeen,
              );
              if (!commonContinuation) {
                return undefined;
              }
              nodeId = commonContinuation;
              continue;
            }
          }
          nodeId = followSingleOutgoing(node.id);
          continue;
        case "merge":
        case "join":
          renderedNodes.add(node.id);
          nodeId = followSingleOutgoing(node.id);
          continue;
        case "decision": {
          const branches = outgoing.get(node.id) ?? [];
          renderedNodes.add(node.id);
          if (branches.length < 2) {
            nodeId = branches[0]?.targetId;
            continue;
          }

          const question = node.question ?? node.name ?? "条件判断";
          const commonContinuation = renderBranches(
            question,
            branches,
            stopBefore,
            pathSeen,
          );
          if (!commonContinuation) {
            return undefined;
          }

          nodeId = commonContinuation;
          continue;
        }
        case "fork": {
          const branches = outgoing.get(node.id) ?? [];
          renderedNodes.add(node.id);
          if (branches.length < 2) {
            nodeId = branches[0]?.targetId;
            continue;
          }

          const joinId = findCommonTerminal(branches.map((branch) => branch.targetId));
          if (!joinId || nodesById.get(joinId)?.type !== "join") {
            nodeId = branches[0]?.targetId;
            continue;
          }

          lines.push("fork");
          branches.forEach((branch, index) => {
            if (index > 0) {
              lines.push("fork again");
            }
            renderSequence(branch.targetId, new Set([joinId]));
          });
          lines.push("end fork");

          nodeId = followSingleOutgoing(joinId);
          renderedNodes.add(joinId);
          continue;
        }
      }
    }
    return nodeId;
  }

  const explicitStartNodes = model.nodes.filter(
    (node) => node.type === "start" && (incoming.get(node.id) ?? []).length === 0,
  );
  const sourceNodes = model.nodes.filter(
    (node) =>
      node.type !== "end" &&
      (incoming.get(node.id) ?? []).length === 0 &&
      !explicitStartNodes.some((startNode) => startNode.id === node.id),
  );
  const entryNodes =
    explicitStartNodes.length > 0
      ? [...explicitStartNodes, ...sourceNodes]
      : sourceNodes.length > 0
        ? sourceNodes
        : model.nodes[0]
          ? [model.nodes[0]]
          : [];

  for (const entryNode of entryNodes) {
    if (renderedNodes.has(entryNode.id) && entryNode.type !== "start") {
      continue;
    }
    currentLane = null;
    const initialLane = firstRenderableLane(entryNode.id);
    if (initialLane) {
      pushLane(initialLane);
    }
    const stopsBeforeEntry = stopCount;
    renderSequence(entryNode.id);
    if (stopsBeforeEntry === stopCount) {
      lines.push("stop");
      sawStop = true;
      stopCount += 1;
    }
  }

  const missingNodes = model.nodes.filter((node) => {
    if (renderedNodes.has(node.id)) return false;
    if (node.type !== "start") return true;
    return (
      shouldRenderStartNodesAsActions &&
      ((incoming.get(node.id) ?? []).length > 0 || (outgoing.get(node.id) ?? []).length > 0)
    );
  });
  if (missingNodes.length > 0) {
    currentLane = null;
    lines.push(`partition "未结构化关系补充" {`);
    for (const node of missingNodes) {
      if (node.type === "start") {
        lines.push(`:${escapeActivityLabel(node.name)};`);
      } else if (node.type === "activity") {
        pushLane(node.actorOrLane);
        lines.push(`:${escapeActivityLabel(node.name)};`);
      } else if (node.type === "decision") {
        lines.push(`:${escapeActivityLabel(node.question ?? node.name ?? node.id)};`);
      } else if (node.type === "merge" || node.type === "join") {
        lines.push(`:${escapeActivityLabel(node.name ?? node.id)};`);
      } else if (node.type === "end") {
        lines.push(`:${escapeActivityLabel(node.name)};`);
      }
      renderedNodes.add(node.id);
    }

    const missingRelationshipNotes = activityFlows
      .filter(
        (relation) =>
          missingNodes.some((node) => node.id === relation.sourceId) ||
          missingNodes.some((node) => node.id === relation.targetId),
      )
      .map((relation) => {
        const source = nodesById.get(relation.sourceId);
        const target = nodesById.get(relation.targetId);
        const label = branchLabel(relation, relation.type);
        return `${source?.name ?? source?.id ?? relation.sourceId} -> ${target?.name ?? target?.id ?? relation.targetId}: ${label}`;
      });
    if (missingRelationshipNotes.length > 0) {
      lines.push("note right");
      for (const note of missingRelationshipNotes) {
        lines.push(escapeQuotedActivityLabel(note));
      }
      lines.push("end note");
    }
    lines.push("}");
  }

  if (!sawStop) {
    lines.push("stop");
  }

  appendNotes(lines, model.notes);
  return `${lines.join("\n")}\n@enduml`;
}

function deploymentConnectionLabel(relation: DeploymentRelationship) {
  const label = shortLabelPart(relation.label, 16);
  const protocol = shortDiagramLabel(relation.protocol, 10);
  const port = compactDiagramText(relation.port);
  const endpoint = protocol && port ? `${protocol}:${port}` : protocol || (port ? `端口:${port}` : "");
  return [label, endpoint || undefined].filter(Boolean).join(" / ");
}

function renderDeploymentRelationship(relation: DeploymentRelationship) {
  const source = safeAlias(relation.sourceId);
  const target = safeAlias(relation.targetId);
  let arrow = "-->";
  switch (relation.type) {
    case "deployment":
      arrow = "..>";
      break;
    case "communication":
      arrow = relation.direction === "two-way" ? "<-->" : "-->";
      break;
    case "dependency":
      arrow = "..>";
      break;
    case "hosting":
      arrow = "-->";
      break;
  }

  const label = deploymentConnectionLabel(relation);
  const suffix = label ? ` : ${label}` : "";
  return `${source} ${arrow} ${target}${suffix}`;
}

function renderDeployment(model: DeploymentDiagramSpec) {
  const lines = ["@startuml"];

  for (const node of model.nodes) {
    const alias = safeAlias(node.id);
    const stereotype = node.environment ? ` <<${node.environment}>>` : "";
    const keyword = node.nodeType === "container" ? "node" : "node";
    lines.push(`${keyword} ${quoteLabel(node.name)} as ${alias}${stereotype}`);
  }

  for (const database of model.databases) {
    lines.push(`database ${quoteLabel(database.name)} as ${safeAlias(database.id)}`);
  }

  for (const component of model.components) {
    const stereotype = component.componentType
      ? ` <<${component.componentType}>>`
      : "";
    lines.push(
      `component ${quoteLabel(component.name)} as ${safeAlias(component.id)}${stereotype}`,
    );
  }

  for (const system of model.externalSystems) {
    lines.push(`cloud ${quoteLabel(system.name)} as ${safeAlias(system.id)}`);
  }

  for (const artifact of model.artifacts) {
    const stereotype = artifact.artifactType ? ` <<${artifact.artifactType}>>` : "";
    lines.push(
      `artifact ${quoteLabel(artifact.name)} as ${safeAlias(artifact.id)}${stereotype}`,
    );
  }

  for (const relation of model.relationships) {
    lines.push(renderDeploymentRelationship(relation));
  }

  appendNotes(lines, model.notes);
  return `${lines.join("\n")}\n@enduml`;
}

type SequenceLikeDiagramSpec = Pick<
  SequenceDiagramSpec | AnalysisSequenceDiagramSpec,
  "participants" | "messages" | "fragments" | "notes" | "title" | "sourceUseCaseName"
>;

function participantKeyword(type: SequenceLikeDiagramSpec["participants"][number]["participantType"]) {
  switch (type) {
    case "actor":
      return "actor";
    case "boundary":
      return "boundary";
    case "control":
      return "control";
    case "entity":
      return "entity";
    case "database":
      return "database";
    case "external":
      return "participant";
    case "service":
      return "participant";
  }
}

function sequenceArrow(message: SequenceMessage) {
  switch (message.type) {
    case "async":
      return "->>";
    case "return":
      return "-->";
    case "create":
      return "->";
    case "destroy":
      return "->";
    case "sync":
      return "->";
  }
}

function sequenceMessageLabel(message: SequenceMessage) {
  const visibleParams = message.parameters.slice(0, 3).map((parameter) =>
    shortDiagramLabel(parameter, 18),
  );
  const paramsSuffix = message.parameters.length > visibleParams.length ? ", …" : "";
  const params =
    visibleParams.length > 0 ? `(${visibleParams.join(", ")}${paramsSuffix})` : "()";
  const returnValue = message.returnValue
    ? `: ${shortDiagramLabel(message.returnValue, 14)}`
    : "";
  const condition = message.condition
    ? ` [${shortDiagramLabel(message.condition, 14)}]`
    : "";
  return `${shortDiagramLabel(message.name, 20) || message.name}${params}${returnValue}${condition}`;
}

function renderSequence(
  model: SequenceLikeDiagramSpec,
  options: { layer: "analysis" | "design" },
) {
  const layerTitle =
    options.layer === "analysis" ? "需求分析模型" : "用例实现设计";
  const layerNote =
    options.layer === "analysis"
      ? "需求阶段：描述业务交互、系统责任和分支规则，不代表实现调用。"
      : "设计阶段：将需求分析转换为对象职责、方法调用和持久化/服务协作。";
  const titleSubject = model.sourceUseCaseName ?? model.title;
  const lines = [
    "@startuml",
    `title ${quoteLabel(`${layerTitle}：${titleSubject}`)}`,
    options.layer === "analysis"
      ? "skinparam ParticipantBorderColor #2563eb"
      : "skinparam ParticipantBorderColor #7c3aed",
    options.layer === "analysis"
      ? "skinparam ParticipantBackgroundColor #eff6ff"
      : "skinparam ParticipantBackgroundColor #f5f3ff",
    "autonumber",
    `legend left\n${layerNote}\nendlegend`,
  ];

  for (const participant of model.participants) {
    lines.push(
      `${participantKeyword(participant.participantType)} ${quoteLabel(participant.name)} as ${safeAlias(participant.id)}`,
    );
  }

  const fragmentStarts = new Map<string, SequenceDiagramSpec["fragments"]>();
  const fragmentEnds = new Map<string, SequenceDiagramSpec["fragments"]>();
  const branchFragmentStarts = new Map<string, SequenceDiagramSpec["fragments"][number]>();
  for (const fragment of model.fragments) {
    const branchFirst =
      fragment.type === "alt" && fragment.branches && fragment.branches.length > 1
        ? fragment.branches[0]?.messageIds[0]
        : undefined;
    if (branchFirst) {
      branchFragmentStarts.set(branchFirst, fragment);
      continue;
    }
    const first = fragment.messageIds[0];
    const last = fragment.messageIds[fragment.messageIds.length - 1];
    if (first) {
      fragmentStarts.set(first, [...(fragmentStarts.get(first) ?? []), fragment]);
    }
    if (last) {
      fragmentEnds.set(last, [...(fragmentEnds.get(last) ?? []), fragment]);
    }
  }

  const messagesById = new Map(model.messages.map((message) => [message.id, message]));
  const renderedMessageIds = new Set<string>();

  const renderMessageLine = (message: SequenceMessage) => {
    const source = safeAlias(message.sourceId);
    const target = safeAlias(message.targetId);
    lines.push(`${source} ${sequenceArrow(message)} ${target}: ${sequenceMessageLabel(message)}`);

    if (message.type === "create") {
      lines.push(`activate ${target}`);
    }
    if (message.type === "destroy") {
      lines.push(`destroy ${target}`);
    }
  };

  const branchLabel = (branch: NonNullable<SequenceDiagramSpec["fragments"][number]["branches"]>[number]) => {
    const label = shortDiagramLabel(branch.label, 14) || branch.label;
    const condition = branch.condition ? shortDiagramLabel(branch.condition, 14) : "";
    return condition ? `${label} [${condition}]` : label;
  };

  const renderBranchFragment = (fragment: SequenceDiagramSpec["fragments"][number]) => {
    const branches = fragment.branches ?? [];
    branches.forEach((branch, index) => {
      if (index === 0) {
        lines.push(`alt ${branchLabel(branch)}`);
      } else {
        lines.push(`else ${branchLabel(branch)}`);
      }
      for (const messageId of branch.messageIds) {
        const branchMessage = messagesById.get(messageId);
        if (!branchMessage) continue;
        renderMessageLine(branchMessage);
        renderedMessageIds.add(messageId);
      }
    });
    lines.push("end");
  };

  for (const message of model.messages) {
    if (renderedMessageIds.has(message.id)) continue;
    const branchFragment = branchFragmentStarts.get(message.id);
    if (branchFragment) {
      renderBranchFragment(branchFragment);
      continue;
    }

    for (const fragment of fragmentStarts.get(message.id) ?? []) {
      const label = fragment.condition
        ? `${shortDiagramLabel(fragment.label, 16) || fragment.label} [${shortDiagramLabel(fragment.condition, 14)}]`
        : shortDiagramLabel(fragment.label, 16) || fragment.label;
      lines.push(`${fragment.type} ${label}`);
    }

    renderMessageLine(message);
    renderedMessageIds.add(message.id);

    for (const fragment of [...(fragmentEnds.get(message.id) ?? [])].reverse()) {
      lines.push("end");
    }
  }

  appendNotes(lines, model.notes);
  return `${lines.join("\n")}\n@enduml`;
}

function prototypeRelationshipArrow(relation: PrototypeInterfaceRelationship) {
  switch (relation.type) {
    case "contains":
      return "*-->";
    case "returns":
      return "<--";
    case "depends-on":
      return "..>";
    case "opens":
    case "submits":
    case "navigation":
      return "-->";
  }
}

function prototypeRelationshipLabel(relation: PrototypeInterfaceRelationship) {
  return shortLabelPart(relation.label, 16) ?? "";
}

function renderPrototype(model: PrototypeInterfaceDiagramSpec) {
  const lines = ["@startuml", "left to right direction", "skinparam componentStyle rectangle"];

  for (const node of model.nodes) {
    const alias = safeAlias(node.id);
    const label = node.route ? `${node.name}\\n${node.route}` : node.name;
    if (node.nodeType === "module") {
      lines.push(`package ${quoteLabel(label)} as ${alias}`);
    } else if (node.nodeType === "entry-point") {
      lines.push(`interface ${quoteLabel(label)} as ${alias}`);
    } else {
      lines.push(`component ${quoteLabel(label)} as ${alias}`);
    }
  }

  for (const relation of model.relationships) {
    const label = prototypeRelationshipLabel(relation);
    const suffix = label ? ` : ${label}` : "";
    lines.push(
      `${safeAlias(relation.sourceId)} ${prototypeRelationshipArrow(relation)} ${safeAlias(relation.targetId)}${suffix}`,
    );
  }

  appendNotes(lines, model.notes);
  return `${lines.join("\n")}\n@enduml`;
}

function architectureRelationshipArrow(relation: ArchitectureRelationship) {
  switch (relation.type) {
    case "contains":
      return "*--";
    case "communication":
      return "-->";
    case "dependency":
      return "..>";
  }
}

function renderArchitecture(model: ArchitectureDiagramSpec) {
  const lines = [
    "@startuml",
    "left to right direction",
    "skinparam componentStyle rectangle",
  ];
  const componentsByPackage = new Map<string, ArchitectureDiagramSpec["components"]>();
  const packagedComponentIds = new Set<string>();

  for (const component of model.components) {
    const packageId =
      component.packageId ??
      model.packages.find((packageItem) =>
        packageItem.componentIds.includes(component.id),
      )?.id;
    if (!packageId) continue;
    componentsByPackage.set(packageId, [
      ...(componentsByPackage.get(packageId) ?? []),
      component,
    ]);
    packagedComponentIds.add(component.id);
  }

  for (const packageItem of model.packages) {
    const stereotype = packageItem.stereotype ? ` <<${packageItem.stereotype}>>` : "";
    lines.push(`package ${quoteLabel(packageItem.name)} as ${safeAlias(packageItem.id)}${stereotype} {`);
    for (const component of componentsByPackage.get(packageItem.id) ?? []) {
      const componentStereotype = component.componentType
        ? ` <<${component.componentType}>>`
        : "";
      lines.push(
        `  component ${quoteLabel(component.name)} as ${safeAlias(component.id)}${componentStereotype}`,
      );
    }
    lines.push("}");
  }

  for (const component of model.components) {
    if (packagedComponentIds.has(component.id)) continue;
    const stereotype = component.componentType ? ` <<${component.componentType}>>` : "";
    lines.push(
      `component ${quoteLabel(component.name)} as ${safeAlias(component.id)}${stereotype}`,
    );
  }

  for (const relation of model.relationships) {
    const label = shortLabelPart(relation.label, 16);
    const suffix = label ? ` : ${label}` : "";
    lines.push(
      `${safeAlias(relation.sourceId)} ${architectureRelationshipArrow(relation)} ${safeAlias(relation.targetId)}${suffix}`,
    );
  }

  appendNotes(lines, model.notes);
  return `${lines.join("\n")}\n@enduml`;
}

function componentRelationshipArrow(relation: ComponentRelationship) {
  switch (relation.type) {
    case "provided-interface":
      return "..|>";
    case "required-interface":
    case "dependency":
      return "..>";
    case "composition":
      return "*--";
    case "communication":
      return "-->";
  }
}

function renderComponentRelationship(model: ComponentRelationshipDiagramSpec) {
  const lines = [
    "@startuml",
    "left to right direction",
    "skinparam componentStyle rectangle",
  ];

  for (const component of model.components) {
    const stereotype = component.componentType ? ` <<${component.componentType}>>` : "";
    lines.push(
      `component ${quoteLabel(component.name)} as ${safeAlias(component.id)}${stereotype}`,
    );
  }

  for (const componentInterface of model.interfaces) {
    lines.push(`interface ${quoteLabel(componentInterface.name)} as ${safeAlias(componentInterface.id)} {`);
    for (const operationName of componentInterface.operationNames) {
      lines.push(`  ${operationName}()`);
    }
    lines.push("}");
  }

  for (const relation of model.relationships) {
    const label = shortLabelPart(relation.label, 16);
    const suffix = label ? ` : ${label}` : "";
    lines.push(
      `${safeAlias(relation.sourceId)} ${componentRelationshipArrow(relation)} ${safeAlias(relation.targetId)}${suffix}`,
    );
  }

  appendNotes(lines, model.notes);
  return `${lines.join("\n")}\n@enduml`;
}

function tableRelationshipLabel(relation: TableRelationship) {
  if (relation.label) {
    return shortDiagramLabel(relation.label, 16);
  }
  switch (relation.type) {
    case "one-to-one":
      return "1对1";
    case "one-to-many":
      return "1对多";
    case "many-to-many":
      return "多对多";
  }
}

function tableRelationshipArrow(relation: TableRelationship) {
  switch (relation.type) {
    case "one-to-one":
      return "||--||";
    case "one-to-many":
      return "||--o{";
    case "many-to-many":
      return "}o--o{";
  }
}

function renderTable(model: TableDiagramSpec) {
  const lines = [
    "@startuml",
    "hide circle",
    "skinparam linetype ortho",
  ];

  for (const table of model.tables) {
    const primaryColumns = table.columns.filter((column) => column.isPrimaryKey);
    const otherColumns = table.columns.filter((column) => !column.isPrimaryKey);
    lines.push("");
    lines.push(
      `entity ${quoteLabel(table.name)} as ${safeAlias(table.id)} << (T,#FFAAAA) >> {`,
    );
    for (const column of primaryColumns) {
      const markers = [
        column.isPrimaryKey ? "<<PK>>" : "",
        column.isForeignKey ? "<<FK>>" : "",
      ].filter(Boolean);
      lines.push(`  * ${column.name} : ${column.dataType} ${markers.join(" ")}`.trimEnd());
    }
    if (primaryColumns.length > 0 && otherColumns.length > 0) {
      lines.push("  --");
    }
    for (const column of otherColumns) {
      const markers = [
        column.isPrimaryKey ? "<<PK>>" : "",
        column.isForeignKey ? "<<FK>>" : "",
      ].filter(Boolean);
      const nullable = column.nullable === false ? " <<NOT NULL>>" : "";
      lines.push(
        `  ${column.name} : ${column.dataType} ${markers.join(" ")}${nullable}`.trimEnd(),
      );
    }
    lines.push("}");
  }

  for (const relation of model.relationships) {
    lines.push(
      `${safeAlias(relation.sourceTableId)} ${tableRelationshipArrow(relation)} ${safeAlias(relation.targetTableId)} : ${quoteLabel(tableRelationshipLabel(relation))}`,
    );
  }

  appendNotes(lines, model.notes);
  return `${lines.join("\n")}\n@enduml`;
}

export function generatePlantUmlArtifacts(
  models: DiagramModelSpec[],
): PlantUmlArtifact[] {
  return models.map((model) => {
    const modelId = "modelId" in model ? model.modelId : undefined;
    switch (model.diagramKind) {
      case "function":
        return {
          modelId,
          diagramKind: model.diagramKind,
          source: renderFunctionStructure(model),
        };
      case "usecase":
        return { modelId, diagramKind: model.diagramKind, source: renderUseCase(model) };
      case "class":
        return {
          modelId,
          diagramKind: model.diagramKind,
          source: renderClass(model, { includeOperations: false }),
        };
      case "activity":
        return { modelId, diagramKind: model.diagramKind, source: renderActivity(model) };
      case "deployment":
        return {
          modelId,
          diagramKind: model.diagramKind,
          source: renderDeployment(model),
        };
      case "prototype":
        return {
          modelId,
          diagramKind: model.diagramKind,
          source: renderPrototype(model),
        };
      case "analysis":
        return {
          modelId,
          diagramKind: model.diagramKind,
          source: renderSequence(model, { layer: "analysis" }),
        };
    }
  });
}

export function generateDesignPlantUmlArtifacts(
  models: DesignDiagramModelSpec[],
): DesignPlantUmlArtifact[] {
  return models.map((model) => {
    switch (model.diagramKind) {
      case "architecture":
        return {
          modelId: model.modelId,
          diagramKind: model.diagramKind,
          source: renderArchitecture(model),
        };
      case "sequence":
        return {
          modelId: model.modelId,
          diagramKind: model.diagramKind,
          source: renderSequence(model, { layer: "design" }),
        };
      case "class":
        return {
          modelId: model.modelId,
          diagramKind: model.diagramKind,
          source: renderClass(model),
        };
      case "activity":
        return {
          modelId: model.modelId,
          diagramKind: model.diagramKind,
          source: renderActivity(model),
        };
      case "component":
        return {
          modelId: model.modelId,
          diagramKind: model.diagramKind,
          source: renderComponentRelationship(model),
        };
      case "deployment":
        return {
          modelId: model.modelId,
          diagramKind: model.diagramKind,
          source: renderDeployment(model),
        };
      case "table":
        return {
          modelId: model.modelId,
          diagramKind: model.diagramKind,
          source: renderTable(model),
        };
    }
  });
}
