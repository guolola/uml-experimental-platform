// Verifies shared schema compatibility and representative DTO contracts consumed across apps and packages.
import assert from "node:assert/strict";
import test from "node:test";
import {
  diagramModelsResultSchema,
  designRecordBelongsToDiagramKinds,
  designRunSnapshotSchema,
  designTraceabilityTouchesDiagramKinds,
  designTraceEntrySchema,
  type DesignModelTraceabilityEntry,
  designDiagramModelsResultSchema,
  codeRunSnapshotSchema,
  codeBusinessAssertionResultSchema,
  codeSkillResourceDiscoveryPlanSchema,
  codeSkillResourcePreviewResultSchema,
  codeSkillActionSchema,
  codeSkillContextSchema,
  codeSkillResourcePlanSchema,
  codeSkillSchema,
  codeTraceEntrySchema,
  coverageMatrixSchema,
  evidencePackageSchema,
  traceabilityMatrixSchema,
  codeVisualDirectionSchema,
  codeUiIrResultSchema,
  renderStructuredModelRequestSchema,
  renderStructuredModelResponseSchema,
  renderSvgResponseSchema,
  requirementTraceEntrySchema,
  requirementBaselineSchema,
  requirementRulesResultSchema,
  documentStyleSettingsSchema,
  documentLibraryListResponseSchema,
  documentRunSnapshotSchema,
  onlyOfficeEditorConfigResponseSchema,
  accountProfileUpdateRequestSchema,
  accountSecurityUpdateRequestSchema,
  accountProfileResponseSchema,
  adminRoleCapabilities,
  adminRolePermissions,
  adminSessionResponseSchema,
  adminRateLimitPolicyCreateRequestSchema,
  adminRateLimitPolicyDtoSchema,
  adminRateLimitPolicyListResponseSchema,
  adminRateLimitPolicyUpdateRequestSchema,
  adminProviderQuotaListResponseSchema,
  adminProviderUsageListResponseSchema,
  adminOrganizationDtoSchema,
  adminOrganizationCreateRequestSchema,
  adminCourseDtoSchema,
  adminCourseCreateRequestSchema,
  adminClassDtoSchema,
  adminClassCreateRequestSchema,
  adminTeamDtoSchema,
  adminTeamCreateRequestSchema,
  adminOrganizationMembershipDtoSchema,
  adminOrganizationMembershipCreateRequestSchema,
  adminQuotaDtoSchema,
  adminQuotaCreateRequestSchema,
  providerConfigListResponseSchema,
  providerConfigTestRequestSchema,
  systemNoticeCreateRequestSchema,
  systemNoticeListResponseSchema,
  systemNoticeReadRequestSchema,
  systemNoticeUpdateRequestSchema,
  authLoginRequestSchema,
  authRegisterRequestSchema,
  authSessionResponseSchema,
  billingOrderStatusDtoSchema,
  billingSkuDtoSchema,
  createPaymentOrderRequestSchema,
  adminUserDtoSchema,
  paymentChannelSchema,
  projectCreateRequestSchema,
  projectDtoSchema,
  projectUpdateRequestSchema,
  projectMemberDtoSchema,
  projectMemberInviteRequestSchema,
  projectMemberRolePermissions,
  runEventSchema,
  runSnapshotSchema,
  startCodeRunCommandSchema,
  startCodeRunRequestSchema,
  startDesignRunCommandSchema,
  startDesignRunRequestSchema,
  startDocumentRunCommandSchema,
  startDocumentRunRequestSchema,
  startRunCommandSchema,
  startRunRequestSchema,
  userDtoSchema,
} from "./index.js";

test("design record scope helpers match scoped keys and model metadata", () => {
  assert.equal(
    designRecordBelongsToDiagramKinds(
      "sequence:uc_login",
      { diagramKind: "sequence", modelId: "sequence:uc_login" },
      ["sequence"],
    ),
    true,
  );
  assert.equal(
    designRecordBelongsToDiagramKinds(
      "class",
      { diagramKind: "class", modelId: "class" },
      ["sequence"],
    ),
    false,
  );
  assert.equal(
    designRecordBelongsToDiagramKinds(
      "design-component",
      { diagramKind: "component", modelId: "design-component" },
      ["component"],
    ),
    true,
  );
  assert.equal(
    designRecordBelongsToDiagramKinds(
      "legacy-key",
      { diagramKind: "table", modelId: "table" },
      ["table"],
    ),
    true,
  );
});

test("design traceability scope helpers inspect targets and upstream design refs", () => {
  const entry: DesignModelTraceabilityEntry = {
    source: {
      modelId: "usecase",
      diagramKind: "usecase",
      elementId: "uc_login",
      elementKind: "usecase",
      label: "登录",
    },
    targets: [
      {
        modelId: "sequence:uc_login",
        diagramKind: "sequence",
        elementId: "msg-1",
        elementKind: "message",
        label: "提交登录",
      },
    ],
    upstreamDesignRefs: [
      {
        modelId: "class",
        diagramKind: "class",
        elementId: "UserService",
        elementKind: "class",
        label: "UserService",
      },
    ],
  };
  assert.equal(designTraceabilityTouchesDiagramKinds(entry, ["sequence"]), true);
  assert.equal(designTraceabilityTouchesDiagramKinds(entry, ["table"]), false);
  assert.equal(
    designTraceabilityTouchesDiagramKinds(entry, [], ["sequence:uc_login"]),
    true,
  );
});

test("contracts describe system notice content and admin permissions", () => {
  const created = systemNoticeCreateRequestSchema.parse({
    title: "MiniMax M3 模型上线",
    type: "model_update",
    icon: "",
    status: "published",
    publishedAt: "2026-06-01T09:00:00.000Z",
    contentBlocks: [
      { kind: "paragraph", text: "模型已经可用于生成任务。" },
      { kind: "list_item", text: "请在模型设置中选择新模型。" },
    ],
  });
  assert.equal(created.icon, null);
  assert.equal(created.contentBlocks[1].kind, "list_item");

  const list = systemNoticeListResponseSchema.parse({
    generatedAt: "2026-06-05T00:00:00.000Z",
    unreadCount: 1,
    notices: [
      {
        id: "notice-1",
        title: created.title,
        type: created.type,
        icon: null,
        contentBlocks: created.contentBlocks,
        status: "published",
        publishedAt: created.publishedAt,
        createdAt: "2026-06-01T09:00:00.000Z",
        updatedAt: "2026-06-01T09:00:00.000Z",
        unread: true,
      },
    ],
  });
  assert.equal(list.notices[0].unread, true);

  assert.throws(() =>
    systemNoticeUpdateRequestSchema.parse({
      contentBlocks: [{ kind: "html", text: "<script>alert(1)</script>" }],
    }),
  );
  assert.deepEqual(systemNoticeReadRequestSchema.parse({}), {});
  assert.ok(adminRolePermissions.super_admin.includes("admin.system_notices.write"));
  assert.ok(adminRolePermissions.system_operator.includes("admin.system_notices.read"));
});

test("contracts describe structured model rerender requests", () => {
  const request = renderStructuredModelRequestSchema.parse({
    model: {
      diagramKind: "usecase",
      title: "登录用例模型",
      summary: "教师登录系统。",
      notes: [],
      actors: [
        {
          id: "actor_teacher",
          name: "教师",
          actorType: "human",
          responsibilities: [],
        },
      ],
      useCases: [
        {
          id: "uc_login",
          name: "登录",
          goal: "进入系统",
          preconditions: [],
          postconditions: [],
          supportingActorIds: [],
        },
      ],
      systemBoundaries: [{ id: "system", name: "实验平台" }],
      relationships: [
        {
          id: "rel_login",
          type: "association",
          sourceId: "actor_teacher",
          targetId: "uc_login",
          label: "发起",
          description: "教师发起登录。",
        },
      ],
    },
  });

  assert.equal(request.model.diagramKind, "usecase");

  const response = renderStructuredModelResponseSchema.parse({
    plantUmlSource: "@startuml\nactor 教师\n@enduml",
    svg: "<svg><text>教师</text></svg>",
    renderMeta: {
      engine: "plantuml",
      generatedAt: "2026-05-25T00:00:00.000Z",
      sourceLength: 24,
      durationMs: 3,
    },
  });

  assert.match(response.plantUmlSource, /@startuml/);
});

test("contracts describe billing SKUs and payment order boundaries", () => {
  const sku = billingSkuDtoSchema.parse({
    code: "credits_100",
    name: "100 次包",
    kind: "credit_pack",
    description: "买 100 次送 20 次，到账 120 次",
    durationDays: null,
    creditAmount: 120,
    amountCents: 9900,
    currency: "CNY",
    active: true,
    sortOrder: 130,
  });
  assert.equal(sku.amountCents, 9900);
  assert.equal(paymentChannelSchema.parse("wechat_native"), "wechat_native");

  const request = createPaymentOrderRequestSchema.parse({
    skuCode: "credits_100",
    channel: "alipay_page",
    returnUrl: "https://example.com/account/billing",
  });
  assert.equal(request.skuCode, "credits_100");

  assert.throws(() =>
    createPaymentOrderRequestSchema.parse({
      skuCode: "credits_100",
      channel: "bank_transfer",
    }),
  );
  assert.throws(() =>
    createPaymentOrderRequestSchema.parse({
      skuCode: "credits_100",
      channel: "wechat_native",
      amountCents: 1,
    }),
  );
});

