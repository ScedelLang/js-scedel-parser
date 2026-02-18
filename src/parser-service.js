import fs from 'node:fs';
import path from 'node:path';

export class ParseError extends Error {
  constructor(message, options = {}) {
    super(message);
    this.name = 'ParseError';
    this.sourceName = options.sourceName ?? null;
    this.line = options.line ?? null;
    this.column = options.column ?? null;
    this.code = options.code ?? 'InvalidExpression';
    this.category = options.category ?? 'ParseError';
    this.offendingToken = options.offendingToken ?? null;
  }
}

export class ParserService {
  static SUPPORTED_RFC_VERSIONS = ['0.14.2'];

  parseFile(filePath) {
    const absolutePath = path.resolve(filePath);
    let source;

    try {
      source = fs.readFileSync(absolutePath, 'utf8');
    } catch (_error) {
      throw new ParseError(`Unable to read file: ${absolutePath}`, {
        sourceName: absolutePath,
      });
    }

    return this.parseString(source, absolutePath);
  }

  parseString(source, sourceName = 'inline.scedel') {
    const statements = splitTopLevelStatements(source);

    let version = null;
    const includes = [];
    const fileStatements = [];
    const pendingAnnotations = [];

    for (const statement of statements) {
      if (statement.startsWith('scedel-version')) {
        const match = statement.match(/^scedel-version\s+([^\s]+)\s*$/);
        if (!match) {
          throw new ParseError('Invalid scedel-version directive.', {
            sourceName,
            code: 'InvalidVersionDirective',
          });
        }

        if (version !== null) {
          throw new ParseError('Duplicate scedel-version directive.', {
            sourceName,
            code: 'InvalidVersionDirective',
          });
        }

        version = parseVersionLiteral(match[1], sourceName);
        continue;
      }

      if (statement.startsWith('include')) {
        const match = statement.match(/^include\s+((?:"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'))\s*$/s);
        if (!match) {
          throw new ParseError('Invalid include statement.', { sourceName });
        }

        includes.push({ kind: 'include', path: decodeStringLiteral(match[1]) });
        continue;
      }

      if (statement.startsWith('@')) {
        const parsed = parseAnnotationStatement(statement, sourceName);
        if (parsed.kind === 'targetedAnnotation') {
          fileStatements.push(parsed);
        } else {
          pendingAnnotations.push(parsed.annotation);
        }

        continue;
      }

      if (statement.startsWith('type ')) {
        const match = statement.match(/^type\s+([A-Za-z_][A-Za-z0-9_]*)\s*=\s*([\s\S]+)$/);
        if (!match) {
          throw new ParseError('Invalid type declaration.', { sourceName });
        }

        fileStatements.push({
          kind: 'typeDeclaration',
          name: match[1],
          typeExpr: match[2].trim(),
          annotations: pendingAnnotations.splice(0),
        });
        continue;
      }

      if (statement.startsWith('validator ')) {
        const match = statement.match(
          /^validator\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(\s*([A-Za-z_][A-Za-z0-9_]*)(?:\s*,\s*([\s\S]*?))?\)\s*=\s*([\s\S]+)$/,
        );

        if (!match) {
          throw new ParseError('Invalid validator declaration.', { sourceName });
        }

        fileStatements.push({
          kind: 'validatorDeclaration',
          targetType: match[1],
          name: match[2],
          params: parseValidatorParams(match[3] ?? '', sourceName),
          body: match[4].trim(),
          annotations: pendingAnnotations.splice(0),
        });
        continue;
      }

      throw new ParseError(`Unsupported statement: ${statement.slice(0, 40)}...`, {
        sourceName,
      });
    }

    return {
      kind: 'file',
      sourceName,
      version,
      includes,
      statements: fileStatements,
    };
  }
}

function splitTopLevelStatements(source) {
  const starts = [];
  let offset = 0;
  const lines = source.split(/\r?\n/);

  for (const line of lines) {
    const isStatementStart =
      line.startsWith('@') ||
      line.startsWith('scedel-version ') ||
      line.startsWith('include ') ||
      line.startsWith('type ') ||
      line.startsWith('validator ');

    if (isStatementStart) {
      starts.push(offset);
    }

    offset += line.length + 1;
  }

  if (starts.length === 0) {
    return [];
  }

  const statements = [];
  for (let i = 0; i < starts.length; i++) {
    const from = starts[i];
    const to = starts[i + 1] ?? source.length;
    const chunk = source.slice(from, to).trim();
    if (chunk !== '') {
      statements.push(chunk);
    }
  }

  return statements;
}

function parseVersionLiteral(raw, sourceName) {
  const match = raw.match(/^(\d+)\.(\d+)(?:\.(\d+))?$/);
  if (!match) {
    throw new ParseError(`Invalid version literal: ${raw}`, {
      sourceName,
      code: 'InvalidVersionDirective',
    });
  }

  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3] ?? 0),
  };
}

