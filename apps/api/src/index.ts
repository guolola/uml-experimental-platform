import cors from "@fastify/cors";
import Fastify, { type FastifyInstance } from "fastify";
import { fileURLToPath } from "node:url";
import { realpathSync } from "node:fs";
import { resolve } from "node:path";
import { createHash, randomUUID } from "node:crypto";
import {
  AlignmentType,
  Document,
  HeadingLevel,
  ImageRun,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from "docx";
import { ZodError } from "zod";
import {
  artifactReadyRunEventSchema,
  codeAppBlueprintResultSchema,
  codeAgentPlanResultSchema,
  codeGenerationSpecSchema,
  codeFilePlanResultSchema,
  codeFileChangedRunEventSchema,
  codeFileOperationsResultSchema,
  codeQualityDiagnosticSchema,
  codeRunSnapshotSchema,
  codeUiIrResultSchema,
  codeVisualDiffReportSchema,
  codeUiFidelityReportResultSchema,
  codeUiMockupSchema,
  codeUiBlueprintResultSchema,
  codeUiReferenceSpecResultSchema,
  designDiagramKindSchema,
  documentContentResultSchema,
  documentRunSnapshotSchema,
  completedRunEventSchema,
  designDiagramModelsResultSchema,
  designRunSnapshotSchema,
  diagramErrorSchema,
  diagramModelsResultSchema,
  failedRunEventSchema,
  llmChunkRunEventSchema,
  providerSettingsSchema,
  queuedRunEventSchema,
  renderPngRequestSchema,
  renderPngResponseSchema,
  repairPlantUmlResultSchema,
  renderSvgRequestSchema,
  renderSvgResponseSchema,
  requirementRulesResultSchema,
  runSnapshotSchema,
  startDesignRunRequestSchema,
  startDesignRunResponseSchema,
  startCodeRunRequestSchema,
  startCodeRunResponseSchema,
  startDocumentRunRequestSchema,
  startDocumentRunResponseSchema,
  stageProgressRunEventSchema,
  stageStartedRunEventSchema,
  startRunRequestSchema,
  startRunResponseSchema,
  type CodeFileOperation,
  type CodeAppBlueprint,
  type CodeFilePlan,
  type CodeGenerationSpec,
  type CodeUiIr,
  type CodeQualityDiagnostic,
  type CodeRunSnapshot,
  type CodeUiBlueprint,
  type CodeUiFidelityReport,
  type CodeUiMockup,
  type CodeUiReferenceSpec,
  type CodeVisualDiffReport,
  type DocumentKind,
  type DocumentRunSnapshot,
  type DocumentSection,
  type DesignDiagramKind,
  type DesignDiagramModelSpec,
  type DesignPlantUmlArtifact,
  type DesignRunSnapshot,
  type DesignSvgArtifact,
  type DiagramKind,
  type DiagramError,
  type DiagramModelSpec,
  type ImageProviderSettings,
  type PlantUmlArtifact,
  type ProviderSettings,
  type RenderPngResponse,
  type RequirementRule,
  type RunEvent,
  type RunSnapshot,
  type RunStage,
  type StartDocumentRunRequest,
  type SvgArtifact,
  type UmlDiagramKind,
} from "@uml-platform/contracts";
import {
  JSON_ONLY_SYSTEM_PROMPT,
  buildAnalyzeCodeUiMockupPrompt,
  buildGenerateCodeAppBlueprintPrompt,
  buildExtractRulesPrompt,
  buildGenerateCodeAgentPlanPrompt,
  buildGenerateCodeFilePlanPrompt,
  buildGenerateCodeFileOperationsPrompt,
  buildGenerateCodeUiIrPrompt,
  buildGenerateCodeUiMockupPrompt,
  buildGenerateCodeUiBlueprintPrompt,
  buildVerifyCodeUiFidelityPrompt,
  buildGenerateDocumentContentPrompt,
  buildGenerateDesignModelsPrompt,
  buildGenerateDesignSequencePrompt,
  buildGenerateModelsPrompt,
  buildRepairCodeFileOperationsPrompt,
  buildRepairDesignModelsPrompt,
  buildRepairModelsPrompt,
  buildRepairPlantUmlPrompt,
} from "@uml-platform/prompts";
import {
  createRealLlmTransport,
  createRealImageGenerationClient,
  type ChatCompletionResponseFormat,
  type ChatMessage,
  type ImageGenerationClient,
  type LlmTransport,
} from "./llm.js";
import { getModelCapability } from "./model-capabilities.js";
import {
  generateDesignPlantUmlArtifacts,
  generatePlantUmlArtifacts,
} from "./plantuml.js";

const DEFAULT_PORT = Number(process.env.API_PORT ?? 4001);
const DEFAULT_HOST = process.env.API_HOST ?? "127.0.0.1";
const DEFAULT_RENDER_SERVICE_BASE_URL =
  process.env.RENDER_SERVICE_BASE_URL ?? "http://127.0.0.1:4002";
const MAX_UI_FIDELITY_REPAIR_ROUNDS = 2;
const DEFAULT_LOCAL_CORS_ORIGINS = [
  "http://localhost:5173",
  "http://localhost:5174",
  "http://localhost:5175",
  "http://localhost:5176",
  "http://127.0.0.1:5173",
  "http://127.0.0.1:5174",
  "http://127.0.0.1:5175",
  "http://127.0.0.1:5176",
];
const RELEASE_STARTED_AT =
  process.env.UML_RELEASE_STARTED_AT ?? new Date().toISOString();
const DEFAULT_SSE_ALLOW_ORIGIN = "http://localhost:5173";
const MAX_PLANTUML_REPAIR_ATTEMPTS = 2;
const MAX_MODEL_REPAIR_ATTEMPTS = 2;
const MAX_CODE_OPERATION_REPAIR_ATTEMPTS = 2;
const DESIGN_DOWNSTREAM_DIAGRAMS: DesignDiagramKind[] = [
  "activity",
  "class",
  "deployment",
];
const DESIGN_DIAGRAM_ORDER: DesignDiagramKind[] = [
  "sequence",
  "class",
  "activity",
  "deployment",
  "table",
];

type AnyPlantUmlArtifact = { diagramKind: UmlDiagramKind; source: string };
type AnyDiagramModelSpec = DiagramModelSpec | DesignDiagramModelSpec;
type AnySvgArtifact = SvgArtifact | DesignSvgArtifact;

const GENERATE_MODELS_RESPONSE_FORMAT: ChatCompletionResponseFormat = {
  type: "json_schema",
  json_schema: {
    name: "diagram_models_result",
    strict: true,
    schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        models: {
          type: "array",
          items: {
            oneOf: [
              {
                type: "object",
                additionalProperties: false,
                properties: {
                  diagramKind: { type: "string", enum: ["usecase"] },
                  title: { type: "string" },
                  summary: { type: "string" },
                  notes: {
                    type: "array",
                    items: { type: "string" },
                  },
                  actors: {
                    type: "array",
                    items: {
                      type: "object",
                      additionalProperties: false,
                      properties: {
                        id: { type: "string" },
                        name: { type: "string" },
                        actorType: {
                          type: "string",
                          enum: ["human", "system", "external"],
                        },
                        description: { type: "string" },
                        responsibilities: {
                          type: "array",
                          items: { type: "string" },
                        },
                      },
                      required: [
                        "id",
                        "name",
                        "actorType",
                        "responsibilities",
                      ],
                    },
                  },
                  useCases: {
                    type: "array",
                    items: {
                      type: "object",
                      additionalProperties: false,
                      properties: {
                        id: { type: "string" },
                        name: { type: "string" },
                        goal: { type: "string" },
                        description: { type: "string" },
                        preconditions: {
                          type: "array",
                          items: { type: "string" },
                        },
                        postconditions: {
                          type: "array",
                          items: { type: "string" },
                        },
                        primaryActorId: { type: "string" },
                        supportingActorIds: {
                          type: "array",
                          items: { type: "string" },
                        },
                      },
                      required: [
                        "id",
                        "name",
                        "goal",
                        "preconditions",
                        "postconditions",
                        "supportingActorIds",
                      ],
                    },
                  },
                  systemBoundaries: {
                    type: "array",
                    items: {
                      type: "object",
                      additionalProperties: false,
                      properties: {
                        id: { type: "string" },
                        name: { type: "string" },
                        description: { type: "string" },
                      },
                      required: ["id", "name"],
                    },
                  },
                  relationships: {
                    type: "array",
                    items: {
                      type: "object",
                      additionalProperties: false,
                      properties: {
                        id: { type: "string" },
                        type: {
                          type: "string",
                          enum: [
                            "association",
                            "include",
                            "extend",
                            "generalization",
                          ],
                        },
                        sourceId: { type: "string" },
                        targetId: { type: "string" },
                        label: { type: "string" },
                        condition: { type: "string" },
                        description: { type: "string" },
                      },
                      required: ["id", "type", "sourceId", "targetId"],
                    },
                  },
                },
                required: [
                  "diagramKind",
                  "title",
                  "summary",
                  "notes",
                  "actors",
                  "useCases",
                  "systemBoundaries",
                  "relationships",
                ],
              },
              {
                type: "object",
                additionalProperties: false,
                properties: {
                  diagramKind: { type: "string", enum: ["class"] },
                  title: { type: "string" },
                  summary: { type: "string" },
                  notes: {
                    type: "array",
                    items: { type: "string" },
                  },
                  classes: {
                    type: "array",
                    items: {
                      type: "object",
                      additionalProperties: false,
                      properties: {
                        id: { type: "string" },
                        name: { type: "string" },
                        classKind: {
                          type: "string",
                          enum: [
                            "entity",
                            "aggregate",
                            "valueObject",
                            "service",
                            "other",
                          ],
                        },
                        stereotype: { type: "string" },
                        description: { type: "string" },
                        attributes: {
                          type: "array",
                          items: {
                            type: "object",
                            additionalProperties: false,
                            properties: {
                              name: { type: "string" },
                              type: { type: "string" },
                              visibility: {
                                type: "string",
                                enum: ["public", "protected", "private", "package"],
                              },
                              required: { type: "boolean" },
                              multiplicity: { type: "string" },
                              defaultValue: { type: "string" },
                              description: { type: "string" },
                            },
                            required: ["name", "type", "visibility"],
                          },
                        },
                        operations: {
                          type: "array",
                          items: {
                            type: "object",
                            additionalProperties: false,
                            properties: {
                              name: { type: "string" },
                              returnType: { type: "string" },
                              visibility: {
                                type: "string",
                                enum: ["public", "protected", "private", "package"],
                              },
                              parameters: {
                                type: "array",
                                items: {
                                  type: "object",
                                  additionalProperties: false,
                                  properties: {
                                    name: { type: "string" },
                                    type: { type: "string" },
                                    required: { type: "boolean" },
                                    direction: {
                                      type: "string",
                                      enum: ["in", "out", "inout"],
                                    },
                                  },
                                  required: ["name", "type"],
                                },
                              },
                              description: { type: "string" },
                            },
                            required: ["name", "visibility", "parameters"],
                          },
                        },
                      },
                      required: ["id", "name", "attributes", "operations"],
                    },
                  },
                  interfaces: {
                    type: "array",
                    items: {
                      type: "object",
                      additionalProperties: false,
                      properties: {
                        id: { type: "string" },
                        name: { type: "string" },
                        description: { type: "string" },
                        operations: {
                          type: "array",
                          items: {
                            type: "object",
                            additionalProperties: false,
                            properties: {
                              name: { type: "string" },
                              returnType: { type: "string" },
                              visibility: {
                                type: "string",
                                enum: ["public", "protected", "private", "package"],
                              },
                              parameters: {
                                type: "array",
                                items: {
                                  type: "object",
                                  additionalProperties: false,
                                  properties: {
                                    name: { type: "string" },
                                    type: { type: "string" },
                                    required: { type: "boolean" },
                                    direction: {
                                      type: "string",
                                      enum: ["in", "out", "inout"],
                                    },
                                  },
                                  required: ["name", "type"],
                                },
                              },
                              description: { type: "string" },
                            },
                            required: ["name", "visibility", "parameters"],
                          },
                        },
                      },
                      required: ["id", "name", "operations"],
                    },
                  },
                  enums: {
                    type: "array",
                    items: {
                      type: "object",
                      additionalProperties: false,
                      properties: {
                        id: { type: "string" },
                        name: { type: "string" },
                        literals: {
                          type: "array",
                          items: { type: "string" },
                        },
                      },
                      required: ["id", "name", "literals"],
                    },
                  },
                  relationships: {
                    type: "array",
                    items: {
                      type: "object",
                      additionalProperties: false,
                      properties: {
                        id: { type: "string" },
                        type: {
                          type: "string",
                          enum: [
                            "association",
                            "aggregation",
                            "composition",
                            "inheritance",
                            "implementation",
                            "dependency",
                          ],
                        },
                        sourceId: { type: "string" },
                        targetId: { type: "string" },
                        sourceRole: { type: "string" },
                        targetRole: { type: "string" },
                        sourceMultiplicity: { type: "string" },
                        targetMultiplicity: { type: "string" },
                        navigability: {
                          type: "string",
                          enum: [
                            "none",
                            "source-to-target",
                            "target-to-source",
                            "bidirectional",
                          ],
                        },
                        label: { type: "string" },
                        description: { type: "string" },
                      },
                      required: ["id", "type", "sourceId", "targetId"],
                    },
                  },
                },
                required: [
                  "diagramKind",
                  "title",
                  "summary",
                  "notes",
                  "classes",
                  "interfaces",
                  "enums",
                  "relationships",
                ],
              },
              {
                type: "object",
                additionalProperties: false,
                properties: {
                  diagramKind: { type: "string", enum: ["activity"] },
                  title: { type: "string" },
                  summary: { type: "string" },
                  notes: {
                    type: "array",
                    items: { type: "string" },
                  },
                  swimlanes: {
                    type: "array",
                    items: {
                      type: "object",
                      additionalProperties: false,
                      properties: {
                        id: { type: "string" },
                        name: { type: "string" },
                        description: { type: "string" },
                      },
                      required: ["id", "name"],
                    },
                  },
                  nodes: {
                    type: "array",
                    items: {
                      oneOf: [
                        {
                          type: "object",
                          additionalProperties: false,
                          properties: {
                            id: { type: "string" },
                            type: { type: "string", enum: ["start"] },
                            name: { type: "string" },
                            description: { type: "string" },
                          },
                          required: ["id", "type", "name"],
                        },
                        {
                          type: "object",
                          additionalProperties: false,
                          properties: {
                            id: { type: "string" },
                            type: { type: "string", enum: ["end"] },
                            name: { type: "string" },
                            description: { type: "string" },
                          },
                          required: ["id", "type", "name"],
                        },
                        {
                          type: "object",
                          additionalProperties: false,
                          properties: {
                            id: { type: "string" },
                            type: { type: "string", enum: ["activity"] },
                            name: { type: "string" },
                            description: { type: "string" },
                            actorOrLane: { type: "string" },
                            input: {
                              type: "array",
                              items: { type: "string" },
                            },
                            output: {
                              type: "array",
                              items: { type: "string" },
                            },
                          },
                          required: ["id", "type", "name", "input", "output"],
                        },
                        {
                          type: "object",
                          additionalProperties: false,
                          properties: {
                            id: { type: "string" },
                            type: { type: "string", enum: ["decision"] },
                            name: { type: "string" },
                            question: { type: "string" },
                            description: { type: "string" },
                          },
                          required: ["id", "type"],
                        },
                        {
                          type: "object",
                          additionalProperties: false,
                          properties: {
                            id: { type: "string" },
                            type: { type: "string", enum: ["merge"] },
                            name: { type: "string" },
                            description: { type: "string" },
                          },
                          required: ["id", "type"],
                        },
                        {
                          type: "object",
                          additionalProperties: false,
                          properties: {
                            id: { type: "string" },
                            type: { type: "string", enum: ["fork"] },
                            name: { type: "string" },
                            description: { type: "string" },
                          },
                          required: ["id", "type"],
                        },
                        {
                          type: "object",
                          additionalProperties: false,
                          properties: {
                            id: { type: "string" },
                            type: { type: "string", enum: ["join"] },
                            name: { type: "string" },
                            description: { type: "string" },
                          },
                          required: ["id", "type"],
                        },
                      ],
                    },
                  },
                  relationships: {
                    type: "array",
                    items: {
                      type: "object",
                      additionalProperties: false,
                      properties: {
                        id: { type: "string" },
                        type: {
                          type: "string",
                          enum: ["control_flow", "object_flow"],
                        },
                        sourceId: { type: "string" },
                        targetId: { type: "string" },
                        condition: { type: "string" },
                        guard: { type: "string" },
                        trigger: { type: "string" },
                        description: { type: "string" },
                      },
                      required: ["id", "type", "sourceId", "targetId"],
                    },
                  },
                },
                required: [
                  "diagramKind",
                  "title",
                  "summary",
                  "notes",
                  "swimlanes",
                  "nodes",
                  "relationships",
                ],
              },
              {
                type: "object",
                additionalProperties: false,
                properties: {
                  diagramKind: { type: "string", enum: ["deployment"] },
                  title: { type: "string" },
                  summary: { type: "string" },
                  notes: {
                    type: "array",
                    items: { type: "string" },
                  },
                  nodes: {
                    type: "array",
                    items: {
                      type: "object",
                      additionalProperties: false,
                      properties: {
                        id: { type: "string" },
                        name: { type: "string" },
                        nodeType: {
                          type: "string",
                          enum: ["app", "server", "device", "container", "external"],
                        },
                        environment: { type: "string" },
                        description: { type: "string" },
                      },
                      required: ["id", "name", "nodeType"],
                    },
                  },
                  databases: {
                    type: "array",
                    items: {
                      type: "object",
                      additionalProperties: false,
                      properties: {
                        id: { type: "string" },
                        name: { type: "string" },
                        engine: { type: "string" },
                        description: { type: "string" },
                      },
                      required: ["id", "name"],
                    },
                  },
                  components: {
                    type: "array",
                    items: {
                      type: "object",
                      additionalProperties: false,
                      properties: {
                        id: { type: "string" },
                        name: { type: "string" },
                        componentType: { type: "string" },
                        description: { type: "string" },
                      },
                      required: ["id", "name"],
                    },
                  },
                  externalSystems: {
                    type: "array",
                    items: {
                      type: "object",
                      additionalProperties: false,
                      properties: {
                        id: { type: "string" },
                        name: { type: "string" },
                        description: { type: "string" },
                      },
                      required: ["id", "name"],
                    },
                  },
                  artifacts: {
                    type: "array",
                    items: {
                      type: "object",
                      additionalProperties: false,
                      properties: {
                        id: { type: "string" },
                        name: { type: "string" },
                        artifactType: { type: "string" },
                        description: { type: "string" },
                      },
                      required: ["id", "name"],
                    },
                  },
                  relationships: {
                    type: "array",
                    items: {
                      type: "object",
                      additionalProperties: false,
                      properties: {
                        id: { type: "string" },
                        type: {
                          type: "string",
                          enum: ["deployment", "communication", "dependency", "hosting"],
                        },
                        sourceId: { type: "string" },
                        targetId: { type: "string" },
                        protocol: { type: "string" },
                        port: { type: "string" },
                        direction: {
                          type: "string",
                          enum: ["one-way", "two-way", "inbound", "outbound"],
                        },
                        label: { type: "string" },
                        description: { type: "string" },
                      },
                      required: ["id", "type", "sourceId", "targetId"],
                    },
                  },
                },
                required: [
                  "diagramKind",
                  "title",
                  "summary",
                  "notes",
                  "nodes",
                  "databases",
                  "components",
                  "externalSystems",
                  "artifacts",
                  "relationships",
                ],
              },
            ],
          },
        },
      },
      required: ["models"],
    },
  },
};