test("contracts enumerate user-visible billing order statuses", () => {
  for (const status of [
    "pending",
    "paid",
    "expired",
    "failed",
    "refunded",
  ]) {
    const parsed = billingOrderStatusDtoSchema.parse({
      orderId: `order-${status}`,
      merchantOrderNo: `UML${status}`,
      sku: {
        code: "credits_10",
        name: "10 次包",
        kind: "credit_pack",
        description: "10 次 AI 生成次数",
        durationDays: null,
        creditAmount: 10,
        amountCents: 990,
        currency: "CNY",
        active: true,
        sortOrder: 110,
      },
      amountCents: 990,
      currency: "CNY",
      channel: "wechat_native",
      status,
      createdAt: "2026-06-05T00:00:00.000Z",
      expiresAt: "2026-06-05T00:15:00.000Z",
      paidAt: status === "paid" ? "2026-06-05T00:02:00.000Z" : null,
    });
    assert.equal(parsed.status, status);
  }
});

test("contracts describe source-attributed requirement baselines", () => {
  const baseline = requirementBaselineSchema.parse({
    runId: "run-baseline",
    sourceDocumentId: "inline-requirement",
    requirements: [
      {
        id: "REQ-001",
        sourceFragment: "借阅者必须登录后才能借书。",
        sourceLocation: { startOffset: 0, endOffset: 12, section: "input" },
        type: "functional",
        actor: "借阅者",
        subject: "借阅者",
        action: "借书",
        object: "图书",
        condition: "登录后",
        outcome: "系统允许借阅",
        confidence: 0.86,
        status: "accepted",
        criticality: "critical",
        acceptanceCriteria: ["借阅者未登录时不能借书。"],
        fieldProvenance: {
          actor: {
            source: "source-text",
            status: "accepted",
            value: "借阅者",
          },
          object: {
            source: "ai-suggested",
            status: "pending-review",
            value: "图书",
            originalValue: null,
            rationale: "原文说明借书行为，AI 建议对象为图书。",
            issueIds: ["ISS-002"],
          },
        },
      },
    ],
    assumptions: [
      {
        id: "ASM-001",
        requirementId: "REQ-001",
        text: "登录状态由平台会话判断。",
        rationale: "原始需求没有指定认证服务。",
        confidence: 0.72,
        status: "derived",
      },
    ],
    conflicts: [
      {
        id: "CON-001",
        requirementIds: ["REQ-001", "REQ-002"],
        description: "借阅权限规则互相冲突。",
        severity: "critical",
        status: "conflict",
      },
    ],
    qualityReport: {
      runId: "run-baseline",
      status: "blocked",
      summary: "发现 1 个冲突。",
      issues: [
        {
          id: "ISS-001",
          requirementId: "REQ-001",
          severity: "critical",
          code: "conflict",
          message: "借阅权限规则互相冲突。",
          blocksDownstream: true,
        },
      ],
      blockingIssueIds: ["ISS-001"],
      reviewRequiredRequirementIds: ["REQ-001"],
    },
    createdAt: "2026-05-24T00:00:00.000Z",
  });

  assert.equal(baseline.requirements[0]?.sourceFragment, "借阅者必须登录后才能借书。");
  assert.equal(baseline.requirements[0]?.status, "accepted");
  assert.equal(baseline.requirements[0]?.fieldProvenance.actor?.source, "source-text");
  assert.equal(baseline.requirements[0]?.fieldProvenance.object?.status, "pending-review");
  assert.equal(baseline.qualityReport.status, "blocked");
});

test("contracts keep old atomic requirements compatible when field provenance is absent", () => {
  const baseline = requirementBaselineSchema.parse({
    runId: "run-baseline-legacy",
    sourceDocumentId: "inline-requirement",
    requirements: [
      {
        id: "REQ-001",
        sourceFragment: "系统需要记录借阅日期。",
        sourceLocation: { startOffset: 0, endOffset: 11, section: "input" },
        type: "data",
        actor: "系统",
        subject: "系统",
        action: "记录借阅日期",
        object: "借阅日期",
        condition: null,
        outcome: "系统满足该需求",
        confidence: 0.82,
        status: "accepted",
        criticality: "high",
        acceptanceCriteria: ["验证：系统需要记录借阅日期。"],
      },
    ],
    assumptions: [],
    conflicts: [],
    qualityReport: {
      runId: "run-baseline-legacy",
      status: "passed",
      summary: "已建立 1 条原子需求基线。",
      issues: [],
      blockingIssueIds: [],
      reviewRequiredRequirementIds: [],
    },
    createdAt: "2026-05-24T00:00:00.000Z",
  });

  assert.deepEqual(baseline.requirements[0]?.fieldProvenance, {});
});

test("contracts describe coverage and bidirectional traceability matrices", () => {
  const coverage = coverageMatrixSchema.parse({
    runId: "run-trace",
    rows: [
      {
        requirementId: "REQ-001",
        status: "covered",
        rationale: "Use case covers the login requirement.",
        modelElements: ["requirements-model:usecase:uc-login"],
        designElements: ["design-model:sequence:msg-login"],
        codeArtifacts: ["/src/App.tsx"],
        tests: ["test:login"],
        reviewItems: [],
      },
    ],
  });
  assert.equal(coverage.rows[0]?.status, "covered");
  assert.throws(() =>
    coverageMatrixSchema.parse({
      runId: "run-trace",
      rows: [
        {
          requirementId: "REQ-001",
          status: "mapped",
          rationale: "invalid legacy status",
          modelElements: [],
          designElements: [],
          codeArtifacts: [],
          tests: [],
          reviewItems: [],
        },
      ],
    }),
  );

  const traceability = traceabilityMatrixSchema.parse({
    runId: "run-trace",
    links: [
      {
        fromArtifactType: "requirement",
        fromArtifactId: "REQ-001",
        toArtifactType: "requirements-model",
        toArtifactId: "usecase:uc-login",
        linkType: "satisfies",
        confidence: 0.91,
        rationale: "Use case names the same actor and action.",
      },
      {
        fromArtifactType: "requirements-model",
        fromArtifactId: "usecase:uc-login",
        toArtifactType: "requirement",
        toArtifactId: "REQ-001",
        linkType: "derives-from",
        confidence: 0.91,
        rationale: "Reverse lookup to source requirement.",
      },
    ],
    diagnostics: [
      {
        id: "TRACE-001",
        severity: "error",
        code: "orphan-artifact",
        message: "Model element has no requirement source.",
        artifactType: "requirements-model",
        artifactId: "class:orphan",
        blocksCompletion: true,
      },
    ],
  });
  assert.equal(traceability.links.length, 2);
});

test("contracts describe requirement-linked code business assertions", () => {
  const result = codeBusinessAssertionResultSchema.parse({
    runId: "run-code-assertions",
    generatedAt: "2026-05-24T00:00:00.000Z",
    passed: false,
    blockingFailureIds: ["CBA-001"],
    assertions: [
      {
        id: "CBA-001",
        requirementId: "REQ-001",
        category: "permission",
        description: "借阅者未登录时不能借书。",
        expectedBehavior: "借书操作必须先校验借阅者登录状态。",
        verificationMethod: "static-code-scan",
        evidenceArtifacts: ["/src/features/borrow.ts"],
        status: "failed",
        severity: "critical",
        message: "未发现登录权限校验。",
      },
    ],
  });

  assert.equal(result.assertions[0]?.requirementId, "REQ-001");
  assert.equal(result.passed, false);
  assert.throws(() =>
    codeBusinessAssertionResultSchema.parse({
      runId: "run-code-assertions",
      generatedAt: "2026-05-24T00:00:00.000Z",
      passed: true,
      blockingFailureIds: [],
      assertions: [
        {
          id: "CBA-001",
          category: "permission",
          description: "missing requirement id",
          expectedBehavior: "invalid",
          verificationMethod: "static-code-scan",
          evidenceArtifacts: [],
          status: "passed",
          severity: "critical",
          message: "invalid",
        },
      ],
    }),
  );
});

