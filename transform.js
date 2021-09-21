// Nearly all uncommented SFC parsing comes from antfu/unplugin-vue2-script-setup
// Copyright (c) 2021 Anthony Fu <https://github.com/antfu>
// Mostly modified to:
// * support Vue 3's `defineExports`
// * Generate <script> and <script setup> sourcemaps alongside render()
// * Integrate with our own loader
// * Parse <template> as well, so that a single SFC parser is used
// * Various other tweaks that I forget

const babel = require('@babel/core');
const generate = require('@babel/generator').default;
const cutils = require('@vue/component-compiler-utils');
const {parseExpression} = require('@babel/parser');
const {Parser: HTMLParser} = require('htmlparser2');

const t = babel.types;
const lineBreakG = /\r\n?|[\n\u2028\u2029]/g;

// vue-next/packages/shared/src/makeMap.ts
function makeMap(str) {
  const map = Object.create(null)
  const list = str.split(',')
  for (let i = 0; i < list.length; i++) {
    map[list[i]] = true
  }
  return val => !!map[val]
}

// vue-next/packages/shared/src/domTagConfig.ts
const HTML_TAGS =
  'html,body,base,head,link,meta,style,title,address,article,aside,footer,' +
  'header,h1,h2,h3,h4,h5,h6,nav,section,div,dd,dl,dt,figcaption,' +
  'figure,picture,hr,img,li,main,ol,p,pre,ul,a,b,abbr,bdi,bdo,br,cite,code,' +
  'data,dfn,em,i,kbd,mark,q,rp,rt,ruby,s,samp,small,span,strong,sub,sup,' +
  'time,u,var,wbr,area,audio,map,track,video,embed,object,param,source,' +
  'canvas,script,noscript,del,ins,caption,col,colgroup,table,thead,tbody,td,' +
  'th,tr,button,datalist,fieldset,form,input,label,legend,meter,optgroup,' +
  'option,output,progress,select,textarea,details,dialog,menu,' +
  'summary,template,blockquote,iframe,tfoot'

// vue-next/packages/shared/src/domTagConfig.ts
const SVG_TAGS =
  'svg,animate,animateMotion,animateTransform,circle,clipPath,color-profile,' +
  'defs,desc,discard,ellipse,feBlend,feColorMatrix,feComponentTransfer,' +
  'feComposite,feConvolveMatrix,feDiffuseLighting,feDisplacementMap,' +
  'feDistanceLight,feDropShadow,feFlood,feFuncA,feFuncB,feFuncG,feFuncR,' +
  'feGaussianBlur,feImage,feMerge,feMergeNode,feMorphology,feOffset,' +
  'fePointLight,feSpecularLighting,feSpotLight,feTile,feTurbulence,filter,' +
  'foreignObject,g,hatch,hatchpath,image,line,linearGradient,marker,mask,' +
  'mesh,meshgradient,meshpatch,meshrow,metadata,mpath,path,pattern,' +
  'polygon,polyline,radialGradient,rect,set,solidcolor,stop,switch,symbol,' +
  'text,textPath,title,tspan,unknown,use,view'

// vue-next/packages/shared/src/domTagConfig.ts
const VOID_TAGS =
  'area,base,br,col,embed,hr,img,input,link,meta,param,source,track,wbr'

// vue-next/packages/shared/src/domTagConfig.ts
const isHTMLTag = makeMap(HTML_TAGS)
const isSVGTag = makeMap(SVG_TAGS)
const isVoidTag = makeMap(VOID_TAGS)

// vue-next/packages/shared/src/index.ts
const camelizeRE = /-(\w)/g

// vue-next/packages/shared/src/index.ts
const camelize = str => str.replace(camelizeRE, (_, c) => (c ? c.toUpperCase() : ''));

// vue-next/packages/shared/src/index.ts
const capitalize = str => str.charAt(0).toUpperCase() + str.slice(1)

