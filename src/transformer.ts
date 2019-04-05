
import * as ts from 'typescript';
import { Types, TypeMetadataKey, SubclassMetadataKey, REFLECTIVE_KEY } from './types';
import * as tse from './typescript-extended'


namespace InternalTypes {
  export type Type = ClassType | InterfaceType | TupleType | ReferenceType | UnionType |
  Types.StringLiteralType | Types.NumberLiteralType | Types.ObjectType |  Types.SimpleType 
  

  export interface InterfaceType extends Types.BaseType {
    kind: Types.TypeKind.Interface
    name: string
    arguments: Type[]
  }


  export interface TupleType extends Types.BaseType {
    kind: Types.TypeKind.Tuple
    elementTypes: Type[]
  }


  export interface UnionType extends Types.BaseType {
    kind: Types.TypeKind.Union
    types: Type[]
  }
  export interface ReferenceType extends Types.BaseType {
    kind: Types.TypeKind.Reference
    type: ts.Identifier
    arguments: Type[]
  }

  export interface ClassType extends Types.BaseType {
    kind: Types.TypeKind.Class
    name: string
    props: ts.PropertyName[]
    extends?: Type
  }
}



type Ctx = {
  node: ts.Node
  // referencedSet: Set<string>
}

function getSymbolId(symb: ts.Symbol): number {
  return (symb as any as { id: number }).id
}

function writeWarning(node: ts.Node, msg: string) {
  const fname = node.getSourceFile().fileName;
  const location = node.getSourceFile().getLineAndCharacterOfPosition(node.getStart());
  const node_text = node.getText();
  console.warn(`\n\ntsruntime: ${msg}: ${fname} ${location.line}:${location.character}: ${node_text}\n`);
}

module Normalizers {
  function normalizeBooleans(types: InternalTypes.Type[]): InternalTypes.Type[] {
    let hasFalse = false;
    let hasTrue = false;
    let hasBoolean = false;

    for (const type of types) {
      switch (type.kind) {
        case Types.TypeKind.FalseLiteral:
          hasFalse = true
          break
        case Types.TypeKind.TrueLiteral:
          hasTrue = true
          break
        case Types.TypeKind.Boolean:
          hasBoolean = true
          break
      }
    }

    if (hasBoolean || (hasTrue && hasFalse)) {
      return [
        { kind: Types.TypeKind.Boolean }
      ]
    }
    return types
  }

  export function normalizeUnion(types: InternalTypes.Type[]) {
    const booleans: InternalTypes.Type[] = []
    const okTypes: InternalTypes.Type[] = []

    types.forEach(type => {

      switch (type.kind) {
        case Types.TypeKind.FalseLiteral:
        case Types.TypeKind.TrueLiteral:
        case Types.TypeKind.Boolean:
          booleans.push(type)
          break
        default:
          okTypes.push(type)
          break
      }
    })

    const normalizedTypes: InternalTypes.Type[] = []


    if (booleans.length > 0) {
      normalizedTypes.push(...normalizeBooleans(booleans))
    }

    return okTypes.concat(normalizedTypes)
  }

}

function getExpressionForPropertyName(name: ts.PropertyName): ts.Expression { //copied from typescript codebase (getExpressionForPropertyName)
  if (ts.isComputedPropertyName(name)) {
    throw new Error('is computed property')
  }

  if (ts.isIdentifier(name)) {
    return ts.createLiteral(ts.idText(name))
  }
  return name
}


