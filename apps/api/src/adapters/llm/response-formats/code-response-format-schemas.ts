// Defines the JSON schema response formats used by code generation stages.
import { type ChatCompletionResponseFormat } from "../../../llm.js";

export const GENERATE_CODE_SPEC_RESPONSE_FORMAT: ChatCompletionResponseFormat = {
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

export const GENERATE_CODE_FILES_RESPONSE_FORMAT: ChatCompletionResponseFormat = {
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

export const CODE_PAGE_RESPONSE_SCHEMA = {
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

export const CODE_THEME_RESPONSE_SCHEMA = {
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

export const CODE_BUSINESS_LOGIC_RESPONSE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    appName: { type: "string" },
    domainSummary: { type: "string" },
    coreWorkflow: { type: "string" },
    actors: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          id: { type: "string" },
          name: { type: "string" },
          type: { type: "string" },
          responsibilities: { type: "array", items: { type: "string" } },
        },
        required: ["id", "name", "type", "responsibilities"],
      },
    },
    businessEntities: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          id: { type: "string" },
          name: { type: "string" },
          description: { type: "string" },
          fields: { type: "array", items: { type: "string" } },
          relationships: { type: "array", items: { type: "string" } },
        },
        required: ["id", "name", "description", "fields", "relationships"],
      },
    },
    pageFlows: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          id: { type: "string" },
          name: { type: "string" },
          route: { type: "string" },
          purpose: { type: "string" },
          actors: { type: "array", items: { type: "string" } },
          entryPoints: { type: "array", items: { type: "string" } },
          userActions: { type: "array", items: { type: "string" } },
          states: { type: "array", items: { type: "string" } },
          sourceRefs: { type: "array", items: { type: "string" } },
        },
        required: [
          "id",
          "name",
          "route",
          "purpose",
          "actors",
          "entryPoints",
          "userActions",
          "states",
          "sourceRefs",
        ],
      },
    },
    stateMachines: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          entity: { type: "string" },
          states: { type: "array", items: { type: "string" } },
          transitions: { type: "array", items: { type: "string" } },
        },
        required: ["entity", "states", "transitions"],
      },
    },
    permissions: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          actor: { type: "string" },
          allowedActions: { type: "array", items: { type: "string" } },
          restrictedActions: { type: "array", items: { type: "string" } },
        },
        required: ["actor", "allowedActions", "restrictedActions"],
      },
    },
    edgeCases: { type: "array", items: { type: "string" } },
    frontendOperations: { type: "array", items: { type: "string" } },
    plantUmlTraceability: { type: "array", items: { type: "string" } },
  },
  required: [
    "appName",
    "domainSummary",
    "coreWorkflow",
    "actors",
    "businessEntities",
    "pageFlows",
    "stateMachines",
    "permissions",
    "edgeCases",
    "frontendOperations",
    "plantUmlTraceability",
  ],
};

export const GENERATE_CODE_BUSINESS_LOGIC_RESPONSE_FORMAT: ChatCompletionResponseFormat = {
  type: "json_schema",
  json_schema: {
    name: "code_business_logic_result",
    strict: true,
    schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        businessLogic: CODE_BUSINESS_LOGIC_RESPONSE_SCHEMA,
      },
      required: ["businessLogic"],
    },
  },
};

export const GENERATE_CODE_SKILL_RESOURCE_PLAN_RESPONSE_FORMAT: ChatCompletionResponseFormat = {
  type: "json_schema",
  json_schema: {
    name: "code_skill_resource_plan_result",
    strict: true,
    schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        skillResourcePlan: {
          type: "object",
          additionalProperties: false,
          properties: {
            skillName: { type: "string" },
            alias: { type: "string" },
            query: { type: "string" },
            requests: {
              type: "array",
              items: {
                type: "object",
                additionalProperties: false,
                properties: {
                  resourceType: {
                    type: "string",
                    enum: ["design-system", "stack", "domain", "csv", "action"],
                  },
                  name: { type: "string" },
                  query: { type: "string" },
                  csvPath: { type: "string" },
                  stack: { type: "string" },
                  domain: { type: "string" },
                  actionName: { type: "string" },
                  maxResults: { type: "number" },
                  reason: { type: "string" },
                },
                required: [
                  "resourceType",
                  "name",
                  "query",
                  "csvPath",
                  "stack",
                  "domain",
                  "actionName",
                  "maxResults",
                  "reason",
                ],
              },
            },
            diagnostics: { type: "array", items: { type: "string" } },
          },
          required: ["skillName", "alias", "query", "requests", "diagnostics"],
        },
      },
      required: ["skillResourcePlan"],
    },
  },
};

