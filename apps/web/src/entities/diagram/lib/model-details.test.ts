// Verifies diagram detail normalization used by model overview and focus panels.
import { describe, expect, it } from "vitest";
import { buildDiagramDetailModel } from "./model-details";

describe("buildDiagramDetailModel", () => {
  it("exposes class attributes as detailed focus sections", () => {
    const details = buildDiagramDetailModel({
      diagramKind: "class",
      title: "领域概念模型",
      summary: "订单领域对象",
      notes: [],
      classes: [
        {
          id: "order",
          name: "Order",
          chineseName: "订单",
          englishName: "Order",
          classKind: "entity",
          attributes: [
            {
              name: "amount",
              chineseName: "订单金额",
              englishName: "amount",
              type: "decimal",
              visibility: "private",
              constraints: [],
            },
            {
              name: "createdAt",
              type: "DateTime",
              visibility: "private",
              constraints: [],
            },
          ],
          operations: [],
        },
      ],
      interfaces: [],
      enums: [],
      relationships: [],
    });

    const order = details.items.find((item) => item.id === "order");
    expect(order?.fields).toEqual(
      expect.arrayContaining([
        { label: "中文名称", value: "订单" },
        { label: "英文名称", value: "Order" },
        { label: "类型", value: "entity" },
        { label: "约束", value: "类别:entity" },
      ]),
    );
    expect(order?.fields.find((field) => field.label === "约束")?.value).not.toContain(
      "属性:2个",
    );
    expect(order?.sections?.[0]).toMatchObject({
      id: "order:attributes",
      title: "属性明细",
      summary: "2个",
    });
    expect(order?.sections?.[0]?.items[0]?.fields).toEqual([
      { label: "名称", value: "amount" },
      { label: "中文名称", value: "订单金额" },
      { label: "类型", value: "decimal" },
    ]);
    expect(order?.sections?.[0]?.items[1]?.fields).toEqual([
      { label: "名称", value: "createdAt" },
      { label: "中文名称", value: "未标明" },
      { label: "类型", value: "DateTime" },
    ]);
  });
});
