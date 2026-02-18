import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ParseError, ParserService } from '../src/index.js';

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = path.resolve(currentDir, '../../..');
const examplePath = path.join(workspaceRoot, 'example.scedel');

test('ParserService parses example.scedel structure', () => {
  const parser = new ParserService();
  const ast = parser.parseFile(examplePath);

  assert.equal(ast.kind, 'file');
  assert.equal(ast.version.major, 1);
  assert.equal(ast.version.minor, 0);
  assert.equal(ast.version.patch, 0);
  assert.equal(ast.includes.length, 0);

  const typeDeclarations = ast.statements.filter((statement) => statement.kind === 'typeDeclaration');
  const validatorDeclarations = ast.statements.filter((statement) => statement.kind === 'validatorDeclaration');
  const targetedAnnotations = ast.statements.filter((statement) => statement.kind === 'targetedAnnotation');

  assert.equal(typeDeclarations.length, 6);
  assert.equal(validatorDeclarations.length, 4);
  assert.equal(targetedAnnotations.length, 2);

  const targetNames = typeDeclarations.map((statement) => statement.name);
  assert.deepEqual(targetNames, [
    'PostStatus',
    'DateTimeFormatted',
    'Comment',
    'Post',
    'PostWithStatus',
    'OddRangedInt',
  ]);

  const targeted = targetedAnnotations.find((statement) => statement.annotation.key === 'js.ignore');
  assert.ok(targeted);
  assert.equal(targeted.target.kind, 'fieldPath');
  assert.equal(targeted.target.typeName, 'Post');
  assert.deepEqual(targeted.target.path, ['internalNote']);
});

test('ParserService rejects duplicate version directives', () => {
  const parser = new ParserService();

  assert.throws(
    () => parser.parseString('scedel-version 1.0\nscedel-version 1.1\ntype A = String', 'dup.scedel'),
    (error) => {
      assert.ok(error instanceof ParseError);
      assert.equal(error.code, 'InvalidVersionDirective');
      return true;
    },
  );
});

test('ParserService supports context-sensitive keywords in identifiers', () => {
  const parser = new ParserService();
  const ast = parser.parseString('type Example = { include: String }', 'soft-keyword.scedel');

  assert.equal(ast.statements.length, 1);
  assert.equal(ast.statements[0].kind, 'typeDeclaration');
  assert.equal(ast.statements[0].name, 'Example');
});

test('ParserService rejects identifiers starting with a digit', () => {
  const parser = new ParserService();

  assert.throws(
    () => parser.parseString('type 1Example = String', 'invalid-identifier.scedel'),
    (error) => {
      assert.ok(error instanceof ParseError);
      return true;
    },
  );
});

test('ParserService declares supported RFC version', () => {
  assert.ok(ParserService.SUPPORTED_RFC_VERSIONS.includes('0.14.2'));
});
