// Composes the standalone project creation page around the shared create form.
import { ProjectCreateForm } from "./project-create-form";
import { PageFrame, SectionCard } from "./project-page-layout";

type Navigate = (path: string) => void;

export function ProjectNewPage({ onNavigate }: { onNavigate: Navigate }) {
  return (
    <PageFrame onNavigate={onNavigate}>
      <div>
        <h1>创建项目</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          项目名称、描述、可见性、课程/班级/team 和默认模型策略会提交到项目 API。
        </p>
      </div>
      <SectionCard>
        <ProjectCreateForm onNavigate={onNavigate} />
      </SectionCard>
    </PageFrame>
  );
}
