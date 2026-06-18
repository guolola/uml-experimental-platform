// Renders the requirement template assistant rail for the authoring page.
import {
  Activity,
  Bot,
  CircleCheck,
  MessageCircle,
  SendHorizontal,
  ShoppingCart,
} from "lucide-react";
import { Input } from "../../../shared/ui/input";
import { cn } from "../../../shared/ui/utils";
import { mobileTouchTargetClass } from "../../workspace-shell/components/mobile-density";

const REQUIREMENT_TEMPLATE_CARDS = [
  {
    title: "电商系统",
    english: "E-commerce System",
    description: "完善的购物流程与库存规则。",
    templateText:
      "我们需要开发一个电商系统。用户可以注册和登录账号，浏览商品、搜索商品、查看商品详情，将商品加入购物车并提交订单。系统需要支持订单支付、订单状态查询、收货地址管理和售后退款申请。管理员可以维护商品信息、管理库存、处理订单和查看销售统计。系统应保证未登录用户只能浏览公开商品，支付成功后才生成有效订单，并在库存不足时阻止下单。",
    Icon: ShoppingCart,
  },
  {
    title: "社交应用",
    english: "Social App",
    description: "用户交互与即时通讯逻辑。",
    templateText:
      "我们需要开发一个社交应用。用户可以注册账号、完善个人资料、发布动态、上传图片、关注其他用户并查看关注流。系统需要支持点赞、评论、私信聊天、消息通知和内容举报。管理员可以审核举报内容、管理违规用户和维护社区规则。系统应保证用户只能修改自己的资料和动态，私信只允许在合法用户之间发送，违规内容需要进入审核流程。",
    Icon: MessageCircle,
  },
  {
    title: "健身追踪",
    english: "Fitness Tracker",
    description: "健康数据可视化与目标追踪。",
    templateText:
      "我们需要开发一个健身追踪系统。用户可以记录每日运动、步数、体重、饮食和睡眠数据，设置健身目标并查看进度趋势。系统需要支持训练计划推荐、运动提醒、历史数据统计和健康报告生成。用户可以绑定可穿戴设备同步数据，也可以手动补录记录。系统应保证健康数据仅本人可见，设备同步失败时给出提示，并在用户达到阶段目标时发送通知。",
    Icon: Activity,
  },
] as const;

interface RequirementAssistantPanelProps {
  canEditRequirements: boolean;
  editBlockedReason: string;
  onApplyTemplate: (templateText: string) => void;
}

export function RequirementAssistantPanel({
  canEditRequirements,
  editBlockedReason,
  onApplyTemplate,
}: RequirementAssistantPanelProps) {
  return (
    <aside className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-border bg-card shadow-sm">
      <div className="flex items-center gap-2 border-b border-border bg-muted/40 px-4 py-3">
        <Bot className="size-4 text-primary" />
        <h2 className="text-sm font-semibold text-foreground">AI 需求助手</h2>
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-auto p-3">
        <div className="rounded-bl-lg rounded-br-lg rounded-tr-lg bg-muted px-3 py-2 text-xs leading-5 text-foreground">
          你好！我是您的需求分析助手。我可以帮助您细化功能点、完善业务规则或根据您的想法提供专业建议。请问有什么可以帮您的？
        </div>
        <div
          data-workspace-density="assistant-template-grid"
          className="grid grid-cols-2 gap-2 md:grid-cols-1"
        >
          {REQUIREMENT_TEMPLATE_CARDS.map(
            ({ title, english, description, templateText, Icon }) => (
              <button
                key={title}
                type="button"
                onClick={() => onApplyTemplate(templateText)}
                disabled={!canEditRequirements}
                title={!canEditRequirements ? editBlockedReason : undefined}
                className={cn(
                  "group flex h-full min-h-[118px] min-w-0 flex-col rounded-lg border border-border bg-background p-2 text-left shadow-sm transition-all duration-200 hover:border-primary/40 hover:bg-accent/40 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:min-h-0",
                  mobileTouchTargetClass,
                )}
              >
                <span className="flex min-w-0 items-center gap-2">
                  <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary transition-colors group-hover:bg-primary/15">
                    <Icon className="size-3.5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-semibold text-foreground">
                      {title}
                    </span>
                    <span className="block truncate font-mono text-[9px] text-muted-foreground">
                      {english}
                    </span>
                  </span>
                </span>
                <span className="mt-2 line-clamp-2 text-[11px] leading-4 text-muted-foreground">
                  {description}
                </span>
                <span className="mt-auto inline-flex items-center gap-1 pt-2 text-[11px] font-medium text-primary">
                  <CircleCheck className="size-3" />
                  应用模板
                </span>
              </button>
            ),
          )}
        </div>
      </div>
      <div className="border-t border-border p-3">
        <div className="relative">
          <Input
            value=""
            readOnly
            disabled
            placeholder="输入消息..."
            className="h-9 rounded-full bg-muted pr-9 text-xs"
            aria-label="AI 需求助手输入消息"
          />
          <button
            type="button"
            disabled
            className="absolute right-1.5 top-1/2 inline-flex size-6 -translate-y-1/2 items-center justify-center rounded-full text-primary opacity-70"
            aria-label="发送消息"
          >
            <SendHorizontal className="size-3.5" />
          </button>
        </div>
      </div>
    </aside>
  );
}