function Transformer(program: ts.Program, context: ts.TransformationContext) {
  let ReferencedSet = new Set<number>()

  ////hack (99
  const emitResolver = (<tse.TransformationContext>context).getEmitResolver()
  const oldIsReferenced = emitResolver.isReferencedAliasDeclaration
  emitResolver.isReferencedAliasDeclaration = function (node: ts.Node, checkChildren?: boolean) {
    const res = oldIsReferenced(node, checkChildren)
    if (res === true) {
      return true
    }
    if (node.kind === ts.SyntaxKind.ImportSpecifier) {
      const name = (<ts.ImportSpecifier>node).name
      const origSymb = checker.getAliasedSymbol(checker.getSymbolAtLocation(name)!)
      // const symb = checker.getSymbolAtLocation(name)
      return ReferencedSet.has(getSymbolId(origSymb))
    }
    return true
  }
  // hack
  const checker = program.getTypeChecker()
  function makeLiteral(type: InternalTypes.Type) {
    const assigns = []
    const kindAssign = ts.createPropertyAssignment("kind", ts.createLiteral(type.kind))
    const kindAssignComment = ts.addSyntheticTrailingComment(kindAssign, ts.SyntaxKind.MultiLineCommentTrivia, Types.TypeKind[type.kind], false)
    assigns.push(kindAssignComment)
    if (type.initializer !== undefined) {
      assigns.push(ts.createPropertyAssignment("initializer", type.initializer))
    }


    switch (type.kind) {
      case Types.TypeKind.Interface:
        assigns.push(ts.createPropertyAssignment("name", ts.createLiteral(type.name)))
        assigns.push(ts.createPropertyAssignment("arguments", ts.createArrayLiteral(type.arguments.map(makeLiteral))))
        break
      case Types.TypeKind.Tuple:
        assigns.push(ts.createPropertyAssignment("elementTypes", ts.createArrayLiteral(type.elementTypes.map(makeLiteral))))
        break
      case Types.TypeKind.Union:
        assigns.push(ts.createPropertyAssignment("types", ts.createArrayLiteral(type.types.map(makeLiteral))))
        break
      case Types.TypeKind.StringLiteral:
      case Types.TypeKind.NumberLiteral:
        assigns.push(ts.createPropertyAssignment('value', ts.createLiteral(type.value)))
        break
      case Types.TypeKind.Reference:
        assigns.push(ts.createPropertyAssignment("type", type.type))
        assigns.push(ts.createPropertyAssignment("arguments", ts.createArrayLiteral(type.arguments.map(makeLiteral))))
        break
      case Types.TypeKind.Class:
        assigns.push(ts.createPropertyAssignment("name", ts.createLiteral(type.name)))
        assigns.push(ts.createPropertyAssignment("props", ts.createArrayLiteral(type.props.map(getExpressionForPropertyName))))
        if (type.extends !== undefined) {
          assigns.push(ts.createPropertyAssignment("extends", makeLiteral(type.extends)))
        }
        break
    }
    return ts.createObjectLiteral(assigns)
  }
  function getIdentifierForSymbol(type: ts.Type, ctx: Ctx): ts.Identifier {
    let name: string

    const typenode = checker.typeToTypeNode(type, ctx.node)

    switch (typenode.kind) {
      case ts.SyntaxKind.TypeReference:
        const typename = (<ts.TypeReferenceNode>typenode).typeName
        name = (<ts.Identifier>typename).text
        let origSymb = type.getSymbol()!
        if (origSymb.getFlags() & ts.SymbolFlags.Alias) {
          origSymb = checker.getAliasedSymbol(origSymb)
        }
        ReferencedSet.add(getSymbolId(origSymb))
        break
      default:
        name = type.getSymbol()!.getName()
    }
    const typeIdentifier = ts.createIdentifier(name)
    typeIdentifier.flags &= ~ts.NodeFlags.Synthesized;
    typeIdentifier.parent = currentScope;
    return typeIdentifier
  }


  function serializeInterface(type: ts.InterfaceType, ctx: Ctx): InternalTypes.Type {
    const symbol = type.getSymbol()!
    if (symbol.valueDeclaration === undefined) {
      return { kind: Types.TypeKind.Interface, name: symbol.getName(), arguments: [] }
    }

    const typeName = getIdentifierForSymbol(type, ctx)
    return { kind: Types.TypeKind.Reference, type: typeName, arguments: [] }
  }

  function serializeReference(type: ts.TypeReference, ctx: Ctx): InternalTypes.Type {
    const typeArgs = type.typeArguments;
    let allTypes: InternalTypes.Type[] = [];
    if (typeArgs !== undefined) {
      allTypes = typeArgs.map(t => serializeType(t, ctx))
    }
    const target = type.target;
    if (target.objectFlags & ts.ObjectFlags.Tuple) {
      return { kind: Types.TypeKind.Tuple, elementTypes: allTypes }
    }
    const symbol = target.getSymbol()!
    if (symbol.valueDeclaration === undefined) {
      return { kind: Types.TypeKind.Interface, name: symbol.getName(), arguments: allTypes }

    } else {
      const typeName = getIdentifierForSymbol(target, ctx)
      return { kind: Types.TypeKind.Reference, arguments: allTypes, type: typeName }
    }
  }
  function serializeClass(type: ts.InterfaceTypeWithDeclaredMembers, allprops: ts.PropertyName[], ctx: Ctx): InternalTypes.Type {

    const base = type.getBaseTypes()!
    let extendsCls: InternalTypes.Type | undefined;
    if (base.length > 0) {
      extendsCls = serializeType(base[0], ctx)
    }

    return { kind: Types.TypeKind.Class, name: type.getSymbol()!.getName(), props: allprops, extends: extendsCls }
  }

  function serializeObject(type: ts.ObjectType, ctx: Ctx): InternalTypes.Type {
    if (type.objectFlags & ts.ObjectFlags.Reference) {
      return serializeReference(<ts.TypeReference>type, ctx)
    } else if (type.objectFlags & ts.ObjectFlags.Interface) {
      return serializeInterface(<ts.InterfaceType>type, ctx)
    } else if (type.objectFlags & ts.ObjectFlags.Anonymous) {
      return { kind: Types.TypeKind.Reference, type: ts.createIdentifier("Object"), arguments: [] }
    }
    writeWarning(ctx.node, `unknown object type: ${checker.typeToString(type)}`)
    return { kind: Types.TypeKind.Unknown }
  }



  function serializeUnion(type: ts.UnionType, ctx: Ctx): InternalTypes.Type {
    const nestedTypes = type.types.map(t => serializeType(t, ctx))
    const normalizedTypes = Normalizers.normalizeUnion(nestedTypes)
    return { kind: Types.TypeKind.Union, types: normalizedTypes }
  }

  function serializeType(type: ts.Type, ctx: Ctx): InternalTypes.Type {
    if (type.flags & ts.TypeFlags.Any) {
      return { kind: Types.TypeKind.Any }
    } else if (type.flags & ts.TypeFlags.StringLiteral) {
      return { kind: Types.TypeKind.StringLiteral, value: (type as ts.StringLiteralType).value }
    } else if (type.flags & ts.TypeFlags.NumberLiteral) {
      return { kind: Types.TypeKind.NumberLiteral, value: (type as ts.NumberLiteralType).value }
    } else if (type.flags & ts.TypeFlags.String) {
      return { kind: Types.TypeKind.String }
    } else if (type.flags & ts.TypeFlags.Number) {
      return { kind: Types.TypeKind.Number }
    } else if (type.flags & ts.TypeFlags.Boolean) {
      return { kind: Types.TypeKind.Boolean }
    } else if (type.flags & ts.TypeFlags.BooleanLiteral) {
      switch ((type as any).intrinsicName) {
        case 'true':
          return { kind: Types.TypeKind.TrueLiteral }
        case 'false':
          return { kind: Types.TypeKind.FalseLiteral }
      }
    } else if (type.flags & ts.TypeFlags.ESSymbol) {
      return { kind: Types.TypeKind.ESSymbol }
    } else if (type.flags & ts.TypeFlags.Void) {
      return { kind: Types.TypeKind.Void }
    } else if (type.flags & ts.TypeFlags.Undefined) {
      return { kind: Types.TypeKind.Undefined }
    } else if (type.flags & ts.TypeFlags.Null) {
      return { kind: Types.TypeKind.Null }
    } else if (type.flags & ts.TypeFlags.Never) {
      return { kind: Types.TypeKind.Never }
    } else if (type.flags & ts.TypeFlags.Object) {
      return serializeObject(<ts.ObjectType>type, ctx)
    } else if (type.flags & ts.TypeFlags.Union) {
      return serializeUnion(<ts.UnionType>type, ctx)
    }
    writeWarning(ctx.node, `unknown type: ${checker.typeToString(type)}`)
    return { kind: Types.TypeKind.Unknown }
  }



  let currentScope: ts.SourceFile | ts.CaseBlock | ts.ModuleBlock | ts.Block;

  function combineDecorators(group1: ts.NodeArray<ts.Decorator> | undefined, group2: ts.NodeArray<ts.Decorator> | undefined) {
    let newDecorators = []
    if (group1 !== undefined) {
      newDecorators.push(...group1)
    }
    if (group2 !== undefined) {
      newDecorators.push(...group2)
    }
    return ts.createNodeArray<ts.Decorator>(newDecorators)
  }

  function createTypeDecorator(exp: any) {
    return ts.createNodeArray<ts.Decorator>([ts.createDecorator(ts.createCall(
      ts.createIdentifier('Reflect.metadata'), undefined, [ts.createLiteral(TypeMetadataKey), exp]
    ))])
  }

  function createParentClassDecorators(node: ts.InterfaceTypeWithDeclaredMembers, ctx: Ctx): ts.NodeArray<ts.Decorator> {
    return ts.createNodeArray<ts.Decorator>((node.getBaseTypes() || []).reduce((result, base) => {
      if (base.flags & ts.TypeFlags.Object && (<ts.ObjectType>base).objectFlags & ts.ObjectFlags.Reference) {
        const reference = <ts.TypeReference> base;
        const symbol = reference.target.getSymbol();

        if (!(reference.target.objectFlags & ts.ObjectFlags.Tuple) && symbol && symbol.valueDeclaration) {
          return result.concat([ts.createDecorator(
            ts.createFunctionExpression(
              undefined,
              undefined,
              undefined,
              undefined,
              [ts.createParameter(undefined, undefined, undefined, 'target')],
              undefined,
              ts.createBlock([
                ts.createStatement(
                  ts.createCall(ts.createIdentifier('Reflect.defineMetadata'), undefined, [
                    ts.createLiteral(SubclassMetadataKey),
                    ts.createArrayLiteral([
                      ts.createSpread(
                        ts.createLogicalOr(
                          ts.createCall(ts.createIdentifier('Reflect.getMetadata'), undefined, [
                            ts.createLiteral(SubclassMetadataKey),
                            getIdentifierForSymbol(reference.target, ctx)
                          ]),
                          ts.createArrayLiteral([])
                        )
                      ),
                      ts.createIdentifier('target')
                    ]),
                    getIdentifierForSymbol(reference.target, ctx)
                  ])
                )
              ])
            )
          )])
        } else {
          return result;
        }
      } else {
        return result;
      }
    }, <Array<ts.Decorator>>[]));
  }

  function visitPropertyDeclaration(node: tse.PropertyDeclaration, allprops: ts.PropertyName[]) {
    allprops.push(node.name)
    const type = checker.getTypeAtLocation(node)
    let serializedType = serializeType(type, { node })
    let initializerExp;
    if (node.initializer !== undefined) {
      initializerExp = ts.createArrowFunction(undefined, undefined, [], undefined, undefined, node.initializer)
    }
    serializedType.initializer = initializerExp
    const objLiteral = makeLiteral(serializedType)
    const newDecorators = combineDecorators(node.decorators, createTypeDecorator(objLiteral))
    let newNode = ts.getMutableClone(node);
    newNode.decorators = newDecorators
    return newNode
  }
  function visitClassMember(node: ts.Node, allprops: ts.PropertyName[]) {
    switch (node.kind) {
      case ts.SyntaxKind.PropertyDeclaration:
        return visitPropertyDeclaration(<tse.PropertyDeclaration>node, allprops)
      default:
        return node
    }
  }

  function shouldReflect(node: ts.Node) {
    if (node.decorators === undefined) {
      return false
    }
    for (const dec of node.decorators) {
      if (dec.kind == ts.SyntaxKind.Decorator) {

        const decType = checker.getTypeAtLocation(dec.expression)
        let typesToCheck: ts.Type[]
        if (decType.flags & ts.TypeFlags.UnionOrIntersection) {
          typesToCheck = (decType as ts.UnionOrIntersectionType).types
        } else {
          typesToCheck = [decType]
        }
        for (const t of typesToCheck) {
          if (t.getProperty(REFLECTIVE_KEY) !== undefined) {
            return true
          }
        }

      }
    }
    return false
  }



  function visitClassDeclaration(node: tse.ClassDeclaration) {
    if (!shouldReflect(node)) {
      return node
    }
    const allprops = new Array<ts.PropertyName>()

    const newMembers = ts.visitNodes(node.members, nod => visitClassMember(nod, allprops));

    const type = checker.getTypeAtLocation(node)
    let serializedType = serializeClass(<ts.InterfaceTypeWithDeclaredMembers>type, allprops, { node })

    const classTypeExp = makeLiteral(serializedType)

    const newNode = ts.getMutableClone(node);
    newNode.members = newMembers
    newNode.decorators = combineDecorators(
      combineDecorators(node.decorators, createTypeDecorator(classTypeExp)),
      createParentClassDecorators(<ts.InterfaceTypeWithDeclaredMembers>type, { node })
    )
    return newNode
  }
  function onBeforeVisitNode(node: ts.Node) {
    switch (node.kind) {
      case ts.SyntaxKind.SourceFile:
      case ts.SyntaxKind.ModuleBlock:
        currentScope = <ts.SourceFile | ts.CaseBlock | ts.ModuleBlock | ts.Block>node;
        // currentScopeFirstDeclarationsOfName = undefined;
        break;
    }
  }
  function visitor(node: ts.Node): ts.VisitResult<ts.Node> {
    onBeforeVisitNode(node)
    switch (node.kind) {
      case ts.SyntaxKind.ClassDeclaration:
        return visitClassDeclaration(<tse.ClassDeclaration>node)
      case ts.SyntaxKind.ModuleDeclaration:
      case ts.SyntaxKind.ModuleBlock:
      case ts.SyntaxKind.FunctionDeclaration:
      case ts.SyntaxKind.FunctionExpression:
      case ts.SyntaxKind.Block:
        return ts.visitEachChild(node, visitor, context)
      default:
        return node

    }
  }

  function transform(sourceI: ts.SourceFile): ts.SourceFile {
    ReferencedSet = new Set<number>()
    const source = sourceI as tse.SourceFile
    if (source.isDeclarationFile) {
      return source
    }
    onBeforeVisitNode(source)
    const newNode = ts.visitEachChild(source, visitor, context);
    newNode.symbol = source.symbol;
    return newNode

  }
  return transform
}



export default function TransformerFactory(program: ts.Program): ts.TransformerFactory<ts.SourceFile> {
  return (ctx: ts.TransformationContext) => Transformer(program, ctx)
}