export const GENERATE_CODE_VISUAL_DIRECTION_RESPONSE_FORMAT: ChatCompletionResponseFormat = {
  type: "json_schema",
  json_schema: {
    name: "code_visual_direction_result",
    strict: true,
    schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        visualDirection: {
          type: "object",
          additionalProperties: false,
          properties: {
            productType: { type: "string" },
            targetAudience: { type: "string" },
            toneKeywords: { type: "array", items: { type: "string" } },
            styleKeywords: { type: "array", items: { type: "string" } },
            colorMood: { type: "string" },
            typographyMood: { type: "string" },
            layoutMood: { type: "string" },
            componentTexture: { type: "string" },
            interactionMood: { type: "string" },
            avoidStyles: { type: "array", items: { type: "string" } },
            promptBrief: { type: "string" },
          },
          required: [
            "productType",
            "targetAudience",
            "toneKeywords",
            "styleKeywords",
            "colorMood",
            "typographyMood",
            "layoutMood",
            "componentTexture",
            "interactionMood",
            "avoidStyles",
            "promptBrief",
          ],
        },
      },
      required: ["visualDirection"],
    },
  },
};

export const GENERATE_CODE_SKILL_RESOURCE_DISCOVERY_RESPONSE_FORMAT: ChatCompletionResponseFormat = {
  type: "json_schema",
  json_schema: {
    name: "code_skill_resource_discovery_result",
    strict: true,
    schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        skillResourceDiscoveryPlan: {
          type: "object",
          additionalProperties: false,
          properties: {
            skillName: { type: "string" },
            alias: { type: "string" },
            requests: {
              type: "array",
              items: {
                type: "object",
                additionalProperties: false,
                properties: {
                  path: { type: "string" },
                  reason: { type: "string" },
                  expectedUse: { type: "string" },
                },
                required: ["path", "reason", "expectedUse"],
              },
            },
            diagnostics: { type: "array", items: { type: "string" } },
          },
          required: ["skillName", "alias", "requests", "diagnostics"],
        },
      },
      required: ["skillResourceDiscoveryPlan"],
    },
  },
};

export const GENERATE_CODE_APP_BLUEPRINT_RESPONSE_FORMAT: ChatCompletionResponseFormat = {
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

export const GENERATE_CODE_UI_BLUEPRINT_RESPONSE_FORMAT: ChatCompletionResponseFormat = {
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

export const GENERATE_CODE_UI_REFERENCE_RESPONSE_FORMAT: ChatCompletionResponseFormat = {
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

export const GENERATE_CODE_UI_FIDELITY_RESPONSE_FORMAT: ChatCompletionResponseFormat = {
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

export function createCodeComponentTreeNodeResponseSchema(depth: number): Record<string, unknown> {
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

export const CODE_DESIGN_TOKENS_RESPONSE_SCHEMA = {
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

export const CODE_COMPONENT_REGISTRY_RESPONSE_SCHEMA = {
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

export const GENERATE_CODE_UI_IR_RESPONSE_FORMAT: ChatCompletionResponseFormat = {
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

export const GENERATE_CODE_FILE_PLAN_RESPONSE_FORMAT: ChatCompletionResponseFormat = {
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

export const GENERATE_CODE_AGENT_PLAN_RESPONSE_FORMAT: ChatCompletionResponseFormat = {
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

export const GENERATE_CODE_FILE_OPERATIONS_RESPONSE_FORMAT: ChatCompletionResponseFormat =
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
