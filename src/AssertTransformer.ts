import {ObjectTypeDefinitionNode, DirectiveNode, InterfaceTypeDefinitionNode, FieldDefinitionNode, Kind} from 'graphql'
import {
  Transformer,
  TransformerContext,
  InvalidDirectiveError,
  gql,
  getDirectiveArguments,
} from 'graphql-transformer-core'
import {ResolverResourceIDs} from 'graphql-transformer-common'
import {printBlock, iff, not, raw, parens, Expression, and, ref} from 'graphql-mapping-template'

export const normalizeCondition = (s: string, val: string) => {
  return s.replace(/\B\.\B/g, val).replace(/(?<=^|[^)\]}]\B)\./g, `${val}.`)
}

export class AssertTransformer extends Transformer {
  constructor() {
    super(
      'AssertTransformer',
      gql`
        directive @assert(condition: String!, message: String, type: String) on FIELD_DEFINITION
      `
    )
  }

  public field = (
    parent: ObjectTypeDefinitionNode | InterfaceTypeDefinitionNode,
    definition: FieldDefinitionNode,
    directive: DirectiveNode,
    ctx: TransformerContext
  ) => {
    if (parent.kind === Kind.INTERFACE_TYPE_DEFINITION) {
      throw new InvalidDirectiveError(
        `The @assert directive cannot be placed on an interface's field. See ${parent.name.value}${definition.name.value}`
      )
    }

    // Validation - @model required
    this.validateParentModelDirective(parent!)

    const {condition, message, type} = getDirectiveArguments(directive)

    // Generate the VTL code block
    const typeName = parent.name.value
    const fieldName = definition.name.value

    const validationExpression = this.generateValidationExpression(fieldName, condition, message, type)

    const vtlCode = printBlock(`Assert validation for "${fieldName}" (${condition})`)(validationExpression)

    // Update create and update mutations
    const createResolverResourceId = ResolverResourceIDs.DynamoDBCreateResolverResourceID(typeName)
    this.updateResolver(ctx, createResolverResourceId, vtlCode)

    const updateResolverResourceId = ResolverResourceIDs.DynamoDBUpdateResolverResourceID(typeName)
    this.updateResolver(ctx, updateResolverResourceId, vtlCode)
  }

  private validateParentModelDirective = (type: ObjectTypeDefinitionNode) => {
    const directive = type!.directives!.find((d) => d.name.value === 'model')

    if (!directive) {
      throw new InvalidDirectiveError(`@assert directive can only be used on types with @model directive.`)
    }
  }

  private quote = (s: string) => {
    return `'${s.replace(/'/g, "''")}'`
  }

  private generateValidationExpression = (
    fieldName: string,
    condition: string,
    message?: string,
    type?: string
  ): Expression => {
    const name = this.quote(fieldName)
    const cond = this.quote(condition)
    const val = `$ctx.args.input.${fieldName}`
    const cls = `${val}.getClass()`
    const cond1 = normalizeCondition(condition, val)
    const msg = this.quote(message || 'Input assertion error')
    const typ = this.quote(type || 'AssertionError')
    return iff(
      and([not(raw(`$util.isNull(${val})`)), not(parens(raw(cond1)))]),
      ref(`util.error(
                    ${msg},
                    ${typ},
                    null,
                    {
                        "type": "assertion",
                        "condition": ${cond},
                        "fieldName": ${name},
                        "fieldValue": ${val},
                        "fieldClass": ${cls}
                    })`)
    )
  }

  private updateResolver = (ctx: TransformerContext, resolverResourceId: string, code: string) => {
    const resolver = ctx.getResource(resolverResourceId)

    if (resolver) {
      const templateParts = [code, resolver!.Properties!.RequestMappingTemplate]
      resolver!.Properties!.RequestMappingTemplate = templateParts.join('\n\n')
      ctx.setResource(resolverResourceId, resolver)
    }
  }
}
