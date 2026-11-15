import React from "react";

function renderInline(text: string): React.ReactNode[] {
  // Matches **bold**, *italic*, `code`, [label](https://url), or bare https://url
  const tokenRegex =
    /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`|\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)|(https?:\/\/[^\s]+))/g;

  const nodes: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let key = 0;

  while ((match = tokenRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index));
    }

    const token = match[0];
    if (token.startsWith("**") && token.endsWith("**")) {
      nodes.push(
        <strong key={key++} className="font-bold text-[#EAE6DF]">
          {token.slice(2, -2)}
        </strong>
      );
    } else if (token.startsWith("*") && token.endsWith("*")) {
      nodes.push(
        <em key={key++} className="italic text-[#EAE6DF]/95">
          {token.slice(1, -1)}
        </em>
      );
    } else if (token.startsWith("`") && token.endsWith("`")) {
      nodes.push(
        <code
          key={key++}
          className="border border-[#33FF00]/40 bg-black px-1 py-0.5 text-[11px] text-[#33FF00]"
        >
          {token.slice(1, -1)}
        </code>
      );
    } else if (match[2] && match[3]) {
      nodes.push(
        <a
          key={key++}
          href={match[3]}
          target="_blank"
          rel="noopener noreferrer"
          className="underline text-[#33FF00] hover:text-[#EAE6DF]"
        >
          {match[2]}
        </a>
      );
    } else if (match[4]) {
      nodes.push(
        <a
          key={key++}
          href={match[4]}
          target="_blank"
          rel="noopener noreferrer"
          className="underline text-[#33FF00] hover:text-[#EAE6DF] break-all"
        >
          {match[4]}
        </a>
      );
    }

    lastIndex = tokenRegex.lastIndex;
  }

  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }

  return nodes;
}

export function MarkdownBody({ content }: { content: string }) {
  const lines = content.split("\n");
  const elements: React.ReactNode[] = [];
  let listBuffer: string[] = [];

  function flushList(keyPrefix: string) {
    if (listBuffer.length === 0) return;
    elements.push(
      <ul key={`${keyPrefix}-ul`} className="list-disc pl-5 space-y-0.5 text-xs text-[#EAE6DF]/90">
        {listBuffer.map((item, idx) => (
          <li key={idx}>{renderInline(item)}</li>
        ))}
      </ul>
    );
    listBuffer = [];
  }

  lines.forEach((rawLine, i) => {
    const line = rawLine.trimEnd();

    if (/^[-*]\s+/.test(line)) {
      listBuffer.push(line.replace(/^[-*]\s+/, ""));
      return;
    }
    flushList(`line-${i}`);

    if (!line.trim()) {
      elements.push(<div key={`sp-${i}`} className="h-1.5" />);
    } else if (line.startsWith("### ")) {
      elements.push(
        <h5 key={`h3-${i}`} className="text-xs font-bold uppercase text-[#33FF00]">
          {renderInline(line.slice(4))}
        </h5>
      );
    } else if (line.startsWith("## ") || line.startsWith("# ")) {
      const clean = line.replace(/^#{1,2}\s+/, "");
      elements.push(
        <h4
          key={`h2-${i}`}
          className="border-b border-[#EAE6DF]/25 pb-0.5 text-xs font-bold uppercase tracking-wider text-[#33FF00]"
        >
          {renderInline(clean)}
        </h4>
      );
    } else if (line.startsWith("> ")) {
      elements.push(
        <blockquote
          key={`bq-${i}`}
          className="border-l-2 border-[#D9381E] bg-black/50 pl-2.5 py-1 text-xs italic text-[#EAE6DF]/85"
        >
          {renderInline(line.slice(2))}
        </blockquote>
      );
    } else {
      elements.push(
        <p key={`p-${i}`} className="whitespace-pre-wrap break-words text-xs leading-relaxed text-[#EAE6DF]/90">
          {renderInline(line)}
        </p>
      );
    }
  });

  flushList("end");

  return <div className="space-y-1.5">{elements}</div>;
}
