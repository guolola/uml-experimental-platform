// Renders the Figma-inspired system notice timeline and top-bar trigger.
import { useEffect, useMemo, useState } from "react";
import type { SystemNoticeDto, SystemNoticeType } from "@uml-platform/contracts";
import { Bell, CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "../../../shared/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "../../../shared/ui/dialog";
import { Badge } from "../../../shared/ui/badge";
import { cn } from "../../../shared/ui/utils";
import { systemNoticeApi } from "../system-notice-api";

const NOTICE_TYPE_DOT_CLASS: Record<SystemNoticeType, string> = {
  model_update: "bg-[#2b23ad]",
  feature_update: "bg-[#2b23ad]",
  important: "bg-[#ba1a1a]",
  maintenance: "bg-warning",
};

const NOTICE_TYPE_LABEL: Record<SystemNoticeType, string> = {
  model_update: "模型",
  feature_update: "功能",
  important: "重要",
  maintenance: "维护",
};

function formatDateTimeParts(value: string | null | undefined) {
  if (!value) return { date: "未发布", time: "" };
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return { date: value, time: "" };
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const time = date.toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  return { date: `${year}/${month}/${day}`, time };
}

function formatRelativeTime(value: string | null | undefined) {
  if (!value) return "未发布";
  const time = Date.parse(value);
  if (!Number.isFinite(time)) return "已发布";
  const diffMs = Math.max(0, Date.now() - time);
  const dayMs = 24 * 60 * 60 * 1000;
  const days = Math.floor(diffMs / dayMs);
  if (days <= 0) return "今天";
  if (days < 7) return `${days} 天前`;
  if (days < 30) return `${Math.floor(days / 7)} 周前`;
  return `${Math.floor(days / 30)} 个月前`;
}

function SystemNoticeTimelineItem({
  notice,
  isLast,
}: {
  notice: SystemNoticeDto;
  isLast: boolean;
}) {
  const published = notice.publishedAt ?? notice.createdAt;
  const dateParts = formatDateTimeParts(published);
  const listItems = notice.contentBlocks.filter((block) => block.kind === "list_item");
  const paragraphs = notice.contentBlocks.filter((block) => block.kind === "paragraph");

  return (
    <article className="grid min-w-0 grid-cols-[96px_minmax(0,1fr)] gap-6 px-4 py-4">
      <div className="relative flex min-h-14 flex-col items-end pr-[25px] text-right">
        <div className="font-mono text-xs font-medium leading-4 text-[#464554] dark:text-muted-foreground">
          {formatRelativeTime(published)}
        </div>
        <div className="mt-1 text-sm leading-5 text-[#5b5e69] dark:text-muted-foreground">
          <div>{dateParts.date}</div>
          {dateParts.time && <div>{dateParts.time}</div>}
        </div>
        {!isLast && (
          <span className="absolute bottom-0 right-[-1px] top-0 w-px bg-[#c7c4d6]" />
        )}
        <span
          data-testid="system-notice-dot"
          data-notice-type={notice.type}
          className={cn(
            "absolute right-[-7px] top-[5px] size-[14px] rounded-full border-2 border-white shadow-sm",
            NOTICE_TYPE_DOT_CLASS[notice.type],
          )}
        />
      </div>
      <div className="min-w-0 pb-2">
        <h3 className="flex min-w-0 items-center gap-2 text-base font-medium leading-6 text-[#0b1c30] dark:text-foreground">
          {notice.icon && <span className="shrink-0">{notice.icon}</span>}
          <span className="min-w-0 break-words">{notice.title}</span>
          {notice.unread && (
            <Badge variant="secondary" className="shrink-0 text-[10px]">
              未读
            </Badge>
          )}
        </h3>
        {notice.contentBlocks.length > 0 && (
          <div className="mt-3 grid gap-3 rounded-md border border-[#c7c4d6]/30 bg-[#f8f9ff] px-4 py-4 text-sm leading-[22px] text-[#464554] dark:border-border dark:bg-muted dark:text-muted-foreground">
            {paragraphs.map((block, index) => (
              <p key={`paragraph-${index}`} className="break-words">
                {block.text}
              </p>
            ))}
            {listItems.length > 0 && (
              <ul className="grid gap-2">
                {listItems.map((block, index) => (
                  <li key={`list-${index}`} className="flex min-w-0 gap-2">
                    <span className="mt-0.5 font-mono text-primary">{index + 1}</span>
                    <span className="min-w-0 break-words">{block.text}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </article>
  );
}

function SystemNoticeTimeline({ notices }: { notices: SystemNoticeDto[] }) {
  if (notices.length === 0) {
    return (
      <div className="flex min-h-64 items-center justify-center px-6 text-sm text-muted-foreground">
        暂无系统通知。
      </div>
    );
  }
  return (
    <div className="min-w-0 py-2">
      {notices.map((notice, index) => (
        <SystemNoticeTimelineItem
          key={notice.id}
          notice={notice}
          isLast={index === notices.length - 1}
        />
      ))}
    </div>
  );
}

export function SystemNoticeDialog({
  open,
  onOpenChange,
  notices,
  loading,
  error,
  onMarkRead,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  notices: SystemNoticeDto[];
  loading: boolean;
  error: string;
  onMarkRead: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="grid h-[min(928px,calc(100vh-4rem))] w-[896px] max-w-[calc(100%-2rem)] grid-rows-[auto_minmax(0,1fr)_auto] gap-0 overflow-hidden rounded-xl border-[#c7c4d6]/50 bg-white p-0 shadow-[0_8px_30px_rgba(0,0,0,0.12)] dark:bg-card"
        overlayClassName="bg-[#0b1c30]/40 backdrop-blur-[4px]"
      >
        <DialogHeader className="border-b border-[#c7c4d6]/30 bg-[#f8f9ff]/80 px-6 py-4 text-left backdrop-blur-md dark:bg-card/80">
          <div className="flex items-center gap-3">
            <Badge className="rounded-full border-[#c7c4d6]/30 bg-[#eff4ff] px-3 py-1 text-[11px] tracking-[0.08em] text-[#2b23ad] hover:bg-[#eff4ff]">
              公告
            </Badge>
            <DialogTitle className="text-xl leading-7 text-[#0b1c30] dark:text-foreground">
              系统通知
            </DialogTitle>
          </div>
          <DialogDescription className="sr-only">
            系统通知时间轴列表
          </DialogDescription>
        </DialogHeader>
        <div className="min-h-0 overflow-y-auto px-2 pr-6">
          {loading ? (
            <div className="flex min-h-64 items-center justify-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              正在加载系统通知...
            </div>
          ) : error ? (
            <div className="flex min-h-64 items-center justify-center px-6 text-sm text-destructive">
              {error}
            </div>
          ) : (
            <SystemNoticeTimeline notices={notices} />
          )}
        </div>
        <div className="flex justify-center border-t border-[#c7c4d6]/30 bg-white/90 px-4 py-4 backdrop-blur-md dark:bg-card/90">
          <Button
            type="button"
            variant="outline"
            className="h-11 w-full max-w-md rounded-full border-[#2b23ad] text-[#2b23ad] hover:bg-[#eff4ff] hover:text-[#2b23ad]"
            onClick={onMarkRead}
            disabled={loading}
          >
            <CheckCircle2 className="size-4" />
            已阅览
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function SystemNoticeButton({
  className,
}: {
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [notices, setNotices] = useState<SystemNoticeDto[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const noticeIds = useMemo(() => notices.map((notice) => notice.id), [notices]);

  const refresh = async () => {
    setLoading(true);
    setError("");
    try {
      const response = await systemNoticeApi.listPublished();
      setNotices(response.notices);
      setUnreadCount(response.unreadCount);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "系统通知加载失败。");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  const openDialog = () => {
    setOpen(true);
    void refresh();
  };

  const markRead = async () => {
    try {
      const response = await systemNoticeApi.markRead(noticeIds);
      setNotices(response.notices);
      setUnreadCount(response.unreadCount);
      setOpen(false);
    } catch (readError) {
      setError(readError instanceof Error ? readError.message : "系统通知已阅览状态保存失败。");
    }
  };

  return (
    <>
      <div className="flex items-center gap-1">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className={cn(className, "relative")}
          onClick={openDialog}
          title="系统通知"
          aria-label={unreadCount > 0 ? `系统通知，${unreadCount} 条未读` : "系统通知"}
        >
          <Bell className="size-5" />
          {unreadCount > 0 && (
            <span className="absolute right-1.5 top-1.5 size-2 rounded-full bg-destructive" />
          )}
        </Button>
      </div>
      <SystemNoticeDialog
        open={open}
        onOpenChange={setOpen}
        notices={notices}
        loading={loading}
        error={error}
        onMarkRead={() => void markRead()}
      />
    </>
  );
}