// babel/packages/babel-parser/src/util/whitespace.js
function getLineInfo(input, offset) {
  let line = 1;
  let lineStart = 0;
  let match;
  lineBreakG.lastIndex = 0;
  while ((match = lineBreakG.exec(input)) && match.index < offset) {
    line++;
    lineStart = lineBreakG.lastIndex;
  }

  return {line, column: offset - lineStart};
}

function shiftSourceMap(ast, loc) {
  const seen = new Set();

  babel.traverse(ast, {
    enter(path) {
      if (path.node.loc) {
        const {start, end} = path.node.loc;

        if (!seen.has(start)) {
          seen.add(start);
          if (start.line === 1) {
            start.line = loc.line;
            start.column += loc.column;
          } else {
            start.line += loc.line - 1;
          }
        }

        if (!seen.has(end)) {
          seen.add(end);
          if (end.line === 1) {
            end.line = loc.line;
            end.column += loc.column;
          } else {
            end.line += loc.line - 1;
          }
        }
      }
    }
  });
}

function parseSfcHtml(code, filename) {
  let templateLevel = 0
  let inScriptSetup = false
  let inScript = false
  let inTemplate = false

  const scriptSetup = {
    start: 0,
    end: 0,
    contentStart: 0,
    contentEnd: 0,
    content: '',
    attrs: {},
    found: false,
    ast: undefined,
  }
  const script = {
    start: 0,
    end: 0,
    contentStart: 0,
    contentEnd: 0,
    content: '',
    attrs: {},
    found: false,
    ast: undefined,
  }
  const template = {
    start: 0,
    end: 0,
    contentStart: 0,
    contentEnd: 0,
    content: '',
    attrs: {},
    found: false,
    components: new Set(),
    expressions: new Set(),
    identifiers: new Set()
  }

  const parser = new HTMLParser({
    onopentag(name, attributes) {
      if (!name)
        return

      if (name === 'template')
        templateLevel += 1

      if (templateLevel > 0) {
        if (name === 'template' && templateLevel === 1) {
          template.start = parser.startIndex
          template.contentStart = parser.endIndex + 1
          template.attrs = attributes
          template.found = true
          inTemplate = true
        }

        if (!isHTMLTag(name) && !isSVGTag(name) && !isVoidTag(name))
          template.components.add(capitalize(camelize(name)))
        Object.entries(attributes).forEach(([key, value]) => {
          if (!value)
            return
          if (key.startsWith('v-') || key.startsWith('@') || key.startsWith(':')) {
            if (key === 'v-for')
              // we strip out delectations for v-for before `in` or `of`
              template.expressions.add(`(${value.replace(/^.*\s(?:in|of)\s/, '')})`)
            else
              template.expressions.add(`(${value})`)
          }
          if (key === 'ref')
            template.identifiers.add(value)
        })
      }
      else {
        if (name === 'script') {
          if ('setup' in attributes) {
            scriptSetup.start = parser.startIndex
            scriptSetup.contentStart = parser.endIndex + 1
            scriptSetup.attrs = attributes
            scriptSetup.found = true
            inScriptSetup = true
          }
          else {
            script.start = parser.startIndex
            script.contentStart = parser.endIndex + 1
            script.attrs = attributes
            script.found = true
            inScript = true
          }
        }
      }
    },
    ontext(text) {
      if (templateLevel > 0) {
        Array.from(text.matchAll(/\{\{(.*?)\}\}/g)).forEach(([, expression]) => {
          template.expressions.add(`(${expression})`)
        })
      }
    },
    onclosetag(name) {
      if (name === 'template')
        templateLevel -= 1

      if (inScriptSetup && name === 'script') {
        scriptSetup.end = parser.endIndex + 1
        scriptSetup.contentEnd = parser.startIndex
        scriptSetup.content = code.slice(scriptSetup.contentStart, scriptSetup.contentEnd)
        inScriptSetup = false
      }
      if (inScript && name === 'script') {
        script.end = parser.endIndex + 1
        script.contentEnd = parser.startIndex
        script.content = code.slice(script.contentStart, script.contentEnd)
        inScript = false
      }
      if (inTemplate && name === 'template' && templateLevel === 0) {
        template.end = parser.endIndex + 1
        template.contentEnd = parser.startIndex
        template.content = code.slice(template.contentStart, template.contentEnd);
        inTemplate = false
      }
    },
  }, {
    xmlMode: true,
    lowerCaseTags: false,
    lowerCaseAttributeNames: false,
    recognizeSelfClosing: true,
  })

  parser.write(code)
  parser.end()

  template.expressions.forEach((exp) => {
    const nodes = babel.parse(exp).program.body
    nodes.forEach(node => getIdentifierUsages(node, template.identifiers))
  })

  if (script.found && scriptSetup.found && scriptSetup.attrs.lang !== script.attrs.lang)
    throw new SyntaxError('<script setup> language must be the same as <script>')

  const parserOptions = {
    sourceType: 'module',
    sourceMaps: true,
    plugins: [],
  }

  const lang = scriptSetup.attrs.lang || script.attrs.lang || 'js'
  if (lang === 'ts')
    parserOptions.plugins.push('typescript')
  else if (lang === 'jsx')
    parserOptions.plugins.push('jsx')
  else if (lang === 'tsx')
    parserOptions.plugins.push('typescript', 'jsx')
  else if (lang !== 'js')
    throw new SyntaxError(`Unsupported script language: ${lang}`)

  scriptSetup.ast = babel.parse(scriptSetup.content, parserOptions)
  script.ast = babel.parse(script.content || '', parserOptions)

  const scriptLoc = getLineInfo(code, script.contentStart);
  const scriptSetupLoc = getLineInfo(code, scriptSetup.contentStart);

  shiftSourceMap(script.ast, scriptLoc);
  shiftSourceMap(scriptSetup.ast, scriptSetupLoc);

  return {
    filename,
    template,
    scriptSetup,
    script,
    parserOptions,
    extraDeclarations: [],
  }
}

