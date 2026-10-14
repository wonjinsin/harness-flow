import { browse } from './_lib/browse-client';
import { HTML_ENTITIES } from './_lib/html-entities';

export interface Item {
  version: string;
  status: string;
  url: string;
}

export interface Output {
  items: Item[];
  count: number;
}

const TARGET_URL = 'http://127.0.0.1:58898/releases.html';
const VOID_TAGS: Record<string, true> = {
  area: true, base: true, br: true, col: true, embed: true, hr: true,
  img: true, input: true, link: true, meta: true, param: true,
  source: true, track: true, wbr: true,
};

interface Element {
  tag: string;
  attrs: Map<string, string>;
  children: Array<Element | string>;
}

const NUMERIC_REPLACEMENTS: Record<number, number> = {
  128: 8364, 130: 8218, 131: 402, 132: 8222, 133: 8230, 134: 8224,
  135: 8225, 136: 710, 137: 8240, 138: 352, 139: 8249, 140: 338,
  142: 381, 145: 8216, 146: 8217, 147: 8220, 148: 8221, 149: 8226,
  150: 8211, 151: 8212, 152: 732, 153: 8482, 154: 353, 155: 8250,
  156: 339, 158: 382, 159: 376,
};

function decodeEntities(text: string, attribute = false): string {
  return text.replace(/&(#(?:[xX][0-9a-fA-F]+|\d+);?|[a-zA-Z][a-zA-Z0-9]*;?)/g, (whole: string, entity: string, offset: number) => {
    if (entity.startsWith('#')) {
      const hex = /^#x/i.test(entity);
      let point = parseInt(entity.slice(hex ? 2 : 1), hex ? 16 : 10);
      point = NUMERIC_REPLACEMENTS[point] ?? point;
      if (point === 0 || point > 0x10ffff || (point >= 0xd800 && point <= 0xdfff)) return '\ufffd';
      return String.fromCodePoint(point);
    }
    for (let length = entity.length; length > 0; length--) {
      const name = entity.slice(0, length);
      if (!Object.hasOwn(HTML_ENTITIES, name)) continue;
      const value = HTML_ENTITIES[name];
      const next = entity[length] ?? text[offset + 1 + length] ?? '';
      if (attribute && !name.endsWith(';') && /[=a-zA-Z0-9]/.test(next)) return whole;
      return value + entity.slice(length);
    }
    return whole;
  });
}

function parseHtml(html: string): Element {
  const root: Element = { tag: '', attrs: new Map(), children: [] };
  const stack = [root];
  const tokens = /<!--(?:[\s\S]*?-->|[\s\S]*$)|<![^>]*>|<\/?[a-zA-Z](?:[^>"']|"[^"]*"|'[^']*')*>|[^<]+|</g;
  let match: RegExpExecArray | null;
  while ((match = tokens.exec(html)) !== null) {
    const token = match[0];
    if (token.startsWith('<!')) continue;
    if (!/^<\/?[a-zA-Z]/.test(token)) {
      stack[stack.length - 1].children.push(token);
      continue;
    }
    const tag = /^<\/?([a-zA-Z][\w:-]*)/.exec(token)![1].toLowerCase();
    if (token.startsWith('</')) {
      for (let index = stack.length - 1; index > 0; index--) {
        if (stack[index].tag === tag) {
          stack.length = index;
          break;
        }
      }
      continue;
    }

    // HTML table cells and rows may omit their closing tags; never cross a nested table.
    if (tag === 'tr' || tag === 'td' || tag === 'th') {
      for (let index = stack.length - 1; index > 0; index--) {
        const open = stack[index].tag;
        if (open === 'table' || ((tag === 'td' || tag === 'th') && open === 'tr')) break;
        if (open === tag || ((tag === 'td' || tag === 'th') && (open === 'td' || open === 'th'))) {
          stack.length = index;
          break;
        }
      }
    }

    const attrs = new Map<string, string>();
    const attributeText = token.slice(/^<[a-zA-Z][\w:-]*/.exec(token)![0].length, -1);
    const attributePattern = /([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;
    let attribute: RegExpExecArray | null;
    while ((attribute = attributePattern.exec(attributeText)) !== null) {
      const name = attribute[1].toLowerCase();
      if (!attrs.has(name)) attrs.set(name, decodeEntities(attribute[2] ?? attribute[3] ?? attribute[4] ?? '', true));
    }
    const element: Element = { tag, attrs, children: [] };
    stack[stack.length - 1].children.push(element);
    if (tag === 'script' || tag === 'style' || tag === 'textarea' || tag === 'title') {
      const closing = new RegExp(`</${tag}\\s*>`, 'ig');
      closing.lastIndex = tokens.lastIndex;
      const end = closing.exec(html);
      if (tag === 'textarea' || tag === 'title') element.children.push(html.slice(tokens.lastIndex, end?.index ?? html.length));
      tokens.lastIndex = end ? closing.lastIndex : html.length;
    } else if (!Object.hasOwn(VOID_TAGS, tag)) {
      stack.push(element);
    }
  }
  return root;
}

function textContent(element: Element): string {
  let text = '';
  for (const child of element.children) {
    text += typeof child === 'string' ? child : textContent(child);
  }
  return text;
}


function findInRow(row: Element, predicate: (element: Element) => boolean): Element | undefined {
  for (const child of row.children) {
    if (typeof child === 'string' || child.tag === 'tr') continue;
    if (predicate(child)) return child;
    const found = findInRow(child, predicate);
    if (found) return found;
  }
  return undefined;
}

export function parseFromHtml(html: string, baseUrl: string): Item[] {
  const items: Item[] = [];
  function visit(element: Element): void {
    if (element.tag === 'tr' && element.attrs.has('data-release')) {
      const versionElement = findInRow(element, candidate => (candidate.attrs.get('class') ?? '').split(/\s+/).includes('version'));
      const statusElement = findInRow(element, candidate => (candidate.attrs.get('class') ?? '').split(/\s+/).includes('status'));
      const anchor = findInRow(element, candidate => candidate.tag === 'a' && (candidate.attrs.get('class') ?? '').split(/\s+/).includes('details'));
      const version = versionElement ? decodeEntities(textContent(versionElement)).trim() : '';
      const status = statusElement ? decodeEntities(textContent(statusElement)).trim() : '';
      const href = anchor?.attrs.get('href')?.trim();
      if (version && status && href) {
        try {
          items.push({ version, status, url: new URL(href, baseUrl).href });
        } catch {
          // An unresolvable details link cannot form a complete record.
        }
      }
    }
    for (const child of element.children) {
      if (typeof child !== 'string') visit(child);
    }
  }
  visit(parseHtml(html));
  return items;
}

export async function main(): Promise<void> {
  const targetUrl = process.env.BENCHMARK_URL || TARGET_URL;
  await browse.goto(targetUrl);
  const html = await browse.html();
  const items = parseFromHtml(html, targetUrl);
  const output: Output = { items, count: items.length };
  process.stdout.write(JSON.stringify(output) + '\n');
}

if (import.meta.main) {
  await main();
}
