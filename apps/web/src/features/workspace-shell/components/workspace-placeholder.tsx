export function Workspace({ title }: { title: string }) {
  return (
    <div className="flex h-full flex-col">
      <div className="m-3 flex flex-1 items-center justify-center border border-dashed border-border bg-muted/30 text-sm text-muted-foreground">
        在左侧选择一项以开始编辑「{title}」
      </div>
    </div>
  );
}