// antfu/utils/utils/src/array.ts 
function partition(array, ...filters) {
  const result = new Array(filters.length + 1).fill(null).map(() => [])

  array.forEach((e, idx, arr) => {
    let i = 0
    for (const filter of filters) {
      if (filter(e, idx, arr)) {
        result[i].push(e)
        return
      }
      i += 1
    }
    result[i].push(e)
  })

  return result
}

function getIdentifierDeclarations(nodes, identifiers = new Set()) {
  for (let node of nodes) {
    if (node.type === 'ExportNamedDeclaration') {
      node = node.declaration
      if (!node)
        continue
    }
    if (node.type === 'ImportDeclaration') {
      for (const specifier of node.specifiers)
        identifiers.add(specifier.local.name)
    }
    else if (node.type === 'VariableDeclaration') {
      function handleVariableId(node) {
        if (node.type === 'Identifier') {
          identifiers.add(node.name)
        }
        else if (node.type === 'ObjectPattern') {
          for (const property of node.properties) {
            if (property.type === 'ObjectProperty')
              handleVariableId(property.value)
            else if (property.type === 'RestElement' && property.argument.type === 'Identifier')
              identifiers.add(property.argument.name)
          }
        }
        else if (node.type === 'ArrayPattern') {
          for (const element of node.elements) {
            if (element?.type === 'Identifier')
              identifiers.add(element.name)
            else if (element?.type === 'RestElement' && element.argument.type === 'Identifier')
              identifiers.add(element.argument.name)
            else if (element?.type === 'ObjectPattern' || element?.type === 'ArrayPattern')
              handleVariableId(element)
          }
        }
      }

      for (const declarator of node.declarations)
        handleVariableId(declarator.id)
    }
    else if (node.type === 'FunctionDeclaration' || node.type === 'ClassDeclaration') {
      if (node.id)
        identifiers.add(node.id.name)
    }
    else if (node.type === 'TSEnumDeclaration') {
      if (node.id)
        identifiers.add(node.id.name)
    }
  }
  return identifiers
}

// modified from https://github.com/vuejs/vue-next/blob/main/packages/compiler-sfc/src/compileScript.ts

