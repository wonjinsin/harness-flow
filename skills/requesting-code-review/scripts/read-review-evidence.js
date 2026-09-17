'use strict';

const { createHash } = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');

const DEFAULT_MAX_BYTES = 24000;
const bytes = (value) => Buffer.byteLength(JSON.stringify(value), 'utf8');

function validText(value, label, allowEmpty = true) {
  if (typeof value !== 'string' || (!allowEmpty && !value.length)) {
    throw new Error(`Invalid ${label} shape`);
  }
  if (Buffer.from(value, 'utf8').toString('utf8') !== value) {
    throw new Error(`Invalid UTF-8/Unicode in ${label}`);
  }
}

function validatePacket(packet, maxBytes) {
  if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0) throw new Error('maxBytes must be a positive safe integer');
  if (!packet || packet.schemaVersion !== 1) throw new Error('Unsupported packet schemaVersion');
  for (const sha of [packet.fromSha, packet.toSha]) {
    if (typeof sha !== 'string' || !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(sha)) throw new Error('Invalid pinned commit SHA');
  }
  if (!Array.isArray(packet.manifest) || !packet.manifest.length || !Array.isArray(packet.files) || packet.files.length !== packet.manifest.length) {
    throw new Error('Packet files must cover the non-empty manifest exactly');
  }
  if (new Set(packet.manifest).size !== packet.manifest.length) throw new Error('Duplicate manifest paths');
  validText(packet.log, 'log');
  packet.files.forEach((file, index) => {
    validText(packet.manifest[index], 'manifest path', false);
    if (!file || file.path !== packet.manifest[index]) throw new Error('Packet files do not match manifest order');
    validText(file.diff, 'diff', false);
    if (file.resultingContent !== null) validText(file.resultingContent, 'resulting content');
  });
  const core = {
    schemaVersion: packet.schemaVersion,
    fromSha: packet.fromSha,
    toSha: packet.toSha,
    manifest: packet.manifest,
    log: packet.log,
    files: packet.files,
  };
  const expected = createHash('sha256').update(JSON.stringify(core)).digest('hex');
  if (packet.digest !== expected) throw new Error('Packet digest mismatch');
  return { schemaVersion: 1, packetDigest: packet.digest, fromSha: packet.fromSha, toSha: packet.toSha };
}

function prefixThatFits(text, start, makeValue, maxBytes) {
  let low = 1;
  let high = text.length - start;
  let best = 0;
  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    let length = middle;
    const last = text.charCodeAt(start + length - 1);
    const next = text.charCodeAt(start + length);
    if (last >= 0xd800 && last <= 0xdbff && next >= 0xdc00 && next <= 0xdfff) length -= 1;
    if (bytes(makeValue(text.slice(start, start + length))) <= maxBytes) {
      best = length;
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }
  return best;
}

function diffSections(packet, header, maxBytes) {
  let sections = [];
  let current = { ...header, kind: 'diff', sectionIndex: 0, segments: [] };
  for (const file of packet.files) {
    let offset = 0;
    let startByte = 0;
    const totalBytes = Buffer.byteLength(file.diff, 'utf8');
    while (offset < file.diff.length) {
      const candidate = (content) => ({
        ...current,
        segments: [...current.segments, {
          path: file.path,
          startByte,
          endByte: startByte + Buffer.byteLength(content, 'utf8'),
          totalBytes,
          content,
        }],
      });
      const remaining = file.diff.slice(offset);
      const length = bytes(candidate(remaining)) <= maxBytes
        ? remaining.length
        : prefixThatFits(file.diff, offset, candidate, maxBytes);
      if (length === 0) {
        if (!current.segments.length) throw new Error('maxBytes is too small for section metadata and one source character');
        sections = [...sections, current];
        current = { ...header, kind: 'diff', sectionIndex: sections.length, segments: [] };
        continue;
      }
      const content = file.diff.slice(offset, offset + length);
      current = candidate(content);
      offset += length;
      startByte += Buffer.byteLength(content, 'utf8');
      if (offset < file.diff.length) {
        sections = [...sections, current];
        current = { ...header, kind: 'diff', sectionIndex: sections.length, segments: [] };
      }
    }
  }
  return current.segments.length ? [...sections, current] : sections;
}

function resultingParts(file, header, maxBytes) {
  const deleted = file.resultingContent === null;
  const text = file.resultingContent ?? '';
  const totalBytes = Buffer.byteLength(text, 'utf8');
  let parts = [];
  let offset = 0;
  let startByte = 0;
  do {
    const candidate = (content) => ({
      ...header,
      kind: 'resulting',
      path: file.path,
      deleted,
      partIndex: parts.length,
      startByte,
      endByte: startByte + Buffer.byteLength(content, 'utf8'),
      totalBytes,
      content: deleted ? null : content,
    });
    const remaining = text.slice(offset);
    const length = bytes(candidate(remaining)) <= maxBytes
      ? remaining.length
      : prefixThatFits(text, offset, candidate, maxBytes);
    if ((remaining.length && !length) || bytes(candidate(text.slice(offset, offset + length))) > maxBytes) {
      throw new Error('maxBytes is too small for resulting-file metadata and source content');
    }
    const content = text.slice(offset, offset + length);
    parts = [...parts, candidate(content)];
    offset += length;
    startByte += Buffer.byteLength(content, 'utf8');
  } while (offset < text.length);
  return parts;
}

