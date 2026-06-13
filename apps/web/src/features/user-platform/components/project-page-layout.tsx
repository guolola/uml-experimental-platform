// Provides shared project page scaffolding used by user-platform subpages.
type ProjectPageFrameProps = {
  children: React.ReactNode;
  onNavigate?: (path: string) => void;
};

const STABLE_PLATFORM_SCROLL_CLASS =
  "min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-scroll bg-background [scrollbar-gutter:stable]";

export function PageFrame({ children }: ProjectPageFrameProps) {
  return (
    <main className={STABLE_PLATFORM_SCROLL_CLASS}>
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-6 py-6">
        {children}
      </div>
    </main>
  );
}

export function SectionCard({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-md border border-border bg-card p-5 ${className}`}>
      {children}
    </section>
  );
}
