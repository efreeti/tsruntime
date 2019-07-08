import * as ts from 'typescript';
import {TypeMetadataKey, SubclassMetadataKey, ShorthandPropertiesMetadataKey, Types} from './types';
import * as descriptors from "./transformer.descriptors.types";

function createDecoratorFunction(targetParamName: string, body: ts.Expression) {
	const param = ts.createParameter(undefined, undefined, undefined, targetParamName);

	return ts.createFunctionExpression(
		undefined, undefined, undefined, undefined, [param], undefined, ts.createBlock([
			ts.createStatement(body)
		])
	);
}

function createMetadataCall(methodName: string, metadataKey: string, parameters: ReadonlyArray<ts.Expression>) {
	return ts.createCall(ts.createIdentifier(`Reflect.${methodName}`), undefined, [
		ts.createLiteral(metadataKey), ...parameters
	]);
}

function createConcreteTypeDescriptorPropertyAssignments(type: descriptors.Type) {
	switch (type.kind) {
		case Types.TypeKind.Interface:
			return [
				ts.createPropertyAssignment("name", ts.createLiteral(type.name)),
				ts.createPropertyAssignment("arguments", ts.createArrayLiteral(
					type.arguments.map(createTypeDescriptorLiteral)
				))
			];
		case Types.TypeKind.Tuple:
			return [
				ts.createPropertyAssignment("elementTypes", ts.createArrayLiteral(
					type.elementTypes.map(createTypeDescriptorLiteral)
				))
			];
		case Types.TypeKind.Union:
			return [
				ts.createPropertyAssignment("types", ts.createArrayLiteral(
					type.types.map(createTypeDescriptorLiteral)
				))
			];
		case Types.TypeKind.StringLiteral:
		case Types.TypeKind.NumberLiteral:
			return [
				ts.createPropertyAssignment('value', ts.createLiteral(type.value))
			];
		case Types.TypeKind.Reference:
			return [
				ts.createPropertyAssignment("type", type.type),
				ts.createPropertyAssignment("arguments", ts.createArrayLiteral(
					type.arguments.map(createTypeDescriptorLiteral)
				))
			];
		case Types.TypeKind.Class:
			return [
				ts.createPropertyAssignment("name", ts.createLiteral(type.name)),
				ts.createPropertyAssignment("props", ts.createArrayLiteral(
					type.props.map(name => ts.isIdentifier(name) ? ts.createLiteral(ts.idText(name)) : <ts.Expression>name)
				)),
				...(type.extends === undefined ? [] : [
					ts.createPropertyAssignment("extends", createTypeDescriptorLiteral(type.extends))
				])
			];
		default:
			return [];
	}
}

function createTypeDescriptorLiteral(type: descriptors.Type): ts.ObjectLiteralExpression {
	return ts.createObjectLiteral([
		ts.addSyntheticTrailingComment(
			ts.createPropertyAssignment("kind", ts.createLiteral(type.kind)),
			ts.SyntaxKind.MultiLineCommentTrivia,
			Types.TypeKind[type.kind],
			false
		),
		...(type.initializer === undefined ? [] : [
			ts.createPropertyAssignment("initializer", type.initializer)
		]),
		...createConcreteTypeDescriptorPropertyAssignments(type)
	]);
}

export function createTypeDecorator(type: descriptors.Type) {
	return ts.createDecorator(ts.createCall(
		ts.createIdentifier('Reflect.metadata'), undefined, [
			ts.createLiteral(TypeMetadataKey), createTypeDescriptorLiteral(type)
		]
	));
}

export function createParentClassDecorator(parent: ts.Identifier) {
	return ts.createDecorator(createDecoratorFunction('target', <ts.Expression>createMetadataCall(
		'defineMetadata', SubclassMetadataKey, <ReadonlyArray<ts.Expression>>[
			ts.createArrayLiteral([
				ts.createSpread(ts.createLogicalOr(
					createMetadataCall('getOwnMetadata', SubclassMetadataKey, <ReadonlyArray<ts.Expression>>[parent]),
					ts.createArrayLiteral([])
				)),
				ts.createIdentifier('target')
			]),
			parent
		]
	)));
}

export function createShorthandPropertyDecorator(propertyName: ts.Identifier, type: descriptors.Type) {
	return ts.createDecorator(createDecoratorFunction('target', <ts.Expression>createMetadataCall(
		'defineMetadata', ShorthandPropertiesMetadataKey, <ReadonlyArray<ts.Expression>>[
			ts.createObjectLiteral([
				ts.createSpreadAssignment(ts.createLogicalOr(
					createMetadataCall('getOwnMetadata', ShorthandPropertiesMetadataKey, <ReadonlyArray<ts.Expression>>[
						ts.createIdentifier('target')
					]),
					ts.createObjectLiteral([])
				)),
				ts.createPropertyAssignment(propertyName, createTypeDescriptorLiteral(type))
			]),
			ts.createIdentifier('target')
		]
	)));
}