const requirementModelOneOf = (
  (
    GENERATE_MODELS_RESPONSE_FORMAT.json_schema.schema.properties as {
      models: { items: { oneOf: Record<string, unknown>[] } };
    }
  ).models.items.oneOf
);

const GENERATE_DESIGN_MODELS_RESPONSE_FORMAT: ChatCompletionResponseFormat = {
  type: "json_schema",
  json_schema: {
    name: "design_diagram_models_result",
    strict: true,
    schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        models: {
          type: "array",
          items: {
            oneOf: [
              {
                type: "object",
                additionalProperties: false,
                properties: {
                  diagramKind: { type: "string", enum: ["sequence"] },
                  title: { type: "string" },
                  summary: { type: "string" },
                  notes: { type: "array", items: { type: "string" } },
                  participants: {
                    type: "array",
                    items: {
                      type: "object",
                      additionalProperties: false,
                      properties: {
                        id: { type: "string" },
                        name: { type: "string" },
                        participantType: {
                          type: "string",
                          enum: [
                            "actor",
                            "boundary",
                            "control",
                            "entity",
                            "service",
                            "database",
                            "external",
                          ],
                        },
                        description: { type: "string" },
                      },
                      required: ["id", "name", "participantType"],
                    },
                  },
                  messages: {
                    type: "array",
                    items: {
                      type: "object",
                      additionalProperties: false,
                      properties: {
                        id: { type: "string" },
                        type: {
                          type: "string",
                          enum: ["sync", "async", "return", "create", "destroy"],
                        },
                        sourceId: { type: "string" },
                        targetId: { type: "string" },
                        name: { type: "string" },
                        parameters: { type: "array", items: { type: "string" } },
                        returnValue: { type: "string" },
                        condition: { type: "string" },
                        description: { type: "string" },
                      },
                      required: [
                        "id",
                        "type",
                        "sourceId",
                        "targetId",
                        "name",
                        "parameters",
                      ],
                    },
                  },
                  fragments: {
                    type: "array",
                    items: {
                      type: "object",
                      additionalProperties: false,
                      properties: {
                        id: { type: "string" },
                        type: { type: "string", enum: ["alt", "opt", "loop", "par"] },
                        label: { type: "string" },
                        messageIds: { type: "array", items: { type: "string" } },
                        condition: { type: "string" },
                        description: { type: "string" },
                      },
                      required: ["id", "type", "label", "messageIds"],
                    },
                  },
                },
                required: [
                  "diagramKind",
                  "title",
                  "summary",
                  "notes",
                  "participants",
                  "messages",
                  "fragments",
                ],
              },
              ...requirementModelOneOf.filter((schema) => {
                const diagramKind = (
                  schema.properties as { diagramKind?: { enum?: string[] } }
                ).diagramKind?.enum?.[0];
                return diagramKind !== "usecase";
              }),
            ],
          },
        },
      },
      required: ["models"],
    },
  },
};

const GENERATE_CODE_SPEC_RESPONSE_FORMAT: ChatCompletionResponseFormat = {
  type: "json_schema",
  json_schema: {
    name: "code_generation_spec_result",
    strict: true,
    schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        spec: {
          type: "object",
          additionalProperties: false,
          properties: {
            appName: { type: "string" },
            summary: { type: "string" },
            theme: {
              type: "object",
              additionalProperties: false,
              properties: {
                name: { type: "string" },
                primaryColor: { type: "string" },
                backgroundColor: { type: "string" },
                surfaceColor: { type: "string" },
                textColor: { type: "string" },
                accentColor: { type: "string" },
                density: { type: "string", enum: ["compact", "comfortable"] },
                tone: { type: "string" },
              },
              required: [
                "name",
                "primaryColor",
                "backgroundColor",
                "surfaceColor",
                "textColor",
                "accentColor",
                "density",
                "tone",
              ],
            },
            pages: {
              type: "array",
              items: {
                type: "object",
                additionalProperties: false,
                properties: {
                  id: { type: "string" },
                  name: { type: "string" },
                  route: { type: "string" },
                  purpose: { type: "string" },
                  sourceDiagramIds: { type: "array", items: { type: "string" } },
                },
                required: ["id", "name", "route", "purpose", "sourceDiagramIds"],
              },
            },
            components: {
              type: "array",
              items: {
                type: "object",
                additionalProperties: false,
                properties: {
                  id: { type: "string" },
                  name: { type: "string" },
                  responsibility: { type: "string" },
                  sourceDiagramIds: { type: "array", items: { type: "string" } },
                },
                required: ["id", "name", "responsibility", "sourceDiagramIds"],
              },
            },
            interactions: {
              type: "array",
              items: {
                type: "object",
                additionalProperties: false,
                properties: {
                  id: { type: "string" },
                  trigger: { type: "string" },
                  behavior: { type: "string" },
                  sourceDiagramIds: { type: "array", items: { type: "string" } },
                },
                required: ["id", "trigger", "behavior", "sourceDiagramIds"],
              },
            },
            dataEntities: {
              type: "array",
              items: {
                type: "object",
                additionalProperties: false,
                properties: {
                  id: { type: "string" },
                  name: { type: "string" },
                  fields: {
                    type: "array",
                    items: {
                      type: "object",
                      additionalProperties: false,
                      properties: {
                        name: { type: "string" },
                        type: { type: "string" },
                        required: { type: "boolean" },
                      },
                      required: ["name", "type", "required"],
                    },
                  },
                  sourceDiagramIds: { type: "array", items: { type: "string" } },
                },
                required: ["id", "name", "fields", "sourceDiagramIds"],
              },
            },
            implementationNotes: {
              type: "array",
              items: { type: "string" },
            },
          },
          required: [
            "appName",
            "summary",
            "theme",
            "pages",
            "components",
            "interactions",
            "dataEntities",
            "implementationNotes",
          ],
        },
      },
      required: ["spec"],
    },
  },
};

const GENERATE_CODE_FILES_RESPONSE_FORMAT: ChatCompletionResponseFormat = {
  type: "json_schema",
  json_schema: {
    name: "code_file_bundle_result",
    strict: true,
    schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        bundle: {
          type: "object",
          additionalProperties: false,
          properties: {
            files: {
              type: "object",
              additionalProperties: { type: "string" },
            },
            entryFile: { type: "string" },
            dependencies: {
              type: "object",
              additionalProperties: { type: "string" },
            },
          },
          required: ["files", "entryFile", "dependencies"],
        },
      },
      required: ["bundle"],
    },
  },
};

const CODE_PAGE_RESPONSE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    id: { type: "string" },
    name: { type: "string" },
    route: { type: "string" },
    purpose: { type: "string" },
    sourceDiagramIds: { type: "array", items: { type: "string" } },
  },
  required: ["id", "name", "route", "purpose", "sourceDiagramIds"],
};

const CODE_THEME_RESPONSE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    name: { type: "string" },
    primaryColor: { type: "string" },
    backgroundColor: { type: "string" },
    surfaceColor: { type: "string" },
    textColor: { type: "string" },
    accentColor: { type: "string" },
    density: { type: "string", enum: ["compact", "comfortable"] },
    tone: { type: "string" },
  },
  required: [
    "name",
    "primaryColor",
    "backgroundColor",
    "surfaceColor",
    "textColor",
    "accentColor",
    "density",
    "tone",
  ],
};

const GENERATE_CODE_APP_BLUEPRINT_RESPONSE_FORMAT: ChatCompletionResponseFormat = {
  type: "json_schema",
  json_schema: {
    name: "code_app_blueprint_result",
    strict: true,
    schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        appBlueprint: {
          type: "object",
          additionalProperties: false,
          properties: {
            appName: { type: "string" },
            domain: { type: "string" },
            targetUsers: { type: "array", items: { type: "string" } },
            coreWorkflow: { type: "string" },
            pages: { type: "array", items: CODE_PAGE_RESPONSE_SCHEMA },
            successCriteria: { type: "array", items: { type: "string" } },
          },
          required: [
            "appName",
            "domain",
            "targetUsers",
            "coreWorkflow",
            "pages",
            "successCriteria",
          ],
        },
      },
      required: ["appBlueprint"],
    },
  },
};

const GENERATE_CODE_UI_BLUEPRINT_RESPONSE_FORMAT: ChatCompletionResponseFormat = {
  type: "json_schema",
  json_schema: {
    name: "code_ui_blueprint_result",
    strict: true,
    schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        uiBlueprint: {
          type: "object",
          additionalProperties: false,
          properties: {
            theme: CODE_THEME_RESPONSE_SCHEMA,
            visualLanguage: { type: "string" },
            navigationModel: { type: "string" },
            layoutPrinciples: { type: "array", items: { type: "string" } },
            componentGuidelines: { type: "array", items: { type: "string" } },
            stateGuidelines: { type: "array", items: { type: "string" } },
          },
          required: [
            "theme",
            "visualLanguage",
            "navigationModel",
            "layoutPrinciples",
            "componentGuidelines",
            "stateGuidelines",
          ],
        },
      },
      required: ["uiBlueprint"],
    },
  },
};

const GENERATE_CODE_UI_REFERENCE_RESPONSE_FORMAT: ChatCompletionResponseFormat = {
  type: "json_schema",
  json_schema: {
    name: "code_ui_reference_spec_result",
    strict: true,
    schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        uiReferenceSpec: {
          type: "object",
          additionalProperties: false,
          properties: {
            layoutStructure: { type: "array", items: { type: "string" } },
            navigation: { type: "string" },
            colorPalette: { type: "array", items: { type: "string" } },
            componentShapes: { type: "array", items: { type: "string" } },
            informationDensity: { type: "string" },
            keyBusinessAreas: { type: "array", items: { type: "string" } },
            stateExpressions: { type: "array", items: { type: "string" } },
            implementationGuidelines: { type: "array", items: { type: "string" } },
            fallbackReason: { type: ["string", "null"] },
          },
          required: [
            "layoutStructure",
            "navigation",
            "colorPalette",
            "componentShapes",
            "informationDensity",
            "keyBusinessAreas",
            "stateExpressions",
            "implementationGuidelines",
            "fallbackReason",
          ],
        },
      },
      required: ["uiReferenceSpec"],
    },
  },
};

const GENERATE_CODE_UI_FIDELITY_RESPONSE_FORMAT: ChatCompletionResponseFormat = {
  type: "json_schema",
  json_schema: {
    name: "code_ui_fidelity_report_result",
    strict: true,
    schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        uiFidelityReport: {
          type: "object",
          additionalProperties: false,
          properties: {
            passed: { type: "boolean" },
            matched: { type: "array", items: { type: "string" } },
            missing: { type: "array", items: { type: "string" } },
            repairSuggestions: { type: "array", items: { type: "string" } },
            summary: { type: "string" },
          },
          required: ["passed", "matched", "missing", "repairSuggestions", "summary"],
        },
      },
      required: ["uiFidelityReport"],
    },
  },
};

function createCodeComponentTreeNodeResponseSchema(depth: number): Record<string, unknown> {
  const childSchema =
    depth > 0
      ? createCodeComponentTreeNodeResponseSchema(depth - 1)
      : {
          type: "object",
          additionalProperties: false,
          properties: {
            component: { type: "string" },
            purpose: { type: "string" },
            props: { type: "object", additionalProperties: { type: "string" } },
            dataBinding: { type: ["string", "null"] },
            tokenRefs: { type: "array", items: { type: "string" } },
            children: { type: "array", maxItems: 0, items: { type: "object" } },
          },
          required: [
            "component",
            "purpose",
            "props",
            "dataBinding",
            "tokenRefs",
            "children",
          ],
        };

  return {
    type: "object",
    additionalProperties: false,
    properties: {
      component: { type: "string" },
      purpose: { type: "string" },
      props: { type: "object", additionalProperties: { type: "string" } },
      dataBinding: { type: ["string", "null"] },
      tokenRefs: { type: "array", items: { type: "string" } },
      children: { type: "array", items: childSchema },
    },
    required: [
      "component",
      "purpose",
      "props",
      "dataBinding",
      "tokenRefs",
      "children",
    ],
  };
}

const CODE_DESIGN_TOKENS_RESPONSE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    colors: { type: "object", additionalProperties: { type: "string" } },
    typography: { type: "object", additionalProperties: { type: "string" } },
    spacing: { type: "object", additionalProperties: { type: "string" } },
    radius: { type: "object", additionalProperties: { type: "string" } },
    shadow: { type: "object", additionalProperties: { type: "string" } },
    density: { type: "string", enum: ["compact", "comfortable"] },
  },
  required: ["colors", "typography", "spacing", "radius", "shadow", "density"],
};

const CODE_COMPONENT_REGISTRY_RESPONSE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    components: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          name: { type: "string" },
          description: { type: "string" },
          props: { type: "array", items: { type: "string" } },
          variants: { type: "array", items: { type: "string" } },
          usageRules: { type: "array", items: { type: "string" } },
        },
        required: ["name", "description", "props", "variants", "usageRules"],
      },
    },
  },
  required: ["components"],
};

const GENERATE_CODE_UI_IR_RESPONSE_FORMAT: ChatCompletionResponseFormat = {
  type: "json_schema",
  json_schema: {
    name: "code_ui_ir_result",
    strict: true,
    schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        uiIr: {
          type: "object",
          additionalProperties: false,
          properties: {
            designTokens: CODE_DESIGN_TOKENS_RESPONSE_SCHEMA,
            componentRegistry: CODE_COMPONENT_REGISTRY_RESPONSE_SCHEMA,
            pages: {
              type: "array",
              items: {
                type: "object",
                additionalProperties: false,
                properties: {
                  id: { type: "string" },
                  route: { type: "string" },
                  name: { type: "string" },
                  layout: { type: "string" },
                  primaryActions: { type: "array", items: { type: "string" } },
                  componentTree: createCodeComponentTreeNodeResponseSchema(4),
                },
                required: [
                  "id",
                  "route",
                  "name",
                  "layout",
                  "primaryActions",
                  "componentTree",
                ],
              },
            },
            dataBindings: { type: "array", items: { type: "string" } },
            interactions: { type: "array", items: { type: "string" } },
            responsiveRules: { type: "array", items: { type: "string" } },
          },
          required: [
            "designTokens",
            "componentRegistry",
            "pages",
            "dataBindings",
            "interactions",
            "responsiveRules",
          ],
        },
      },
      required: ["uiIr"],
    },
  },
};

const GENERATE_CODE_FILE_PLAN_RESPONSE_FORMAT: ChatCompletionResponseFormat = {
  type: "json_schema",
  json_schema: {
    name: "code_file_plan_result",
    strict: true,
    schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        filePlan: {
          type: "object",
          additionalProperties: false,
          properties: {
            entryFile: { type: "string" },
            files: {
              type: "array",
              items: {
                type: "object",
                additionalProperties: false,
                properties: {
                  path: { type: "string" },
                  kind: {
                    type: "string",
                    enum: ["entry", "page", "component", "domain", "data", "style", "lib"],
                  },
                  responsibility: { type: "string" },
                },
                required: ["path", "kind", "responsibility"],
              },
            },
          },
          required: ["entryFile", "files"],
        },
      },
      required: ["filePlan"],
    },
  },
};

const GENERATE_CODE_AGENT_PLAN_RESPONSE_FORMAT: ChatCompletionResponseFormat = {
  type: "json_schema",
  json_schema: {
    name: "code_agent_plan_result",
    strict: true,
    schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        plan: {
          type: "array",
          items: { type: "string" },
        },
      },
      required: ["plan"],
    },
  },
};

const GENERATE_CODE_FILE_OPERATIONS_RESPONSE_FORMAT: ChatCompletionResponseFormat =
  {
    type: "json_schema",
    json_schema: {
      name: "code_file_operations_result",
      strict: true,
      schema: {
        type: "object",
        additionalProperties: false,
        properties: {
          operations: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              properties: {
                operation: {
                  type: "string",
                  enum: ["create_file", "update_file", "set_entry_file", "note"],
                },
                path: { type: "string" },
                content: { type: "string" },
                reason: { type: "string" },
                message: { type: "string" },
              },
              required: ["operation", "path", "content", "reason", "message"],
            },
          },
        },
        required: ["operations"],
      },
    },
  };

type RenderClient = (artifact: AnyPlantUmlArtifact) => Promise<{
  svg: string;
  renderMeta: {
    engine: string;
    generatedAt: string;
    sourceLength: number;
    durationMs: number;
  };
}>;

type PngRenderClient = (artifact: AnyPlantUmlArtifact) => Promise<{
  png: Buffer;
  renderMeta: RenderPngResponse["renderMeta"];
}>;

interface RunRecord {
  snapshot: RunSnapshot | DesignRunSnapshot | CodeRunSnapshot | DocumentRunSnapshot;
  events: RunEvent[];
  listeners: Set<(event: RunEvent) => void>;
  terminal: boolean;
  documentBuffer?: Buffer;
}

function logFailedStructuredOutput(
  stage: RunStage,
  model: string,
  error: unknown,
  rawText: string,
  attempt?: number,
) {
  const header = [
    "[llm-structured-output-failed]",
    `stage=${stage}`,
    `model=${model}`,
    attempt ? `attempt=${attempt}` : null,
    `error=${formatParseError(error)}`,
  ]
    .filter(Boolean)
    .join(" ");

  console.error(
    `${header}\n--- begin raw output ---\n${rawText}\n--- end raw output ---`,
  );
}

function createEmptySnapshot(
  runId: string,
  requirementText: string,
  selectedDiagrams: DiagramKind[],
): RunSnapshot {
  return runSnapshotSchema.parse({
    runId,
    requirementText,
    selectedDiagrams,
    rules: [],
    models: [],
    plantUml: [],
    svgArtifacts: [],
    diagramErrors: {},
    currentStage: null,
    status: "queued",
    errorMessage: null,
  });
}

function withSequenceDependency(selectedDiagrams: DesignDiagramKind[]) {
  const unique = Array.from(new Set(selectedDiagrams));
  const needsSequence = unique.some((diagram) => diagram !== "sequence");
  return needsSequence && !unique.includes("sequence")
    ? (["sequence", ...unique] as DesignDiagramKind[])
    : unique;
}

function withDesignDependencies(selectedDiagrams: DesignDiagramKind[]) {
  const withSequence = new Set(withSequenceDependency(selectedDiagrams));
  if (withSequence.has("table")) {
    withSequence.add("class");
  }
  return DESIGN_DIAGRAM_ORDER.filter((diagram) => withSequence.has(diagram));
}

function createEmptyDesignSnapshot(
  runId: string,
  input: {
    requirementText: string;
    selectedDiagrams: DesignDiagramKind[];
    rules: RequirementRule[];
    requirementModels: DiagramModelSpec[];
  },
): DesignRunSnapshot {
  return designRunSnapshotSchema.parse({
    runId,
    requirementText: input.requirementText,
    selectedDiagrams: withDesignDependencies(input.selectedDiagrams),
    rules: input.rules,
    requirementModels: input.requirementModels,
    models: [],
    plantUml: [],
    svgArtifacts: [],
    diagramErrors: {},
    currentStage: null,
    status: "queued",
    errorMessage: null,
  });
}

