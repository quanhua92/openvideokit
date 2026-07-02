/**
 * Markdown — renders assistant content (and thinking) as GitHub-flavored
 * markdown. Styled for the small chat-bubble text size; no external typography
 * plugin needed.
 */

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export function Markdown({ children }: { children: string }) {
  return (
    <div className="text-xs leading-relaxed">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
          h1: ({ children }) => (
            <h1 className="mb-2 mt-1 text-sm font-bold">{children}</h1>
          ),
          h2: ({ children }) => (
            <h2 className="mb-2 mt-1 text-sm font-bold">{children}</h2>
          ),
          h3: ({ children }) => (
            <h3 className="mb-1.5 mt-1 text-xs font-bold">{children}</h3>
          ),
          ul: ({ children }) => (
            <ul className="mb-2 ml-4 list-disc space-y-0.5 last:mb-0">
              {children}
            </ul>
          ),
          ol: ({ children }) => (
            <ol className="mb-2 ml-4 list-decimal space-y-0.5 last:mb-0">
              {children}
            </ol>
          ),
          li: ({ children }) => <li>{children}</li>,
          strong: ({ children }) => (
            <strong className="font-semibold text-foreground">
              {children}
            </strong>
          ),
          em: ({ children }) => <em className="italic">{children}</em>,
          a: ({ children, href }) => (
            <a
              href={href}
              target="_blank"
              rel="noreferrer"
              className="text-primary underline underline-offset-2"
            >
              {children}
            </a>
          ),
          code: ({ className, children }) => {
            const isBlock = className?.includes("language-");
            if (isBlock) {
              return (
                <code className="block">
                  <pre className="my-1.5 overflow-x-auto rounded bg-muted/70 p-1.5 font-mono text-[10px] leading-snug">
                    {children}
                  </pre>
                </code>
              );
            }
            return (
              <code className="rounded bg-muted/70 px-1 py-0.5 font-mono text-[10px]">
                {children}
              </code>
            );
          },
          pre: ({ children }) => <>{children}</>,
          blockquote: ({ children }) => (
            <blockquote className="my-1.5 border-l-2 border-border pl-2 text-muted-foreground">
              {children}
            </blockquote>
          ),
          hr: () => <hr className="my-2 border-border" />,
          table: ({ children }) => (
            <table className="my-1.5 w-full border-collapse text-[10px]">
              {children}
            </table>
          ),
          th: ({ children }) => (
            <th className="border border-border bg-muted/50 px-1.5 py-0.5 text-left font-semibold">
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td className="border border-border px-1.5 py-0.5">{children}</td>
          ),
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