// Special compiler macros
const DEFINE_PROPS = 'defineProps'
const DEFINE_EMITS = 'defineEmits'
const DEFINE_EXPOSE = 'defineExpose'
const WITH_DEFAULTS = 'withDefaults'

function applyMacros(nodes) {
  let hasDefinePropsCall = false
  let hasDefineEmitCall = false
  let hasDefineExposeCall = false
  let propsRuntimeDecl
  let propsRuntimeDefaults
  let propsTypeDecl
  let propsTypeDeclRaw
  let emitsRuntimeDecl
  let emitsTypeDecl
  let emitsTypeDeclRaw
  let exposeRuntimeDecl

  // props/emits declared via types
  const typeDeclaredProps = {}
  // record declared types for runtime props type generation
  const declaredTypes = {}

  function error(msg, node) {
    throw new Error(msg)
  }

  function processDefineProps(node) {
    if (!isCallOf(node, DEFINE_PROPS))
      return false

    if (hasDefinePropsCall)
      error(`duplicate ${DEFINE_PROPS}() call`, node)

    hasDefinePropsCall = true

    propsRuntimeDecl = node.arguments[0]

    // call has type parameters - infer runtime types from it
    if (node.typeParameters) {
      if (propsRuntimeDecl) {
        error(
          `${DEFINE_PROPS}() cannot accept both type and non-type arguments `
            + 'at the same time. Use one or the other.',
          node,
        )
      }

      propsTypeDeclRaw = node.typeParameters.params[0]
      propsTypeDecl = resolveQualifiedType(
        propsTypeDeclRaw,
        node => node.type === 'TSTypeLiteral',
      )

      if (!propsTypeDecl) {
        error(
          `type argument passed to ${DEFINE_PROPS}() must be a literal type, `
            + 'or a reference to an interface or literal type.',
          propsTypeDeclRaw,
        )
      }
    }

    return true
  }

  function processWithDefaults(node) {
    if (!isCallOf(node, WITH_DEFAULTS))
      return false

    if (processDefineProps(node.arguments[0])) {
      if (propsRuntimeDecl) {
        error(
          `${WITH_DEFAULTS} can only be used with type-based `
            + `${DEFINE_PROPS} declaration.`,
          node,
        )
      }
      propsRuntimeDefaults = node.arguments[1]
    }
    else {
      error(
        `${WITH_DEFAULTS}' first argument must be a ${DEFINE_PROPS} call.`,
        node.arguments[0] || node,
      )
    }
    return true
  }

  function processDefineEmits(node) {
    if (!isCallOf(node, DEFINE_EMITS))
      return false

    if (hasDefineEmitCall)
      error(`duplicate ${DEFINE_EMITS}() call`, node)

    hasDefineEmitCall = true
    emitsRuntimeDecl = node.arguments[0]
    if (node.typeParameters) {
      if (emitsRuntimeDecl) {
        error(
          `${DEFINE_EMITS}() cannot accept both type and non-type arguments `
            + 'at the same time. Use one or the other.',
          node,
        )
      }

      emitsTypeDeclRaw = node.typeParameters.params[0]
      emitsTypeDecl = resolveQualifiedType(
        emitsTypeDeclRaw,
        node => node.type === 'TSFunctionType' || node.type === 'TSTypeLiteral',
      )

      if (!emitsTypeDecl) {
        error(
          `type argument passed to ${DEFINE_EMITS}() must be a function type, `
            + 'a literal type with call signatures, or a reference to the above types.',
          emitsTypeDeclRaw,
        )
      }
    }
    return true
  }

  function resolveQualifiedType(node, qualifier) {
    if (qualifier(node))
      return node

    if (
      node.type === 'TSTypeReference'
      && node.typeName.type === 'Identifier'
    ) {
      const refName = node.typeName.name
      const isQualifiedType = node => {
        if (
          node.type === 'TSInterfaceDeclaration'
          && node.id.name === refName
        )
          return node.body

        else if (
          node.type === 'TSTypeAliasDeclaration'
          && node.id.name === refName
          && qualifier(node.typeAnnotation)
        )
          return node.typeAnnotation

        else if (node.type === 'ExportNamedDeclaration' && node.declaration)
          return isQualifiedType(node.declaration)
      }

      for (const node of nodes) {
        const qualified = isQualifiedType(node)
        if (qualified)
          return qualified
      }
    }
  }

  function processDefineExpose(node) {
    if (!isCallOf(node, DEFINE_EXPOSE))
      return false

    if (hasDefineExposeCall)
      error(`duplicate ${DEFINE_EXPOSE}() call`, node)

    hasDefineExposeCall = true;
    exposeRuntimeDecl = node.arguments[0]

    return true
  }

  function genRuntimeProps(props) {
    const keys = Object.keys(props)
    if (!keys.length)
      return undefined

    // check defaults. If the default object is an object literal with only
    // static properties, we can directly generate more optimzied default
    // decalrations. Otherwise we will have to fallback to runtime merging.
    const hasStaticDefaults = propsRuntimeDefaults
      && propsRuntimeDefaults.type === 'ObjectExpression'
      && propsRuntimeDefaults.properties.every(
        node => node.type === 'ObjectProperty' && !node.computed,
      )

    return t.objectExpression(
      Object.entries(props).map(([key, value]) => {
        if (value.type === 'null')
          return t.objectProperty(t.identifier(key), t.nullLiteral())

        const prop = hasStaticDefaults
          ? propsRuntimeDefaults.properties.find(node => node.key.name === key)
          : undefined

        if (prop)
          value.required = false

        const entries = Object.entries(value).map(([key, value]) => key === 'type'
          ? t.objectProperty(t.identifier(key), typeof value === 'string' ? t.identifier(value) : t.arrayExpression(value.map((i) => t.identifier(i))))
          : t.objectProperty(t.identifier(key), parseExpression(JSON.stringify(value))),
        )

        if (prop)
          entries.push(t.objectProperty(t.identifier('default'), prop.value))

        return t.objectProperty(
          t.identifier(key),
          t.objectExpression(entries),
        )
      }),
    )
  }

  function getProps() {
    if (propsRuntimeDecl)
      return propsRuntimeDecl

    if (propsTypeDecl) {
      extractRuntimeProps(propsTypeDecl, typeDeclaredProps, declaredTypes)
      return genRuntimeProps(typeDeclaredProps)
    }
  }

  function throwIfAwait(node) {
    if (node.type === 'AwaitExpression')
      error('top-level await is not supported in Vue 2', node)
  }

  nodes = nodes
    .map((raw) => {
      let node = raw
      if (raw.type === 'ExpressionStatement')
        node = raw.expression

      if (node.type === 'VariableDeclaration' && !node.declare) {
        const total = node.declarations.length
        for (let i = 0; i < total; i++) {
          const decl = node.declarations[i]
          if (decl.init) {
            if (processDefineEmits(decl.init))
              decl.init = t.memberExpression(t.identifier('__ctx'), t.identifier('emit'))
            else if (processDefineProps(decl.init) || processWithDefaults(decl.init))
              decl.init = t.identifier('__props')
            else
              throwIfAwait(decl.init)
          }
        }
      }

      if (processDefineEmits(node) || processDefineProps(node) || processDefineExpose(node))
        return null

      throwIfAwait(node)

      return raw
    })
    .filter(Boolean)

  return {
    nodes,
    props: getProps(),
    expose: exposeRuntimeDecl,
  }
}