function createEmptyCodeSnapshot(
  runId: string,
  input: {
    requirementText: string;
    rules: RequirementRule[];
    designModels: DesignDiagramModelSpec[];
    existingFiles?: Record<string, string>;
    generationMode?: "continue" | "regenerate";
  },
): CodeRunSnapshot {
  const generationMode = input.generationMode ?? "continue";
  return codeRunSnapshotSchema.parse({
    runId,
    requirementText: input.requirementText,
    rules: input.rules,
    designModels: input.designModels,
    spec: null,
    appBlueprint: null,
    uiBlueprint: null,
    uiMockup: null,
    uiReferenceSpec: null,
    uiFidelityReport: null,
    designTokens: null,
    componentRegistry: null,
    uiIr: null,
    visualDiffReport: null,
    repairLoopSummary: null,
    filePlan: null,
    files: generationMode === "regenerate" ? {} : input.existingFiles ?? {},
    entryFile: null,
    dependencies: {},
    agentPlan: [],
    generationMode,
    changedFileCount: 0,
    diagnostics: [],
    codeContextHash: null,
    currentStage: null,
    status: "queued",
    errorMessage: null,
  });
}

function createEmptyDocumentSnapshot(
  runId: string,
  input: {
    documentKind: DocumentKind;
    requirementText: string;
  },
): DocumentRunSnapshot {
  const fileName =
    input.documentKind === "requirementsSpec"
      ? "需求规格说明书.docx"
      : "软件设计说明书.docx";
  return documentRunSnapshotSchema.parse({
    runId,
    documentKind: input.documentKind,
    requirementText: input.requirementText,
    sections: [],
    fileName,
    mimeType:
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    byteLength: 0,
    missingArtifacts: [],
    currentStage: null,
    status: "queued",
    errorMessage: null,
  });
}

function emitEvent(record: RunRecord, event: RunEvent) {
  record.events.push(event);
  for (const listener of record.listeners) {
    listener(event);
  }
  if (event.type === "completed" || event.type === "failed") {
    record.terminal = true;
  }
}

function createMessages(prompt: string): ChatMessage[] {
  return [
    { role: "system", content: JSON_ONLY_SYSTEM_PROMPT },
    { role: "user", content: prompt },
  ];
}

function getGenerateModelsResponseFormat(model: string) {
  return getModelCapability(model).supportsJsonSchema
    ? GENERATE_MODELS_RESPONSE_FORMAT
    : undefined;
}

function getGenerateDesignModelsResponseFormat(model: string) {
  return getModelCapability(model).supportsJsonSchema
    ? GENERATE_DESIGN_MODELS_RESPONSE_FORMAT
    : undefined;
}

function getGenerateCodeSpecResponseFormat(model: string) {
  return getModelCapability(model).supportsJsonSchema
    ? GENERATE_CODE_SPEC_RESPONSE_FORMAT
    : undefined;
}

function getGenerateCodeFilesResponseFormat(model: string) {
  return getModelCapability(model).supportsJsonSchema
    ? GENERATE_CODE_FILES_RESPONSE_FORMAT
    : undefined;
}

function getGenerateCodeAppBlueprintResponseFormat(model: string) {
  return getModelCapability(model).supportsJsonSchema
    ? GENERATE_CODE_APP_BLUEPRINT_RESPONSE_FORMAT
    : undefined;
}

function getGenerateCodeUiBlueprintResponseFormat(model: string) {
  return getModelCapability(model).supportsJsonSchema
    ? GENERATE_CODE_UI_BLUEPRINT_RESPONSE_FORMAT
    : undefined;
}

function getGenerateCodeUiReferenceResponseFormat(model: string) {
  return getModelCapability(model).supportsJsonSchema
    ? GENERATE_CODE_UI_REFERENCE_RESPONSE_FORMAT
    : undefined;
}

function getGenerateCodeUiFidelityResponseFormat(model: string) {
  return getModelCapability(model).supportsJsonSchema
    ? GENERATE_CODE_UI_FIDELITY_RESPONSE_FORMAT
    : undefined;
}

function getGenerateCodeUiIrResponseFormat(model: string) {
  return getModelCapability(model).supportsJsonSchema
    ? GENERATE_CODE_UI_IR_RESPONSE_FORMAT
    : undefined;
}

function getGenerateCodeFilePlanResponseFormat(model: string) {
  return getModelCapability(model).supportsJsonSchema
    ? GENERATE_CODE_FILE_PLAN_RESPONSE_FORMAT
    : undefined;
}

function getGenerateCodeAgentPlanResponseFormat(model: string) {
  return getModelCapability(model).supportsJsonSchema
    ? GENERATE_CODE_AGENT_PLAN_RESPONSE_FORMAT
    : undefined;
}

function getGenerateCodeFileOperationsResponseFormat(model: string) {
  return getModelCapability(model).supportsJsonSchema
    ? GENERATE_CODE_FILE_OPERATIONS_RESPONSE_FORMAT
    : undefined;
}

async function collectStructuredResult<T>(
  llmTransport: LlmTransport,
  providerSettings: ProviderSettings,
  messages: ChatMessage[],
  stage: RunStage,
  onChunk: (chunk: string) => void,
  parse: (text: string) => T,
  responseFormat?: ChatCompletionResponseFormat,
  attempt?: number,
) {
  let content = "";
  for await (const chunk of llmTransport.streamChatCompletion({
    providerSettings,
    messages,
    responseFormat,
  })) {
    content += chunk;
    onChunk(chunk);
  }
  try {
    return parse(content);
  } catch (error) {
    logFailedStructuredOutput(
      stage,
      providerSettings.model,
      error,
      content,
      attempt,
    );
    throw error;
  }
}

function extractFirstJsonValue(value: string) {
  const start = value.search(/[\[{]/);
  if (start < 0) {
    return null;
  }

  const opener = value[start];
  const closer = opener === "{" ? "}" : "]";
  const stack = [closer];
  let inString = false;
  let escaped = false;

  for (let index = start + 1; index < value.length; index += 1) {
    const char = value[index];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === "\"") {
        inString = false;
      }
      continue;
    }

    if (char === "\"") {
      inString = true;
      continue;
    }
    if (char === "{" || char === "[") {
      stack.push(char === "{" ? "}" : "]");
      continue;
    }
    if (char === "}" || char === "]") {
      if (stack.at(-1) !== char) {
        return null;
      }
      stack.pop();
      if (stack.length === 0) {
        return value.slice(start, index + 1);
      }
    }
  }

  return null;
}

function parseJson<T>(value: string) {
  try {
    return JSON.parse(value) as T;
  } catch (error) {
    const extracted = extractFirstJsonValue(value);
    if (!extracted || extracted.trim() === value.trim()) {
      throw error;
    }
    return JSON.parse(extracted) as T;
  }
}

function formatParseError(error: unknown) {
  if (error instanceof ZodError) {
    return error.issues
      .map((issue) => {
        const path = issue.path.length > 0 ? issue.path.join(".") : "response";
        return `${path}: ${issue.message}`;
      })
      .join("; ");
  }

  return getErrorMessage(error);
}

function stageProgressValue(stage: RunStage) {
  switch (stage) {
    case "extract_rules":
      return 20;
    case "generate_models":
      return 65;
    case "generate_design_sequence":
      return 45;
    case "generate_design_models":
      return 70;
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
    case "plan_code_files":
      return 50;
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
  }
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

function isPlaceholderSvg(svg: string) {
  return /Welcome to PlantUML!/i.test(svg);
}

async function createRenderClient(baseUrl: string, artifact: AnyPlantUmlArtifact) {
  const response = await fetch(`${baseUrl}/render/svg`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      diagramKind: artifact.diagramKind,
      plantUmlSource: artifact.source,
    }),
  });

  if (!response.ok) {
    let message = `Render service failed with HTTP ${response.status}`;
    try {
      const payload = (await response.json()) as { message?: string };
      if (payload.message) {
        message = payload.message;
      }
    } catch {
      // Ignore non-JSON error payloads and fall back to the status-based message.
    }
    throw new Error(message);
  }

  return (await response.json()) as Awaited<ReturnType<RenderClient>>;
}

async function createPngRenderClient(
  baseUrl: string,
  artifact: AnyPlantUmlArtifact,
): Promise<Awaited<ReturnType<PngRenderClient>>> {
  const response = await fetch(`${baseUrl}/render/png`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      diagramKind: artifact.diagramKind,
      plantUmlSource: artifact.source,
    }),
  });

  if (!response.ok) {
    let message = `Render service PNG failed with HTTP ${response.status}`;
    try {
      const payload = (await response.json()) as { message?: string };
      if (payload.message) {
        message = payload.message;
      }
    } catch {
      // Ignore non-JSON error payloads and fall back to the status-based message.
    }
    throw new Error(message);
  }

  const payload = renderPngResponseSchema.parse(await response.json());
  return {
    png: Buffer.from(payload.pngBase64, "base64"),
    renderMeta: payload.renderMeta,
  };
}

async function renderArtifactWithRepair(
  record: RunRecord,
  providerSettings: ProviderSettings,
  llmTransport: LlmTransport,
  renderClient: RenderClient,
  model: AnyDiagramModelSpec,
  artifact: AnyPlantUmlArtifact,
): Promise<
  | {
      status: "success";
      artifact: AnyPlantUmlArtifact;
      svgArtifact: AnySvgArtifact;
    }
  | {
      status: "failed";
      artifact: AnyPlantUmlArtifact;
      errorMessage: string;
    }
> {
  let currentArtifact = artifact;
  let lastErrorMessage = "";

  for (let attempt = 0; attempt <= MAX_PLANTUML_REPAIR_ATTEMPTS; attempt += 1) {
    try {
      const rendered = renderSvgResponseSchema.parse(await renderClient(currentArtifact));

      if (isPlaceholderSvg(rendered.svg)) {
        throw new Error("PlantUML returned placeholder SVG, source may be invalid");
      }

      return {
        status: "success",
        artifact: currentArtifact,
        svgArtifact: {
          diagramKind: currentArtifact.diagramKind,
          svg: rendered.svg,
          renderMeta: rendered.renderMeta,
        } as AnySvgArtifact,
      };
    } catch (error) {
      lastErrorMessage = getErrorMessage(error);

      if (attempt === MAX_PLANTUML_REPAIR_ATTEMPTS) {
        return {
          status: "failed",
          artifact: currentArtifact,
          errorMessage: `PlantUML repair failed for ${currentArtifact.diagramKind}: ${lastErrorMessage}`,
        };
      }

      emitEvent(
        record,
        stageProgressRunEventSchema.parse({
          type: "stage_progress",
          stage: "render_svg",
          progress: stageProgressValue("render_svg"),
          message: `PlantUML 编译失败，正在尝试修复（${attempt + 1}/${MAX_PLANTUML_REPAIR_ATTEMPTS}）`,
        }),
      );

      const repairResult = await collectStructuredResult(
        llmTransport,
        providerSettings,
        createMessages(
          buildRepairPlantUmlPrompt(
            currentArtifact.diagramKind,
            model,
            currentArtifact.source,
            lastErrorMessage,
          ),
        ),
        "render_svg",
        (chunk) => {
          emitEvent(
            record,
            llmChunkRunEventSchema.parse({
              type: "llm_chunk",
              stage: "render_svg",
              chunk,
            }),
          );
        },
        (text) => repairPlantUmlResultSchema.parse(parseJson(text)),
        undefined,
        attempt + 1,
      );

      currentArtifact = {
        ...currentArtifact,
        source: repairResult.source,
      };
    }
  }

  return {
    status: "failed",
    artifact: currentArtifact,
    errorMessage: `PlantUML repair failed for ${artifact.diagramKind}: ${lastErrorMessage}`,
  };
}

async function collectTextResult(
  llmTransport: LlmTransport,
  providerSettings: ProviderSettings,
  messages: ChatMessage[],
  onChunk: (chunk: string) => void,
  responseFormat?: ChatCompletionResponseFormat,
) {
  let content = "";
  for await (const chunk of llmTransport.streamChatCompletion({
    providerSettings,
    messages,
    responseFormat,
  })) {
    content += chunk;
    onChunk(chunk);
  }
  return content;
}

async function generateModelsWithRepair(
  record: RunRecord,
  providerSettings: ProviderSettings,
  llmTransport: LlmTransport,
  requirementText: string,
  rules: RequirementRule[],
  selectedDiagrams: DiagramKind[],
) {
  const responseFormat = getGenerateModelsResponseFormat(providerSettings.model);
  let prompt = buildGenerateModelsPrompt(
    requirementText,
    rules,
    selectedDiagrams,
  );
  let previousOutput = "";
  let lastErrorMessage = "";

  for (let attempt = 0; attempt <= MAX_MODEL_REPAIR_ATTEMPTS; attempt += 1) {
    const content = await collectTextResult(
      llmTransport,
      providerSettings,
      createMessages(prompt),
      (chunk) => {
        emitEvent(
          record,
          llmChunkRunEventSchema.parse({
            type: "llm_chunk",
            stage: "generate_models",
            chunk,
          }),
        );
      },
      responseFormat,
    );
    previousOutput = content;

    try {
      return diagramModelsResultSchema.parse(parseJson(content));
    } catch (error) {
      logFailedStructuredOutput(
        "generate_models",
        providerSettings.model,
        error,
        content,
        attempt + 1,
      );
      lastErrorMessage = formatParseError(error);

      if (attempt === MAX_MODEL_REPAIR_ATTEMPTS) {
        throw new Error(
          `generate_models structured output failed: ${lastErrorMessage}`,
        );
      }

      emitEvent(
        record,
        stageProgressRunEventSchema.parse({
          type: "stage_progress",
          stage: "generate_models",
          progress: stageProgressValue("generate_models"),
          message: `模型 JSON 结构不合法，正在尝试修复（${attempt + 1}/${MAX_MODEL_REPAIR_ATTEMPTS}）`,
        }),
      );

      prompt = buildRepairModelsPrompt(
        requirementText,
        rules,
        selectedDiagrams,
        previousOutput,
        lastErrorMessage,
      );
    }
  }

  throw new Error(`generate_models structured output failed: ${lastErrorMessage}`);
}

async function generateDesignModelsWithRepair(
  record: RunRecord,
  providerSettings: ProviderSettings,
  llmTransport: LlmTransport,
  requirementText: string,
  rules: RequirementRule[],
  selectedDiagrams: DesignDiagramKind[],
  initialPrompt: string,
  stage: RunStage,
) {
  const responseFormat = getGenerateDesignModelsResponseFormat(providerSettings.model);
  let prompt = initialPrompt;
  let previousOutput = "";
  let lastErrorMessage = "";

  for (let attempt = 0; attempt <= MAX_MODEL_REPAIR_ATTEMPTS; attempt += 1) {
    const content = await collectTextResult(
      llmTransport,
      providerSettings,
      createMessages(prompt),
      (chunk) => {
        emitEvent(
          record,
          llmChunkRunEventSchema.parse({
            type: "llm_chunk",
            stage,
            chunk,
          }),
        );
      },
      responseFormat,
    );
    previousOutput = content;

    try {
      const parsed = designDiagramModelsResultSchema.parse(parseJson(content));
      return {
        models: parsed.models.filter((model) =>
          selectedDiagrams.includes(model.diagramKind),
        ),
      };
    } catch (error) {
      logFailedStructuredOutput(
        stage,
        providerSettings.model,
        error,
        content,
        attempt + 1,
      );
      lastErrorMessage = formatParseError(error);

      if (attempt === MAX_MODEL_REPAIR_ATTEMPTS) {
        throw new Error(
          `${stage} structured output failed: ${lastErrorMessage}`,
        );
      }

      emitEvent(
        record,
        stageProgressRunEventSchema.parse({
          type: "stage_progress",
          stage,
          progress: stageProgressValue(stage),
          message: `设计模型 JSON 结构不合法，正在尝试修复（${attempt + 1}/${MAX_MODEL_REPAIR_ATTEMPTS}）`,
        }),
      );

      prompt = buildRepairDesignModelsPrompt(
        requirementText,
        rules,
        selectedDiagrams,
        previousOutput,
        lastErrorMessage,
      );
    }
  }

  throw new Error(`${stage} structured output failed: ${lastErrorMessage}`);
}

function findRequirementModel(
  models: DiagramModelSpec[],
  diagramKind: DiagramKind,
) {
  return models.find((model) => model.diagramKind === diagramKind);
}

function sourceRequirementKindForDesign(
  diagramKind: Exclude<DesignDiagramKind, "sequence">,
): DiagramKind {
  switch (diagramKind) {
    case "activity":
      return "activity";
    case "class":
      return "class";
    case "deployment":
      return "deployment";
    case "table":
      return "class";
  }
}

async function runStagePipeline(
  record: RunRecord,
  providerSettings: ProviderSettings,
  llmTransport: LlmTransport,
  renderClient: RenderClient,
) {
  const snapshot = record.snapshot as RunSnapshot;

  const updateStage = (stage: RunStage, message?: string) => {
    snapshot.currentStage = stage;
    snapshot.status = "running";
    emitEvent(record, stageStartedRunEventSchema.parse({ type: "stage_started", stage }));
    emitEvent(
      record,
      stageProgressRunEventSchema.parse({
        type: "stage_progress",
        stage,
        progress: stageProgressValue(stage),
        message,
      }),
    );
  };

  let rules: RequirementRule[] = [];
  let models: DiagramModelSpec[] = [];
  let plantUml: PlantUmlArtifact[] = [];
  let diagramErrors: Partial<Record<DiagramKind, DiagramError>> = {};

  updateStage("extract_rules", "正在抽取需求规则");
  const ruleResult = await collectStructuredResult(
    llmTransport,
    providerSettings,
    createMessages(buildExtractRulesPrompt(snapshot.requirementText)),
    "extract_rules",
    (chunk) => {
      emitEvent(
        record,
        llmChunkRunEventSchema.parse({
          type: "llm_chunk",
          stage: "extract_rules",
          chunk,
        }),
      );
    },
    (text) => requirementRulesResultSchema.parse(parseJson(text)),
  );
  rules = ruleResult.rules;
  snapshot.rules = rules;
  emitEvent(
    record,
    artifactReadyRunEventSchema.parse({
      type: "artifact_ready",
      stage: "extract_rules",
      artifactKind: "rules",
    }),
  );

  updateStage("generate_models", "正在生成结构化模型");
  if (snapshot.selectedDiagrams.length > 0) {
    const modelResult = await generateModelsWithRepair(
      record,
      providerSettings,
      llmTransport,
      snapshot.requirementText,
      rules,
      snapshot.selectedDiagrams,
    );
    models = modelResult.models;
  }
  snapshot.models = models;
  snapshot.diagramErrors = {};
  emitEvent(
    record,
    artifactReadyRunEventSchema.parse({
      type: "artifact_ready",
      stage: "generate_models",
      artifactKind: "model",
    }),
  );

  updateStage("generate_plantuml", "正在生成 PlantUML");
  plantUml = generatePlantUmlArtifacts(models);
  snapshot.plantUml = plantUml;
  for (const artifact of plantUml) {
    emitEvent(
      record,
      artifactReadyRunEventSchema.parse({
        type: "artifact_ready",
        stage: "generate_plantuml",
        artifactKind: "plantuml",
        diagramKind: artifact.diagramKind,
      }),
    );
  }

  updateStage("render_svg", "正在渲染 SVG");
  const repairedPlantUmlArtifacts: PlantUmlArtifact[] = [];
  const svgArtifacts: SvgArtifact[] = [];
  const renderFailures: string[] = [];
  for (const artifact of plantUml) {
    const model = models.find((item) => item.diagramKind === artifact.diagramKind);
    if (!model) {
      throw new Error(`Missing diagram model for ${artifact.diagramKind}`);
    }

    const rendered = await renderArtifactWithRepair(
      record,
      providerSettings,
      llmTransport,
      renderClient,
      model,
      artifact,
    );
    repairedPlantUmlArtifacts.push(rendered.artifact as PlantUmlArtifact);
    if (rendered.status === "success") {
      svgArtifacts.push(rendered.svgArtifact as SvgArtifact);
      emitEvent(
        record,
        artifactReadyRunEventSchema.parse({
          type: "artifact_ready",
          stage: "render_svg",
          artifactKind: "svg",
          diagramKind: artifact.diagramKind,
        }),
      );
      continue;
    }

    renderFailures.push(rendered.errorMessage);
    diagramErrors[artifact.diagramKind] = diagramErrorSchema.parse({
      stage: "render_svg",
      message: rendered.errorMessage,
    });
  }
  snapshot.plantUml = repairedPlantUmlArtifacts;
  snapshot.svgArtifacts = svgArtifacts;
  snapshot.diagramErrors = diagramErrors;

  if (plantUml.length > 0 && svgArtifacts.length === 0) {
    throw new Error(renderFailures.join("；"));
  }

  snapshot.currentStage = "render_svg";
  snapshot.status = "completed";
  snapshot.errorMessage = null;
  emitEvent(
    record,
    completedRunEventSchema.parse({
      type: "completed",
      snapshot,
    }),
  );
}

