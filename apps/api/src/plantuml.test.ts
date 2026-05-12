import assert from "node:assert/strict";
import test from "node:test";
import type { ActivityDiagramSpec, SequenceDiagramSpec } from "@uml-platform/contracts";
import { renderSvgWithPlantUml } from "../../render-service/src/index.js";
import {
  generateDesignPlantUmlArtifacts,
  generatePlantUmlArtifacts,
} from "./plantuml.js";

async function renderActivityModel(model: ActivityDiagramSpec) {
  const artifact = generatePlantUmlArtifacts([model])[0];
  assert.equal(artifact?.diagramKind, "activity");
  assert.ok(artifact?.source.includes("@startuml"));
  const rendered = await renderSvgWithPlantUml({
    diagramKind: "activity",
    plantUmlSource: artifact.source,
  });
  assert.match(rendered.svg, /<svg/i);
  return artifact.source;
}

test("activity PlantUML keeps swimlane declarations valid", async () => {
  const source = await renderActivityModel({
    diagramKind: "activity",
    title: "泳道活动图",
    summary: "测试泳道位置",
    notes: [],
    swimlanes: [
      { id: "lane_user", name: "用户" },
      { id: "lane_system", name: "系统" },
    ],
    nodes: [
      { id: "start", type: "start", name: "开始" },
      {
        id: "submit",
        type: "activity",
        name: "提交需求",
        actorOrLane: "lane_user",
        input: ["需求"],
        output: ["请求"],
      },
      {
        id: "generate",
        type: "activity",
        name: "生成模型",
        actorOrLane: "lane_system",
        input: ["请求"],
        output: ["模型"],
      },
      { id: "end", type: "end", name: "结束" },
    ],
    relationships: [
      { id: "f1", type: "control_flow", sourceId: "start", targetId: "submit" },
      { id: "f2", type: "control_flow", sourceId: "submit", targetId: "generate" },
      { id: "f3", type: "control_flow", sourceId: "generate", targetId: "end" },
    ],
  });

  assert.ok(source.indexOf("|用户|") < source.indexOf("\nstart"));
});

test("activity PlantUML renders decision branches", async () => {
  const source = await renderActivityModel({
    diagramKind: "activity",
    title: "判断活动图",
    summary: "测试 if/else",
    notes: [],
    swimlanes: [],
    nodes: [
      { id: "start", type: "start", name: "开始" },
      { id: "check", type: "decision", question: "校验通过?" },
      {
        id: "approve",
        type: "activity",
        name: "继续生成",
        input: [],
        output: [],
      },
      {
        id: "reject",
        type: "activity",
        name: "返回错误",
        input: [],
        output: [],
      },
      { id: "merge", type: "merge" },
      { id: "end", type: "end", name: "结束" },
    ],
    relationships: [
      { id: "d1", type: "control_flow", sourceId: "start", targetId: "check" },
      {
        id: "d2",
        type: "control_flow",
        sourceId: "check",
        targetId: "approve",
        guard: "是",
      },
      {
        id: "d3",
        type: "control_flow",
        sourceId: "check",
        targetId: "reject",
        guard: "否",
      },
      { id: "d4", type: "control_flow", sourceId: "approve", targetId: "merge" },
      { id: "d5", type: "control_flow", sourceId: "reject", targetId: "merge" },
      { id: "d6", type: "control_flow", sourceId: "merge", targetId: "end" },
    ],
  });

  assert.match(source, /if \(校验通过\?\) then \(是\)/);
  assert.match(source, /else \(否\)/);
  assert.match(source, /endif/);
});

test("activity PlantUML renders fork/join branches", async () => {
  const source = await renderActivityModel({
    diagramKind: "activity",
    title: "并发活动图",
    summary: "测试 fork/join",
    notes: [],
    swimlanes: [],
    nodes: [
      { id: "start", type: "start", name: "开始" },
      { id: "fork", type: "fork" },
      {
        id: "task_a",
        type: "activity",
        name: "任务A",
        input: [],
        output: [],
      },
      {
        id: "task_b",
        type: "activity",
        name: "任务B",
        input: [],
        output: [],
      },
      { id: "join", type: "join" },
      { id: "end", type: "end", name: "结束" },
    ],
    relationships: [
      { id: "f1", type: "control_flow", sourceId: "start", targetId: "fork" },
      { id: "f2", type: "control_flow", sourceId: "fork", targetId: "task_a" },
      { id: "f3", type: "control_flow", sourceId: "fork", targetId: "task_b" },
      { id: "f4", type: "control_flow", sourceId: "task_a", targetId: "join" },
      { id: "f5", type: "control_flow", sourceId: "task_b", targetId: "join" },
      { id: "f6", type: "control_flow", sourceId: "join", targetId: "end" },
    ],
  });

  assert.match(source, /fork/);
  assert.match(source, /fork again/);
  assert.match(source, /end fork/);
});

test("sequence PlantUML renders design dynamic behavior", async () => {
  const model: SequenceDiagramSpec = {
    diagramKind: "sequence",
    title: "生成模型顺序",
    summary: "动态行为层",
    notes: [],
    participants: [
      { id: "actor", name: "用户", participantType: "actor" },
      { id: "api", name: "编排 API", participantType: "control" },
    ],
    messages: [
      {
        id: "m1",
        type: "sync",
        sourceId: "actor",
        targetId: "api",
        name: "startRun",
        parameters: ["requirementText"],
      },
    ],
    fragments: [],
  };
  const artifact = generateDesignPlantUmlArtifacts([model])[0];
  assert.equal(artifact?.diagramKind, "sequence");
  assert.match(artifact?.source ?? "", /actor "用户"/);
  assert.match(artifact?.source ?? "", /startRun\(requirementText\)/);
  const rendered = await renderSvgWithPlantUml({
    diagramKind: "sequence",
    plantUmlSource: artifact?.source ?? "",
  });
  assert.match(rendered.svg, /<svg/i);
});