test("contracts describe evidence packages and human review decisions", () => {
  const baseline = requirementBaselineSchema.parse({
    runId: "run-evidence",
    sourceDocumentId: "inline-requirement",
    requirements: [
      {
        id: "REQ-001",
        sourceFragment: "系统响应时间不超过2秒。",
        type: "non-functional",
        actor: "系统",
        subject: "系统",
        action: "响应",
        object: "响应时间",
        condition: null,
        outcome: "不超过2秒",
        confidence: 0.82,
        status: "accepted",
        criticality: "high",
        acceptanceCriteria: ["响应时间必须不超过2秒。"],
      },
    ],
    assumptions: [],
    conflicts: [],
    qualityReport: {
      runId: "run-evidence",
      status: "passed",
      summary: "已建立 1 条原子需求基线。",
      issues: [],
      blockingIssueIds: [],
      reviewRequiredRequirementIds: [],
    },
    createdAt: "2026-05-24T00:00:00.000Z",
  });
  const evidence = evidencePackageSchema.parse({
    runId: "run-evidence",
    generatedAt: "2026-05-24T00:00:00.000Z",
    status: "blocked",
    requirementBaseline: baseline,
    qualityReport: baseline.qualityReport,
    coverageMatrix: {
      runId: "run-evidence",
      rows: [
        {
          requirementId: "REQ-001",
          status: "not-modelable",
          rationale: "需要替代证据。",
          modelElements: [],
          designElements: [],
          codeArtifacts: [],
          tests: [],
          reviewItems: ["alternative-evidence:REQ-001"],
        },
      ],
    },
    traceabilityMatrix: { runId: "run-evidence", links: [], diagnostics: [] },
    modelArtifacts: [],
    codeArtifacts: [],
    businessAssertionResults: null,
    browserEvidence: [],
    reviewItems: [
      {
        id: "REV-001",
        source: "coverage",
        status: "pending",
        severity: "error",
        requirementId: "REQ-001",
        reason: "REQ-001 is not modelable and needs approved alternative evidence.",
      },
    ],
    reviewDecisions: [
      {
        id: "DEC-001",
        reviewItemId: "REV-001",
        decision: "accepted-risk",
        reviewerId: "reviewer-1",
        comment: "性能需求转由压测报告验证。",
        decidedAt: "2026-05-24T00:00:00.000Z",
      },
    ],
    failureRecords: [],
    repairRecords: [],
  });

  assert.equal(evidence.status, "blocked");
  assert.equal(evidence.reviewItems[0]?.status, "pending");
  assert.equal(evidence.reviewDecisions[0]?.decision, "accepted-risk");
});

