// A small Markdown renderer for build reports: headings, lists, tables, bold/italic/code.
// It returns React elements, so no HTML strings are ever injected.
import { Fragment } from 'react';
import { Cite } from './citations.jsx';

const UNIT = '(?:slides?|pages?|pp?\\.)';
const RANGE = `${UNIT}\\s*\\d+(?:\\s*(?:-|–|to)\\s*\\d+)?`;
const CITE_SRC = `\\[([^\\[\\]\\n]{2,160}?),\\s*(${RANGE})\\]|\\(([^()\\n]{2,160}?),\\s*(${RANGE})\\)|\\b(${RANGE})|\\[([^\\[\\]\\n]{2,160})\\]`;

function cites(text, keyBase, near) {
  const out = [];
  const re = new RegExp(CITE_SRC, 'gi');
  let last = 0, m, i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const k = `${keyBase}c${i++}`;
    if (m[1]) out.push(<Cite key={k} raw={m[0]} file={m[1]} range={m[2]} wrap="[]" near={near} />);
    else if (m[3]) out.push(<Cite key={k} raw={m[0]} file={m[3]} range={m[4]} wrap="()" near={near} />);
    else if(m[6]) out.push(<Cite key={k} raw={m[0]} file={m[6]} near={near} />); else out.push(<Cite key={k} raw={m[0]} range={m[5]} near={near} />);
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

// Inline Markdown (bold, italic, code) plus clickable citations to course files.
export function inline(text, keyBase, near) {
  text = String(text ?? '');
  const ctx = near ?? text;
  const out = [];
  const re = /(\*\*[^*]+\*\*|__[^_]+__|`[^`]+`|\*[^*\s][^*]*\*|_[^_\s][^_]*_)/g;
  let last = 0, m, i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(...cites(text.slice(last, m.index), `${keyBase}-${i}t`, ctx));
    const tok = m[0];
    const k = `${keyBase}-${i++}`;
    if (tok.startsWith('**') || tok.startsWith('__')) out.push(<strong key={k}>{inline(tok.slice(2, -2), k, ctx)}</strong>);
    else if (tok.startsWith('`')) out.push(<code key={k}>{tok.slice(1, -1)}</code>);
    else out.push(<em key={k}>{inline(tok.slice(1, -1), k, ctx)}</em>);
    last = m.index + tok.length;
  }
  if (last < text.length) out.push(...cites(text.slice(last), `${keyBase}-end`, ctx));
  return out;
}

const cells = (line) => line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());

export function Markdown({ text }) {
  const lines = String(text || '').replace(/\r/g, '').split('\n');
  const blocks = [];
  let i = 0, k = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }
    const h = line.match(/^(#{1,6})\s+(.*)$/);
    if (h) { const Tag = h[1].length <= 3 ? 'h3' : 'h4'; blocks.push(<Tag key={k++}>{inline(h[2], k)}</Tag>); i++; continue; }
    if (/^\s*\|/.test(line)) {
      const rows = [];
      while (i < lines.length && /^\s*\|/.test(lines[i])) { rows.push(lines[i]); i++; }
      const body = rows.filter((r) => !/^\s*\|?\s*:?-{2,}/.test(r));
      const [head, ...rest] = body;
      blocks.push(
        <div className="tablewrap" key={k++}><table className="t">
          <thead><tr>{cells(head).map((c, j) => <th key={j}>{inline(c, `${k}h${j}`)}</th>)}</tr></thead>
          <tbody>{rest.map((r, ri) => <tr key={ri}>{cells(r).map((c, j) => <td key={j}>{inline(c, `${k}r${ri}c${j}`)}</td>)}</tr>)}</tbody>
        </table></div>,
      );
      continue;
    }
    if (/^\s*([-*+]|\d+[.)])\s+/.test(line)) {
      const ordered = /^\s*\d+[.)]\s+/.test(line);
      const items = [];
      while (i < lines.length && /^\s*([-*+]|\d+[.)])\s+/.test(lines[i])) { items.push(lines[i].replace(/^\s*([-*+]|\d+[.)])\s+/, '')); i++; }
      const List = ordered ? 'ol' : 'ul';
      blocks.push(<List key={k++}>{items.map((it, j) => <li key={j}>{inline(it, `${k}l${j}`)}</li>)}</List>);
      continue;
    }
    const para = [];
    while (i < lines.length && lines[i].trim() && !/^(#{1,6})\s|^\s*\||^\s*([-*+]|\d+[.)])\s+/.test(lines[i])) { para.push(lines[i].trim()); i++; }
    blocks.push(<p key={k++}>{inline(para.join(' '), k)}</p>);
  }
  return <div className="md">{blocks.map((b, j) => <Fragment key={j}>{b}</Fragment>)}</div>;
}