function isCallOf(node, test) {
  return !!(
    node
    && node.type === 'CallExpression'
    && node.callee.type === 'Identifier'
    && (typeof test === 'string'
      ? node.callee.name === test
      : test(node.callee.name))
  )
}

function extractRuntimeProps(node, props, declaredTypes) {
  const members = node.type === 'TSTypeLiteral' ? node.members : node.body
  for (const m of members) {
    if (
      (m.type === 'TSPropertySignature' || m.type === 'TSMethodSignature')
      && m.key.type === 'Identifier'
    ) {
      let type
      if (m.type === 'TSMethodSignature') {
        type = ['Function']
      }
      else if (m.typeAnnotation) {
        type = inferRuntimeType(
          m.typeAnnotation.typeAnnotation,
          declaredTypes,
        )
      }
      props[m.key.name] = {
        key: m.key.name,
        required: !m.optional,
        type: type?.length === 1 ? type[0] : type || 'null',
      }
    }
  }
}

function inferRuntimeType(node, declaredTypes) {
  switch (node.type) {
    case 'TSStringKeyword':
      return ['String']
    case 'TSNumberKeyword':
      return ['Number']
    case 'TSBooleanKeyword':
      return ['Boolean']
    case 'TSObjectKeyword':
      return ['Object']
    case 'TSTypeLiteral':
      // TODO (nice to have) generate runtime property validation
      return ['Object']
    case 'TSFunctionType':
      return ['Function']
    case 'TSArrayType':
    case 'TSTupleType':
      // TODO (nice to have) generate runtime element type/length checks
      return ['Array']

    case 'TSLiteralType':
      switch (node.literal.type) {
        case 'StringLiteral':
          return ['String']
        case 'BooleanLiteral':
          return ['Boolean']
        case 'NumericLiteral':
        case 'BigIntLiteral':
          return ['Number']
        default:
          return ['null']
      }

    case 'TSTypeReference':
      if (node.typeName.type === 'Identifier') {
        if (declaredTypes[node.typeName.name])
          return declaredTypes[node.typeName.name]

        switch (node.typeName.name) {
          case 'Array':
          case 'Function':
          case 'Object':
          case 'Set':
          case 'Map':
          case 'WeakSet':
          case 'WeakMap':
            return [node.typeName.name]
          case 'Record':
          case 'Partial':
          case 'Readonly':
          case 'Pick':
          case 'Omit':
          case 'Exclude':
          case 'Extract':
          case 'Required':
          case 'InstanceType':
            return ['Object']
        }
      }
      return ['null']

    case 'TSParenthesizedType':
      return inferRuntimeType(node.typeAnnotation, declaredTypes)
    case 'TSUnionType':
      return [
        ...new Set(
          [].concat(
            ...(node.types.map(t => inferRuntimeType(t, declaredTypes))),
          ),
        ),
      ]
    case 'TSIntersectionType':
      return ['Object']

    default:
      return ['null'] // no runtime check
  }
}

