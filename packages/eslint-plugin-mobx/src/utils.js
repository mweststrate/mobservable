'use strict';

const mobxDecorators = new Set(['observable', 'computed', 'action', 'flow', 'override']);

function isMobxDecorator(decorator, namespace) {
  if (namespace !== undefined) {
    let memberExpression;
    if (decorator.expression.type === 'MemberExpression') {
      memberExpression = decorator.expression;
    }

    if (decorator.expression.type === 'CallExpression' && decorator.expression.callee.type === 'MemberExpression') {
      memberExpression = decorator.expression.callee;
    }

    if (memberExpression?.object.name === namespace || memberExpression?.object.object?.name === namespace) {
      return true;
    }
  }

  return mobxDecorators.has(decorator.expression.name) // @foo
    || mobxDecorators.has(decorator.expression.callee?.name) // @foo()
    || mobxDecorators.has(decorator.expression.object?.name) // @foo.bar
}

function findAncestor(node, match) {
  const { parent } = node;
  if (!parent) return;
  if (match(parent)) return parent;
  return findAncestor(parent, match);
}

function assert(expr, error) {
  if (!expr) {
    error ??= 'Assertion failed';
    error = error instanceof Error ? error : new Error(error)
    throw error;
  }
}

module.exports = {
  findAncestor,
  isMobxDecorator,
}