async function runDesignStagePipeline(
  record: RunRecord,
  providerSettings: ProviderSettings,
  llmTransport: LlmTransport,
  renderClient: RenderClient,
) {
  const snapshot = record.snapshot as DesignRunSnapshot;

  const updateStage = (stage: RunStage, message?: string) => {
    snapshot.currentStage = stage;
    snapshot.status = "running";
    emitEvent(record, stageStartedRunEventSchema.parse({ type: "stage_started", stage }));
    emitEvent(
      record,
      stageProgressRunEventSchema.parse({
        type: "stage_progress",
        stage,
        progress: stageProgressValue(stage),
        message,
      }),
    );
  };

  let models: DesignDiagramModelSpec[] = [];
  let diagramErrors: Partial<Record<DesignDiagramKind, DiagramError>> = {};
  const useCaseModel = findRequirementModel(snapshot.requirementModels, "usecase");
  if (!useCaseModel) {
    throw new Error("缺少需求阶段用例模型，无法生成设计阶段顺序图");
  }

  updateStage("generate_design_sequence", "正在生成设计顺序图");
  const sequenceResult = await generateDesignModelsWithRepair(
    record,
    providerSettings,
    llmTransport,
    snapshot.requirementText,
    snapshot.rules,
    ["sequence"],
    buildGenerateDesignSequencePrompt(
      snapshot.requirementText,
      snapshot.rules,
      useCaseModel,
    ),
    "generate_design_sequence",
  );
  const sequenceModel = sequenceResult.models.find(
    (model): model is Extract<DesignDiagramModelSpec, { diagramKind: "sequence" }> =>
      model.diagramKind === "sequence",
  );
  if (!sequenceModel) {
    throw new Error("设计顺序图生成结果缺少 sequence 模型");
  }
  models = [sequenceModel];
  snapshot.models = models;
  emitEvent(
    record,
    artifactReadyRunEventSchema.parse({
      type: "artifact_ready",
      stage: "generate_design_sequence",
      artifactKind: "model",
      diagramKind: "sequence",
    }),
  );

  const requestedDownstream = snapshot.selectedDiagrams.filter(
    (diagram): diagram is Exclude<DesignDiagramKind, "sequence"> =>
      diagram !== "sequence",
  );
  const downstreamWithSources = requestedDownstream.filter((diagram) => {
    const sourceKind = sourceRequirementKindForDesign(diagram);
    if (findRequirementModel(snapshot.requirementModels, sourceKind)) {
      return true;
    }
    diagramErrors[diagram] = diagramErrorSchema.parse({
      stage: "generate_design_models",
      message: `缺少需求阶段${sourceKind}模型，无法生成对应设计图`,
    });
    return false;
  });

  if (downstreamWithSources.length > 0) {
    updateStage("generate_design_models", "正在生成设计阶段结构化模型");
    const sourceModels = downstreamWithSources
      .map((diagram) =>
        findRequirementModel(
          snapshot.requirementModels,
          sourceRequirementKindForDesign(diagram),
        ),
      )
      .filter((model): model is DiagramModelSpec => Boolean(model));
    const downstreamResult = await generateDesignModelsWithRepair(
      record,
      providerSettings,
      llmTransport,
      snapshot.requirementText,
      snapshot.rules,
      downstreamWithSources,
      buildGenerateDesignModelsPrompt(
        snapshot.requirementText,
        snapshot.rules,
        sourceModels,
        sequenceModel,
        downstreamWithSources,
      ),
      "generate_design_models",
    );
    models = [...models, ...downstreamResult.models];
    snapshot.models = models;
    emitEvent(
      record,
      artifactReadyRunEventSchema.parse({
        type: "artifact_ready",
        stage: "generate_design_models",
        artifactKind: "model",
      }),
    );
  }

  updateStage("generate_plantuml", "正在生成设计阶段 PlantUML");
  let plantUml = generateDesignPlantUmlArtifacts(models);
  snapshot.plantUml = plantUml;
  for (const artifact of plantUml) {
    emitEvent(
      record,
      artifactReadyRunEventSchema.parse({
        type: "artifact_ready",
        stage: "generate_plantuml",
        artifactKind: "plantuml",
        diagramKind: artifact.diagramKind,
      }),
    );
  }

  updateStage("render_svg", "正在渲染设计阶段 SVG");
  const repairedPlantUmlArtifacts: DesignPlantUmlArtifact[] = [];
  const svgArtifacts: DesignSvgArtifact[] = [];
  const renderFailures: string[] = [];
  for (const artifact of plantUml) {
    const model = models.find((item) => item.diagramKind === artifact.diagramKind);
    if (!model) {
      throw new Error(`Missing design diagram model for ${artifact.diagramKind}`);
    }

    const rendered = await renderArtifactWithRepair(
      record,
      providerSettings,
      llmTransport,
      renderClient,
      model,
      artifact,
    );
    repairedPlantUmlArtifacts.push(rendered.artifact as DesignPlantUmlArtifact);
    if (rendered.status === "success") {
      svgArtifacts.push(rendered.svgArtifact as DesignSvgArtifact);
      emitEvent(
        record,
        artifactReadyRunEventSchema.parse({
          type: "artifact_ready",
          stage: "render_svg",
          artifactKind: "svg",
          diagramKind: artifact.diagramKind,
        }),
      );
      continue;
    }

    renderFailures.push(rendered.errorMessage);
    diagramErrors[artifact.diagramKind] = diagramErrorSchema.parse({
      stage: "render_svg",
      message: rendered.errorMessage,
    });
  }
  snapshot.plantUml = repairedPlantUmlArtifacts;
  snapshot.svgArtifacts = svgArtifacts;
  snapshot.diagramErrors = diagramErrors;

  if (plantUml.length > 0 && svgArtifacts.length === 0) {
    throw new Error(renderFailures.join("；"));
  }

  snapshot.currentStage = "render_svg";
  snapshot.status = "completed";
  snapshot.errorMessage = null;
  emitEvent(
    record,
    completedRunEventSchema.parse({
      type: "completed",
      snapshot,
    }),
  );
}

type CodePlanCache = Map<string, { plan: string[] }>;

function normalizeFilePath(path: string) {
  const trimmed = path.trim();
  return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
}

function addCodeDiagnostic(
  snapshot: CodeRunSnapshot,
  stage: RunStage,
  message: string,
) {
  snapshot.diagnostics = [
    ...snapshot.diagnostics,
    {
      stage,
      message,
      at: new Date().toISOString(),
    },
  ];
}

function emitCodeFileChanged(
  record: RunRecord,
  snapshot: CodeRunSnapshot,
  path: string,
  content: string,
  reason: string,
) {
  const normalizedPath = normalizeFilePath(path);
  const previousContent = snapshot.files[normalizedPath];
  if (previousContent === content) {
    addCodeDiagnostic(snapshot, "write_code_files", `${normalizedPath} 内容未变化：${reason}`);
    return;
  }
  snapshot.changedFileCount += 1;
  snapshot.files = {
    ...snapshot.files,
    [normalizedPath]: content,
  };
  emitEvent(
    record,
    codeFileChangedRunEventSchema.parse({
      type: "code_file_changed",
      path: normalizedPath,
      content,
      reason,
    }),
  );
}

function createStableCodeScaffold() {
  return {
    "/index.html": [
      "<!doctype html>",
      "<html>",
      "  <head>",
      "    <meta charset=\"UTF-8\" />",
      "    <meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\" />",
      "    <title>UML Prototype</title>",
      "  </head>",
      "  <body>",
      "    <div id=\"root\"></div>",
      "    <script type=\"module\" src=\"/src/main.tsx\"></script>",
      "  </body>",
      "</html>",
    ].join("\n"),
    "/src/main.tsx": [
      "import React from 'react';",
      "import { createRoot } from 'react-dom/client';",
      "import App from './App';",
      "import './styles.css';",
      "",
      "createRoot(document.getElementById('root')!).render(",
      "  <React.StrictMode>",
      "    <App />",
      "  </React.StrictMode>,",
      ");",
    ].join("\n"),
    "/src/styles.css": [
      ":root {",
      "  font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;",
      "  color: #172033;",
      "  background: #f6f8fb;",
      "}",
      "",
      "* { box-sizing: border-box; }",
      "body { margin: 0; min-width: 320px; min-height: 100vh; background: #f6f8fb; }",
      "button, input, select, textarea { font: inherit; }",
      ".prototype-shell { min-height: 100vh; padding: 24px; color: #172033; }",
    ].join("\n"),
    "/src/domain/types.ts": [
      "export interface PrototypeRecord {",
      "  id: string;",
      "  name: string;",
      "  status: string;",
      "}",
    ].join("\n"),
    "/src/data/mock-data.ts": [
      "import type { PrototypeRecord } from '../domain/types';",
      "",
      "export const mockData: PrototypeRecord[] = [];",
    ].join("\n"),
    "/src/components/WorkspaceShell.tsx": [
      "export function WorkspaceShell() {",
      "  return (",
      "    <main className=\"prototype-shell\">",
      "      <p>正在读取设计模型并生成业务原型...</p>",
      "    </main>",
      "  );",
      "}",
    ].join("\n"),
    "/src/App.tsx": [
      "import { WorkspaceShell } from './components/WorkspaceShell';",
      "",
      "export default function App() {",
      "  return <WorkspaceShell />;",
      "}",
    ].join("\n"),
  };
}

function summarizeDesignModelForCode(model: DesignDiagramModelSpec) {
  const source = model as Record<string, unknown>;
  const limitArray = (value: unknown, maxItems: number) =>
    Array.isArray(value) ? value.slice(0, maxItems) : value;
  const base = {
    diagramKind: model.diagramKind,
    title: source.title,
    summary: source.summary,
    notes: source.notes,
    itemCounts: Object.fromEntries(
      Object.entries(source)
        .filter(([, value]) => Array.isArray(value))
        .map(([key, value]) => [key, (value as unknown[]).length]),
    ),
  };

  switch (model.diagramKind) {
    case "class":
      return {
        ...base,
        classes: limitArray(source.classes, 12),
        interfaces: limitArray(source.interfaces, 8),
        enums: limitArray(source.enums, 6),
        relationships: limitArray(source.relationships, 18),
      };
    case "activity":
      return {
        ...base,
        nodes: limitArray(source.nodes, 24),
        relationships: limitArray(source.relationships, 28),
        swimlanes: limitArray(source.swimlanes, 8),
      };
    case "sequence":
      return {
        ...base,
        participants: limitArray(source.participants, 14),
        messages: limitArray(source.messages, 24),
        fragments: limitArray(source.fragments, 8),
      };
    case "table":
      return {
        ...base,
        tables: limitArray(source.tables, 12),
        relationships: limitArray(source.relationships, 18),
      };
    case "deployment":
      return {
        ...base,
        nodes: limitArray(source.nodes, 10),
        databases: limitArray(source.databases, 6),
        components: limitArray(source.components, 12),
        externalSystems: limitArray(source.externalSystems, 6),
        artifacts: limitArray(source.artifacts, 8),
        relationships: limitArray(source.relationships, 18),
      };
    default:
      return base;
  }
}

function buildCodeContext(snapshot: CodeRunSnapshot) {
  return {
    requirementText: snapshot.requirementText,
    rules: snapshot.rules.map((rule) => ({
      id: rule.id,
      category: rule.category,
      text: rule.text,
      relatedDiagrams: rule.relatedDiagrams,
    })),
    designModels: snapshot.designModels.map(summarizeDesignModelForCode),
    appBlueprint: snapshot.appBlueprint,
    uiBlueprint: snapshot.uiBlueprint,
    uiMockup: snapshot.uiMockup
      ? {
          status: snapshot.uiMockup.status,
          model: snapshot.uiMockup.model,
          summary: snapshot.uiMockup.summary,
          imageUrl: snapshot.uiMockup.imageUrl,
          hasImageData: Boolean(snapshot.uiMockup.imageDataUrl),
          errorMessage: snapshot.uiMockup.errorMessage,
      }
      : null,
    uiReferenceSpec: snapshot.uiReferenceSpec,
    uiFidelityReport: snapshot.uiFidelityReport,
    designTokens: snapshot.designTokens,
    componentRegistry: snapshot.componentRegistry,
    uiIr: snapshot.uiIr,
    visualDiffReport: snapshot.visualDiffReport,
    repairLoopSummary: snapshot.repairLoopSummary,
    filePlan: snapshot.filePlan,
    constraints: {
      target: "React 18 + TypeScript + Sandpack front-end prototype",
      themePolicy:
        "Infer the business prototype theme from requirementText, rules, and designModels. Do not copy the UML platform workbench style unless the business domain itself calls for it.",
      requiredFiles: [
        "/src/App.tsx",
        "/src/components/WorkspaceShell.tsx",
        "/src/domain/types.ts",
        "/src/data/mock-data.ts",
        "/src/styles.css",
      ],
      fileStructurePolicy:
        "Generate 2-6 page files under /src/pages and at least 3 reusable components under /src/components. Keep App.tsx thin and avoid single-file prototypes.",
    },
  };
}

function hashCodeContext(codeContext: unknown) {
  return createHash("sha256")
    .update(JSON.stringify(codeContext))
    .digest("hex")
    .slice(0, 20);
}

function normalizeCodeOperationName(value: unknown) {
  if (typeof value !== "string") return value;
  const normalized = value.trim();
  const aliasMap: Record<string, CodeFileOperation["operation"]> = {
    add: "create_file",
    add_file: "create_file",
    create: "create_file",
    createFile: "create_file",
    write: "update_file",
    write_file: "update_file",
    edit_file: "update_file",
    modify: "update_file",
    modify_file: "update_file",
    replace_file: "update_file",
    update: "update_file",
    updateFile: "update_file",
    entry_file: "set_entry_file",
    set_entry: "set_entry_file",
    setEntryFile: "set_entry_file",
    setEntry: "set_entry_file",
    comment: "note",
    message: "note",
  };
  return aliasMap[normalized] ?? normalized;
}

function normalizeCodeOperationCandidate(candidate: unknown) {
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
    return candidate;
  }

  const operation = candidate as Record<string, unknown>;
  const normalized: Record<string, unknown> = { ...operation };
  normalized.operation = normalizeCodeOperationName(
    normalized.operation ??
      normalized.type ??
      normalized.action ??
      normalized.op ??
      normalized.kind,
  );

  if (
    normalized.operation === "note" &&
    typeof normalized.message !== "string"
  ) {
    const fallbackMessage = normalized.reason ?? normalized.content;
    if (typeof fallbackMessage === "string") {
      normalized.message = fallbackMessage;
    }
  }

  return normalized;
}

function parseCodeFileOperationsResult(text: string) {
  const parsed = parseJson<unknown>(text);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return codeFileOperationsResultSchema.parse(parsed);
  }

  const object = parsed as Record<string, unknown>;
  const operations = Array.isArray(object.operations)
    ? object.operations.map(normalizeCodeOperationCandidate)
    : object.operations;

  return codeFileOperationsResultSchema.parse({
    ...object,
    operations,
  });
}

function stringifyStructuredPromptValue(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) {
    return value
      .map((item) => stringifyStructuredPromptValue(item))
      .filter(Boolean)
      .join("；");
  }
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const preferred = [
      record.title,
      record.name,
      record.label,
      record.pattern,
      record.rule,
      record.guideline,
      record.reason,
      record.audience,
    ]
      .map((item) => stringifyStructuredPromptValue(item))
      .filter(Boolean);
    const remaining = Object.entries(record)
      .filter(([key]) => !["title", "name", "label", "pattern", "rule", "guideline", "reason", "audience"].includes(key))
      .map(([key, item]) => {
        const text = stringifyStructuredPromptValue(item);
        return text ? `${key}: ${text}` : "";
      })
      .filter(Boolean);
    return [...preferred, ...remaining].join("；");
  }
  return "";
}

function normalizeStringListCandidate(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((item) => stringifyStructuredPromptValue(item))
      .filter((item) => item.trim().length > 0);
  }
  const text = stringifyStructuredPromptValue(value);
  return text ? [text] : [];
}

function parseCodeUiBlueprintResult(text: string) {
  const parsed = parseJson<unknown>(text);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return codeUiBlueprintResultSchema.parse(parsed);
  }

  const object = parsed as Record<string, unknown>;
  const uiBlueprint =
    object.uiBlueprint && typeof object.uiBlueprint === "object" && !Array.isArray(object.uiBlueprint)
      ? { ...(object.uiBlueprint as Record<string, unknown>) }
      : object.uiBlueprint;

  if (uiBlueprint && typeof uiBlueprint === "object" && !Array.isArray(uiBlueprint)) {
    const normalized = uiBlueprint as Record<string, unknown>;
    normalized.navigationModel = stringifyStructuredPromptValue(normalized.navigationModel);
    normalized.layoutPrinciples = normalizeStringListCandidate(normalized.layoutPrinciples);
    normalized.componentGuidelines = normalizeStringListCandidate(normalized.componentGuidelines);
    normalized.stateGuidelines = normalizeStringListCandidate(normalized.stateGuidelines);
    return codeUiBlueprintResultSchema.parse({
      ...object,
      uiBlueprint: normalized,
    });
  }

  return codeUiBlueprintResultSchema.parse(parsed);
}

