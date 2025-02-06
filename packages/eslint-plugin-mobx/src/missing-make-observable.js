'use strict';

const {findAncestor, isMobxDecorator} = require('./utils.js');

function create(context) {
  const sourceCode = context.getSourceCode();

  let namespaceImportName = undefined; // is 'mobxFoo' when import * as mobxFoo from 'mobx'
  let makeObservableExpr = undefined; // is 'mobxFoo' when import * as mobxFoo from 'mobx'
  let lastSpecifierImport = undefined;

  return {
    'ImportDeclaration': node => {
      if (node.source.value !== 'mobx') return;

      // Collect the imports

      for (const specifier of node.specifiers) {
        if (specifier.type === 'ImportNamespaceSpecifier') {
          namespaceImportName = specifier.local.name;
          makeObservableExpr = `${namespaceImportName}.makeObservable`;
        }

        if (specifier.type === 'ImportSpecifier') {
          lastSpecifierImport = specifier;
          if (specifier.imported.name === 'makeObservable') {
            makeObservableExpr = specifier.local.name;
          }
        }
      }
    },
    'Decorator': decorator => {
      if (!isMobxDecorator(decorator, namespaceImportName)) return;
      const clazz = findAncestor(decorator, node => node.type === 'ClassDeclaration' || node.type === 'ClassExpression');
      if (!clazz) return;
      // ClassDeclaration > ClassBody > []
      const constructor = clazz.body.body.find(node => node.kind === 'constructor' && node.value.type === 'FunctionExpression') ??
        clazz.body.body.find(node => node.kind === 'constructor');
      // MethodDefinition > FunctionExpression > BlockStatement > []
      const isReact = isReactComponent(clazz.superClass);
      const unsupportedSuper = !isReact && !!clazz.superClass;
      const isMakeObservable = node => (node.expression?.callee?.name === 'makeObservable'  || node.expression?.callee?.property?.name === 'makeObservable') && node.expression?.arguments[0]?.type === 'ThisExpression';
      const makeObservable = constructor?.value.body?.body.find(isMakeObservable)?.expression;

      if (makeObservable) {
        // make sure second arg is nullish
        const secondArg = makeObservable.arguments[1];
        if (secondArg && secondArg.value !== null && secondArg.name !== 'undefined') {
          context.report({
            node: makeObservable,
            messageId: 'secondArgMustBeNullish',
          })
        }
      } else {
        const fix = fixer => {
          // The class extends a another unknown class so we can not safely create a super call.
          if (unsupportedSuper && !constructor) {
            return;
          }

          const fixes = [];

          // Insert the makeObservable import if required
          if (!makeObservableExpr) {
            lastSpecifierImport && fixes.push(fixer.insertTextAfter(lastSpecifierImport, ', makeObservable'));
            makeObservableExpr = 'makeObservable';
          }

          if (constructor?.value.type === 'TSEmptyBodyFunctionExpression') {
            // constructor() - yes this a thing
            const closingBracket = sourceCode.getLastToken(constructor.value);
            fixes.push(fixer.insertTextAfter(closingBracket, ` { ${makeObservableExpr}(this); }`));
          } else if (constructor) {
            // constructor() {}
            const closingBracket = sourceCode.getLastToken(constructor.value.body);
            fixes.push(fixer.insertTextBefore(closingBracket, `;${makeObservableExpr}(this);`));
          } else if (isReact) {
            // class C extends Component<{ foo: string }> {}
            let propsType = '';
            if (clazz.superTypeParameters?.params.length) {
              propsType = `: ${sourceCode.getText(clazz.superTypeParameters.params[0])}`;
            }
            const openingBracket = sourceCode.getFirstToken(clazz.body);
            fixes.push(fixer.insertTextAfter(openingBracket, `\nconstructor(props${propsType}) { super(props); ${makeObservableExpr}(this); }`));
          } else if (!unsupportedSuper) {
            // class C {}
            const openingBracket = sourceCode.getFirstToken(clazz.body);
            fixes.push(fixer.insertTextAfter(openingBracket, `\nconstructor() { ${makeObservableExpr}(this); }`));
          }

          return fixes;
        };

        context.report({
          node: clazz,
          messageId: unsupportedSuper ? 'missingMakeObservableSuper' : 'missingMakeObservable',
          fix,
        })
      }
    },
  };
}

function isReactComponent(superClass) {
  const classes = ['Component', 'PureComponent'];
  if (!superClass) {
    return false;
  }

  if (classes.includes(superClass.name)) {
    return true;
  }

  return superClass.object?.name === 'React' &&  classes.includes(superClass.property.name);
}

module.exports = {
  meta: {
    type: 'problem',
    fixable: 'code',
    docs: {
      description: 'prevents missing `makeObservable(this)` when using decorators',
      recommended: true,
      suggestion: false,
    },
    messages: {
      missingMakeObservable: "Constructor is missing `makeObservable(this)`.",
      missingMakeObservableSuper: "Constructor is missing `makeObservable(this)`. Can not fix because of missing super call.",
      secondArgMustBeNullish: "`makeObservable`'s second argument must be nullish or not provided when using decorators."
    },
  },
  create,
};