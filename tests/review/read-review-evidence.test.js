'use strict';

const assert = require('node:assert/strict');
const { execFile } = require('node:child_process');
const { createHash } = require('node:crypto');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { promisify } = require('node:util');
const { indexPacket, readSection, readResultingFile, renderTextEvidence } = require('../../skills/requesting-code-review/scripts/read-review-evidence.js');

const execute = promisify(execFile);
const script = path.resolve(__dirname, '../../skills/requesting-code-review/scripts/read-review-evidence.js');

function packetFor(files) {
  const core = {
    schemaVersion: 1,
    fromSha: 'a'.repeat(40),
    toSha: 'b'.repeat(40),
    manifest: files.map((file) => file.path),
    log: 'fixture commit\n',
    files,
  };
  return { ...core, digest: createHash('sha256').update(JSON.stringify(core)).digest('hex'), preparationMs: 1 };
}

function fixture() {
  return packetFor([
    { path: 'quote"/\uD55C\uAE00\n\uD83D\uDE00.js', diff: 'diff --git old new\n' + '+\uD55C\uAE00\uD83D\uDE00\\"\n'.repeat(18000), resultingContent: 'context \uD83D\uDE00\n'.repeat(18000) },
    { path: 'deleted.txt', diff: 'deleted file mode 100644\n-old\n', resultingContent: null },
    { path: 'empty.txt', diff: 'new file mode 100644\n', resultingContent: '' },
  ]);
}

function unpackText(output) {
  const buffer = Buffer.from(output, 'utf8');
  const endOfHeader = buffer.indexOf(10);
  assert.ok(endOfHeader > 0);
  const header = JSON.parse(buffer.subarray(0, endOfHeader).toString('utf8'));
  const descriptors = header.kind === 'diff' ? header.segments : [header];
  let offset = endOfHeader + 1;
  const blocks = descriptors.map((metadata) => {
    assert.equal(Object.hasOwn(metadata, 'content'), false);
    const contentBytes = metadata.endByte - metadata.startByte;
    const content = buffer.subarray(offset, offset + contentBytes);
    assert.equal(content.length, contentBytes);
    assert.deepEqual(Buffer.from(content.toString('utf8'), 'utf8'), content);
    offset += contentBytes;
    return { metadata, content };
  });
  assert.equal(offset, buffer.length);
  return { header, blocks };
}

test('diff sections reconstruct every byte once with Unicode-safe bounded JSON and stable indices', () => {
  const packet = fixture();
  const maxBytes = 24000;
  const index = indexPacket(packet, { maxBytes });
  assert.deepEqual(index, indexPacket(packet, { maxBytes }));
  assert.deepEqual(index.manifest, packet.manifest);
  assert.equal(index.log, packet.log);
  assert.equal(index.packetDigest, packet.digest);
  assert.ok(index.sections.length > 1);
  const recovered = new Map(packet.manifest.map((name) => [name, Buffer.alloc(0)]));
  for (const entry of index.sections) {
    const section = readSection(packet, entry.index, { maxBytes });
    assert.equal(section.sectionIndex, entry.index);
    assert.equal(section.packetDigest, packet.digest);
    assert.equal(section.fromSha, packet.fromSha);
    assert.equal(section.toSha, packet.toSha);
    const bytes = Buffer.byteLength(JSON.stringify(section));
    assert.ok(bytes <= maxBytes);
    assert.equal(bytes, entry.byteLength);
    assert.deepEqual(section.segments.map(({ content, ...metadata }) => metadata), entry.segments);
    for (const segment of section.segments) {
      const previous = recovered.get(segment.path);
      const content = Buffer.from(segment.content, 'utf8');
      assert.equal(segment.startByte, previous.length);
      assert.equal(segment.endByte, previous.length + content.length);
      assert.equal(content.toString('utf8'), segment.content);
      assert.equal(segment.totalBytes, Buffer.byteLength(packet.files.find((file) => file.path === segment.path).diff));
      recovered.set(segment.path, Buffer.concat([previous, content]));
    }
  }
  for (const file of packet.files) assert.equal(recovered.get(file.path).toString('utf8'), file.diff);
});