function parseAnnotationStatement(statement, sourceName) {
  const match = statement.match(
    /^@([A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*)(?:\s*=\s*((?:"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')))?(?:\s+on\s+([\s\S]+))?$/,
  );

  if (!match) {
    throw new ParseError(`Invalid annotation statement: ${statement}`, { sourceName });
  }

  const annotation = {
    kind: 'annotation',
    key: match[1],
    value: match[2] ? decodeStringLiteral(match[2]) : 'true',
  };

  if (!match[3]) {
    return { kind: 'inlineAnnotation', annotation };
  }

  return {
    kind: 'targetedAnnotation',
    annotation,
    target: parseAnnotationTarget(match[3].trim(), sourceName),
  };
}

function parseAnnotationTarget(rawTarget, sourceName) {
  const fieldSetMatch = rawTarget.match(/^([A-Za-z_][A-Za-z0-9_]*)\.\{([A-Za-z_][A-Za-z0-9_]*(?:\s*,\s*[A-Za-z_][A-Za-z0-9_]*)*)\}$/);
  if (fieldSetMatch) {
    return {
      kind: 'fieldSet',
      typeName: fieldSetMatch[1],
      fields: fieldSetMatch[2].split(',').map((field) => field.trim()),
      raw: rawTarget,
    };
  }

  const path = rawTarget.split('.').map((segment) => segment.trim()).filter(Boolean);
  if (path.length === 0) {
    throw new ParseError(`Invalid annotation target: ${rawTarget}`, {
      sourceName,
      code: 'InvalidAnnotationTarget',
      category: 'SemanticError',
    });
  }

  if (path.length === 1) {
    return { kind: 'type', typeName: path[0], raw: rawTarget };
  }

  return {
    kind: 'fieldPath',
    typeName: path[0],
    path: path.slice(1),
    raw: rawTarget,
  };
}

function parseValidatorParams(paramsChunk, sourceName) {
  const raw = paramsChunk.trim();
  if (raw === '') {
    return [];
  }

  const parts = splitByTopLevelComma(raw);
  const params = [];

  for (const part of parts) {
    const match = part.trim().match(/^([A-Za-z_][A-Za-z0-9_]*)(?:\s*:\s*([A-Za-z_][A-Za-z0-9_]*))?(?:\s*=\s*([\s\S]+))?$/);
    if (!match) {
      throw new ParseError(`Invalid validator param definition: ${part}`, {
        sourceName,
      });
    }

    params.push({
      name: match[1],
      typeName: match[2] ?? null,
      defaultExpr: match[3]?.trim() ?? null,
    });
  }

  return params;
}

function splitByTopLevelComma(input) {
  const parts = [];
  let start = 0;
  const state = createScannerState();

  for (let i = 0; i < input.length; i++) {
    const char = input[i];
    advanceScannerState(state, input, i);

    if (char === ',' && isTopLevel(state)) {
      parts.push(input.slice(start, i).trim());
      start = i + 1;
    }
  }

  const tail = input.slice(start).trim();
  if (tail !== '') {
    parts.push(tail);
  }

  return parts;
}

function decodeStringLiteral(literal) {
  const quote = literal[0];
  if ((quote !== '"' && quote !== "'") || literal[literal.length - 1] !== quote) {
    throw new ParseError(`Invalid string literal: ${literal}`);
  }

  let value = '';
  let escaped = false;
  for (let i = 1; i < literal.length - 1; i++) {
    const char = literal[i];

    if (escaped) {
      if (char === 'n') {
        value += '\n';
      } else if (char === 'r') {
        value += '\r';
      } else if (char === 't') {
        value += '\t';
      } else {
        value += char;
      }
      escaped = false;
      continue;
    }

    if (char === '\\') {
      escaped = true;
      continue;
    }

    value += char;
  }

  return value;
}

function createScannerState() {
  return {
    inSingleQuote: false,
    inDoubleQuote: false,
    inRegex: false,
    inBlockComment: false,
    inLineComment: false,
    escaped: false,
    braceDepth: 0,
    parenDepth: 0,
    bracketDepth: 0,
    lastSignificant: '',
  };
}

function advanceScannerState(state, source, i) {
  const char = source[i];
  const next = source[i + 1] ?? '';

  if (state.inLineComment) {
    return;
  }

  if (state.inBlockComment) {
    if (char === '*' && next === '/') {
      state.inBlockComment = false;
    }
    return;
  }

  if (state.inSingleQuote || state.inDoubleQuote || state.inRegex) {
    if (state.escaped) {
      state.escaped = false;
      return;
    }

    if (char === '\\') {
      state.escaped = true;
      return;
    }

    if (state.inSingleQuote && char === "'") {
      state.inSingleQuote = false;
      state.lastSignificant = 'literal';
      return;
    }

    if (state.inDoubleQuote && char === '"') {
      state.inDoubleQuote = false;
      state.lastSignificant = 'literal';
      return;
    }

    if (state.inRegex && char === '/') {
      state.inRegex = false;
      state.lastSignificant = 'literal';
      return;
    }

    return;
  }

  if (char === '/' && next === '*') {
    state.inBlockComment = true;
    return;
  }

  if (char === '/' && next === '/') {
    state.inLineComment = true;
    return;
  }

  if (char === "'") {
    state.inSingleQuote = true;
    return;
  }

  if (char === '"') {
    state.inDoubleQuote = true;
    return;
  }

  if (char === '/' && isRegexStart(state.lastSignificant)) {
    state.inRegex = true;
    return;
  }

  if (char === '{') {
    state.braceDepth++;
  } else if (char === '}') {
    state.braceDepth = Math.max(0, state.braceDepth - 1);
  } else if (char === '(') {
    state.parenDepth++;
  } else if (char === ')') {
    state.parenDepth = Math.max(0, state.parenDepth - 1);
  } else if (char === '[') {
    state.bracketDepth++;
  } else if (char === ']') {
    state.bracketDepth = Math.max(0, state.bracketDepth - 1);
  }

  if (!isWhitespace(char)) {
    state.lastSignificant = char;
  }
}

function isTopLevel(state) {
  return (
    !state.inSingleQuote &&
    !state.inDoubleQuote &&
    !state.inRegex &&
    !state.inBlockComment &&
    !state.inLineComment &&
    state.braceDepth === 0 &&
    state.parenDepth === 0 &&
    state.bracketDepth === 0
  );
}

function isWhitespace(char) {
  return char === ' ' || char === '\t' || char === '\n' || char === '\r';
}

function isRegexStart(lastSignificant) {
  return (
    lastSignificant === '' ||
    lastSignificant === '(' ||
    lastSignificant === '[' ||
    lastSignificant === '{' ||
    lastSignificant === ',' ||
    lastSignificant === ':' ||
    lastSignificant === '=' ||
    lastSignificant === '|' ||
    lastSignificant === '&' ||
    lastSignificant === '!' ||
    lastSignificant === '?' ||
    lastSignificant === '+' ||
    lastSignificant === '-' ||
    lastSignificant === '*' ||
    lastSignificant === '<' ||
    lastSignificant === '>'
  );
}
