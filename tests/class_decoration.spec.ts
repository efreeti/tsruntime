import {
	 Reflective,
	 Types,
	 getType,
	 getPropType,
	 getSubclasses,
	 getAllLeafSubclasses
} from '../src';

const TypeKind = Types.TypeKind;


@Reflective
class TestClass extends Array<string> {
	 'str': string
	 'str-str': string
	 42: string
	 get computed() {
		  return 'string'
	 }
	 [Symbol.toPrimitive](){
		  return 23
	 }
	 method() {
		  return 'asd'
	 }
	 constructor(
		  public publicShorthandProp: string,
		  private privateShorthandProp: number,
		  protected protectedShorthandProp: boolean,
		  readonly readonlyShorthandProp: Date
	 ) {
		super();
	 }
}

@Reflective
class ParentClass {
	public parentProperty: string;

	constructor(public parentShorthandProp: string) {
	}
}

@Reflective
class Subclass1 extends ParentClass {
}

@Reflective
class Subclass2 extends ParentClass {}

class Subclass3 extends ParentClass {}

@Reflective
class SubSubclass1 extends Subclass1 {}

@Reflective
class SubSubclass2 extends Subclass1 {}

describe('Class decoration', () => {
	it('should decorate properties', () => {
		const ptype = getType(TestClass) as Types.ClassType;
		expect(ptype.kind).toEqual(TypeKind.Class);
		expect(ptype.name).toEqual('TestClass');
		expect(ptype.extends).toEqual({kind: TypeKind.Reference, type: Array, arguments: [{kind: TypeKind.String} as any]});

		expect(ptype.props).toEqual([
			 'str', 'str-str', 42, 'publicShorthandProp', 'privateShorthandProp', 'protectedShorthandProp', 'readonlyShorthandProp'
		]);

		expect(getPropType(TestClass, 'str')).toEqual({kind: TypeKind.String});
		expect(getPropType(TestClass, 'str-str')).toEqual({kind: TypeKind.String});
		expect(getPropType(TestClass, 42)).toEqual({kind: TypeKind.String});
		expect(getPropType(TestClass, 'publicShorthandProp')).toEqual({kind: TypeKind.String});
		expect(getPropType(TestClass, 'privateShorthandProp')).toEqual({kind: TypeKind.Number});
		expect(getPropType(TestClass, 'protectedShorthandProp')).toEqual({kind: TypeKind.Boolean});
		expect(getPropType(TestClass, 'readonlyShorthandProp')).toEqual({kind: TypeKind.Reference, type: Date, arguments: []});
	});

	it('should not inherit properties', () => {
		const ptype = getType(Subclass1) as Types.ClassType;

		expect(ptype.props.length).toEqual(0);
	});

	it('should not inherit properties if not reflective', () => {
		expect(getType(Subclass3)).toBeUndefined();
	});

	it('should not inherit property type if not reflective', () => {
		expect(getPropType(Subclass3, "parentProperty")).toBeUndefined();
	});

	it('should not inherit shorthand property type if not reflective', () => {
		expect(getPropType(Subclass3, "parentShorthandProp")).toBeUndefined();
	});
});

describe('Sub classes registration', () => {
	it('should register all subclasses', () => {
		const subclasses = getSubclasses(ParentClass)!;
		expect(subclasses.length).toEqual(2);
		expect(subclasses[0]).toEqual(Subclass1);
		expect(subclasses[1]).toEqual(Subclass2);
	});

	it('should not inherit subclasses decorator', () => {
		const subclasses = getSubclasses(Subclass2)!;
		expect(subclasses).toBeUndefined();
	});

	it('should not combine subclasses decorator with parent', () => {
		const subclasses = getSubclasses(Subclass1)!;
		expect(subclasses.length).toEqual(2);
		expect(subclasses[0]).toEqual(SubSubclass1);
		expect(subclasses[1]).toEqual(SubSubclass2);
	});

	it('should retrieve all leaf subclasses', () => {
		const subclasses = getAllLeafSubclasses(ParentClass)!;
		expect(subclasses.length).toEqual(3);
		expect(subclasses[0]).toEqual(SubSubclass1);
		expect(subclasses[1]).toEqual(SubSubclass2);
		expect(subclasses[2]).toEqual(Subclass2);
	});
});