test("contracts validate representative stage payloads", () => {
  const rules = requirementRulesResultSchema.parse({
    rules: [
      {
        id: "r1",
        category: "业务规则",
        text: "用户必须登录后才能访问主要功能。",
        sourceFragment: "(1)访问主要功能",
        relatedDiagrams: ["function", "usecase", "activity"],
      },
    ],
  });
  assert.equal(rules.rules.length, 1);
  assert.equal(rules.rules[0]?.sourceFragment, "(1)访问主要功能");
  assert.throws(() =>
    requirementRulesResultSchema.parse({
      rules: [
        {
          id: "r1",
          category: "业务规则",
          text: "用户必须登录后才能访问主要功能。",
          relatedDiagrams: ["usecase"],
        },
        {
          id: "R1",
          category: "数据需求",
          text: "系统需要记录访问日志。",
          relatedDiagrams: ["class"],
        },
      ],
    }),
  );

  const models = diagramModelsResultSchema.parse({
    models: [
      {
        diagramKind: "usecase",
        title: "订单实验平台用例",
        summary: "展示主要角色与用例。",
        notes: ["仅展示核心用例"],
        actors: [
          {
            id: "actor_researcher",
            name: "研究人员",
            actorType: "human",
            responsibilities: ["提交文本需求"],
          },
        ],
        useCases: [
          {
            id: "usecase_generate",
            name: "生成 UML 模型",
            goal: "从文本需求生成结构化模型",
            preconditions: ["用户已输入需求"],
            postconditions: ["系统产出结构化模型"],
            supportingActorIds: [],
          },
        ],
        systemBoundaries: [{ id: "boundary_platform", name: "实验平台" }],
        relationships: [
          {
            id: "rel_association_1",
            sourceId: "actor_researcher",
            targetId: "usecase_generate",
            type: "association",
          },
        ],
      },
    ],
    requirementModelTraceability: [
      {
        ruleId: "r1",
        target: {
          diagramKind: "usecase",
          elementId: "usecase_generate",
          elementKind: "usecase",
          label: "生成 UML 模型",
        },
      },
    ],
  });
  assert.equal(models.models[0]?.diagramKind, "usecase");

  const event = runEventSchema.parse({
    type: "stage_progress",
    stage: "generate_models",
    progress: 65,
    message: "正在生成图模型",
  });
  assert.equal(event.type, "stage_progress");

  const uiMockupEvent = runEventSchema.parse({
    type: "artifact_ready",
    stage: "generate_code_ui_mockup",
    artifactKind: "uiMockup",
    uiMockup: {
      status: "completed",
      model: "gpt-image-2",
      prompt: "生成活动日历界面图",
      summary: "公共活动日历主界面",
      imageUrl: "https://example.com/mockup.png",
      imageDataUrl: null,
      errorMessage: null,
      createdAt: new Date().toISOString(),
    },
  });
  assert.equal(uiMockupEvent.type, "artifact_ready");

  const uiIr = codeUiIrResultSchema.parse({
    uiIr: {
      designTokens: {
        colors: {
          primary: "#2563eb",
          background: "#f8fafc",
          surface: "#ffffff",
          text: "#0f172a",
          accent: "#f97316",
        },
        typography: { body: "14px system-ui" },
        spacing: { "1": "4px", "3": "12px", "4": "16px" },
        radius: { sm: "4px", md: "8px" },
        shadow: { sm: "0 1px 2px rgba(0,0,0,.08)" },
        density: "comfortable",
      },
      componentRegistry: {
        components: [
          {
            name: "WorkspaceShell",
            description: "业务工作台布局",
            props: ["title"],
            variants: ["default"],
            usageRules: ["承载导航和主内容"],
          },
        ],
      },
      pages: [
        {
          id: "home",
          route: "/",
          name: "首页",
          layout: "sidebar-content",
          primaryActions: ["新增"],
          componentTree: {
            component: "WorkspaceShell",
            purpose: "承载首页",
            props: { title: "首页" },
            dataBinding: null,
            tokenRefs: ["colors.primary"],
            children: [],
          },
        },
      ],
      dataBindings: ["records -> DataTable"],
      interactions: ["点击新增打开表单"],
      responsiveRules: ["mobile 纵向排列"],
    },
  });
  assert.equal(uiIr.uiIr.pages[0]?.componentTree.component, "WorkspaceShell");

  const uiIrEvent = runEventSchema.parse({
    type: "artifact_ready",
    stage: "generate_code_ui_ir",
    artifactKind: "uiIr",
    uiIr: uiIr.uiIr,
  });
  assert.equal(uiIrEvent.type, "artifact_ready");

  const codeSkill = codeSkillSchema.parse({
    name: "react-prototype-quality",
    description: "提升 React 原型质量",
    triggers: ["React", "原型"],
    appliesTo: ["planning", "implementation"],
    priority: 80,
    source: "builtin",
    location: "apps/api/src/code-skills/builtin/react-prototype-quality/SKILL.md",
    baseDir: "apps/api/src/code-skills/builtin/react-prototype-quality",
    fileManifest: [
      {
        path: "apps/api/src/code-skills/builtin/react-prototype-quality/SKILL.md",
        relativePath: "SKILL.md",
        kind: "skill",
        size: 120,
      },
    ],
    content: "生成完整可运行代码。",
  });
  assert.equal(codeSkill.name, "react-prototype-quality");

  const skillAction = codeSkillActionSchema.parse({
    name: "design-system",
    description: "查询设计系统",
    command: "python",
    args: ["scripts/search.py", "{query}", "--design-system"],
    outputFormat: "markdown",
  });
  assert.equal(skillAction.command, "python");
  assert.throws(() =>
    codeSkillActionSchema.parse({
      name: "bad",
      description: "危险命令",
      command: "rm",
      args: ["-rf", "."],
    }),
  );

  const codeSkillsEvent = runEventSchema.parse({
    type: "artifact_ready",
    stage: "select_code_skills",
    artifactKind: "codeSkills",
    codeSkills: [
      {
        name: codeSkill.name,
        description: codeSkill.description,
        source: codeSkill.source,
        location: codeSkill.location,
        appliesTo: codeSkill.appliesTo,
        priority: codeSkill.priority,
        reason: "默认启用 React 原型质量技能。",
      },
    ],
    skillDiagnostics: [],
  });
  assert.equal(codeSkillsEvent.type, "artifact_ready");

  const codeSkillContext = codeSkillContextSchema.parse({
    skillName: "ui-ux-pro-max",
    alias: "@web-design",
    query: "校园活动 dashboard React",
    designSystem: "## Design System",
    stackGuidelines: "{\"results\":[]}",
    domainGuidelines: "{\"results\":[]}",
    actionResults: [
      {
        name: "design-system",
        description: "查询设计系统",
        command: "python",
        args: ["scripts/search.py", "校园活动", "--design-system"],
        outputFormat: "markdown",
        status: "completed",
        stdout: "## Design System",
        stderr: "",
        exitCode: 0,
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
      },
    ],
    diagnostics: [],
  });
  assert.equal(codeSkillContext.actionResults[0]?.status, "completed");

  const skillResourcePlan = codeSkillResourcePlanSchema.parse({
    skillName: "ui-ux-pro-max",
    alias: "@web-design",
    query: "校园活动 dashboard React responsive accessible",
    requests: [
      {
        resourceType: "stack",
        name: "react-stack",
        query: "React prototype",
        csvPath: "",
        stack: "react",
        domain: "",
        actionName: "",
        maxResults: 6,
        reason: "获取 React 原型实现规则。",
      },
    ],
    diagnostics: [],
  });
  assert.equal(skillResourcePlan.requests[0]?.stack, "react");

  const visualDirection = codeVisualDirectionSchema.parse({
    productType: "活动服务原型",
    targetAudience: "学生和活动管理员",
    toneKeywords: ["友好", "清爽"],
    styleKeywords: ["soft cards", "community calendar"],
    colorMood: "浅色蓝绿社区服务色板",
    typographyMood: "清晰、圆润、易扫读",
    layoutMood: "卡片式多页面业务工作台",
    componentTexture: "柔和阴影和轻量边框",
    interactionMood: "明确反馈、轻微动效",
    avoidStyles: ["纯黑背景", "移动端原生交互"],
    promptBrief: "friendly civic calendar, soft event cards, optimistic blue-green palette",
  });
  assert.match(visualDirection.promptBrief, /friendly civic calendar/);

  const skillResourceDiscoveryPlan = codeSkillResourceDiscoveryPlanSchema.parse({
    skillName: "ui-ux-pro-max",
    alias: "@web-design",
    requests: [
      {
        path: "data/styles.csv",
        reason: "理解可选视觉风格。",
        expectedUse: "选择适合社区活动日历的卡片风格。",
      },
    ],
    diagnostics: [],
  });
  assert.equal(skillResourceDiscoveryPlan.requests[0]?.path, "data/styles.csv");

  const skillResourcePreviews = codeSkillResourcePreviewResultSchema.parse({
    skillName: "ui-ux-pro-max",
    alias: "@web-design",
    previews: [
      {
        path: "data/styles.csv",
        rowCount: 12,
        headers: ["No", "Style Category", "Type"],
        sampleRows: [{ No: "1", "Style Category": "Minimalism", Type: "General" }],
        matchedHints: ["General"],
        status: "completed",
      },
    ],
    diagnostics: [],
  });
  assert.equal(skillResourcePreviews.previews[0]?.headers[1], "Style Category");

  const skillResourcePlanEvent = runEventSchema.parse({
    type: "artifact_ready",
    stage: "plan_code_ui",
    artifactKind: "skillResourcePlan",
    skillResourcePlan,
  });
  assert.equal(skillResourcePlanEvent.type, "artifact_ready");

  const codeSkillContextEvent = runEventSchema.parse({
    type: "artifact_ready",
    stage: "plan_code_ui",
    artifactKind: "codeSkillContext",
    codeSkillContext,
  });
  assert.equal(codeSkillContextEvent.type, "artifact_ready");

  const visualDirectionEvent = runEventSchema.parse({
    type: "artifact_ready",
    stage: "plan_code_ui",
    artifactKind: "visualDirection",
    visualDirection,
  });
  assert.equal(visualDirectionEvent.type, "artifact_ready");

  const skillResourceDiscoveryPlanEvent = runEventSchema.parse({
    type: "artifact_ready",
    stage: "plan_code_ui",
    artifactKind: "skillResourceDiscoveryPlan",
    skillResourceDiscoveryPlan,
  });
  assert.equal(skillResourceDiscoveryPlanEvent.type, "artifact_ready");

  const skillResourcePreviewsEvent = runEventSchema.parse({
    type: "artifact_ready",
    stage: "plan_code_ui",
    artifactKind: "skillResourcePreviews",
    skillResourcePreviews,
  });
  assert.equal(skillResourcePreviewsEvent.type, "artifact_ready");

  const codeSnapshot = codeRunSnapshotSchema.parse({
    runId: "code-run",
    requirementText: "生成活动报名原型",
    rules: [],
    designModels: [],
    spec: null,
    visualDirection,
    skillResourceDiscoveryPlan,
    skillResourcePreviews,
    skillResourcePlan,
    codeSkillContext,
    selectedCodeSkills: codeSkillsEvent.codeSkills,
    skillDiagnostics: [],
    files: {},
    entryFile: "/src/App.tsx",
    codeTrace: [
      {
        stage: "generate_file_operations",
        attempt: 1,
        kind: "parse_error",
        rawOutput: "{\"operations\":[{\"operation\":\"bad_operation\"}]}",
        errorMessage: "operations.0.operation: Invalid enum value",
        createdAt: new Date().toISOString(),
      },
    ],
    currentStage: "select_code_skills",
    status: "running",
    error: null,
  });
  assert.equal(codeSnapshot.selectedCodeSkills.length, 1);
  assert.equal(codeSnapshot.codeTrace.length, 1);

  const codeTraceEntry = codeTraceEntrySchema.parse({
    stage: "generate_file_content",
    attempt: 2,
    kind: "validation_error",
    path: "/src/App.tsx",
    rawOutput: "```tsx\nexport default function App() { return null; }\n```",
    rawOutputTruncated: true,
    rawOutputOriginalLength: 12000,
    errorMessage: "/src/App.tsx content still contains a Markdown fence",
    createdAt: new Date().toISOString(),
  });
  assert.equal(codeTraceEntry.path, "/src/App.tsx");
  assert.equal(codeTraceEntry.rawOutputTruncated, true);

  const designTraceEntry = designTraceEntrySchema.parse({
    stage: "render_svg",
    attempt: 1,
    kind: "render_error",
    diagramKind: "activity",
    rawOutputTruncated: false,
    plantUmlSource: "@startuml\nstart\n@enduml",
    errorMessage: "Syntax Error? (line 2)",
    createdAt: new Date().toISOString(),
  });
  assert.equal(designTraceEntry.kind, "render_error");

  const designSnapshot = designRunSnapshotSchema.parse({
    runId: "design-run",
    requirementText: "生成设计模型",
    selectedDiagrams: ["sequence"],
    rules: [],
    requirementModels: [],
    requirementModelTraceability: [],
    models: [],
    designModelTraceability: [],
    plantUml: [],
    svgArtifacts: [],
    diagramErrors: {},
    designTrace: [
      designTraceEntry,
      {
        stage: "generate_design_sequence",
        attempt: 1,
        kind: "llm_output",
        rawOutput: "{\"models\":[]}",
        createdAt: new Date().toISOString(),
      },
    ],
    currentStage: "render_svg",
    status: "running",
    error: null,
  });
  assert.equal(designSnapshot.designTrace.length, 2);

  const requirementTraceEntry = requirementTraceEntrySchema.parse({
    stage: "generate_models",
    attempt: 1,
    kind: "parse_error",
    rawOutput: "{\"models\":[]}",
    rawOutputTruncated: true,
    rawOutputOriginalLength: 9000,
    errorMessage: "models.0.notes: Required",
    createdAt: new Date().toISOString(),
  });
  assert.equal(requirementTraceEntry.kind, "parse_error");
  assert.equal(requirementTraceEntry.rawOutputOriginalLength, 9000);

  const requirementSnapshot = runSnapshotSchema.parse({
    runId: "run",
    requirementText: "生成需求模型",
    selectedDiagrams: ["usecase", "analysis"],
    requestedDiagrams: ["analysis"],
    dependencyDiagrams: ["usecase"],
    rules: [],
    models: [],
    requirementModelTraceability: [],
    plantUml: [],
    svgArtifacts: [],
    diagramErrors: {},
    requirementTrace: [
      requirementTraceEntry,
      {
        stage: "generate_plantuml",
        attempt: 1,
        kind: "plantuml_source",
        diagramKind: "usecase",
        plantUmlSource: "@startuml\n@enduml",
        createdAt: new Date().toISOString(),
      },
    ],
    currentStage: "generate_models",
    status: "running",
    error: null,
  });
  assert.equal(requirementSnapshot.requirementTrace.length, 2);
  assert.deepEqual(requirementSnapshot.requestedDiagrams, ["analysis"]);
  assert.deepEqual(requirementSnapshot.dependencyDiagrams, ["usecase"]);

  const render = renderSvgResponseSchema.parse({
    svg: "<svg></svg>",
    renderMeta: {
      engine: "plantuml",
      generatedAt: new Date().toISOString(),
      sourceLength: 120,
      durationMs: 42,
    },
  });
  assert.match(render.svg, /<svg/);
});

