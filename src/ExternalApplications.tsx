import {
  ArrowRight,
  BookOpen,
  FileText,
  Landmark,
  MessageCircle,
  NotebookPen,
  Star,
} from "lucide-react";
import { applicationLinks } from "./application-links.mjs";

const icons: Record<string, typeof FileText> = {
  report: FileText,
  recipe: BookOpen,
  management: Landmark,
  chat: MessageCircle,
  journal: NotebookPen,
  gourmet: Star,
};

export function ExternalApplications() {
  return (
    <nav
      className="external-applications"
      aria-labelledby="external-applications-title"
    >
      <h2 id="external-applications-title">ほかのアプリを開く</h2>
      <p>ボタンを押すと各アプリへ移動します。</p>
      <div className="external-application-grid">
        {applicationLinks.map(({ id, name, note, icon, href }) => {
          const Icon = icons[icon];
          return (
            <a
              className="application-option external-application"
              key={id}
              href={href}
            >
              <Icon size={25} aria-hidden="true" />
              <span>
                <strong>{name}</strong>
                <small>{note}</small>
              </span>
              <ArrowRight size={18} aria-hidden="true" />
            </a>
          );
        })}
      </div>
    </nav>
  );
}
