// Covers requirement-stage model normalization rules before contract validation.
import assert from "node:assert/strict";
import test from "node:test";
import { parseRequirementDiagramModelsOnly } from "./requirement-model-normalizer.js";

test("parseRequirementDiagramModelsOnly removes services and class operations", () => {
  const parsed = parseRequirementDiagramModelsOnly(
    JSON.stringify({
      models: [
        {
          diagramKind: "class",
          title: "领域概念模型",
          summary: "实体属性关系",
          notes: [],
          classes: [
            {
              id: "reservation",
              name: "Reservation",
              classKind: "entity",
              attributes: [{ name: "id", type: "string", visibility: "private" }],
              operations: [
                { name: "confirm", visibility: "public", parameters: [] },
              ],
            },
            {
              id: "reservation_service",
              name: "ReservationService",
              classKind: "service",
              attributes: [],
              operations: [
                { name: "reserve", visibility: "public", parameters: [] },
              ],
            },
          ],
          interfaces: [],
          enums: [],
          relationships: [
            {
              id: "rel1",
              type: "dependency",
              sourceId: "reservation",
              targetId: "reservation_service",
            },
          ],
        },
      ],
    }),
  );

  const model = parsed.models[0];
  assert.equal(model?.diagramKind, "class");
  if (model?.diagramKind !== "class") return;
  assert.deepEqual(model.classes.map((item) => item.name), ["Reservation"]);
  assert.deepEqual(model.classes[0]?.operations, []);
  assert.deepEqual(model.relationships, []);
});

test("parseRequirementDiagramModelsOnly softly dedupes repeated interface actions", () => {
  const parsed = parseRequirementDiagramModelsOnly(
    JSON.stringify({
      models: [
        {
          diagramKind: "activity",
          title: "界面关系图",
          summary: "界面跳转",
          notes: [],
          swimlanes: [{ id: "system", name: "系统" }],
          nodes: [
            { id: "start", type: "start", name: "开始" },
            {
              id: "show1",
              type: "activity",
              name: "展示座位网格分布",
              actorOrLane: "system",
              input: [],
              output: [],
            },
            {
              id: "show2",
              type: "activity",
              name: "展示座位网格分布",
              actorOrLane: "system",
              input: [],
              output: [],
            },
            { id: "end", type: "end", name: "结束" },
          ],
          relationships: [
            { id: "f1", type: "control_flow", sourceId: "start", targetId: "show1" },
            { id: "f2", type: "control_flow", sourceId: "show2", targetId: "end" },
          ],
        },
      ],
    }),
  );

  const model = parsed.models[0];
  assert.equal(model?.diagramKind, "activity");
  if (model?.diagramKind !== "activity") return;
  assert.equal(model.nodes.filter((node) => node.type === "activity").length, 1);
  assert.equal(model.relationships[1]?.sourceId, "show1");
});