function getIdentifierUsages(node, identifiers = new Set()) {
  if (!node)
    return identifiers

  if (node.type === 'BlockStatement') {
    node.body.forEach(child => getIdentifierUsages(child, identifiers))
  }
  else if (node.type === 'ExpressionStatement') {
    getIdentifierUsages(node.expression, identifiers)
  }
  else if (node.type === 'Identifier') {
    identifiers.add(node.name)
  }
  else if (node.type === 'MemberExpression') {
    getIdentifierUsages(node.object, identifiers)
  }
  else if (node.type === 'CallExpression') {
    getIdentifierUsages(node.callee, identifiers)
    node.arguments.forEach(arg => getIdentifierUsages(arg, identifiers))
  }
  else if (node.type === 'BinaryExpression' || node.type === 'LogicalExpression') {
    getIdentifierUsages(node.left, identifiers)
    getIdentifierUsages(node.right, identifiers)
  }
  else if (node.type === 'UnaryExpression') {
    getIdentifierUsages(node.argument, identifiers)
  }
  else if (node.type === 'ForOfStatement' || node.type === 'ForInStatement') {
    getIdentifierUsages(node.right, identifiers)
  }
  else if (node.type === 'ConditionalExpression') {
    getIdentifierUsages(node.test, identifiers)
    getIdentifierUsages(node.consequent, identifiers)
    getIdentifierUsages(node.alternate, identifiers)
  }
  else if (node.type === 'ObjectExpression') {
    node.properties.forEach((prop) => {
      if (prop.type === 'ObjectProperty') {
        if (prop.computed)
          getIdentifierUsages(prop.key, identifiers)
        getIdentifierUsages(prop.value, identifiers)
      }
      else if (prop.type === 'SpreadElement') {
        getIdentifierUsages(prop, identifiers)
      }
    })
  }
  else if (node.type === 'ArrayExpression') {
    node.elements.forEach(element => getIdentifierUsages(element, identifiers))
  }
  else if (node.type === 'SpreadElement' || node.type === 'ReturnStatement') {
    getIdentifierUsages(node.argument, identifiers)
  }
  else if (node.type === 'NewExpression') {
    getIdentifierUsages(node.callee, identifiers)
    node.arguments.forEach(arg => getIdentifierUsages(arg, identifiers))
  }
  else if (node.type === 'ArrowFunctionExpression' || node.type === 'FunctionDeclaration' || node.type === 'FunctionExpression') {
    getIdentifierUsages(node.body, identifiers)
  }
  else if (node.type === 'TemplateLiteral') {
    node.expressions.forEach(expr => getIdentifierUsages(expr, identifiers))
  }
  // else {
  //   console.log(node)
  // }
  return identifiers
}