function findImageReference(value: unknown): {
  imageUrl: string | null;
  imageDataUrl: string | null;
} {
  if (typeof value === "string") {
    const text = value.trim();
    if (text.startsWith("{") || text.startsWith("[")) {
      try {
        return findImageReference(JSON.parse(text));
      } catch {
        // Fall through to looser extraction for model responses with malformed JSON.
      }
    }

    const markdownMatch = text.match(/!\[[^\]]*]\(([^)]+)\)/);
    const markdownUrl = markdownMatch?.[1]?.trim().replace(/[)"'}\].,，。]+$/, "");
    if (markdownUrl?.startsWith("data:image/")) {
      return { imageUrl: null, imageDataUrl: markdownUrl };
    }
    if (markdownUrl && /^https?:\/\//.test(markdownUrl)) {
      return { imageUrl: markdownUrl, imageDataUrl: null };
    }

    const dataUrlMatch = text.match(/data:image\/[a-zA-Z0-9.+-]+;base64,[A-Za-z0-9+/=]+/);
    if (dataUrlMatch?.[0]) {
      return { imageUrl: null, imageDataUrl: dataUrlMatch[0] };
    }

    const urlMatch = text.match(/https?:\/\/\S+/);
    if (urlMatch?.[0]) {
      return {
        imageUrl: urlMatch[0].replace(/[)"'}\].,，。]+$/, ""),
        imageDataUrl: null,
      };
    }

    if (/^[A-Za-z0-9+/=]{200,}$/.test(text)) {
      return { imageUrl: null, imageDataUrl: `data:image/png;base64,${text}` };
    }

    return { imageUrl: null, imageDataUrl: null };
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findImageReference(item);
      if (found.imageUrl || found.imageDataUrl) return found;
    }
    return { imageUrl: null, imageDataUrl: null };
  }

  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    for (const key of [
      "image_url",
      "imageUrl",
      "url",
      "data_url",
      "dataUrl",
      "b64_json",
      "base64",
      "content",
    ]) {
      if (key in record) {
        const found = findImageReference(record[key]);
        if (found.imageUrl || found.imageDataUrl) return found;
      }
    }
    for (const item of Object.values(record)) {
      const found = findImageReference(item);
      if (found.imageUrl || found.imageDataUrl) return found;
    }
  }

  return { imageUrl: null, imageDataUrl: null };
}

function summarizeUiMockupIntent(
  appBlueprint: CodeAppBlueprint,
  uiBlueprint: CodeUiBlueprint,
) {
  return [
    `应用名称：${appBlueprint.appName}`,
    `业务领域：${appBlueprint.domain}`,
    `视觉语言：${uiBlueprint.visualLanguage}`,
    `导航组织：${uiBlueprint.navigationModel}`,
    `主题：${uiBlueprint.theme.name}，主色 ${uiBlueprint.theme.primaryColor}，强调色 ${uiBlueprint.theme.accentColor}`,
    `主页面：${appBlueprint.pages.map((page) => page.name).join("、")}`,
  ].join("；");
}

async function generateCodeUiMockup(
  record: RunRecord,
  snapshot: CodeRunSnapshot,
  imageClient: ImageGenerationClient,
  providerSettings: ImageProviderSettings,
  appBlueprint: CodeAppBlueprint,
  uiBlueprint: CodeUiBlueprint,
): Promise<CodeUiMockup> {
  const prompt = buildGenerateCodeUiMockupPrompt(
    buildCodeContext(snapshot),
    appBlueprint,
    uiBlueprint,
  );
  const summary = summarizeUiMockupIntent(appBlueprint, uiBlueprint);

  try {
    const result = await imageClient.generateImage({
      providerSettings,
      prompt,
    });
    const { imageUrl, imageDataUrl } = findImageReference(result.content);
    if (!imageUrl && !imageDataUrl) {
      throw new Error("图片模型没有返回可识别的图片链接或图片数据");
    }

    const mockup = codeUiMockupSchema.parse({
      status: "completed",
      model: providerSettings.model,
      prompt,
      summary,
      imageUrl,
      imageDataUrl,
      errorMessage: null,
      createdAt: new Date().toISOString(),
    });
    snapshot.uiMockup = mockup;
    addCodeDiagnostic(snapshot, "generate_code_ui_mockup", "界面设计图已生成");
    emitEvent(
      record,
      artifactReadyRunEventSchema.parse({
        type: "artifact_ready",
        stage: "generate_code_ui_mockup",
        artifactKind: "uiMockup",
        uiMockup: mockup,
      }),
    );
    return mockup;
  } catch (error) {
    const message = `设计图生成失败，已根据文字界面方案继续生成代码：${getErrorMessage(error)}`;
    const mockup = codeUiMockupSchema.parse({
      status: "failed",
      model: providerSettings.model,
      prompt,
      summary,
      imageUrl: null,
      imageDataUrl: null,
      errorMessage: message,
      createdAt: new Date().toISOString(),
    });
    snapshot.uiMockup = mockup;
    addCodeDiagnostic(snapshot, "generate_code_ui_mockup", message);
    emitEvent(
      record,
      artifactReadyRunEventSchema.parse({
        type: "artifact_ready",
        stage: "generate_code_ui_mockup",
        artifactKind: "uiMockup",
        uiMockup: mockup,
      }),
    );
    return mockup;
  }
}

function getUiMockupImage(mockup: CodeUiMockup | null) {
  if (!mockup || mockup.status !== "completed") return null;
  return mockup.imageUrl ?? mockup.imageDataUrl ?? null;
}

function createMultimodalMessages(prompt: string, imageUrl: string): ChatMessage[] {
  return [
    { role: "system", content: JSON_ONLY_SYSTEM_PROMPT },
    {
      role: "user",
      content: [
        { type: "text", text: prompt },
        { type: "image_url", image_url: { url: imageUrl } },
      ],
    },
  ];
}

function fallbackUiReferenceSpec(
  uiMockup: CodeUiMockup | null,
  uiBlueprint: CodeUiBlueprint,
): CodeUiReferenceSpec {
  return codeUiReferenceSpecResultSchema.parse({
    uiReferenceSpec: {
      layoutStructure: uiBlueprint.layoutPrinciples,
      navigation: uiBlueprint.navigationModel,
      colorPalette: [
        uiBlueprint.theme.primaryColor,
        uiBlueprint.theme.accentColor,
        uiBlueprint.theme.backgroundColor,
        uiBlueprint.theme.surfaceColor,
      ],
      componentShapes: uiBlueprint.componentGuidelines,
      informationDensity: uiBlueprint.theme.density,
      keyBusinessAreas: [uiBlueprint.visualLanguage],
      stateExpressions: uiBlueprint.stateGuidelines,
      implementationGuidelines: [
        "根据文字界面方案继续实现，并在布局、导航、色彩和状态表达上保持一致。",
      ],
      fallbackReason:
        uiMockup?.errorMessage ??
        "界面设计图不可用，已根据文字界面方案生成视觉参考规格。",
    },
  }).uiReferenceSpec;
}

async function analyzeCodeUiMockup(
  record: RunRecord,
  snapshot: CodeRunSnapshot,
  providerSettings: ProviderSettings,
  llmTransport: LlmTransport,
  appBlueprint: CodeAppBlueprint,
  uiBlueprint: CodeUiBlueprint,
  uiMockup: CodeUiMockup | null,
) {
  const imageUrl = getUiMockupImage(uiMockup);
  if (!imageUrl) {
    const fallback = fallbackUiReferenceSpec(uiMockup, uiBlueprint);
    snapshot.uiReferenceSpec = fallback;
    addCodeDiagnostic(
      snapshot,
      "analyze_code_ui_mockup",
      fallback.fallbackReason ?? "已根据文字界面方案生成视觉参考规格",
    );
    emitEvent(
      record,
      artifactReadyRunEventSchema.parse({
        type: "artifact_ready",
        stage: "analyze_code_ui_mockup",
        artifactKind: "uiReferenceSpec",
        uiReferenceSpec: fallback,
      }),
    );
    return fallback;
  }

  try {
    const result = await collectStructuredResult(
      llmTransport,
      providerSettings,
      createMultimodalMessages(
        buildAnalyzeCodeUiMockupPrompt(appBlueprint, uiBlueprint),
        imageUrl,
      ),
      "analyze_code_ui_mockup",
      (chunk) => {
        emitEvent(
          record,
          llmChunkRunEventSchema.parse({
            type: "llm_chunk",
            stage: "analyze_code_ui_mockup",
            chunk,
          }),
        );
      },
      (text) => codeUiReferenceSpecResultSchema.parse(parseJson(text)),
      getGenerateCodeUiReferenceResponseFormat(providerSettings.model),
    );
    snapshot.uiReferenceSpec = result.uiReferenceSpec;
    addCodeDiagnostic(snapshot, "analyze_code_ui_mockup", "已解析界面设计图视觉特征");
    emitEvent(
      record,
      artifactReadyRunEventSchema.parse({
        type: "artifact_ready",
        stage: "analyze_code_ui_mockup",
        artifactKind: "uiReferenceSpec",
        uiReferenceSpec: result.uiReferenceSpec,
      }),
    );
    return result.uiReferenceSpec;
  } catch (error) {
    const fallback = {
      ...fallbackUiReferenceSpec(uiMockup, uiBlueprint),
      fallbackReason: `界面设计图解析失败，已根据文字界面方案继续生成代码：${getErrorMessage(error)}`,
    };
    snapshot.uiReferenceSpec = fallback;
    addCodeDiagnostic(snapshot, "analyze_code_ui_mockup", fallback.fallbackReason);
    emitEvent(
      record,
      artifactReadyRunEventSchema.parse({
        type: "artifact_ready",
        stage: "analyze_code_ui_mockup",
        artifactKind: "uiReferenceSpec",
        uiReferenceSpec: fallback,
      }),
    );
    return fallback;
  }
}

const PLATFORM_COMPONENT_REGISTRY_NAMES = [
  "WorkspaceShell",
  "SidebarNav",
  "TopBar",
  "MetricCard",
  "DataTable",
  "StatusBadge",
  "FilterBar",
  "ActionButton",
  "DetailPanel",
  "EmptyState",
];

function createFallbackCodeUiIr(
  appBlueprint: CodeAppBlueprint,
  uiBlueprint: CodeUiBlueprint,
): CodeUiIr {
  return codeUiIrResultSchema.parse({
    uiIr: {
      designTokens: {
        colors: {
          primary: uiBlueprint.theme.primaryColor,
          background: uiBlueprint.theme.backgroundColor,
          surface: uiBlueprint.theme.surfaceColor,
          text: uiBlueprint.theme.textColor,
          accent: uiBlueprint.theme.accentColor,
          success: "#16a34a",
          warning: "#f59e0b",
          danger: "#dc2626",
        },
        typography: {
          body: "14px/1.5 system-ui",
          heading: "600 20px/1.25 system-ui",
          label: "600 12px/1.2 system-ui",
        },
        spacing: {
          "1": "4px",
          "2": "8px",
          "3": "12px",
          "4": "16px",
          "6": "24px",
          "8": "32px",
        },
        radius: {
          sm: "4px",
          md: "8px",
          lg: "12px",
        },
        shadow: {
          sm: "0 1px 2px rgba(15, 23, 42, 0.08)",
          md: "0 8px 24px rgba(15, 23, 42, 0.12)",
        },
        density: uiBlueprint.theme.density,
      },
      componentRegistry: {
        components: PLATFORM_COMPONENT_REGISTRY_NAMES.map((name) => ({
          name,
          description: `${name} 用于 ${appBlueprint.domain} 原型中的标准业务界面结构`,
          props: ["title", "items", "status", "onAction"],
          variants: ["default", "compact", "emphasis"],
          usageRules: ["优先复用平台组件语义，不在页面中重新发明同类 UI"],
        })),
      },
      pages: appBlueprint.pages.map((page, index) => ({
        id: page.id,
        route: page.route,
        name: page.name,
        layout: "sidebar-content",
        primaryActions: [`执行${page.name}主要操作`],
        componentTree: {
          component: "WorkspaceShell",
          purpose: `承载${page.name}页面的导航和业务工作区`,
          props: { title: appBlueprint.appName, activeRoute: page.route },
          dataBinding: null,
          tokenRefs: ["colors.background", "colors.surface", "spacing.4"],
          children: [
            {
              component: "SidebarNav",
              purpose: "展示业务页面导航",
              props: { activeRoute: page.route },
              dataBinding: "appBlueprint.pages",
              tokenRefs: ["colors.primary", "spacing.3"],
              children: [],
            },
            {
              component: "TopBar",
              purpose: `说明${page.name}当前任务和关键状态`,
              props: { title: page.name, subtitle: page.purpose },
              dataBinding: null,
              tokenRefs: ["colors.text", "spacing.4"],
              children: [],
            },
            {
              component: index === 0 ? "MetricCard" : "DataTable",
              purpose: page.purpose,
              props: { title: page.name },
              dataBinding: `${appBlueprint.domain}业务数据`,
              tokenRefs: ["colors.surface", "radius.md", "shadow.sm"],
              children: [
                {
                  component: "ActionButton",
                  purpose: `触发${page.name}主要操作`,
                  props: { label: `处理${page.name}` },
                  dataBinding: null,
                  tokenRefs: ["colors.primary", "radius.sm"],
                  children: [],
                },
              ],
            },
          ],
        },
      })),
      dataBindings: [`${appBlueprint.domain}业务数据 -> DataTable/MetricCard/DetailPanel`],
      interactions: appBlueprint.pages.map((page) => `进入 ${page.name}: ${page.purpose}`),
      responsiveRules: [
        "desktop 使用侧边导航和右侧业务工作区",
        "tablet 保留导航但压缩统计与表格间距",
        "mobile 将导航折叠为顶部入口，业务区纵向排列",
      ],
    },
  }).uiIr;
}

async function generateCodeUiIr(
  record: RunRecord,
  snapshot: CodeRunSnapshot,
  providerSettings: ProviderSettings,
  llmTransport: LlmTransport,
  appBlueprint: CodeAppBlueprint,
  uiBlueprint: CodeUiBlueprint,
  uiMockup: CodeUiMockup | null,
  uiReferenceSpec: CodeUiReferenceSpec | null,
) {
  try {
    const result = await collectStructuredResult(
      llmTransport,
      providerSettings,
      createMessages(
        buildGenerateCodeUiIrPrompt(
          buildCodeContext(snapshot),
          appBlueprint,
          uiBlueprint,
          uiMockup,
          uiReferenceSpec,
        ),
      ),
      "generate_code_ui_ir",
      (chunk) => {
        emitEvent(
          record,
          llmChunkRunEventSchema.parse({
            type: "llm_chunk",
            stage: "generate_code_ui_ir",
            chunk,
          }),
        );
      },
      (text) => codeUiIrResultSchema.parse(parseJson(text)),
      getGenerateCodeUiIrResponseFormat(providerSettings.model),
    );
    snapshot.designTokens = result.uiIr.designTokens;
    snapshot.componentRegistry = result.uiIr.componentRegistry;
    snapshot.uiIr = result.uiIr;
    addCodeDiagnostic(
      snapshot,
      "generate_code_ui_ir",
      `已生成 ${result.uiIr.pages.length} 个页面的结构化 UI IR`,
    );
    emitEvent(
      record,
      artifactReadyRunEventSchema.parse({
        type: "artifact_ready",
        stage: "generate_code_ui_ir",
        artifactKind: "designTokens",
        designTokens: result.uiIr.designTokens,
      }),
    );
    emitEvent(
      record,
      artifactReadyRunEventSchema.parse({
        type: "artifact_ready",
        stage: "generate_code_ui_ir",
        artifactKind: "componentRegistry",
        componentRegistry: result.uiIr.componentRegistry,
      }),
    );
    emitEvent(
      record,
      artifactReadyRunEventSchema.parse({
        type: "artifact_ready",
        stage: "generate_code_ui_ir",
        artifactKind: "uiIr",
        uiIr: result.uiIr,
      }),
    );
    return result.uiIr;
  } catch (error) {
    const fallback = createFallbackCodeUiIr(appBlueprint, uiBlueprint);
    snapshot.designTokens = fallback.designTokens;
    snapshot.componentRegistry = fallback.componentRegistry;
    snapshot.uiIr = fallback;
    addCodeDiagnostic(
      snapshot,
      "generate_code_ui_ir",
      `结构化 UI IR 生成失败，已使用平台组件 Registry 降级：${getErrorMessage(error)}`,
    );
    emitEvent(
      record,
      artifactReadyRunEventSchema.parse({
        type: "artifact_ready",
        stage: "generate_code_ui_ir",
        artifactKind: "uiIr",
        uiIr: fallback,
      }),
    );
    return fallback;
  }
}

function fallbackUiFidelityReport(reason: string): CodeUiFidelityReport {
  return codeUiFidelityReportResultSchema.parse({
    uiFidelityReport: {
      passed: true,
      matched: [],
      missing: [],
      repairSuggestions: [],
      summary: reason,
    },
  }).uiFidelityReport;
}

async function verifyCodeUiFidelity(
  record: RunRecord,
  snapshot: CodeRunSnapshot,
  providerSettings: ProviderSettings,
  llmTransport: LlmTransport,
) {
  const imageUrl = getUiMockupImage(snapshot.uiMockup);
  if (!imageUrl || !snapshot.uiReferenceSpec) {
    const report = fallbackUiFidelityReport(
      "界面设计图或视觉解析不可用，已跳过多模态还原检查。",
    );
    snapshot.uiFidelityReport = report;
    addCodeDiagnostic(snapshot, "verify_code_ui_fidelity", report.summary);
    return report;
  }

  try {
    const result = await collectStructuredResult(
      llmTransport,
      providerSettings,
      createMultimodalMessages(
        buildVerifyCodeUiFidelityPrompt(
          snapshot.uiReferenceSpec,
          snapshot.files,
          snapshot.appBlueprint,
        ),
        imageUrl,
      ),
      "verify_code_ui_fidelity",
      (chunk) => {
        emitEvent(
          record,
          llmChunkRunEventSchema.parse({
            type: "llm_chunk",
            stage: "verify_code_ui_fidelity",
            chunk,
          }),
        );
      },
      (text) => codeUiFidelityReportResultSchema.parse(parseJson(text)),
      getGenerateCodeUiFidelityResponseFormat(providerSettings.model),
    );
    snapshot.uiFidelityReport = result.uiFidelityReport;
    addCodeDiagnostic(snapshot, "verify_code_ui_fidelity", result.uiFidelityReport.summary);
    emitEvent(
      record,
      artifactReadyRunEventSchema.parse({
        type: "artifact_ready",
        stage: "verify_code_ui_fidelity",
        artifactKind: "uiFidelityReport",
        uiFidelityReport: result.uiFidelityReport,
      }),
    );
    return result.uiFidelityReport;
  } catch (error) {
    const report = fallbackUiFidelityReport(
      `设计图还原检查失败，已保留当前原型：${getErrorMessage(error)}`,
    );
    snapshot.uiFidelityReport = report;
    addCodeDiagnostic(snapshot, "verify_code_ui_fidelity", report.summary);
    return report;
  }
}

function isBlankCodeFile(content: string | undefined) {
  return !content || content.trim().length === 0;
}

function ensureRequiredPrototypeFiles(
  record: RunRecord,
  snapshot: CodeRunSnapshot,
  scaffold: Record<string, string>,
) {
  const requiredFiles = [
    "/src/App.tsx",
    "/src/components/WorkspaceShell.tsx",
    "/src/domain/types.ts",
    "/src/data/mock-data.ts",
    "/src/styles.css",
  ];

  for (const path of requiredFiles) {
    if (isBlankCodeFile(snapshot.files[path])) {
      emitCodeFileChanged(
        record,
        snapshot,
        path,
        scaffold[path],
        "补齐缺失的模块化原型文件",
      );
      addCodeDiagnostic(
        snapshot,
        "verify_code_preview",
        `已补齐缺失或空白文件 ${path}`,
      );
    }
  }
}