test('resulting context parts preserve complete content and distinguish deleted, empty and missing paths', () => {
  const packet = fixture();
  const index = indexPacket(packet);
  for (const entry of index.resultingFiles) {
    let recovered = '';
    let bytes = 0;
    for (const descriptor of entry.parts) {
      const part = readResultingFile(packet, entry.path, { part: descriptor.index });
      assert.equal(part.startByte, bytes);
      assert.equal(part.deleted, entry.deleted);
      assert.equal(Buffer.byteLength(JSON.stringify(part)), descriptor.byteLength);
      assert.ok(descriptor.byteLength <= 24000);
      if (!entry.deleted) recovered += part.content;
      bytes = part.endByte;
    }
    const original = packet.files.find((file) => file.path === entry.path);
    assert.equal(bytes, entry.totalBytes);
    if (!entry.deleted) assert.equal(recovered, original.resultingContent);
  }
  assert.equal(readResultingFile(packet, 'deleted.txt').content, null);
  assert.equal(readResultingFile(packet, 'empty.txt').content, '');
  assert.throws(() => readResultingFile(packet, 'missing.txt'), /missing|unknown/i);
});

test('packs small independent diffs together and rejects invalid requests instead of truncating', () => {
  const packet = packetFor([
    { path: 'a', diff: 'diff a\n+a\n', resultingContent: 'a\n' },
    { path: 'b', diff: 'diff b\n+b\n', resultingContent: 'b\n' },
  ]);
  assert.equal(indexPacket(packet).sections.length, 1);
  assert.deepEqual(readSection(packet, 0).segments.map((segment) => segment.path), ['a', 'b']);
  assert.throws(() => readSection(packet, 1), /section/i);
  assert.throws(() => readSection(packet, -1), /section/i);
  assert.throws(() => readResultingFile(packet, 'a', { part: 1 }), /part/i);
  assert.throws(() => indexPacket(packet, { maxBytes: 32 }), /maxBytes|small/i);
  assert.throws(() => indexPacket(packet, { maxBytes: 0 }), /maxBytes/i);
});

test('rejects corrupt digest, mismatched shape, invalid Unicode and missing source content', () => {
  const packet = packetFor([{ path: 'a', diff: 'diff a\n+a\n', resultingContent: 'a\n' }]);
  assert.throws(() => indexPacket({ ...packet, digest: '0'.repeat(64) }), /digest/i);
  assert.throws(() => readSection({ ...packet, files: [] }, 0), /manifest|files|shape/i);
  assert.throws(() => indexPacket(packetFor([{ path: 'a', diff: '\ud800', resultingContent: '' }])), /UTF|Unicode/i);
  assert.throws(() => indexPacket(packetFor([{ path: 'a', diff: 'diff', resultingContent: undefined }])), /content|shape/i);
  assert.throws(() => indexPacket({ ...packet, schemaVersion: 2 }), /schema/i);
  assert.throws(() => indexPacket({ ...packet, fromSha: 'HEAD' }), /commit|SHA/i);
});

test('CLI reads external packet files without mutation and rejects incompatible selectors', async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'read-review-test-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const packetPath = path.join(directory, 'packet.json');
  const packet = packetFor([{ path: 'line\n\uD83D\uDE00', diff: 'diff\n+x\n', resultingContent: 'x\n' }]);
  const original = JSON.stringify(packet);
  await fs.writeFile(packetPath, original);
  for (const selector of [['--index'], ['--section', '0'], ['--file', packet.manifest[0], '--part', '0']]) {
    const { stdout, stderr } = await execute(process.execPath, [script, '--packet', packetPath, ...selector]);
    assert.equal(JSON.parse(stdout).packetDigest, packet.digest);
    assert.equal(stderr, '');
  }
  assert.equal(await fs.readFile(packetPath, 'utf8'), original);
  assert.deepEqual(await fs.readdir(directory), ['packet.json']);
  await assert.rejects(execute(process.execPath, [script, '--packet', packetPath, '--index', '--section', '0']), (error) => error.code === 1 && /selector|Usage|one/i.test(error.stderr));
  await assert.rejects(execute(process.execPath, [script, '--packet', 'relative.json', '--index']), (error) => error.code === 1 && /absolute/i.test(error.stderr));
});

