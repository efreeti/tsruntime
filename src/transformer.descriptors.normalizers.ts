import * as descriptors from './transformer.descriptors.types';
import { Types } from './types';

function normalizeBooleans(types: descriptors.Type[]): descriptors.Type[] {
	let hasFalse = false;
	let hasTrue = false;
	let hasBoolean = false;

	for (const type of types) {
		switch (type.kind) {
			case Types.TypeKind.FalseLiteral:
				hasFalse = true;
				break;
			case Types.TypeKind.TrueLiteral:
				hasTrue = true;
				break;
			case Types.TypeKind.Boolean:
				hasBoolean = true;
				break;
		}
	}

	if (hasBoolean || (hasTrue && hasFalse)) {
		return [{ kind: Types.TypeKind.Boolean }];
	} else {
		return types;
	}
}

export function normalizeUnion(types: descriptors.Type[]) {
	const booleans: descriptors.Type[] = [];
	const okTypes: descriptors.Type[] = [];

	types.forEach(type => {
		switch (type.kind) {
			case Types.TypeKind.FalseLiteral:
			case Types.TypeKind.TrueLiteral:
			case Types.TypeKind.Boolean:
				booleans.push(type);
				break;
			default:
				okTypes.push(type);
				break;
		}
	});

	return [...okTypes, ...normalizeBooleans(booleans)];
}