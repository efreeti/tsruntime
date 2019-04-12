import * as ts from 'typescript';
import { REFLECTIVE_KEY } from './types';

export function isObjectType(type: ts.Type): type is ts.ObjectType {
	return Boolean(type.flags & ts.TypeFlags.Object);
}

export function isTypeReference(type: ts.Type): type is ts.TypeReference {
	return isObjectType(type) && Boolean(type.objectFlags & ts.ObjectFlags.Reference);
}

export function isUnionOrIntersection(type: ts.Type): type is ts.UnionOrIntersectionType {
	return Boolean(type.flags & ts.TypeFlags.UnionOrIntersection);
}

export function isPropertyModifier(modifier: ts.Modifier) {
	return Boolean(
		modifier.kind & ts.SyntaxKind.PublicKeyword ||
		modifier.kind & ts.SyntaxKind.PrivateKeyword ||
		modifier.kind & ts.SyntaxKind.ProtectedKeyword ||
		modifier.kind & ts.SyntaxKind.ReadonlyKeyword
	);
}

export function hasPropertyModifiers(parameter: ts.ParameterDeclaration): boolean {
	return parameter.modifiers!.length > 0 && parameter.modifiers!.some(
		modifier => isPropertyModifier(modifier)
	);
}

export function isShorthandPropertyDeclaration(parameter: ts.ParameterDeclaration): boolean {
	return Boolean(parameter.name.kind & ts.SyntaxKind.Identifier) && hasPropertyModifiers(parameter);
}

export function isSimpleTargetReference(reference: ts.TypeReference): boolean {
	return !(reference.target.objectFlags & ts.ObjectFlags.Tuple) && Boolean(
		reference.target.getSymbol()!.valueDeclaration
	);
}

export function isReflective(node: ts.Node, checker: ts.TypeChecker): boolean {
	return (node.decorators || ts.createNodeArray([])).some(decorator => {
		const decoratorType = checker.getTypeAtLocation(decorator.expression);

		return (isUnionOrIntersection(decoratorType) ? decoratorType.types : [decoratorType]).some(
			type => type.getProperty(REFLECTIVE_KEY) !== undefined
		);
	});
}