test('text sections preserve byte-exact Unicode source and framing-like content across existing partitions', () => {
  const frameLike = '```json\n{"format":"text","segments":[]}\n```\n"\uD83D\uDE00"\\\n';
  const packet = packetFor([
    { path: 'first\n"\uD83D\uDE00.js', diff: frameLike.repeat(1200), resultingContent: 'first\n' },
    { path: 'second.js', diff: 'diff second\n' + frameLike, resultingContent: 'second\n' },
  ]);
  const before = JSON.stringify(packet);
  const index = indexPacket(packet);
  assert.ok(index.sections.length > 1);
  const recovered = new Map(packet.manifest.map((name) => [name, Buffer.alloc(0)]));
  for (const entry of index.sections) {
    const section = readSection(packet, entry.index);
    const output = renderTextEvidence(section);
    assert.ok(Buffer.byteLength(output, 'utf8') <= 24000);
    assert.ok(Buffer.byteLength(output, 'utf8') <= Buffer.byteLength(JSON.stringify(section), 'utf8'));
    const { header, blocks } = unpackText(output);
    assert.equal(header.packetDigest, packet.digest);
    assert.equal(header.fromSha, packet.fromSha);
    assert.equal(header.toSha, packet.toSha);
    assert.equal(header.sectionIndex, entry.index);
    assert.deepEqual(header, { ...section, segments: section.segments.map(({ content, ...metadata }) => metadata) });
    assert.equal(blocks.length, section.segments.length);
    for (const { metadata, content } of blocks) {
      const previous = recovered.get(metadata.path);
      assert.equal(metadata.startByte, previous.length);
      assert.equal(metadata.totalBytes, Buffer.byteLength(packet.files.find((file) => file.path === metadata.path).diff));
      recovered.set(metadata.path, Buffer.concat([previous, content]));
    }
  }
  for (const file of packet.files) assert.deepEqual(recovered.get(file.path), Buffer.from(file.diff, 'utf8'));
  assert.equal(JSON.stringify(packet), before);
  assert.deepEqual(indexPacket(packet), index);
});

test('text resulting parts preserve source and distinguish deleted and empty files', () => {
  const packet = fixture();
  const index = indexPacket(packet);
  for (const entry of index.resultingFiles) {
    let recovered = Buffer.alloc(0);
    for (const descriptor of entry.parts) {
      const output = renderTextEvidence(readResultingFile(packet, entry.path, { part: descriptor.index }));
      assert.ok(Buffer.byteLength(output, 'utf8') <= 24000);
      const { header, blocks } = unpackText(output);
      assert.equal(header.packetDigest, packet.digest);
      assert.equal(header.path, entry.path);
      assert.equal(header.partIndex, descriptor.index);
      assert.equal(header.deleted, entry.deleted);
      assert.equal(header.startByte, recovered.length);
      assert.equal(blocks.length, 1);
      recovered = Buffer.concat([recovered, blocks[0].content]);
    }
    const original = packet.files.find((file) => file.path === entry.path);
    assert.deepEqual(recovered, Buffer.from(original.resultingContent ?? '', 'utf8'));
  }
  assert.equal(unpackText(renderTextEvidence(readResultingFile(packet, 'deleted.txt'))).header.deleted, true);
  assert.equal(unpackText(renderTextEvidence(readResultingFile(packet, 'empty.txt'))).header.deleted, false);
});

