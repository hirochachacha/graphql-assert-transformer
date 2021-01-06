import {GraphQLTransform} from 'graphql-transformer-core'
import {AssertTransformer, normalizeCondition} from '../AssertTransformer'
import {DynamoDBModelTransformer} from 'graphql-dynamodb-transformer'

test('@assert fails without @model.', () => {
  const validSchema = `
    type Post {
        id: ID!
        title: String! @assert(condition: ".length() == 4")
        version: String!
    }
    `
  try {
    const transformer = new GraphQLTransform({
      transformers: [new DynamoDBModelTransformer(), new AssertTransformer()],
    })
    transformer.transform(validSchema)
  } catch (e) {
    expect(e.name).toEqual('InvalidDirectiveError')
  }
})

test('normalizeCondition', () => {
  expect(normalizeCondition('.length() > 3 && .matches("[a-zA-Z0-9]+")', 'self')).toEqual(
    'self.length() > 3 && self.matches("[a-zA-Z0-9]+")'
  )
  expect(normalizeCondition('.length() > 10', 'self')).toEqual('self.length() > 10')
  expect(normalizeCondition('. % 2 == 0', 'self')).toEqual('self % 2 == 0')
})
