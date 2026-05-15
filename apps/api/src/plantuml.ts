import type {
  ActivityDiagramSpec,
  ActivityRelationship,
  ActivityNode,
  ClassAttribute,
  ClassDiagramSpec,
  ClassEntity,
  ClassOperation,
  ClassRelationship,
  DeploymentDiagramSpec,
  DeploymentRelationship,
  DesignDiagramModelSpec,
  DesignPlantUmlArtifact,
  DiagramModelSpec,
  PlantUmlArtifact,
  SequenceDiagramSpec,
  SequenceMessage,
  TableDiagramSpec,
  TableRelationship,
  UseCaseDiagramSpec,
  UseCaseRelationship,
} from "@uml-platform/contracts";

function safeAlias(value: string) {
  return value.replace(/[^A-Za-z0-9_]/g, "_") || "node";
}

function quoteLabel(label: string) {
  return `"${label.replace(/"/g, "'")}"`;
}

function appendNotes(lines: string[], notes: string[]) {
  if (notes.length === 0) {
    return;
  }
  lines.push("note right");
  for (const note of notes) {
    lines.push(note);
  }
  lines.push("end note");
}

function renderUseCaseRelationship(relation: UseCaseRelationship) {
  const source = safeAlias(relation.sourceId);
  const target = safeAlias(relation.targetId);
  const labelParts = [
    relation.label,
    relation.condition ? `条件: ${relation.condition}` : undefined,
    relation.description,
  ].filter(Boolean);
  const suffix = labelParts.length > 0 ? ` : ${labelParts.join(" | ")}` : "";

  switch (relation.type) {
    case "association":
      return `${source} --> ${target}${suffix}`;
    case "include":
      return `${source} ..> ${target} : <<include>>${suffix ? ` ${labelParts.join(" | ")}` : ""}`.trim();
    case "extend":
      return `${source} ..> ${target} : <<extend>>${suffix ? ` ${labelParts.join(" | ")}` : ""}`.trim();
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

function renderClassBlock(entity: ClassEntity) {
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
  if (entity.attributes.length > 0 && entity.operations.length > 0) {
    lines.push("  --");
  }
  for (const operation of entity.operations) {
    lines.push(`  ${formatOperation(operation)}`);
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

  const labelParts = [
    relation.label,
    relation.sourceRole ? `源角色: ${relation.sourceRole}` : undefined,
    relation.targetRole ? `目标角色: ${relation.targetRole}` : undefined,
    relation.description,
  ].filter(Boolean);

  const suffix = labelParts.length > 0 ? ` : ${labelParts.join(" | ")}` : "";
  return `${source}${leftMultiplicity} ${arrow}${rightMultiplicity} ${target}${suffix}`;
}

function renderClass(model: ClassDiagramSpec) {
  const lines = ["@startuml"];

  for (const entity of model.classes) {
    lines.push(...renderClassBlock(entity));
  }

  for (const entity of model.interfaces) {
    lines.push(`interface ${quoteLabel(entity.name)} as ${safeAlias(entity.id)} {`);
    for (const operation of entity.operations) {
      lines.push(`  ${formatOperation(operation)}`);
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
    return (
      relation.guard ??
      relation.condition ??
      relation.trigger ??
      relation.description ??
      fallback
    );
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
          if (!renderedNodes.has(node.id)) {
            lines.push("start");
            if (entryNodes.length > 1 && node.name) {
              lines.push(`:${escapeActivityLabel(node.name)};`);
            }
            renderedNodes.add(node.id);
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
                `${node.name}后续路径`,
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

  const explicitStartNodes = model.nodes.filter((node) => node.type === "start");
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

  const missingNodes = model.nodes.filter(
    (node) => node.type !== "start" && !renderedNodes.has(node.id),
  );
  if (missingNodes.length > 0) {
    currentLane = null;
    lines.push(`partition "未结构化关系补充" {`);
    for (const node of missingNodes) {
      if (node.type === "activity") {
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

  const labelParts = [
    relation.label,
    relation.protocol ? `协议: ${relation.protocol}` : undefined,
    relation.port ? `端口: ${relation.port}` : undefined,
    relation.description,
  ].filter(Boolean);
  const suffix = labelParts.length > 0 ? ` : ${labelParts.join(" | ")}` : "";
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

function participantKeyword(type: SequenceDiagramSpec["participants"][number]["participantType"]) {
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
  const params = message.parameters.length > 0 ? `(${message.parameters.join(", ")})` : "()";
  const returnValue = message.returnValue ? `: ${message.returnValue}` : "";
  const condition = message.condition ? ` [${message.condition}]` : "";
  return `${message.name}${params}${returnValue}${condition}`;
}

function renderSequence(model: SequenceDiagramSpec) {
  const lines = ["@startuml", "autonumber"];

  for (const participant of model.participants) {
    lines.push(
      `${participantKeyword(participant.participantType)} ${quoteLabel(participant.name)} as ${safeAlias(participant.id)}`,
    );
  }

  const fragmentStarts = new Map<string, SequenceDiagramSpec["fragments"]>();
  const fragmentEnds = new Map<string, SequenceDiagramSpec["fragments"]>();
  for (const fragment of model.fragments) {
    const first = fragment.messageIds[0];
    const last = fragment.messageIds[fragment.messageIds.length - 1];
    if (first) {
      fragmentStarts.set(first, [...(fragmentStarts.get(first) ?? []), fragment]);
    }
    if (last) {
      fragmentEnds.set(last, [...(fragmentEnds.get(last) ?? []), fragment]);
    }
  }

  for (const message of model.messages) {
    for (const fragment of fragmentStarts.get(message.id) ?? []) {
      const label = fragment.condition
        ? `${fragment.label} [${fragment.condition}]`
        : fragment.label;
      lines.push(`${fragment.type} ${label}`);
    }

    const source = safeAlias(message.sourceId);
    const target = safeAlias(message.targetId);
    lines.push(`${source} ${sequenceArrow(message)} ${target}: ${sequenceMessageLabel(message)}`);

    if (message.type === "create") {
      lines.push(`activate ${target}`);
    }
    if (message.type === "destroy") {
      lines.push(`destroy ${target}`);
    }

    for (const fragment of [...(fragmentEnds.get(message.id) ?? [])].reverse()) {
      lines.push(`end ${fragment.type}`);
    }
  }

  appendNotes(lines, model.notes);
  return `${lines.join("\n")}\n@enduml`;
}

function tableRelationshipLabel(relation: TableRelationship) {
  if (relation.label) {
    return relation.label;
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
    "!define table(x) entity x << (T,#FFAAAA) >>",
    "hide circle",
    "skinparam linetype ortho",
  ];

  for (const table of model.tables) {
    const primaryColumns = table.columns.filter((column) => column.isPrimaryKey);
    const otherColumns = table.columns.filter((column) => !column.isPrimaryKey);
    lines.push("");
    lines.push(`table(${safeAlias(table.id)}) {`);
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
    switch (model.diagramKind) {
      case "usecase":
        return { diagramKind: model.diagramKind, source: renderUseCase(model) };
      case "class":
        return { diagramKind: model.diagramKind, source: renderClass(model) };
      case "activity":
        return { diagramKind: model.diagramKind, source: renderActivity(model) };
      case "deployment":
        return {
          diagramKind: model.diagramKind,
          source: renderDeployment(model),
        };
    }
  });
}

export function generateDesignPlantUmlArtifacts(
  models: DesignDiagramModelSpec[],
): DesignPlantUmlArtifact[] {
  return models.map((model) => {
    switch (model.diagramKind) {
      case "sequence":
        return { diagramKind: model.diagramKind, source: renderSequence(model) };
      case "class":
        return { diagramKind: model.diagramKind, source: renderClass(model) };
      case "activity":
        return { diagramKind: model.diagramKind, source: renderActivity(model) };
      case "deployment":
        return {
          diagramKind: model.diagramKind,
          source: renderDeployment(model),
        };
      case "table":
        return { diagramKind: model.diagramKind, source: renderTable(model) };
    }
  });
}