test("contracts accept existing design context for incremental design runs", () => {
  const requirementBaseline = requirementBaselineSchema.parse({
    runId: "run-baseline",
    sourceDocumentId: "inline-requirement",
    createdAt: "2026-06-05T00:00:00.000Z",
    requirements: [
      {
        id: "REQ-001",
        sourceRuleId: "r1",
        sourceFragment: "管理员可以借书和还书。",
        type: "functional",
        actor: "管理员",
        subject: "管理员",
        action: "借书和还书",
        object: "图书",
        condition: null,
        outcome: "完成借还书登记",
        confidence: 0.9,
        status: "accepted",
        criticality: "high",
        acceptanceCriteria: ["管理员完成借还书登记。"],
        fieldProvenance: {},
      },
    ],
    assumptions: [],
    conflicts: [],
    qualityReport: {
      runId: "run-baseline",
      status: "passed",
      summary: "需求基线已确认。",
      issues: [],
      blockingIssueIds: [],
      reviewRequiredRequirementIds: [],
    },
  });
  const parsed = startDesignRunRequestSchema.parse({
    requirementBaseline,
    requirementModels: [
      {
        diagramKind: "usecase",
        title: "图书馆用例模型",
        summary: "管理员与读者的核心用例。",
        notes: [],
        actors: [
          {
            id: "actor_librarian",
            name: "图书管理员",
            actorType: "human",
            responsibilities: ["借书", "还书"],
          },
        ],
        useCases: [
          {
            id: "uc_borrow",
            name: "借书",
            goal: "登记图书借阅",
            preconditions: ["图书未借出"],
            postconditions: ["图书被借出"],
            primaryActorId: "actor_librarian",
            supportingActorIds: [],
          },
        ],
        systemBoundaries: [{ id: "boundary_library", name: "图书馆管理系统" }],
        relationships: [
          {
            id: "rel_librarian_borrow",
            type: "association",
            sourceId: "actor_librarian",
            targetId: "uc_borrow",
          },
        ],
      },
    ],
    requirementModelTraceability: [
      {
        ruleId: "r1",
        target: {
          diagramKind: "usecase",
          elementId: "uc_borrow",
          elementKind: "usecase",
          label: "借书",
        },
      },
    ],
    selectedDiagrams: ["table"],
    requestedDiagrams: ["table"],
    existingDesignModels: [
      {
        diagramKind: "sequence",
        modelId: "sequence:uc_borrow",
        sourceUseCaseId: "uc_borrow",
        sourceUseCaseName: "借书",
        title: "借书顺序图",
        summary: "借书交互流程。",
        notes: [],
        participants: [],
        messages: [],
        fragments: [],
      },
    ],
    existingDesignModelTraceability: [
      {
        source: {
          diagramKind: "sequence",
          modelId: "sequence:uc_borrow",
          elementId: "sequence:uc_borrow",
          elementKind: "sequence",
          label: "借书顺序图",
        },
        targets: [
          {
            diagramKind: "usecase",
            elementId: "uc_borrow",
            elementKind: "usecase",
            label: "借书",
          },
        ],
      },
    ],
    existingDesignPlantUml: [
      {
        diagramKind: "sequence",
        modelId: "sequence:uc_borrow",
        source: "@startuml\n@enduml",
      },
    ],
    existingDesignSvgArtifacts: [
      {
        diagramKind: "sequence",
        modelId: "sequence:uc_borrow",
        svg: "<svg></svg>",
        renderMeta: {
          engine: "test",
          generatedAt: new Date().toISOString(),
          sourceLength: 18,
          durationMs: 1,
        },
      },
    ],
  });

  assert.equal(parsed.selectedDiagrams[0], "table");
  assert.equal(parsed.requestedDiagrams?.[0], "table");
  assert.equal(parsed.requirementBaseline.requirements[0]?.id, "REQ-001");
  assert.equal(parsed.existingDesignModels?.[0]?.diagramKind, "sequence");
  assert.throws(
    () =>
      startDesignRunRequestSchema.parse({
        ...parsed,
        requirementText: "图书馆管理系统",
        rules: [],
      }),
    /Unrecognized key/,
  );
});

test("start run contracts accept optional project context", () => {
  const baseProviderSettings = {
    providerConfigId: "provider-config-1",
    model: "gpt-5.5",
  };
  const requirementBaseline = requirementBaselineSchema.parse({
    runId: "run-project",
    sourceDocumentId: "inline-requirement",
    createdAt: "2026-06-05T00:00:00.000Z",
    requirements: [
      {
        id: "REQ-001",
        sourceRuleId: "r1",
        sourceFragment: "生成设计模型",
        type: "functional",
        actor: "用户",
        subject: "用户",
        action: "生成",
        object: "设计模型",
        condition: null,
        outcome: "形成设计模型",
        confidence: 0.9,
        status: "accepted",
        criticality: "high",
        acceptanceCriteria: ["用户可以生成设计模型。"],
        fieldProvenance: {},
      },
    ],
    assumptions: [],
    conflicts: [],
    qualityReport: {
      runId: "run-project",
      status: "passed",
      summary: "需求基线已确认。",
      issues: [],
      blockingIssueIds: [],
      reviewRequiredRequirementIds: [],
    },
  });
  assert.equal(
    startRunRequestSchema.parse({
      projectId: "project-a",
      requirementText: "项目需求",
      selectedDiagrams: ["usecase"],
      providerSettings: baseProviderSettings,
    }).projectId,
    "project-a",
  );
  assert.equal(
    startDesignRunRequestSchema.parse({
      projectId: "project-a",
      requirementBaseline,
      requirementModels: [
        {
          diagramKind: "usecase",
          title: "用例",
          summary: "用例模型",
          notes: [],
          actors: [],
          useCases: [],
          systemBoundaries: [],
          relationships: [],
        },
      ],
      requirementModelTraceability: [
        {
          ruleId: "r1",
          target: {
            diagramKind: "usecase",
            elementId: "usecase-generate",
            elementKind: "usecase",
            label: "生成设计模型",
          },
        },
      ],
      selectedDiagrams: ["sequence"],
      providerSettings: baseProviderSettings,
    }).projectId,
    "project-a",
  );
  assert.equal(
    startCodeRunRequestSchema.parse({
      projectId: "project-a",
      designModels: [
        {
          diagramKind: "sequence",
          title: "顺序图",
          summary: "设计调用",
          notes: [],
          participants: [
            {
              id: "user",
              name: "用户",
              participantType: "actor",
            },
          ],
          messages: [],
          fragments: [],
        },
      ],
      providerSettings: baseProviderSettings,
    }).projectId,
    "project-a",
  );
  assert.throws(() =>
    startCodeRunRequestSchema.parse({
      projectId: "project-a",
      requirementText: "项目需求",
      rules: [],
      designModels: [
        {
          diagramKind: "sequence",
          title: "顺序图",
          summary: "设计调用",
          notes: [],
          participants: [],
          messages: [],
          fragments: [],
        },
      ],
    }),
  );
  assert.equal(
    startDocumentRunRequestSchema.parse({
      projectId: "project-a",
      documentKind: "requirementsSpec",
      requirementText: "项目需求",
      providerSettings: baseProviderSettings,
    }).projectId,
    "project-a",
  );
  assert.deepEqual(
    startRunCommandSchema.parse({
      projectId: "project-a",
      selectedDiagrams: ["usecase", "analysis"],
      requestedDiagrams: ["analysis"],
      dependencyDiagrams: ["usecase"],
      providerSettings: baseProviderSettings,
    }),
    {
      projectId: "project-a",
      selectedDiagrams: ["usecase", "analysis"],
      requestedDiagrams: ["analysis"],
      dependencyDiagrams: ["usecase"],
      analysisTargetUseCaseIds: [],
      providerSettings: baseProviderSettings,
    },
  );
  assert.deepEqual(
    startDesignRunCommandSchema.parse({
      projectId: "project-a",
      selectedDiagrams: ["sequence"],
      requestedDiagrams: ["sequence"],
      providerSettings: baseProviderSettings,
    }).requestedDiagrams,
    ["sequence"],
  );
  assert.equal(
    startCodeRunCommandSchema.parse({
      projectId: "project-a",
      providerSettings: baseProviderSettings,
    }).generationMode,
    "continue",
  );
  assert.equal(
    startDocumentRunCommandSchema.parse({
      projectId: "project-a",
      documentKind: "requirementsSpec",
      providerSettings: baseProviderSettings,
    }).useAiText,
    true,
  );
});

