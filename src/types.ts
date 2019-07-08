import 'reflect-metadata';

export module Types {
	export enum TypeKind {
		Any = 1,
		String,
		Number,
		Boolean,
		StringLiteral,
		NumberLiteral,
		FalseLiteral,
		TrueLiteral,
		EnumLiteral,
		ESSymbol,
		Void,
		Undefined,
		Null,
		Never,

		Object,

		Tuple,
		Union,
		Reference,
		Interface,
		Class,

		Unknown = 999
	}

	export type Type = InterfaceType | TupleType |
		ObjectType | ClassType | ReferenceType | UnionType |
		StringLiteralType | NumberLiteralType | SimpleType;

	export interface SimpleType extends BaseType {
		kind: TypeKind.String | TypeKind.Number | TypeKind.Boolean | TypeKind.Null | TypeKind.Undefined | TypeKind.ESSymbol |
		TypeKind.Void | TypeKind.Never | TypeKind.Any | TypeKind.FalseLiteral | TypeKind.TrueLiteral | Types.TypeKind.Unknown
	}

	export interface BaseType {
		kind: TypeKind
		initializer?: any //todo
	}

	export interface InterfaceType extends BaseType {
		kind: TypeKind.Interface
		name: string
		arguments: Type[]
	}

	export interface TupleType extends BaseType {
		kind: TypeKind.Tuple
		elementTypes: Type[]
	}

	export interface StringLiteralType extends BaseType {
		kind: TypeKind.StringLiteral
		value: string
	}
	export interface NumberLiteralType extends BaseType {
		kind: TypeKind.NumberLiteral
		value: number
	}

	export interface ObjectType extends BaseType {
		kind: TypeKind.Object
	}

	export interface UnionType extends BaseType {
		kind: TypeKind.Union
		types: Type[]
	}
	export interface ReferenceType extends BaseType {
		kind: TypeKind.Reference
		type: any
		arguments: Type[]
	}

	export interface ClassType extends BaseType {
		kind: TypeKind.Class
		name: string
		props: (string | number)[]
		extends?: Types.Type
	}
}

export const REFLECTIVE_KEY = '__is_ts_runtime_reflective_decorator'

export function ReflectiveFactory<T>(fn: T) {
	return fn as T & { __is_ts_runtime_reflective_decorator: boolean }
}

export const Reflective = ReflectiveFactory(function (target: any) {

});

export const TypeMetadataKey = "ts-runtime-reflection:type";
export const SubclassMetadataKey = "ts-runtime-reflection:subtypes";
export const ShorthandPropertiesMetadataKey = "ts-runtime-reflection:shorthand-properties";

export function getSubclasses(target: Function): Function[] | undefined {
	return Reflect.getOwnMetadata(SubclassMetadataKey, target)
}

export function getAllLeafSubclasses(type: Function): Function[] {
	const subclasses = getSubclasses(type) || [];

	return subclasses.reduce(
		(result, subclass) => {
			const subclasses = getAllLeafSubclasses(subclass);

			return result.concat(subclasses.length > 0 ? subclasses : [subclass]);
		},
		<Function[]>[]
	);
}

export function getType(target: Function): Types.Type | undefined {
	return Reflect.getOwnMetadata(TypeMetadataKey, target)
}

export function getPropType(target: Function, propertyKey: string | symbol | number): Types.Type | undefined {
	return Reflect.getOwnMetadata(TypeMetadataKey, target.prototype, propertyKey as any) || (
		(Reflect.getOwnMetadata(ShorthandPropertiesMetadataKey, target) || {})[propertyKey]
	);
}