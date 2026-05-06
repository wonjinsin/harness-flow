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

module.exports = { readStdinSync, parsePayload, getCommand, getFilePath };
