import * as ts from 'typescript';
import * as tse from './typescript-extended'
import { isShorthandPropertyDeclaration, isSimpleTargetReference, isTypeReference } from "./transformer.ast.predicates";

function mapConstructorDeclarationProperties<T>(node: ts.ConstructorDeclaration, mapper: (node: ts.ParameterDeclaration) => T)
		: ReadonlyArray<T> {

	return (<ReadonlyArray<ts.ParameterDeclaration>>node.parameters).reduce((result, parameter) => {
		return isShorthandPropertyDeclaration(parameter) ? [...result, mapper(parameter)] : result;
	}, <ReadonlyArray<T>>[]);
}

export function mapClassProperties<T>(node: tse.ClassDeclaration, mapper: (node: tse.PropertyDeclaration | ts.ParameterDeclaration) => T)
		: ReadonlyArray<T> {

	return (<ReadonlyArray<ts.Node>>node.members).reduce((result, node) => {
		switch (node.kind) {
			case ts.SyntaxKind.PropertyDeclaration:
				return [...result, mapper(<tse.PropertyDeclaration>node)];
			case ts.SyntaxKind.Constructor:
				return [...result, ...mapConstructorDeclarationProperties(<ts.ConstructorDeclaration>node, mapper)];
			default:
				return result
		}
	}, <ReadonlyArray<T>>[]);
}

export function mapParentClassReferenceTargets<T>(node: ts.Type, mapper: (node: ts.GenericType) => T)
		: ReadonlyArray<T> {

	return (node.getBaseTypes() || []).reduce((result, base) => {
		return (isTypeReference(base) && isSimpleTargetReference(base)) ? [...result, mapper(base.target)] : result;
	}, <ReadonlyArray<T>>[]);
}