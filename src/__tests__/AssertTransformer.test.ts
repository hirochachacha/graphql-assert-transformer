import {GraphQLTransform} from 'graphql-transformer-core'
import {AssertTransformer} from '../AssertTransformer'
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