function indexPacket(packet, { maxBytes = DEFAULT_MAX_BYTES } = {}) {
  const header = validatePacket(packet, maxBytes);
  const index = {
    ...header,
    kind: 'index',
    maxBytes,
    manifest: packet.manifest,
    log: packet.log,
    sections: diffSections(packet, header, maxBytes).map((section) => ({
      index: section.sectionIndex,
      byteLength: bytes(section),
      segments: section.segments.map(({ content, ...metadata }) => metadata),
    })),
    resultingFiles: packet.files.map((file) => ({
      path: file.path,
      deleted: file.resultingContent === null,
      totalBytes: Buffer.byteLength(file.resultingContent ?? '', 'utf8'),
      parts: resultingParts(file, header, maxBytes).map((part) => ({
        index: part.partIndex,
        byteLength: bytes(part),
        startByte: part.startByte,
        endByte: part.endByte,
      })),
    })),
  };
  if (bytes(index) > maxBytes) throw new Error('Evidence index exceeds maxBytes; choose a larger explicit output bound');
  return index;
}

function readSection(packet, sectionIndex, { maxBytes = DEFAULT_MAX_BYTES } = {}) {
  const header = validatePacket(packet, maxBytes);
  if (!Number.isSafeInteger(sectionIndex) || sectionIndex < 0) throw new Error('Invalid section index');
  const section = diffSections(packet, header, maxBytes)[sectionIndex];
  if (!section) throw new Error('Unknown section index');
  return section;
}

function readResultingFile(packet, filePath, { part = 0, maxBytes = DEFAULT_MAX_BYTES } = {}) {
  const header = validatePacket(packet, maxBytes);
  const file = packet.files.find((candidate) => candidate.path === filePath);
  if (!file) throw new Error('Unknown or missing resulting-file path');
  if (!Number.isSafeInteger(part) || part < 0) throw new Error('Invalid resulting-file part index');
  const result = resultingParts(file, header, maxBytes)[part];
  if (!result) throw new Error('Unknown resulting-file part index');
  return result;
}

function renderTextEvidence(evidence, { maxBytes = DEFAULT_MAX_BYTES } = {}) {
  if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0) throw new Error('maxBytes must be a positive safe integer');
  if (!evidence || !['diff', 'resulting'].includes(evidence.kind)) throw new Error('Text output requires a diff section or resulting-file part');
  const blocks = (evidence.kind === 'diff' ? evidence.segments : [evidence]).map(({ content, ...metadata }) => {
    const text = evidence.kind === 'resulting' && metadata.deleted && content === null ? '' : content;
    validText(text, 'source content');
    if (Buffer.byteLength(text, 'utf8') !== metadata.endByte - metadata.startByte) throw new Error('Source byte range does not match content');
    return { metadata, text };
  });
  const header = evidence.kind === 'diff'
    ? { ...evidence, segments: blocks.map((block) => block.metadata) }
    : blocks[0].metadata;
  const output = `${JSON.stringify(header)}\n${blocks.map((block) => block.text).join('')}`;
  if (Buffer.byteLength(output, 'utf8') > maxBytes) throw new Error('Text evidence framing exceeds maxBytes; no partial output was returned');
  return output;
}

function argumentsFor(args) {
  let options = {};
  for (let index = 0; index < args.length; index += 1) {
    const name = args[index];
    if (!['--packet', '--index', '--section', '--file', '--part', '--max-bytes', '--format'].includes(name) || Object.hasOwn(options, name)) {
      throw new Error('Usage: --packet ABS (--index | --section N | --file PATH [--part N]) [--max-bytes N] [--format json|text]');
    }
    if (name === '--index') options = { ...options, [name]: true };
    else {
      if (args[index + 1] === undefined) throw new Error(`Missing value for ${name}`);
      options = { ...options, [name]: args[index + 1] };
      index += 1;
    }
  }
  if (!options['--packet'] || !path.isAbsolute(options['--packet'])) throw new Error('--packet must name an absolute path');
  if (['--index', '--section', '--file'].filter((key) => Object.hasOwn(options, key)).length !== 1) throw new Error('Choose exactly one evidence selector');
  if (Object.hasOwn(options, '--part') && !Object.hasOwn(options, '--file')) throw new Error('--part requires --file');
  if (Object.hasOwn(options, '--format') && !['json', 'text'].includes(options['--format'])) throw new Error('--format must be json or text');
  return options;
}

async function main(args) {
  const options = argumentsFor(args);
  const raw = await fs.readFile(options['--packet']);
  const text = raw.toString('utf8');
  if (!raw.equals(Buffer.from(text, 'utf8'))) throw new Error('Packet file contains invalid UTF-8');
  const packet = JSON.parse(text);
  const maxBytes = Object.hasOwn(options, '--max-bytes') ? Number(options['--max-bytes']) : DEFAULT_MAX_BYTES;
  const result = options['--index']
    ? indexPacket(packet, { maxBytes })
    : Object.hasOwn(options, '--section')
      ? readSection(packet, Number(options['--section']), { maxBytes })
      : readResultingFile(packet, options['--file'], { part: Number(options['--part'] ?? 0), maxBytes });
  const output = options['--format'] === 'text' && result.kind !== 'index'
    ? renderTextEvidence(result, { maxBytes })
    : JSON.stringify(result);
  process.stdout.write(output);
}

if (require.main === module) {
  main(process.argv.slice(2)).catch((error) => {
    process.stderr.write(`read-review-evidence: ${error.message}\n`);
    process.exitCode = 1;
  });
}

module.exports = { indexPacket, readSection, readResultingFile, renderTextEvidence };