function validatePrototypeFileContents(snapshot: CodeRunSnapshot) {
  const realNetworkPattern =
    /\b(fetch|XMLHttpRequest)\s*\(|\baxios\b|https?:\/\/(?!localhost|127\.0\.0\.1)/;
  for (const [path, content] of Object.entries(snapshot.files)) {
    if (!path.startsWith("/src/")) continue;
    if (realNetworkPattern.test(content)) {
      addCodeDiagnostic(
        snapshot,
        "verify_code_preview",
        `${path} 包含真实网络请求痕迹，第一版原型应改用 /src/data/mock-data.ts。`,
      );
    }
  }
}

function buildCodeGenerationSpecFromBlueprints(
  appBlueprint: CodeAppBlueprint,
  uiBlueprint: CodeUiBlueprint,
  filePlan: CodeFilePlan | null,
  uiIr: CodeUiIr | null = null,
): CodeGenerationSpec {
  return codeGenerationSpecSchema.parse({
    appName: appBlueprint.appName,
    summary: appBlueprint.coreWorkflow,
    theme: uiBlueprint.theme,
    pages: appBlueprint.pages,
    components:
      filePlan?.files
        .filter((file) => file.kind === "component")
        .map((file, index) => ({
          id: `component-${index + 1}`,
          name: file.path.split("/").at(-1)?.replace(/\.(tsx|ts|jsx|js)$/, "") ?? file.path,
          responsibility: file.responsibility,
          sourceDiagramIds: [],
        })) ?? [
        {
          id: "component-workspace-shell",
          name: "WorkspaceShell",
          responsibility: "组织原型导航、页面切换和全局布局",
          sourceDiagramIds: [],
        },
      ],
    interactions: appBlueprint.pages.map((page) => ({
      id: `interaction-${page.id}`,
      trigger: `进入${page.name}`,
      behavior: page.purpose,
      sourceDiagramIds: page.sourceDiagramIds,
    })),
    dataEntities: [
      {
        id: "entity-domain-record",
        name: `${appBlueprint.domain}业务数据`,
        fields: [
          { name: "id", type: "string", required: true },
          { name: "name", type: "string", required: true },
          { name: "status", type: "string", required: false },
        ],
        sourceDiagramIds: [],
      },
    ],
    implementationNotes: [
      uiBlueprint.visualLanguage,
      uiBlueprint.navigationModel,
      "页面按业务流程拆分到 /src/pages，复用展示拆分到 /src/components。",
    ],
    appBlueprint,
    uiBlueprint,
    uiReferenceSpec: null,
    uiIr,
    filePlan,
  });
}

function auditCodePrototypeQuality(snapshot: CodeRunSnapshot): CodeQualityDiagnostic {
  const issues: CodeQualityDiagnostic["issues"] = [];
  const filePaths = Object.keys(snapshot.files);
  const pageFiles = filePaths.filter((path) => /^\/src\/pages\/.+\.tsx$/.test(path));
  const componentFiles = filePaths.filter((path) =>
    /^\/src\/components\/.+\.tsx$/.test(path),
  );
  const requiredFiles = [
    "/src/App.tsx",
    "/src/components/WorkspaceShell.tsx",
    "/src/domain/types.ts",
    "/src/data/mock-data.ts",
    "/src/styles.css",
  ];

  for (const path of requiredFiles) {
    if (isBlankCodeFile(snapshot.files[path])) {
      issues.push({ severity: "error", path, message: "必要原型文件缺失或为空" });
    }
  }

  for (const plannedFile of snapshot.filePlan?.files ?? []) {
    if (plannedFile.path === "/index.html" || plannedFile.path === "/src/main.tsx") {
      continue;
    }
    if (isBlankCodeFile(snapshot.files[normalizeFilePath(plannedFile.path)])) {
      issues.push({
        severity: "error",
        path: plannedFile.path,
        message: "文件计划中的文件未生成",
      });
    }
  }

  if (pageFiles.length < 2) {
    issues.push({
      severity: "error",
      message: "页面文件不足，至少需要 2 个 /src/pages/* 页面文件",
    });
  }
  if (componentFiles.length < 3) {
    issues.push({
      severity: "error",
      message: "组件文件不足，至少需要 3 个 /src/components/* 组件文件",
    });
  }
  if (filePaths.filter((path) => path.startsWith("/src/")).length < 8) {
    issues.push({
      severity: "error",
      message: "文件数量不足，原型仍像单文件或少文件实现",
    });
  }
  if (!snapshot.files[snapshot.entryFile ?? ""]) {
    issues.push({
      severity: "error",
      path: snapshot.entryFile ?? undefined,
      message: "入口文件不存在或未设置",
    });
  }

  const realNetworkPattern =
    /\b(fetch|XMLHttpRequest)\s*\(|\baxios\b|https?:\/\/(?!localhost|127\.0\.0\.1)/;
  for (const [path, content] of Object.entries(snapshot.files)) {
    if (path.startsWith("/src/") && realNetworkPattern.test(content)) {
      issues.push({
        severity: "warning",
        path,
        message: "检测到真实网络请求痕迹，第一版原型应使用本地 mock 数据",
      });
    }
  }

  return codeQualityDiagnosticSchema.parse({
    passed: issues.every((issue) => issue.severity !== "error"),
    metrics: {
      fileCount: filePaths.length,
      pageFileCount: pageFiles.length,
      componentFileCount: componentFiles.length,
    },
    issues,
  });
}

function recordCodeQualityDiagnostics(
  snapshot: CodeRunSnapshot,
  diagnostic: CodeQualityDiagnostic,
) {
  snapshot.qualityDiagnostics = [...snapshot.qualityDiagnostics, diagnostic];
  addCodeDiagnostic(
    snapshot,
    "audit_code_quality",
    diagnostic.passed
      ? `质量检查通过：${diagnostic.metrics.pageFileCount} 个页面文件，${diagnostic.metrics.componentFileCount} 个组件文件`
      : `质量检查发现 ${diagnostic.issues.length} 个问题`,
  );
  for (const issue of diagnostic.issues) {
    addCodeDiagnostic(
      snapshot,
      issue.severity === "error" ? "repair_code_files" : "audit_code_quality",
      `${issue.path ? `${issue.path}：` : ""}${issue.message}`,
    );
  }
}

function verifyRenderedPreviewStructure(snapshot: CodeRunSnapshot): CodeVisualDiffReport {
  const filesText = Object.values(snapshot.files).join("\n");
  const findings: string[] = [];
  const repairSuggestions: string[] = [];

  const entryPath = snapshot.entryFile ?? "/src/App.tsx";
  if (!snapshot.files[entryPath] || isBlankCodeFile(snapshot.files[entryPath])) {
    findings.push("入口文件缺失或为空，预览无法稳定渲染。");
    repairSuggestions.push("补齐 /src/App.tsx，并确保它挂载 WorkspaceShell 或主页面组件。");
  }

  if (/\bthrow new Error\b|TODO:\s*render|return\s+null\s*;/i.test(filesText)) {
    findings.push("检测到明显的未实现或主动报错代码。");
    repairSuggestions.push("移除未实现占位逻辑，改为可渲染的业务空态或 mock 数据展示。");
  }

  if (!/WorkspaceShell|SidebarNav|nav|navigation|侧边|导航/i.test(filesText)) {
    findings.push("没有检测到主导航或 WorkspaceShell 结构。");
    repairSuggestions.push("按 UI IR 增加主导航，并展示页面切换入口。");
  }

  if (!/DataTable|MetricCard|DetailPanel|table|card|列表|表格|详情|统计/i.test(filesText)) {
    findings.push("没有检测到核心业务数据区域。");
    repairSuggestions.push("补齐统计卡片、表格或详情面板，绑定 mock-data.ts 中的业务数据。");
  }

  if (!/ActionButton|<button|role=["']button["']|主要操作|新增|提交|保存|处理/i.test(filesText)) {
    findings.push("没有检测到主要操作按钮。");
    repairSuggestions.push("为主页面增加一个清晰的主要操作入口，并使用 token 样式。");
  }

  if (snapshot.uiIr && !/--color-primary|--space-3|--radius-md/.test(filesText)) {
    findings.push("未检测到 UI IR 要求的 token CSS variables 使用。");
    repairSuggestions.push("在 /src/styles.css 定义并在组件中使用 --color-primary、--space-3、--radius-md 等变量。");
  }

  const passed = findings.length === 0;
  return codeVisualDiffReportSchema.parse({
    passed,
    checkedAt: new Date().toISOString(),
    findings,
    repairSuggestions,
    summary: passed
      ? "结构化预览验证通过：入口、导航、业务区和主要操作均已具备。"
      : `结构化预览验证发现 ${findings.length} 个问题。`,
  });
}

async function generateCodeFileOperationsWithRepair(
  record: RunRecord,
  providerSettings: ProviderSettings,
  llmTransport: LlmTransport,
  codeContext: unknown,
  agentPlan: string[],
  existingFiles: Record<string, string>,
  generationContext?: {
    appBlueprint?: CodeAppBlueprint | null;
    uiBlueprint?: CodeUiBlueprint | null;
    uiMockup?: CodeUiMockup | null;
    uiReferenceSpec?: CodeUiReferenceSpec | null;
    uiIr?: CodeUiIr | null;
    filePlan?: CodeFilePlan | null;
    qualityIssues?: string[];
  },
) {
  const responseFormat = getGenerateCodeFileOperationsResponseFormat(
    providerSettings.model,
  );
  let prompt = buildGenerateCodeFileOperationsPrompt(
    codeContext,
    agentPlan,
    existingFiles,
    generationContext,
  );
  let previousOutput = "";
  let lastErrorMessage = "";

  for (
    let attempt = 0;
    attempt <= MAX_CODE_OPERATION_REPAIR_ATTEMPTS;
    attempt += 1
  ) {
    const content = await collectTextResult(
      llmTransport,
      providerSettings,
      createMessages(prompt),
      (chunk) => {
        emitEvent(
          record,
          llmChunkRunEventSchema.parse({
            type: "llm_chunk",
            stage: "write_code_files",
            chunk,
          }),
        );
      },
      responseFormat,
    );
    previousOutput = content;

    try {
      return parseCodeFileOperationsResult(content);
    } catch (error) {
      logFailedStructuredOutput(
        "write_code_files",
        providerSettings.model,
        error,
        content,
        attempt + 1,
      );
      lastErrorMessage = formatParseError(error);

      if (attempt === MAX_CODE_OPERATION_REPAIR_ATTEMPTS) {
        throw new Error(
          `write_code_files structured output failed: ${lastErrorMessage}`,
        );
      }

      emitEvent(
        record,
        stageProgressRunEventSchema.parse({
          type: "stage_progress",
          stage: "repair_code_files",
          progress: stageProgressValue("repair_code_files"),
          message: `代码文件操作 JSON 结构不合法，正在修复（${attempt + 1}/${MAX_CODE_OPERATION_REPAIR_ATTEMPTS}）`,
        }),
      );

      prompt = buildRepairCodeFileOperationsPrompt(
        codeContext,
        agentPlan,
        existingFiles,
        previousOutput,
        lastErrorMessage,
        generationContext,
      );
    }
  }

  throw new Error(
    `write_code_files structured output failed: ${lastErrorMessage}`,
  );
}

function applyCodeOperation(
  record: RunRecord,
  snapshot: CodeRunSnapshot,
  operation: CodeFileOperation,
) {
  switch (operation.operation) {
    case "create_file":
    case "update_file":
      emitCodeFileChanged(
        record,
        snapshot,
        operation.path,
        operation.content,
        operation.reason,
      );
      return;
    case "set_entry_file":
      snapshot.entryFile = normalizeFilePath(operation.path);
      addCodeDiagnostic(snapshot, "write_code_files", operation.reason);
      return;
    case "note":
      addCodeDiagnostic(snapshot, "write_code_files", operation.message);
  }
}

function documentTitle(documentKind: DocumentKind) {
  return documentKind === "requirementsSpec"
    ? "需求规格说明书"
    : "软件设计说明书";
}

function expectedDocumentDiagramKinds(documentKind: DocumentKind) {
  return documentKind === "requirementsSpec"
    ? ["usecase", "class", "deployment", "activity"]
    : ["sequence", "class", "activity", "deployment", "table"];
}

function buildDocumentContext(input: StartDocumentRunRequest) {
  return {
    documentKind: input.documentKind,
    requirementText: input.requirementText,
    rules: input.rules,
    requirementModels: input.requirementModels,
    requirementPlantUml: input.requirementPlantUml.map((artifact) => ({
      diagramKind: artifact.diagramKind,
      hasSource: Boolean(artifact.source),
    })),
    requirementSvgArtifacts: input.requirementSvgArtifacts.map((artifact) => ({
      diagramKind: artifact.diagramKind,
      hasSvg: Boolean(artifact.svg),
    })),
    designModels: input.designModels,
    designPlantUml: input.designPlantUml.map((artifact) => ({
      diagramKind: artifact.diagramKind,
      hasSource: Boolean(artifact.source),
    })),
    designSvgArtifacts: input.designSvgArtifacts.map((artifact) => ({
      diagramKind: artifact.diagramKind,
      hasSvg: Boolean(artifact.svg),
    })),
  };
}

function fallbackDocumentSections(input: StartDocumentRunRequest): DocumentSection[] {
  if (input.documentKind === "requirementsSpec") {
    const useCases = input.requirementModels
      .filter((model) => model.diagramKind === "usecase")
      .flatMap((model) => ("useCases" in model ? model.useCases : []));
    return documentContentResultSchema.parse({
      sections: [
        { level: 1, title: "1 项目引言", body: [] },
        { level: 2, title: "1.1 编写目的", body: ["本文档用于描述系统需求范围、功能需求、数据需求、运行需求和约束条件，为后续设计、实现和测试提供依据。"] },
        { level: 2, title: "1.2 基线", body: ["本文档以当前需求文本、需求规则和已生成的需求模型为基线。"] },
        { level: 2, title: "1.3 定义与标识", body: ["本文档中的用例、类、活动和部署节点均来自平台生成的结构化模型。"] },
        { level: 2, title: "1.4 参考资料", body: ["参考资料包括用户输入的原始需求、需求规则、UML 模型和图像产物。"] },
        { level: 1, title: "2 需求概述", body: [] },
        { level: 2, title: "2.1 系统目标", body: [input.requirementText] },
        { level: 2, title: "2.2 用户的特点", body: ["用户角色根据用例模型中的参与者识别，具体职责见功能需求小节。"] },
        { level: 2, title: "2.3 假定的约束", body: ["当前阶段未明确的外部约束在后续评审中补充。"] },
        { level: 1, title: "3 需求规定", body: [] },
        { level: 2, title: "3.1 功能需求", body: ["总体功能需求由用例模型和需求规则共同描述。"], diagramKind: "usecase" },
        ...useCases.slice(0, 8).map((useCase, index) => ({
          level: 3 as const,
          title: `3.1.${index + 1} 用例${index + 1}：${useCase.name}（${useCase.id}）`,
          body: [
            `简要描述：${useCase.goal}`,
            `前置条件：${useCase.preconditions.join("；") || "当前阶段未明确"}`,
            `后置条件：${useCase.postconditions.join("；") || "当前阶段未明确"}`,
          ],
        })),
        { level: 2, title: "3.2 数据需求", body: ["数据需求由领域概念模型中的对象、类和关系描述。"], diagramKind: "class" },
        { level: 3, title: "3.2.1 用例、对象与类的关系", body: ["用例与对象、类的关系依据用例模型和类模型追踪。"] },
        { level: 3, title: "3.2.2 类的描述", body: ["类的属性、操作和职责见领域概念模型。"] },
        { level: 3, title: "3.2.3 类与类的关系", body: ["类之间的关联、继承、聚合或组合关系见领域概念模型。"] },
        { level: 2, title: "3.3 运行需求", body: [], diagramKind: "deployment" },
        { level: 3, title: "3.3.1 网络和设备需求", body: ["网络拓扑和设备需求依据部署模型描述。"] },
        { level: 3, title: "3.3.2 支持软件与部署需求", body: ["支持软件与部署约束依据部署节点和组件关系描述。"] },
        { level: 2, title: "3.4 界面需求", body: ["界面关系图描述主要界面状态和跳转关系。"], diagramKind: "activity" },
        { level: 2, title: "3.5 其它需求", body: [] },
        { level: 3, title: "3.5.1 性能需求", body: ["当前阶段未明确。"] },
        { level: 3, title: "3.5.2 安全需求", body: ["当前阶段未明确。"] },
        { level: 3, title: "3.5.3 操作需求", body: ["当前阶段未明确。"] },
        { level: 3, title: "3.5.4 其它需求约束", body: ["当前阶段未明确。"] },
        { level: 1, title: "4 尚未解决的问题", body: ["当前阶段未明确。"] },
        { level: 1, title: "附录", body: [] },
        { level: 2, title: "附录A:术语表", body: ["术语表将在后续评审中补充。"] },
        { level: 2, title: "附录B:需求原始资料", body: [input.requirementText] },
      ],
    }).sections;
  }

  return documentContentResultSchema.parse({
    sections: [
      { level: 1, title: "1 引言", body: [] },
      { level: 2, title: "1.1 系统概述", body: [input.requirementText] },
      { level: 2, title: "1.2 基线", body: ["本文档以当前需求模型、设计模型和设计图为基线。"] },
      { level: 2, title: "1.3 定义与标识", body: ["设计对象、设计类、顺序图和数据库表均来自平台生成的设计阶段产物。"] },
      { level: 2, title: "1.4 参考资料", body: ["参考资料包括需求规格、需求模型、设计模型和 UML 图像产物。"] },
      { level: 1, title: "2 系统结构", body: [] },
      { level: 2, title: "2.1 网络与硬件配置", body: ["网络与硬件配置依据部署设计模型描述。"], diagramKind: "deployment" },
      { level: 2, title: "2.2 部署设计", body: ["部署设计描述组件、节点、数据库和外部系统之间的关系。"], diagramKind: "deployment" },
      { level: 2, title: "2.3 其它约束", body: ["当前阶段未明确。"] },
      { level: 1, title: "3 设计", body: [] },
      { level: 2, title: "3.1 交互设计", body: ["交互设计通过顺序图描述参与者、对象和服务之间的时序消息。"], diagramKind: "sequence" },
      { level: 3, title: "3.1.1 顺序图1：编号：名称", body: ["顺序图展示主要用例的对象协作和消息顺序。"], diagramKind: "sequence" },
      { level: 2, title: "3.2 结构设计", body: ["结构设计通过设计类图描述对象、设计类及其关系。"], diagramKind: "class" },
      { level: 3, title: "3.2.1 对象与类的关系", body: ["对象与类的关系依据设计类图识别。"] },
      { level: 3, title: "3.2.2 类与类的关系", body: ["类与类之间的继承、关联、聚合、组合或依赖关系见设计类图。"] },
      { level: 3, title: "3.2.3 设计对象", body: ["设计对象来自顺序图参与者和设计类模型。"] },
      { level: 3, title: "3.2.4 设计类", body: ["设计类包含属性、操作、职责和依赖关系。"] },
      { level: 2, title: "3.3 界面设计", body: ["界面设计描述页面状态、跳转关系和界面职责。"], diagramKind: "activity" },
      { level: 3, title: "3.3.1 界面关系", body: ["界面关系图描述主要界面之间的跳转。"], diagramKind: "activity" },
      { level: 3, title: "3.3.2 界面详细设计", body: ["界面详细设计将在原型实现阶段补充。"] },
      { level: 2, title: "3.4 可追踪性设计", body: [] },
      { level: 3, title: "3.4.1 用例与界面的关系", body: ["用例与界面的关系依据需求活动模型和设计交互模型追踪。"] },
      { level: 3, title: "3.4.2 用例与对象、类的关系", body: ["用例与对象、类的关系依据顺序图和设计类图追踪。"] },
      { level: 2, title: "3.5 数据库设计", body: ["数据库设计依据表关系模型描述。"], diagramKind: "table" },
      { level: 3, title: "3.5.1 类与表的关系", body: ["持久类与表的映射关系见表关系图。"] },
      { level: 3, title: "3.5.2 数据表设计", body: ["数据表字段、主键、外键和引用关系见表关系图。"], diagramKind: "table" },
      { level: 2, title: "3.6其它设计", body: [] },
      { level: 3, title: "3.6.1安全设计", body: ["当前阶段未明确。"] },
      { level: 3, title: "3.6.2性能设计", body: ["当前阶段未明确。"] },
      { level: 3, title: "3.6.3其它限制设计", body: ["当前阶段未明确。"] },
      { level: 1, title: "4 尚未设计的问题", body: ["当前阶段未明确。"] },
    ],
  }).sections;
}

function diagramPlantUmlForDocument(input: StartDocumentRunRequest) {
  const artifacts =
    input.documentKind === "requirementsSpec"
      ? input.requirementPlantUml
      : input.designPlantUml;
  return new Map(artifacts.map((artifact) => [artifact.diagramKind, artifact.source]));
}

function diagramSvgKindsForDocument(input: StartDocumentRunRequest) {
  const artifacts =
    input.documentKind === "requirementsSpec"
      ? input.requirementSvgArtifacts
      : input.designSvgArtifacts;
  return new Set(artifacts.map((artifact) => artifact.diagramKind));
}

function documentDiagramLabel(diagramKind: string) {
  const labels: Record<string, string> = {
    usecase: "总体用例图",
    class: "类图",
    activity: "流程与界面关系图",
    deployment: "部署图",
    sequence: "顺序图",
    table: "表关系图",
  };
  return labels[diagramKind] ?? "UML 图";
}

function ensureDocumentDiagramSections(
  documentKind: DocumentKind,
  sections: DocumentSection[],
) {
  const existing = new Set(sections.map((section) => section.diagramKind).filter(Boolean));
  const additions = expectedDocumentDiagramKinds(documentKind)
    .filter((diagramKind) => !existing.has(diagramKind))
    .map((diagramKind) => ({
      level: 3 as const,
      title: `图示：${diagramKind}`,
      body: ["该图将在本小节展示。"],
      diagramKind,
    }));
  return documentContentResultSchema.parse({ sections: [...sections, ...additions] }).sections;
}

function createTextParagraph(text: string) {
  return new Paragraph({
    children: [new TextRun({ text })],
    spacing: { after: 160 },
  });
}

function createHeadingParagraph(section: DocumentSection) {
  const heading =
    section.level === 1
      ? HeadingLevel.HEADING_1
      : section.level === 2
        ? HeadingLevel.HEADING_2
        : HeadingLevel.HEADING_3;
  return new Paragraph({
    text: section.title,
    heading,
    spacing: { before: section.level === 1 ? 320 : 180, after: 120 },
  });
}

function createSimpleTable(section: DocumentSection) {
  if (!section.table) return null;
  const rows = [section.table.headers, ...section.table.rows].map(
    (cells, rowIndex) =>
      new TableRow({
        children: cells.map(
          (cell) =>
            new TableCell({
              children: [
                new Paragraph({
                  children: [
                    new TextRun({
                      text: cell || " ",
                      bold: rowIndex === 0,
                    }),
                  ],
                }),
              ],
            }),
        ),
      }),
  );
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows,
  });
}

function createPngImageParagraph(png: Buffer, title: string) {
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    children: [
      new ImageRun({
        type: "png",
        data: png,
        transformation: {
          width: 560,
          height: 320,
        },
        altText: {
          title,
          description: title,
          name: title,
        },
      }),
    ],
    spacing: { before: 120, after: 120 },
  });
}