test('text framing fits full JSON partitions for long single lines and many short blocks', () => {
  const packet = packetFor([{ path: 'a.js', diff: 'x'.repeat(10000), resultingContent: 'x'.repeat(10000) }]);
  const maxBytes = 600;
  const multi = packetFor(Array.from({ length: 30 }, (_, index) => ({ path: `${index}.js`, diff: 'x', resultingContent: '' })));
  const packed = readSection(multi, 0, { maxBytes });
  assert.ok(packed.segments.length > 1);
  for (const evidence of [readSection(packet, 0, { maxBytes }), readResultingFile(packet, 'a.js', { maxBytes }), packed]) {
    const jsonBytes = Buffer.byteLength(JSON.stringify(evidence), 'utf8');
    assert.ok(jsonBytes <= maxBytes);
    const before = JSON.stringify(evidence);
    const output = renderTextEvidence(evidence, { maxBytes });
    assert.ok(Buffer.byteLength(output, 'utf8') <= jsonBytes);
    const expected = evidence.kind === 'diff' ? evidence.segments.map((segment) => segment.content).join('') : evidence.content;
    assert.equal(Buffer.concat(unpackText(output).blocks.map((block) => block.content)).toString('utf8'), expected);
    assert.equal(JSON.stringify(evidence), before);
  }
});

test('text renderer validates the complete framed output bound without truncation', () => {
  const packet = packetFor([{ path: 'a.js', diff: 'source\n', resultingContent: 'source\n' }]);
  for (const evidence of [readSection(packet, 0), readResultingFile(packet, 'a.js')]) {
    const output = renderTextEvidence(evidence);
    const bound = Buffer.byteLength(output, 'utf8');
    assert.equal(renderTextEvidence(evidence, { maxBytes: bound }), output);
    assert.throws(() => renderTextEvidence(evidence, { maxBytes: bound - 1 }), /text.*maxBytes|framing.*bound/i);
  }
  assert.throws(() => renderTextEvidence(readSection(packet, 0), { maxBytes: 0 }), /maxBytes/i);
  assert.throws(() => renderTextEvidence(indexPacket(packet)), /section|resulting|kind/i);
});

test('CLI opts into raw text while index and default JSON stay unchanged and bad formats fail', async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'read-review-text-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const packetPath = path.join(directory, 'packet.json');
  const source = '```\n{"fake":"header"}\n```\nconst value = "\uD83D\uDE00";\n';
  const packet = packetFor([{ path: 'source.js', diff: source, resultingContent: source }]);
  await fs.writeFile(packetPath, JSON.stringify(packet));
  for (const selector of [['--section', '0'], ['--file', 'source.js', '--part', '0']]) {
    const { stdout, stderr } = await execute(process.execPath, [script, '--packet', packetPath, ...selector, '--format', 'text']);
    assert.equal(stderr, '');
    const { blocks } = unpackText(stdout);
    assert.equal(Buffer.concat(blocks.map((block) => block.content)).toString('utf8'), source);
  }
  const index = await execute(process.execPath, [script, '--packet', packetPath, '--index', '--format', 'text']);
  assert.deepEqual(JSON.parse(index.stdout), indexPacket(packet));
  const explicitJson = await execute(process.execPath, [script, '--packet', packetPath, '--section', '0', '--format', 'json']);
  assert.deepEqual(JSON.parse(explicitJson.stdout), readSection(packet, 0));
  for (const args of [['--format', 'yaml'], ['--format'], ['--format', 'json', '--format', 'text']]) {
    await assert.rejects(execute(process.execPath, [script, '--packet', packetPath, '--section', '0', ...args]), (error) => error.code === 1 && error.stdout === '' && /format|Usage/i.test(error.stderr));
  }
  await assert.rejects(execute(process.execPath, [script, '--packet', packetPath, '--section', '0', '--format', 'text', '--max-bytes', '16']), (error) => error.code === 1 && error.stdout === '' && /maxBytes|small/i.test(error.stderr));
});