function parseSfcJavascript(sfc) {
  const { scriptSetup, script, template, filename } = sfc;

  const { nodes: body, props, expose } = applyMacros(scriptSetup.ast.program.body)

  const [hoisted, setupBody] = partition(
    body,
    n => n.type === 'ImportDeclaration'
     || n.type === 'ExportNamedDeclaration'
     || n.type.startsWith('TS'),
  )

  // get all identifiers in `<script setup>`
  const declarations = new Set()
  getIdentifierDeclarations(hoisted, declarations)
  getIdentifierDeclarations(setupBody, declarations)

  // filter out identifiers that are used in `<template>`
  const returns = Array.from(declarations)
    .filter(Boolean)
    .filter(i => template.identifiers.has(i))
    .map((i) => {
      const id = t.identifier(i)
      return t.objectProperty(id, id, false, true)
    }).concat(
      expose ? expose.properties : []
    );

  const components = Array.from(declarations)
    .filter(Boolean)
    .filter(i => template.components.has(i)
      || template.components.has(camelize(i))
      || template.components.has(capitalize(camelize(i))),
    )

  // append `<script setup>` imports to `<script>`

  const __sfc = t.identifier('__sfc_main')

  let hasBody = false

  const bodyNodes = script.ast.program.body.map(node => {
    // replace `export default` with a temproray variable
    // `const __sfc_main = { ... }`
    if (node.type === 'ExportDefaultDeclaration') {
      hasBody = true
      return t.variableDeclaration('const', [
        t.variableDeclarator(
          __sfc,
          node.declaration,
        ),
      ])
    }
    return node
  })

  let ast = t.file(
      t.program([
      ...sfc.extraDeclarations,
      ...hoisted,
      ...bodyNodes,
    ])
  )

  ast.sourceFile = filename;

  // inject `const __sfc_main = {}` if `<script>` has default export
  if (!hasBody) {
    ast.program.body.push(
      t.variableDeclaration('const', [
        t.variableDeclarator(
          __sfc,
          t.objectExpression([]),
        ),
      ]),
    )
  }

  // inject props function
  // `__sfc_main.props = { ... }`
  if (props) {
    hasBody = true
    ast.program.body.push(
      t.expressionStatement(
        t.assignmentExpression('=',
          t.memberExpression(__sfc, t.identifier('props')),
          props,
        ),
      ),
    )
  }

  // inject setup function
  // `__sfc_main.setup = () => {}`
  if (body.length) {
    hasBody = true
    const returnStatement = t.returnStatement(
      t.objectExpression(returns),
    )

    ast.program.body.push(
      t.expressionStatement(
        t.assignmentExpression('=',
          t.memberExpression(__sfc, t.identifier('setup')),
          t.arrowFunctionExpression([
            t.identifier('__props'),
            t.identifier('__ctx'),
          ], t.blockStatement([
            ...setupBody,
            returnStatement,
          ])),
        ),
      ),
    )
  }

  // inject components
  // `__sfc_main.components = Object.assign({ ... }, __sfc_main.components)`
  if (components.length) {
    hasBody = true
    const componentsObject = t.objectExpression(
      components.map((i) => {
        const id = t.identifier(i)
        return t.objectProperty(id, id, false, true)
      }),
    )

    ast.program.body.push(
      t.expressionStatement(
        t.assignmentExpression('=',
          t.memberExpression(__sfc, t.identifier('components')),
          t.callExpression(
            t.memberExpression(t.identifier('Object'), t.identifier('assign')),
            [
              componentsObject,
              t.memberExpression(__sfc, t.identifier('components')),
            ],
          ),
        ),
      ),
    )
  }

  if (!hasBody) {
    return {
      ast: null,
      code: '',
    }
  }

  // re-export
  // `export default __sfc_main`
  ast.program.body.push(
    t.exportDefaultDeclaration(__sfc),
  )

  return ast;
}