function createFigureCaption(text: string) {
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    children: [new TextRun({ text, italics: true })],
    spacing: { before: 40, after: 160 },
  });
}

async function renderDocumentBuffer(
  documentKind: DocumentKind,
  sections: DocumentSection[],
  plantUmlMap: Map<string, string>,
  svgKinds: Set<string>,
  pngRenderClient: PngRenderClient,
  missingArtifacts: string[],
) {
  const children: Array<Paragraph | Table> = [
    new Paragraph({
      text: documentTitle(documentKind),
      heading: HeadingLevel.TITLE,
      alignment: AlignmentType.CENTER,
      spacing: { after: 360 },
    }),
    new Paragraph({
      text: "成都信息工程大学 软件工程学院",
      alignment: AlignmentType.CENTER,
      spacing: { after: 360 },
    }),
  ];

  for (const section of sections) {
    children.push(createHeadingParagraph(section));
    for (const paragraph of section.body) {
      children.push(createTextParagraph(paragraph));
    }
    const table = createSimpleTable(section);
    if (table) {
      children.push(table);
    }
    if (section.diagramKind) {
      const source = plantUmlMap.get(section.diagramKind);
      if (!source) {
        const reason = svgKinds.has(section.diagramKind)
          ? `${section.diagramKind}: 缺少可嵌入图片源`
          : section.diagramKind;
        missingArtifacts.push(reason);
        children.push(createTextParagraph("当前未生成该图。"));
        continue;
      }

      try {
        const rendered = await pngRenderClient({
          diagramKind: section.diagramKind as UmlDiagramKind,
          source,
        });
        children.push(createPngImageParagraph(rendered.png, section.title));
        children.push(
          createFigureCaption(`图 ${documentDiagramLabel(section.diagramKind)}`),
        );
      } catch (error) {
        missingArtifacts.push(
          `${section.diagramKind}: ${error instanceof Error ? error.message : "图片渲染失败"}`,
        );
        children.push(createTextParagraph("当前未生成该图。"));
      }
    }
  }

  const doc = new Document({
    sections: [
      {
        properties: {},
        children,
      },
    ],
  });

  return Packer.toBuffer(doc);
}

async function runDocumentStagePipeline(
  record: RunRecord,
  input: StartDocumentRunRequest,
  providerSettings: ProviderSettings,
  llmTransport: LlmTransport,
  pngRenderClient: PngRenderClient,
) {
  const snapshot = record.snapshot as DocumentRunSnapshot;
  const updateStage = (stage: RunStage, message?: string) => {
    snapshot.currentStage = stage;
    snapshot.status = "running";
    emitEvent(record, stageStartedRunEventSchema.parse({ type: "stage_started", stage }));
    emitEvent(
      record,
      stageProgressRunEventSchema.parse({
        type: "stage_progress",
        stage,
        progress: stageProgressValue(stage),
        message,
      }),
    );
  };

  updateStage("generate_document_text", "正在生成说明书正文");
  let sections = fallbackDocumentSections(input);
  if (input.useAiText) {
    const result = await collectStructuredResult(
      llmTransport,
      providerSettings,
      createMessages(
        buildGenerateDocumentContentPrompt(input.documentKind, buildDocumentContext(input)),
      ),
      "generate_document_text",
      (chunk) => {
        emitEvent(
          record,
          llmChunkRunEventSchema.parse({
            type: "llm_chunk",
            stage: "generate_document_text",
            chunk,
          }),
        );
      },
      (text) => documentContentResultSchema.parse(parseJson(text)),
      undefined,
    );
    sections = result.sections;
  }
  sections = ensureDocumentDiagramSections(input.documentKind, sections);
  snapshot.sections = sections;

  updateStage("render_document_file", "正在写入说明书文件");
  const missingArtifacts: string[] = [];
  const buffer = await renderDocumentBuffer(
    input.documentKind,
    sections,
    diagramPlantUmlForDocument(input),
    diagramSvgKindsForDocument(input),
    pngRenderClient,
    missingArtifacts,
  );
  record.documentBuffer = buffer;
  snapshot.missingArtifacts = [...new Set(missingArtifacts)];
  snapshot.byteLength = buffer.byteLength;
  snapshot.status = "completed";
  snapshot.errorMessage = null;
  emitEvent(
    record,
    artifactReadyRunEventSchema.parse({
      type: "artifact_ready",
      stage: "render_document_file",
      artifactKind: "document",
    }),
  );
  emitEvent(
    record,
    completedRunEventSchema.parse({
      type: "completed",
      snapshot,
    }),
  );
}

async function runCodeStagePipeline(
  record: RunRecord,
  providerSettings: ProviderSettings,
  imageProviderSettings: ImageProviderSettings | null,
  llmTransport: LlmTransport,
  imageClient: ImageGenerationClient,
  codePlanCache: CodePlanCache,
) {
  const snapshot = record.snapshot as CodeRunSnapshot;

  const updateStage = (stage: RunStage, message?: string) => {
    snapshot.currentStage = stage;
    snapshot.status = "running";
    emitEvent(record, stageStartedRunEventSchema.parse({ type: "stage_started", stage }));
    emitEvent(
      record,
      stageProgressRunEventSchema.parse({
        type: "stage_progress",
        stage,
        progress: stageProgressValue(stage),
        message,
      }),
    );
  };

  const dependencies = {
    react: "^18.3.1",
    "react-dom": "^18.3.1",
    "lucide-react": "^0.487.0",
    ...snapshot.dependencies,
  };
  snapshot.dependencies = dependencies;
  snapshot.entryFile = snapshot.entryFile ?? "/src/App.tsx";

  let codeContext = buildCodeContext(snapshot);
  const codeContextHash = hashCodeContext(codeContext);
  snapshot.codeContextHash = codeContextHash;

  updateStage("analyze_code_product", "正在分析业务背景和页面闭环");
  const appBlueprintResult = await collectStructuredResult(
    llmTransport,
    providerSettings,
    createMessages(
      buildGenerateCodeAppBlueprintPrompt(
        snapshot.requirementText,
        snapshot.rules,
        snapshot.designModels,
      ),
    ),
    "analyze_code_product",
    (chunk) => {
      emitEvent(
        record,
        llmChunkRunEventSchema.parse({
          type: "llm_chunk",
          stage: "analyze_code_product",
          chunk,
        }),
      );
    },
    (text) => codeAppBlueprintResultSchema.parse(parseJson(text)),
    getGenerateCodeAppBlueprintResponseFormat(providerSettings.model),
  );
  const appBlueprint = appBlueprintResult.appBlueprint;
  snapshot.appBlueprint = appBlueprint;
  addCodeDiagnostic(
    snapshot,
    "analyze_code_product",
    `已规划 ${appBlueprint.pages.length} 个业务页面`,
  );

  codeContext = buildCodeContext(snapshot);
  updateStage("plan_code_ui", "正在规划界面主题、布局和状态");
  const uiBlueprintResult = await collectStructuredResult(
    llmTransport,
    providerSettings,
    createMessages(buildGenerateCodeUiBlueprintPrompt(codeContext, appBlueprint)),
    "plan_code_ui",
    (chunk) => {
      emitEvent(
        record,
        llmChunkRunEventSchema.parse({
          type: "llm_chunk",
          stage: "plan_code_ui",
          chunk,
        }),
      );
    },
    parseCodeUiBlueprintResult,
    getGenerateCodeUiBlueprintResponseFormat(providerSettings.model),
  );
  const uiBlueprint = uiBlueprintResult.uiBlueprint;
  snapshot.uiBlueprint = uiBlueprint;
  addCodeDiagnostic(snapshot, "plan_code_ui", uiBlueprint.visualLanguage);

  let uiMockup: CodeUiMockup | null = null;
  if (imageProviderSettings) {
    updateStage("generate_code_ui_mockup", "正在生成界面设计图");
    uiMockup = await generateCodeUiMockup(
      record,
      snapshot,
      imageClient,
      imageProviderSettings,
      appBlueprint,
      uiBlueprint,
    );
  } else {
    addCodeDiagnostic(
      snapshot,
      "generate_code_ui_mockup",
      "未配置图片模型，已跳过界面设计图生成",
    );
  }

  updateStage("analyze_code_ui_mockup", "正在解析界面设计图");
  const uiReferenceSpec = await analyzeCodeUiMockup(
    record,
    snapshot,
    providerSettings,
    llmTransport,
    appBlueprint,
    uiBlueprint,
    uiMockup,
  );

  updateStage("generate_code_ui_ir", "正在生成结构化 UI IR 和组件约束");
  const uiIr = await generateCodeUiIr(
    record,
    snapshot,
    providerSettings,
    llmTransport,
    appBlueprint,
    uiBlueprint,
    uiMockup,
    uiReferenceSpec,
  );

  codeContext = buildCodeContext(snapshot);
  updateStage("plan_code_files", "正在规划多页面文件结构");
  const filePlanResult = await collectStructuredResult(
    llmTransport,
    providerSettings,
    createMessages(
      buildGenerateCodeFilePlanPrompt(
        codeContext,
        appBlueprint,
        uiBlueprint,
        uiMockup,
        uiReferenceSpec,
        uiIr,
        snapshot.files,
      ),
    ),
    "plan_code_files",
    (chunk) => {
      emitEvent(
        record,
        llmChunkRunEventSchema.parse({
          type: "llm_chunk",
          stage: "plan_code_files",
          chunk,
        }),
      );
    },
    (text) => codeFilePlanResultSchema.parse(parseJson(text)),
    getGenerateCodeFilePlanResponseFormat(providerSettings.model),
  );
  const filePlan = filePlanResult.filePlan;
  snapshot.filePlan = filePlan;
  snapshot.entryFile = normalizeFilePath(filePlan.entryFile);
  snapshot.spec = buildCodeGenerationSpecFromBlueprints(
    appBlueprint,
    uiBlueprint,
    filePlan,
    uiIr,
  );
  snapshot.spec.uiReferenceSpec = uiReferenceSpec;
  snapshot.spec.uiIr = uiIr;
  addCodeDiagnostic(
    snapshot,
    "plan_code_files",
    `已规划 ${filePlan.files.length} 个原型文件`,
  );
  emitEvent(
    record,
    artifactReadyRunEventSchema.parse({
      type: "artifact_ready",
      stage: "plan_code_files",
      artifactKind: "codeSpec",
    }),
  );

  updateStage("write_code_files", "正在写入可运行骨架文件");
  const scaffold = createStableCodeScaffold();
  for (const [path, content] of Object.entries(scaffold)) {
    if (!snapshot.files[path]) {
      emitCodeFileChanged(record, snapshot, path, content, "写入稳定 Sandpack 骨架");
    }
  }

  codeContext = buildCodeContext(snapshot);

  updateStage("plan_code", "正在制定文件实现步骤");
  const cachedPlan = codePlanCache.get(codeContextHash);
  if (cachedPlan) {
    snapshot.agentPlan = cachedPlan.plan;
    addCodeDiagnostic(snapshot, "plan_code", "复用同一设计模型的实现计划缓存");
  } else {
    const planResult = await collectStructuredResult(
      llmTransport,
      providerSettings,
      createMessages(buildGenerateCodeAgentPlanPrompt(codeContext, snapshot.files)),
      "plan_code",
      (chunk) => {
        emitEvent(
          record,
          llmChunkRunEventSchema.parse({
            type: "llm_chunk",
            stage: "plan_code",
            chunk,
          }),
        );
      },
      (text) => codeAgentPlanResultSchema.parse(parseJson(text)),
      getGenerateCodeAgentPlanResponseFormat(providerSettings.model),
    );
    snapshot.agentPlan = planResult.plan;
    codePlanCache.set(codeContextHash, { plan: planResult.plan });
  }

  updateStage("write_code_files", "正在生成多页面原型代码");
  const operationsResult = await generateCodeFileOperationsWithRepair(
    record,
    providerSettings,
    llmTransport,
    codeContext,
    snapshot.agentPlan,
    snapshot.files,
    {
      appBlueprint,
      uiBlueprint,
      uiMockup,
      uiReferenceSpec,
      uiIr,
      filePlan,
    },
  );

  for (const operation of operationsResult.operations) {
    applyCodeOperation(record, snapshot, operation);
  }

  emitEvent(
    record,
    artifactReadyRunEventSchema.parse({
      type: "artifact_ready",
      stage: "write_code_files",
      artifactKind: "codeFiles",
    }),
  );

  updateStage("audit_code_quality", "正在检查页面数量、文件结构和实现质量");
  let qualityDiagnostic = auditCodePrototypeQuality(snapshot);
  recordCodeQualityDiagnostics(snapshot, qualityDiagnostic);
  if (!qualityDiagnostic.passed) {
    updateStage("repair_code_files", "正在根据质量问题补齐原型代码");
    const repairIssues = qualityDiagnostic.issues.map((issue) =>
      `${issue.path ? `${issue.path}：` : ""}${issue.message}`,
    );
    const repairOperations = await generateCodeFileOperationsWithRepair(
      record,
      providerSettings,
      llmTransport,
      buildCodeContext(snapshot),
      snapshot.agentPlan,
      snapshot.files,
      {
        appBlueprint,
        uiBlueprint,
        uiMockup,
        uiReferenceSpec,
        uiIr,
        filePlan,
        qualityIssues: repairIssues,
      },
    );
    for (const operation of repairOperations.operations) {
      applyCodeOperation(record, snapshot, operation);
    }
    updateStage("audit_code_quality", "正在复查修复后的原型质量");
    qualityDiagnostic = auditCodePrototypeQuality(snapshot);
    recordCodeQualityDiagnostics(snapshot, qualityDiagnostic);
  }

  updateStage("verify_code_ui_fidelity", "正在检查原型是否贴合界面设计图");
  let fidelityReport = await verifyCodeUiFidelity(
    record,
    snapshot,
    providerSettings,
    llmTransport,
  );
  let repairRoundsRun = 0;
  let repairStopReason = fidelityReport.passed
    ? "还原度检查已通过"
    : "还原度检查未通过且没有可执行修复建议";
  for (
    let repairRound = 1;
    repairRound <= MAX_UI_FIDELITY_REPAIR_ROUNDS &&
    !fidelityReport.passed &&
    fidelityReport.repairSuggestions.length > 0;
    repairRound += 1
  ) {
    updateStage(
      "repair_code_files",
      `正在根据设计图还原检查修复原型（第 ${repairRound}/${MAX_UI_FIDELITY_REPAIR_ROUNDS} 轮）`,
    );
    const changedBeforeRepair = snapshot.changedFileCount;
    const repairOperations = await generateCodeFileOperationsWithRepair(
      record,
      providerSettings,
      llmTransport,
      buildCodeContext(snapshot),
      snapshot.agentPlan,
      snapshot.files,
      {
        appBlueprint,
        uiBlueprint,
        uiMockup,
        uiReferenceSpec,
        uiIr,
        filePlan,
        qualityIssues: [
          ...fidelityReport.repairSuggestions,
          ...qualityDiagnostic.issues.map((issue) =>
            `${issue.path ? `${issue.path}：` : ""}${issue.message}`,
          ),
        ],
      },
    );
    for (const operation of repairOperations.operations) {
      applyCodeOperation(record, snapshot, operation);
    }
    repairRoundsRun = repairRound;

    if (snapshot.changedFileCount === changedBeforeRepair) {
      repairStopReason = "本轮还原度修复没有产生实质文件变化";
      break;
    }

    updateStage("audit_code_quality", "正在复查还原修复后的原型质量");
    qualityDiagnostic = auditCodePrototypeQuality(snapshot);
    recordCodeQualityDiagnostics(snapshot, qualityDiagnostic);
    if (!qualityDiagnostic.passed) {
      repairStopReason = "还原修复后仍存在阻塞性质量问题";
      break;
    }

    updateStage("verify_code_ui_fidelity", "正在复查原型是否贴合界面设计图");
    fidelityReport = await verifyCodeUiFidelity(
      record,
      snapshot,
      providerSettings,
      llmTransport,
    );
    repairStopReason = fidelityReport.passed
      ? "还原度检查已通过"
      : "达到还原修复轮次上限";
  }
  snapshot.repairLoopSummary = {
    maxRounds: MAX_UI_FIDELITY_REPAIR_ROUNDS,
    roundsRun: repairRoundsRun,
    stopReason: repairStopReason,
    repaired: repairRoundsRun > 0,
  };

  updateStage("verify_code_rendered_preview", "正在进行结构化预览验证");
  const visualDiffReport = verifyRenderedPreviewStructure(snapshot);
  snapshot.visualDiffReport = visualDiffReport;
  addCodeDiagnostic(snapshot, "verify_code_rendered_preview", visualDiffReport.summary);
  emitEvent(
    record,
    artifactReadyRunEventSchema.parse({
      type: "artifact_ready",
      stage: "verify_code_rendered_preview",
      artifactKind: "visualDiffReport",
      visualDiffReport,
    }),
  );

  updateStage("verify_code_preview", "正在检查预览入口和必要文件");
  ensureRequiredPrototypeFiles(record, snapshot, scaffold);
  validatePrototypeFileContents(snapshot);
  if (!snapshot.files[snapshot.entryFile ?? ""]) {
    snapshot.entryFile = "/src/App.tsx";
    addCodeDiagnostic(snapshot, "verify_code_preview", "入口文件已回退到 /src/App.tsx");
  }
  addCodeDiagnostic(
    snapshot,
    "verify_code_preview",
    "已生成 Sandpack 可预览文件，浏览器侧会继续编译并显示错误态",
  );
  if (snapshot.generationMode === "continue" && snapshot.changedFileCount === 0) {
    addCodeDiagnostic(snapshot, "verify_code_preview", "本次未产生文件变更");
  }

  snapshot.status = "completed";
  snapshot.errorMessage = null;
  emitEvent(
    record,
    completedRunEventSchema.parse({
      type: "completed",
      snapshot,
    }),
  );
}

