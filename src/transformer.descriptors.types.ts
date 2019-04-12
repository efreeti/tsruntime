import * as ts from 'typescript';
import { Types } from './types';

export type Type = (
	ClassType |
	InterfaceType |
	TupleType |
	ReferenceType |
	UnionType |
	Types.StringLiteralType |
	Types.NumberLiteralType |
	Types.ObjectType |
	Types.SimpleType
)

export interface InterfaceType extends Types.BaseType {
	kind: Types.TypeKind.Interface
	name: string
	arguments: ReadonlyArray<Type>
}

export interface TupleType extends Types.BaseType {
	kind: Types.TypeKind.Tuple
	elementTypes: ReadonlyArray<Type>
}

export interface UnionType extends Types.BaseType {
	kind: Types.TypeKind.Union
	types: ReadonlyArray<Type>
}

export interface ReferenceType extends Types.BaseType {
	kind: Types.TypeKind.Reference
	type: ts.Identifier
	arguments: ReadonlyArray<Type>
}

export interface ClassType extends Types.BaseType {
	kind: Types.TypeKind.Class
	name: string
	props: ReadonlyArray<ts.PropertyName>
	extends?: Type
}