test("contracts describe user, session, admin, and account security DTOs", () => {
  const user = userDtoSchema.parse({
    id: "user-1",
    email: "owner@example.com",
    username: "owner_user",
    displayName: "Owner User",
    avatarUrl: null,
    status: "active",
    emailVerified: true,
    systemRoles: ["super_admin"],
    createdAt: "2026-05-22T00:00:00.000Z",
    updatedAt: "2026-05-22T00:00:00.000Z",
    lastLoginAt: null,
  });
  assert.equal(user.email, "owner@example.com");

  const session = authSessionResponseSchema.parse({
    user,
    session: {
      id: "session-1",
      userId: "user-1",
      createdAt: "2026-05-22T00:00:00.000Z",
      expiresAt: "2026-05-29T00:00:00.000Z",
      lastSeenAt: "2026-05-22T00:00:00.000Z",
      ipAddress: "127.0.0.1",
      userAgent: "node:test",
    },
  });
  assert.equal(session.session.userId, user.id);

  const accountProfile = accountProfileResponseSchema.parse({
    ...session,
    mfa: {
      enabled: false,
      enforcement: "totp",
    },
    generationUsage: {
      usedToday: 0,
      limit: null,
      remaining: null,
      windowSeconds: 86400,
      limited: false,
      scope: "user",
    },
  });
  assert.equal(accountProfile.mfa.enforcement, "totp");
  assert.equal(
    accountProfileUpdateRequestSchema.parse({
      avatarUrl: "https://cdn.example.com/avatar.png",
    }).avatarUrl,
    "https://cdn.example.com/avatar.png",
  );
  assert.equal(
    accountProfileUpdateRequestSchema.parse({ avatarUrl: null }).avatarUrl,
    null,
  );
  assert.throws(
    () =>
      accountProfileUpdateRequestSchema.parse({
        avatarUrl: "http://cdn.example.com/avatar.png",
      }),
    /HTTPS/u,
  );

  const admin = adminUserDtoSchema.parse({
    user,
    projectCount: 2,
    activeSessionCount: 1,
    lastAuditEventAt: null,
  });
  assert.equal(admin.user.systemRoles[0], "super_admin");

  assert.throws(() =>
    userDtoSchema.parse({
      ...user,
      passwordHash: "must-not-be-public",
    }),
  );
  assert.throws(() =>
    authRegisterRequestSchema.parse({
      email: "bad-email",
      username: "bad user",
      password: "short",
      displayName: "",
    }),
  );
  assert.equal(
    authLoginRequestSchema.parse({
      identifier: "OWNER@EXAMPLE.COM",
      password: "password-123",
    }).identifier,
    "owner@example.com",
  );
  assert.equal(
    authLoginRequestSchema.parse({
      email: "LEGACY@EXAMPLE.COM",
      password: "password-123",
    }).identifier,
    "legacy@example.com",
  );
  assert.throws(() =>
    accountSecurityUpdateRequestSchema.parse({
      currentPassword: "password-123",
      newPassword: "password-123",
    }),
  );
});

test("project contracts carry academic binding and deprecated default provider metadata", () => {
  const project = projectDtoSchema.parse({
    id: "project-1",
    name: "课程 UML 实验项目",
    description: "绑定课程班级",
    visibility: "team",
    status: "active",
    ownerUserId: "user-1",
    organizationId: "org-1",
    courseId: "course-1",
    classId: "class-1",
    teamId: "team-1",
    defaultProviderConfigId: null,
    createdAt: "2026-05-22T00:00:00.000Z",
    updatedAt: "2026-05-22T00:00:00.000Z",
  });

  assert.equal(project.courseId, "course-1");
  assert.equal(project.defaultProviderConfigId, null);

  const create = projectCreateRequestSchema.parse({
    name: project.name,
    description: project.description,
    visibility: "team",
    organizationId: "org-1",
    courseId: "course-1",
    classId: "class-1",
    teamId: "team-1",
    defaultProviderConfigId: "provider-1",
  });
  assert.equal(create.teamId, "team-1");

  const update = projectUpdateRequestSchema.parse({
    courseId: null,
    classId: "class-2",
    teamId: null,
    defaultProviderConfigId: "provider-2",
  });
  assert.equal(update.courseId, null);
  assert.equal(update.classId, "class-2");
});

test("contracts describe admin session RBAC and capabilities", () => {
  const response = adminSessionResponseSchema.parse({
    user: {
      id: "admin-1",
      email: "admin@example.com",
      username: "admin_user",
      displayName: "Admin User",
      avatarUrl: null,
      status: "active",
      emailVerified: true,
      mfaEnabled: false,
      systemRoles: ["super_admin"],
      createdAt: "2026-05-22T00:00:00.000Z",
      updatedAt: "2026-05-22T00:00:00.000Z",
      lastLoginAt: null,
    },
    roles: ["super_admin"],
    permissions: adminRolePermissions.super_admin,
    dataScopes: ["all_projects", "all_users", "system"],
    mfaRequired: true,
    capabilities: adminRoleCapabilities.super_admin,
  });

  assert.ok(response.permissions.includes("admin.users.write"));
  assert.ok(response.capabilities.includes("manageUsers"));
  assert.equal(response.mfaRequired, true);
  assert.throws(() =>
    adminSessionResponseSchema.parse({
      ...response,
      user: {
        ...response.user,
        passwordHash: "must-not-leak",
      },
    }),
  );
});

test("contracts describe admin rate limit policy DTOs", () => {
  const created = adminRateLimitPolicyCreateRequestSchema.parse({
    scopeType: "project",
    scopeId: "project-1",
    providerConfigId: "provider-1",
    taskType: "requirements_to_uml",
    limit: 12,
    windowSeconds: 300,
    enabled: true,
  });
  assert.equal(created.scopeType, "project");
  assert.equal(created.limit, 12);

  const policy = adminRateLimitPolicyDtoSchema.parse({
    id: "policy-1",
    scopeType: "project",
    scopeId: "project-1",
    providerConfigId: "provider-1",
    taskType: "requirements_to_uml",
    limit: 12,
    windowSeconds: 300,
    enabled: true,
    createdAt: "2026-05-22T00:00:00.000Z",
    updatedAt: "2026-05-22T00:00:00.000Z",
  });
  assert.equal(policy.providerConfigId, "provider-1");

  const list = adminRateLimitPolicyListResponseSchema.parse({
    generatedAt: "2026-05-22T00:00:00.000Z",
    rateLimits: [policy],
    fallbackPolicy: {
      limit: 60,
      windowSeconds: 3600,
      source: "default",
    },
  });
  assert.equal(list.rateLimits.length, 1);

  const patch = adminRateLimitPolicyUpdateRequestSchema.parse({
    limit: 20,
    enabled: false,
  });
  assert.equal(patch.enabled, false);
  assert.throws(() =>
    adminRateLimitPolicyCreateRequestSchema.parse({
      scopeType: "project",
      limit: 0,
      windowSeconds: 60,
    }),
  );
});

test("contracts describe provider usage and quota DTOs without pretending to bill", () => {
  const costEstimate = {
    enabled: false,
    amount: null,
    currency: null,
    externalBillingSource: "external_provider",
    note: "Usage is operational telemetry only; billing remains in the external provider.",
  } as const;

  const usage = adminProviderUsageListResponseSchema.parse({
    generatedAt: "2026-05-22T00:00:00.000Z",
    usage: [
      {
        id: "usage-1",
        userId: "user-1",
        projectId: "project-1",
        courseId: "course-1",
        classId: "class-1",
        providerConfigId: "provider-1",
        provider: "openai",
        model: "gpt-4.1",
        taskType: "requirements_to_uml",
        outcome: "success",
        units: 1,
        tokenUsage: null,
        createdAt: "2026-05-22T00:00:00.000Z",
        costEstimate,
      },
    ],
  });
  assert.equal(usage.usage[0]?.tokenUsage, null);
  assert.equal(usage.usage[0]?.costEstimate.enabled, false);
  assert.equal(usage.usage[0]?.costEstimate.externalBillingSource, "external_provider");

  const quotas = adminProviderQuotaListResponseSchema.parse({
    generatedAt: "2026-05-22T00:00:00.000Z",
    quotas: [
      {
        providerConfigId: "provider-1",
        provider: "openai",
        model: "gpt-4.1",
        taskType: "requirements_to_uml",
        scopeType: "project",
        scopeId: "project-1",
        limit: 12,
        windowSeconds: 3600,
        usedUnits: 2,
        remainingUnits: 10,
        resetAt: null,
        costEstimate,
      },
    ],
  });
  assert.equal(quotas.quotas[0]?.remainingUnits, 10);
  assert.throws(() =>
    adminProviderUsageListResponseSchema.parse({
      generatedAt: "2026-05-22T00:00:00.000Z",
      usage: [
        {
          ...usage.usage[0],
          costEstimate: {
            enabled: true,
            amount: 1.23,
            currency: "USD",
            externalBillingSource: "external_provider",
            note: "must stay disabled",
          },
        },
      ],
    }),
  );
});