function removeSourceMap(ast) {
  babel.traverse(ast, {
    enter(path) {
      if (path.node.loc) delete path.node.loc;
    }
  });
}

function getRenderFunctionDeclaration(ast) {
  const expr = ast.program.body[0].declarations[0].init;
  return t.functionDeclaration(t.identifier('render'), expr.params, expr.body);
}

function getStaticRenderFunctionExpressions(ast) {
  return ast.program.body[1].declarations[0].init;
}

function addRenderFunction(ast, renderFunctionDeclr, staticRenderArrayExpr, isFunctional) {
  if (renderFunctionDeclr) {
    ast.body.push(renderFunctionDeclr);
    ast.body.push(t.expressionStatement(
      t.assignmentExpression('=',
        t.memberExpression(t.identifier('__sfc_main'), t.identifier('render')),
        t.logicalExpression('||',
          t.memberExpression(t.identifier('__sfc_main'), t.identifier('render')),
          t.identifier('render')
        )
      )
    ));
  }

  if (staticRenderArrayExpr) {
    ast.body.push(t.expressionStatement(
      t.assignmentExpression('=',
        t.memberExpression(t.identifier('__sfc_main'), t.identifier('staticRenderFns')),
        staticRenderArrayExpr
      )
    ));
  }

  if (isFunctional) {
    ast.body.push(t.expressionStatement(
      t.assignmentExpression('=',
        t.memberExpression(t.identifier('__sfc_main'), t.identifier('functional')),
        t.identifier('true')
      )
    ));
  }
}

module.exports = function (vueSource, vueFilename) {
  const compiler = module.exports.compiler || require('vue-template-compiler');
  const sfc = parseSfcHtml(vueSource, vueFilename);
  const whitespace = 'condense' in sfc.template.attrs ? 'condense' : 'preserve';
  const isFunctional = 'functional' in sfc.template.attrs;
  const {code, tips, errors} = sfc.template.found ? cutils.compileTemplate({
    source: sfc.template.content,
    compiler,
    isFunctional,
    isProduction: true, // just disables prettifying render functions as of 2.2.0
    compilerOptions: {outputSourceRange: true, whitespace},
    transpileOptions: {transforms: {spreadRest: false}}
  }) : {};

  let renderFunctionDeclr, staticRenderArrayExpr;

  if (code) {
    const ast = babel.parse(code);
    removeSourceMap(ast);
    renderFunctionDeclr = getRenderFunctionDeclaration(ast);
    staticRenderArrayExpr = getStaticRenderFunctionExpressions(ast);
  }

  const ast = parseSfcJavascript(sfc);

  addRenderFunction(ast.program, renderFunctionDeclr, staticRenderArrayExpr, isFunctional);

  return {
    babel: generate(ast, {sourceMaps: true, filename: vueFilename, sourceFileName: vueFilename, sourceMapTarget: vueFilename}),
    tips,
    errors,
    template: sfc.template
  };
};

module.exports.registerCompiler = c => module.exports.compiler = c;
