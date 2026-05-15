import assert from "node:assert/strict";
import test from "node:test";
import type {
  ActivityDiagramSpec,
  SequenceDiagramSpec,
  TableDiagramSpec,
} from "@uml-platform/contracts";
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

async function renderDesignActivityModel(model: ActivityDiagramSpec) {
  const artifact = generateDesignPlantUmlArtifacts([model])[0];
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

test("activity PlantUML renders all branches from the public calendar model", async () => {
  const source = await renderActivityModel({
    diagramKind: "activity",
    title: "公众活动日历界面关系活动模型",
    summary: "描述公开日历系统中的页面流转。",
    notes: [
      "活动图体现基于注册状态的界面跳转。",
      "未注册用户只能浏览活动或进入注册申请流程。",
    ],
    swimlanes: [
      { id: "lane_visitor", name: "访客界面" },
      { id: "lane_member", name: "注册用户界面" },
      { id: "lane_system", name: "系统" },
      { id: "lane_email", name: "电子邮件服务" },
    ],
    nodes: [
      { id: "act_start", type: "start", name: "开始" },
      {
        id: "act_open_calendar",
        type: "activity",
        name: "打开公开日历",
        actorOrLane: "lane_visitor",
        input: [],
        output: ["日历首页"],
      },
      {
        id: "act_view_events",
        type: "activity",
        name: "查看活动安排",
        actorOrLane: "lane_visitor",
        input: ["日历首页"],
        output: ["活动列表或详情"],
      },
      {
        id: "act_decide_registered",
        type: "decision",
        question: "用户是否已注册？",
      },
      {
        id: "act_apply_registration",
        type: "activity",
        name: "提交注册申请",
        actorOrLane: "lane_visitor",
        input: ["注册信息"],
        output: ["注册申请结果"],
      },
      {
        id: "act_registration_result",
        type: "activity",
        name: "显示注册申请结果",
        actorOrLane: "lane_system",
        input: ["注册申请"],
        output: ["申请提交确认"],
      },
      {
        id: "act_member_home",
        type: "activity",
        name: "进入注册用户活动管理界面",
        actorOrLane: "lane_member",
        input: ["已登录状态"],
        output: ["管理菜单"],
      },
      {
        id: "act_choose_operation",
        type: "decision",
        question: "选择创建、编辑还是删除活动？",
      },
      {
        id: "act_create_event",
        type: "activity",
        name: "创建活动",
        actorOrLane: "lane_member",
        input: ["活动信息"],
        output: ["新活动"],
      },
      {
        id: "act_edit_event",
        type: "activity",
        name: "编辑活动",
        actorOrLane: "lane_member",
        input: ["目标活动", "修改内容"],
        output: ["更新后的活动"],
      },
      {
        id: "act_delete_event",
        type: "activity",
        name: "删除活动",
        actorOrLane: "lane_member",
        input: ["目标活动"],
        output: ["删除结果"],
      },
      {
        id: "act_save_changes",
        type: "activity",
        name: "保存活动变更到公开日历",
        actorOrLane: "lane_system",
        input: ["活动变更"],
        output: ["更新后的公开日历"],
      },
      {
        id: "act_schedule_reminder",
        type: "activity",
        name: "按活动开始前一天安排提醒",
        actorOrLane: "lane_system",
        input: ["活动开始时间"],
        output: ["待发送提醒"],
      },
      {
        id: "act_trigger_reminder",
        type: "activity",
        name: "触发邮件提醒发送",
        actorOrLane: "lane_system",
        input: ["待发送提醒"],
        output: ["邮件发送请求"],
      },
      {
        id: "act_send_email",
        type: "activity",
        name: "发送提醒邮件",
        actorOrLane: "lane_email",
        input: ["邮件发送请求"],
        output: ["投递结果"],
      },
      { id: "act_end", type: "end", name: "结束" },
    ],
    relationships: [
      { id: "act_rel_1", type: "control_flow", sourceId: "act_start", targetId: "act_open_calendar" },
      { id: "act_rel_2", type: "control_flow", sourceId: "act_open_calendar", targetId: "act_view_events" },
      { id: "act_rel_3", type: "control_flow", sourceId: "act_view_events", targetId: "act_decide_registered" },
      {
        id: "act_rel_4",
        type: "control_flow",
        sourceId: "act_decide_registered",
        targetId: "act_apply_registration",
        guard: "未注册且申请注册",
      },
      { id: "act_rel_5", type: "control_flow", sourceId: "act_apply_registration", targetId: "act_registration_result" },
      {
        id: "act_rel_6",
        type: "control_flow",
        sourceId: "act_decide_registered",
        targetId: "act_member_home",
        guard: "已注册",
      },
      { id: "act_rel_7", type: "control_flow", sourceId: "act_member_home", targetId: "act_choose_operation" },
      {
        id: "act_rel_8",
        type: "control_flow",
        sourceId: "act_choose_operation",
        targetId: "act_create_event",
        guard: "创建",
      },
      {
        id: "act_rel_9",
        type: "control_flow",
        sourceId: "act_choose_operation",
        targetId: "act_edit_event",
        guard: "编辑",
      },
      {
        id: "act_rel_10",
        type: "control_flow",
        sourceId: "act_choose_operation",
        targetId: "act_delete_event",
        guard: "删除",
      },
      { id: "act_rel_11", type: "control_flow", sourceId: "act_create_event", targetId: "act_save_changes" },
      { id: "act_rel_12", type: "control_flow", sourceId: "act_edit_event", targetId: "act_save_changes" },
      { id: "act_rel_13", type: "control_flow", sourceId: "act_delete_event", targetId: "act_save_changes" },
      {
        id: "act_rel_14",
        type: "control_flow",
        sourceId: "act_save_changes",
        targetId: "act_schedule_reminder",
        guard: "活动被创建或更新且需要提醒",
      },
      {
        id: "act_rel_15",
        type: "control_flow",
        sourceId: "act_schedule_reminder",
        targetId: "act_trigger_reminder",
        trigger: "活动开始前一天",
      },
      { id: "act_rel_16", type: "control_flow", sourceId: "act_trigger_reminder", targetId: "act_send_email" },
      { id: "act_rel_17", type: "control_flow", sourceId: "act_registration_result", targetId: "act_end" },
      { id: "act_rel_18", type: "control_flow", sourceId: "act_send_email", targetId: "act_end" },
      {
        id: "act_rel_19",
        type: "control_flow",
        sourceId: "act_view_events",
        targetId: "act_end",
        guard: "未注册且仅浏览活动",
      },
    ],
  });

  assert.match(source, /提交注册申请/);
  assert.match(source, /进入注册用户活动管理界面/);
  assert.match(source, /创建活动/);
  assert.match(source, /编辑活动/);
  assert.match(source, /删除活动/);
  assert.match(source, /发送提醒邮件/);
  assert.match(source, /未注册且仅浏览活动/);
});

test("design activity PlantUML treats object flows as traversable flow edges", async () => {
  const source = await renderDesignActivityModel({
    diagramKind: "activity",
    title: "设计阶段对象流",
    summary: "object_flow 不应让流程提前结束",
    notes: [],
    swimlanes: [
      { id: "visitor", name: "公众访问者" },
      { id: "system", name: "系统" },
    ],
    nodes: [
      { id: "start", type: "start", name: "开始浏览公开日历" },
      {
        id: "request",
        type: "activity",
        name: "请求公开活动列表",
        actorOrLane: "visitor",
        input: [],
        output: ["筛选条件"],
      },
      {
        id: "query",
        type: "activity",
        name: "查询公开活动",
        actorOrLane: "system",
        input: ["筛选条件"],
        output: ["活动列表"],
      },
      {
        id: "view",
        type: "activity",
        name: "查看活动信息",
        actorOrLane: "visitor",
        input: ["活动列表"],
        output: ["活动信息"],
      },
      { id: "end", type: "end", name: "结束" },
    ],
    relationships: [
      { id: "r1", type: "control_flow", sourceId: "start", targetId: "request" },
      {
        id: "r2",
        type: "object_flow",
        sourceId: "request",
        targetId: "query",
        description: "提交筛选条件查询公开活动",
      },
      {
        id: "r3",
        type: "object_flow",
        sourceId: "query",
        targetId: "view",
        description: "返回活动列表供公众查看",
      },
      { id: "r4", type: "control_flow", sourceId: "view", targetId: "end" },
    ],
  });

  assert.match(source, /:请求公开活动列表;/);
  assert.match(source, /:查询公开活动;/);
  assert.match(source, /:查看活动信息;/);
  assert.ok(source.indexOf(":查询公开活动;") > source.indexOf(":请求公开活动列表;"));
});

test("design activity PlantUML renders multiple start subflows in one diagram", async () => {
  const source = await renderDesignActivityModel({
    diagramKind: "activity",
    title: "多入口设计活动图",
    summary: "设计阶段可能包含多个业务子流程",
    notes: [],
    swimlanes: [
      { id: "visitor", name: "公众访问者" },
      { id: "member", name: "注册用户" },
      { id: "system", name: "系统" },
    ],
    nodes: [
      { id: "browse_start", type: "start", name: "开始浏览公开日历" },
      {
        id: "request",
        type: "activity",
        name: "请求公开活动列表",
        actorOrLane: "visitor",
        input: [],
        output: [],
      },
      { id: "browse_end", type: "end", name: "公众访问流程结束" },
      { id: "manage_start", type: "start", name: "开始活动管理" },
      {
        id: "manage_request",
        type: "activity",
        name: "提交活动管理请求",
        actorOrLane: "member",
        input: [],
        output: [],
      },
      {
        id: "check_permission",
        type: "activity",
        name: "校验注册用户权限",
        actorOrLane: "system",
        input: [],
        output: [],
      },
      { id: "manage_end", type: "end", name: "活动管理流程结束" },
    ],
    relationships: [
      { id: "m1", type: "control_flow", sourceId: "browse_start", targetId: "request" },
      { id: "m2", type: "control_flow", sourceId: "request", targetId: "browse_end" },
      {
        id: "m3",
        type: "control_flow",
        sourceId: "manage_start",
        targetId: "manage_request",
      },
      {
        id: "m4",
        type: "object_flow",
        sourceId: "manage_request",
        targetId: "check_permission",
        description: "提交管理请求进行权限校验",
      },
      {
        id: "m5",
        type: "control_flow",
        sourceId: "check_permission",
        targetId: "manage_end",
      },
    ],
  });

  assert.match(source, /开始浏览公开日历/);
  assert.match(source, /开始活动管理/);
  assert.match(source, /提交活动管理请求/);
  assert.match(source, /校验注册用户权限/);
  assert.equal((source.match(/\nstart/g) ?? []).length, 2);
});

test("design activity PlantUML renders provided public calendar design flow", async () => {
  const source = await renderDesignActivityModel({
    diagramKind: "activity",
    title: "公开活动日历设计阶段活动图",
    summary: "覆盖公开浏览、活动管理和提醒发送流程。",
    notes: ["提醒流程由定时任务触发，并对每个次日开始的活动逐个处理。"],
    swimlanes: [
      { id: "sl1", name: "公众访问者" },
      { id: "sl2", name: "注册用户" },
      { id: "sl3", name: "系统" },
      { id: "sl4", name: "外部邮件服务" },
    ],
    nodes: [
      { id: "an1", type: "start", name: "开始浏览公开日历" },
      { id: "an2", type: "activity", name: "请求公开活动列表", actorOrLane: "sl1", input: [], output: ["筛选条件"] },
      { id: "an3", type: "activity", name: "查询公开活动", actorOrLane: "sl3", input: ["筛选条件"], output: ["活动列表"] },
      { id: "an4", type: "activity", name: "查看活动信息", actorOrLane: "sl1", input: ["活动列表"], output: ["活动信息"] },
      { id: "an5", type: "decision", name: "是否申请注册", question: "访问者是否提交注册申请？" },
      { id: "an6", type: "activity", name: "提交注册申请信息", actorOrLane: "sl1", input: ["姓名", "邮箱"], output: ["注册申请数据"] },
      { id: "an7", type: "activity", name: "校验邮箱是否已注册", actorOrLane: "sl3", input: ["注册申请数据"], output: ["邮箱校验结果"] },
      { id: "an8", type: "decision", name: "邮箱是否已注册", question: "申请邮箱是否已存在于用户库中？" },
      { id: "an9", type: "activity", name: "保存注册申请", actorOrLane: "sl3", input: ["注册申请数据"], output: ["申请编号"] },
      { id: "an10", type: "activity", name: "返回申请失败结果", actorOrLane: "sl3", input: ["邮箱校验结果"], output: ["邮箱已注册"] },
      { id: "an11", type: "end", name: "公众访问流程结束" },
      { id: "an12", type: "start", name: "开始活动管理" },
      { id: "an13", type: "activity", name: "提交活动管理请求", actorOrLane: "sl2", input: ["用户ID"], output: ["管理请求"] },
      { id: "an14", type: "activity", name: "校验注册用户权限", actorOrLane: "sl3", input: ["管理请求"], output: ["权限校验结果"] },
      { id: "an15", type: "decision", name: "权限是否通过", question: "当前用户是否有权执行该活动操作？" },
      { id: "an16", type: "decision", name: "选择管理操作", question: "执行创建、编辑还是删除活动？" },
      { id: "an17", type: "activity", name: "创建公开活动", actorOrLane: "sl3", input: ["活动信息"], output: ["活动ID"] },
      { id: "an18", type: "activity", name: "查询目标活动", actorOrLane: "sl3", input: ["活动ID"], output: ["活动记录或空"] },
      { id: "an19", type: "decision", name: "目标活动是否存在", question: "目标活动是否存在？" },
      { id: "an20", type: "activity", name: "保存活动修改", actorOrLane: "sl3", input: ["活动ID"], output: ["更新结果"] },
      { id: "an21", type: "activity", name: "删除活动记录", actorOrLane: "sl3", input: ["活动ID"], output: ["删除结果"] },
      { id: "an22", type: "activity", name: "返回无权限结果", actorOrLane: "sl3", input: ["权限校验结果"], output: ["无权限错误"] },
      { id: "an23", type: "activity", name: "返回活动不存在结果", actorOrLane: "sl3", input: ["活动记录或空"], output: ["目标活动不存在"] },
      { id: "an24", type: "merge", name: "汇总管理结果" },
      { id: "an25", type: "end", name: "活动管理流程结束" },
      { id: "an26", type: "start", name: "提醒定时任务开始" },
      { id: "an27", type: "activity", name: "扫描次日开始的活动", actorOrLane: "sl3", input: ["当前时间"], output: ["待提醒活动列表"] },
      { id: "an28", type: "decision", name: "是否存在待提醒活动", question: "系统中是否存在开始前一天的活动？" },
      { id: "an29", type: "activity", name: "逐个处理待提醒活动", actorOrLane: "sl3", input: ["待提醒活动"], output: ["活动ID"] },
      { id: "an30", type: "activity", name: "查询可接收提醒的注册用户", actorOrLane: "sl3", input: ["活动ID"], output: ["收件人列表"] },
      { id: "an31", type: "decision", name: "收件人列表是否为空", question: "是否存在可接收提醒的注册用户？" },
      { id: "an32", type: "activity", name: "调用邮件服务发送提醒", actorOrLane: "sl4", input: ["收件人列表"], output: ["投递结果"] },
      { id: "an33", type: "activity", name: "记录提醒处理结果", actorOrLane: "sl3", input: ["投递结果"], output: ["提醒处理结果"] },
      { id: "an34", type: "activity", name: "返回无收件人结果", actorOrLane: "sl3", input: ["收件人列表"], output: ["无可接收提醒的注册用户"] },
      { id: "an35", type: "end", name: "提醒流程结束" },
    ],
    relationships: [
      { id: "aar1", type: "control_flow", sourceId: "an1", targetId: "an2" },
      { id: "aar2", type: "object_flow", sourceId: "an2", targetId: "an3", description: "提交筛选条件查询公开活动" },
      { id: "aar3", type: "object_flow", sourceId: "an3", targetId: "an4", description: "返回活动列表供公众查看" },
      { id: "aar4", type: "control_flow", sourceId: "an4", targetId: "an5" },
      { id: "aar5", type: "control_flow", sourceId: "an5", targetId: "an6", guard: "是" },
      { id: "aar6", type: "object_flow", sourceId: "an6", targetId: "an7", description: "提交注册申请数据" },
      { id: "aar7", type: "control_flow", sourceId: "an7", targetId: "an8" },
      { id: "aar8", type: "control_flow", sourceId: "an8", targetId: "an9", guard: "否" },
      { id: "aar9", type: "control_flow", sourceId: "an8", targetId: "an10", guard: "是" },
      { id: "aar10", type: "control_flow", sourceId: "an9", targetId: "an11" },
      { id: "aar11", type: "control_flow", sourceId: "an10", targetId: "an11" },
      { id: "aar12", type: "control_flow", sourceId: "an5", targetId: "an11", guard: "否" },
      { id: "aar13", type: "control_flow", sourceId: "an12", targetId: "an13" },
      { id: "aar14", type: "object_flow", sourceId: "an13", targetId: "an14", description: "提交管理请求进行权限校验" },
      { id: "aar15", type: "control_flow", sourceId: "an14", targetId: "an15" },
      { id: "aar16", type: "control_flow", sourceId: "an15", targetId: "an16", guard: "是" },
      { id: "aar17", type: "control_flow", sourceId: "an15", targetId: "an22", guard: "否" },
      { id: "aar18", type: "control_flow", sourceId: "an16", targetId: "an17", guard: "创建活动" },
      { id: "aar19", type: "control_flow", sourceId: "an17", targetId: "an24" },
      { id: "aar20", type: "control_flow", sourceId: "an16", targetId: "an18", guard: "编辑活动" },
      { id: "aar21", type: "control_flow", sourceId: "an16", targetId: "an18", guard: "删除活动" },
      { id: "aar22", type: "control_flow", sourceId: "an18", targetId: "an19" },
      { id: "aar23", type: "control_flow", sourceId: "an19", targetId: "an20", guard: "存在且为编辑活动" },
      { id: "aar24", type: "control_flow", sourceId: "an19", targetId: "an21", guard: "存在且为删除活动" },
      { id: "aar25", type: "control_flow", sourceId: "an19", targetId: "an23", guard: "不存在" },
      { id: "aar26", type: "control_flow", sourceId: "an20", targetId: "an24" },
      { id: "aar27", type: "control_flow", sourceId: "an21", targetId: "an24" },
      { id: "aar28", type: "control_flow", sourceId: "an22", targetId: "an24" },
      { id: "aar29", type: "control_flow", sourceId: "an23", targetId: "an24" },
      { id: "aar30", type: "control_flow", sourceId: "an24", targetId: "an25" },
      { id: "aar31", type: "control_flow", sourceId: "an26", targetId: "an27", trigger: "每日定时任务" },
      { id: "aar32", type: "control_flow", sourceId: "an27", targetId: "an28" },
      { id: "aar33", type: "control_flow", sourceId: "an28", targetId: "an29", guard: "是" },
      { id: "aar34", type: "control_flow", sourceId: "an28", targetId: "an35", guard: "否" },
      { id: "aar35", type: "object_flow", sourceId: "an29", targetId: "an30", description: "按活动逐个查询收件人" },
      { id: "aar36", type: "control_flow", sourceId: "an30", targetId: "an31" },
      { id: "aar37", type: "control_flow", sourceId: "an31", targetId: "an32", guard: "否" },
      { id: "aar38", type: "control_flow", sourceId: "an31", targetId: "an34", guard: "是" },
      { id: "aar39", type: "object_flow", sourceId: "an32", targetId: "an33", description: "返回邮件投递结果" },
      { id: "aar40", type: "control_flow", sourceId: "an33", targetId: "an29", guard: "处理下一个活动" },
      { id: "aar41", type: "control_flow", sourceId: "an34", targetId: "an29", guard: "处理下一个活动" },
      { id: "aar42", type: "control_flow", sourceId: "an29", targetId: "an35", guard: "所有待提醒活动处理完成" },
    ],
  });

  assert.match(source, /查询公开活动/);
  assert.match(source, /查看活动信息/);
  assert.match(source, /提交注册申请信息/);
  assert.match(source, /提交活动管理请求/);
  assert.match(source, /创建公开活动/);
  assert.match(source, /保存活动修改/);
  assert.match(source, /删除活动记录/);
  assert.match(source, /扫描次日开始的活动/);
  assert.match(source, /调用邮件服务发送提醒/);
  assert.match(source, /记录提醒处理结果/);
});

test("design activity PlantUML handles reminder loops without losing the exit branch", async () => {
  const source = await renderDesignActivityModel({
    diagramKind: "activity",
    title: "提醒回环",
    summary: "回环不应无限递归",
    notes: [],
    swimlanes: [{ id: "system", name: "系统" }],
    nodes: [
      { id: "start", type: "start", name: "提醒定时任务开始" },
      { id: "scan", type: "activity", name: "扫描次日开始的活动", actorOrLane: "system", input: [], output: [] },
      { id: "loop", type: "activity", name: "逐个处理待提醒活动", actorOrLane: "system", input: [], output: [] },
      { id: "record", type: "activity", name: "记录提醒处理结果", actorOrLane: "system", input: [], output: [] },
      { id: "end", type: "end", name: "提醒流程结束" },
    ],
    relationships: [
      { id: "l1", type: "control_flow", sourceId: "start", targetId: "scan" },
      { id: "l2", type: "control_flow", sourceId: "scan", targetId: "loop" },
      { id: "l3", type: "control_flow", sourceId: "loop", targetId: "record", guard: "处理当前活动" },
      { id: "l4", type: "control_flow", sourceId: "record", targetId: "loop", guard: "处理下一个活动" },
      { id: "l5", type: "control_flow", sourceId: "loop", targetId: "end", guard: "所有待提醒活动处理完成" },
    ],
  });

  assert.match(source, /记录提醒处理结果/);
  assert.match(source, /所有待提醒活动处理完成/);
  assert.ok(source.length < 4000);
});

test("activity PlantUML keeps all branches for multi-way decisions", async () => {
  const source = await renderActivityModel({
    diagramKind: "activity",
    title: "多分支判断",
    summary: "测试 elseif",
    notes: [],
    swimlanes: [],
    nodes: [
      { id: "start", type: "start", name: "开始" },
      { id: "choose", type: "decision", question: "选择操作？" },
      { id: "create", type: "activity", name: "创建活动", input: [], output: [] },
      { id: "edit", type: "activity", name: "编辑活动", input: [], output: [] },
      { id: "remove", type: "activity", name: "删除活动", input: [], output: [] },
      { id: "merge", type: "merge" },
      { id: "end", type: "end", name: "结束" },
    ],
    relationships: [
      { id: "m1", type: "control_flow", sourceId: "start", targetId: "choose" },
      { id: "m2", type: "control_flow", sourceId: "choose", targetId: "create", guard: "创建" },
      { id: "m3", type: "control_flow", sourceId: "choose", targetId: "edit", guard: "编辑" },
      { id: "m4", type: "control_flow", sourceId: "choose", targetId: "remove", guard: "删除" },
      { id: "m5", type: "control_flow", sourceId: "create", targetId: "merge" },
      { id: "m6", type: "control_flow", sourceId: "edit", targetId: "merge" },
      { id: "m7", type: "control_flow", sourceId: "remove", targetId: "merge" },
      { id: "m8", type: "control_flow", sourceId: "merge", targetId: "end" },
    ],
  });

  assert.match(source, /if \(选择操作？\) then \(创建\)/);
  assert.match(source, /elseif \(选择操作？\) then \(编辑\)/);
  assert.match(source, /else \(删除\)/);
  assert.match(source, /:删除活动;/);
});

test("activity PlantUML renders implicit branches from activity nodes", async () => {
  const source = await renderActivityModel({
    diagramKind: "activity",
    title: "普通节点多出边",
    summary: "测试普通 activity 的多条出边",
    notes: [],
    swimlanes: [],
    nodes: [
      { id: "start", type: "start", name: "开始" },
      { id: "browse", type: "activity", name: "查看活动安排", input: [], output: [] },
      { id: "register", type: "activity", name: "提交注册申请", input: [], output: [] },
      { id: "end", type: "end", name: "结束" },
    ],
    relationships: [
      { id: "b1", type: "control_flow", sourceId: "start", targetId: "browse" },
      {
        id: "b2",
        type: "control_flow",
        sourceId: "browse",
        targetId: "register",
        guard: "申请注册",
      },
      {
        id: "b3",
        type: "control_flow",
        sourceId: "browse",
        targetId: "end",
        guard: "仅浏览",
      },
      { id: "b4", type: "control_flow", sourceId: "register", targetId: "end" },
    ],
  });

  assert.match(source, /查看活动安排后续路径/);
  assert.match(source, /申请注册/);
  assert.match(source, /仅浏览/);
  assert.match(source, /:提交注册申请;/);
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

test("table PlantUML renders primary and foreign keys", async () => {
  const model: TableDiagramSpec = {
    diagramKind: "table",
    title: "订单表关系",
    summary: "主外键关系",
    notes: [],
    tables: [
      {
        id: "user",
        name: "user",
        columns: [
          {
            id: "id",
            name: "id",
            dataType: "INT",
            isPrimaryKey: true,
            isForeignKey: false,
            nullable: false,
          },
        ],
      },
      {
        id: "order",
        name: "order",
        columns: [
          {
            id: "id",
            name: "id",
            dataType: "INT",
            isPrimaryKey: true,
            isForeignKey: false,
            nullable: false,
          },
          {
            id: "user_id",
            name: "user_id",
            dataType: "INT",
            isPrimaryKey: false,
            isForeignKey: true,
            nullable: false,
            references: { tableId: "user", columnId: "id" },
          },
        ],
      },
    ],
    relationships: [
      {
        id: "rel_user_order",
        type: "one-to-many",
        sourceTableId: "user",
        targetTableId: "order",
        label: "1对多",
      },
    ],
  };

  const artifact = generateDesignPlantUmlArtifacts([model])[0];
  assert.equal(artifact?.diagramKind, "table");
  assert.match(artifact?.source ?? "", /!define table\(x\)/);
  assert.match(artifact?.source ?? "", /<<PK>>/);
  assert.match(artifact?.source ?? "", /<<FK>>/);
  assert.match(artifact?.source ?? "", /user \|\|--o\{ order : "1对多"/);
  const rendered = await renderSvgWithPlantUml({
    diagramKind: "table",
    plantUmlSource: artifact?.source ?? "",
  });
  assert.match(rendered.svg, /<svg/i);
});