test("contracts describe school, course, class, team, membership, and quota admin DTOs", () => {
  const organization = adminOrganizationDtoSchema.parse({
    id: "org-1",
    name: "工程学院",
    code: "ENG",
    type: "school",
    status: "active",
    createdAt: "2026-05-22T00:00:00.000Z",
    updatedAt: "2026-05-22T00:00:00.000Z",
  });
  assert.equal(organization.type, "school");

  const organizationCreate = adminOrganizationCreateRequestSchema.parse({
    name: "  软件学院  ",
    code: "  SSE  ",
  });
  assert.equal(organizationCreate.name, "软件学院");
  assert.equal(organizationCreate.code, "SSE");
  assert.equal(organizationCreate.type, "school");

  const course = adminCourseDtoSchema.parse({
    id: "course-1",
    organizationId: organization.id,
    name: "软件工程",
    code: "SE101",
    term: "2026 Spring",
    status: "active",
    createdAt: "2026-05-22T00:00:00.000Z",
    updatedAt: "2026-05-22T00:00:00.000Z",
  });
  assert.equal(course.organizationId, organization.id);

  const courseCreate = adminCourseCreateRequestSchema.parse({
    organizationId: organization.id,
    name: "软件工程",
  });
  assert.equal(courseCreate.status, "active");

  const classRecord = adminClassDtoSchema.parse({
    id: "class-1",
    courseId: course.id,
    name: "一班",
    code: null,
    status: "active",
    createdAt: "2026-05-22T00:00:00.000Z",
    updatedAt: "2026-05-22T00:00:00.000Z",
  });
  assert.equal(classRecord.courseId, course.id);

  const classCreate = adminClassCreateRequestSchema.parse({
    courseId: course.id,
    name: "一班",
  });
  assert.equal(classCreate.status, "active");

  const team = adminTeamDtoSchema.parse({
    id: "team-1",
    classId: classRecord.id,
    name: "建模小组 A",
    code: "A",
    status: "active",
    createdAt: "2026-05-22T00:00:00.000Z",
    updatedAt: "2026-05-22T00:00:00.000Z",
  });
  assert.equal(team.classId, classRecord.id);

  const teamCreate = adminTeamCreateRequestSchema.parse({
    classId: classRecord.id,
    name: "建模小组 A",
  });
  assert.equal(teamCreate.status, "active");

  const membership = adminOrganizationMembershipDtoSchema.parse({
    id: "membership-1",
    targetType: "course",
    targetId: course.id,
    userId: "user-1",
    email: "TEACHER@EXAMPLE.COM",
    displayName: "教师",
    role: "course_admin",
    status: "active",
    createdAt: "2026-05-22T00:00:00.000Z",
    updatedAt: "2026-05-22T00:00:00.000Z",
  });
  assert.equal(membership.email, "teacher@example.com");

  const membershipCreate = adminOrganizationMembershipCreateRequestSchema.parse({
    targetType: "course",
    targetId: course.id,
    userId: "user-1",
    role: "course_admin",
  });
  assert.equal(membershipCreate.status, "active");

  const quota = adminQuotaDtoSchema.parse({
    id: "quota-1",
    scopeType: "course",
    scopeId: course.id,
    resource: "runs",
    limit: 120,
    used: 0,
    resetPeriod: "monthly",
    createdAt: "2026-05-22T00:00:00.000Z",
    updatedAt: "2026-05-22T00:00:00.000Z",
  });
  assert.equal(quota.limit, 120);

  const quotaCreate = adminQuotaCreateRequestSchema.parse({
    scopeType: "course",
    scopeId: course.id,
    resource: "runs",
    limit: 120,
    resetPeriod: "monthly",
  });
  assert.equal(quotaCreate.used, 0);
});

test("contracts describe user-visible provider config DTOs without secrets", () => {
  const list = providerConfigListResponseSchema.parse({
    providerConfigs: [
      {
        id: "provider-1",
        name: "OpenAI gateway",
        provider: "openai",
        baseUrl: "https://api.openai.com",
        defaultModel: "gpt-4.1",
        allowedModels: ["gpt-4.1", "gpt-4.1-mini"],
        maskedKey: "sk-...a91f",
        status: "active",
        riskState: "medium",
        quota: "unlimited",
        lastUsedAt: null,
        scopeType: "system",
        scopeId: null,
        breakerState: "closed",
      },
    ],
  });
  assert.equal(list.providerConfigs[0]?.scopeType, "system");
  assert.throws(() =>
    providerConfigListResponseSchema.parse({
      providerConfigs: [
        {
          ...list.providerConfigs[0],
          apiKey: "sk-secret-must-not-leak",
        },
      ],
    }),
  );

  assert.deepEqual(providerConfigTestRequestSchema.parse({}), {});
  assert.equal(
    providerConfigTestRequestSchema.parse({ model: " gpt-4.1 " }).model,
    "gpt-4.1",
  );
  assert.throws(() =>
    providerConfigTestRequestSchema.parse({
      model: "gpt-4.1",
      apiKey: "sk-secret-must-not-be-accepted",
    }),
  );
  assert.throws(() =>
    providerConfigTestRequestSchema.parse({
      apiBaseUrl: "https://api.openai.com",
    }),
  );
});

test("contracts describe project, member, role, and permission DTOs", () => {
  const project = projectDtoSchema.parse({
    id: "project-1",
    name: "课程 UML 项目",
    description: null,
    visibility: "private",
    status: "active",
    ownerUserId: "user-1",
    ownerDisplayName: "Owner User",
    ownerAvatarUrl: "https://example.com/owner.png",
    memberCount: 4,
    memberPreviews: [
      {
        id: "member-1",
        userId: "user-1",
        displayName: "Owner User",
        avatarUrl: "https://example.com/owner.png",
        role: "owner",
        status: "active",
      },
      {
        id: "member-2",
        userId: "user-2",
        displayName: "Editor User",
        avatarUrl: null,
        role: "editor",
        status: "active",
      },
    ],
    createdAt: "2026-05-22T00:00:00.000Z",
    updatedAt: "2026-05-22T00:00:00.000Z",
  });
  assert.equal(project.visibility, "private");
  assert.equal(project.ownerDisplayName, "Owner User");
  assert.equal(project.memberCount, 4);
  assert.equal(project.memberPreviews?.[1]?.displayName, "Editor User");

  const createRequest = projectCreateRequestSchema.parse({
    name: " 新项目 ",
    description: "",
  });
  assert.equal(createRequest.name, "新项目");
  assert.equal(createRequest.visibility, "private");

  const member = projectMemberDtoSchema.parse({
    id: "member-1",
    projectId: project.id,
    userId: "user-1",
    email: "owner@example.com",
    displayName: "Owner User",
    avatarUrl: "https://example.com/owner.png",
    role: "owner",
    status: "active",
    invitedByUserId: null,
    invitedAt: null,
    joinedAt: "2026-05-22T00:00:00.000Z",
    createdAt: "2026-05-22T00:00:00.000Z",
    updatedAt: "2026-05-22T00:00:00.000Z",
  });
  assert.equal(member.role, "owner");
  assert.equal(member.avatarUrl, "https://example.com/owner.png");
  assert.ok(projectMemberRolePermissions.owner.includes("manage_members"));
  assert.ok(projectMemberRolePermissions.editor.includes("start_runs"));
  assert.ok(projectMemberRolePermissions.viewer.includes("view_documents"));
  assert.equal(projectMemberRolePermissions.viewer.includes("update_project"), false);
  assert.equal(projectMemberRolePermissions.viewer.includes("manage_documents"), false);

  const invite = projectMemberInviteRequestSchema.parse({
    email: "EDITOR@EXAMPLE.COM",
    role: "editor",
  });
  assert.equal(invite.email, "editor@example.com");
  assert.throws(() =>
    projectMemberInviteRequestSchema.parse({
      email: "viewer@example.com",
      role: "owner",
    }),
  );
});

test("contracts validate design table relationship diagrams", () => {
  const result = designDiagramModelsResultSchema.parse({
    models: [
      {
        diagramKind: "table",
        title: "订单表关系",
        summary: "体现用户、订单和订单明细的主外键关系。",
        notes: ["由设计类图推导"],
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
                references: {
                  tableId: "user",
                  columnId: "id",
                },
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
            sourceColumnId: "id",
            targetColumnId: "user_id",
            label: "1对多",
          },
        ],
      },
    ],
    designModelTraceability: [
      {
        source: {
          diagramKind: "table",
          elementId: "user",
          elementKind: "table",
          label: "user",
        },
        targets: [
          {
            diagramKind: "class",
            elementId: "user",
            elementKind: "class",
            label: "用户",
          },
        ],
      },
    ],
  });

  assert.equal(result.models[0]?.diagramKind, "table");
});

test("contracts validate function, architecture, and component diagrams", () => {
  const requirementResult = diagramModelsResultSchema.parse({
    models: [
      {
        diagramKind: "function",
        title: "功能结构图",
        summary: "系统功能分解",
        notes: [],
        nodes: [
          { id: "fn_root", name: "订单管理", sourceRequirementIds: ["REQ-001"] },
          { id: "fn_create", name: "创建订单", parentId: "fn_root", sourceRequirementIds: ["REQ-001"] },
        ],
        relationships: [
          {
            id: "rel_fn_create",
            type: "decomposition",
            sourceId: "fn_root",
            targetId: "fn_create",
          },
        ],
      },
    ],
    requirementModelTraceability: [
      {
        ruleId: "r1",
        target: {
          diagramKind: "function",
          elementId: "fn_create",
          elementKind: "function",
          label: "创建订单",
        },
      },
    ],
  });
  assert.equal(requirementResult.models[0]?.diagramKind, "function");

  const designResult = designDiagramModelsResultSchema.parse({
    models: [
      {
        diagramKind: "architecture",
        title: "总体架构图",
        summary: "包图形式的分层架构",
        notes: [],
        packages: [
          { id: "pkg_order", name: "订单包", componentIds: ["cmp_order_service"] },
        ],
        components: [
          {
            id: "cmp_order_service",
            name: "订单服务",
            packageId: "pkg_order",
            sourceRequirementIds: ["REQ-001"],
          },
        ],
        relationships: [
          {
            id: "rel_pkg_contains",
            type: "contains",
            sourceId: "pkg_order",
            targetId: "cmp_order_service",
          },
        ],
      },
      {
        diagramKind: "component",
        title: "组件关系图",
        summary: "组件与接口依赖",
        notes: [],
        components: [
          { id: "cmp_order", name: "订单组件", sourceClassIds: ["OrderService"] },
        ],
        interfaces: [
          { id: "if_order", name: "OrderApi", operationNames: ["createOrder"] },
        ],
        relationships: [
          {
            id: "rel_provide_order",
            type: "provided-interface",
            sourceId: "cmp_order",
            targetId: "if_order",
          },
        ],
      },
    ],
    designModelTraceability: [
      {
        source: {
          diagramKind: "architecture",
          elementId: "pkg_order",
          elementKind: "package",
          label: "订单包",
        },
        targets: [
          {
            diagramKind: "function",
            elementId: "fn_create",
            elementKind: "function",
            label: "创建订单",
          },
        ],
      },
      {
        source: {
          diagramKind: "component",
          elementId: "cmp_order",
          elementKind: "component",
          label: "订单组件",
        },
        targets: [
          {
            diagramKind: "class",
            elementId: "OrderService",
            elementKind: "class",
            label: "OrderService",
          },
        ],
      },
    ],
  });

  assert.deepEqual(
    designResult.models.map((model) => model.diagramKind),
    ["architecture", "component"],
  );
});

