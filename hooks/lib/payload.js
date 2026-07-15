'use strict';
const fs = require('node:fs');

function readStdinSync() {
  try {
    return fs.readFileSync(0, 'utf-8');
  } catch (err) {
    return '';
  }
}

function parsePayload(text) {
  return JSON.parse(text);
}

function getCommand(payload) {
  return (payload && payload.tool_input && payload.tool_input.command) || '';
}

function getFilePath(payload) {
  return (payload && payload.tool_input && payload.tool_input.file_path) || '';
}

function getPatch(payload) {
  const ti = payload && payload.tool_input;
  if (!ti) return '';
  if (typeof ti === 'string') return ti;
  if (ti.input) return ti.input;
  if (ti.command) return ti.command;
  // Unknown field name: join all string values with real newlines so the
  // patch body's `*** Update File: <path>` headers still tokenize and are
  // caught by matchBashCommand (fail-safe, not fail-open).
  return Object.values(ti)
    .filter((v) => typeof v === 'string')
    .join('\n');
}

module.exports = { readStdinSync, parsePayload, getCommand, getFilePath, getPatch };