export async function createApiServer(options?: {
  llmTransport?: LlmTransport;
  imageClient?: ImageGenerationClient;
  renderClient?: RenderClient;
  pngRenderClient?: PngRenderClient;
  renderServiceBaseUrl?: string;
}) {
  const app = Fastify({ logger: true });
  await app.register(cors, {
    origin: createCorsOriginChecker("API_CORS_ORIGINS", DEFAULT_LOCAL_CORS_ORIGINS),
  });
  const codePlanCache: CodePlanCache = new Map();
  app.setErrorHandler((error, request, reply) => {
    request.log.error(error);
    if (error instanceof ZodError) {
      reply.code(400).send({
        message: error.issues
          .map((issue) => {
            const path = issue.path.length > 0 ? issue.path.join(".") : "request";
            return `${path}: ${issue.message}`;
          })
          .join("; "),
      });
      return;
    }

    reply.code(500).send({
      message: error instanceof Error ? error.message : "Internal server error",
    });
  });

  const llmTransport = options?.llmTransport ?? createRealLlmTransport();
  const imageClient = options?.imageClient ?? createRealImageGenerationClient();
  const renderServiceBaseUrl =
    options?.renderServiceBaseUrl ?? DEFAULT_RENDER_SERVICE_BASE_URL;
  const renderClient: RenderClient =
    options?.renderClient ??
    ((artifact: AnyPlantUmlArtifact) =>
      createRenderClient(renderServiceBaseUrl, artifact));
  const pngRenderClient: PngRenderClient =
    options?.pngRenderClient ??
    ((artifact: AnyPlantUmlArtifact) =>
      createPngRenderClient(renderServiceBaseUrl, artifact));
  const runs = new Map<string, RunRecord>();

  const healthPayload = () => ({
    status: "ok",
    renderServiceBaseUrl,
  });
  const versionPayload = () => ({
    status: "ok",
    releaseSha: process.env.UML_RELEASE_SHA ?? null,
    releaseDir: process.env.UML_RELEASE_DIR ?? null,
    runtimeCwd: resolveRuntimeCwd(),
    startedAt: RELEASE_STARTED_AT,
    nodeEnv: process.env.NODE_ENV ?? null,
    renderServiceBaseUrl,
    features: {
      supportsDesignTableDiagram:
        designDiagramKindSchema.safeParse("table").success,
    },
  });

  app.get("/health", async () => healthPayload());
  app.get("/api/health", async () => healthPayload());
  app.get("/version", async () => versionPayload());
  app.get("/api/version", async () => versionPayload());

  app.post("/api/runs", async (request, reply) => {
    const input = startRunRequestSchema.parse(request.body);
    const runId = randomUUID();
    const record: RunRecord = {
      snapshot: createEmptySnapshot(runId, input.requirementText, input.selectedDiagrams),
      events: [],
      listeners: new Set(),
      terminal: false,
    };
    runs.set(runId, record);

    emitEvent(record, queuedRunEventSchema.parse({ type: "queued" }));

    void runStagePipeline(record, input.providerSettings, llmTransport, renderClient).catch(
      (error) => {
        record.snapshot.status = "failed";
        record.snapshot.errorMessage =
          error instanceof Error ? error.message : "Unknown run error";
        emitEvent(
          record,
          failedRunEventSchema.parse({
            type: "failed",
            stage: record.snapshot.currentStage ?? undefined,
            message: record.snapshot.errorMessage,
          }),
        );
      },
    );

    reply.code(202);
    return startRunResponseSchema.parse({ runId });
  });

  app.post("/api/design-runs", async (request, reply) => {
    const input = startDesignRunRequestSchema.parse(request.body);
    const runId = randomUUID();
    const record: RunRecord = {
      snapshot: createEmptyDesignSnapshot(runId, input),
      events: [],
      listeners: new Set(),
      terminal: false,
    };
    runs.set(runId, record);

    emitEvent(record, queuedRunEventSchema.parse({ type: "queued" }));

    void runDesignStagePipeline(
      record,
      input.providerSettings,
      llmTransport,
      renderClient,
    ).catch((error) => {
      record.snapshot.status = "failed";
      record.snapshot.errorMessage =
        error instanceof Error ? error.message : "Unknown design run error";
      emitEvent(
        record,
        failedRunEventSchema.parse({
          type: "failed",
          stage: record.snapshot.currentStage ?? undefined,
          message: record.snapshot.errorMessage,
        }),
      );
    });

    reply.code(202);
    return startDesignRunResponseSchema.parse({ runId });
  });

  app.post("/api/code-runs", async (request, reply) => {
    const input = startCodeRunRequestSchema.parse(request.body);
    const runId = randomUUID();
    const record: RunRecord = {
      snapshot: createEmptyCodeSnapshot(runId, input),
      events: [],
      listeners: new Set(),
      terminal: false,
    };
    runs.set(runId, record);

    emitEvent(record, queuedRunEventSchema.parse({ type: "queued" }));

    void runCodeStagePipeline(
      record,
      input.providerSettings,
      input.imageProviderSettings ?? null,
      llmTransport,
      imageClient,
      codePlanCache,
    ).catch((error) => {
      record.snapshot.status = "failed";
      record.snapshot.errorMessage =
        error instanceof Error ? error.message : "Unknown code run error";
      addCodeDiagnostic(
        record.snapshot as CodeRunSnapshot,
        record.snapshot.currentStage ?? "write_code_files",
        record.snapshot.errorMessage,
      );
      emitEvent(
        record,
        failedRunEventSchema.parse({
          type: "failed",
          stage: record.snapshot.currentStage ?? undefined,
          message: record.snapshot.errorMessage,
        }),
      );
    });

    reply.code(202);
    return startCodeRunResponseSchema.parse({ runId });
  });

  app.post("/api/document-runs", async (request, reply) => {
    const input = startDocumentRunRequestSchema.parse(request.body);
    const runId = randomUUID();
    const record: RunRecord = {
      snapshot: createEmptyDocumentSnapshot(runId, input),
      events: [],
      listeners: new Set(),
      terminal: false,
    };
    runs.set(runId, record);

    emitEvent(record, queuedRunEventSchema.parse({ type: "queued" }));

    void runDocumentStagePipeline(
      record,
      input,
      input.providerSettings,
      llmTransport,
      pngRenderClient,
    ).catch((error) => {
      record.snapshot.status = "failed";
      record.snapshot.errorMessage =
        error instanceof Error ? error.message : "Unknown document run error";
      emitEvent(
        record,
        failedRunEventSchema.parse({
          type: "failed",
          stage: record.snapshot.currentStage ?? "generate_document_text",
          message: record.snapshot.errorMessage,
        }),
      );
    });

    reply.code(202);
    return startDocumentRunResponseSchema.parse({ runId });
  });

  app.post("/api/render/svg", async (request, reply) => {
    const input = renderSvgRequestSchema.parse(request.body);
    try {
      return renderSvgResponseSchema.parse(
        await renderClient({
          diagramKind: input.diagramKind,
          source: input.plantUmlSource,
        }),
      );
    } catch (error) {
      request.log.error(error);
      reply.code(400);
      return {
        message: error instanceof Error ? error.message : "Unknown render error",
      };
    }
  });

  app.post("/api/render/png", async (request, reply) => {
    const input = renderPngRequestSchema.parse(request.body);
    try {
      const rendered = await pngRenderClient({
        diagramKind: input.diagramKind,
        source: input.plantUmlSource,
      });
      return renderPngResponseSchema.parse({
        pngBase64: rendered.png.toString("base64"),
        renderMeta: rendered.renderMeta,
      });
    } catch (error) {
      request.log.error(error);
      reply.code(400);
      return {
        message: error instanceof Error ? error.message : "Unknown render error",
      };
    }
  });

  app.post("/api/provider/test", async (request, reply) => {
    const providerSettings = providerSettingsSchema.parse(request.body);
    const capability = getModelCapability(providerSettings.model);
    const response = await fetch(
      new URL("/v1/chat/completions", providerSettings.apiBaseUrl).toString(),
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${providerSettings.apiKey}`,
        },
        body: JSON.stringify({
          model: providerSettings.model,
          messages: [
            {
              role: "user",
              content: "只回复 JSON：{\"ok\":true}",
            },
          ],
          stream: false,
          temperature: 0,
          response_format: { type: "json_object" },
          tools: [],
          tool_choice: "none",
        }),
      },
    );

    if (!response.ok) {
      let message = `Provider test failed with HTTP ${response.status}`;
      try {
        const payload = (await response.json()) as {
          message?: string;
          error?: { message?: string };
        };
        message = payload.error?.message ?? payload.message ?? message;
      } catch {
        try {
          const text = await response.text();
          if (text.trim()) {
            message = `${message}: ${text.trim().slice(0, 240)}`;
          }
        } catch {
          // Keep the status-based message.
        }
      }
      reply.code(response.status >= 400 && response.status < 500 ? 400 : 502);
      return {
        ok: false,
        message,
        capability,
      };
    }

    return {
      ok: true,
      message: "Provider connection ok",
      capability,
    };
  });

  app.get("/api/runs/:runId", async (request, reply) => {
    const { runId } = request.params as { runId: string };
    const record = runs.get(runId);
    if (!record) {
      reply.code(404);
      return { message: "Run not found" };
    }
    return runSnapshotSchema.parse(record.snapshot);
  });

  app.get("/api/design-runs/:runId", async (request, reply) => {
    const { runId } = request.params as { runId: string };
    const record = runs.get(runId);
    if (!record) {
      reply.code(404);
      return { message: "Design run not found" };
    }
    return designRunSnapshotSchema.parse(record.snapshot);
  });

  app.get("/api/code-runs/:runId", async (request, reply) => {
    const { runId } = request.params as { runId: string };
    const record = runs.get(runId);
    if (!record) {
      reply.code(404);
      return {
        message: "代码生成任务已丢失，可能是本地 API 服务重启，请重新生成",
      };
    }
    return codeRunSnapshotSchema.parse(record.snapshot);
  });

  app.get("/api/document-runs/:runId", async (request, reply) => {
    const { runId } = request.params as { runId: string };
    const record = runs.get(runId);
    if (!record) {
      reply.code(404);
      return { message: "Document run not found" };
    }
    return documentRunSnapshotSchema.parse(record.snapshot);
  });

  app.get("/api/document-runs/:runId/download", async (request, reply) => {
    const { runId } = request.params as { runId: string };
    const record = runs.get(runId);
    if (!record || !record.documentBuffer) {
      reply.code(404);
      return { message: "Document file not found" };
    }
    const snapshot = documentRunSnapshotSchema.parse(record.snapshot);
    reply.header(
      "Content-Type",
      snapshot.mimeType ??
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    );
    reply.header(
      "Content-Disposition",
      `attachment; filename*=UTF-8''${encodeURIComponent(snapshot.fileName ?? "说明书.docx")}`,
    );
    return record.documentBuffer;
  });

  app.get("/api/runs/:runId/events", async (request, reply) => {
    const { runId } = request.params as { runId: string };
    const record = runs.get(runId);
    if (!record) {
      reply.code(404);
      return { message: "Run not found" };
    }

    const requestOrigin =
      typeof request.headers.origin === "string" ? request.headers.origin : null;
    const allowOrigin = requestOrigin ?? DEFAULT_SSE_ALLOW_ORIGIN;

    reply.hijack();
    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "Access-Control-Allow-Origin": allowOrigin,
      Vary: "Origin",
    });

    const send = (event: RunEvent) => {
      reply.raw.write(`data: ${JSON.stringify(event)}\n\n`);
    };
    let listener: ((event: RunEvent) => void) | null = null;
    const heartbeat = setInterval(() => {
      reply.raw.write(": heartbeat\n\n");
    }, 15000);
    const close = () => {
      clearInterval(heartbeat);
      if (listener) {
        record.listeners.delete(listener);
      }
      reply.raw.end();
    };

    for (const event of record.events) {
      send(event);
    }

    if (record.terminal) {
      clearInterval(heartbeat);
      reply.raw.end();
      return;
    }

    listener = (event: RunEvent) => {
      send(event);
      if (event.type === "completed" || event.type === "failed") {
        close();
      }
    };

    record.listeners.add(listener);
    request.raw.on("close", () => {
      clearInterval(heartbeat);
      if (listener) {
        record.listeners.delete(listener);
      }
    });
  });

  app.get("/api/design-runs/:runId/events", async (request, reply) => {
    const { runId } = request.params as { runId: string };
    const record = runs.get(runId);
    if (!record) {
      reply.code(404);
      return { message: "Design run not found" };
    }

    const requestOrigin =
      typeof request.headers.origin === "string" ? request.headers.origin : null;
    const allowOrigin = requestOrigin ?? DEFAULT_SSE_ALLOW_ORIGIN;

    reply.hijack();
    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "Access-Control-Allow-Origin": allowOrigin,
      Vary: "Origin",
    });

    const send = (event: RunEvent) => {
      reply.raw.write(`data: ${JSON.stringify(event)}\n\n`);
    };

    for (const event of record.events) {
      send(event);
    }

    if (record.terminal) {
      reply.raw.end();
      return;
    }

    const listener = (event: RunEvent) => {
      send(event);
      if (event.type === "completed" || event.type === "failed") {
        record.listeners.delete(listener);
        reply.raw.end();
      }
    };

    record.listeners.add(listener);
    request.raw.on("close", () => {
      record.listeners.delete(listener);
    });
  });

  app.get("/api/code-runs/:runId/events", async (request, reply) => {
    const { runId } = request.params as { runId: string };
    const record = runs.get(runId);
    if (!record) {
      reply.code(404);
      return { message: "Code run not found" };
    }

    const requestOrigin =
      typeof request.headers.origin === "string" ? request.headers.origin : null;
    const allowOrigin = requestOrigin ?? DEFAULT_SSE_ALLOW_ORIGIN;

    reply.hijack();
    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "Access-Control-Allow-Origin": allowOrigin,
      Vary: "Origin",
    });

    const send = (event: RunEvent) => {
      reply.raw.write(`data: ${JSON.stringify(event)}\n\n`);
    };

    for (const event of record.events) {
      send(event);
    }

    if (record.terminal) {
      reply.raw.end();
      return;
    }

    const listener = (event: RunEvent) => {
      send(event);
      if (event.type === "completed" || event.type === "failed") {
        record.listeners.delete(listener);
        reply.raw.end();
      }
    };

    record.listeners.add(listener);
    request.raw.on("close", () => {
      record.listeners.delete(listener);
    });
  });

  app.get("/api/document-runs/:runId/events", async (request, reply) => {
    const { runId } = request.params as { runId: string };
    const record = runs.get(runId);
    if (!record) {
      reply.code(404);
      return { message: "Document run not found" };
    }

    const requestOrigin =
      typeof request.headers.origin === "string" ? request.headers.origin : null;
    const allowOrigin = requestOrigin ?? DEFAULT_SSE_ALLOW_ORIGIN;

    reply.hijack();
    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "Access-Control-Allow-Origin": allowOrigin,
      Vary: "Origin",
    });

    const send = (event: RunEvent) => {
      reply.raw.write(`data: ${JSON.stringify(event)}\n\n`);
    };

    for (const event of record.events) {
      send(event);
    }

    if (record.terminal) {
      reply.raw.end();
      return;
    }

    const listener = (event: RunEvent) => {
      send(event);
      if (event.type === "completed" || event.type === "failed") {
        record.listeners.delete(listener);
        reply.raw.end();
      }
    };

    record.listeners.add(listener);
    request.raw.on("close", () => {
      record.listeners.delete(listener);
    });
  });

  return app;
}

async function start() {
  const app = await createApiServer();
  await app.listen({ host: DEFAULT_HOST, port: DEFAULT_PORT });
}

function resolveEntrypointPath(path: string) {
  try {
    return realpathSync(path);
  } catch {
    return resolve(path);
  }
}

function resolveRuntimeCwd() {
  try {
    return realpathSync(process.cwd());
  } catch {
    return resolve(process.cwd());
  }
}

function readCorsOrigins(envName: string, localDefaults: string[]) {
  const configured = process.env[envName]
    ?.split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  if (configured && configured.length > 0) {
    return configured;
  }

  return process.env.NODE_ENV === "production" ? [] : localDefaults;
}

function createCorsOriginChecker(envName: string, localDefaults: string[]) {
  const allowedOrigins = new Set(readCorsOrigins(envName, localDefaults));

  return async (origin: string | undefined) => {
    if (!origin || allowedOrigins.has(origin)) {
      return true;
    }

    console.warn(
      `[cors] Rejected origin "${origin}". Configure ${envName} to allow it.`,
    );
    return false;
  };
}

export function isMainModule(metaUrl: string, argvPath = process.argv[1]) {
  if (!argvPath) {
    return false;
  }

  return (
    resolveEntrypointPath(fileURLToPath(metaUrl)) ===
    resolveEntrypointPath(argvPath)
  );
}

if (isMainModule(import.meta.url)) {
  start().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