test("contracts require element-level traceability for generated model results", () => {
  assert.throws(() =>
    diagramModelsResultSchema.parse({
      models: [],
    }),
  );
  const requirementModelsWithTrace = diagramModelsResultSchema.parse({
    models: [],
    requirementModelTraceability: [
      {
        ruleId: "r1",
        target: {
          diagramKind: "class",
          elementId: "domain-user",
          elementKind: "class",
          label: "UserDomain",
        },
      },
    ],
  });
  assert.equal(
    requirementModelsWithTrace.requirementModelTraceability[0]?.target.elementId,
    "domain-user",
  );

  assert.throws(() =>
    designDiagramModelsResultSchema.parse({
      models: [],
    }),
  );
  const designModelsWithTrace = designDiagramModelsResultSchema.parse({
    models: [],
    designModelTraceability: [
      {
        source: {
          diagramKind: "class",
          elementId: "class-user-auth",
          elementKind: "class",
          label: "Class_UserAuth",
        },
        targets: [
          {
            diagramKind: "class",
            elementId: "domain-user",
            elementKind: "class",
            label: "UserDomain",
          },
        ],
        mappingSource: "derived-from-endpoints",
        rationale: "由关系两端设计元素的需求映射合并推导",
      },
    ],
  });
  assert.equal(
    designModelsWithTrace.designModelTraceability[0]?.targets[0]?.label,
    "UserDomain",
  );
  assert.equal(
    designModelsWithTrace.designModelTraceability[0]?.mappingSource,
    "derived-from-endpoints",
  );
});

test("contracts mark auto-filled design traceability as pending review", () => {
  const designModelsWithPendingTrace = designDiagramModelsResultSchema.parse({
    models: [],
    designModelTraceability: [
      {
        source: {
          diagramKind: "class",
          elementId: "class-loan-service",
          elementKind: "class",
          label: "LoanService",
        },
        targets: [
          {
            diagramKind: "usecase",
            elementId: "uc_borrow_book",
            elementKind: "usecase",
            label: "借书",
          },
        ],
        mappingSource: "auto-filled-pending-review",
        reviewStatus: "pending",
        confidence: "low",
        rationale: "LLM 修复后仍缺少该设计元素映射，系统自动补齐。",
      },
    ],
  });

  assert.equal(
    designModelsWithPendingTrace.designModelTraceability[0]?.mappingSource,
    "auto-filled-pending-review",
  );
  assert.equal(
    designModelsWithPendingTrace.designModelTraceability[0]?.reviewStatus,
    "pending",
  );
  assert.equal(
    designModelsWithPendingTrace.designModelTraceability[0]?.confidence,
    "low",
  );
});

test("contracts accept use-case scoped sequence models and upstream design refs", () => {
  const parsed = designDiagramModelsResultSchema.parse({
    models: [
      {
        diagramKind: "sequence",
        modelId: "sequence:uc_submit",
        sourceUseCaseId: "uc_submit",
        sourceUseCaseName: "提交需求",
        title: "提交需求顺序图",
        summary: "单个用例的对象交互流程",
        notes: [],
        participants: [
          { id: "p_user", name: "用户", participantType: "actor" },
          { id: "p_system", name: "系统", participantType: "control" },
        ],
        messages: [
          {
            id: "m_submit",
            type: "sync",
            sourceId: "p_user",
            targetId: "p_system",
            name: "submitRequirement",
            parameters: [],
          },
        ],
        fragments: [],
      },
    ],
    designModelTraceability: [
      {
        source: {
          modelId: "sequence:uc_submit",
          diagramKind: "sequence",
          elementId: "m_submit",
          elementKind: "message",
          label: "submitRequirement",
        },
        targets: [
          {
            diagramKind: "usecase",
            elementId: "uc_submit",
            elementKind: "usecase",
            label: "提交需求",
          },
        ],
        upstreamDesignRefs: [
          {
            modelId: "sequence:uc_submit",
            diagramKind: "sequence",
            elementId: "m_submit",
            elementKind: "message",
            label: "submitRequirement",
          },
        ],
      },
    ],
  });

  assert.equal(parsed.models[0]?.modelId, "sequence:uc_submit");
  assert.equal(
    parsed.models[0]?.diagramKind === "sequence"
      ? parsed.models[0].sourceUseCaseId
      : "",
    "uc_submit",
  );
  assert.equal(
    parsed.designModelTraceability[0]?.upstreamDesignRefs?.[0]?.modelId,
    "sequence:uc_submit",
  );
});

test("contracts reject invalid stage payloads", () => {
  assert.throws(() => {
    requirementRulesResultSchema.parse({
      rules: [
        {
          id: "",
          category: "未知分类",
          text: "",
          relatedDiagrams: [],
        },
      ],
    });
  });
});

test("contracts accept optional document export style settings", () => {
  const style = documentStyleSettingsSchema.parse({
    includeTableOfContents: true,
    autoNumberHeadings: true,
    heading1: {
      eastAsiaFont: "SimHei",
      asciiFont: "Times New Roman",
      sizePt: 16,
      bold: true,
      lineSpacing: { type: "multiple", value: 1.73 },
      spacingBeforePt: 13,
      spacingAfterPt: 13,
    },
    body: {
      eastAsiaFont: "SimSun",
      asciiFont: "Times New Roman",
      sizePt: 10.5,
      lineSpacing: { type: "single", value: 1 },
      firstLineIndentChars: 2,
    },
  });

  assert.equal(style.presetName, "courseDesign");
  assert.equal(style.heading1?.sizePt, 16);

  const request = startDocumentRunRequestSchema.parse({
    documentKind: "requirementsSpec",
    requirementText: "生成需求说明书。",
    providerSettings: {
      providerConfigId: "provider-config-1",
      model: "gpt-5.5",
    },
    documentStyle: style,
  });

  assert.equal(request.documentStyle?.includeTableOfContents, true);
  assert.throws(() =>
    documentStyleSettingsSchema.parse({
      body: { sizePt: 0 },
    }),
  );
});

test("contracts accept managed provider references for project runs", () => {
  const parsed = startRunRequestSchema.parse({
    projectId: "project-managed-provider",
    requirementText: "生成课程项目需求模型",
    selectedDiagrams: ["usecase"],
    providerSettings: {
      providerConfigId: "provider-config-1",
      model: "gpt-5.5",
    },
  });

  assert.equal(parsed.providerSettings.model, "gpt-5.5");
  assert.equal("providerConfigId" in parsed.providerSettings, true);
});

test("contracts describe generated document library and editor config", () => {
  const item = {
    id: "doc-1",
    workspaceId: "workspace-1",
    projectId: "project-1",
    createdByUserId: "user-1",
    documentKind: "requirementsSpec",
    title: "需求规格说明书",
    fileName: "需求规格说明书.docx",
    mimeType:
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    byteLength: 1024,
    version: 1,
    sourceRunId: "run-1",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const list = documentLibraryListResponseSchema.parse({
    documents: [item],
  });
  assert.equal(list.documents[0]?.id, "doc-1");
  assert.equal(list.documents[0]?.projectId, "project-1");

  const editorConfig = onlyOfficeEditorConfigResponseSchema.parse({
    document: item,
    documentServerUrl: "http://127.0.0.1:8080",
    config: {
      documentType: "word",
      document: {
        fileType: "docx",
        key: "doc-1-v1",
        title: "需求规格说明书.docx",
        url: "http://127.0.0.1:4001/api/documents/doc-1/file",
      },
    },
  });
  assert.equal(editorConfig.config.documentType, "word");

  const snapshot = documentRunSnapshotSchema.parse({
    runId: "run-1",
    documentKind: "requirementsSpec",
    requirementText: "生成需求说明书。",
    documentId: "doc-1",
    fileName: "需求规格说明书.docx",
    mimeType: item.mimeType,
    byteLength: 1024,
    missingArtifacts: [],
    currentStage: "render_document_file",
    status: "completed",
    error: null,
  });
  assert.equal(snapshot.documentId, "doc-1");
});
