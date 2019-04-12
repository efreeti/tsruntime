
import * as ts from 'typescript';
import { Types } from './types';
import * as tse from './typescript-extended';
import * as descriptors from './transformer.descriptors.types';
import {mapClassProperties, mapParentClassReferenceTargets} from "./transformer.ast.mappers";
import {
  createParentClassDecorator,
  createShorthandPropertyDecorator,
  createTypeDecorator
} from "./transformer.ast.builders";
import {isReflective, isShorthandPropertyDeclaration} from "./transformer.ast.predicates";
import {normalizeUnion} from "./transformer.descriptors.normalizers";


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


  function serializeInterface(type: ts.InterfaceType, ctx: Ctx): descriptors.Type {
    const symbol = type.getSymbol()!
    if (symbol.valueDeclaration === undefined) {
      return { kind: Types.TypeKind.Interface, name: symbol.getName(), arguments: [] }
    }

    const typeName = getIdentifierForSymbol(type, ctx)
    return { kind: Types.TypeKind.Reference, type: typeName, arguments: [] }
  }

  function serializeReference(type: ts.TypeReference, ctx: Ctx): descriptors.Type {
    const typeArgs = type.typeArguments;
    let allTypes: descriptors.Type[] = [];
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
  function serializeClass(type: ts.InterfaceTypeWithDeclaredMembers, allprops: ReadonlyArray<ts.PropertyName>, ctx: Ctx): descriptors.Type {

    const base = type.getBaseTypes()!
    let extendsCls: descriptors.Type | undefined;
    if (base.length > 0) {
      extendsCls = serializeType(base[0], ctx)
    }

    return { kind: Types.TypeKind.Class, name: type.getSymbol()!.getName(), props: allprops, extends: extendsCls }
  }

  function serializeObject(type: ts.ObjectType, ctx: Ctx): descriptors.Type {
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



  function serializeUnion(type: ts.UnionType, ctx: Ctx): descriptors.Type {
    const nestedTypes = type.types.map(t => serializeType(t, ctx))
    const normalizedTypes = normalizeUnion(nestedTypes)
    return { kind: Types.TypeKind.Union, types: normalizedTypes }
  }

  function serializeType(type: ts.Type, ctx: Ctx): descriptors.Type {
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

  function visitPropertyDeclaration(node: tse.PropertyDeclaration) {
    const serializedType = serializeType(checker.getTypeAtLocation(node), { node })
    const newNode = ts.getMutableClone(node);

    if (node.initializer !== undefined) {
      serializedType.initializer = ts.createArrowFunction(
				undefined, undefined, [], undefined, undefined, node.initializer
      )
    }

    newNode.decorators = ts.createNodeArray<ts.Decorator>([
			...(node.decorators || []), createTypeDecorator(serializedType)
		]);

    return newNode
  }

  function visitConstructorParameterDeclaration(node: ts.ParameterDeclaration) {
  	if (isShorthandPropertyDeclaration(node)) {
      const serializedType = serializeType(checker.getTypeAtLocation(node), {node})
      const newNode = ts.getMutableClone(node);

      if (node.initializer !== undefined) {
        serializedType.initializer = ts.createArrowFunction(
					undefined, undefined, [], undefined, undefined, node.initializer
        );
      }

      newNode.decorators = ts.createNodeArray<ts.Decorator>([
				...(node.decorators || []), createShorthandPropertyDecorator(<ts.Identifier>node.name, serializedType)
      ]);

      return newNode
    } else {
  	  return node;
    }
  }

  function visitConstructorDeclaration(node: ts.ConstructorDeclaration) {
    const newNode = ts.getMutableClone(node);

    newNode.parameters = ts.visitNodes(node.parameters, param => visitConstructorParameterDeclaration(
			<ts.ParameterDeclaration>param
    ));

    return newNode
  }

  function visitClassMember(node: ts.Node) {
    switch (node.kind) {
      case ts.SyntaxKind.PropertyDeclaration:
        return visitPropertyDeclaration(<tse.PropertyDeclaration>node)
      case ts.SyntaxKind.Constructor:
        return visitConstructorDeclaration(<ts.ConstructorDeclaration>node)
      default:
        return node
    }
  }

  function visitClassDeclaration(node: tse.ClassDeclaration) {
    if (!isReflective(node, checker)) {
      return node
    }
		const allProperties = mapClassProperties<ts.PropertyName>(node, node => {
		  switch (node.kind) {
        case ts.SyntaxKind.PropertyDeclaration:
          return <ts.Identifier>node.name;
        default:
          return <ts.PropertyName>node.name;
      }
    });

    const type = checker.getTypeAtLocation(node)
    const newNode = ts.getMutableClone(node);

    newNode.members = ts.visitNodes(node.members, visitClassMember);
    newNode.decorators = ts.createNodeArray<ts.Decorator>([
			...(node.decorators || []),
      createTypeDecorator(serializeClass(
				<ts.InterfaceTypeWithDeclaredMembers>type, allProperties, { node }
			)),
      ...mapParentClassReferenceTargets(<ts.Type>type, target => createParentClassDecorator(
				getIdentifierForSymbol(target, { node })
			))
		]);

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
